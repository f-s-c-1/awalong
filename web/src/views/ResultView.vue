<script setup lang="ts">
// 结算页占位：胜负 + 胜因 + 全员身份（MatchSummary）；完整的复盘时间线与战报长图后续接入
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { sideOf } from '@awalong/shared'
import type { RoleId } from '@awalong/shared'
import SeatAvatar from '@/components/SeatAvatar.vue'
import * as sfx from '@/services/sfx'
import { ws } from '@/services/ws'
import { useGameStore } from '@/stores/game'
import { useRoomStore } from '@/stores/room'
import { useUserStore } from '@/stores/user'
import { roleName, sideName, winReasonText } from '@/utils/roles'

const router = useRouter()
const room = useRoomStore()
const game = useGameStore()
const user = useUserStore()

const summary = computed(() => game.summary)
const mySeat = computed(() => game.secret?.seat ?? game.seatOf(user.uid))
const isOwner = computed(() => room.isOwner(user.uid))

const winner = computed(() => summary.value?.winner ?? null)
const title = computed(() => (winner.value ? `${sideName(winner.value)}胜利` : '本局作废'))
const reason = computed(() => winReasonText(summary.value?.winReason))

/** 结算名单：身份来自 summary.roles，昵称 / 头像来自对局玩家表 */
const players = computed(() => {
  const roles = summary.value?.roles ?? {}
  return [...game.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const role: RoleId | undefined = roles[p.seat]
      return { ...p, role, side: role ? sideOf(role) : null }
    })
})

const merlinSeat = computed(() => {
  const roles = summary.value?.roles ?? {}
  const hit = Object.entries(roles).find(([, role]) => role === 'MERLIN')
  return hit ? Number(hit[0]) : null
})

function playAgain(): void {
  sfx.play('tap')
  ws.send({ type: 'game.again' })
}

// 进入结算：按本人阵营播放胜利 / 失败音效（旁观或作废局播放中性阶段音）
onMounted(() => {
  const side = game.secret?.side
  const w = winner.value
  if (!w || !side) sfx.play('phase')
  else sfx.play(w === side ? 'win' : 'lose')
  sfx.vibrate(w && side && w === side ? [60, 40, 60] : 80)
})

function backToRoom(): void {
  void router.replace(room.code ? `/r/${room.code}` : '/')
}

function leave(): void {
  ws.send({ type: 'room.leave' })
  ws.disconnect()
  room.reset()
  game.reset()
  void router.replace('/')
}

// 房主发起再来一局后服务端回到大厅，所有人一起返回房间页
watch(
  () => game.phase,
  (phase) => {
    if (phase === 'LOBBY') backToRoom()
  },
)
</script>

<template>
  <main class="page page--narrow result">
    <template v-if="summary">
      <header
        class="result__head"
        :class="{
          'result__head--good': winner === 'GOOD',
          'result__head--evil': winner === 'EVIL',
        }"
      >
        <svg class="result__shield" viewBox="0 0 40 44" fill="none" aria-hidden="true">
          <path d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
        </svg>
        <h1 class="result__title serif" data-test="result-title">{{ title }}</h1>
        <p class="result__reason">{{ reason }}</p>
      </header>

      <section class="result__players" aria-labelledby="reveal-title">
        <h2 id="reveal-title" class="section-title">身份揭示</h2>
        <ul class="result__list">
          <li v-for="p in players" :key="p.seat" class="result__item card">
            <SeatAvatar
              :seat="p.seat"
              :avatar="p.avatar"
              :nickname="p.nickname"
              :online="p.online"
              :me="p.seat === mySeat"
              :show-name="false"
            />
            <div class="result__info">
              <span class="result__name">
                {{ p.nickname }}<span v-if="p.seat === mySeat" class="result__me"> · 我</span>
              </span>
              <span
                class="result__role"
                :class="{
                  'result__role--good': p.side === 'GOOD',
                  'result__role--evil': p.side === 'EVIL',
                }"
              >
                {{ p.role ? roleName(p.role) : '未知' }}
              </span>
            </div>
            <span
              v-if="summary.assassinTarget === p.seat"
              class="result__tag"
              :class="{ 'result__tag--hit': merlinSeat === p.seat }"
            >
              {{ merlinSeat === p.seat ? '被刺中' : '被误刺' }}
            </span>
          </li>
        </ul>
      </section>

      <RouterLink class="result__records" to="/records">查看我的战绩</RouterLink>

      <footer class="result__footer">
        <button v-if="isOwner" type="button" class="btn btn-primary" data-test="play-again" @click="playAgain">再来一局</button>
        <button v-else type="button" class="btn btn-primary" data-test="back-room" @click="backToRoom">返回大厅</button>
        <button type="button" class="btn btn-secondary" @click="leave">退出房间</button>
      </footer>
    </template>

    <div v-else class="result__empty">
      <p class="result__empty-text">暂无结算数据</p>
      <RouterLink class="result__link" to="/">返回首页</RouterLink>
    </div>
  </main>
</template>

<style scoped>
.result__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 3.2rem 0 2.4rem;
  text-align: center;
}

.result__shield {
  width: 5.6rem;
  height: 6.2rem;
}

.result__shield path {
  fill: var(--border);
}

.result__head--good .result__shield path {
  fill: var(--blue);
}

.result__head--evil .result__shield path {
  fill: var(--red);
}

.result__title {
  margin: 0;
  font-size: 3.2rem;
  font-weight: 900;
  letter-spacing: 0.6rem;
  color: var(--muted);
}

.result__head--good .result__title {
  color: var(--blue);
}

.result__head--evil .result__title {
  color: var(--red);
}

.result__reason {
  margin: 0;
  font-size: 1.4rem;
  color: var(--muted);
}

.result__players {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.result__list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.result__item {
  display: flex;
  align-items: center;
  gap: 1.2rem;
  padding: 1rem 1.4rem;
}

.result__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.result__name {
  font-size: 1.4rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result__me {
  color: var(--gold);
}

.result__role {
  font-size: 1.2rem;
  color: var(--muted);
}

.result__role--good {
  color: var(--blue);
}

.result__role--evil {
  color: var(--red);
}

.result__tag {
  margin-left: auto;
  padding: 0.3rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  font-size: 1.1rem;
  color: var(--muted);
}

.result__tag--hit {
  border-color: rgba(214, 69, 69, 0.5);
  color: var(--red);
}

/* 战绩入口：文字链接，占据按钮区上方一行并把按钮区推到底部 */
.result__records {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  min-height: 4.4rem;
  margin-top: auto;
  padding: 2.4rem 1.2rem 0;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
  color: var(--gold);
  transition: color 200ms ease;
}

.result__footer {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding-top: 1.2rem;
}

.result__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
  margin: auto 0;
}

.result__empty-text {
  margin: 0;
  font-size: 1.4rem;
  color: var(--muted);
}

.result__link {
  display: inline-flex;
  align-items: center;
  min-height: 4.4rem;
  font-size: 1.3rem;
  letter-spacing: 0.2rem;
}

@media (hover: hover) {
  .result__records:hover {
    color: var(--gold-hover);
  }
}

/* 平板 / PC ≥768px：居中 56rem 单列（由 .page--narrow 提供），两个底部按钮并排 */
@media (min-width: 768px) {
  .result__title {
    font-size: 3.6rem;
  }

  .result__role,
  .result__tag {
    font-size: 1.3rem;
  }

  .result__footer {
    flex-direction: row;
    gap: 1.6rem;
  }

  .result__footer .btn {
    flex: 1;
  }
}
</style>
