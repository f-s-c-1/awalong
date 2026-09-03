<script setup lang="ts">
// 房间大厅：房间码 + 座位环 + 角色板子 + 准备/开始；数据全部来自 room.sync 推送
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { RoleId } from '@awalong/shared'
import SeatRing from '@/components/SeatRing.vue'
import VoiceBar from '@/components/VoiceBar.vue'
import { api, ApiError } from '@/services/api'
import { ws } from '@/services/ws'
import { useGameStore } from '@/stores/game'
import { useMarksStore } from '@/stores/marks'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'
import { useVoiceStore } from '@/stores/voice'
import type { RingSeat } from '@/types/ui'
import { copyText } from '@/utils/clipboard'
import { roleName, roleSide } from '@/utils/roles'

const ERROR_SHOW_MS = 3000

const router = useRouter()
const room = useRoomStore()
const game = useGameStore()
const user = useUserStore()
const marks = useMarksStore()
const voice = useVoiceStore()

const error = ref('')
const copied = ref(false)
const pending = ref(false)
let copiedTimer: number | undefined
let stopOpen: (() => void) | undefined
const now = ref(Date.now())
let nowTimer: number | undefined

const code = computed(() => room.code)
const spacedCode = computed(() => code.value.split('').join(' '))
const shareUrl = computed(() => `${location.origin}/r/${code.value}`)

const mySeat = computed(() => room.mySeat ?? undefined)
const isOwner = computed(() => room.isOwner(user.uid))
const myReady = computed(() => room.isReady(user.uid))
const total = computed(() => Math.max(room.playerCount, room.seatedCount, 1))
const inLobby = computed(() => room.synced && room.status === 'LOBBY')

const ringSeats = computed<RingSeat[]>(() => {
  const speaking = new Set(voice.speakingSeats)
  const list: RingSeat[] = room.seats.map((s) => ({
    seat: s.seat,
    nickname: s.nickname,
    avatar: s.avatar,
    online: s.online,
    ready: s.ready,
    mark: marks.get(s.seat)?.mark,
    speaking: speaking.has(s.seat),
  }))
  const taken = new Set(list.map((s) => s.seat))
  for (let seat = 1; seat <= total.value; seat += 1) {
    if (!taken.has(seat)) list.push({ seat, nickname: '', avatar: '', online: false, empty: true })
  }
  return list
})

const roles = computed<RoleId[]>(() => room.settings?.roles ?? [])

/** 服务端业务错误：3 秒内显示 */
const serverError = computed(() => {
  const err = room.lastError
  return err && now.value - err.at < ERROR_SHOW_MS ? err.message : ''
})

const centerHint = computed(() => {
  if (!room.synced) return '正在连接…'
  if (room.status === 'CLOSED') return '房间已解散'
  if (!room.isFull) return '等待玩家加入'
  if (!room.allReady) return '等待全员准备'
  return isOwner.value ? '可以开始了' : '等待房主开局'
})

const footerHint = computed(() => {
  if (serverError.value) return serverError.value
  if (!room.synced) return ''
  if (mySeat.value === undefined) {
    return room.status === 'LOBBY' && !room.isFull
      ? '点击空位入座'
      : `房间已满，你正以旁观者身份观战（旁观 ${room.spectatorCount} 人）`
  }
  if (isOwner.value) {
    if (!room.isFull) return `还差 ${total.value - room.seatedCount} 人入座，点击空位可换座`
    if (!room.allReady) return '等待其他玩家准备'
    return '全员就绪，可以开始游戏'
  }
  return myReady.value ? '已准备，等待房主开始' : '准备后房主即可开局'
})

function joinRoom(): void {
  ws.send({ type: 'room.join', code: code.value })
}

async function enter(): Promise<void> {
  error.value = ''
  try {
    const auth = await user.ensureAuth()
    const info = await api.getRoom(code.value)
    if (info.status === 'CLOSED') {
      error.value = '房间已解散'
      return
    }
    marks.load(code.value)
    // 首次连接建立后声明加入；之后的重连由服务端按 uid 反查自动恢复，ws.ts 只补发 sync.request
    if (ws.connected) {
      joinRoom()
    } else {
      stopOpen = ws.onOpen(() => {
        stopOpen?.()
        stopOpen = undefined
        joinRoom()
      })
      ws.connect(auth.token)
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) error.value = '房间不存在或已解散'
    else if (err instanceof ApiError) error.value = err.message
    else if (err instanceof Error) error.value = err.message
    else error.value = '进入房间失败，请稍后再试'
  }
}

function withPending(ms: number, fn: () => void): void {
  if (pending.value) return
  pending.value = true
  fn()
  window.setTimeout(() => {
    pending.value = false
  }, ms)
}

function toggleReady(): void {
  withPending(600, () => ws.send({ type: 'room.ready', ready: !myReady.value }))
}

function start(): void {
  if (!room.canStart) return
  withPending(1500, () => ws.send({ type: 'game.start' }))
}

/** 大厅点击空位：入座 / 换座 */
function onSeatSelect(seat: number): void {
  if (!inLobby.value || pending.value) return
  const occupied = room.seats.some((s) => s.seat === seat)
  if (occupied || seat === mySeat.value) return
  withPending(400, () => ws.send({ type: 'room.sit', seat }))
}

async function copyLink(): Promise<void> {
  const ok = await copyText(shareUrl.value)
  copied.value = ok
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  copiedTimer = window.setTimeout(() => {
    copied.value = false
  }, 2000)
  if (!ok) error.value = '复制失败，请长按房间码手动复制'
}

async function invite(): Promise<void> {
  const data = { title: '阿瓦隆', text: `来一局阿瓦隆，房间码 ${code.value}`, url: shareUrl.value }
  try {
    if (navigator.share) {
      await navigator.share(data)
      return
    }
  } catch {
    // 用户取消分享或不支持：回退到复制
  }
  await copyLink()
}

function leave(): void {
  void voice.leave()
  ws.send({ type: 'room.leave' })
  ws.disconnect()
  room.reset()
  game.reset()
  void router.replace('/')
}

// 开局：收到进行中的 game.sync 即切换到桌面（桌面需要对局状态才能渲染）
watch(
  () => game.inGame,
  (started) => {
    if (started) void router.replace('/game')
  },
  { immediate: true },
)

onMounted(() => {
  nowTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 500)
  void enter()
})

onBeforeUnmount(() => {
  stopOpen?.()
  if (copiedTimer !== undefined) window.clearTimeout(copiedTimer)
  if (nowTimer !== undefined) window.clearInterval(nowTimer)
})
</script>

<template>
  <main class="page room">
    <header class="room__top">
      <button type="button" class="icon-btn" aria-label="退出房间" @click="leave">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <div class="room__code-wrap">
        <span class="room__label">房间码</span>
        <strong class="room__code serif" :aria-label="`房间码 ${code}`">{{ spacedCode }}</strong>
      </div>
      <div class="room__tools">
        <button type="button" class="room__tool" @click="copyLink">{{ copied ? '已复制' : '复制' }}</button>
        <button type="button" class="room__tool" @click="invite">邀请好友</button>
      </div>
    </header>

    <div v-if="error || room.closedReason" class="room__error">
      <p class="error-text" role="alert">{{ error || room.closedReason }}</p>
      <button type="button" class="btn btn-secondary room__error-btn" @click="leave">返回首页</button>
    </div>

    <template v-else>
      <SeatRing
        class="room__ring"
        :seats="ringSeats"
        :my-seat="mySeat"
        :total="total"
        :selectable="inLobby"
        @select="onSeatSelect"
      >
        <template #center>
          <div class="room__center-title serif">{{ room.seatedCount }} / {{ total }}</div>
          <div class="room__center-sub">{{ centerHint }}</div>
        </template>
      </SeatRing>

      <section v-if="mySeat !== undefined" class="room__voice" aria-label="语音">
        <VoiceBar />
        <span class="room__voice-tip">进入房间即可语音，开局后按阶段自动静音</span>
      </section>

      <section class="room__roles" aria-labelledby="roles-title">
        <h2 id="roles-title" class="section-title">本局角色</h2>
        <ul v-if="roles.length" class="room__role-list">
          <li
            v-for="(r, i) in roles"
            :key="`${r}-${i}`"
            class="chip"
            :class="roleSide(r) === 'GOOD' ? 'room__role--good' : 'room__role--evil'"
          >
            <span class="room__role-dot" aria-hidden="true"></span>
            {{ roleName(r) }}
          </li>
        </ul>
        <p v-else class="room__roles-empty">等待房间配置同步…</p>
      </section>

      <footer class="room__footer">
        <p class="room__hint" :class="{ 'room__hint--error': serverError }" aria-live="polite">
          {{ footerHint }}
        </p>
        <button
          v-if="isOwner"
          type="button"
          class="btn"
          :class="room.canStart ? 'btn-primary' : 'btn-disabled'"
          :disabled="!room.canStart || pending"
          @click="start"
        >
          开始游戏
        </button>
        <button
          v-else-if="mySeat !== undefined"
          type="button"
          class="btn"
          :class="myReady ? 'btn-secondary' : 'btn-primary'"
          :disabled="!inLobby || pending"
          @click="toggleReady"
        >
          {{ myReady ? '取消准备' : '准备' }}
        </button>
        <button v-else type="button" class="btn btn-disabled" disabled>旁观中</button>
      </footer>
    </template>
  </main>
</template>

<style scoped>
.room__top {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-left: -1.1rem;
}

.room__code-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.room__label {
  font-size: 1rem;
  letter-spacing: 0.1rem;
  color: var(--small);
}

.room__code {
  font-size: 2.2rem;
  font-weight: 900;
  letter-spacing: 0.2rem;
  line-height: 1.2;
  color: var(--text);
  white-space: nowrap;
}

.room__tools {
  display: flex;
  gap: 0.6rem;
  margin-left: auto;
}

.room__tool {
  min-height: 3.6rem;
  padding: 0 1.2rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.2rem;
  letter-spacing: 0.1rem;
  color: var(--muted);
  transition: color 200ms ease, border-color 200ms ease;
}

.room__tool:active {
  color: var(--gold);
  border-color: var(--gold-line);
}

/* 鼠标悬停：复制 / 邀请标签边框变金（触屏不受影响） */
@media (hover: hover) {
  .room__tool {
    transition-duration: 150ms;
  }

  .room__tool:hover {
    color: var(--gold);
    border-color: var(--gold);
  }
}

.room__error {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  margin-top: 4rem;
  text-align: center;
}

.room__error-btn {
  width: auto;
  align-self: center;
  padding: 0 3.2rem;
}

.room__center-title {
  font-size: 1.9rem;
  font-weight: 700;
  letter-spacing: 0.2rem;
  color: var(--gold);
}

.room__center-sub {
  font-size: 1.1rem;
  color: var(--muted);
}

.room__voice {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.4rem;
}

.room__voice-tip {
  font-size: 1.1rem;
  color: var(--small);
}

.room__roles {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.8rem;
}

.room__role-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.room__role-dot {
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
}

.room__role--good {
  border-color: rgba(76, 141, 255, 0.4);
}

.room__role--good .room__role-dot {
  background: var(--blue);
}

.room__role--evil {
  border-color: rgba(214, 69, 69, 0.4);
}

.room__role--evil .room__role-dot {
  background: var(--red);
}

.room__roles-empty {
  margin: 0;
  font-size: 1.2rem;
  color: var(--small);
}

.room__footer {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: auto;
  padding-top: 2rem;
}

.room__hint {
  min-height: 2rem;
  margin: 0;
  text-align: center;
  font-size: 1.2rem;
  color: var(--muted);
  transition: color 200ms ease;
}

.room__hint--error {
  color: var(--red);
}

/* 平板 ≥768px：单列，座位环放大到 56rem，准备 / 开始按钮限宽居中 */
@media (min-width: 768px) {
  .room__ring {
    --seat-ring-w: var(--ring-lg);
    --seat-ring-center: 14rem;
  }

  .room__center-title {
    font-size: 2.4rem;
  }

  .room__center-sub {
    font-size: 1.3rem;
  }

  .room__code {
    font-size: 2.8rem;
  }

  .room__label,
  .room__voice-tip,
  .room__roles-empty {
    font-size: 1.2rem;
  }

  .room__hint {
    font-size: 1.3rem;
  }

  .room__footer {
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
  }
}

/* 桌面 ≥1024px：双栏——左栏座位环，右栏依次为房间码卡片 / 语音 / 本局角色 / 准备或开始
   DOM 顺序不变，仅用 grid-template-areas 重排 */
@media (min-width: 1024px) {
  .room {
    display: grid;
    grid-template-columns: var(--ring-lg) minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr);
    grid-template-areas:
      'ring head'
      'ring voice'
      'ring roles'
      'ring footer';
    column-gap: var(--col-gap);
    align-items: start;
    min-height: 0;
  }

  /* 右栏区块间距用 margin 而非 row-gap：语音区不渲染（旁观者）时不会留下空行 */
  .room__voice,
  .room__roles,
  .room__footer {
    margin-top: 2rem;
  }

  /* 错误态（房间不存在 / 已解散）没有座位环，退回单列 */
  .room:has(.room__error) {
    display: flex;
    min-height: 100dvh;
  }

  /* 顶部信息行在右栏变为房间码卡片 */
  .room__top {
    grid-area: head;
    flex-wrap: wrap;
    gap: 1.2rem;
    margin-left: 0;
    padding: 1.4rem 1.6rem;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
  }

  .room__code-wrap {
    flex: 1;
  }

  .room__ring {
    grid-area: ring;
  }

  .room__voice {
    grid-area: voice;
  }

  .room__roles {
    grid-area: roles;
  }

  .room__footer {
    grid-area: footer;
    align-self: end;
    max-width: none;
    padding-top: 0;
  }
}
</style>
