import { describe, expect, it } from 'vitest'
import { RECOMMENDED_ROLES, defaultSettings, sideOf } from '@awalong/shared'
import type { RoleId } from '@awalong/shared'
import { GameError, createGame, reduce, seatOfRole, type Action, type Effect } from '../src/game/fsm'
import { projectFor, secretFor } from '../src/game/projection'
import { seededRng, type Rng } from '../src/game/rng'
import type { GameState } from '../src/game/state'

const T0 = 1_700_000_000_000

function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    seat: i + 1,
    uid: `u${i + 1}`,
    nickname: `P${i + 1}`,
    avatar: 'a1',
    online: true,
  }))
}

function setup(n = 8, seed = 1, roles?: RoleId[]) {
  const rng = seededRng(seed)
  const settings = { ...defaultSettings(n), roles: roles ?? [...RECOMMENDED_ROLES[n]!] }
  const r = createGame({ roomCode: '483920', settings, players: makePlayers(n), now: T0, rng })
  return { state: r.state, effects: r.effects, rng }
}

class Runner {
  effects: Effect[] = []
  constructor(
    public state: GameState,
    public rng: Rng,
  ) {}

  do(action: Action) {
    const r = reduce(this.state, action, this.rng)
    this.state = r.state
    this.effects.push(...r.effects)
    return r
  }

  confirmAll(now = T0) {
    for (const p of this.state.players) this.do({ type: 'NIGHT_CONFIRM', seat: p.seat, now })
  }

  /** 队长选队，全员按 approvers 表决 */
  pick(team: number[], approvers: number[] | 'all', now = T0) {
    this.do({ type: 'TEAM_PICK', seat: this.state.leaderSeat, team, now })
    for (const p of this.state.players) {
      const approve = approvers === 'all' ? true : approvers.includes(p.seat)
      this.do({ type: 'TEAM_VOTE', seat: p.seat, approve, now })
    }
  }

  /** 队员出票：evilFails 指定要打失败票的邪恶方座位 */
  quest(evilFails: number[] = [], now = T0) {
    for (const seat of this.state.currentTeam) {
      this.do({ type: 'QUEST_VOTE', seat, success: !evilFails.includes(seat), now })
    }
  }

  goodSeats() {
    return this.state.players.filter((p) => sideOf(p.role) === 'GOOD').map((p) => p.seat)
  }

  evilSeats() {
    return this.state.players.filter((p) => sideOf(p.role) === 'EVIL').map((p) => p.seat)
  }

  /** 组一支全好人队（队长优先），供"成功任务"用 */
  goodTeam(): number[] {
    const size = this.state.questSizes[this.state.questIndex]!
    const good = this.goodSeats()
    const leader = this.state.leaderSeat
    const rest = good.filter((s) => s !== leader)
    const team = good.includes(leader) ? [leader, ...rest] : [...rest]
    if (team.length < size) throw new Error('好人不够组队')
    return team.slice(0, size)
  }

  /** 组一支包含指定邪恶方的队伍 */
  teamWith(evil: number[]): number[] {
    const size = this.state.questSizes[this.state.questIndex]!
    const leader = this.state.leaderSeat
    const base = [leader, ...evil.filter((s) => s !== leader)]
    const fill = this.goodSeats().filter((s) => !base.includes(s))
    return [...base, ...fill].slice(0, size)
  }
}

describe('创建对局', () => {
  it('发牌后进入夜晚，角色数与板子一致，每人一张', () => {
    const { state, effects } = setup(8)
    expect(state.phase).toBe('NIGHT')
    expect(state.players.map((p) => p.role).sort()).toEqual([...RECOMMENDED_ROLES[8]!].sort())
    expect(effects.map((e) => e.kind)).toEqual(['secrets', 'voice', 'timer'])
    expect(state.questSizes).toEqual([3, 4, 4, 5, 5])
  })

  it('人数与配置不符或板子非法时拒绝开局', () => {
    const rng = seededRng(1)
    expect(() =>
      createGame({ roomCode: 'x', settings: defaultSettings(8), players: makePlayers(7), now: T0, rng }),
    ).toThrow(GameError)
    const bad = { ...defaultSettings(5), roles: ['MERLIN', 'PERCIVAL', 'LOYAL', 'ASSASSIN', 'MINION'] as RoleId[] }
    expect(() => createGame({ roomCode: 'x', settings: bad, players: makePlayers(5), now: T0, rng })).toThrow(
      /莫甘娜/,
    )
  })

  it('同一种子发牌可重放，不同种子发牌不同', () => {
    const a = setup(8, 7).state.players.map((p) => p.role)
    const b = setup(8, 7).state.players.map((p) => p.role)
    const c = setup(8, 8).state.players.map((p) => p.role)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('夜晚与组队', () => {
  it('全员确认后进入组队，超时也进入组队', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    expect(r.state.phase).toBe('TEAM_PICK')
    expect(r.state.currentTeam).toEqual([])

    const t = new Runner(setup(5).state, rng)
    t.do({ type: 'TIMEOUT', version: t.state.version, now: T0 + 1 })
    expect(t.state.phase).toBe('TEAM_PICK')
  })

  it('过期版本的超时被忽略', () => {
    const { state, rng } = setup(5)
    const r = reduce(state, { type: 'TIMEOUT', version: state.version - 1, now: T0 }, rng)
    expect(r.state).toBe(state)
    expect(r.effects).toEqual([])
  })

  it('只有队长能组队，队伍人数必须匹配', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    const notLeader = r.state.players.find((p) => p.seat !== r.state.leaderSeat)!.seat
    expect(() => r.do({ type: 'TEAM_PICK', seat: notLeader, team: [1, 2], now: T0 })).toThrow(/队长/)
    expect(() => r.do({ type: 'TEAM_PICK', seat: r.state.leaderSeat, team: [1, 2, 3], now: T0 })).toThrow(/2 名/)
    expect(() => r.do({ type: 'TEAM_PICK', seat: r.state.leaderSeat, team: [1, 1], now: T0 })).toThrow(/重复/)
  })

  it('组队超时自动补齐并进入表决，队长必在队内', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const leader = r.state.leaderSeat
    r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 })
    expect(r.state.phase).toBe('TEAM_VOTE')
    expect(r.state.currentTeam).toHaveLength(3)
    expect(r.state.currentTeam).toContain(leader)
  })
})

describe('表决', () => {
  it('过半通过进入任务并记录历史，队长顺移', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const leader = r.state.leaderSeat
    r.pick(r.goodTeam(), 'all')
    expect(r.state.phase).toBe('QUEST')
    expect(r.state.history).toHaveLength(1)
    expect(r.state.history[0]!.approved).toBe(true)
    expect(r.state.leaderSeat).toBe((leader % 8) + 1)
    expect(r.effects.some((e) => e.kind === 'teamReveal')).toBe(true)
  })

  it('平局否决，流局计数加一', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    r.pick(r.goodTeam(), [1, 2, 3, 4])
    expect(r.state.phase).toBe('TEAM_PICK')
    expect(r.state.voteRound).toBe(2)
    expect(r.state.history[0]!.approved).toBe(false)
  })

  it('连续 5 次否决邪恶方获胜', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    for (let i = 0; i < 5; i++) {
      r.pick(r.goodTeam(), [])
    }
    expect(r.state.phase).toBe('GAME_OVER')
    expect(r.state.winner).toBe('EVIL')
    expect(r.state.winReason).toBe('FIVE_REJECTS')
    expect(r.state.history).toHaveLength(5)
  })

  it('不能重复表决；表决超时未投视为反对', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    r.do({ type: 'TEAM_PICK', seat: r.state.leaderSeat, team: r.goodTeam(), now: T0 })
    r.do({ type: 'TEAM_VOTE', seat: 1, approve: true, now: T0 })
    expect(() => r.do({ type: 'TEAM_VOTE', seat: 1, approve: true, now: T0 })).toThrow(/已经表决/)
    r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 })
    expect(r.state.history[0]!.teamVotes).toEqual({ 1: true, 2: false, 3: false, 4: false, 5: false })
    expect(r.state.history[0]!.approved).toBe(false)
  })
})

describe('任务', () => {
  it('正义方不能打失败票，非队员不能出票', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const evil = r.evilSeats()
    r.pick(r.teamWith([evil[0]!]), 'all')
    const good = r.state.currentTeam.find((s) => !evil.includes(s))!
    expect(() => r.do({ type: 'QUEST_VOTE', seat: good, success: false, now: T0 })).toThrow(/正义方/)
    const outsider = r.state.players.find((p) => !r.state.currentTeam.includes(p.seat))!.seat
    expect(() => r.do({ type: 'QUEST_VOTE', seat: outsider, success: true, now: T0 })).toThrow(/不在出征/)
  })

  it('一张失败票即任务失败，票序被洗乱后揭晓', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const evil = r.evilSeats()
    r.pick(r.teamWith([evil[0]!]), 'all')
    r.quest([evil[0]!])
    expect(r.state.questResults).toEqual(['F'])
    expect(r.state.history[0]!.failCount).toBe(1)
    const reveal = r.effects.find((e) => e.kind === 'questReveal')!
    expect(reveal.kind === 'questReveal' && reveal.cards.sort()).toEqual(['F', 'S', 'S'])
    expect(r.state.phase).toBe('TEAM_PICK')
    expect(r.state.questIndex).toBe(1)
    expect(r.state.voteRound).toBe(1)
  })

  it('8 人局第 4 轮需要 2 张失败票', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const evil = r.evilSeats()
    r.pick(r.goodTeam(), 'all')
    r.quest()
    r.pick(r.teamWith([evil[0]!]), 'all')
    r.quest([evil[0]!])
    r.pick(r.teamWith([evil[0]!]), 'all')
    r.quest([evil[0]!])
    expect(r.state.questResults).toEqual(['S', 'F', 'F'])
    expect(r.state.questIndex).toBe(3)
    r.pick(r.teamWith([evil[0]!]), 'all')
    r.quest([evil[0]!])
    expect(r.state.questResults).toEqual(['S', 'F', 'F', 'S'])
    expect(r.state.phase).toBe('TEAM_PICK')
  })

  it('出票超时未出视为成功', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    r.pick(r.goodTeam(), 'all')
    r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 })
    expect(r.state.questResults).toEqual(['S'])
  })

  it('邪恶方三次任务失败直接获胜', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const evil = r.evilSeats()
    for (let i = 0; i < 3; i++) {
      r.pick(r.teamWith([evil[0]!]), 'all')
      r.quest([evil[0]!])
    }
    expect(r.state.phase).toBe('GAME_OVER')
    expect(r.state.winner).toBe('EVIL')
    expect(r.state.winReason).toBe('THREE_QUESTS_EVIL')
  })
})

describe('刺杀', () => {
  function reachAssassin(n = 8, seed = 3) {
    const { state, rng } = setup(n, seed)
    const r = new Runner(state, rng)
    r.confirmAll()
    while (r.state.phase !== 'ASSASSIN') {
      r.pick(r.goodTeam(), 'all')
      r.quest()
    }
    return r
  }

  it('正义方三胜后进入刺杀，语音仅邪恶方互通', () => {
    const r = reachAssassin()
    expect(r.state.questResults).toEqual(['S', 'S', 'S'])
    const voice = r.effects.filter((e) => e.kind === 'voice').pop()!
    expect(voice.kind === 'voice' && voice.policy.publishSeats?.sort()).toEqual(r.evilSeats().sort())
  })

  it('刺中梅林邪恶方获胜，刺错正义方获胜', () => {
    const hit = reachAssassin()
    const assassin = seatOfRole(hit.state, 'ASSASSIN')!
    const merlin = seatOfRole(hit.state, 'MERLIN')!
    hit.do({ type: 'ASSASSIN_KILL', seat: assassin, target: merlin, now: T0 })
    expect(hit.state.winner).toBe('EVIL')
    expect(hit.state.winReason).toBe('ASSASSIN_HIT')
    expect(hit.state.assassinTarget).toBe(merlin)

    const miss = reachAssassin()
    const a2 = seatOfRole(miss.state, 'ASSASSIN')!
    const loyal = seatOfRole(miss.state, 'LOYAL')!
    miss.do({ type: 'ASSASSIN_KILL', seat: a2, target: loyal, now: T0 })
    expect(miss.state.winner).toBe('GOOD')
    expect(miss.state.winReason).toBe('ASSASSIN_MISS')
  })

  it('非刺客不能刺杀，不能刺杀邪恶方；超时视为刺杀失败', () => {
    const r = reachAssassin()
    const assassin = seatOfRole(r.state, 'ASSASSIN')!
    const merlin = seatOfRole(r.state, 'MERLIN')!
    const morgana = seatOfRole(r.state, 'MORGANA')!
    expect(() => r.do({ type: 'ASSASSIN_KILL', seat: merlin, target: merlin, now: T0 })).toThrow(/刺客/)
    expect(() => r.do({ type: 'ASSASSIN_KILL', seat: assassin, target: morgana, now: T0 })).toThrow(/邪恶方/)
    r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 })
    expect(r.state.winner).toBe('GOOD')
    expect(r.state.winReason).toBe('ASSASSIN_MISS')
    expect(() => r.do({ type: 'NIGHT_CONFIRM', seat: 1, now: T0 })).toThrow(/已结束/)
  })

  it('结算摘要包含全员身份与历史', () => {
    const r = reachAssassin()
    const assassin = seatOfRole(r.state, 'ASSASSIN')!
    r.do({ type: 'ASSASSIN_KILL', seat: assassin, target: seatOfRole(r.state, 'MERLIN')!, now: T0 + 5 })
    const over = r.effects.find((e) => e.kind === 'gameOver')!
    expect(over.kind === 'gameOver' && Object.keys(over.summary.roles)).toHaveLength(8)
    expect(over.kind === 'gameOver' && over.summary.history.length).toBe(3)
    expect(over.kind === 'gameOver' && over.summary.endedAt).toBe(T0 + 5)
  })
})

describe('视角投影与私密信息', () => {
  it('公开态不含任何身份或个人任务票', () => {
    const { state, rng } = setup(8)
    const r = new Runner(state, rng)
    r.confirmAll()
    const evil = r.evilSeats()
    r.pick(r.teamWith([evil[0]!]), 'all')
    r.do({ type: 'QUEST_VOTE', seat: evil[0]!, success: false, now: T0 })
    const json = JSON.stringify(projectFor(r.state, T0))
    expect(json).not.toMatch(/"role":/)
    expect(json).not.toMatch(/"side":/)
    expect(json).not.toMatch(/questVotes/)
    const view = projectFor(r.state, T0)
    expect(view.players.every((p) => !('role' in p))).toBe(true)
    expect(view.questVotedCount).toBe(1)
    expect(view.revealedRoles).toBeNull()
  })

  it('表决进行中只公开谁已投，亮票后公开票面', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.confirmAll()
    r.do({ type: 'TEAM_PICK', seat: r.state.leaderSeat, team: r.goodTeam(), now: T0 })
    r.do({ type: 'TEAM_VOTE', seat: 2, approve: false, now: T0 })
    let view = projectFor(r.state, T0)
    expect(view.teamVotedSeats).toEqual([2])
    expect(view.teamVotes).toBeNull()
    for (const seat of [1, 3, 4, 5]) r.do({ type: 'TEAM_VOTE', seat, approve: true, now: T0 })
    view = projectFor(r.state, T0)
    expect(view.teamVotes).toEqual({ 1: true, 2: false, 3: true, 4: true, 5: true })
  })

  it('终局公开全员身份', () => {
    const { state, rng } = setup(5)
    const r = new Runner(state, rng)
    r.do({ type: 'ABORT', now: T0 })
    const view = projectFor(r.state, T0)
    expect(view.phase).toBe('GAME_OVER')
    expect(Object.keys(view.revealedRoles ?? {})).toHaveLength(5)
    expect(view.winReason).toBe('ABORTED')
  })

  it('私密信息按角色给出视野，梅林看不到莫德雷德', () => {
    const roles: RoleId[] = ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'MORDRED']
    const { state, rng } = setup(8, 2, roles)
    const merlin = seatOfRole(state, 'MERLIN')!
    const secret = secretFor(state, merlin, rng)
    expect(secret.side).toBe('GOOD')
    expect(secret.visionSeats.sort()).toEqual([seatOfRole(state, 'MORGANA'), seatOfRole(state, 'ASSASSIN')].sort())
    const percival = secretFor(state, seatOfRole(state, 'PERCIVAL')!, rng)
    expect(percival.visionSeats.sort()).toEqual([merlin, seatOfRole(state, 'MORGANA')!].sort())
  })
})

describe('轮流发言模式', () => {
  it('组队后从队长下一位开始轮流，说完或超时轮转，轮完进入表决计时', () => {
    const rng = seededRng(5)
    const settings = { ...defaultSettings(5), speechMode: 'turns' as const, turnSeconds: 10 }
    const created = createGame({ roomCode: 'r', settings, players: makePlayers(5), now: T0, rng })
    const r = new Runner(created.state, rng)
    r.confirmAll()
    const leader = r.state.leaderSeat
    r.do({ type: 'TEAM_PICK', seat: leader, team: r.goodTeam(), now: T0 })
    expect(r.state.speaker?.seat).toBe((leader % 5) + 1)
    r.do({ type: 'SPEAKER_DONE', seat: r.state.speaker!.seat, now: T0 + 3000 })
    expect(r.state.speaker?.seat).toBe(((leader + 1) % 5) + 1)
    for (let i = 0; i < 3; i++) r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 + 10_000 * (i + 1) })
    expect(r.state.speaker?.seat).toBe(leader)
    r.do({ type: 'TIMEOUT', version: r.state.version, now: T0 + 40_000 })
    expect(r.state.speaker).toBeNull()
    expect(r.state.phase).toBe('TEAM_VOTE')
    expect(() => r.do({ type: 'SPEAKER_DONE', seat: 1, now: T0 })).toThrow(/发言轮次/)
  })
})

describe('随机合法动作模糊测试', () => {
  function legalActions(s: GameState): Action[] {
    const now = T0
    switch (s.phase) {
      case 'NIGHT':
        return s.players.filter((p) => !s.nightConfirmed.includes(p.seat)).map((p) => ({ type: 'NIGHT_CONFIRM', seat: p.seat, now }))
      case 'TEAM_PICK': {
        const size = s.questSizes[s.questIndex]!
        const seats = s.players.map((p) => p.seat)
        return [{ type: 'TEAM_PICK', seat: s.leaderSeat, team: seats.slice(0, size), now }, { type: 'TIMEOUT', version: s.version, now }]
      }
      case 'TEAM_VOTE':
        return s.players
          .filter((p) => !(p.seat in s.teamVotes))
          .flatMap((p) => [
            { type: 'TEAM_VOTE', seat: p.seat, approve: true, now } as Action,
            { type: 'TEAM_VOTE', seat: p.seat, approve: false, now } as Action,
          ])
          .concat([{ type: 'TIMEOUT', version: s.version, now }])
      case 'QUEST':
        return s.currentTeam
          .filter((seat) => !(seat in s.questVotes))
          .flatMap((seat) => {
            const good = sideOf(s.players.find((p) => p.seat === seat)!.role) === 'GOOD'
            const acts: Action[] = [{ type: 'QUEST_VOTE', seat, success: true, now }]
            if (!good) acts.push({ type: 'QUEST_VOTE', seat, success: false, now })
            return acts
          })
          .concat([{ type: 'TIMEOUT', version: s.version, now }])
      case 'ASSASSIN': {
        const assassin = s.players.find((p) => p.role === 'ASSASSIN')!.seat
        return s.players
          .filter((p) => sideOf(p.role) === 'GOOD')
          .map((p) => ({ type: 'ASSASSIN_KILL', seat: assassin, target: p.seat, now }) as Action)
          .concat([{ type: 'TIMEOUT', version: s.version, now }])
      }
      default:
        return []
    }
  }

  it('任意人数、任意合法序列都能终局且不抛错', () => {
    for (let n = 5; n <= 10; n++) {
      for (let seed = 1; seed <= 20; seed++) {
        const rng = seededRng(seed * 100 + n)
        const created = createGame({
          roomCode: 'fuzz',
          settings: { ...defaultSettings(n), roles: [...RECOMMENDED_ROLES[n]!] },
          players: makePlayers(n),
          now: T0,
          rng,
        })
        let state = created.state
        let steps = 0
        while (state.phase !== 'GAME_OVER') {
          const options = legalActions(state)
          expect(options.length).toBeGreaterThan(0)
          const action = options[Math.floor(rng.next() * options.length)]!
          state = reduce(state, action, rng).state
          steps += 1
          if (steps > 2000) throw new Error(`n=${n} seed=${seed} 超过 2000 步未终局`)
        }
        expect(state.winner === 'GOOD' || state.winner === 'EVIL').toBe(true)
        expect(state.questResults.length).toBeLessThanOrEqual(5)
        expect(state.history.length).toBeGreaterThan(0)
        expect(JSON.stringify(projectFor(state, T0)).includes('"questVotes"')).toBe(false)
      }
    }
  })
})
