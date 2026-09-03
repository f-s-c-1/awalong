<script setup lang="ts">
// 环形座位：角度 = -90° + 360°/n × ((seat - mySeat + n/2) mod n)，让「我」固定在正下方
// 半径 = min(100vw, 480px) × 42%（纯 CSS 计算，座位只输出单位向量 --dx/--dy）
import { computed, onBeforeUnmount, useSlots } from 'vue'
import type { RingSeat } from '@/types/ui'
import SeatAvatar from './SeatAvatar.vue'

const props = withDefaults(
  defineProps<{
    seats: RingSeat[]
    mySeat?: number
    /** 总座位数（默认取 seats.length） */
    total?: number
    /** 是否允许点击座位（组队选人等） */
    selectable?: boolean
    /** 长按触发时长（毫秒） */
    longpressMs?: number
  }>(),
  {
    mySeat: undefined,
    total: undefined,
    selectable: false,
    longpressMs: 600,
  },
)

const emit = defineEmits<{
  select: [seat: number]
  longpress: [seat: number]
}>()

const slots = useSlots()
const hasCenter = computed(() => !!slots.center)

const count = computed(() => Math.max(props.total ?? props.seats.length, 1))

const ordered = computed(() => [...props.seats].sort((a, b) => a.seat - b.seat))

function mod(value: number, n: number): number {
  return ((value % n) + n) % n
}

/** 座位在环上的单位向量（屏幕坐标：y 向下为正） */
function vectorOf(seat: number): { '--dx': string; '--dy': string } {
  const n = count.value
  const offset = props.mySeat === undefined ? seat - 1 : seat - props.mySeat + n / 2
  const deg = -90 + (360 / n) * mod(offset, n)
  const rad = (deg * Math.PI) / 180
  return {
    '--dx': Math.cos(rad).toFixed(4),
    '--dy': Math.sin(rad).toFixed(4),
  }
}

function describe(s: RingSeat): string {
  if (s.empty) return `${s.seat} 号座位，空位`
  const parts = [`${s.seat} 号`, s.nickname]
  if (s.seat === props.mySeat) parts.push('我')
  if (s.isLeader) parts.push('队长')
  if (s.selected) parts.push('已提名')
  if (s.voted) parts.push('已投票')
  if (s.ready) parts.push('已准备')
  if (!s.online) parts.push('已断线')
  if (s.speaking) parts.push('正在说话')
  return parts.join('，')
}

// 长按：pointer 计时；触发后吞掉紧随的 click
let pressTimer: number | undefined
let pressSeat: number | undefined
let longpressFired = false

function clearPress(): void {
  if (pressTimer !== undefined) {
    window.clearTimeout(pressTimer)
    pressTimer = undefined
  }
  pressSeat = undefined
}

function onPointerDown(s: RingSeat, ev: PointerEvent): void {
  if (s.empty || ev.button !== 0) return
  clearPress()
  longpressFired = false
  pressSeat = s.seat
  pressTimer = window.setTimeout(() => {
    pressTimer = undefined
    if (pressSeat === s.seat) {
      longpressFired = true
      emit('longpress', s.seat)
    }
  }, props.longpressMs)
}

function onPointerEnd(): void {
  clearPress()
}

function onClick(s: RingSeat): void {
  if (longpressFired) {
    longpressFired = false
    return
  }
  // 空位也可被选择（大厅换座），由父组件按座位状态决定如何处理
  if (!props.selectable) return
  emit('select', s.seat)
}

function onKeydown(s: RingSeat, ev: KeyboardEvent): void {
  if (s.empty) return
  // 键盘用户：ContextMenu / Shift+F10 等价于长按
  if (ev.key === 'ContextMenu' || (ev.shiftKey && ev.key === 'F10')) {
    ev.preventDefault()
    emit('longpress', s.seat)
  }
}

onBeforeUnmount(clearPress)
</script>

<template>
  <div class="ring">
    <div class="ring__line" aria-hidden="true"></div>

    <div v-if="hasCenter" class="ring__center">
      <slot name="center" />
    </div>

    <ul class="ring__list" aria-label="圆桌座位">
      <li v-for="s in ordered" :key="s.seat" class="ring__seat" :style="vectorOf(s.seat)">
        <button
          type="button"
          class="ring__btn"
          :class="{ 'ring__btn--selectable': selectable }"
          :aria-label="describe(s)"
          :aria-pressed="selectable && !s.empty ? !!s.selected : undefined"
          @pointerdown="onPointerDown(s, $event)"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
          @pointerleave="onPointerEnd"
          @click="onClick(s)"
          @keydown="onKeydown(s, $event)"
          @contextmenu.prevent
        >
          <SeatAvatar
            :seat="s.seat"
            :avatar="s.avatar"
            :nickname="s.nickname"
            :online="s.online"
            :empty="s.empty"
            :me="s.seat === mySeat"
            :is-leader="s.isLeader"
            :selected="s.selected"
            :voted="s.voted"
            :ready="s.ready"
            :mark="s.mark"
            :speaking="s.speaking"
          />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ring {
  --ring-w: min(100vw, 480px);
  --r: min(calc(var(--ring-w) * 0.42), 34vh);
  --r: min(calc(var(--ring-w) * 0.42), 34dvh);
  position: relative;
  left: 50%;
  width: var(--ring-w);
  height: calc(var(--r) * 2 + 8.4rem);
  transform: translateX(-50%);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.ring__line {
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--r) * 2);
  height: calc(var(--r) * 2);
  border-radius: 50%;
  border: 1px solid var(--line);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.ring__center {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  width: 11.6rem;
  height: 11.6rem;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid rgba(201, 162, 39, 0.35);
  transform: translate(-50%, -50%);
  text-align: center;
}

.ring__list {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ring__seat {
  position: absolute;
  left: calc(50% + var(--dx) * var(--r));
  top: calc(50% + var(--dy) * var(--r));
  transform: translate(-50%, -50%);
}

.ring__btn {
  display: block;
  padding: 0.4rem;
  border-radius: 0.8rem;
  cursor: default;
  touch-action: manipulation;
}

.ring__btn--selectable {
  cursor: pointer;
}

.ring__btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 0;
}
</style>
