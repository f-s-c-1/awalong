<script setup lang="ts">
// 任务揭晓：居中逐张翻开洗乱后的成功 / 失败票（600ms 一张），翻到失败票时红光震屏；
// 全部翻完停留 1.5 秒后 emit done，父组件据此移除并继续（终局时再跳结算）
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { QuestResult } from '@awalong/shared'
import * as sfx from '@/services/sfx'

const props = withDefaults(
  defineProps<{
    cards: QuestResult[]
    failed: boolean
    /** 第几轮任务（1-5），用于标题 */
    questNo: number
    /** 判定失败所需的失败票数 */
    failsNeeded?: number
    stepMs?: number
    holdMs?: number
  }>(),
  { failsNeeded: 1, stepMs: 600, holdMs: 1500 },
)

const emit = defineEmits<{
  done: []
}>()

const opened = ref(0)
const flash = ref(false)
const finished = ref(false)
let timers: number[] = []

const failCount = computed(() => props.cards.filter((c) => c === 'F').length)
const resultText = computed(() =>
  props.failed
    ? `任务失败 · ${failCount.value} 张失败票`
    : failCount.value > 0
      ? `任务成功 · ${failCount.value} 张失败票未达 ${props.failsNeeded} 张`
      : '任务成功 · 全票通过',
)

function clearTimers(): void {
  timers.forEach((t) => window.clearTimeout(t))
  timers = []
}

function run(): void {
  clearTimers()
  opened.value = 0
  finished.value = false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const step = reduced ? 120 : props.stepMs
  props.cards.forEach((card, i) => {
    timers.push(
      window.setTimeout(() => {
        opened.value = i + 1
        sfx.play('flip')
        if (card === 'F') {
          flash.value = true
          sfx.vibrate(80)
          timers.push(window.setTimeout(() => (flash.value = false), 120))
        }
      }, 400 + i * step),
    )
  })
  const total = 400 + props.cards.length * step
  timers.push(
    window.setTimeout(() => {
      finished.value = true
      sfx.play(props.failed ? 'fail' : 'success')
    }, total),
  )
  timers.push(window.setTimeout(() => emit('done'), total + props.holdMs))
}

watch(() => props.cards, run, { immediate: true })
onBeforeUnmount(clearTimers)
</script>

<template>
  <div
    class="qr"
    :class="{ 'qr--flash': flash, 'qr--failed': finished && failed, 'qr--success': finished && !failed }"
    role="dialog"
    aria-modal="true"
    aria-label="任务揭晓"
    data-test="quest-reveal"
    :data-failed="failed"
    :data-finished="finished"
  >
    <div class="qr__panel">
      <span class="qr__title serif">第 {{ questNo }} 轮任务揭晓</span>
      <ul class="qr__cards" aria-label="出票">
        <li
          v-for="(card, i) in cards"
          :key="i"
          class="qr__card"
          :class="{ 'qr__card--up': i < opened, [`qr__card--${card}`]: i < opened }"
          :aria-label="i < opened ? (card === 'S' ? '成功' : '失败') : '未翻开'"
        >
          <div class="qr__inner">
            <div class="qr__face qr__back" aria-hidden="true"></div>
            <div class="qr__face qr__front">
              <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
                <path class="qr__shield" d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
                <path v-if="card === 'S'" d="M13 21 L18 26 L27 15" stroke="var(--text)" stroke-width="2.5" />
                <path v-else d="M14 15 L26 27 M26 15 L14 27" stroke="var(--text)" stroke-width="2.5" />
              </svg>
            </div>
          </div>
        </li>
      </ul>
      <p class="qr__result" :class="{ 'qr__result--show': finished }" aria-live="assertive">
        {{ finished ? resultText : '' }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.qr {
  position: fixed;
  inset: 0;
  z-index: 750;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.4rem;
  background: rgba(10, 8, 14, 0.78);
  transition: background-color 120ms ease;
}

.qr--flash {
  background: rgba(214, 69, 69, 0.55);
}

.qr__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  width: 100%;
  max-width: 40rem;
}

.qr__title {
  font-size: 1.6rem;
  letter-spacing: 0.4rem;
  color: var(--gold);
}

.qr__cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.2rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.qr__card {
  width: 6.4rem;
  height: 8.8rem;
  perspective: 60rem;
}

.qr__inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 500ms cubic-bezier(0.2, 0.7, 0.2, 1);
}

.qr__card--up .qr__inner {
  transform: rotateY(180deg);
}

.qr__face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.8rem;
  border: 1px solid var(--gold-line);
  background: var(--surface);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.qr__back {
  background:
    radial-gradient(circle at 50% 50%, rgba(201, 162, 39, 0.16), transparent 62%),
    var(--surface);
}

.qr__front {
  transform: rotateY(180deg);
}

.qr__front svg {
  width: 3.4rem;
  height: 3.8rem;
}

.qr__shield {
  fill: var(--dim);
}

.qr__card--S .qr__shield {
  fill: var(--blue);
}

.qr__card--F .qr__shield {
  fill: var(--red);
}

.qr__card--S .qr__front {
  border-color: var(--blue);
}

.qr__card--F .qr__front {
  border-color: var(--red);
}

.qr__result {
  min-height: 2.4rem;
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  color: var(--text);
  opacity: 0;
  transition: opacity 300ms ease;
}

.qr__result--show {
  opacity: 1;
}

.qr--failed .qr__result {
  color: var(--red);
}

.qr--success .qr__result {
  color: var(--blue);
}

@media (prefers-reduced-motion: reduce) {
  .qr__inner {
    transition: none;
  }
}
</style>
