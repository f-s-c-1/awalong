// 房间大厅状态：由 room.sync 全量同步驱动（RoomSync 见 shared/src/protocol.ts）
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RoomSettings, RoomSync, SeatInfo } from '@awalong/shared'
import { ws } from '@/services/ws'
import { session } from '@/utils/storage'

const CODE_KEY = 'avalon.room'

export type RoomStatus = RoomSync['status']

export interface RoomError {
  code: string
  message: string
  at: number
}

export const useRoomStore = defineStore('room', () => {
  // 房间码放 sessionStorage：页面刷新后仍能凭 JWT 回到对局
  const code = ref(session.read<string>(CODE_KEY, ''))
  const ownerUid = ref('')
  const status = ref<RoomStatus>('LOBBY')
  const settings = ref<RoomSettings | null>(null)
  const seats = ref<SeatInfo[]>([])
  const spectatorCount = ref(0)
  /** 我的座位号；旁观者为 null */
  const mySeat = ref<number | null>(null)
  /** 是否已收到过至少一次 room.sync */
  const synced = ref(false)
  /** 房间被解散的原因（room.closed） */
  const closedReason = ref<string | null>(null)
  /** 最近一条服务端业务错误（error 消息），供页面提示 */
  const lastError = ref<RoomError | null>(null)

  const playerCount = computed(() => settings.value?.playerCount ?? seats.value.length)
  const seatedCount = computed(() => seats.value.length)
  const isFull = computed(() => playerCount.value > 0 && seatedCount.value >= playerCount.value)
  const allReady = computed(() =>
    seats.value.every((s) => s.ready || s.uid === ownerUid.value),
  )
  /** 房主开局条件：坐满 + 除房主外全员准备 + 仍在大厅 */
  const canStart = computed(
    () => synced.value && isFull.value && allReady.value && status.value === 'LOBBY',
  )

  function seatOf(uid: string): number | undefined {
    if (!uid) return undefined
    return seats.value.find((s) => s.uid === uid)?.seat
  }

  function isOwner(uid: string): boolean {
    return !!uid && ownerUid.value === uid
  }

  function isReady(uid: string): boolean {
    return seats.value.find((s) => s.uid === uid)?.ready ?? false
  }

  function clearState(): void {
    ownerUid.value = ''
    status.value = 'LOBBY'
    settings.value = null
    seats.value = []
    spectatorCount.value = 0
    mySeat.value = null
    synced.value = false
    closedReason.value = null
    lastError.value = null
  }

  /** 进入 /r/:code 时由路由守卫调用；切换房间会清空旧状态 */
  function setCode(next: string): void {
    if (next === code.value) return
    clearState()
    code.value = next
    session.write(CODE_KEY, next)
    ws.resetVersion()
  }

  function applySync(room: RoomSync): void {
    if (room.code !== code.value) {
      code.value = room.code
      session.write(CODE_KEY, room.code)
    }
    ownerUid.value = room.ownerUid
    status.value = room.status
    settings.value = room.settings
    seats.value = [...room.seats].sort((a, b) => a.seat - b.seat)
    spectatorCount.value = room.spectatorCount
    mySeat.value = room.mySeat
    synced.value = true
    closedReason.value = null
    // 回到大厅意味着上一局结束，下一局版本号会重新计数
    if (room.status === 'LOBBY') ws.resetVersion()
  }

  /** 离开房间：清空一切并移除持久化的房间码 */
  function reset(): void {
    clearState()
    code.value = ''
    session.remove(CODE_KEY)
    ws.resetVersion()
  }

  const offs = [
    ws.on('room.sync', (msg) => applySync(msg.room)),
    ws.on('room.closed', (msg) => {
      closedReason.value = msg.reason || '房间已解散'
      status.value = 'CLOSED'
    }),
    ws.on('error', (msg) => {
      lastError.value = { code: msg.code, message: msg.message, at: Date.now() }
    }),
  ]
  if (import.meta.hot) import.meta.hot.dispose(() => offs.forEach((off) => off()))

  return {
    code,
    ownerUid,
    status,
    settings,
    seats,
    spectatorCount,
    mySeat,
    synced,
    closedReason,
    lastError,
    playerCount,
    seatedCount,
    isFull,
    allReady,
    canStart,
    seatOf,
    isOwner,
    isReady,
    setCode,
    applySync,
    reset,
  }
})
