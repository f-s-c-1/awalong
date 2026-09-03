<script setup lang="ts">
// 座位头像：头像圆 + 四角角标插槽（皇冠 / 剑徽 / 序号 / 对勾 / 断线 / 私人标记）
import { computed } from 'vue'
import type { MarkKind } from '@/types/ui'
import { avatarById } from '@/assets/avatars'
import AvatarIcon from './AvatarIcon.vue'

const props = withDefaults(
  defineProps<{
    seat: number
    /** 头像 id（空位可传空串） */
    avatar: string
    nickname?: string
    online?: boolean
    /** 空位 */
    empty?: boolean
    /** 是否本人（名字后缀「· 我」，金色） */
    me?: boolean
    isLeader?: boolean
    /** 被提名：金色描边 + 剑徽 */
    selected?: boolean
    /** 已投票 */
    voted?: boolean
    /** 大厅已准备 */
    ready?: boolean
    mark?: MarkKind
    showName?: boolean
    /** 正在说话：右侧音浪 */
    speaking?: boolean
  }>(),
  {
    nickname: '',
    online: true,
    empty: false,
    me: false,
    isLeader: false,
    selected: false,
    voted: false,
    ready: false,
    mark: undefined,
    showName: true,
    speaking: false,
  },
)

const offline = computed(() => !props.online && !props.empty)

const classes = computed(() => ({
  'sa--offline': offline.value,
  'sa--selected': props.selected,
  'sa--leader': props.isLeader,
  'sa--empty': props.empty,
}))

const circleStyle = computed(() =>
  props.empty ? undefined : { backgroundColor: avatarById(props.avatar).color },
)

const displayName = computed(() => {
  if (props.empty) return `${props.seat} 号空位`
  return props.me ? `${props.nickname} · 我` : props.nickname
})
</script>

<template>
  <div class="sa" :class="classes">
    <div class="sa__wrap">
      <slot name="crown">
        <svg v-if="isLeader" class="sa__crown" viewBox="0 0 20 12" aria-hidden="true">
          <path d="M2 11 L4 3 L8 7 L10 1 L12 7 L16 3 L18 11 Z" />
        </svg>
      </slot>

      <div class="sa__circle" :style="circleStyle">
        <span v-if="empty" class="sa__empty-no serif" aria-hidden="true">{{ seat }}</span>
        <AvatarIcon v-else class="sa__icon" :id="avatar" />
        <div v-if="offline" class="sa__off" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M3 3l18 18" />
            <path d="M5 12.5a10 10 0 0 1 4-2.6M12.5 8a10 10 0 0 1 6.5 4.5" />
            <path d="M8.5 16a5 5 0 0 1 7 0" />
            <circle cx="12" cy="19.5" r="1" fill="currentColor" stroke="none" />
          </svg>
        </div>
      </div>

      <slot name="top-right">
        <span v-if="selected" class="sa__badge sa__badge--sword" aria-hidden="true">
          <svg viewBox="0 0 10 10" fill="none">
            <line x1="5" y1="1" x2="5" y2="8" stroke="#1A1408" stroke-width="1.6" />
            <line x1="2.5" y1="3.5" x2="7.5" y2="3.5" stroke="#1A1408" stroke-width="1.6" />
          </svg>
        </span>
        <span v-else-if="voted || ready" class="sa__badge sa__badge--check" aria-hidden="true">
          <svg viewBox="0 0 10 10" fill="none">
            <path d="M2 5.2 L4.2 7.4 L8 3" stroke="#EDE8F2" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </slot>

      <slot name="top-left">
        <span v-if="mark" class="sa__mark" :class="`sa__mark--${mark}`" aria-hidden="true">
          <svg viewBox="0 0 10 10" fill="none" stroke="#EDE8F2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path v-if="mark === 'good'" d="M2.5 5.2 L4.3 7 L7.5 3.2" />
            <path v-else-if="mark === 'evil'" d="M3 3l4 4M7 3l-4 4" />
            <path v-else d="M3.5 3.8a1.5 1.5 0 1 1 2.2 1.4c-.5.3-.7.6-.7 1.1M5 7.8v.1" />
          </svg>
        </span>
      </slot>

      <slot name="bottom-left">
        <span v-if="!empty" class="sa__no" aria-hidden="true">{{ seat }}</span>
      </slot>

      <slot name="bottom-right" />

      <svg v-if="speaking && !empty" class="sa__wave" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="2.5" cy="7" r="1.5" fill="#C9A227" />
        <path d="M6 3.5a5 5 0 0 1 0 7" stroke="#C9A227" stroke-width="1.4" />
        <path d="M9 1.5a8 8 0 0 1 0 11" stroke="#C9A227" stroke-width="1.4" opacity="0.6" />
      </svg>
    </div>

    <span v-if="showName" class="sa__name" :class="{ 'sa__name--me': me }">{{ displayName }}</span>
  </div>
</template>

<style scoped>
/* 尺寸由父级通过 --seat-size / --seat-name 覆写（大屏放大），默认为手机值 */
.sa {
  --size: var(--seat-size, 4.8rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  width: calc(var(--size) + 0.8rem);
}

.sa__wrap {
  position: relative;
  width: var(--size);
  height: var(--size);
}

.sa__circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  border: 2px solid var(--line);
  color: var(--text);
  overflow: hidden;
  transition: border-color 200ms ease, opacity 200ms ease;
}

.sa--selected .sa__circle,
.sa--leader .sa__circle {
  border-color: var(--gold);
}

.sa--empty .sa__circle {
  border-style: dashed;
  border-color: var(--border);
  background: transparent;
}

.sa__icon {
  width: calc(var(--size) / 2);
  height: calc(var(--size) / 2);
}

.sa__empty-no {
  font-size: calc(var(--size) * 0.38);
  font-weight: 700;
  color: var(--border);
}

/* 断线：压暗 + 图标 */
.sa--offline .sa__circle {
  filter: grayscale(1);
}

.sa__off {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 16, 25, 0.62);
  color: var(--muted);
}

.sa__off svg {
  width: 2rem;
  height: 2rem;
}

.sa__crown {
  position: absolute;
  left: 50%;
  top: -1.5rem;
  width: 2rem;
  height: 1.2rem;
  margin-left: -1rem;
  fill: var(--gold);
}

.sa__badge {
  position: absolute;
  right: -0.5rem;
  top: -0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
}

.sa__badge svg {
  width: 1rem;
  height: 1rem;
}

.sa__badge--sword {
  background: var(--gold);
}

.sa__badge--check {
  background: var(--line);
  border: 1px solid var(--border);
}

.sa__mark {
  position: absolute;
  left: -0.3rem;
  top: -0.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border-radius: 50%;
  border: 1px solid var(--bg);
}

.sa__mark svg {
  width: 1rem;
  height: 1rem;
}

.sa__mark--good {
  background: var(--blue);
}

.sa__mark--evil {
  background: var(--red);
}

.sa__mark--unsure {
  background: var(--border);
}

.sa__no {
  position: absolute;
  left: -0.3rem;
  bottom: -0.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 0.9rem;
  line-height: 1;
  color: var(--muted);
}

.sa__wave {
  position: absolute;
  right: -1.6rem;
  top: 1.6rem;
  width: 1.4rem;
  height: 1.4rem;
  animation: sa-wave 900ms ease-in-out infinite;
}

@keyframes sa-wave {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sa__wave {
    animation: none;
  }
}

.sa__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--seat-name, 1rem);
  line-height: 1.3;
  color: var(--muted);
}

.sa__name--me {
  color: var(--gold);
}

.sa--offline .sa__name {
  opacity: 0.6;
}
</style>
