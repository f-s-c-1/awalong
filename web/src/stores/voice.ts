// 语音状态：连接 LiveKit、麦克风开关、说话者指示；服务端阶段策略（voice.policy）只做界面同步，
// 真正的权限由服务端令牌与 LiveKit 强制，客户端改不了。
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, api } from '@/services/api'
import * as sfx from '@/services/sfx'
import { VoiceClient, isVoiceSupported, type VoiceState } from '@/services/voice'
import { useGameStore } from '@/stores/game'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'

export type VoiceAvailability = 'unknown' | 'ready' | 'unsupported' | 'unavailable'

export const useVoiceStore = defineStore('voice', () => {
  const game = useGameStore()
  const room = useRoomStore()
  const user = useUserStore()

  const availability = ref<VoiceAvailability>(isVoiceSupported() ? 'unknown' : 'unsupported')
  const state = ref<VoiceState>('idle')
  const message = ref('')
  const micEnabled = ref(false)
  /** 用户本人是否希望开麦（阶段静音解除后据此自动恢复） */
  const wantMic = ref(false)
  const speakingUids = ref<string[]>([])
  const roomCode = ref<string | null>(null)

  const client = new VoiceClient({
    onState: (s, msg) => {
      state.value = s
      if (msg) message.value = msg
      if (s === 'unsupported') availability.value = 'unsupported'
    },
    onSpeakers: (uids) => {
      speakingUids.value = uids
    },
    onMicChanged: (enabled) => {
      micEnabled.value = enabled
    },
    onPlayback: (ok) => {
      playbackBlocked.value = !ok
    },
  })

  const connected = computed(() => state.value === 'connected')
  /** 对局中取游戏态座位，大厅阶段取房间座位 */
  const mySeat = computed(() => game.secret?.seat ?? game.seatOf(user.uid) ?? room.mySeat ?? undefined)

  /** 当前阶段策略下本人能否发言 */
  const canPublish = computed(() => {
    const policy = game.voicePolicy
    if (!policy) return true
    if (policy.muteAll) return false
    if (policy.publishSeats === null) return true
    return mySeat.value !== undefined && policy.publishSeats.includes(mySeat.value)
  })

  /** 当前阶段策略下本人能否收听 */
  const canSubscribe = computed(() => {
    const policy = game.voicePolicy
    if (!policy || policy.subscribeSeats === null) return true
    return mySeat.value !== undefined && policy.subscribeSeats.includes(mySeat.value)
  })

  const speakingSeats = computed(() => {
    const seats: number[] = []
    for (const uid of speakingUids.value) {
      const seat = game.seatOf(uid) ?? room.seatOf(uid)
      if (seat !== undefined) seats.push(seat)
    }
    return seats
  })

  /** 连接过程中的阶段提示（连接中按钮旁显示） */
  const progress = ref('')

  /** 远端声音是否已解锁播放（iOS 需要一次点击） */
  const playbackBlocked = ref(false)

  /**
   * 在用户点击回调里调用。顺序很重要：先申请麦克风（iOS/微信要求紧随手势），
   * 再拿令牌、连房、发布音轨；点击即进入连接态，避免等待期间无反馈
   */
  async function join(code: string): Promise<void> {
    if (availability.value === 'unsupported' || state.value === 'connecting') return
    sfx.unlock()
    state.value = 'connecting'
    message.value = ''
    progress.value = '申请麦克风权限…'
    const startedAt = Date.now()
    try {
      await client.acquireMic()
      progress.value = '获取语音凭证…'
      const info = await api.voiceToken()
      roomCode.value = code
      progress.value = '连接语音服务器…'
      await client.connect(info.url, info.token)
      if (client.connected) {
        availability.value = 'ready'
        wantMic.value = true
        progress.value = '发布麦克风…'
        await client.enableMic(canPublish.value)
        progress.value = ''
        console.info(`[voice] 连接用时 ${Date.now() - startedAt}ms`)
      } else {
        // connect() 内部已把 state 置为 error / unsupported 并写入 message
        progress.value = ''
        availability.value = 'unavailable'
      }
    } catch (err) {
      progress.value = ''
      if (err instanceof ApiError && (err.status === 501 || err.code === 'VOICE_NOT_CONFIGURED')) {
        availability.value = 'unavailable'
        message.value = '本服务器尚未开启实时语音，可用快捷短语交流'
      } else {
        availability.value = 'unavailable'
        message.value = err instanceof Error ? err.message : '语音连接失败'
      }
      state.value = 'error'
    }
  }

  /** 连接失败后允许再试一次 */
  function retry(code: string): Promise<void> {
    availability.value = isVoiceSupported() ? 'unknown' : 'unsupported'
    state.value = 'idle'
    message.value = ''
    return join(code)
  }

  async function toggleMic(): Promise<void> {
    if (!connected.value) return
    wantMic.value = !micEnabled.value
    if (wantMic.value && !canPublish.value) {
      message.value = '当前阶段已静音'
      wantMic.value = false
      return
    }
    await client.enableMic(wantMic.value)
  }

  async function leave(): Promise<void> {
    wantMic.value = false
    speakingUids.value = []
    roomCode.value = null
    await client.disconnect()
  }

  // 阶段策略变化：被静音时本地先关麦（服务端同时会在 SFU 侧强制），恢复时按用户意愿重开
  watch(canPublish, (allowed) => {
    if (!connected.value) return
    if (!allowed && micEnabled.value) void client.enableMic(false)
    else if (allowed && wantMic.value && !micEnabled.value) void client.enableMic(true)
  })

  // 语音跟随房间：离开房间 / 房间解散时断开；大厅与对局之间保持连接
  watch(
    () => room.code,
    (code) => {
      if (!code && connected.value) void leave()
    },
  )
  watch(
    () => room.closedReason,
    (reason) => {
      if (reason && connected.value) void leave()
    },
  )

  // 回前台后恢复音频播放（浏览器可能挂起）
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && connected.value) void client.resumeAudio()
    })
  }

  return {
    availability,
    state,
    message,
    micEnabled,
    connected,
    canPublish,
    canSubscribe,
    speakingUids,
    speakingSeats,
    roomCode,
    progress,
    playbackBlocked,
    join,
    retry,
    toggleMic,
    leave,
  }
})
