<script setup lang="ts">
// 私人标记底部面板：疑好 / 疑坏 / 存疑 三选一 + 备注，仅本机可见；数据读写由调用方通过 marks store 完成
import { computed, ref, useId, watch } from 'vue'
import type { MarkKind } from '@/types/ui'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 正在标记的座位 */
    seat: number | null
    nickname: string
    /** 已有标记，用于回填 */
    initial?: { mark: MarkKind; note: string } | null
    noteMax?: number
  }>(),
  { initial: null, noteMax: 20 },
)

const emit = defineEmits<{
  save: [mark: MarkKind, note: string]
  clear: []
  close: []
}>()

interface KindOption {
  id: MarkKind
  name: string
  /** 与 SeatAvatar 左上角小色标相同的图形 */
  path: string
}

const KINDS: KindOption[] = [
  { id: 'good', name: '疑好', path: 'M2.5 5.2 L4.3 7 L7.5 3.2' },
  { id: 'evil', name: '疑坏', path: 'M3 3l4 4M7 3l-4 4' },
  { id: 'unsure', name: '存疑', path: 'M3.5 3.8a1.5 1.5 0 1 1 2.2 1.4c-.5.3-.7.6-.7 1.1M5 7.8v.1' },
]

const titleId = useId()
const noteId = useId()

const mark = ref<MarkKind | null>(null)
const note = ref('')

function reset(): void {
  mark.value = props.initial?.mark ?? null
  note.value = props.initial?.note ?? ''
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
  { immediate: true },
)

const title = computed(() => (props.seat === null ? '私人标记' : `标记 ${props.seat} 号 · ${props.nickname}`))

/** 备注长度与 marks store 一致按字符数计（maxlength 同样按此计数） */
const noteLength = computed(() => note.value.length)

const canSave = computed(() => mark.value !== null)

function save(): void {
  if (mark.value === null) return
  emit('save', mark.value, note.value.trim())
}
</script>

<template>
  <div
    v-if="open"
    class="sheet"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="sheet__panel">
      <div class="sheet__handle" aria-hidden="true"></div>
      <header class="sheet__head">
        <h2 :id="titleId" class="sheet__title serif">{{ title }}</h2>
        <button type="button" class="icon-btn sheet__close" aria-label="关闭" @click="emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </header>

      <div class="sheet__body">
        <div class="kinds" role="radiogroup" aria-label="标记类型">
          <button
            v-for="k in KINDS"
            :key="k.id"
            type="button"
            class="kind"
            :class="[`kind--${k.id}`, { 'kind--on': mark === k.id }]"
            role="radio"
            :aria-checked="mark === k.id"
            @click="mark = k.id"
          >
            <span class="kind__icon" aria-hidden="true">
              <svg viewBox="0 0 10 10" fill="none" stroke="#EDE8F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path :d="k.path" />
              </svg>
            </span>
            <span class="kind__name">{{ k.name }}</span>
          </button>
        </div>

        <div class="note">
          <label :for="noteId" class="note__label">备注</label>
          <div class="note__field">
            <input
              :id="noteId"
              v-model="note"
              class="note__input"
              type="text"
              :maxlength="noteMax"
              placeholder="可选，仅自己可见"
              autocomplete="off"
              enterkeyhint="done"
              @keydown.enter.prevent="save"
            />
            <span class="note__count mono" aria-live="polite">{{ noteLength }}/{{ noteMax }}</span>
          </div>
        </div>
      </div>

      <footer class="sheet__foot">
        <button v-if="initial" type="button" class="btn btn-secondary sheet__clear" @click="emit('clear')">清除</button>
        <button type="button" class="btn" :class="canSave ? 'btn-primary' : 'btn-disabled'" :disabled="!canSave" @click="save">
          保存
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.sheet {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(20, 16, 25, 0.72);
}

.sheet__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 48rem;
  max-height: 92dvh;
  padding: 1.2rem 2rem calc(2rem + var(--safe-bottom));
  background: var(--surface);
  border-top: 1px solid var(--line);
  border-radius: 1.6rem 1.6rem 0 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
}

.sheet__handle {
  width: 3.6rem;
  height: 0.4rem;
  margin: 0 auto 1.2rem;
  border-radius: 0.2rem;
  background: var(--border);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
}

.sheet__title {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 0.3rem;
}

.sheet__close {
  flex-shrink: 0;
  margin-right: -1rem;
}

.sheet__close svg {
  width: 2rem;
  height: 2rem;
}

.sheet__body {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-top: 1.6rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 三选一：图标与头像角标同色，选中态描边高亮 */
.kinds {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}

.kind {
  --kind-color: var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  min-height: 8rem;
  padding: 1.2rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  color: var(--muted);
  transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease;
}

.kind--good {
  --kind-color: var(--blue);
}

.kind--evil {
  --kind-color: var(--red);
}

.kind--unsure {
  --kind-color: var(--border);
}

.kind__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.2rem;
  height: 3.2rem;
  border-radius: 50%;
  background: var(--kind-color);
  border: 1px solid var(--bg);
}

.kind__icon svg {
  width: 2.2rem;
  height: 2.2rem;
}

.kind__name {
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.2rem;
}

.kind--on {
  color: var(--text);
  border-color: var(--kind-color);
  box-shadow: inset 0 0 0 1px var(--kind-color);
}

.kind--good.kind--on {
  background: rgba(76, 141, 255, 0.12);
}

.kind--evil.kind--on {
  background: rgba(214, 69, 69, 0.12);
}

.kind--unsure.kind--on {
  background: rgba(92, 81, 117, 0.24);
}

.note {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.note__label {
  font-size: 1.2rem;
  letter-spacing: 0.1rem;
  color: var(--muted);
}

.note__field {
  position: relative;
}

.note__input {
  width: 100%;
  height: 4.4rem;
  padding: 0 6rem 0 1.2rem;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  background: var(--bg);
  font-size: 1.4rem;
  transition: border-color 150ms ease;
}

.note__input::placeholder {
  color: var(--small);
}

.note__input:focus {
  border-color: var(--gold);
  outline: none;
}

.note__count {
  position: absolute;
  right: 1.2rem;
  bottom: 0;
  line-height: 4.4rem;
  font-size: 1.1rem;
  color: var(--small);
  pointer-events: none;
}

.sheet__foot {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-top: 2rem;
}

/* 有旧标记时「清除」排在「保存」之后，主操作靠上 */
.sheet__clear {
  order: 1;
}

@media (hover: hover) {
  .kind:hover {
    border-color: var(--kind-color);
  }
}

/* 平板 / PC：居中弹窗，按钮横排 */
@media (min-width: 768px) {
  .sheet {
    align-items: center;
    padding: 2.4rem;
  }

  .sheet__panel {
    max-width: 48rem;
    max-height: 90dvh;
    padding: 2rem 2.8rem 2.8rem;
    border: 1px solid var(--line);
    border-radius: 1.6rem;
  }

  .sheet__handle {
    display: none;
  }

  .sheet__foot {
    flex-direction: row;
  }

  .sheet__clear {
    order: 0;
    flex: 0 0 12rem;
  }

  .sheet__foot .btn-primary,
  .sheet__foot .btn-disabled {
    flex: 1;
  }
}
</style>
