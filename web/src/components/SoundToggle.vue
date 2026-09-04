<script setup lang="ts">
// 音效 / 等待音乐 / 振动总开关：状态存本地，多处按钮通过 onMutedChange 同步
import { onBeforeUnmount, ref } from 'vue'
import * as sfx from '@/services/sfx'

const muted = ref(sfx.isMuted())
const off = sfx.onMutedChange((value) => {
  muted.value = value
})

function toggle(): void {
  sfx.unlock()
  sfx.setMuted(!muted.value)
  if (!muted.value) sfx.play('tap')
}

onBeforeUnmount(off)
</script>

<template>
  <button
    type="button"
    class="icon-btn st"
    :class="{ 'st--muted': muted }"
    :aria-label="muted ? '开启音效与音乐' : '关闭音效与音乐'"
    :aria-pressed="!muted"
    :title="muted ? '音效已关闭' : '音效已开启'"
    @click="toggle"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4Z" />
      <template v-if="muted">
        <line x1="16" y1="9.5" x2="21" y2="14.5" />
        <line x1="21" y1="9.5" x2="16" y2="14.5" />
      </template>
      <template v-else>
        <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
        <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.st svg {
  width: 2.2rem;
  height: 2.2rem;
}

.st--muted {
  color: var(--small);
}
</style>
