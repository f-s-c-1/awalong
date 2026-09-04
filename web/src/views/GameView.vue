<script setup lang="ts">
// 游戏桌面：① 任务进度（点开战局记录）② 座位环 ③ 阶段条 ④ 操作区（按阶段切换）
// 夜晚以全屏身份牌覆盖层发牌，确认后收入右上「查看身份」（长按 1 秒复看，松手盖回）
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { failsNeeded } from '@awalong/shared'
import type { Phase } from '@awalong/shared'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import HistoryDrawer from '@/components/HistoryDrawer.vue'
import MarkSheet from '@/components/MarkSheet.vue'
import PhaseBanner from '@/components/PhaseBanner.vue'
import PhaseBar from '@/components/PhaseBar.vue'
import PhraseChips from '@/components/PhraseChips.vue'
import QuestCards from '@/components/QuestCards.vue'
import QuestRevealOverlay from '@/components/QuestRevealOverlay.vue'
import QuestTrack from '@/components/QuestTrack.vue'
import RoleCard from '@/components/RoleCard.vue'
import SeatRing from '@/components/SeatRing.vue'
import SoundToggle from '@/components/SoundToggle.vue'
import TeamVoteCards from '@/components/TeamVoteCards.vue'
import VoiceBar from '@/components/VoiceBar.vue'
import * as sfx from '@/services/sfx'
import { ws } from '@/services/ws'
import { useGameStore, type QuestRevealEvent } from '@/stores/game'
import { useMarksStore } from '@/stores/marks'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'
import { useVoiceStore } from '@/stores/voice'
import type { MarkKind, RingSeat } from '@/types/ui'
import { phraseText } from '@/utils/phrases'
import { twoFailsIndexFor } from '@/utils/rules'

const ERROR_SHOW_MS = 3000
const BUBBLE_MS = 3000
const PEEK_HOLD_MS = 1000

const router = useRouter()
const room = useRoomStore()
const game = useGameStore()
const user = useUserStore()
const marks = useMarksStore()
const voice = useVoiceStore()

const state = computed(() => game.state)
const secret = computed(() => game.secret)
const phase = computed<Phase | null>(() => state.value?.phase ?? null)
const mySeat = computed(() => secret.value?.seat ?? game.seatOf(user.uid))
const isSpectator = computed(() => mySeat.value === undefined)
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
const isAssassin = computed(() => secret.value?.role === 'ASSASSIN')
const seats = computed(() => (state.value?.players ?? []).map((p) => p.seat))

function nicknameOf(seat: number): string {
  return state.value?.players.find((p) => p.seat === seat)?.nickname ?? `${seat} 号`
}

// ---------- 本地操作态（乐观反馈；服务端报错时清空以便重试） ----------
const nightSent = ref(false)
const teamVoteSent = ref(false)
const questVoteSent = ref(false)
const teamPickSent = ref(false)
const assassinSent = ref(false)
const picked = ref<number[]>([])
const assassinTarget = ref<number | null>(null)
const cardFlipped = ref(false)

const myNightConfirmed = computed(
  () =>
    nightSent.value ||
    (mySeat.value !== undefined && (state.value?.nightConfirmedSeats ?? []).includes(mySeat.value)),
)
const myTeamVoted = computed(
  () =>
    teamVoteSent.value ||
    (mySeat.value !== undefined && (state.value?.teamVotedSeats ?? []).includes(mySeat.value)),
)
const isSpeaker = computed(
  () => mySeat.value !== undefined && state.value?.speaker?.seat === mySeat.value,
)

watch(phase, () => {
  teamVoteSent.value = false
  questVoteSent.value = false
  teamPickSent.value = false
  assassinSent.value = false
  picked.value = []
  assassinTarget.value = null
})

// ---------- 时钟：服务端错误 3 秒提示、短语气泡 3 秒 ----------
const now = ref(Date.now())
let nowTimer: number | undefined

const serverError = computed(() => {
  const err = room.lastError
  return err && now.value - err.at < ERROR_SHOW_MS ? err.message : ''
})

watch(
  () => room.lastError,
  (err) => {
    if (!err) return
    nightSent.value = false
    teamVoteSent.value = false
    questVoteSent.value = false
    teamPickSent.value = false
    assassinSent.value = false
  },
)

function bubbleFor(seat: number): string | undefined {
  const shown = game.phrases[seat]
  if (!shown || now.value - shown.at > BUBBLE_MS) return undefined
  return phraseText(shown.phraseId) || undefined
}

// ---------- 亮票展示：任务阶段与被否决后的下一次组队期间保留 ----------
const showVotes = computed(() => {
  const s = state.value
  if (!s || !s.teamVotes) return false
  if (s.phase === 'QUEST' || s.phase === 'ASSASSIN') return true
  return s.phase === 'TEAM_PICK' && s.voteRound > 1
})

const ringSelectable = computed(
  () =>
    !isSpectator.value &&
    ((phase.value === 'TEAM_PICK' && isLeader.value && !teamPickSent.value) ||
      (phase.value === 'ASSASSIN' && isAssassin.value && !assassinSent.value)),
)

/** 刺杀阶段刺客不可选的座位：自己与夜晚已知的同伴 */
function assassinExcluded(seat: number): boolean {
  return seat === mySeat.value || (secret.value?.visionSeats ?? []).includes(seat)
}

const ringSeats = computed<RingSeat[]>(() => {
  const s = state.value
  if (!s) return []
  const team = new Set(s.currentTeam)
  const voted = new Set(s.teamVotedSeats)
  const speaking = new Set(voice.speakingSeats)
  const pickedSet = new Set(picked.value)
  return s.players.map((p) => {
    let selected = team.has(p.seat)
    if (s.phase === 'TEAM_PICK' && isLeader.value) selected = pickedSet.has(p.seat)
    if (s.phase === 'ASSASSIN' && isAssassin.value) selected = assassinTarget.value === p.seat
    return {
      seat: p.seat,
      nickname: p.nickname,
      avatar: p.avatar,
      online: p.online,
      isLeader: p.seat === s.leaderSeat,
      selected,
      voted: s.phase === 'TEAM_VOTE' && voted.has(p.seat),
      vote: showVotes.value ? s.teamVotes?.[p.seat] : undefined,
      glow:
        s.speaker?.seat === p.seat ||
        (s.phase === 'TEAM_PICK' && p.seat === s.leaderSeat && !isLeader.value),
      busy: s.phase === 'QUEST' && team.has(p.seat),
      bubble: bubbleFor(p.seat),
      dimmed: s.phase === 'ASSASSIN' && isAssassin.value && assassinExcluded(p.seat),
      mark: marks.get(p.seat)?.mark,
      speaking: speaking.has(p.seat),
    }
  })
})

// ---------- 座位交互：组队选人 / 刺杀选目标 / 长按私人标记 ----------
function onSeatSelect(seat: number): void {
  const s = state.value
  if (!s) return
  if (s.phase === 'TEAM_PICK' && isLeader.value) {
    const idx = picked.value.indexOf(seat)
    if (idx >= 0) picked.value.splice(idx, 1)
    else if (picked.value.length < currentSize.value) picked.value.push(seat)
    else return
    sfx.play('tap')
    return
  }
  if (s.phase === 'ASSASSIN' && isAssassin.value) {
    if (assassinExcluded(seat)) return
    assassinTarget.value = assassinTarget.value === seat ? null : seat
    sfx.play('tap')
  }
}

const markOpen = ref(false)
const markSeat = ref<number | null>(null)
const markInitial = computed(() => (markSeat.value === null ? null : marks.get(markSeat.value) ?? null))

function onSeatLongpress(seat: number): void {
  if (seat === mySeat.value) return
  if (state.value && !state.value.settings.allowMarks) {
    showBanner('本局房主已关闭私人标记')
    return
  }
  sfx.vibrate(30)
  markSeat.value = seat
  markOpen.value = true
}

function saveMark(mark: MarkKind, note: string): void {
  if (markSeat.value !== null) marks.set(markSeat.value, mark, note)
  markOpen.value = false
}

function clearMark(): void {
  if (markSeat.value !== null) marks.clear(markSeat.value)
  markOpen.value = false
}

// ---------- 阶段横幅 ----------
const bannerText = ref<string | null>(null)
const bannerNonce = ref(0)

function showBanner(text: string): void {
  bannerText.value = text
  bannerNonce.value += 1
}

watch(
  () => game.phaseEvent,
  (ev) => {
    if (!ev) return
    const round = `第 ${ev.questIndex + 1} 轮任务`
    let text: string | null = null
    switch (ev.phase) {
      case 'TEAM_PICK':
        text = ev.voteRound > 1 ? `${round} · 第 ${ev.voteRound} 次组队` : `${round} · 组队阶段`
        break
      case 'TEAM_VOTE':
        text = `${round} · 表决阶段`
        break
      case 'QUEST':
        text = `${round} · 出票阶段`
        break
      case 'ASSASSIN':
        text = '刺杀阶段'
        break
      default:
        text = null
    }
    if (!text) return
    showBanner(text)
    sfx.vibrate(50)
    sfx.play(ev.phase === 'ASSASSIN' ? 'assassin' : 'phase')
  },
  // 桌面挂载时 game.sync 往往已先到（大厅收到后才跳转），立即宣告一次当前阶段
  { immediate: true },
)

// ---------- 亮票 / 任务揭晓 ----------
watch(
  () => game.teamRevealEvent,
  (ev) => {
    if (!ev) return
    const approves = Object.values(ev.votes).filter(Boolean).length
    const rejects = Object.values(ev.votes).length - approves
    sfx.play(ev.approved ? 'approve' : 'reject')
    showBanner(ev.approved ? `队伍成立 · ${approves} 同意 ${rejects} 反对` : `队伍被否决 · ${approves} 同意 ${rejects} 反对`)
  },
)

interface RevealShow extends QuestRevealEvent {
  /** 揭晓的是第几轮（quest.reveal 先于 game.sync 到达，此刻 questIndex 仍指向刚结束的那轮） */
  questNo: number
}

const reveal = ref<RevealShow | null>(null)
/** 揭晓动画中收到终局：等动画结束再进结算 */
const pendingResult = ref(false)

watch(
  () => game.questRevealEvent,
  (ev) => {
    if (ev) reveal.value = { ...ev, questNo: (state.value?.questIndex ?? 0) + 1 }
  },
)

function goResult(): void {
  void router.replace('/result')
}

function onRevealDone(): void {
  reveal.value = null
  if (pendingResult.value) {
    pendingResult.value = false
    goResult()
  }
}

watch(
  () => game.isOver,
  (over) => {
    if (!over) return
    if (reveal.value) pendingResult.value = true
    else goResult()
  },
  { immediate: true },
)

// ---------- 夜晚：身份牌与确认 ----------
const nightOpen = computed(
  () => phase.value === 'NIGHT' && !isSpectator.value && !myNightConfirmed.value,
)

function flipCard(): void {
  cardFlipped.value = true
  sfx.play('flip')
  sfx.vibrate(20)
}

function confirmNight(): void {
  if (!cardFlipped.value || nightSent.value) return
  nightSent.value = true
  sfx.play('tap')
  ws.send({ type: 'night.confirm' })
}

// 长按查看身份：按住 1 秒显示，松手即盖回；切后台立即盖回
const peeking = ref(false)
let peekTimer: number | undefined

function startPeek(): void {
  if (!secret.value) return
  stopPeekTimer()
  peekTimer = window.setTimeout(() => {
    peekTimer = undefined
    peeking.value = true
    sfx.vibrate(30)
  }, PEEK_HOLD_MS)
}

function stopPeekTimer(): void {
  if (peekTimer !== undefined) {
    window.clearTimeout(peekTimer)
    peekTimer = undefined
  }
}

function endPeek(): void {
  stopPeekTimer()
  peeking.value = false
}

function onPeekKeydown(ev: KeyboardEvent): void {
  if ((ev.key === ' ' || ev.key === 'Enter') && !ev.repeat) {
    ev.preventDefault()
    startPeek()
  }
}

function onVisibility(): void {
  if (document.visibilityState !== 'visible') endPeek()
}

// ---------- 组队 / 表决 / 出票 / 刺杀 / 发言 ----------
const confirmKind = ref<'team' | 'assassin' | null>(null)

const confirmCopy = computed(() => {
  if (confirmKind.value === 'team') {
    const list = [...picked.value].sort((a, b) => a - b).join('、')
    return {
      title: '确认出征？',
      text: `派出 ${list} 号执行第 ${questIndex.value + 1} 轮任务，发出后全员表决，不可撤回。`,
      confirmText: '确认出征',
      danger: false,
    }
  }
  if (confirmKind.value === 'assassin' && assassinTarget.value !== null) {
    return {
      title: '刺出致命一击？',
      text: `刺杀 ${assassinTarget.value} 号 ${nicknameOf(assassinTarget.value)}。刺中梅林则邪恶方获胜，否则正义方获胜。`,
      confirmText: '刺出致命一击',
      danger: true,
    }
  }
  return { title: '', text: '', confirmText: '确认', danger: false }
})

function askTeamConfirm(): void {
  if (picked.value.length !== currentSize.value) return
  sfx.play('tap')
  confirmKind.value = 'team'
}

function askAssassinConfirm(): void {
  if (assassinTarget.value === null) return
  sfx.play('tap')
  confirmKind.value = 'assassin'
}

function onConfirm(): void {
  const kind = confirmKind.value
  confirmKind.value = null
  if (kind === 'team') {
    teamPickSent.value = true
    ws.send({ type: 'team.pick', seats: [...picked.value].sort((a, b) => a - b) })
  } else if (kind === 'assassin' && assassinTarget.value !== null) {
    assassinSent.value = true
    sfx.play('assassin')
    sfx.vibrate([60, 40, 120])
    ws.send({ type: 'assassin.kill', targetSeat: assassinTarget.value })
  }
}

function castTeamVote(approve: boolean): void {
  teamVoteSent.value = true
  sfx.play('tap')
  ws.send({ type: 'team.vote', approve })
}

function castQuestVote(success: boolean): void {
  questVoteSent.value = true
  sfx.play('flip')
  ws.send({ type: 'quest.vote', success })
}

function speakerDone(): void {
  sfx.play('tap')
  ws.send({ type: 'speaker.done' })
}

function sendPhrase(phraseId: string): void {
  sfx.play('tap')
  ws.send({ type: 'phrase.send', phraseId })
}

// ---------- 战局记录 ----------
const historyOpen = ref(false)

// ---------- 文案 ----------
const centerSub = computed(() => {
  const s = state.value
  if (!s) return ''
  switch (s.phase) {
    case 'TEAM_PICK':
      return isLeader.value
        ? `已选 ${picked.value.length} / ${currentSize.value}`
        : `第 ${s.voteRound} 次组队`
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
      return { label: '夜晚', text: myNightConfirmed.value ? '等待其他玩家确认身份' : '请查看并确认你的身份' }
    case 'TEAM_PICK':
      return isLeader.value
        ? { label: '你是队长', text: `点击头像，选择 ${currentSize.value} 名队员出征` }
        : { label: round, text: `队长 ${s.leaderSeat} 号正在选择 ${currentSize.value} 名队员` }
    case 'TEAM_VOTE':
      if (s.speaker) {
        return isSpeaker.value
          ? { label: round, text: '轮到你发言，说完请点「说完了」' }
          : { label: round, text: `${s.speaker.seat} 号 ${nicknameOf(s.speaker.seat)} 正在发言` }
      }
      return { label: round, text: '请对本次队伍表决' }
    case 'QUEST':
      return onTeam.value
        ? { label: `第 ${s.questIndex + 1} 轮任务`, text: '请秘密出票' }
        : { label: `第 ${s.questIndex + 1} 轮任务`, text: '队员正在执行任务…' }
    case 'ASSASSIN':
      return isAssassin.value
        ? { label: '刺杀阶段', text: '点击头像选择要刺杀的玩家' }
        : { label: '刺杀阶段', text: '刺客正在寻找梅林…' }
    case 'GAME_OVER':
      return { label: '', text: '对局结束，正在结算' }
    default:
      return { label: '', text: '等待中…' }
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

const showPhrases = computed(
  () =>
    !isSpectator.value &&
    (phase.value === 'TEAM_PICK' || phase.value === 'TEAM_VOTE' || phase.value === 'QUEST' || phase.value === 'ASSASSIN'),
)

// 刷新后重新进入：凭 JWT 重连，服务端按 uid 反查补发 room.sync / game.sync / game.secret
onMounted(async () => {
  marks.load(room.code)
  nowTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 500)
  document.addEventListener('visibilitychange', onVisibility)
  if (!ws.connected) {
    try {
      const auth = await user.ensureAuth()
      ws.connect(auth.token)
    } catch {
      void router.replace('/')
    }
  }
})

onBeforeUnmount(() => {
  if (nowTimer !== undefined) window.clearInterval(nowTimer)
  document.removeEventListener('visibilitychange', onVisibility)
  stopPeekTimer()
})

// 服务端重置回大厅（再来一局 / 作废本局）时返回房间页
watch(
  () => game.phase,
  (p) => {
    if (p === 'LOBBY') void router.replace(room.code ? `/r/${room.code}` : '/')
  },
)
</script>

<template>
  <main class="page game" :data-phase="phase ?? ''">
    <header class="game__top">
      <div class="game__ident">
        <span class="game__room">房间 {{ room.code }}</span>
        <span v-if="mySeat !== undefined" class="game__me" data-test="my-seat">{{ mySeat }} 号 · {{ user.nickname }}</span>
        <span v-else class="game__me">旁观</span>
      </div>
      <div class="game__tools">
        <SoundToggle />
        <button
          v-if="secret && !nightOpen"
          type="button"
          class="game__peek"
          data-test="role-peek"
          aria-label="长按查看身份"
          :aria-pressed="peeking"
          @pointerdown.prevent="startPeek"
          @pointerup="endPeek"
          @pointercancel="endPeek"
          @pointerleave="endPeek"
          @keydown="onPeekKeydown"
          @keyup="endPeek"
          @blur="endPeek"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M12 7v7M9 10h6" />
          </svg>
          <span>看牌</span>
        </button>
      </div>
      <VoiceBar v-if="mySeat !== undefined" class="game__voice" />
    </header>

    <template v-if="state">
      <div
        class="game__track-btn"
        role="button"
        tabindex="0"
        aria-label="查看战局记录"
        @click="historyOpen = true"
        @keydown.enter.prevent="historyOpen = true"
        @keydown.space.prevent="historyOpen = true"
      >
        <QuestTrack
          class="game__track"
          :results="state.questResults"
          :current-index="questIndex"
          :quest-sizes="questSizes"
          :reject-count="rejectCount"
          :two-fails-index="twoFailsIndex"
        />
      </div>

      <SeatRing
        class="game__ring"
        :seats="ringSeats"
        :my-seat="mySeat"
        :total="playerCount"
        :selectable="ringSelectable"
        @select="onSeatSelect"
        @longpress="onSeatLongpress"
      >
        <template #center>
          <div class="game__center-title serif">第 {{ questIndex + 1 }} 轮任务</div>
          <div class="game__center-main">{{ currentSize }} 人队伍</div>
          <div class="game__center-sub">{{ centerSub }}</div>
        </template>
      </SeatRing>

      <PhaseBar class="game__phase" :label="phaseCopy.label" :text="phaseCopy.text" :deadline="deadline" />

      <section class="game__action card" aria-label="操作区" aria-live="polite">
        <p v-if="serverError" class="game__error" role="alert">{{ serverError }}</p>

        <!-- 旁观者 -->
        <template v-if="isSpectator">
          <span class="game__action-label">旁观</span>
          <p class="game__action-text">你正以旁观者身份观战，只能看到公开信息</p>
        </template>

        <!-- 夜晚：已确认后等待 -->
        <template v-else-if="state.phase === 'NIGHT'">
          <span class="game__action-label">身份牌</span>
          <p class="game__action-text" data-test="night-waiting">
            已确认 {{ state.nightConfirmedSeats.length }} / {{ state.playerCount }}，等待其他玩家查看身份。需要复看时长按右上角「长按看牌」。
          </p>
        </template>

        <!-- 组队 -->
        <template v-else-if="state.phase === 'TEAM_PICK'">
          <template v-if="isLeader">
            <span class="game__action-label">组队</span>
            <p class="game__action-text">
              {{ picked.length < currentSize ? `点击座位头像选择队员，还需 ${currentSize - picked.length} 人` : '队伍已满员，确认后进入全员表决' }}
            </p>
            <button
              type="button"
              class="btn"
              :class="picked.length === currentSize && !teamPickSent ? 'btn-primary' : 'btn-disabled'"
              :disabled="picked.length !== currentSize || teamPickSent"
              data-test="team-confirm"
              @click="askTeamConfirm"
            >
              {{ teamPickSent ? '已提名，等待表决' : '确认出征' }}
            </button>
          </template>
          <template v-else>
            <span class="game__action-label">组队</span>
            <p class="game__action-text">等待队长 {{ state.leaderSeat }} 号 {{ nicknameOf(state.leaderSeat) }} 提名队伍</p>
          </template>
        </template>

        <!-- 表决（含轮流发言） -->
        <template v-else-if="state.phase === 'TEAM_VOTE'">
          <div v-if="state.speaker" class="game__speaker">
            <span class="game__action-label">发言</span>
            <p class="game__action-text">
              {{ isSpeaker ? '轮到你发言' : `${state.speaker.seat} 号 ${nicknameOf(state.speaker.seat)} 正在发言` }}
            </p>
            <button v-if="isSpeaker" type="button" class="btn btn-secondary game__speaker-btn" data-test="speaker-done" @click="speakerDone">
              说完了
            </button>
          </div>
          <span v-else class="game__action-label">表决</span>
          <p v-if="state.speaker" class="game__action-text">全员发言结束后开始表决</p>
          <TeamVoteCards
            v-else
            :voted="myTeamVoted"
            :voted-count="state.teamVotedSeats.length"
            :total="state.playerCount"
            @vote="castTeamVote"
          />
        </template>

        <!-- 任务出票 -->
        <template v-else-if="state.phase === 'QUEST'">
          <template v-if="onTeam && secret">
            <span class="game__action-label">出票</span>
            <QuestCards
              :side="secret.side"
              :voted="questVoteSent"
              :voted-count="state.questVotedCount"
              :team-size="state.currentTeam.length"
              @vote="castQuestVote"
            />
          </template>
          <template v-else>
            <span class="game__action-label">出票</span>
            <p class="game__action-text">队员正在秘密出票 · {{ state.questVotedCount }} / {{ state.currentTeam.length }}</p>
          </template>
        </template>

        <!-- 刺杀 -->
        <template v-else-if="state.phase === 'ASSASSIN'">
          <template v-if="isAssassin">
            <span class="game__action-label">刺杀</span>
            <p class="game__action-text">
              {{ assassinTarget === null ? '正义方完成了三轮任务。点击头像选择你认为是梅林的玩家' : `目标：${assassinTarget} 号 ${nicknameOf(assassinTarget)}` }}
            </p>
            <button
              type="button"
              class="btn"
              :class="assassinTarget !== null && !assassinSent ? 'btn-primary game__kill' : 'btn-disabled'"
              :disabled="assassinTarget === null || assassinSent"
              data-test="assassin-confirm"
              @click="askAssassinConfirm"
            >
              {{ assassinSent ? '已出手' : '刺出致命一击' }}
            </button>
          </template>
          <template v-else>
            <span class="game__action-label">刺杀</span>
            <div class="game__scan" aria-hidden="true"><span class="game__scan-line"></span></div>
            <p class="game__action-text">正义方完成了三轮任务，刺客正在寻找梅林…</p>
          </template>
        </template>

        <template v-else-if="state.phase === 'GAME_OVER'">
          <span class="game__action-label">结算</span>
          <p class="game__action-text">对局结束，即将进入结算页</p>
        </template>
      </section>

      <PhraseChips
        v-if="showPhrases"
        class="game__phrases"
        :seats="seats"
        :my-seat="mySeat"
        :disabled="ws.status.value !== 'open'"
        @send="sendPhrase"
      />
    </template>

    <div v-else class="game__loading" aria-live="polite">
      <p class="game__loading-text">正在同步对局…</p>
      <RouterLink class="game__back" :to="room.code ? `/r/${room.code}` : '/'">返回大厅</RouterLink>
    </div>

    <!-- 夜晚发牌覆盖层 -->
    <Transition name="night">
      <div v-if="nightOpen" class="night" role="dialog" aria-modal="true" aria-label="查看身份">
        <div class="night__panel">
          <p class="night__title serif">夜晚降临</p>
          <p class="night__sub">请确认周围没有人偷看，再翻开你的身份牌</p>
          <RoleCard
            v-if="secret && state"
            :secret="secret"
            :players="state.players"
            :flipped="cardFlipped"
            @flip="flipCard"
          />
          <p v-else class="night__sub">正在发牌…</p>
          <button
            type="button"
            class="btn night__btn"
            :class="cardFlipped && secret ? 'btn-primary' : 'btn-disabled'"
            :disabled="!cardFlipped || !secret || nightSent"
            data-test="night-confirm"
            @click="confirmNight"
          >
            {{ nightSent ? '已确认' : '我记住了' }}
          </button>
          <p v-if="state" class="night__count">已确认 {{ state.nightConfirmedSeats.length }} / {{ state.playerCount }}</p>
        </div>
      </div>
    </Transition>

    <!-- 长按复看身份 -->
    <Transition name="night">
      <div v-if="peeking && secret && state" class="peek" aria-live="polite">
        <RoleCard :secret="secret" :players="state.players" :flipped="true" compact />
        <p class="peek__hint">松开即盖回</p>
      </div>
    </Transition>

    <QuestRevealOverlay
      v-if="reveal"
      :key="reveal.version"
      :cards="reveal.cards"
      :failed="reveal.failed"
      :quest-no="reveal.questNo"
      :fails-needed="failsNeeded(playerCount, reveal.questNo - 1)"
      @done="onRevealDone"
    />

    <ConfirmDialog
      :open="confirmKind !== null"
      :title="confirmCopy.title"
      :text="confirmCopy.text"
      :confirm-text="confirmCopy.confirmText"
      :danger="confirmCopy.danger"
      @confirm="onConfirm"
      @cancel="confirmKind = null"
    />

    <HistoryDrawer
      v-if="state"
      :open="historyOpen"
      :history="state.history"
      :players="state.players"
      :phase="state.phase"
      :quest-index="state.questIndex"
      :vote-round="state.voteRound"
      :leader-seat="state.leaderSeat"
      :current-team="state.currentTeam"
      :team-voted-seats="state.teamVotedSeats"
      :my-seat="mySeat"
      @close="historyOpen = false"
    />

    <MarkSheet
      :open="markOpen"
      :seat="markSeat"
      :nickname="markSeat === null ? '' : nicknameOf(markSeat)"
      :initial="markInitial"
      :note-max="marks.noteMax"
      @save="saveMark"
      @clear="clearMark"
      @close="markOpen = false"
    />

    <PhaseBanner :message="bannerText" :nonce="bannerNonce" />
  </main>
</template>

<style scoped>
.game__top {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-height: 3.2rem;
}

.game__ident {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.game__room,
.game__me {
  font-size: 1.1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
  white-space: nowrap;
}

.game__tools {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

.game__peek {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 3.6rem;
  padding: 0 1.1rem;
  border: 1px solid var(--gold-line);
  border-radius: 0.6rem;
  font-size: 1.2rem;
  letter-spacing: 0.1rem;
  color: var(--gold);
  white-space: nowrap;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
  transition: background-color 150ms ease;
}

.game__peek svg {
  width: 1.6rem;
  height: 1.6rem;
}

.game__peek:active,
.game__peek[aria-pressed='true'] {
  background: rgba(201, 162, 39, 0.14);
}

.game__track-btn {
  display: block;
  width: 100%;
  margin-top: 1.2rem;
  border-radius: 0.8rem;
  cursor: pointer;
}

.game__track-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.game__track {
  pointer-events: none;
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
  gap: 0.8rem;
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
  line-height: 1.5;
  color: var(--muted);
}

.game__error {
  margin: 0;
  font-size: 1.3rem;
  color: var(--red);
}

.game__speaker {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--line);
}

.game__speaker-btn {
  height: 4.4rem;
  font-size: 1.5rem;
}

.game__kill {
  background: var(--red);
  color: var(--text);
  box-shadow: none;
}

.game__kill:active {
  background: #b63a3a;
}

/* 刺客寻找梅林：剑光扫描线 */
.game__scan {
  position: relative;
  height: 0.4rem;
  overflow: hidden;
  border-radius: 0.2rem;
  background: var(--line);
}

.game__scan-line {
  position: absolute;
  top: 0;
  left: -30%;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  animation: game-scan 1.8s linear infinite;
}

@keyframes game-scan {
  to {
    left: 100%;
  }
}

.game__phrases {
  margin-top: 1rem;
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

/* 夜晚发牌覆盖层 */
.night {
  position: fixed;
  inset: 0;
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(2rem + var(--safe-top)) 2rem calc(2rem + var(--safe-bottom));
  overflow-y: auto;
  background: rgba(14, 11, 20, 0.96);
}

.night__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.4rem;
  width: 100%;
  max-width: 40rem;
  margin: auto 0;
}

.night__title {
  margin: 0;
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: 0.6rem;
  color: var(--gold);
}

.night__sub {
  margin: 0;
  font-size: 1.3rem;
  text-align: center;
  color: var(--muted);
}

.night__btn {
  max-width: 28rem;
  margin-top: 0.4rem;
}

.night__count {
  margin: 0;
  font-size: 1.2rem;
  color: var(--small);
}

.peek {
  position: fixed;
  inset: 0;
  z-index: 650;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.6rem;
  padding: 2rem;
  background: rgba(14, 11, 20, 0.96);
  pointer-events: none;
}

.peek__hint {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: 0.3rem;
  color: var(--small);
}

.night-enter-active,
.night-leave-active {
  transition: opacity 250ms ease;
}

.night-enter-from,
.night-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .game__scan-line {
    animation: none;
    left: 35%;
  }
}

/* 平板 ≥768px：单列，座位环放大到 56rem */
@media (min-width: 768px) {
  .game__ring {
    --seat-ring-w: var(--ring-lg);
    --seat-ring-center: 14rem;
  }

  .game__room,
  .game__me,
  .game__action-label {
    font-size: 1.3rem;
  }

  .game__center-title {
    font-size: 1.5rem;
  }

  .game__center-main {
    font-size: 2.4rem;
  }

  .game__center-sub {
    font-size: 1.3rem;
  }
}

/* 桌面 ≥1024px：双栏——顶部信息行横跨两栏，左栏座位环，右栏依次为任务盾 / 阶段条 / 操作区 / 短语 / 语音
   DOM 顺序不变：头部改为 display: contents，让其子节点直接参与 grid 排布 */
@media (min-width: 1024px) {
  .game {
    display: grid;
    grid-template-columns: var(--ring-lg) minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
    grid-template-areas:
      'top top'
      'ring track'
      'ring phase'
      'ring action'
      'ring phrases'
      'ring voice';
    column-gap: calc(var(--col-gap) * 1.5);
    align-items: start;
    align-content: center;
    min-height: 0;
  }

  .game__ring {
    --seat-size: 6.4rem;
    --seat-name: 1.2rem;
    --seat-ring-center: 16rem;
  }

  .game__ring,
  .game__track-btn,
  .game__phase,
  .game__action,
  .game__phrases,
  .game__voice {
    margin-top: 1.6rem;
  }

  .game__top {
    display: contents;
  }

  .game__ident {
    grid-area: top;
    flex-direction: row;
    align-items: center;
    gap: 1.6rem;
    min-height: 3.2rem;
    justify-self: start;
  }

  .game__tools {
    grid-area: top;
    justify-self: end;
    margin-left: 0;
  }

  .game__voice {
    grid-area: voice;
    align-self: end;
  }

  .game__track-btn {
    grid-area: track;
  }

  .game__ring {
    grid-area: ring;
  }

  .game__phase {
    grid-area: phase;
  }

  .game__action {
    grid-area: action;
    align-self: stretch;
    min-height: 12rem;
    padding: 1.6rem 2rem;
  }

  .game__phrases {
    grid-area: phrases;
  }

  .game:has(.game__loading) {
    display: flex;
    min-height: 100dvh;
  }

  .game:has(.game__loading) .game__top {
    display: flex;
  }

  .game:has(.game__loading) .game__ident {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
  }
}
</style>
