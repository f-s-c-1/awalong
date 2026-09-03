// WebSocket 客户端（与 shared/src/protocol.ts 一致，消息为扁平对象）：
// 心跳 15s、指数退避重连（1s→2s→4s→…≤15s）、按 version 丢弃过期增量、回前台主动发 sync.request
import { readonly, ref } from 'vue'
import type { ClientMsg, ServerMsg } from '@awalong/shared'

export type WsStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'
export type ServerMsgType = ServerMsg['type']
export type ServerMsgOf<T extends ServerMsgType> = Extract<ServerMsg, { type: T }>

type AnyHandler = (msg: ServerMsg) => void

const HEARTBEAT_MS = 15_000
/** 超过此时长没有收到任何消息视为假死，主动断开触发重连 */
const STALE_MS = 45_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 15_000

function resolveUrl(token: string): string {
  const base =
    import.meta.env.VITE_WS_URL ||
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}token=${encodeURIComponent(token)}`
}

/** 取消息携带的对局版本号：全量快照取 state.version，增量消息取顶层 version */
function versionOf(msg: ServerMsg): number | undefined {
  if (msg.type === 'game.sync') return msg.state.version
  return 'version' in msg ? msg.version : undefined
}

class WsClient {
  private socket: WebSocket | null = null
  private token = ''
  private readonly handlers = new Map<string, Set<AnyHandler>>()
  private readonly openListeners = new Set<() => void>()
  private version = 0
  private retries = 0
  private everOpened = false
  private manualClose = false
  private heartbeatTimer: number | undefined
  private staleTimer: number | undefined
  private reconnectTimer: number | undefined
  private readonly statusRef = ref<WsStatus>('idle')

  /** 连接状态（只读响应式，供 UI 显示重连条） */
  readonly status = readonly(this.statusRef)

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => this.onVisibility())
    }
  }

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  /** 建立连接；已连接或连接中则忽略 */
  connect(token: string): void {
    this.token = token
    this.manualClose = false
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }
    this.clearReconnect()
    this.open()
  }

  /** 主动断开，不再自动重连 */
  disconnect(): void {
    this.manualClose = true
    this.clearReconnect()
    this.stopTimers()
    const socket = this.socket
    this.socket = null
    socket?.close(1000, 'client-close')
    this.retries = 0
    this.everOpened = false
    this.statusRef.value = 'closed'
  }

  /** 切换房间 / 回到大厅时重置版本号，避免新一局的低版本消息被误丢弃 */
  resetVersion(): void {
    this.version = 0
  }

  /** 发送意图；未连接时返回 false */
  send(msg: ClientMsg): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    this.socket.send(JSON.stringify(msg))
    return true
  }

  /** 订阅某类服务端消息，返回取消函数 */
  on<T extends ServerMsgType>(type: T, handler: (msg: ServerMsgOf<T>) => void): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    const wrapped = handler as unknown as AnyHandler
    set.add(wrapped)
    return () => {
      set?.delete(wrapped)
    }
  }

  /** 每次连接建立（含重连）后回调，返回取消函数 */
  onOpen(listener: () => void): () => void {
    this.openListeners.add(listener)
    return () => {
      this.openListeners.delete(listener)
    }
  }

  private open(): void {
    this.statusRef.value = this.everOpened ? 'reconnecting' : 'connecting'
    let socket: WebSocket
    try {
      socket = new WebSocket(resolveUrl(this.token))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.socket = socket

    socket.onopen = () => {
      if (this.socket !== socket) return
      const isReconnect = this.everOpened
      this.everOpened = true
      this.retries = 0
      this.statusRef.value = 'open'
      this.startTimers()
      // 服务端在连接建立后会自动补发 room.sync / game.sync / game.secret；重连时再拉齐一次增量
      if (isReconnect) this.requestSync()
      this.openListeners.forEach((fn) => fn())
    }

    socket.onmessage = (ev: MessageEvent<unknown>) => {
      if (this.socket !== socket) return
      this.handleMessage(ev.data)
    }

    socket.onclose = () => {
      if (this.socket !== socket) return
      this.stopTimers()
      this.socket = null
      if (this.manualClose) {
        this.statusRef.value = 'closed'
        return
      }
      this.scheduleReconnect()
    }

    // onerror 之后浏览器必定触发 onclose，统一在 onclose 处理
    socket.onerror = () => undefined
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let msg: ServerMsg
    try {
      msg = JSON.parse(raw) as ServerMsg
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string') return
    this.touchStale()

    // 全量快照始终采纳并刷新基线（新一局版本号会重新开始）；增量消息版本低于基线则丢弃
    const version = versionOf(msg)
    if (version !== undefined) {
      if (msg.type === 'game.sync') {
        this.version = version
      } else if (version < this.version) {
        return
      } else {
        this.version = version
      }
    }

    const set = this.handlers.get(msg.type)
    if (!set) return
    set.forEach((handler) => {
      try {
        handler(msg)
      } catch (err) {
        console.error(`[ws] 处理 ${msg.type} 消息出错`, err)
      }
    })
  }

  private requestSync(): void {
    this.send({ type: 'sync.request', version: this.version })
  }

  private scheduleReconnect(): void {
    this.clearReconnect()
    const delay = Math.min(RETRY_BASE_MS * 2 ** this.retries, RETRY_MAX_MS)
    this.retries += 1
    this.statusRef.value = 'reconnecting'
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined
      this.open()
    }, delay)
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private startTimers(): void {
    this.stopTimers()
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'heartbeat', t: Date.now() })
    }, HEARTBEAT_MS)
    this.touchStale()
  }

  private touchStale(): void {
    if (this.staleTimer !== undefined) window.clearTimeout(this.staleTimer)
    this.staleTimer = window.setTimeout(() => {
      // 长时间无任何消息：认定连接假死，关闭后走重连流程
      this.socket?.close(4000, 'stale')
    }, STALE_MS)
  }

  private stopTimers(): void {
    if (this.heartbeatTimer !== undefined) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
    if (this.staleTimer !== undefined) {
      window.clearTimeout(this.staleTimer)
      this.staleTimer = undefined
    }
  }

  private onVisibility(): void {
    if (document.visibilityState !== 'visible' || this.manualClose || !this.token) return
    if (this.connected) {
      // 后台期间浏览器可能挂起 WS 但未断开：主动拉齐一次
      this.requestSync()
      return
    }
    // 处于退避等待中：立即重连，不等计时器
    this.clearReconnect()
    if (!this.socket) this.open()
  }
}

/** 全局单例 */
export const ws = new WsClient()
