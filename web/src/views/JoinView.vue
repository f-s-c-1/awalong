<script setup lang="ts">
// 输入房间码：6 位数字框 + 自绘数字键盘，支持粘贴识别与物理键盘；查询房间无需登录
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '@/services/api'

const CODE_LENGTH = 6

const router = useRouter()

const digits = ref('')
const checking = ref(false)
const error = ref('')

const slots = Array.from({ length: CODE_LENGTH }, (_, i) => i)
const keys: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del']

const full = computed(() => digits.value.length === CODE_LENGTH)

function keyLabel(key: string): string {
  if (key === 'clear') return '清空'
  if (key === 'del') return '删除'
  return key
}

function append(d: string): void {
  if (checking.value || full.value) return
  error.value = ''
  digits.value += d
  if (digits.value.length === CODE_LENGTH) void submit()
}

function backspace(): void {
  if (checking.value) return
  error.value = ''
  digits.value = digits.value.slice(0, -1)
}

function clear(): void {
  if (checking.value) return
  error.value = ''
  digits.value = ''
}

function press(key: string): void {
  if (key === 'clear') clear()
  else if (key === 'del') backspace()
  else append(key)
}

function applyPasted(text: string): boolean {
  const match = text.match(/\d{6}/)
  if (!match) return false
  digits.value = match[0]
  error.value = ''
  void submit()
  return true
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (!applyPasted(text)) error.value = '剪贴板中没有 6 位房间码'
  } catch {
    error.value = '无法读取剪贴板，请手动输入'
  }
}

async function submit(): Promise<void> {
  if (!full.value || checking.value) return
  const code = digits.value
  checking.value = true
  error.value = ''
  try {
    const info = await api.getRoom(code)
    if (info.status === 'CLOSED') {
      error.value = '房间已解散'
      return
    }
    // 昵称 / 头像未设置时由路由守卫转到引导页，完成后自动回到房间
    await router.push(`/r/${code}`)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error.value = '房间不存在，请核对房间码'
    else if (err instanceof ApiError) error.value = err.message
    else error.value = '加入失败，请稍后再试'
  } finally {
    checking.value = false
  }
}

function onKeydown(ev: KeyboardEvent): void {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return
  if (/^\d$/.test(ev.key)) {
    ev.preventDefault()
    append(ev.key)
  } else if (ev.key === 'Backspace') {
    ev.preventDefault()
    backspace()
  } else if (ev.key === 'Escape') {
    clear()
  } else if (ev.key === 'Enter') {
    void submit()
  }
}

function onPaste(ev: ClipboardEvent): void {
  const text = ev.clipboardData?.getData('text') ?? ''
  if (applyPasted(text)) ev.preventDefault()
}

function back(): void {
  if (window.history.length > 1) router.back()
  else void router.replace('/')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  document.addEventListener('paste', onPaste)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('paste', onPaste)
})
</script>

<template>
  <main class="page join">
    <header class="join__head">
      <button type="button" class="icon-btn" aria-label="返回" @click="back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <h1 class="join__title serif">输入房间码</h1>
    </header>

    <p class="join__hint">向房主索要 6 位房间码，或直接打开分享链接</p>

    <div class="join__boxes" role="group" aria-label="房间码">
      <span
        v-for="i in slots"
        :key="i"
        class="join__box mono"
        :class="{
          'join__box--filled': digits[i] !== undefined,
          'join__box--active': digits.length === i && !checking,
        }"
      >
        {{ digits[i] ?? '' }}
      </span>
    </div>
    <p class="sr-only" aria-live="polite">已输入 {{ digits.length }} 位</p>

    <p v-if="error" class="error-text join__status" role="alert">{{ error }}</p>
    <p v-else-if="checking" class="join__status" aria-live="polite">正在查询房间…</p>
    <p v-else class="join__status join__status--empty" aria-hidden="true"></p>

    <div class="keypad" role="group" aria-label="数字键盘">
      <button
        v-for="key in keys"
        :key="key"
        type="button"
        class="keypad__key"
        :class="{ 'keypad__key--fn': key === 'clear' || key === 'del' }"
        :aria-label="keyLabel(key)"
        :disabled="checking"
        @click="press(key)"
      >
        <svg v-if="key === 'del'" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-5-7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          <path d="M12 9l6 6M18 9l-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span v-else>{{ keyLabel(key) }}</span>
      </button>
    </div>

    <button type="button" class="join__paste" :disabled="checking" @click="pasteFromClipboard">
      粘贴房间码
    </button>
  </main>
</template>

<style scoped>
.join__head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: -1.1rem;
}

.join__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.4rem;
}

.join__hint {
  margin: 2rem 0 0;
  font-size: 1.3rem;
  color: var(--muted);
}

.join__boxes {
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-top: 3.2rem;
}

.join__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.6rem;
  height: 5.6rem;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  background: var(--surface);
  font-size: 2.6rem;
  font-weight: 700;
  color: var(--text);
  transition: border-color 200ms ease;
}

.join__box--filled {
  border-color: var(--gold-line);
}

.join__box--active {
  border-color: var(--gold);
}

.join__status {
  min-height: 2.2rem;
  margin: 1.6rem 0 0;
  text-align: center;
  font-size: 1.3rem;
  color: var(--muted);
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: auto;
  padding-top: 2.4rem;
}

.keypad__key {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 5.6rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  background: var(--surface);
  font-size: 2.2rem;
  font-weight: 600;
  color: var(--text);
  transition: background-color 150ms ease, border-color 150ms ease;
}

.keypad__key:active {
  background: var(--line);
}

.keypad__key--fn {
  font-size: 1.4rem;
  font-weight: 500;
  color: var(--muted);
}

.keypad__key:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.join__paste {
  align-self: center;
  min-height: 4.4rem;
  margin-top: 1.2rem;
  padding: 0 1.2rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
}

.join__paste:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
