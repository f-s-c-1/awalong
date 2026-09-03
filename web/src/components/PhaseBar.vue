<script setup lang="ts">
// 阶段信息条：左侧小字 + 主文案，右侧倒计时（按服务端时钟；最后 5 秒变红并每秒轻震）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'

const props = withDefaults(
  defineProps<{
    /** 小字（如「你是队长」「第 3 轮 · 第 1 次组队」） */
    label?: string
    /** 主文案 */
    text: string
    /** 截止时间戳（服务端时钟，毫秒）；不传则不显示倒计时 */
    deadline?: number | null
  }>(),
  { label: '', deadline: null },
)

const URGENT_SECONDS = 5
const TICK_MS = 250

const game = useGameStore()
const now = ref(Date.now())
let timer: number | undefined

const remaining = computed<number | null>(() => {
  if (props.deadline === null || props.deadline === undefined) return null
  const ms = props.deadline - (now.value + game.serverOffset)
  return Math.max(0, Math.ceil(ms / 1000))
})

const urgent = computed(
  () => remaining.value !== null && remaining.value > 0 && remaining.value <= URGENT_SECONDS,
)

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // iOS 不支持则静默
  }
}

watch(remaining, (sec, prev) => {
  if (urgent.value && sec !== prev) vibrate(50)
})

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now()
  }, TICK_MS)
})

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer)
})
</script>

<template>
  <div class="pb">
    <div class="pb__text" aria-live="polite">
      <span v-if="label" class="pb__label">{{ label }}</span>
      <span class="pb__main">{{ text }}</span>
    </div>
    <div
      v-if="remaining !== null"
      class="pb__timer"
      :class="{ 'pb__timer--urgent': urgent }"
      role="timer"
      aria-live="off"
      :aria-label="`剩余 ${remaining} 秒`"
    >
      <span class="pb__num mono">{{ remaining }}</span>
      <span class="pb__unit">s</span>
    </div>
  </div>
</template>

<style scoped>
.pb {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
  padding: 1.2rem 1.6rem;
  border-radius: 1rem;
  background: var(--surface);
}

.pb__text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.pb__label {
  font-size: 1.1rem;
  letter-spacing: 0.1rem;
  color: var(--gold);
}

.pb__main {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text);
}

.pb__timer {
  display: flex;
  align-items: baseline;
  gap: 0.2rem;
  flex-shrink: 0;
  color: var(--gold);
  transition: color 200ms ease;
}

.pb__timer--urgent {
  color: var(--red);
}

.pb__num {
  font-size: 2.6rem;
  font-weight: 700;
  line-height: 1;
}

.pb__unit {
  font-size: 1.2rem;
  color: var(--muted);
}
</style>
