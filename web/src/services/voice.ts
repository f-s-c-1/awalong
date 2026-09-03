import type { LocalAudioTrack, RemoteParticipant, RemoteTrack, Room } from 'livekit-client'

export type VoiceState = 'idle' | 'connecting' | 'connected' | 'unsupported' | 'error'

export interface VoiceEvents {
  onState?: (state: VoiceState, message?: string) => void
  /** 正在说话的参与者 identity（即 uid）列表 */
  onSpeakers?: (uids: string[]) => void
  onMicChanged?: (enabled: boolean) => void
  /** 远端音频是否可播放（iOS 需用户手势解锁） */
  onPlayback?: (ok: boolean) => void
}

type LiveKit = typeof import('livekit-client')

let preloaded: Promise<LiveKit> | null = null

function loadSdk(): Promise<LiveKit> {
  if (!preloaded) {
    preloaded = import('livekit-client').catch((err) => {
      preloaded = null
      throw err
    })
  }
  return preloaded
}

/** 进房后空闲时预取语音 SDK（约 150KB gzip），避免点击开启语音时才下载 */
export function preloadVoice(): void {
  if (preloaded || !isVoiceSupported()) return
  const run = (): void => {
    void loadSdk().catch(() => undefined)
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

/** 把浏览器的采集错误翻译成可操作的中文提示 */
export function describeMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const inWeChat = /MicroMessenger/i.test(navigator.userAgent)
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return inWeChat
        ? '麦克风权限被拒绝：请到系统设置 → 微信 → 允许使用麦克风，或点右上角用浏览器打开本页'
        : '麦克风权限被拒绝：请在浏览器地址栏的权限设置里允许麦克风后重试'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '没有检测到麦克风设备'
    case 'NotReadableError':
    case 'AbortError':
      return '麦克风被其他应用占用，请关闭后重试'
    default:
      return err instanceof Error && err.message ? err.message : '麦克风不可用'
  }
}

/**
 * LiveKit 语音客户端封装：纯音频房间。
 * - 麦克风必须在用户点击的同一时刻申请（acquireMic），iOS / 微信在网络往返后会视为手势过期而拒绝
 * - livekit-client 体积较大，按需动态加载（进房后预取）
 * - 权限（能否发布/订阅）由服务端令牌与阶段策略控制，这里只负责连接与播放
 */
export class VoiceClient {
  private room: Room | null = null
  private micTrack: LocalAudioTrack | null = null
  private published = false
  private container: HTMLElement | null = null
  private state: VoiceState = 'idle'
  private unlockBound = false

  constructor(private readonly events: VoiceEvents = {}) {}

  get connected(): boolean {
    return this.state === 'connected'
  }

  get micEnabled(): boolean {
    return this.published && !!this.micTrack && !this.micTrack.isMuted
  }

  /** 第一步：在点击回调里立刻申请麦克风；失败会抛出带中文说明的 Error */
  async acquireMic(): Promise<void> {
    if (!isVoiceSupported()) {
      this.setState('unsupported')
      throw new Error('当前浏览器不支持实时语音')
    }
    if (this.micTrack) return
    const lk = await loadSdk()
    try {
      this.micTrack = await lk.createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true })
    } catch (err) {
      throw new Error(describeMediaError(err))
    }
  }

  /** 第二步：连接语音房 */
  async connect(url: string, token: string): Promise<void> {
    if (!isVoiceSupported()) {
      this.setState('unsupported')
      return
    }
    if (this.room) await this.disconnect(false)
    this.setState('connecting')
    let lk: LiveKit
    try {
      lk = await loadSdk()
    } catch {
      this.setState('error', '语音模块加载失败，请检查网络后重试')
      return
    }
    const room = new lk.Room({ adaptiveStream: false, dynacast: false })
    this.room = room
    room
      .on(lk.RoomEvent.TrackSubscribed, (track: RemoteTrack) => this.attach(track, lk.Track.Kind.Audio))
      .on(lk.RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => track.detach().forEach((el) => el.remove()))
      .on(lk.RoomEvent.ActiveSpeakersChanged, (speakers) => this.events.onSpeakers?.(speakers.map((p) => p.identity)))
      .on(lk.RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => this.detachParticipant(p))
      .on(lk.RoomEvent.Disconnected, () => {
        this.published = false
        this.setState('idle')
      })
      .on(lk.RoomEvent.Reconnecting, () => this.setState('connecting'))
      .on(lk.RoomEvent.Reconnected, () => this.setState('connected'))
      .on(lk.RoomEvent.AudioPlaybackStatusChanged, () => {
        const ok = room.canPlaybackAudio
        this.events.onPlayback?.(ok)
        if (!ok) this.bindUnlock()
      })
    try {
      await room.connect(url, token)
      this.setState('connected')
      await room.startAudio().catch(() => this.bindUnlock())
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err))
      this.room = null
    }
  }

  /** 发布 / 静音麦克风；发布被服务端策略拒绝时抛错，由调用方提示 */
  async enableMic(enabled = true): Promise<void> {
    const room = this.room
    const track = this.micTrack
    if (!room || !track) return
    try {
      if (enabled) {
        if (!this.published) {
          await room.localParticipant.publishTrack(track, { source: (await loadSdk()).Track.Source.Microphone })
          this.published = true
        }
        if (track.isMuted) await track.unmute()
      } else if (!track.isMuted) {
        await track.mute()
      }
      this.events.onMicChanged?.(this.micEnabled)
    } catch (err) {
      this.events.onState?.(this.state, err instanceof Error ? err.message : '麦克风不可用')
    }
  }

  /** 页面回前台 / 用户再次点击时恢复音频播放 */
  async resumeAudio(): Promise<void> {
    await this.room?.startAudio().catch(() => undefined)
  }

  async disconnect(releaseMic = true): Promise<void> {
    const room = this.room
    this.room = null
    this.published = false
    this.container?.replaceChildren()
    await room?.disconnect()
    if (releaseMic && this.micTrack) {
      this.micTrack.stop()
      this.micTrack = null
    }
    this.setState('idle')
  }

  private bindUnlock(): void {
    if (this.unlockBound) return
    this.unlockBound = true
    const handler = (): void => {
      this.unlockBound = false
      document.removeEventListener('pointerdown', handler, true)
      void this.resumeAudio()
    }
    document.addEventListener('pointerdown', handler, true)
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
