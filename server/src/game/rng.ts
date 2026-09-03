import { randomInt } from 'node:crypto'

export interface Rng {
  /** 返回 [0, 1) 区间的随机数 */
  next(): number
}

export function cryptoRng(): Rng {
  return { next: () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000 }
}

/** mulberry32，仅用于测试重放 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

export function shuffle<T>(input: readonly T[], rng: Rng): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    const tmp = arr[i]!
    arr[i] = arr[j]!
    arr[j] = tmp
  }
  return arr
}

export function pickOne<T>(input: readonly T[], rng: Rng): T {
  if (input.length === 0) throw new Error('pickOne: 空数组')
  return input[Math.floor(rng.next() * input.length)]!
}
