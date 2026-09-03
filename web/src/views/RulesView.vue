<script setup lang="ts">
// 规则说明：阵营与胜负 / 一局流程 / 角色一览 / 人数配置 / 推荐板子 / 任务队员数（数据表全部来自 @awalong/shared）
import { RECOMMENDED_ROLES, ROLE_NAMES, needsTwoFails, sideOf } from '@awalong/shared'
import type { RoleId, Side } from '@awalong/shared'
import { useRouter } from 'vue-router'
import { PLAYER_COUNTS, playerConfigFor, questSizesFor } from '@/utils/rules'
import { ROLE_INTRO, ROLE_ORDER } from '@/utils/roles'

const router = useRouter()

const steps = [
  {
    title: '夜晚 · 确认身份',
    desc: '邪恶方互认队友，梅林看见邪恶方，派西维尔看见梅林与莫甘娜',
  },
  {
    title: '组队 · 全员表决',
    desc: '队长提名队员，全员同时亮票表决；连续 5 次流局，邪恶方直接获胜',
  },
  {
    title: '任务 · 秘密出票',
    desc: '队员暗投成功或失败，出现失败票任务即告失败（7 人以上第 4 轮需 2 张失败票）',
  },
  {
    title: '刺杀 · 终局翻盘',
    desc: '正义方三胜后，刺客指认梅林，命中则邪恶方反败为胜',
  },
]

/** 把板子数组格式化为「梅林、派西维尔、忠臣×2 / 莫甘娜、刺客」 */
function boardText(roles: readonly RoleId[]): string {
  const part = (side: Side): string => {
    const counts = new Map<RoleId, number>()
    roles.filter((r) => sideOf(r) === side).forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1))
    return [...counts].map(([r, n]) => (n > 1 ? `${ROLE_NAMES[r]}×${n}` : ROLE_NAMES[r])).join('、')
  }
  return `${part('GOOD')} / ${part('EVIL')}`
}

const boards = PLAYER_COUNTS.map((n) => ({ n, text: boardText(RECOMMENDED_ROLES[n] ?? []) }))
const configRows = PLAYER_COUNTS.map((n) => ({ n, cfg: playerConfigFor(n) }))
const questRows = PLAYER_COUNTS.map((n) => ({
  n,
  sizes: questSizesFor(n).map((size, i) => ({ size, twoFails: needsTwoFails(n, i) })),
}))
const questCols = [1, 2, 3, 4, 5]

const roleCards = ROLE_ORDER.map((id) => ({
  id,
  name: ROLE_NAMES[id],
  side: sideOf(id),
  ...ROLE_INTRO[id],
}))

function back(): void {
  if (window.history.length > 1) router.back()
  else void router.replace('/')
}
</script>

<template>
  <main class="page page--narrow rules">
    <header class="rules__head">
      <button type="button" class="icon-btn" aria-label="返回" @click="back">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
      <h1 class="rules__title serif">游戏介绍</h1>
    </header>

    <section class="rules__section" aria-labelledby="sides-title">
      <h2 id="sides-title" class="section-title">阵营与胜负</h2>
      <div class="sides">
        <div class="side side--good">
          <div class="side__head">
            <svg class="side__shield" viewBox="0 0 40 44" fill="none" aria-hidden="true">
              <path d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
            </svg>
            <span class="side__name">正义方</span>
          </div>
          <p class="side__desc">完成 3 轮任务，并在终局守住梅林的身份</p>
        </div>
        <div class="side side--evil">
          <div class="side__head">
            <svg class="side__shield" viewBox="0 0 40 44" fill="none" aria-hidden="true">
              <path d="M20 3 L35 9 V21 C35 33 20 41 20 41 C20 41 5 33 5 21 V9 Z" />
            </svg>
            <span class="side__name">邪恶方</span>
          </div>
          <p class="side__desc">破坏 3 轮任务，或在终局刺杀梅林逆转取胜</p>
        </div>
      </div>
    </section>

    <section class="rules__section" aria-labelledby="flow-title">
      <h2 id="flow-title" class="section-title">一局流程</h2>
      <ol class="steps">
        <li v-for="(step, i) in steps" :key="i" class="step">
          <span class="step__no serif" aria-hidden="true">{{ i + 1 }}</span>
          <div class="step__body">
            <span class="step__title">{{ step.title }}</span>
            <span class="step__desc">{{ step.desc }}</span>
          </div>
        </li>
      </ol>
    </section>

    <section class="rules__section" aria-labelledby="roles-title">
      <h2 id="roles-title" class="section-title">角色一览</h2>
      <ul class="roles">
        <li
          v-for="card in roleCards"
          :key="card.id"
          class="role"
          :class="card.side === 'GOOD' ? 'role--good' : 'role--evil'"
        >
          <span class="role__name">{{ card.name }}</span>
          <span class="role__brief">{{ card.brief }}</span>
          <span class="role__desc">{{ card.desc }}</span>
        </li>
      </ul>
    </section>

    <section class="rules__section rules__section--config" aria-labelledby="config-title">
      <h2 id="config-title" class="section-title">人数配置</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">玩家数</th>
              <th scope="col" class="table__good">正义方</th>
              <th scope="col" class="table__evil">邪恶方</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in configRows" :key="row.n">
              <th scope="row">{{ row.n }}</th>
              <td>{{ row.cfg?.[0] ?? '-' }}</td>
              <td>{{ row.cfg?.[1] ?? '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="boards" aria-label="推荐板子">
        <li v-for="b in boards" :key="b.n" class="boards__item">
          <span class="boards__n mono">{{ b.n }} 人</span>
          <span class="boards__text">{{ b.text }}</span>
        </li>
      </ul>
    </section>

    <section class="rules__section" aria-labelledby="quest-title">
      <h2 id="quest-title" class="section-title">每轮任务队员数</h2>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">玩家数</th>
              <th v-for="c in questCols" :key="c" scope="col">任务{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in questRows" :key="row.n">
              <th scope="row">{{ row.n }}</th>
              <td v-for="(cell, i) in row.sizes" :key="i">
                {{ cell.size }}<span v-if="cell.twoFails" class="table__star" aria-label="需 2 张失败票">*</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="rules__note">* 7 人及以上局的第 4 轮任务需要 2 张失败票才算失败，其余任务 1 张失败票即失败</p>
    </section>

    <section class="rules__section" aria-labelledby="online-title">
      <h2 id="online-title" class="section-title">线上规则</h2>
      <ul class="notes">
        <li>正义方界面只有「成功」牌；邪恶方可出「成功」或「失败」</li>
        <li>组队表决需严格过半同意，平局视为否决</li>
        <li>断线玩家保留座位 120 秒；关键阶段超时按默认值处理（表决视为反对，出票视为成功）</li>
        <li>满员开局后进入者为旁观者，只能看到公开信息</li>
        <li>私人标记只保存在本机，对局结束自动清除</li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.rules {
  gap: 2.6rem;
}

.rules__head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-left: -1.1rem;
}

.rules__title {
  margin: 0;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.4rem;
}

.rules__section {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.sides {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.4rem;
  border-radius: 1rem;
  background: var(--surface);
  border: 1px solid var(--line);
}

.side--good {
  border-color: rgba(76, 141, 255, 0.4);
}

.side--evil {
  border-color: rgba(214, 69, 69, 0.4);
}

.side__head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.side__shield {
  width: 1.6rem;
  height: 1.8rem;
}

.side--good .side__shield path {
  fill: var(--blue);
}

.side--evil .side__shield path {
  fill: var(--red);
}

.side__name {
  font-size: 1.5rem;
  font-weight: 700;
}

.side--good .side__name {
  color: var(--blue);
}

.side--evil .side__name {
  color: var(--red);
}

.side__desc {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.7;
  color: var(--muted);
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: flex;
  gap: 1.2rem;
}

.step__no {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 50%;
  border: 1px solid var(--gold);
  font-size: 1.3rem;
  color: var(--gold);
}

.step__body {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.step__title {
  font-size: 1.4rem;
  font-weight: 600;
}

.step__desc {
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--muted);
}

.roles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.role {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1.2rem;
  border-radius: 0.8rem;
  background: var(--surface);
  border: 1px solid var(--line);
}

.role--good {
  border-color: rgba(76, 141, 255, 0.4);
}

.role--evil {
  border-color: rgba(214, 69, 69, 0.4);
}

.role__name {
  font-size: 1.3rem;
  font-weight: 600;
}

.role__brief {
  font-size: 1rem;
  color: var(--muted);
}

.role__desc {
  margin-top: 0.4rem;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--muted);
}

.table-wrap {
  overflow-x: auto;
  border-radius: 0.8rem;
  border: 1px solid var(--line);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 1.2rem;
  text-align: center;
}

.table th,
.table td {
  padding: 0.8rem 0.6rem;
  border-bottom: 1px solid var(--line);
}

.table thead th {
  background: var(--surface);
  font-weight: 600;
  color: var(--muted);
}

.table tbody th {
  font-weight: 600;
  color: var(--text);
}

.table tbody tr:last-child th,
.table tbody tr:last-child td {
  border-bottom: 0;
}

.table__good {
  color: var(--blue);
}

.table__evil {
  color: var(--red);
}

.table__star {
  margin-left: 0.2rem;
  color: var(--gold);
}

.boards {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.boards__item {
  display: flex;
  gap: 1rem;
  font-size: 1.1rem;
  line-height: 1.6;
}

.boards__n {
  flex-shrink: 0;
  width: 4rem;
  color: var(--gold);
}

.boards__text {
  color: var(--muted);
}

.rules__note {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.6;
  color: var(--small);
}

.notes {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin: 0;
  padding-left: 1.6rem;
  font-size: 1.2rem;
  line-height: 1.6;
  color: var(--muted);
}

/* 平板 / PC ≥768px：居中 56rem 单列（由 .page--narrow 提供），正文字号提到 13px 以上 */
@media (min-width: 768px) {
  .rules {
    gap: 3.2rem;
  }

  .rules__title {
    font-size: 2.4rem;
  }

  .side__desc,
  .step__desc,
  .role__desc,
  .boards__item,
  .rules__note {
    font-size: 1.3rem;
  }

  .step__title {
    font-size: 1.5rem;
  }

  .role__name {
    font-size: 1.4rem;
  }

  .role__brief {
    font-size: 1.2rem;
  }

  .table,
  .notes {
    font-size: 1.3rem;
  }
}

/* 桌面 ≥1024px：内容页拉宽后，角色四列、流程两列，表格与板子并排 */
@media (min-width: 1024px) {
  .rules {
    gap: 4rem;
  }

  .rules__title {
    font-size: 2.8rem;
  }

  .sides {
    gap: 1.6rem;
  }

  .side {
    padding: 2rem;
  }

  .side__name {
    font-size: 1.8rem;
  }

  .side__desc {
    font-size: 1.4rem;
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2rem 3.2rem;
  }

  .step__title {
    font-size: 1.6rem;
  }

  .step__desc {
    font-size: 1.35rem;
  }

  .roles {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1.2rem;
  }

  .role {
    padding: 1.6rem;
  }

  .role__name {
    font-size: 1.6rem;
  }

  .role__brief {
    font-size: 1.25rem;
  }

  .role__desc {
    font-size: 1.3rem;
  }

  .rules__section--config {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 1.2rem 3.2rem;
  }

  .rules__section--config .section-title {
    grid-column: 1 / -1;
  }

  .boards {
    gap: 1rem;
  }

  .boards__item {
    font-size: 1.35rem;
  }

  .table {
    font-size: 1.4rem;
  }

  .table th,
  .table td {
    padding: 1rem 0.8rem;
  }

  .notes {
    font-size: 1.4rem;
    gap: 1rem;
  }
}
</style>
