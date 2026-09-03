<script setup lang="ts">
// 游戏桌面骨架：① 任务进度 ② 座位环 ③ 阶段条 ④ 操作区（按 phase 切换，当前为占位文案）
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import PhaseBar from '@/components/PhaseBar.vue'
import QuestTrack from '@/components/QuestTrack.vue'
import SeatRing from '@/components/SeatRing.vue'
import { ws } from '@/services/ws'
import { useGameStore } from '@/stores/game'
import { useMarksStore } from '@/stores/marks'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'
import type { RingSeat } from '@/types/ui'
import { twoFailsIndexFor } from '@/utils/rules'

const router = useRouter()
const room = useRoomStore()
const game = useGameStore()
const user = useUserStore()
const marks = useMarksStore()

const state = computed(() => game.state)
const mySeat = computed(() => game.secret?.seat ?? game.seatOf(user.uid))
const playerCount = computed(() => game.playerCount)
const questSizes = computed(() => game.questSizes)
const twoFailsIndex = computed(() => twoFailsIndexFor(playerCount.value))

const questIndex = computed(() => state.value?.questIndex ?? 0)
const currentSize = computed(() => questSizes.value[questIndex.value] ?? 0)
const rejectCount = computed(() => Math.max(0, (state.value?.voteRound ?? 1) - 1))
const isLeader = computed(() => mySeat.value !== undefined && state.value?.leaderSeat === mySeat.value)
const onTeam = computed(
  () => mySeat.value !== undefined && (state.value?.currentTeam ?? []).includes(mySeat.value),
)

const ringSeats = computed<RingSeat[]>(() => {
  const s = state.value
  if (!s) return []
  const team = new Set(s.currentTeam)
  const voted = new Set(s.teamVotedSeats)
  return s.players.map((p) => ({
    seat: p.seat,
    nickname: p.nickname,
    avatar: p.avatar,
    online: p.online,
    isLeader: p.seat === s.leaderSeat,
    selected: team.has(p.seat),
    voted: voted.has(p.seat),
    mark: marks.get(p.seat)?.mark,
  }))
})

const centerSub = computed(() => {
  const s = state.value
  if (!s) return ''
  switch (s.phase) {
    case 'TEAM_PICK':
      return `已选 ${s.currentTeam.length} / ${currentSize.value}`
    case 'TEAM_VOTE':
      return `第 ${s.voteRound} 次表决 · ${s.teamVotedSeats.length} / ${s.playerCount} 已投`
    case 'QUEST':
      return `已出票 ${s.questVotedCount} / ${s.currentTeam.length}`
    case 'NIGHT':
      return `已确认 ${s.nightConfirmedSeats.length} / ${s.playerCount}`
    case 'ASSASSIN':
      return '刺杀'
    case 'GAME_OVER':
      return '对局结束'
    default:
      return ''
  }
})

interface PhaseCopy {
  label: string
  text: string
}

const phaseCopy = computed<PhaseCopy>(() => {
  const s = state.value
  if (!s) return { label: '', text: '正在同步对局…' }
  if (game.paused) {
    return {
      label: '等待重连',
      text: `${game.paused.nickname}（${game.paused.seat} 号）已离线，等待重连…`,
    }
  }
  const round = `第 ${s.questIndex + 1} 轮 · 第 ${s.voteRound} 次组队`
  switch (s.phase) {
    case 'NIGHT':
      return { label: '夜晚', text: '请查看并确认你的身份' }
    case 'TEAM_PICK':
      return isLeader.value
        ? { label: '你是队长', text: `点击头像，选择 ${currentSize.value} 名队员出征` }
        : { label: round, text: `队长 ${s.leaderSeat} 号正在选择 ${currentSize.value} 名队员` }
    case 'TEAM_VOTE':
      return { label: round, text: '请对本次队伍投票' }
    case 'QUEST':
      return onTeam.value
        ? { label: `第 ${s.questIndex + 1} 轮任务`, text: '请秘密出票' }
        : { label: `第 ${s.questIndex + 1} 轮任务`, text: '队员正在执行任务…' }
    case 'ASSASSIN':
      return { label: '刺杀阶段', text: '刺客正在寻找梅林…' }
    case 'GAME_OVER':
      return { label: '', text: '对局结束，正在结算' }
    default:
      return { label: '', text: '等待中…' }
  }
})

/** 操作区占位：各阶段的具体交互组件后续在此接入 */
const actionCopy = computed<PhaseCopy>(() => {
  const s = state.value
  if (!s) return { label: '', text: '' }
  switch (s.phase) {
    case 'NIGHT':
      return { label: '身份牌', text: '角色卡与夜晚视野将在此展示' }
    case 'TEAM_PICK':
      return isLeader.value
        ? { label: '组队', text: '点击座位头像选择队员，满员后可确认出征' }
        : { label: '组队', text: '等待队长提名队伍' }
    case 'TEAM_VOTE':
      return { label: '表决', text: '「同意」「反对」投票牌将在此展示' }
    case 'QUEST':
      return onTeam.value
        ? { label: '出票', text: '「成功」「失败」任务牌将在此展示' }
        : { label: '出票', text: '等待队员出票' }
    case 'ASSASSIN':
      return { label: '刺杀', text: '刺客指认目标的操作将在此展示' }
    case 'GAME_OVER':
      return { label: '结算', text: '即将进入结算页' }
    default:
      return { label: '', text: '' }
  }
})

/** 轮流发言 / 暂停等待时以对应截止时间驱动倒计时 */
const deadline = computed(() => {
  if (game.paused) return game.paused.deadline
  const s = state.value
  if (!s) return null
  if (s.speaker) return s.speaker.deadline
  return s.deadline
})

// 刷新后重新进入：凭 JWT 重连，服务端按 uid 反查补发 room.sync / game.sync / game.secret
onMounted(async () => {
  marks.load(room.code)
  if (!ws.connected) {
    try {
      const auth = await user.ensureAuth()
      ws.connect(auth.token)
    } catch {
      void router.replace('/')
    }
  }
})

watch(
  () => game.isOver,
  (over) => {
    if (over) void router.replace('/result')
  },
  { immediate: true },
)

// 服务端重置回大厅（再来一局 / 作废本局）时返回房间页
watch(
  () => game.phase,
  (phase) => {
    if (phase === 'LOBBY') void router.replace(room.code ? `/r/${room.code}` : '/')
  },
)
</script>

<template>
  <main class="page game">
    <header class="game__top">
      <span class="game__room">房间 {{ room.code }}</span>
      <span v-if="mySeat !== undefined" class="game__me">{{ mySeat }} 号 · {{ user.nickname }}</span>
      <span v-else class="game__me">旁观</span>
    </header>

    <template v-if="state">
      <QuestTrack
        class="game__track"
        :results="state.questResults"
        :current-index="questIndex"
        :quest-sizes="questSizes"
        :reject-count="rejectCount"
        :two-fails-index="twoFailsIndex"
      />

      <SeatRing class="game__ring" :seats="ringSeats" :my-seat="mySeat" :total="playerCount">
        <template #center>
          <div class="game__center-title serif">第 {{ questIndex + 1 }} 轮任务</div>
          <div class="game__center-main">{{ currentSize }} 人队伍</div>
          <div class="game__center-sub">{{ centerSub }}</div>
        </template>
      </SeatRing>

      <PhaseBar :label="phaseCopy.label" :text="phaseCopy.text" :deadline="deadline" />

      <section class="game__action card" aria-label="操作区">
        <span v-if="actionCopy.label" class="game__action-label">{{ actionCopy.label }}</span>
        <p class="game__action-text">{{ actionCopy.text }}</p>
      </section>
    </template>

    <div v-else class="game__loading" aria-live="polite">
      <p class="game__loading-text">正在同步对局…</p>
      <RouterLink class="game__back" :to="room.code ? `/r/${room.code}` : '/'">返回大厅</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.game__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 3.2rem;
}

.game__room,
.game__me {
  font-size: 1.1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

.game__track {
  margin-top: 1.2rem;
}

.game__ring {
  margin-top: 0.4rem;
}

.game__center-title {
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
}

.game__center-main {
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--text);
}

.game__center-sub {
  font-size: 1.1rem;
  color: var(--muted);
}

.game__action {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-height: 8rem;
  margin-top: 1.2rem;
  padding: 1.4rem 1.6rem;
}

.game__action-label {
  font-size: 1.1rem;
  letter-spacing: 0.2rem;
  color: var(--small);
}

.game__action-text {
  margin: 0;
  font-size: 1.4rem;
  color: var(--muted);
}

.game__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  margin: auto 0;
  text-align: center;
}

.game__loading-text {
  margin: 0;
  font-size: 1.4rem;
  color: var(--muted);
}

.game__back {
  display: inline-flex;
  align-items: center;
  min-height: 4.4rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
}
</style>
