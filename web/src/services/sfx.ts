/**
 * 程序化合成音效与等待音乐：零素材、零请求，用 Web Audio 振荡器 + 噪声 + 包络生成。
 * iOS 微信要求首次用户手势后才能出声，installGestureUnlock() 在首个手势时解锁，
 * 等待音乐（startAmbient）会在解锁后自动补启。静音开关同时管音效、音乐与振动。
 * 大厅真实曲目由 music.ts 播放（自托管 CC0 mp3），本文件的合成氛围垫仅在曲目清单缺失时兜底；
 * onGesture() 把手势同步转发给 music.ts，使 audio.play() 能在手势处理器内直接调用。
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

const muteListeners = new Set<(muted: boolean) => void>()

export function setMuted(value: boolean): void {
  muted = value
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    /* 无存储环境忽略 */
  }
  if (value) teardownAmbient()
  else if (ambientWanted) startAmbient()
  muteListeners.forEach((cb) => cb(value))
}

/** 订阅静音开关变化（多处开关按钮同步显示），返回取消函数 */
export function onMutedChange(cb: (muted: boolean) => void): () => void {
  muteListeners.add(cb)
  return () => {
    muteListeners.delete(cb)
  }
}

const unlockListeners = new Set<() => void>()

/** 音频上下文进入可播放状态时回调（等待音乐据此补启） */
export function onUnlock(cb: () => void): () => void {
  unlockListeners.add(cb)
  return () => {
    unlockListeners.delete(cb)
  }
}

/** 在用户手势回调里调用，解锁 AudioContext */
export function unlock(): void {
  const c = getCtx()
  if (!c) return
  if (c.state === 'running') {
    unlockListeners.forEach((cb) => cb())
    return
  }
  void c
    .resume()
    .then(() => {
      if (c.state === 'running') unlockListeners.forEach((cb) => cb())
    })
    .catch(() => undefined)
}

const gestureListeners = new Set<() => void>()

/**
 * 订阅用户手势：回调在 pointerdown / pointerup / keydown 处理器内同步执行，
 * iOS / 微信要求 HTMLMediaElement.play() 必须直接在手势处理器里调用，异步补启会被拒绝。返回取消函数
 */
export function onGesture(cb: () => void): () => void {
  gestureListeners.add(cb)
  return () => {
    gestureListeners.delete(cb)
  }
}

let gestureInstalled = false

/**
 * 全局监听首个手势解锁音频；切后台再回来被系统中断时，下一次手势会再次解锁。
 * 触屏的 pointerdown 不算用户激活（按 HTML 规范只有鼠标的 pointerdown 与非鼠标的 pointerup 算），
 * 因此同时监听 pointerup，保证 onGesture 回调里的 play() 在手机上也能成功
 */
export function installGestureUnlock(): void {
  if (gestureInstalled || typeof document === 'undefined') return
  gestureInstalled = true
  const handler = (): void => {
    unlock()
    gestureListeners.forEach((cb) => cb())
  }
  document.addEventListener('pointerdown', handler, { passive: true })
  document.addEventListener('pointerup', handler, { passive: true })
  document.addEventListener('keydown', handler)
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
  if (muted) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* 不支持的平台忽略 */
  }
}

/* ---------------- 等待音乐：低音量合成氛围垫，每 8 秒换一个和弦 ---------------- */

interface Ambient {
  master: GainNode
  oscs: OscillatorNode[]
  lfo: OscillatorNode
  timer: number
  step: number
}

/** 和弦进行（Dm → Bb → F → Am），每个和弦三个声部的频率 */
const AMBIENT_CHORDS: readonly (readonly [number, number, number])[] = [
  [146.83, 220.0, 349.23],
  [116.54, 174.61, 293.66],
  [174.61, 261.63, 440.0],
  [110.0, 164.81, 261.63],
]
const AMBIENT_CHORD_MS = 8000
const AMBIENT_GAIN = 0.05

let ambient: Ambient | null = null
/** 调用方是否希望音乐在响（静音或上下文未解锁时先记下，条件满足后补启） */
let ambientWanted = false

/** 开始等待音乐；重复调用无副作用 */
export function startAmbient(): void {
  ambientWanted = true
  if (muted || ambient) return
  const c = getCtx()
  if (!c || c.state !== 'running') return
  try {
    const t0 = c.currentTime
    const master = c.createGain()
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.linearRampToValueAtTime(AMBIENT_GAIN, t0 + 2.5)

    const filter = c.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 520
    filter.Q.value = 0.7
    filter.connect(master).connect(c.destination)

    // 极慢的滤波器摆动，让长音不死板
    const lfo = c.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = c.createGain()
    lfoGain.gain.value = 180
    lfo.connect(lfoGain).connect(filter.frequency)
    lfo.start(t0)

    const oscs: OscillatorNode[] = []
    AMBIENT_CHORDS[0]!.forEach((freq, voice) => {
      for (const detune of [-5, 5]) {
        const osc = c.createOscillator()
        osc.type = voice === 0 ? 'sine' : 'triangle'
        osc.frequency.value = freq
        osc.detune.value = detune
        const g = c.createGain()
        g.gain.value = voice === 0 ? 0.5 : 0.3
        osc.connect(g).connect(filter)
        osc.start(t0)
        oscs.push(osc)
      }
    })

    const state: Ambient = { master, oscs, lfo, timer: 0, step: 0 }
    state.timer = window.setInterval(() => {
      state.step = (state.step + 1) % AMBIENT_CHORDS.length
      const chord = AMBIENT_CHORDS[state.step]!
      state.oscs.forEach((osc, i) => {
        osc.frequency.setTargetAtTime(chord[Math.floor(i / 2)]!, c.currentTime, 0.6)
      })
    }, AMBIENT_CHORD_MS)
    ambient = state
  } catch {
    ambient = null
  }
}

/** 停止等待音乐（0.8 秒淡出） */
export function stopAmbient(): void {
  ambientWanted = false
  teardownAmbient()
}

function teardownAmbient(): void {
  const a = ambient
  if (!a) return
  ambient = null
  window.clearInterval(a.timer)
  const c = a.master.context as AudioContext
  const t = c.currentTime
  try {
    a.master.gain.cancelScheduledValues(t)
    a.master.gain.setValueAtTime(Math.max(a.master.gain.value, 0.0001), t)
    a.master.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
  } catch {
    /* 上下文已关闭 */
  }
  window.setTimeout(() => {
    for (const osc of a.oscs) {
      try {
        osc.stop()
      } catch {
        /* 已停止 */
      }
    }
    try {
      a.lfo.stop()
    } catch {
      /* 已停止 */
    }
    a.master.disconnect()
  }, 900)
}

// 解锁后补启等待音乐（进大厅时通常还没有手势）
onUnlock(() => {
  if (ambientWanted && !muted && !ambient) startAmbient()
})
