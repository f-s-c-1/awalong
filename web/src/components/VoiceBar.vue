<script setup lang="ts">
// 语音入口按钮：未连接时引导「开启语音」（必须由点击触发），连接后为麦克风开关；
// 阶段静音 / 不支持 / 未配置 三种态各有提示。
import { computed } from 'vue'
import { useRoomStore } from '@/stores/room'
import { useVoiceStore } from '@/stores/voice'

const voice = useVoiceStore()
const room = useRoomStore()

type Mode = 'join' | 'on' | 'off' | 'muted' | 'connecting' | 'unsupported' | 'unavailable'

const mode = computed<Mode>(() => {
  if (voice.availability === 'unsupported') return 'unsupported'
  if (voice.availability === 'unavailable') return 'unavailable'
  if (voice.state === 'connecting') return 'connecting'
  if (!voice.connected) return 'join'
  if (!voice.canPublish) return 'muted'
  return voice.micEnabled ? 'on' : 'off'
})

const label = computed(() => {
  switch (mode.value) {
    case 'join':
      return '开启语音'
    case 'connecting':
      return '连接中…'
    case 'on':
      return '麦克风开启'
    case 'off':
      return '麦克风关闭'
    case 'muted':
      return '本阶段静音'
    case 'unsupported':
      return '浏览器不支持语音'
    case 'unavailable':
      return voice.message || '语音未开启'
  }
  return ''
})

const disabled = computed(() =>
  mode.value === 'connecting' || mode.value === 'muted' || mode.value === 'unsupported' || mode.value === 'unavailable',
)

async function onClick(): Promise<void> {
  if (mode.value === 'join') {
    if (room.code) await voice.join(room.code)
    return
  }
  if (mode.value === 'on' || mode.value === 'off') await voice.toggleMic()
}
</script>

<template>
  <div class="vb" :class="`vb--${mode}`">
    <button type="button" class="vb__btn" :aria-label="label" :title="label" :disabled="disabled" @click="onClick">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <rect x="9" y="2.5" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="21.5" />
        <line v-if="mode === 'off' || mode === 'muted' || mode === 'unsupported' || mode === 'unavailable'" x1="5" y1="4" x2="19" y2="20" />
      </svg>
    </button>
    <span v-if="mode === 'join'" class="vb__hint">点击开启语音</span>
    <span v-else-if="!voice.canSubscribe && voice.connected" class="vb__hint">本阶段无法收听</span>
  </div>
</template>

<style scoped>
.vb {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.vb__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.4rem;
  height: 4.4rem;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 200ms ease, color 200ms ease;
}

.vb__btn svg {
  width: 1.8rem;
  height: 1.8rem;
}

.vb--join .vb__btn,
.vb--on .vb__btn {
  border-color: var(--gold);
  color: var(--gold);
}

.vb--muted .vb__btn,
.vb--unsupported .vb__btn,
.vb--unavailable .vb__btn {
  cursor: not-allowed;
  opacity: 0.6;
}

.vb__btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.vb__hint {
  font-size: 1.1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}
</style>
