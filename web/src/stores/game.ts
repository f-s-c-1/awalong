// 对局状态：game.sync（视角过滤后的 ClientGameState）+ game.secret（本人身份与视野）
// + game.over（MatchSummary）+ 服务端时钟偏移（heartbeat.ack / phase.change / game.sync 校准）
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ClientGameState,
  MatchSummary,
  Phase,
  SecretInfo,
  VoicePolicy,
} from '@awalong/shared'
import { ws } from '@/services/ws'

export interface PausedInfo {
  seat: number
  nickname: string
  deadline: number
  /** 是否由房主决定作废 / 继续 */
  ownerDecides: boolean
}

export const useGameStore = defineStore('game', () => {
  const state = ref<ClientGameState | null>(null)
  const secret = ref<SecretInfo | null>(null)
  const summary = ref<MatchSummary | null>(null)
  const voicePolicy = ref<VoicePolicy | null>(null)
  const paused = ref<PausedInfo | null>(null)
  /** 服务端时间 - 本机时间（毫秒），倒计时统一按服务端时钟 */
  const serverOffset = ref(0)

  const phase = computed<Phase | null>(() => state.value?.phase ?? null)
  const deadline = computed(() => state.value?.deadline ?? null)
  const players = computed(() => state.value?.players ?? [])
  const playerCount = computed(() => state.value?.playerCount ?? players.value.length)
  const questSizes = computed<readonly number[]>(() => state.value?.questSizes ?? [])
  /** 对局进行中（不含大厅与已结束，避免结算后回大厅被再次跳回桌面） */
  const inGame = computed(
    () => phase.value !== null && phase.value !== 'LOBBY' && phase.value !== 'GAME_OVER',
  )
  const isOver = computed(() => phase.value === 'GAME_OVER' || summary.value !== null)

  function seatOf(uid: string): number | undefined {
    if (!uid) return undefined
    return players.value.find((p) => p.uid === uid)?.seat
  }

  /** 当前服务端时间估计值 */
  function serverNow(): number {
    return Date.now() + serverOffset.value
  }

  function syncClock(serverTime: number | undefined): void {
    if (typeof serverTime === 'number' && Number.isFinite(serverTime) && serverTime > 0) {
      serverOffset.value = serverTime - Date.now()
    }
  }

  function applySync(next: ClientGameState): void {
    state.value = next
    syncClock(next.serverTime)
    // 新一局开始（再来一局）时清掉旧结算与暂停提示
    if (next.phase !== 'GAME_OVER') summary.value = null
    if (next.phase === 'LOBBY') paused.value = null
  }

  function reset(): void {
    state.value = null
    secret.value = null
    summary.value = null
    voicePolicy.value = null
    paused.value = null
  }

  const offs = [
    ws.on('game.sync', (msg) => applySync(msg.state)),
    ws.on('game.secret', (msg) => {
      secret.value = msg.secret
    }),
    ws.on('phase.change', (msg) => {
      syncClock(msg.serverTime)
      if (!state.value) return
      state.value.phase = msg.phase
      state.value.deadline = msg.deadline
      state.value.version = msg.version
    }),
    ws.on('team.reveal', (msg) => {
      if (!state.value) return
      state.value.teamVotes = msg.votes
      state.value.teamVotedSeats = []
      state.value.version = msg.version
    }),
    ws.on('quest.reveal', (msg) => {
      if (!state.value) return
      state.value.questReveal = msg.cards
      state.value.version = msg.version
    }),
    ws.on('game.over', (msg) => {
      summary.value = msg.summary
      if (state.value) {
        state.value.phase = 'GAME_OVER'
        state.value.winner = msg.summary.winner
        state.value.winReason = msg.summary.winReason
        state.value.assassinTarget = msg.summary.assassinTarget
        state.value.revealedRoles = msg.summary.roles
        state.value.version = msg.version
      }
      paused.value = null
    }),
    ws.on('heartbeat.ack', (msg) => {
      // 往返一半近似单程延迟：offset = serverTime - (发出时刻 + 收到时刻) / 2
      const now = Date.now()
      if (Number.isFinite(msg.t) && Number.isFinite(msg.serverTime)) {
        serverOffset.value = msg.serverTime - (msg.t + now) / 2
      }
    }),
    ws.on('voice.policy', (msg) => {
      voicePolicy.value = msg.policy
    }),
    ws.on('speaker.turn', (msg) => {
      if (state.value) state.value.speaker = { seat: msg.seat, deadline: msg.deadline }
    }),
    ws.on('game.paused', (msg) => {
      paused.value = {
        seat: msg.seat,
        nickname: msg.nickname,
        deadline: msg.deadline,
        ownerDecides: msg.ownerDecides,
      }
    }),
    ws.on('game.resumed', () => {
      paused.value = null
    }),
  ]
  if (import.meta.hot) import.meta.hot.dispose(() => offs.forEach((off) => off()))

  return {
    state,
    secret,
    summary,
    voicePolicy,
    paused,
    serverOffset,
    phase,
    deadline,
    players,
    playerCount,
    questSizes,
    inGame,
    isOver,
    seatOf,
    serverNow,
    applySync,
    reset,
  }
})
