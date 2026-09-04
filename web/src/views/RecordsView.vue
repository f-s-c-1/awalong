<script setup lang="ts">
// 我的战绩：统计卡 + 对局列表（offset 分页）；展开某一局显示全员身份，复盘时间线复用战局记录抽屉
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { sideOf } from '@awalong/shared'
import type {
  MatchListItem,
  MatchRecord,
  MatchStats,
  PlayerPublic,
  RoleId,
  Side,
} from '@awalong/shared'
import HistoryDrawer from '@/components/HistoryDrawer.vue'
import SeatAvatar from '@/components/SeatAvatar.vue'
import { api, ApiError } from '@/services/api'
import { useUserStore } from '@/stores/user'
import { roleName, winReasonText } from '@/utils/roles'

const PAGE_SIZE = 30

const router = useRouter()
const user = useUserStore()

const items = ref<MatchListItem[]>([])
const total = ref(0)
const stats = ref<MatchStats | null>(null)
/** 首屏加载中 */
const loading = ref(false)
/** 「加载更多」进行中 */
const loadingMore = ref(false)
const error = ref('')
/** 凭证已失效：引导重新进入 */
const authLost = ref(false)

const hasMore = computed(() => items.value.length < total.value)

/** 当前展开的对局（同时只展开一局） */
const expandedId = ref<string | null>(null)
/** 已拉取的对局详情缓存 */
const records = ref<Record<string, MatchRecord>>({})
const detailLoading = ref<string | null>(null)
const detailError = ref('')

/** 复盘抽屉：关闭时保留 id，让离场过渡期间表格内容不闪空 */
const timelineOpen = ref(false)
const timelineId = ref<string | null>(null)

async function load(more = false): Promise<void> {
  if (loading.value || loadingMore.value) return
  if (more) loadingMore.value = true
  else loading.value = true
  error.value = ''
  authLost.value = false
  try {
    await user.ensureAuth()
    const offset = more ? items.value.length : 0
    const res = await api.myMatches(PAGE_SIZE, offset, user.currentProfile)
    total.value = res.total
    stats.value = res.stats
    if (more) {
      // 翻页期间可能有新对局结束导致偏移，按 id 去重
      const seen = new Set(items.value.map((i) => i.id))
      items.value = [...items.value, ...res.items.filter((i) => !seen.has(i.id))]
    } else {
      items.value = res.items
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      authLost.value = true
      error.value = '登录已失效，请重新进入'
    } else {
      error.value = err instanceof ApiError ? err.message : '加载失败，请稍后再试'
    }
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

/** 统计卡里的分项：局数为 0 的行不显示 */
interface StatRow {
  label: string
  hit: number
  games: number
  note: string
}

const statRows = computed<StatRow[]>(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '正义方', hit: s.goodWins, games: s.goodGames, note: `${s.goodGames} 局胜 ${s.goodWins} 局` },
    { label: '邪恶方', hit: s.evilWins, games: s.evilGames, note: `${s.evilGames} 局胜 ${s.evilWins} 局` },
    {
      label: '梅林存活',
      hit: s.merlinSurvived,
      games: s.asMerlin,
      note: `${s.asMerlin} 局梅林中 ${s.merlinSurvived} 局存活`,
    },
    {
      label: '刺客命中',
      hit: s.assassinHits,
      games: s.asAssassin,
      note: `${s.asAssassin} 局刺客中 ${s.assassinHits} 局命中`,
    },
  ].filter((r) => r.games > 0)
})

const winRate = computed(() => {
  const s = stats.value
  if (!s || s.games === 0) return '—'
  return `${Math.round((s.wins / s.games) * 100)}%`
})

const pad = (n: number): string => String(n).padStart(2, '0')

/** 本地时区，如 09-04 12:03；非当年补年份 */
function formatTime(ts: number): string {
  const d = new Date(ts)
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}-${md}`
}

function resultTag(item: MatchListItem): string {
  if (item.winner === null) return '作废'
  return item.won ? '胜' : '负'
}

function sideClass(prefix: string, side: Side | null): string {
  if (side === 'GOOD') return `${prefix}--good`
  if (side === 'EVIL') return `${prefix}--evil`
  return ''
}

async function loadDetail(id: string): Promise<void> {
  detailLoading.value = id
  detailError.value = ''
  try {
    const rec = await api.getMatch(id, user.currentProfile)
    records.value = { ...records.value, [id]: rec }
  } catch (err) {
    if (err instanceof ApiError && err.code === 'MATCH_NOT_FOUND') {
      detailError.value = '这局记录已不存在'
    } else {
      detailError.value = err instanceof ApiError ? err.message : '加载失败，请稍后再试'
    }
  } finally {
    if (detailLoading.value === id) detailLoading.value = null
  }
}

async function toggle(item: MatchListItem): Promise<void> {
  if (expandedId.value === item.id) {
    expandedId.value = null
    return
  }
  expandedId.value = item.id
  detailError.value = ''
  if (!records.value[item.id]) await loadDetail(item.id)
}

interface RevealRow {
  seat: number
  nickname: string
  avatar: string
  role: RoleId | undefined
  side: Side | null
  me: boolean
  /** 被刺目标标注：与结算页一致 */
  hitTag: '被刺中' | '被误刺' | null
}

/** 展开局的身份名单：座位升序，身份来自 roles，昵称 / 头像来自玩家表 */
const expanded = computed(() => {
  const id = expandedId.value
  if (!id) return null
  const item = items.value.find((i) => i.id === id)
  const rec = records.value[id]
  if (!item || !rec) return null
  const merlinEntry = Object.entries(rec.roles).find(([, role]) => role === 'MERLIN')
  const merlinSeat = merlinEntry ? Number(merlinEntry[0]) : null
  const rows: RevealRow[] = [...rec.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const role = rec.roles[p.seat]
      const hitTag =
        rec.assassinTarget === p.seat ? (merlinSeat === p.seat ? '被刺中' : '被误刺') : null
      return {
        seat: p.seat,
        nickname: p.nickname,
        avatar: p.avatar,
        role,
        side: role ? sideOf(role) : null,
        me: p.seat === item.mySeat,
        hitTag,
      }
    })
  return { item, rec, rows }
})

/** 复盘抽屉的只读快照：阶段固定为已结束，轮次取时间线最后一条 */
const timeline = computed(() => {
  const id = timelineId.value
  const rec = id ? records.value[id] : undefined
  const item = id ? items.value.find((i) => i.id === id) : undefined
  const history = rec?.history ?? []
  const last = history[history.length - 1]
  const players: PlayerPublic[] = (rec?.players ?? []).map((p) => ({ ...p, online: true }))
  return {
    history,
    players,
    questIndex: last?.questIndex ?? 0,
    voteRound: last?.voteRound ?? 1,
    leaderSeat: last?.leaderSeat ?? 1,
    mySeat: item?.mySeat,
  }
})

function openTimeline(id: string): void {
  timelineId.value = id
  timelineOpen.value = true
}

function back(): void {
  if (window.history.length > 1) router.back()
  else void router.replace('/')
}

function reenter(): void {
  void router.replace({ path: '/welcome', query: { redirect: '/records' } })
}

onMounted(() => {
  void load()
})
</script>

<template>
  <main class="page page--narrow records">
    <header class="records__head">
      <button type="button" class="icon-btn" aria-label="返回" @click="back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <h1 class="records__title serif">我的战绩</h1>
    </header>

    <p v-if="loading" class="records__state" role="status" aria-live="polite">加载中…</p>

    <div v-else-if="error && items.length === 0" class="records__state" role="alert">
      <p class="error-text">{{ error }}</p>
      <button v-if="authLost" type="button" class="btn btn-secondary records__retry" @click="reenter">
        重新进入
      </button>
      <button v-else type="button" class="btn btn-secondary records__retry" @click="load()">重试</button>
    </div>

    <template v-else>
      <section v-if="stats && stats.games > 0" class="stats card" aria-labelledby="stats-title" data-test="records-stats">
        <h2 id="stats-title" class="sr-only">战绩统计</h2>
        <dl class="stats__main">
          <div class="stats__cell">
            <dt>总局数</dt>
            <dd class="mono">{{ stats.games }}</dd>
          </div>
          <div class="stats__cell">
            <dt>胜场</dt>
            <dd class="mono">{{ stats.wins }}</dd>
          </div>
          <div class="stats__cell">
            <dt>胜率</dt>
            <dd class="mono">{{ winRate }}</dd>
          </div>
        </dl>
        <dl v-if="statRows.length" class="stats__rows">
          <div v-for="row in statRows" :key="row.label" class="stats__row">
            <dt>{{ row.label }}</dt>
            <dd class="mono" :aria-label="row.note">{{ row.hit }} / {{ row.games }}</dd>
          </div>
        </dl>
      </section>

      <section class="records__section" aria-labelledby="list-title">
        <h2 id="list-title" class="section-title">对局记录</h2>

        <div v-if="items.length === 0" class="records__empty">
          <p class="records__empty-text">还没有战绩，先来一局吧</p>
          <RouterLink class="records__link" to="/">回到首页</RouterLink>
        </div>

        <ul v-else class="records__list">
          <li
            v-for="item in items"
            data-test="record-item"
            :key="item.id"
            class="match card"
            :class="{ 'match--open': expandedId === item.id }"
          >
            <button
              type="button"
              class="match__head"
              :aria-expanded="expandedId === item.id"
              :aria-controls="`match-${item.id}`"
              @click="toggle(item)"
            >
              <span class="match__meta">
                <span class="match__time mono">{{ formatTime(item.endedAt) }}</span>
                <span class="match__count">{{ item.playerCount }} 人</span>
                <span
                  class="match__tag"
                  :class="{ 'match__tag--win': item.won && item.winner !== null }"
                >
                  {{ resultTag(item) }}
                </span>
              </span>
              <span class="match__line">
                <span class="match__role" :class="sideClass('match__role', item.mySide)">
                  {{ item.mySeat }} 号 · {{ roleName(item.myRole) }}
                </span>
                <span class="match__reason">{{ winReasonText(item.winReason) }}</span>
              </span>
              <svg
                class="match__chevron"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            <div v-if="expandedId === item.id" :id="`match-${item.id}`" class="match__detail">
              <p v-if="detailLoading === item.id" class="match__state" role="status">加载中…</p>

              <div v-else-if="!expanded" class="match__state" role="alert">
                <p class="error-text">{{ detailError || '加载失败，请稍后再试' }}</p>
                <button type="button" class="match__retry" @click="loadDetail(item.id)">重试</button>
              </div>

              <template v-else>
                <ul class="reveal" aria-label="全员身份">
                  <li v-for="p in expanded.rows" :key="p.seat" class="reveal__item">
                    <SeatAvatar
                      :seat="p.seat"
                      :avatar="p.avatar"
                      :nickname="p.nickname"
                      :me="p.me"
                      :show-name="false"
                    />
                    <span class="reveal__info">
                      <span class="reveal__name">
                        {{ p.nickname }}<span v-if="p.me" class="reveal__me"> · 我</span>
                      </span>
                      <span class="reveal__role" :class="sideClass('reveal__role', p.side)">
                        {{ p.role ? roleName(p.role) : '未知' }}
                      </span>
                    </span>
                    <span
                      v-if="p.hitTag"
                      class="reveal__tag"
                      :class="{ 'reveal__tag--hit': p.hitTag === '被刺中' }"
                    >
                      {{ p.hitTag }}
                    </span>
                  </li>
                </ul>
                <button type="button" class="btn btn-secondary match__timeline" @click="openTimeline(item.id)">
                  查看复盘记录
                </button>
              </template>
            </div>
          </li>
        </ul>

        <p v-if="error && items.length > 0" class="error-text records__more-error" role="alert">{{ error }}</p>

        <button
          v-if="hasMore"
          type="button"
          class="btn btn-secondary records__more"
          :class="{ 'is-loading': loadingMore }"
          :aria-busy="loadingMore"
          @click="load(true)"
        >
          {{ loadingMore ? '正在加载…' : '加载更多' }}
        </button>
      </section>
    </template>

    <HistoryDrawer
      :open="timelineOpen"
      :history="timeline.history"
      :players="timeline.players"
      phase="GAME_OVER"
      :quest-index="timeline.questIndex"
      :vote-round="timeline.voteRound"
      :leader-seat="timeline.leaderSeat"
      :current-team="[]"
      :team-voted-seats="[]"
      :my-seat="timeline.mySeat"
      @close="timelineOpen = false"
    />
  </main>
</template>

<style scoped>
.records {
  gap: 2rem;
}

.records__head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: -1.1rem;
}

.records__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.4rem;
}

.records__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  margin: 4rem 0 0;
  text-align: center;
  font-size: 1.3rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

.records__retry {
  width: auto;
  min-width: 16rem;
  height: 4.4rem;
  font-size: 1.4rem;
}

/* 统计卡：三项主数字 + 分项行 */
.stats {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.6rem;
}

.stats__main {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
}

.stats__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.stats__cell dt {
  font-size: 1.1rem;
  letter-spacing: 0.2rem;
  color: var(--small);
}

.stats__cell dd {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1.1;
  color: var(--text);
}

.stats__rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem 2rem;
  margin: 0;
  padding-top: 1.2rem;
  border-top: 1px solid var(--line);
}

.stats__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 1.2rem;
}

.stats__row dt {
  color: var(--muted);
}

.stats__row dd {
  margin: 0;
  color: var(--text);
}

.records__section {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.records__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  padding: 4rem 0;
}

.records__empty-text {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: 0.1rem;
  color: var(--muted);
}

.records__link {
  display: inline-flex;
  align-items: center;
  min-height: 4.4rem;
  padding: 0 0.8rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
}

.records__list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 对局条目：头部可展开，详情在卡片内展开 */
.match {
  overflow: hidden;
}

.match__head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  min-height: 4.4rem;
  padding: 1.2rem 4rem 1.2rem 1.4rem;
  text-align: left;
  transition: background-color 150ms ease;
}

.match__head:active {
  background: rgba(255, 255, 255, 0.04);
}

.match__meta {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  font-size: 1.2rem;
  color: var(--muted);
}

.match__time {
  color: var(--text);
}

.match__tag {
  margin-left: auto;
  padding: 0.2rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.1rem;
  letter-spacing: 0.1rem;
  line-height: 1.4;
  color: var(--muted);
}

.match__tag--win {
  border-color: var(--gold-line);
  color: var(--gold);
}

.match__line {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  min-width: 0;
}

.match__role {
  flex-shrink: 0;
  font-size: 1.4rem;
  font-weight: 600;
  color: var(--text);
}

.match__role--good,
.reveal__role--good {
  color: var(--blue);
}

.match__role--evil,
.reveal__role--evil {
  color: var(--red);
}

.match__reason {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 1.2rem;
  color: var(--muted);
}

.match__chevron {
  position: absolute;
  right: 1.4rem;
  top: 50%;
  width: 1.6rem;
  height: 1.6rem;
  margin-top: -0.8rem;
  color: var(--muted);
  transition: transform 200ms ease;
}

.match--open .match__chevron {
  transform: rotate(180deg);
}

.match__detail {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.2rem 1.4rem 1.4rem;
  border-top: 1px solid var(--line);
}

.match__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  padding: 0.8rem 0;
  text-align: center;
  font-size: 1.3rem;
  color: var(--small);
}

.match__retry {
  min-height: 4.4rem;
  padding: 0 1.2rem;
  border-radius: 0.6rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
  transition: color 150ms ease, background-color 150ms ease;
}

.match__retry:active {
  background: rgba(255, 255, 255, 0.06);
}

.match__timeline {
  height: 4.4rem;
  font-size: 1.4rem;
  letter-spacing: 0.3rem;
}

/* 身份名单：与结算页一致的着色与被刺标注，头像略小 */
.reveal {
  --seat-size: 3.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.reveal__item {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-height: 4.4rem;
}

.reveal__info {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.reveal__name {
  font-size: 1.3rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reveal__me {
  color: var(--gold);
}

.reveal__role {
  font-size: 1.2rem;
  color: var(--muted);
}

.reveal__tag {
  margin-left: auto;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.1rem;
  color: var(--muted);
}

.reveal__tag--hit {
  border-color: rgba(214, 69, 69, 0.5);
  color: var(--red);
}

.records__more-error {
  text-align: center;
}

.records__more {
  height: 4.4rem;
  font-size: 1.4rem;
  letter-spacing: 0.3rem;
}

@media (hover: hover) {
  .match__head:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .match__retry:hover {
    color: var(--gold-hover);
    background: rgba(255, 255, 255, 0.06);
  }
}

/* 平板 / PC ≥768px：居中 56rem 单列（由 .page--narrow 提供），正文字号提到 13px 以上 */
@media (min-width: 768px) {
  .records {
    gap: 2.4rem;
  }

  .records__title {
    font-size: 2.4rem;
  }

  .stats {
    padding: 2rem;
  }

  .stats__cell dt,
  .stats__row {
    font-size: 1.3rem;
  }

  .stats__cell dd {
    font-size: 2.8rem;
  }

  .match__meta,
  .match__reason,
  .match__tag,
  .reveal__role,
  .reveal__tag {
    font-size: 1.3rem;
  }

  .match__role {
    font-size: 1.5rem;
  }

  .reveal__name {
    font-size: 1.4rem;
  }

  .records__more {
    align-self: center;
    width: auto;
    min-width: 24rem;
  }
}

/* 桌面 ≥1024px：内容页拉宽后，身份名单两列 */
@media (min-width: 1024px) {
  .stats__rows {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .reveal {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem 2.4rem;
  }
}
</style>
