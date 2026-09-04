<script setup lang="ts">
// 二次确认弹层：组队出征 / 刺杀等不可撤销操作前使用；danger 时确认键为红色
withDefaults(
  defineProps<{
    open: boolean
    title: string
    text?: string
    confirmText?: string
    cancelText?: string
    danger?: boolean
  }>(),
  { text: '', confirmText: '确认', cancelText: '取消', danger: false },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Transition name="cd">
    <div v-if="open" class="cd" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('cancel')">
      <div class="cd__panel card">
        <h2 class="cd__title serif">{{ title }}</h2>
        <p v-if="text" class="cd__text">{{ text }}</p>
        <div class="cd__actions">
          <button type="button" class="btn btn-secondary cd__btn" data-test="dialog-cancel" @click="emit('cancel')">
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn btn-primary cd__btn"
            :class="{ 'cd__btn--danger': danger }"
            data-test="dialog-confirm"
            @click="emit('confirm')"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cd {
  position: fixed;
  inset: 0;
  z-index: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.4rem;
  background: rgba(10, 8, 14, 0.7);
}

.cd__panel {
  width: 100%;
  max-width: 34rem;
  padding: 2rem 2rem 1.6rem;
  box-shadow: var(--shadow-card);
}

.cd__title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  color: var(--text);
}

.cd__text {
  margin: 0.8rem 0 0;
  font-size: 1.4rem;
  line-height: 1.6;
  color: var(--muted);
}

.cd__actions {
  display: flex;
  gap: 1rem;
  margin-top: 2rem;
}

.cd__btn {
  height: 4.6rem;
  font-size: 1.5rem;
  letter-spacing: 0.2rem;
}

.cd__btn--danger {
  background: var(--red);
  color: var(--text);
  box-shadow: none;
}

.cd__btn--danger:active {
  background: #b63a3a;
}

.cd-enter-active,
.cd-leave-active {
  transition: opacity 200ms ease;
}

.cd-enter-from,
.cd-leave-to {
  opacity: 0;
}
</style>
