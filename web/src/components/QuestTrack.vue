<script setup lang="ts">
// 任务进度：5 面盾（蓝✓ / 红✗ / 当前金描边 / 待定灰）+ 流局点 + 第 4 轮双失败票注
import { computed } from 'vue'
import type { QuestResult } from '@awalong/shared'

const props = withDefaults(
  defineProps<{
    results: QuestResult[]
    currentIndex: number
    questSizes: readonly number[]
    /** 本轮已被否决的组队次数 0-5 */
    rejectCount: number
    /** 需要 2 张失败票的任务索引 */
    twoFailsIndex?: number
  }>(),
  { twoFailsIndex: undefined },
)

const SHIELD = 'M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z'

type ShieldState = 'S' | 'F' | 'current' | 'pending'

const items = computed(() =>
  Array.from({ length: 5 }, (_, i) => {
    const result = props.results[i]
    const state: ShieldState = result ?? (i === props.currentIndex ? 'current' : 'pending')
    const size = props.questSizes[i]
    const stateText =
      state === 'S' ? '成功' : state === 'F' ? '失败' : state === 'current' ? '进行中' : '未开始'
    const sizeText = size === undefined ? '' : `，${size} 人队伍`
    const twoFails = i === props.twoFailsIndex ? '，需 2 张失败票' : ''
    return {
      state,
      size,
      label: `第 ${i + 1} 轮任务：${stateText}${sizeText}${twoFails}`,
    }
  }),
)

const rejectDots = [1, 2, 3, 4, 5]
</script>

<template>
  <div class="qt">
    <ol class="qt__shields" aria-label="任务进度">
      <li
        v-for="(item, i) in items"
        :key="i"
        class="qt__item"
        :class="`qt__item--${item.state}`"
        :aria-label="item.label"
        :aria-current="i === currentIndex ? 'step' : undefined"
      >
        <svg viewBox="0 0 40 44" fill="none" aria-hidden="true">
          <path class="qt__shield" :d="SHIELD" />
          <path v-if="item.state === 'S'" class="qt__mark" d="M13 21 L18 26 L27 15" />
          <path v-else-if="item.state === 'F'" class="qt__mark" d="M14 15 L26 27 M26 15 L14 27" />
          <text v-else class="qt__num" x="20" y="27" text-anchor="middle">{{ item.size ?? '' }}</text>
          <text v-if="i === twoFailsIndex" class="qt__star" x="28" y="16">*</text>
        </svg>
      </li>
    </ol>

    <div class="qt__meta">
      <div class="qt__rejects">
        <span class="qt__meta-label">流局</span>
        <span class="qt__dots" role="img" :aria-label="`本轮已流局 ${rejectCount} 次`">
          <span
            v-for="d in rejectDots"
            :key="d"
            class="qt__dot"
            :class="{ 'qt__dot--on': d <= rejectCount }"
          ></span>
        </span>
      </div>
      <span v-if="twoFailsIndex !== undefined" class="qt__note">
        * 第 {{ twoFailsIndex + 1 }} 轮需 2 张失败票
      </span>
    </div>
  </div>
</template>

<style scoped>
.qt {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.qt__shields {
  display: flex;
  justify-content: center;
  gap: 1.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.qt__item {
  width: 4rem;
  height: 4.4rem;
}

.qt__item svg {
  display: block;
  width: 100%;
  height: 100%;
}

.qt__shield {
  fill: none;
  stroke: var(--border);
  stroke-width: 1.5;
  transition: fill 200ms ease, stroke 200ms ease;
}

.qt__item--S .qt__shield {
  fill: var(--blue);
  stroke: none;
}

.qt__item--F .qt__shield {
  fill: var(--red);
  stroke: none;
}

.qt__item--current .qt__shield {
  fill: var(--surface);
  stroke: var(--gold);
  stroke-width: 2;
}

.qt__mark {
  fill: none;
  stroke: var(--text);
  stroke-width: 2.5;
}

.qt__num {
  font-family: var(--font-sans);
  font-size: 14px;
  fill: var(--muted);
}

.qt__item--current .qt__num {
  font-size: 15px;
  font-weight: 700;
  fill: var(--gold);
}

.qt__star {
  font-size: 9px;
  fill: var(--gold);
}

.qt__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.6rem;
}

.qt__rejects {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.qt__meta-label {
  font-size: 1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

.qt__dots {
  display: flex;
  gap: 0.4rem;
}

.qt__dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  border: 1px solid var(--border);
  transition: background-color 200ms ease, border-color 200ms ease;
}

.qt__dot--on {
  background: var(--red);
  border-color: var(--red);
}

.qt__note {
  font-size: 1rem;
  color: var(--small);
}
</style>
