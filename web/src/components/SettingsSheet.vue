<script setup lang="ts">
// 对局设置面板：建房时选择人数与板子，大厅里房主可再改；合法性由 @awalong/shared 的 validateRoles 校验
import { computed, ref, watch } from 'vue'
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_CONFIG,
  RECOMMENDED_ROLES,
  ROLE_NAMES,
  validateRoles,
} from '@awalong/shared'
import type { RoleId, RoomSettings, SpeechMode } from '@awalong/shared'

const props = withDefaults(
  defineProps<{
    open: boolean
    initial: RoomSettings
    mode?: 'create' | 'edit'
    /** 大厅已入座人数：人数不能低于它 */
    seated?: number
  }>(),
  { mode: 'create', seated: 0 },
)

const emit = defineEmits<{
  confirm: [settings: RoomSettings]
  close: []
}>()

type Optional = Extract<RoleId, 'PERCIVAL' | 'MORGANA' | 'MORDRED' | 'OBERON'>
const OPTIONAL_GOOD: Optional[] = ['PERCIVAL']
const OPTIONAL_EVIL: Optional[] = ['MORGANA', 'MORDRED', 'OBERON']
const OPTIONAL_HINT: Record<Optional, string> = {
  PERCIVAL: '看见梅林与莫甘娜',
  MORGANA: '伪装梅林（派西维尔必配）',
  MORDRED: '梅林看不见他',
  OBERON: '与同伴互不相识',
}

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)
const PICK_OPTIONS = [45, 60, 90, 120]
const VOTE_OPTIONS = [20, 30, 45, 60]
const TURN_OPTIONS = [20, 30, 45, 60]

const playerCount = ref(props.initial.playerCount)
const optional = ref<Record<Optional, boolean>>(fromRoles(props.initial.roles))
const allowMarks = ref(props.initial.allowMarks)
const speechMode = ref<SpeechMode>(props.initial.speechMode)
const turnSeconds = ref(props.initial.turnSeconds)
const pickSeconds = ref(props.initial.pickSeconds)
const voteSeconds = ref(props.initial.voteSeconds)
const questSeconds = ref(props.initial.questSeconds)

function fromRoles(roles: readonly RoleId[]): Record<Optional, boolean> {
  return {
    PERCIVAL: roles.includes('PERCIVAL'),
    MORGANA: roles.includes('MORGANA'),
    MORDRED: roles.includes('MORDRED'),
    OBERON: roles.includes('OBERON'),
  }
}

function reset(): void {
  playerCount.value = props.initial.playerCount
  optional.value = fromRoles(props.initial.roles)
  allowMarks.value = props.initial.allowMarks
  speechMode.value = props.initial.speechMode
  turnSeconds.value = props.initial.turnSeconds
  pickSeconds.value = props.initial.pickSeconds
  voteSeconds.value = props.initial.voteSeconds
  questSeconds.value = props.initial.questSeconds
}

watch(
  () => props.open,
  (open) => {
    if (open) reset()
  },
)

/** 按当前人数与勾选拼出板子：梅林/刺客必选，其余用忠臣/爪牙补齐 */
const roles = computed<RoleId[]>(() => {
  const cfg = PLAYER_CONFIG[playerCount.value]
  if (!cfg) return []
  const [goodCount, evilCount] = cfg
  const good: RoleId[] = ['MERLIN', ...OPTIONAL_GOOD.filter((r) => optional.value[r])]
  const evil: RoleId[] = ['ASSASSIN', ...OPTIONAL_EVIL.filter((r) => optional.value[r])]
  while (good.length < goodCount) good.push('LOYAL')
  while (evil.length < evilCount) evil.push('MINION')
  return [...good, ...evil]
})

const config = computed(() => PLAYER_CONFIG[playerCount.value] ?? [0, 0])

const errors = computed(() => {
  const list = validateRoles(playerCount.value, roles.value)
  if (props.mode === 'edit' && playerCount.value < props.seated) list.push(`已有 ${props.seated} 人入座，人数不能更少`)
  return list
})

const summary = computed(() => {
  const counts = new Map<RoleId, number>()
  for (const r of roles.value) counts.set(r, (counts.get(r) ?? 0) + 1)
  return [...counts].map(([r, n]) => (n > 1 ? `${ROLE_NAMES[r]}×${n}` : ROLE_NAMES[r])).join('、')
})

function setCount(n: number): void {
  playerCount.value = n
  optional.value = fromRoles(RECOMMENDED_ROLES[n] ?? [])
}

function useRecommended(): void {
  optional.value = fromRoles(RECOMMENDED_ROLES[playerCount.value] ?? [])
}

function toggle(role: Optional): void {
  optional.value = { ...optional.value, [role]: !optional.value[role] }
}

function confirm(): void {
  if (errors.value.length) return
  emit('confirm', {
    playerCount: playerCount.value,
    roles: roles.value,
    allowMarks: allowMarks.value,
    speechMode: speechMode.value,
    turnSeconds: turnSeconds.value,
    ladyOfLake: false,
    pickSeconds: pickSeconds.value,
    voteSeconds: voteSeconds.value,
    questSeconds: questSeconds.value,
    assassinSeconds: props.initial.assassinSeconds,
  })
}
</script>

<template>
  <div v-if="open" class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" @click.self="emit('close')">
    <div class="sheet__panel">
      <div class="sheet__handle" aria-hidden="true"></div>
      <header class="sheet__head">
        <h2 id="settings-title" class="sheet__title serif">对局设置</h2>
        <button type="button" class="sheet__link" @click="useRecommended">重置为推荐</button>
      </header>

      <div class="sheet__body">
        <section class="block">
          <span class="block__label">人数</span>
          <div class="segment" role="radiogroup" aria-label="人数">
            <button
              v-for="n in COUNTS"
              :key="n"
              type="button"
              class="segment__item"
              :class="{ 'segment__item--on': n === playerCount }"
              role="radio"
              :aria-checked="n === playerCount"
              @click="setCount(n)"
            >
              {{ n }}
            </button>
          </div>
          <span class="block__hint">正义 {{ config[0] }} · 邪恶 {{ config[1] }}</span>
        </section>

        <section class="block">
          <span class="block__label">角色板子</span>
          <div class="roles">
            <div class="roles__col">
              <div class="role role--locked role--good">
                <span class="role__box" aria-hidden="true"></span>
                <span class="role__name">梅林</span>
                <span class="role__tag">必选</span>
              </div>
              <button
                v-for="r in OPTIONAL_GOOD"
                :key="r"
                type="button"
                class="role role--good"
                :class="{ 'role--on': optional[r] }"
                :aria-pressed="optional[r]"
                @click="toggle(r)"
              >
                <span class="role__box" aria-hidden="true"></span>
                <span class="role__name">{{ ROLE_NAMES[r] }}</span>
                <span class="role__hint">{{ OPTIONAL_HINT[r] }}</span>
              </button>
            </div>
            <div class="roles__col">
              <div class="role role--locked role--evil">
                <span class="role__box" aria-hidden="true"></span>
                <span class="role__name">刺客</span>
                <span class="role__tag">必选</span>
              </div>
              <button
                v-for="r in OPTIONAL_EVIL"
                :key="r"
                type="button"
                class="role role--evil"
                :class="{ 'role--on': optional[r] }"
                :aria-pressed="optional[r]"
                @click="toggle(r)"
              >
                <span class="role__box" aria-hidden="true"></span>
                <span class="role__name">{{ ROLE_NAMES[r] }}</span>
                <span class="role__hint">{{ OPTIONAL_HINT[r] }}</span>
              </button>
            </div>
          </div>
          <p v-if="errors.length" class="block__error" role="alert">{{ errors[0] }}</p>
          <p v-else class="block__hint">{{ summary }}</p>
        </section>

        <section class="block block--row">
          <div class="block__text">
            <span class="block__label">允许私人标记</span>
            <span class="block__hint">长按头像记疑好 / 疑坏，仅自己可见</span>
          </div>
          <button
            type="button"
            class="switch"
            :class="{ 'switch--on': allowMarks }"
            role="switch"
            :aria-checked="allowMarks"
            aria-label="允许私人标记"
            @click="allowMarks = !allowMarks"
          >
            <span class="switch__knob"></span>
          </button>
        </section>

        <section class="block">
          <span class="block__label">发言模式</span>
          <div class="segment segment--two" role="radiogroup" aria-label="发言模式">
            <button
              type="button"
              class="segment__item"
              :class="{ 'segment__item--on': speechMode === 'free' }"
              role="radio"
              :aria-checked="speechMode === 'free'"
              @click="speechMode = 'free'"
            >
              自由发言
            </button>
            <button
              type="button"
              class="segment__item"
              :class="{ 'segment__item--on': speechMode === 'turns' }"
              role="radio"
              :aria-checked="speechMode === 'turns'"
              @click="speechMode = 'turns'"
            >
              轮流发言
            </button>
          </div>
          <div v-if="speechMode === 'turns'" class="chips" aria-label="每人发言时长">
            <button
              v-for="s in TURN_OPTIONS"
              :key="s"
              type="button"
              class="chips__item"
              :class="{ 'chips__item--on': s === turnSeconds }"
              @click="turnSeconds = s"
            >
              {{ s }}s / 人
            </button>
          </div>
        </section>

        <section class="block">
          <span class="block__label">限时</span>
          <div class="limits">
            <div class="limit">
              <span class="limit__name">组队</span>
              <div class="chips">
                <button
                  v-for="s in PICK_OPTIONS"
                  :key="s"
                  type="button"
                  class="chips__item"
                  :class="{ 'chips__item--on': s === pickSeconds }"
                  @click="pickSeconds = s"
                >
                  {{ s }}s
                </button>
              </div>
            </div>
            <div class="limit">
              <span class="limit__name">表决</span>
              <div class="chips">
                <button
                  v-for="s in VOTE_OPTIONS"
                  :key="s"
                  type="button"
                  class="chips__item"
                  :class="{ 'chips__item--on': s === voteSeconds }"
                  @click="voteSeconds = s"
                >
                  {{ s }}s
                </button>
              </div>
            </div>
            <div class="limit">
              <span class="limit__name">出票</span>
              <div class="chips">
                <button
                  v-for="s in VOTE_OPTIONS"
                  :key="s"
                  type="button"
                  class="chips__item"
                  :class="{ 'chips__item--on': s === questSeconds }"
                  @click="questSeconds = s"
                >
                  {{ s }}s
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer class="sheet__foot">
        <button type="button" class="btn" :class="errors.length ? 'btn-disabled' : 'btn-primary'" :disabled="errors.length > 0" @click="confirm">
          {{ mode === 'create' ? `创建 ${playerCount} 人房间` : '保存设置' }}
        </button>
        <button type="button" class="sheet__cancel" @click="emit('close')">取消</button>
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
}

.sheet__title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 0.3rem;
}

.sheet__link {
  font-size: 1.2rem;
  color: var(--gold);
}

.sheet__body {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  margin-top: 1.6rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.block--row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.block__text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.block__label {
  font-size: 1.2rem;
  letter-spacing: 0.1rem;
  color: var(--muted);
}

.block__hint {
  font-size: 1.1rem;
  line-height: 1.5;
  color: var(--small);
}

.block__error {
  margin: 0;
  font-size: 1.1rem;
  color: var(--red);
}

.segment {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.6rem;
}

.segment--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.segment__item {
  min-height: 3.6rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--muted);
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
}

.segment__item--on {
  color: var(--gold);
  border-color: var(--gold);
  background: rgba(201, 162, 39, 0.16);
}

.roles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1.2rem;
}

.roles__col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.role {
  display: grid;
  grid-template-columns: 2rem 1fr;
  grid-template-areas:
    'box name'
    'box hint';
  column-gap: 0.8rem;
  align-items: center;
  min-height: 4.4rem;
  padding: 0.6rem 0.8rem;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
  text-align: left;
  transition: border-color 150ms ease;
}

.role--locked {
  opacity: 0.75;
}

.role__box {
  grid-area: box;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: transparent;
  position: relative;
}

.role--on .role__box,
.role--locked .role__box {
  border-color: var(--gold);
  background: var(--gold);
}

.role--locked .role__box {
  border-color: var(--border);
  background: var(--border);
}

.role--on .role__box::after,
.role--locked .role__box::after {
  content: '';
  position: absolute;
  left: 0.6rem;
  top: 0.3rem;
  width: 0.5rem;
  height: 0.9rem;
  border: solid var(--ink);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.role--locked .role__box::after {
  border-color: var(--bg);
}

.role__name {
  grid-area: name;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text);
}

.role__hint,
.role__tag {
  grid-area: hint;
  font-size: 1rem;
  color: var(--small);
}

.role--good.role--on {
  border-color: rgba(76, 141, 255, 0.5);
}

.role--evil.role--on {
  border-color: rgba(214, 69, 69, 0.5);
}

.switch {
  position: relative;
  flex-shrink: 0;
  width: 4.4rem;
  height: 2.4rem;
  border-radius: 1.2rem;
  border: 1px solid var(--border);
  background: transparent;
  transition: background-color 150ms ease, border-color 150ms ease;
}

.switch__knob {
  position: absolute;
  left: 0.3rem;
  top: 0.3rem;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 150ms ease, background-color 150ms ease;
}

.switch--on {
  border-color: var(--gold);
  background: rgba(201, 162, 39, 0.2);
}

.switch--on .switch__knob {
  transform: translateX(2rem);
  background: var(--gold);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.chips__item {
  min-height: 3.2rem;
  padding: 0 1.2rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.2rem;
  color: var(--muted);
  transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
}

.chips__item--on {
  color: var(--gold);
  border-color: var(--gold);
  background: rgba(201, 162, 39, 0.16);
}

.limits {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.limit {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.limit__name {
  flex-shrink: 0;
  width: 3.2rem;
  font-size: 1.2rem;
  color: var(--muted);
}

.sheet__foot {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-top: 2rem;
}

.sheet__cancel {
  min-height: 4.4rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--muted);
}

@media (hover: hover) {
  .segment__item:hover,
  .chips__item:hover,
  .role:not(.role--locked):hover {
    border-color: var(--gold);
  }
}

/* 平板 / PC：居中弹窗 */
@media (min-width: 768px) {
  .sheet {
    align-items: center;
    padding: 2.4rem;
  }

  .sheet__panel {
    max-width: 56rem;
    max-height: 90dvh;
    padding: 2rem 2.8rem 2.8rem;
    border: 1px solid var(--line);
    border-radius: 1.6rem;
  }

  .sheet__handle {
    display: none;
  }

  .sheet__foot {
    flex-direction: row-reverse;
    align-items: center;
  }

  .sheet__foot .btn {
    flex: 1;
  }

  .sheet__cancel {
    padding: 0 2rem;
  }
}
</style>
