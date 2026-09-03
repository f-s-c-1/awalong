// 私人标记：仅本机 localStorage，按房间码索引，对局结束自动清除
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { MarkKind } from '@/types/ui'
import { ws } from '@/services/ws'
import { local } from '@/utils/storage'

export interface SeatMark {
  mark: MarkKind
  /** 备注，最多 20 字 */
  note: string
}

const NOTE_MAX = 20
const keyOf = (code: string) => `marks:${code}`

export const useMarksStore = defineStore('marks', () => {
  const code = ref('')
  const marks = ref<Record<number, SeatMark>>({})

  function persist(): void {
    if (!code.value) return
    local.write(keyOf(code.value), marks.value)
  }

  /** 进入房间/对局时加载该房间的标记 */
  function load(nextCode: string): void {
    code.value = nextCode
    marks.value = nextCode ? local.read<Record<number, SeatMark>>(keyOf(nextCode), {}) : {}
  }

  function get(seat: number): SeatMark | undefined {
    return marks.value[seat]
  }

  function set(seat: number, mark: MarkKind, note = ''): void {
    marks.value = { ...marks.value, [seat]: { mark, note: note.trim().slice(0, NOTE_MAX) } }
    persist()
  }

  function clear(seat: number): void {
    const next = { ...marks.value }
    delete next[seat]
    marks.value = next
    persist()
  }

  function clearAll(): void {
    marks.value = {}
    if (code.value) local.remove(keyOf(code.value))
  }

  const off = ws.on('game.over', () => clearAll())
  if (import.meta.hot) import.meta.hot.dispose(off)

  return { code, marks, noteMax: NOTE_MAX, load, get, set, clear, clearAll }
})
