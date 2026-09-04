<script setup lang="ts">
// 任务出票：队员见「成功」「失败」两张牌；正义方的失败牌为不可点的灰牌（规则：正义只能成功）
import type { Side } from '@awalong/shared'

const props = withDefaults(
  defineProps<{
    side: Side
    voted: boolean
    votedCount: number
    teamSize: number
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  vote: [success: boolean]
}>()

function cast(success: boolean): void {
  if (props.voted || props.disabled) return
  if (!success && props.side === 'GOOD') return
  emit('vote', success)
}
</script>

<template>
  <div class="qc">
    <div v-if="!voted" class="qc__cards" role="group" aria-label="秘密出票">
      <button
        type="button"
        class="qc__card qc__card--success"
        data-test="quest-success"
        :disabled="disabled"
        @click="cast(true)"
      >
        <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
          <path class="qc__shield" d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
          <path d="M13 21 L18 26 L27 15" stroke="var(--text)" stroke-width="2.5" />
        </svg>
        <span class="qc__label serif">成功</span>
      </button>
      <button
        type="button"
        class="qc__card qc__card--fail"
        :class="{ 'qc__card--locked': side === 'GOOD' }"
        data-test="quest-fail"
        :disabled="disabled || side === 'GOOD'"
        :aria-label="side === 'GOOD' ? '失败（正义方只能打出成功）' : '失败'"
        @click="cast(false)"
      >
        <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
          <path class="qc__shield" d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
          <path d="M14 15 L26 27 M26 15 L14 27" stroke="var(--text)" stroke-width="2.5" />
        </svg>
        <span class="qc__label serif">失败</span>
        <span v-if="side === 'GOOD'" class="qc__lock">正义方只能成功</span>
      </button>
    </div>
    <div v-else class="qc__done" data-test="quest-done" aria-live="polite">
      <div class="qc__back" aria-hidden="true">
        <span class="qc__back-text">已出票</span>
      </div>
      <p class="qc__wait">等待其他队员出票 · {{ votedCount }} / {{ teamSize }}</p>
    </div>
  </div>
</template>

<style scoped>
.qc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.qc__cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.2rem;
}

.qc__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 9.6rem;
  border-radius: 1.2rem;
  border: 2px solid var(--border);
  background: var(--surface);
  transition: border-color 200ms ease, background-color 200ms ease, opacity 200ms ease;
}

.qc__card svg {
  width: 3.4rem;
  height: 3.8rem;
}

.qc__shield {
  stroke: none;
}

.qc__card--success {
  border-color: rgba(76, 141, 255, 0.55);
}

.qc__card--success .qc__shield {
  fill: var(--blue);
}

.qc__card--fail {
  border-color: rgba(214, 69, 69, 0.55);
}

.qc__card--fail .qc__shield {
  fill: var(--red);
}

.qc__card--success:active {
  background: rgba(76, 141, 255, 0.14);
}

.qc__card--fail:active {
  background: rgba(214, 69, 69, 0.14);
}

.qc__card:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qc__card--locked {
  border-color: var(--line);
}

.qc__card--locked .qc__shield {
  fill: var(--dim);
}

.qc__card--locked .qc__label {
  color: var(--muted);
}

.qc__label {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: 0.4rem;
  color: var(--text);
}

.qc__lock {
  font-size: 1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

.qc__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.qc__back {
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

.qc__back-text {
  font-size: 1.4rem;
  letter-spacing: 0.4rem;
  color: var(--gold);
}

.qc__wait {
  margin: 0;
  font-size: 1.3rem;
  color: var(--muted);
}

@media (hover: hover) {
  .qc__card--success:hover:not(:disabled) {
    border-color: var(--blue);
  }

  .qc__card--fail:hover:not(:disabled) {
    border-color: var(--red);
  }
}
</style>
