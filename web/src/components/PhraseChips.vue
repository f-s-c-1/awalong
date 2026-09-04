<script setup lang="ts">
// 快捷短语条：横向滚动 chips，点击后发出 send 并进入冷却（每人 5 秒一条），冷却期间全部禁用、最后点击的 chip 显示剩余秒数
import { computed, onBeforeUnmount, ref } from 'vue'
import { buildPhraseIds, phraseText } from '@/utils/phrases'

const props = withDefaults(
  defineProps<{
    /** 本局所有座位号 */
    seats: number[]
    mySeat?: number
    /** 旁观者 / 断线时禁用 */
    disabled?: boolean
    cooldownMs?: number
  }>(),
  { disabled: false, cooldownMs: 5000 },
)

const emit = defineEmits<{
  send: [phraseId: string]
}>()

/** 冷却剩余秒数轮询间隔：按真实时间计算剩余量，避免后台标签页节流造成的漂移 */
const TICK_MS = 250

const items = computed(() => buildPhraseIds(props.seats, props.mySeat).map((id) => ({ id, text: phraseText(id) })))

/** 冷却截止时间戳（0 表示未在冷却） */
const cooldownUntil = ref(0)
const remainingSec = ref(0)
/** 最后一次点击的短语 id，冷却期间在它上面显示倒计时 */
const lastId = ref<string | null>(null)
let timer: number | null = null

const cooling = computed(() => remainingSec.value > 0)
const locked = computed(() => props.disabled || cooling.value)

const groupLabel = computed(() => {
  if (props.disabled) return '快捷短语，当前不可发送'
  if (cooling.value) return `快捷短语，冷却中，${remainingSec.value} 秒后可再发`
  return '快捷短语'
})

function stopTimer(): void {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

function tick(): void {
  const left = Math.ceil((cooldownUntil.value - Date.now()) / 1000)
  if (left <= 0) {
    remainingSec.value = 0
    cooldownUntil.value = 0
    stopTimer()
    return
  }
  remainingSec.value = left
}

function startCooldown(): void {
  if (props.cooldownMs <= 0) return
  cooldownUntil.value = Date.now() + props.cooldownMs
  remainingSec.value = Math.ceil(props.cooldownMs / 1000)
  stopTimer()
  timer = window.setInterval(tick, TICK_MS)
}

function send(id: string): void {
  if (locked.value) return
  emit('send', id)
  lastId.value = id
  startCooldown()
}

function chipLabel(id: string, text: string): string {
  if (cooling.value && id === lastId.value) return `${text}，冷却中，${remainingSec.value} 秒后可再发`
  if (cooling.value) return `${text}，冷却中`
  return text
}

onBeforeUnmount(stopTimer)
</script>

<template>
  <div class="pc" role="group" :aria-label="groupLabel">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="chip pc__chip"
      :class="{ 'pc__chip--cooling': cooling && item.id === lastId }"
      :disabled="locked"
      :aria-label="chipLabel(item.id, item.text)"
      @click="send(item.id)"
    >
      <span class="pc__text">{{ item.text }}</span>
      <span v-if="cooling && item.id === lastId" class="pc__count mono" aria-hidden="true">{{ remainingSec }}s</span>
    </button>
  </div>
</template>

<style scoped>
/* 容器只在自身内部横向滚动，隐藏滚动条；min-width: 0 防止在 flex 父级中撑开页面 */
.pc {
  display: flex;
  gap: 0.8rem;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0.4rem 0.2rem;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.pc::-webkit-scrollbar {
  display: none;
}

.pc__chip {
  flex: 0 0 auto;
  min-height: 3.6rem;
  padding: 0 1.4rem;
  border-color: var(--border);
  border-radius: 0.8rem;
  font-size: 1.3rem;
  color: var(--text);
  background: var(--surface);
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease, opacity 150ms ease;
}

.pc__chip:active:not(:disabled) {
  border-color: var(--gold);
  background: rgba(201, 162, 39, 0.08);
}

.pc__chip:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.6;
}

/* 最后点击的 chip：冷却期间保持金色描边并显示倒计时，不随其他禁用项一起压暗 */
.pc__chip--cooling:disabled {
  color: var(--gold);
  border-color: var(--gold-line);
  opacity: 1;
}

.pc__count {
  font-size: 1.2rem;
  color: var(--gold);
}

@media (hover: hover) {
  .pc__chip:hover:not(:disabled) {
    border-color: var(--gold);
  }
}
</style>
