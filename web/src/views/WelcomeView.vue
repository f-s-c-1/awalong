<script setup lang="ts">
// 首次进入：设置昵称 + 选择预设头像（字符串 id），保存后跳回来源页
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AVATARS, isAvatarId } from '@/assets/avatars'
import AvatarIcon from '@/components/AvatarIcon.vue'
import SeatAvatar from '@/components/SeatAvatar.vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const route = useRoute()
const user = useUserStore()

const nickname = ref(user.nickname)
const avatar = ref(isAvatarId(user.avatar) ? user.avatar : '')

const COLUMNS = 4

const trimmed = computed(() => nickname.value.trim())
const valid = computed(
  () =>
    trimmed.value.length > 0 && trimmed.value.length <= user.nicknameMax && isAvatarId(avatar.value),
)

const selectedIndex = computed(() => AVATARS.findIndex((a) => a.id === avatar.value))

const redirect = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/'
})

function pick(id: string): void {
  avatar.value = id
}

/** 头像网格按单选组处理：方向键移动，只有当前项可 Tab 到达 */
function onGridKeydown(ev: KeyboardEvent): void {
  const total = AVATARS.length
  const current = selectedIndex.value >= 0 ? selectedIndex.value : 0
  let next: number | null = null
  if (ev.key === 'ArrowRight') next = (current + 1) % total
  else if (ev.key === 'ArrowLeft') next = (current - 1 + total) % total
  else if (ev.key === 'ArrowDown') next = (current + COLUMNS) % total
  else if (ev.key === 'ArrowUp') next = (current - COLUMNS + total) % total
  if (next === null) return
  ev.preventDefault()
  const def = AVATARS[next]
  if (!def) return
  avatar.value = def.id
  const el = (ev.currentTarget as HTMLElement).querySelector<HTMLElement>(`[data-id="${def.id}"]`)
  el?.focus()
}

function isTabbable(index: number): boolean {
  return selectedIndex.value >= 0 ? selectedIndex.value === index : index === 0
}

function save(): void {
  if (!valid.value) return
  user.setProfile(trimmed.value, avatar.value)
  void router.replace(redirect.value)
}

function back(): void {
  if (window.history.length > 1) router.back()
  else void router.replace('/')
}
</script>

<template>
  <main class="page page--narrow welcome">
    <header class="welcome__head">
      <button type="button" class="icon-btn" aria-label="返回" @click="back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <h1 class="welcome__title serif">设定你的名号</h1>
    </header>

    <form class="welcome__form" @submit.prevent="save">
      <label class="field">
        <span class="field__label">昵称</span>
        <input
          v-model="nickname"
          class="field__input"
          type="text"
          :maxlength="user.nicknameMax"
          autocomplete="nickname"
          enterkeyhint="done"
          :placeholder="`1-${user.nicknameMax} 个字符`"
          required
        />
        <span class="field__hint">{{ trimmed.length }} / {{ user.nicknameMax }}</span>
      </label>

      <div class="avatars">
        <span id="avatar-label" class="field__label">头像</span>
        <div
          class="avatars__grid"
          role="radiogroup"
          aria-labelledby="avatar-label"
          @keydown="onGridKeydown"
        >
          <button
            v-for="(a, i) in AVATARS"
            :key="a.id"
            type="button"
            role="radio"
            class="avatars__item"
            :class="{ 'avatars__item--active': avatar === a.id }"
            :style="{ backgroundColor: a.color }"
            :aria-checked="avatar === a.id"
            :aria-label="a.name"
            :tabindex="isTabbable(i) ? 0 : -1"
            :data-id="a.id"
            @click="pick(a.id)"
          >
            <AvatarIcon :id="a.id" class="avatars__icon" />
          </button>
        </div>
      </div>

      <div class="welcome__preview" aria-label="预览">
        <SeatAvatar
          :seat="1"
          :avatar="avatar"
          :nickname="trimmed || '未命名'"
          :empty="!avatar"
          :me="!!avatar"
        />
      </div>

      <button
        type="submit"
        class="btn"
        :class="valid ? 'btn-primary' : 'btn-disabled'"
        :disabled="!valid"
      >
        保存并继续
      </button>
    </form>
  </main>
</template>

<style scoped>
.welcome__head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: -1.1rem;
}

.welcome__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.4rem;
}

.welcome__form {
  display: flex;
  flex-direction: column;
  gap: 2.4rem;
  margin-top: 2.8rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.field__label {
  font-size: 1.2rem;
  letter-spacing: 0.3rem;
  color: var(--small);
}

.field__input {
  width: 100%;
  height: 4.8rem;
  padding: 0 1.4rem;
  border: 1px solid var(--border);
  border-radius: 0.8rem;
  background: var(--surface);
  color: var(--text);
  font-size: 1.6rem;
  outline: none;
  transition: border-color 200ms ease;
}

.field__input::placeholder {
  color: var(--small);
}

.field__input:focus {
  border-color: var(--gold);
}

.field__hint {
  align-self: flex-end;
  font-size: 1.1rem;
  color: var(--small);
}

.avatars {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.avatars__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.2rem;
}

.avatars__item {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  min-height: 5.6rem;
  border-radius: 50%;
  border: 2px solid transparent;
  color: var(--text);
  transition: border-color 200ms ease, opacity 200ms ease;
}

.avatars__item--active {
  border-color: var(--gold);
  box-shadow: var(--shadow-gold);
}

.avatars__icon {
  width: 2.8rem;
  height: 2.8rem;
}

.welcome__preview {
  display: flex;
  justify-content: center;
  padding: 1.6rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.welcome__form > .btn {
  margin-top: auto;
}

/* 鼠标悬停头像：描边变金（触屏不受影响） */
@media (hover: hover) {
  .avatars__item {
    transition-duration: 150ms;
  }

  .avatars__item:hover {
    border-color: var(--gold);
  }
}

/* 平板 / PC ≥768px：居中 56rem 单列（由 .page--narrow 提供）；头像网格保持 4 列（与方向键导航一致），限定单格尺寸 */
@media (min-width: 768px) {
  .welcome__title {
    font-size: 2.4rem;
  }

  .avatars__grid {
    grid-template-columns: repeat(4, 7.2rem);
    gap: 1.6rem;
    justify-content: center;
  }

  .avatars__icon {
    width: 3.2rem;
    height: 3.2rem;
  }

  .field__hint {
    font-size: 1.2rem;
  }
}

/* 桌面 ≥1024px：头像单格放大铺满内容列（仍保持 4 列，方向键导航逻辑不变） */
@media (min-width: 1024px) {
  .avatars__grid {
    grid-template-columns: repeat(4, 9.6rem);
    gap: 2rem 3.2rem;
  }

  .avatars__icon {
    width: 4.4rem;
    height: 4.4rem;
  }
}
</style>
