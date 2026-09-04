<script setup lang="ts">
// 组队表决：两张大按钮牌「同意（蓝）」「反对（红）」；投出后盖下显示已投，等待全员
const props = withDefaults(
  defineProps<{
    voted: boolean
    votedCount: number
    total: number
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  vote: [approve: boolean]
}>()

function cast(approve: boolean): void {
  if (props.voted || props.disabled) return
  emit('vote', approve)
}
</script>

<template>
  <div class="tv">
    <div v-if="!voted" class="tv__cards" role="group" aria-label="对本次队伍表决">
      <button
        type="button"
        class="tv__card tv__card--approve"
        data-test="vote-approve"
        :disabled="disabled"
        @click="cast(true)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5 L10 17.5 L19 7" />
        </svg>
        <span class="tv__label serif">同意</span>
      </button>
      <button
        type="button"
        class="tv__card tv__card--reject"
        data-test="vote-reject"
        :disabled="disabled"
        @click="cast(false)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6 L18 18 M18 6 L6 18" />
        </svg>
        <span class="tv__label serif">反对</span>
      </button>
    </div>
    <div v-else class="tv__done" data-test="vote-done" aria-live="polite">
      <div class="tv__back" aria-hidden="true">
        <span class="tv__back-text">已投</span>
      </div>
      <p class="tv__wait">等待其他玩家表决 · {{ votedCount }} / {{ total }}</p>
    </div>
  </div>
</template>

<style scoped>
.tv {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.tv__cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.2rem;
}

.tv__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  min-height: 9.6rem;
  border-radius: 1.2rem;
  border: 2px solid var(--border);
  background: var(--surface);
  transition: border-color 200ms ease, background-color 200ms ease, opacity 200ms ease;
}

.tv__card svg {
  width: 3rem;
  height: 3rem;
}

.tv__card--approve {
  color: var(--blue);
  border-color: rgba(76, 141, 255, 0.55);
}

.tv__card--reject {
  color: var(--red);
  border-color: rgba(214, 69, 69, 0.55);
}

.tv__card--approve:active {
  background: rgba(76, 141, 255, 0.14);
}

.tv__card--reject:active {
  background: rgba(214, 69, 69, 0.14);
}

.tv__card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tv__label {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: 0.4rem;
  color: var(--text);
}

.tv__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.tv__back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 9rem;
  height: 6rem;
  border-radius: 1rem;
  border: 1px solid var(--gold-line);
  background:
    radial-gradient(circle at 50% 50%, rgba(201, 162, 39, 0.14), transparent 65%),
    var(--surface);
}

.tv__back-text {
  font-size: 1.4rem;
  letter-spacing: 0.4rem;
  color: var(--gold);
}

.tv__wait {
  margin: 0;
  font-size: 1.3rem;
  color: var(--muted);
}

@media (hover: hover) {
  .tv__card--approve:hover:not(:disabled) {
    border-color: var(--blue);
  }

  .tv__card--reject:hover:not(:disabled) {
    border-color: var(--red);
  }
}
</style>
