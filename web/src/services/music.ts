/**
 * 大厅等待音乐：基于 HTMLAudioElement 的列表播放器，曲目来自 public/music/playlist.json（自托管 CC0 mp3）。
 * - 清单缺失（未下载 / 404）或全部曲目加载失败时，start / stop 退化为 sfx 的合成氛围垫，调用方不变
 * - iOS / 微信要求 play() 在手势处理器内直接调用：被拒绝时不报错，由 sfx.onGesture 在下一次手势里同步补启
 * - 与 sfx 静音开关联动；切后台暂停、回前台恢复；语音开麦时压低音量（setDucked）
 * 注意：iOS Safari 忽略媒体元素的 volume，该平台上音量恒为系统音量，压低与淡出不生效
 */
import { readonly, ref } from 'vue'
import * as sfx from '@/services/sfx'

export interface Track {
  file: string
  title: string
  artist: string
  license: string
  source: string
}

const PLAYLIST_URL = `${import.meta.env.BASE_URL}music/playlist.json`
const MUSIC_BASE = `${import.meta.env.BASE_URL}music/`
/** 常规音量 / 语音开麦时的压低音量 */
const VOLUME_NORMAL = 0.35
const VOLUME_DUCKED = 0.12
const FADE_OUT_MS = 600
const DUCK_MS = 400
const RAMP_STEP_MS = 40

const availableRef = ref(false)
const playingRef = ref(false)
const currentTitleRef = ref('')
const currentArtistRef = ref('')

/** 清单已加载且非空（MusicBar 据此决定是否渲染） */
export const available = readonly(availableRef)
/** 当前是否在出声 */
export const playing = readonly(playingRef)
export const currentTitle = readonly(currentTitleRef)
export const currentArtist = readonly(currentArtistRef)

let tracks: Track[] = []
let index = -1
let audio: HTMLAudioElement | null = null
let initPromise: Promise<boolean> | null = null
/** 调用方是否希望音乐在响（静音 / 未手势 / 后台时先记下，条件满足后补启） */
let wanted = false
let targetVolume = VOLUME_NORMAL
let rampTimer: number | undefined
/** 连续加载失败的曲目数：全部失败视为文件缺失，退化为合成氛围垫 */
let errorStreak = 0

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== 'object') return false
  const t = value as Record<string, unknown>
  return (
    typeof t.file === 'string' &&
    typeof t.title === 'string' &&
    typeof t.artist === 'string' &&
    typeof t.license === 'string' &&
    typeof t.source === 'string'
  )
}

/** 曲目文件的版本号（来自清单），拼进 URL 绕过 CDN 对旧响应的缓存 */
let playlistVersion = ''

/** 拉取曲目清单（规则页的「音乐来源」也用它）；404 / 网络错误 / 格式不对均抛错 */
export async function fetchPlaylist(): Promise<Track[]> {
  const res = await fetch(`${PLAYLIST_URL}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`playlist ${res.status}`)
  const data = (await res.json()) as { tracks?: unknown; version?: unknown }
  if (typeof data.version === 'string' || typeof data.version === 'number') playlistVersion = String(data.version)
  return Array.isArray(data.tracks) ? data.tracks.filter(isTrack) : []
}

/** 加载清单，只请求一次，并发调用共享同一个 Promise；解析为是否可用 */
export function init(): Promise<boolean> {
  if (initPromise) return initPromise
  initPromise = fetchPlaylist()
    .then((list) => {
      if (!list.length || typeof Audio === 'undefined') return false
      tracks = list
      setupAudio()
      availableRef.value = true
      return true
    })
    .catch(() => false)
  return initPromise
}

function setupAudio(): void {
  const el = new Audio()
  el.preload = 'none'
  el.volume = targetVolume
  el.addEventListener('play', () => {
    playingRef.value = true
  })
  el.addEventListener('pause', () => {
    playingRef.value = false
  })
  el.addEventListener('playing', () => {
    errorStreak = 0
  })
  el.addEventListener('ended', () => {
    if (wanted) advance()
  })
  el.addEventListener('error', () => {
    errorStreak += 1
    if (errorStreak >= tracks.length) {
      degrade()
      return
    }
    if (wanted) advance()
  })
  audio = el
}

/** 曲目文件全部加载失败：隐藏播放条，改用合成氛围垫 */
function degrade(): void {
  cancelRamp()
  audio?.pause()
  audio = null
  availableRef.value = false
  playingRef.value = false
  if (wanted) sfx.startAmbient()
}

function load(i: number): void {
  const el = audio
  const track = tracks[i]
  if (!el || !track) return
  index = i
  currentTitleRef.value = track.title
  currentArtistRef.value = track.artist
  el.src = `${MUSIC_BASE}${encodeURIComponent(track.file)}${playlistVersion ? `?v=${encodeURIComponent(playlistVersion)}` : ''}`
}

/** 首曲随机起点 */
function ensureTrack(): void {
  if (index < 0) load(Math.floor(Math.random() * tracks.length))
}

/** 自动切下一曲（曲终 / 加载失败） */
function advance(): void {
  if (!audio || !tracks.length) return
  load((index + 1) % tracks.length)
  tryPlay()
}

function cancelRamp(): void {
  if (rampTimer !== undefined) {
    window.clearInterval(rampTimer)
    rampTimer = undefined
  }
}

/** 平滑过渡音量，结束后回调 */
function rampVolume(to: number, ms: number, done?: () => void): void {
  cancelRamp()
  const el = audio
  if (!el) return
  const from = el.volume
  const steps = Math.max(1, Math.round(ms / RAMP_STEP_MS))
  let step = 0
  rampTimer = window.setInterval(() => {
    step += 1
    el.volume = Math.min(1, Math.max(0, from + ((to - from) * step) / steps))
    if (step >= steps) {
      cancelRamp()
      done?.()
    }
  }, RAMP_STEP_MS)
}

/** 条件允许时播放；被自动播放策略拒绝不报错，等下一次手势 */
function tryPlay(): void {
  const el = audio
  if (!el || !wanted || sfx.isMuted()) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  cancelRamp()
  el.volume = targetVolume
  ensureTrack()
  if (!el.paused) return
  void el.play().catch(() => {
    /* NotAllowedError：尚无用户手势，onGesture 里补启 */
  })
}

/** 大厅进入等待时调用；重复调用无副作用 */
export function start(): void {
  wanted = true
  void init().then((ok) => {
    if (!wanted) return
    // 清单缺失或曲目文件全部加载失败（degrade 已把 available 置回 false）：改用合成氛围垫
    if (!ok || !availableRef.value) {
      sfx.startAmbient()
      return
    }
    tryPlay()
  })
}

/** 开局 / 离开大厅时调用：0.6 秒淡出后暂停 */
export function stop(): void {
  wanted = false
  if (!availableRef.value) {
    sfx.stopAmbient()
    return
  }
  const el = audio
  if (!el || el.paused) return
  rampVolume(0, FADE_OUT_MS, () => {
    el.pause()
    el.volume = targetVolume
  })
}

/** 播放 / 暂停按钮：手动暂停后不再自动补启，直到再点播放；全局静音时点播放视为想听声音，顺带取消静音 */
export function toggle(): void {
  const el = audio
  if (!el || !availableRef.value) return
  if (el.paused) {
    wanted = true
    if (sfx.isMuted()) sfx.setMuted(false)
    tryPlay()
  } else {
    wanted = false
    cancelRamp()
    el.pause()
    el.volume = targetVolume
  }
}

/** 下一曲按钮：切曲并播放 */
export function next(): void {
  if (!audio || !availableRef.value || !tracks.length) return
  wanted = true
  if (sfx.isMuted()) sfx.setMuted(false)
  load((index + 1) % tracks.length)
  tryPlay()
}

/** 语音开麦时压低音量，关麦恢复（平滑过渡） */
export function setDucked(ducked: boolean): void {
  targetVolume = ducked ? VOLUME_DUCKED : VOLUME_NORMAL
  const el = audio
  if (!el || el.paused) return
  rampVolume(targetVolume, DUCK_MS)
}

// 手势内同步补启：iOS / 微信只接受手势处理器内直接调用的 play()
sfx.onGesture(() => {
  const el = audio
  if (!el || !wanted || !el.paused || sfx.isMuted()) return
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  ensureTrack()
  el.volume = targetVolume
  void el.play().catch(() => {
    /* 仍被拒绝则等下一次手势 */
  })
})

// 静音联动：静音立即暂停；取消静音且仍在等待时恢复
sfx.onMutedChange((muted) => {
  const el = audio
  if (!el) return
  if (muted) {
    cancelRamp()
    el.pause()
    el.volume = targetVolume
  } else if (wanted) {
    tryPlay()
  }
})

// 切后台暂停，回前台恢复（恢复可能被拒绝，等手势）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    const el = audio
    if (!el) return
    if (document.visibilityState === 'hidden') {
      if (!el.paused) {
        cancelRamp()
        el.pause()
        el.volume = targetVolume
      }
    } else if (wanted) {
      tryPlay()
    }
  })
}
