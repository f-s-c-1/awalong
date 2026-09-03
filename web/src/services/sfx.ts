/**
 * 程序化合成音效：零素材、零请求，用 Web Audio 振荡器 + 噪声 + 包络生成。
 * iOS 微信要求首次用户手势后才能出声，调用 unlock() 于任意点击回调中。
 * 后续如换真实音频文件，只需改 play() 内部实现，调用方不变。
 */

export type SfxName =
  | 'tap'
  | 'flip'
  | 'phase'
  | 'approve'
  | 'reject'
  | 'success'
  | 'fail'
  | 'tick'
  | 'tickUrgent'
  | 'assassin'
  | 'win'
  | 'lose'

const STORAGE_KEY = 'avalon.sfx.muted'

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = readMuted()

function readMuted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* 无存储环境忽略 */
  }
}

/** 在用户手势回调里调用，解锁 AudioContext */
export function unlock(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  return ctx
}

function getNoise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer
  const length = c.sampleRate
  noiseBuffer = c.createBuffer(1, length, c.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

interface ToneOpts {
  type?: OscillatorType
  freq: number
  freqEnd?: number
  start?: number
  duration: number
  gain?: number
  attack?: number
}

function tone(c: AudioContext, o: ToneOpts): void {
  const t0 = c.currentTime + (o.start ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t0)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.duration)
  const peak = o.gain ?? 0.2
  const attack = o.attack ?? 0.005
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + o.duration + 0.02)
}

interface NoiseOpts {
  start?: number
  duration: number
  gain?: number
  filter?: BiquadFilterType
  freq?: number
  freqEnd?: number
  q?: number
}

function noise(c: AudioContext, o: NoiseOpts): void {
  const t0 = c.currentTime + (o.start ?? 0)
  const src = c.createBufferSource()
  src.buffer = getNoise(c)
  const g = c.createGain()
  const f = c.createBiquadFilter()
  f.type = o.filter ?? 'bandpass'
  f.frequency.setValueAtTime(o.freq ?? 1200, t0)
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.duration)
  f.Q.value = o.q ?? 1
  const peak = o.gain ?? 0.15
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration)
  src.connect(f).connect(g).connect(c.destination)
  src.start(t0)
  src.stop(t0 + o.duration + 0.02)
}

const recipes: Record<SfxName, (c: AudioContext) => void> = {
  tap: (c) => tone(c, { type: 'triangle', freq: 880, freqEnd: 660, duration: 0.06, gain: 0.12 }),
  flip: (c) => {
    noise(c, { duration: 0.12, freq: 2500, freqEnd: 600, gain: 0.18, q: 0.8 })
    tone(c, { type: 'triangle', freq: 520, freqEnd: 780, duration: 0.09, gain: 0.08, start: 0.02 })
  },
  phase: (c) => {
    tone(c, { freq: 659, duration: 0.35, gain: 0.16 })
    tone(c, { freq: 988, duration: 0.5, gain: 0.14, start: 0.12 })
    tone(c, { type: 'triangle', freq: 1319, duration: 0.6, gain: 0.06, start: 0.24 })
  },
  approve: (c) => {
    tone(c, { freq: 523, duration: 0.14, gain: 0.14 })
    tone(c, { freq: 784, duration: 0.22, gain: 0.14, start: 0.1 })
  },
  reject: (c) => {
    tone(c, { type: 'triangle', freq: 440, duration: 0.14, gain: 0.14 })
    tone(c, { type: 'triangle', freq: 311, duration: 0.26, gain: 0.14, start: 0.1 })
  },
  success: (c) => {
    tone(c, { freq: 587, duration: 0.18, gain: 0.14 })
    tone(c, { freq: 740, duration: 0.18, gain: 0.14, start: 0.12 })
    tone(c, { freq: 880, duration: 0.4, gain: 0.16, start: 0.24 })
  },
  fail: (c) => {
    tone(c, { type: 'sine', freq: 110, freqEnd: 45, duration: 0.5, gain: 0.5, attack: 0.002 })
    noise(c, { duration: 0.3, filter: 'lowpass', freq: 400, gain: 0.25 })
    tone(c, { type: 'sawtooth', freq: 65, duration: 0.6, gain: 0.08, start: 0.05 })
  },
  tick: (c) => tone(c, { type: 'square', freq: 1500, duration: 0.03, gain: 0.05 }),
  tickUrgent: (c) => {
    tone(c, { type: 'square', freq: 1800, duration: 0.05, gain: 0.09 })
    tone(c, { type: 'sine', freq: 220, duration: 0.08, gain: 0.08 })
  },
  assassin: (c) => {
    noise(c, { duration: 0.35, freq: 6000, freqEnd: 300, gain: 0.3, q: 2 })
    tone(c, { type: 'sawtooth', freq: 1200, freqEnd: 80, duration: 0.4, gain: 0.12 })
    tone(c, { type: 'sine', freq: 55, duration: 0.7, gain: 0.4, start: 0.15, attack: 0.01 })
  },
  win: (c) => {
    const notes = [523, 659, 784, 1047]
    notes.forEach((f, i) => tone(c, { freq: f, duration: 0.5, gain: 0.14, start: i * 0.13 }))
    tone(c, { type: 'triangle', freq: 1568, duration: 0.9, gain: 0.05, start: 0.55 })
  },
  lose: (c) => {
    const notes = [440, 415, 370, 311]
    notes.forEach((f, i) => tone(c, { type: 'triangle', freq: f, duration: 0.45, gain: 0.14, start: i * 0.16 }))
    tone(c, { type: 'sine', freq: 82, duration: 1, gain: 0.25, start: 0.5 })
  },
}

export function play(name: SfxName): void {
  if (muted) return
  const c = getCtx()
  if (!c || c.state !== 'running') return
  try {
    recipes[name](c)
  } catch {
    /* 音频节点创建失败不影响游戏 */
  }
}

export function vibrate(pattern: number | number[] = 50): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 不支持的平台忽略 */
  }
}
