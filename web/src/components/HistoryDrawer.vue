<script setup lang="ts">
// 战局记录抽屉：轮次 × 座位的表决明细表，行尾为任务结果；进行中的一行金色高亮
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Phase, PlayerPublic, RoundRecord } from '@awalong/shared'
import { avatarById } from '@/assets/avatars'
import AvatarIcon from './AvatarIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    /** 已完成表决的轮次记录（含任务中 / 已结束） */
    history: RoundRecord[]
    /** 本局玩家，按座位升序展示为列 */
    players: PlayerPublic[]
    phase: Phase
    /** 当前任务索引 0-4 */
    questIndex: number
    /** 当前第几次组队 1-5 */
    voteRound: number
    leaderSeat: number
    /** 当前提名队伍（组队中可能为空） */
    currentTeam: number[]
    /** 表决阶段已投票的座位（票未公开） */
    teamVotedSeats: number[]
    /** 我的座位：列头金色标出 */
    mySeat?: number
  }>(),
  { mySeat: undefined },
)

const emit = defineEmits<{
  close: []
}>()

/** 结果列状态：成功 / 失败 / 否决 / 任务中 / 组队中 / 表决中 */
type RowStatus = 'S' | 'F' | 'rejected' | 'quest' | 'picking' | 'voting'

const STATUS_TEXT: Record<RowStatus, string> = {
  S: '成功',
  F: '失败',
  rejected: '否决',
  quest: '任务中',
  picking: '组队中',
  voting: '表决中',
}

/** 盾牌轮廓，与任务进度条一致 */
const SHIELD = 'M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z'

interface Cell {
  seat: number
  leader: boolean
  member: boolean
  /** 公开表决：true 同意 / false 反对 / undefined 未投或未公开 */
  vote: boolean | undefined
  /** 表决进行中已投票（票未公开） */
  voted: boolean
  label: string
}

interface Row {
  /** 「轮-次」标签，如 2-1 */
  label: string
  /** 无障碍朗读用的完整说明 */
  title: string
  status: RowStatus
  failCount?: number
  current: boolean
  cells: Cell[]
}

interface RowSource {
  questIndex: number
  voteRound: number
  leaderSeat: number
  team: number[]
  votes: Record<number, boolean> | null
  votedSeats: number[]
  status: RowStatus
  failCount?: number
  current: boolean
}

const columns = computed(() => [...props.players].sort((a, b) => a.seat - b.seat))

function statusOf(r: RoundRecord): RowStatus {
  if (r.result) return r.result
  return r.approved ? 'quest' : 'rejected'
}

function cellOf(src: RowSource, seat: number): Cell {
  const leader = src.leaderSeat === seat
  const member = src.team.includes(seat)
  const vote = src.votes?.[seat]
  const voted = src.votes === null && src.votedSeats.includes(seat)
  const parts: string[] = []
  if (leader) parts.push('队长')
  if (member) parts.push('队员')
  if (vote === true) parts.push('同意')
  else if (vote === false) parts.push('反对')
  else if (voted) parts.push('已投')
  return { seat, leader, member, vote, voted, label: `${seat} 号：${parts.length ? parts.join('，') : '无'}` }
}

function toRow(src: RowSource): Row {
  return {
    label: `${src.questIndex + 1}-${src.voteRound}`,
    title: `第 ${src.questIndex + 1} 轮第 ${src.voteRound} 次组队`,
    status: src.status,
    failCount: src.failCount,
    current: src.current,
    cells: columns.value.map((p) => cellOf(src, p.seat)),
  }
}

const rows = computed<Row[]>(() => {
  const sources: RowSource[] = props.history.map((r) => ({
    questIndex: r.questIndex,
    voteRound: r.voteRound,
    leaderSeat: r.leaderSeat,
    team: r.team,
    votes: r.teamVotes,
    votedSeats: [],
    status: statusOf(r),
    failCount: r.failCount,
    current: false,
  }))

  const last = sources[sources.length - 1]
  const inProgress = props.phase === 'TEAM_PICK' || props.phase === 'TEAM_VOTE'
  const recorded = last !== undefined && last.questIndex === props.questIndex && last.voteRound === props.voteRound

  if (inProgress && !recorded) {
    // 组队 / 表决进行中：history 尚无本次记录，末尾合成当前行
    sources.push({
      questIndex: props.questIndex,
      voteRound: props.voteRound,
      leaderSeat: props.leaderSeat,
      team: props.currentTeam,
      votes: null,
      votedSeats: props.phase === 'TEAM_VOTE' ? props.teamVotedSeats : [],
      status: props.phase === 'TEAM_PICK' ? 'picking' : 'voting',
      current: true,
    })
  } else if (props.phase === 'QUEST' && last && last.status === 'quest') {
    // 任务出票中：history 最后一条即当前行
    last.current = true
  }

  return sources.map(toRow)
})

/** 失败票注：失败任务始终标注；成功任务仅在含失败票（第 4 轮双失败规则）时标注 */
function failNote(row: Row): string | null {
  if (row.failCount === undefined) return null
  if (row.status === 'F' || (row.status === 'S' && row.failCount > 0)) return `${row.failCount} 张失败票`
  return null
}

function columnLabel(p: PlayerPublic): string {
  return `${p.seat} 号 ${p.nickname}${p.seat === props.mySeat ? '（我）' : ''}`
}

const closeBtn = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      void nextTick(() => closeBtn.value?.focus())
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="drawer">
    <div
      v-if="open"
      class="drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-title"
      @click.self="emit('close')"
    >
      <div class="drawer__panel">
        <div class="drawer__handle" aria-hidden="true"></div>
        <header class="drawer__head">
          <h2 id="history-title" class="drawer__title serif">战局记录</h2>
          <button ref="closeBtn" type="button" class="drawer__close" @click="emit('close')">关闭</button>
        </header>

        <p v-if="rows.length === 0" class="drawer__empty">尚无表决记录</p>

        <div v-else class="drawer__body">
          <table class="log">
            <caption class="sr-only">每轮组队的队长、队员与表决明细，行尾为任务结果</caption>
            <thead>
              <tr>
                <th scope="col" class="log__corner">轮次</th>
                <th
                  v-for="p in columns"
                  :key="p.seat"
                  scope="col"
                  class="log__seat"
                  :class="{ 'log__seat--me': p.seat === mySeat }"
                  :aria-label="columnLabel(p)"
                >
                  <span class="log__avatar" :style="{ backgroundColor: avatarById(p.avatar).color }">
                    <AvatarIcon :id="p.avatar" />
                  </span>
                  <span class="log__no">{{ p.seat }}</span>
                </th>
                <th scope="col" class="log__result-head">结果</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.label"
                :class="{ 'log__row--current': row.current }"
                :aria-current="row.current ? 'true' : undefined"
              >
                <th scope="row" class="log__round mono" :aria-label="row.title">{{ row.label }}</th>

                <td v-for="cell in row.cells" :key="cell.seat" class="log__cell" :aria-label="cell.label">
                  <span class="mark" aria-hidden="true">
                    <span class="mark__role">
                      <svg v-if="cell.leader" class="mark__crown" viewBox="0 0 20 12">
                        <path d="M2 11 L4 3 L8 7 L10 1 L12 7 L16 3 L18 11 Z" />
                      </svg>
                      <svg
                        v-if="cell.member"
                        class="mark__sword"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                      >
                        <path d="M6 1.5v6.5M3 8h6M6 8v2.5" />
                      </svg>
                    </span>
                    <span class="mark__vote">
                      <svg
                        v-if="cell.vote === true"
                        class="mark__yes"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M2 5.2 L4.2 7.4 L8 3" />
                      </svg>
                      <svg
                        v-else-if="cell.vote === false"
                        class="mark__no"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.8"
                        stroke-linecap="round"
                      >
                        <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
                      </svg>
                      <span v-else-if="cell.voted" class="mark__dot"></span>
                    </span>
                  </span>
                </td>

                <td class="log__result" :class="`log__result--${row.status}`">
                  <span class="result">
                    <svg
                      v-if="row.status === 'S' || row.status === 'F'"
                      class="result__shield"
                      viewBox="0 0 40 44"
                      aria-hidden="true"
                    >
                      <path class="result__shape" :d="SHIELD" />
                      <path v-if="row.status === 'S'" class="result__mark" d="M13 21 L18 26 L27 15" />
                      <path v-else class="result__mark" d="M14 15 L26 27 M26 15 L14 27" />
                    </svg>
                    <span class="result__text">
                      {{ STATUS_TEXT[row.status] }}
                      <small v-if="failNote(row)" class="result__note">{{ failNote(row) }}</small>
                    </span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(20, 16, 25, 0.72);
}

.drawer__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 48rem;
  max-height: 66dvh;
  padding: 1.2rem 0 calc(1.6rem + var(--safe-bottom));
  background: var(--surface);
  border-top: 1px solid var(--line);
  border-radius: 1.2rem 1.2rem 0 0;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
}

.drawer__handle {
  flex-shrink: 0;
  width: 3.6rem;
  height: 0.4rem;
  margin: 0 auto 0.8rem;
  border-radius: 0.2rem;
  background: var(--border);
}

.drawer__head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  padding: 0 2rem;
}

.drawer__title {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 0.3rem;
}

.drawer__close {
  min-height: 4.4rem;
  padding: 0 1.2rem;
  margin-right: -1.2rem;
  border-radius: 0.6rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--muted);
  transition: color 150ms ease, background-color 150ms ease;
}

.drawer__close:active {
  background: rgba(255, 255, 255, 0.06);
}

.drawer__empty {
  margin: 3.2rem 2rem;
  text-align: center;
  font-size: 1.3rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

/* 表格滚动容器：纵向随抽屉高度、横向随座位数滚动，页面本身不横滚 */
.drawer__body {
  flex: 1;
  min-height: 0;
  margin: 1.2rem 1.6rem 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--line);
  border-radius: 0.8rem;
}

.log {
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 1.2rem;
}

.log th,
.log td {
  padding: 0.5rem 0.4rem;
  border-bottom: 1px solid var(--line);
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}

.log tbody tr:last-child > th,
.log tbody tr:last-child > td {
  border-bottom: 0;
}

/* 列头吸顶 */
.log thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface);
  font-weight: 400;
  color: var(--small);
}

/* 首列（轮次）吸左 */
.log__corner,
.log__round {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 4.6rem;
  background: var(--surface);
  border-right: 1px solid var(--line);
}

.log__corner {
  z-index: 3;
  font-size: 1rem;
  letter-spacing: 0.1rem;
}

.log__round {
  font-size: 1.3rem;
  font-weight: 400;
  color: var(--muted);
}

.log__seat {
  min-width: 4rem;
}

.log__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  margin: 0 auto 0.3rem;
  border: 1px solid var(--line);
  border-radius: 50%;
  color: var(--text);
  transition: border-color 200ms ease;
}

.log__avatar svg {
  width: 1.3rem;
  height: 1.3rem;
}

.log__no {
  display: block;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--muted);
}

.log__seat--me .log__avatar {
  border-color: var(--gold);
}

.log__seat--me .log__no {
  font-weight: 700;
  color: var(--gold);
}

.log__cell {
  min-width: 4rem;
  height: 4.4rem;
}

.log__result-head,
.log__result {
  min-width: 7.6rem;
  padding-left: 0.8rem;
  text-align: left;
}

/* 进行中的一行：淡金底 + 首列金色竖条；首列为吸附列，需用不透明底色 */
.log__row--current > td {
  background: rgba(201, 162, 39, 0.08);
}

.log__row--current > .log__round {
  background: linear-gradient(rgba(201, 162, 39, 0.08), rgba(201, 162, 39, 0.08)), var(--surface);
  box-shadow: inset 0.3rem 0 0 var(--gold);
  color: var(--gold);
}

/* 单元格：上半队长皇冠 / 队员剑徽，下半同意 / 反对 / 已投 */
.mark {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.mark__role {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  height: 1.2rem;
  color: var(--gold);
}

.mark__crown {
  width: 1.6rem;
  height: 1rem;
  fill: var(--gold);
}

.mark__sword {
  width: 1.2rem;
  height: 1.2rem;
}

.mark__vote {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.4rem;
}

.mark__yes {
  width: 1.4rem;
  height: 1.4rem;
  color: var(--blue);
}

.mark__no {
  width: 1.4rem;
  height: 1.4rem;
  color: var(--red);
}

.mark__dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--muted);
}

/* 结果列：蓝盾成功 / 红盾失败 / 否决灰字 / 进行中金字 */
.result {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}

.result__shield {
  flex-shrink: 0;
  width: 1.8rem;
  height: 2rem;
}

.result__shape {
  fill: var(--border);
}

.log__result--S .result__shape {
  fill: var(--blue);
}

.log__result--F .result__shape {
  fill: var(--red);
}

.result__mark {
  fill: none;
  stroke: var(--text);
  stroke-width: 3;
}

.result__text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  color: var(--muted);
}

.log__result--S .result__text {
  font-weight: 600;
  color: var(--blue);
}

.log__result--F .result__text {
  font-weight: 600;
  color: var(--red);
}

.log__result--rejected .result__text {
  color: var(--small);
}

.log__result--quest .result__text,
.log__result--picking .result__text,
.log__result--voting .result__text {
  color: var(--gold);
}

.result__note {
  font-size: 1rem;
  font-weight: 400;
  color: var(--small);
}

/* 出入场：遮罩渐显 + 面板轻微上浮 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 200ms ease;
}

.drawer-enter-active .drawer__panel,
.drawer-leave-active .drawer__panel {
  transition: transform 240ms ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer__panel,
.drawer-leave-to .drawer__panel {
  transform: translateY(2rem);
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active .drawer__panel,
  .drawer-leave-active .drawer__panel {
    transition: none;
  }

  .drawer-enter-from .drawer__panel,
  .drawer-leave-to .drawer__panel {
    transform: none;
  }
}

@media (hover: hover) {
  .drawer__close:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
  }
}

/* 平板 / PC：面板加宽以容纳 10 列，仍贴底展示 */
@media (min-width: 768px) {
  .drawer__panel {
    max-width: 72rem;
    border: 1px solid var(--line);
    border-bottom: 0;
  }

  .drawer__handle {
    display: none;
  }

  .drawer__head {
    padding: 0.4rem 2.4rem 0;
  }

  .drawer__body {
    margin: 1.6rem 2.4rem 0;
  }
}
</style>
