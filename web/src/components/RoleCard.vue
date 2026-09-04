<script setup lang="ts">
// 身份牌：牌背（点击翻开）→ 3D 翻转 → 牌面（阵营 / 角色 / 说明）+ 私密视野名单
import { computed } from 'vue'
import type { PlayerPublic, SecretInfo } from '@awalong/shared'
import { avatarById } from '@/assets/avatars'
import { ROLE_INTRO, roleName, sideName } from '@/utils/roles'
import AvatarIcon from './AvatarIcon.vue'

const props = withDefaults(
  defineProps<{
    secret: SecretInfo
    players: PlayerPublic[]
    /** 是否已翻开（受控） */
    flipped: boolean
    /** 紧凑模式（长按复看）：牌面略小 */
    compact?: boolean
  }>(),
  { compact: false },
)

const emit = defineEmits<{
  flip: []
}>()

const isGood = computed(() => props.secret.side === 'GOOD')
const intro = computed(() => ROLE_INTRO[props.secret.role])

const visionList = computed(() =>
  props.secret.visionSeats.map((seat) => {
    const p = props.players.find((x) => x.seat === seat)
    return {
      seat,
      nickname: p?.nickname ?? `${seat} 号`,
      avatar: p?.avatar ?? '',
      color: p ? avatarById(p.avatar).color : 'transparent',
    }
  }),
)

function onClick(): void {
  if (!props.flipped) emit('flip')
}
</script>

<template>
  <div
    class="rc"
    :class="{ 'rc--up': flipped, 'rc--good': isGood, 'rc--evil': !isGood, 'rc--compact': compact }"
    data-test="role-card"
    :data-role="secret.role"
    :data-side="secret.side"
    :data-seat="secret.seat"
    :data-face="flipped ? 'up' : 'down'"
  >
    <button
      type="button"
      class="rc__flip"
      :aria-label="flipped ? `你的身份：${roleName(secret.role)}，${sideName(secret.side)}` : '点击翻开身份牌'"
      :disabled="flipped"
      @click="onClick"
    >
      <div class="rc__inner">
        <div class="rc__face rc__back" aria-hidden="true">
          <svg class="rc__emblem" viewBox="0 0 40 60" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <path d="M20 4v44" />
            <path d="M12 16h16" />
            <path d="M20 48l-4 8h8z" fill="currentColor" stroke="none" />
            <circle cx="20" cy="30" r="14" opacity="0.35" />
          </svg>
          <span class="rc__back-text">点击翻开身份牌</span>
        </div>
        <div class="rc__face rc__front">
          <span class="rc__side">{{ sideName(secret.side) }}</span>
          <strong class="rc__role serif">{{ roleName(secret.role) }}</strong>
          <span class="rc__brief">{{ intro.brief }}</span>
          <p class="rc__desc">{{ intro.desc }}</p>
        </div>
      </div>
    </button>

    <Transition name="rc-vision">
      <section v-if="flipped" class="rc__vision" aria-label="夜晚视野">
        <p class="rc__hint">{{ secret.visionHint }}</p>
        <ul v-if="visionList.length" class="rc__list">
          <li v-for="v in visionList" :key="v.seat" class="rc__item" data-test="vision-seat" :data-seat="v.seat">
            <span class="rc__avatar" :style="{ backgroundColor: v.color }">
              <AvatarIcon v-if="v.avatar" class="rc__avatar-icon" :id="v.avatar" />
            </span>
            <span class="rc__item-seat mono">{{ v.seat }}</span>
            <span class="rc__item-name">{{ v.nickname }}</span>
          </li>
        </ul>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.rc {
  --card-w: 20rem;
  --card-h: 28rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  width: 100%;
}

.rc--compact {
  --card-w: 17rem;
  --card-h: 23rem;
  gap: 1.2rem;
}

.rc__flip {
  width: var(--card-w);
  height: var(--card-h);
  perspective: 90rem;
  border-radius: 1.4rem;
  cursor: pointer;
}

.rc__flip:disabled {
  cursor: default;
}

.rc__inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1);
}

.rc--up .rc__inner {
  transform: rotateY(180deg);
}

.rc__face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.6rem;
  border-radius: 1.4rem;
  border: 1px solid var(--gold-line);
  background: var(--surface);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  text-align: center;
}

.rc__back {
  color: var(--gold);
  background:
    radial-gradient(circle at 50% 40%, rgba(201, 162, 39, 0.16), transparent 62%),
    var(--surface);
}

.rc__emblem {
  width: 6rem;
  height: 9rem;
}

.rc__back-text {
  font-size: 1.2rem;
  letter-spacing: 0.3rem;
  color: var(--muted);
}

.rc__front {
  transform: rotateY(180deg);
  border-width: 2px;
}

.rc--good .rc__front {
  border-color: var(--blue);
}

.rc--evil .rc__front {
  border-color: var(--red);
}

.rc__side {
  font-size: 1.2rem;
  letter-spacing: 0.4rem;
}

.rc--good .rc__side {
  color: var(--blue);
}

.rc--evil .rc__side {
  color: var(--red);
}

.rc__role {
  font-size: 3.2rem;
  font-weight: 900;
  letter-spacing: 0.4rem;
  line-height: 1.2;
  color: var(--text);
}

.rc--compact .rc__role {
  font-size: 2.6rem;
}

.rc__brief {
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
}

.rc__desc {
  margin: 0.6rem 0 0;
  font-size: 1.2rem;
  line-height: 1.6;
  color: var(--muted);
}

.rc__vision {
  width: 100%;
  max-width: 34rem;
}

.rc__hint {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.6;
  text-align: center;
  color: var(--muted);
}

.rc__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin: 1.2rem 0 0;
  padding: 0;
  list-style: none;
}

.rc__item {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 3.6rem;
  padding: 0.4rem 1rem 0.4rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 2rem;
  background: var(--surface);
}

.rc__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 50%;
  border: 1px solid var(--line);
}

.rc__avatar-icon {
  width: 1.5rem;
  height: 1.5rem;
}

.rc__item-seat {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--gold);
}

.rc__item-name {
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.3rem;
  color: var(--text);
}

.rc-vision-enter-active {
  transition: opacity 300ms ease 350ms;
}

.rc-vision-enter-from {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .rc__inner {
    transition: none;
  }
}
</style>
