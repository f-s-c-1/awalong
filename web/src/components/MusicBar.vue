<script setup lang="ts">
// 大厅等待音乐条：音符 + 「曲名 · 作者」+ 播放 / 暂停 + 下一曲；曲目清单缺失时不渲染（退化为合成氛围垫，无需界面）
import { computed } from 'vue'
import { available, currentArtist, currentTitle, next, playing, toggle } from '@/services/music'

const label = computed(() => {
  const title = currentTitle.value || '等待音乐'
  return currentArtist.value ? `${title} · ${currentArtist.value}` : title
})
</script>

<template>
  <section v-if="available" class="mb" :class="{ 'mb--playing': playing }" aria-label="等待音乐">
    <svg class="mb__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
    <span class="mb__title" :title="label" aria-live="polite">{{ label }}</span>
    <button
      type="button"
      class="mb__btn"
      :aria-label="playing ? '暂停音乐' : '播放音乐'"
      :aria-pressed="playing"
      :title="playing ? '暂停' : '播放'"
      @click="toggle"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <template v-if="playing">
          <rect x="6.5" y="5" width="4" height="14" rx="1" />
          <rect x="13.5" y="5" width="4" height="14" rx="1" />
        </template>
        <path v-else d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
      </svg>
    </button>
    <button type="button" class="mb__btn" aria-label="下一曲" title="下一曲" @click="next">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M5 6.2v11.6a1 1 0 0 0 1.55.83L15 12.8a1 1 0 0 0 0-1.6L6.55 5.37A1 1 0 0 0 5 6.2Z" />
        <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
      </svg>
    </button>
  </section>
</template>

<style scoped>
.mb {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
}

.mb__icon {
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  color: var(--small);
  transition: color 200ms ease;
}

.mb--playing .mb__icon {
  color: var(--gold);
}

.mb__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.1rem;
  letter-spacing: 0.05rem;
  color: var(--small);
}

.mb__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 50%;
  border: 1px solid var(--border);
  color: var(--muted);
  transition: border-color 200ms ease, color 200ms ease;
}

.mb__btn svg {
  width: 1.6rem;
  height: 1.6rem;
}

.mb__btn:active {
  color: var(--gold);
  border-color: var(--gold-line);
}

.mb--playing .mb__btn[aria-pressed='true'] {
  color: var(--gold);
  border-color: var(--gold-line);
}

/* 鼠标悬停：边框变金（触屏不受影响） */
@media (hover: hover) {
  .mb__btn {
    transition-duration: 150ms;
  }

  .mb__btn:hover {
    color: var(--gold);
    border-color: var(--gold);
  }
}

@media (min-width: 768px) {
  .mb__title {
    font-size: 1.2rem;
  }
}
</style>
