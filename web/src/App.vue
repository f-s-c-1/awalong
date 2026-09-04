<script setup lang="ts">
import { onMounted } from 'vue'
import OrientationGuard from '@/components/OrientationGuard.vue'
import * as sfx from '@/services/sfx'
import { ws } from '@/services/ws'

// 顶部弱网提示：WS 断开重连期间显示，页面内容不清空
const wsStatus = ws.status

// iOS / 微信要求首次用户手势后才能出声：全局监听一次手势解锁音频上下文
onMounted(() => sfx.installGestureUnlock())
</script>

<template>
  <div v-if="wsStatus === 'reconnecting'" class="net-bar" role="status" aria-live="polite">
    连接已断开，正在重连…
  </div>
  <RouterView />
  <OrientationGuard />
</template>

<style scoped>
.net-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 900;
  padding: calc(0.6rem + var(--safe-top)) 1.6rem 0.6rem;
  background: var(--red);
  color: var(--text);
  font-size: 1.3rem;
  letter-spacing: 0.1rem;
  text-align: center;
}
</style>
