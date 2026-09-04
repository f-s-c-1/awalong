<script setup lang="ts">
// 阶段横幅：每次 message 变化显示 800ms 后自动消失（toast 式），配合轻震动
import { onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 要显示的文案；同一文案再次触发请改变 nonce */
    message: string | null
    nonce?: number
    durationMs?: number
  }>(),
  { nonce: 0, durationMs: 800 },
)

const visible = ref(false)
const text = ref('')
let timer: number | undefined

watch(
  () => [props.message, props.nonce] as const,
  ([message]) => {
    if (!message) return
    text.value = message
    visible.value = true
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      visible.value = false
    }, props.durationMs)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (timer !== undefined) window.clearTimeout(timer)
})
</script>

<template>
  <Transition name="banner">
    <div v-if="visible" class="banner" role="status" aria-live="polite" data-test="phase-banner">
      <span class="banner__text serif">{{ text }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.banner {
  position: fixed;
  left: 50%;
  top: 22%;
  z-index: 700;
  padding: 1.2rem 2.4rem;
  border: 1px solid var(--gold-line);
  border-radius: 1rem;
  background: rgba(31, 26, 43, 0.96);
  box-shadow: var(--shadow-card);
  transform: translateX(-50%);
  pointer-events: none;
  white-space: nowrap;
}

.banner__text {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: 0.3rem;
  color: var(--gold);
}

.banner-enter-active {
  transition: opacity 200ms ease;
}

.banner-leave-active {
  transition: opacity 300ms ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
}
</style>
