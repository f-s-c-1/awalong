<script setup lang="ts">
// 锁竖屏：触屏设备横屏时全屏遮罩，不做横屏适配
import { onBeforeUnmount, onMounted, ref } from 'vue'

const QUERY = '(orientation: landscape) and (pointer: coarse)'

const landscape = ref(false)
let mql: MediaQueryList | null = null

function update(): void {
  const byQuery = mql ? mql.matches : false
  landscape.value = byQuery && window.innerWidth > window.innerHeight
}

onMounted(() => {
  mql = window.matchMedia(QUERY)
  mql.addEventListener('change', update)
  window.addEventListener('resize', update)
  window.addEventListener('orientationchange', update)
  update()
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', update)
  window.removeEventListener('resize', update)
  window.removeEventListener('orientationchange', update)
})
</script>

<template>
  <div v-if="landscape" class="og" role="dialog" aria-modal="true" aria-label="请竖屏游玩">
    <svg class="og__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
      <path d="M2.5 9.5a9.5 9.5 0 0 1 3-4.5M21.5 14.5a9.5 9.5 0 0 1-3 4.5" />
      <path d="M5.5 2.5v2.5H3M18.5 21.5V19H21" />
    </svg>
    <p class="og__text serif">请竖屏游玩</p>
    <p class="og__sub">阿瓦隆桌面仅支持竖屏显示</p>
  </div>
</template>

<style scoped>
.og {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  background: var(--bg);
  color: var(--text);
}

.og__icon {
  width: 5.6rem;
  height: 5.6rem;
  color: var(--gold);
}

.og__text {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.4rem;
}

.og__sub {
  margin: 0;
  font-size: 1.3rem;
  color: var(--muted);
}
</style>
