import type { RemoteParticipant, RemoteTrack, Room } from 'livekit-client'

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'error'

export interface VoiceEvents {
  onState?: (state: VoiceState, message?: string) => void
  /** 正在说话的参与者 identity（即 uid）列表 */
  onSpeakers?: (uids: string[]) => void
  onMicChanged?: (enabled: boolean) => void
}

let preloaded: Promise<unknown> | null = null

/** 进房后空闲时预取语音 SDK（约 150KB gzip），避免点击开启语音时才下载 */
export function preloadVoice(): void {
  if (preloaded || !isVoiceSupported()) return
  const run = (): void => {
    preloaded = import('livekit-client').catch(() => {
      preloaded = null
    })
  }
  const idle = (window as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (idle) idle(run, { timeout: 3000 })
  else window.setTimeout(run, 500)
}

/** 浏览器是否具备 WebRTC 与麦克风采集能力 */
export function isVoiceSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  )
}

/**
 * LiveKit 语音客户端封装：纯音频房间。
 * livekit-client 体积较大（约 500KB），仅在用户点击开启语音时动态加载。
 * 必须在用户手势回调中调用 connect()，否则 iOS 微信不会授予麦克风与自动播放。
 * 权限（能否发布/订阅）由服务端令牌与阶段策略控制，这里只负责连接与播放。
 */
export class VoiceClient {
  private room: Room | null = null
  private container: HTMLElement | null = null
  private state: VoiceState = 'idle'

  constructor(private readonly events: VoiceEvents = {}) {}

  get connected(): boolean {
    return this.state === 'connected'
  }

  get micEnabled(): boolean {
    return this.room?.localParticipant.isMicrophoneEnabled ?? false
  }

  async connect(url: string, token: string): Promise<void> {
    if (!isVoiceSupported()) {
      this.setState('unsupported')
      return
    }
    if (this.room) await this.disconnect()
    this.setState('connecting')
    let lk: typeof import('livekit-client')
    try {
      lk = await import('livekit-client')
    } catch {
      this.setState('error', '语音模块加载失败，请检查网络后重试')
      return
    }
    const room = new lk.Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    })
    this.room = room
    room
      .on(lk.RoomEvent.TrackSubscribed, (track: RemoteTrack) => this.attach(track, lk.Track.Kind.Audio))
      .on(lk.RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()))
      .on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => this.events.onSpeakers?.(speakers.map((p) => p.identity)))
      .on(lk.RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.detachParticipant(p))
      .on(lk.RoomEvent.Disconnected, () => this.setState('idle'))
      .on(lk.RoomEvent.Reconnecting, () => this.setState('connecting'))
      .on(lk.RoomEvent.Reconnected, () => this.setState('connected'))
      .on(lk.RoomEvent.LocalTrackPublished, () => this.events.onMicChanged?.(this.micEnabled))
      .on(lk.RoomEvent.LocalTrackUnpublished, () => this.events.onMicChanged?.(this.micEnabled))
    try {
      await room.connect(url, token)
      await room.startAudio()
      this.setState('connected')
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err))
      this.room = null
    }
  }

  /** 开启麦克风；被服务端策略禁止发布时会抛错，由调用方提示 */
  async enableMic(enabled = true): Promise<void> {
    if (!this.room) return
    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled)
      this.events.onMicChanged?.(this.micEnabled)
    } catch (err) {
      this.events.onState?.(this.state, err instanceof Error ? err.message : '麦克风不可用')
    }
  }

  /** 页面回前台后恢复音频播放（浏览器可能挂起 AudioContext） */
  async resumeAudio(): Promise<void> {
    await this.room?.startAudio()
  }

  async disconnect(): Promise<void> {
    const room = this.room
    this.room = null
    this.container?.replaceChildren()
    await room?.disconnect()
    this.setState('idle')
  }

  private attach(track: RemoteTrack, audioKind: string): void {
    if (track.kind !== audioKind) return
    const el = track.attach()
    el.setAttribute('data-voice', '1')
    this.getContainer().appendChild(el)
  }

  private detachParticipant(p: RemoteParticipant): void {
    for (const pub of p.trackPublications.values()) pub.track?.detach().forEach((el) => el.remove())
  }

  private getContainer(): HTMLElement {
    if (this.container) return this.container
    const el = document.createElement('div')
    el.hidden = true
    el.id = 'voice-audio-pool'
    document.body.appendChild(el)
    this.container = el
    return el
  }

  private setState(state: VoiceState, message?: string): void {
    this.state = state
    this.events.onState?.(state, message)
  }
}
