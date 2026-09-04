import {
  MAX_VOTE_ROUNDS,
  QUESTS_TO_WIN,
  getQuestSizes,
  isQuestFailed,
  isTeamApproved,
  sideOf,
  validateRoles,
} from '@awalong/shared'
import type { MatchSummary, QuestResult, RoleId, RoomSettings, Side, VoicePolicy, WinReason } from '@awalong/shared'
import { pickOne, shuffle, type Rng } from './rng'
import { nextSeat, playerAt, rolesMap, type GameState, type PlayerState } from './state'

export const NIGHT_MS = 90_000

export type Action =
  | { type: 'NIGHT_CONFIRM'; seat: number; now: number }
  | { type: 'TEAM_PICK'; seat: number; team: number[]; now: number }
  | { type: 'TEAM_VOTE'; seat: number; approve: boolean; now: number }
  | { type: 'QUEST_VOTE'; seat: number; success: boolean; now: number }
  | { type: 'ASSASSIN_KILL'; seat: number; target: number; now: number }
  | { type: 'SPEAKER_DONE'; seat: number; now: number }
  | { type: 'TIMEOUT'; version: number; now: number }
  | { type: 'PLAYER_ONLINE'; seat: number; online: boolean; now: number }
  | { type: 'ABORT'; now: number }

export type Effect =
  | { kind: 'secrets' }
  | { kind: 'timer'; ms: number }
  | { kind: 'clearTimer' }
  | { kind: 'teamReveal'; votes: Record<number, boolean>; approved: boolean }
  | { kind: 'questReveal'; cards: QuestResult[]; failed: boolean }
  | { kind: 'voice'; policy: VoicePolicy }
  | { kind: 'speaker'; seat: number; deadline: number }
  | { kind: 'gameOver'; summary: MatchSummary }

export interface ReduceResult {
  state: GameState
  effects: Effect[]
}

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const VOICE_FREE: VoicePolicy = { muteAll: false, publishSeats: null, subscribeSeats: null }
const VOICE_MUTED: VoicePolicy = { muteAll: true, publishSeats: null, subscribeSeats: null }
/** 轮流发言：只有当前发言者可开麦，其余人只能听 */
const speakerOnly = (seat: number): VoicePolicy => ({ muteAll: false, publishSeats: [seat], subscribeSeats: null })

export interface CreateGameInput {
  roomCode: string
  settings: RoomSettings
  players: Omit<PlayerState, 'role'>[]
  now: number
  rng: Rng
}

export function createGame(input: CreateGameInput): ReduceResult {
  const { roomCode, settings, players, now, rng } = input
  const n = players.length
  if (n !== settings.playerCount) throw new GameError('PLAYER_COUNT', `在座 ${n} 人与配置 ${settings.playerCount} 人不符`)
  const errors = validateRoles(n, settings.roles)
  if (errors.length) throw new GameError('INVALID_ROLES', errors.join('；'))

  const seats = [...players].sort((a, b) => a.seat - b.seat)
  const roles = shuffle(settings.roles, rng)
  const assigned: PlayerState[] = seats.map((p, i) => ({ ...p, role: roles[i]! }))

  const state: GameState = {
    roomCode,
    version: 1,
    phase: 'NIGHT',
    settings,
    players: assigned,
    questSizes: [...getQuestSizes(n)],
    questIndex: 0,
    questResults: [],
    leaderSeat: pickOne(assigned, rng).seat,
    voteRound: 1,
    currentTeam: [],
    teamVotes: {},
    lastTeamVotes: null,
    questVotes: {},
    questReveal: null,
    nightConfirmed: [],
    history: [],
    deadline: now + NIGHT_MS,
    speaker: null,
    winner: null,
    winReason: null,
    assassinTarget: null,
    startedAt: now,
    endedAt: null,
  }
  return {
    state,
    effects: [{ kind: 'secrets' }, { kind: 'voice', policy: VOICE_MUTED }, { kind: 'timer', ms: NIGHT_MS }],
  }
}

export function reduce(prev: GameState, action: Action, rng: Rng): ReduceResult {
  if (action.type === 'TIMEOUT' && action.version !== prev.version) {
    return { state: prev, effects: [] }
  }
  const s: GameState = structuredClone(prev)
  const effects: Effect[] = []
  s.version += 1

  if (s.phase === 'GAME_OVER' && action.type !== 'PLAYER_ONLINE') {
    throw new GameError('GAME_OVER', '对局已结束')
  }

  switch (action.type) {
    case 'PLAYER_ONLINE':
      playerAt(s, action.seat).online = action.online
      return { state: s, effects }

    case 'ABORT':
      finish(s, effects, null, 'ABORTED', action.now)
      return { state: s, effects }

    case 'NIGHT_CONFIRM': {
      expectPhase(s, 'NIGHT')
      if (!s.nightConfirmed.includes(action.seat)) s.nightConfirmed.push(action.seat)
      if (s.nightConfirmed.length >= s.players.length) startTeamPick(s, effects, action.now, rng)
      return { state: s, effects }
    }

    case 'TEAM_PICK': {
      expectPhase(s, 'TEAM_PICK')
      if (action.seat !== s.leaderSeat) throw new GameError('NOT_LEADER', '只有队长可以组队')
      validateTeam(s, action.team)
      startTeamVote(s, effects, action.team, action.now)
      return { state: s, effects }
    }

    case 'TEAM_VOTE': {
      expectPhase(s, 'TEAM_VOTE')
      playerAt(s, action.seat)
      if (s.speaker) throw new GameError('SPEAKING', '轮流发言尚未结束，全员发言后再表决')
      if (action.seat in s.teamVotes) throw new GameError('ALREADY_VOTED', '已经表决过了')
      s.teamVotes[action.seat] = action.approve
      if (Object.keys(s.teamVotes).length >= s.players.length) resolveTeamVote(s, effects, action.now, rng)
      return { state: s, effects }
    }

    case 'QUEST_VOTE': {
      expectPhase(s, 'QUEST')
      if (!s.currentTeam.includes(action.seat)) throw new GameError('NOT_IN_TEAM', '你不在出征队伍中')
      if (action.seat in s.questVotes) throw new GameError('ALREADY_VOTED', '已经出票了')
      const role = playerAt(s, action.seat).role
      if (!action.success && sideOf(role) === 'GOOD') throw new GameError('GOOD_CANNOT_FAIL', '正义方只能打出任务成功')
      s.questVotes[action.seat] = action.success ? 'S' : 'F'
      if (Object.keys(s.questVotes).length >= s.currentTeam.length) resolveQuest(s, effects, action.now, rng)
      return { state: s, effects }
    }

    case 'ASSASSIN_KILL': {
      expectPhase(s, 'ASSASSIN')
      const assassin = s.players.find((p) => p.role === 'ASSASSIN')
      if (!assassin || assassin.seat !== action.seat) throw new GameError('NOT_ASSASSIN', '只有刺客可以刺杀')
      const target = playerAt(s, action.target)
      if (sideOf(target.role) === 'EVIL') throw new GameError('BAD_TARGET', '不能刺杀邪恶方成员')
      s.assassinTarget = action.target
      if (target.role === 'MERLIN') finish(s, effects, 'EVIL', 'ASSASSIN_HIT', action.now)
      else finish(s, effects, 'GOOD', 'ASSASSIN_MISS', action.now)
      return { state: s, effects }
    }

    case 'SPEAKER_DONE': {
      if (!s.speaker || s.speaker.seat !== action.seat) throw new GameError('NOT_SPEAKER', '当前不是你的发言轮次')
      advanceSpeaker(s, effects, action.now)
      return { state: s, effects }
    }

    case 'TIMEOUT':
      handleTimeout(s, effects, action.now, rng)
      return { state: s, effects }
  }
}

function expectPhase(s: GameState, phase: GameState['phase']): void {
  if (s.phase !== phase) throw new GameError('WRONG_PHASE', `当前阶段为 ${s.phase}，不能执行该操作`)
}

function validateTeam(s: GameState, team: number[]): void {
  const size = s.questSizes[s.questIndex]!
  if (team.length !== size) throw new GameError('TEAM_SIZE', `本轮需要 ${size} 名队员`)
  if (new Set(team).size !== team.length) throw new GameError('TEAM_DUP', '队员重复')
  for (const seat of team) playerAt(s, seat)
}

function startTeamPick(s: GameState, effects: Effect[], now: number, rng: Rng): void {
  s.phase = 'TEAM_PICK'
  s.currentTeam = []
  s.teamVotes = {}
  s.questVotes = {}
  s.questReveal = null
  s.deadline = now + s.settings.pickSeconds * 1000
  s.speaker = null
  effects.push({ kind: 'voice', policy: VOICE_FREE }, { kind: 'timer', ms: s.settings.pickSeconds * 1000 })
  void rng
}

function startTeamVote(s: GameState, effects: Effect[], team: number[], now: number): void {
  s.phase = 'TEAM_VOTE'
  s.currentTeam = [...team].sort((a, b) => a - b)
  s.teamVotes = {}
  if (s.settings.speechMode === 'turns') {
    const seats = s.players.map((p) => p.seat).sort((a, b) => a - b)
    const startIdx = seats.indexOf(s.leaderSeat)
    const first = seats[(startIdx + 1) % seats.length]!
    const deadline = now + s.settings.turnSeconds * 1000
    s.speaker = { seat: first, deadline }
    effects.push({ kind: 'speaker', seat: first, deadline }, { kind: 'voice', policy: speakerOnly(first) })
    s.deadline = now + (s.settings.turnSeconds * seats.length + s.settings.voteSeconds) * 1000
  } else {
    s.deadline = now + s.settings.voteSeconds * 1000
  }
  effects.push({ kind: 'timer', ms: s.deadline - now })
}

/** 发言顺序：队长下一位开始，顺时针一圈，队长最后发言 */
function advanceSpeaker(s: GameState, effects: Effect[], now: number): void {
  if (!s.speaker) return
  const next = nextSeat(s, s.speaker.seat)
  if (next === nextSeat(s, s.leaderSeat)) {
    // 一圈说完：恢复自由发言，进入表决
    s.speaker = null
    effects.push({ kind: 'voice', policy: VOICE_FREE })
    return
  }
  const deadline = now + s.settings.turnSeconds * 1000
  s.speaker = { seat: next, deadline }
  effects.push({ kind: 'speaker', seat: next, deadline }, { kind: 'voice', policy: speakerOnly(next) })
}

function resolveTeamVote(s: GameState, effects: Effect[], now: number, rng: Rng): void {
  const votes = { ...s.teamVotes }
  const approved = isTeamApproved(votes, s.players.length)
  s.history.push({
    questIndex: s.questIndex,
    voteRound: s.voteRound,
    leaderSeat: s.leaderSeat,
    team: [...s.currentTeam],
    teamVotes: votes,
    approved,
  })
  s.lastTeamVotes = votes
  s.speaker = null
  effects.push({ kind: 'teamReveal', votes, approved })
  s.leaderSeat = nextSeat(s, s.leaderSeat)

  if (approved) {
    s.phase = 'QUEST'
    s.questVotes = {}
    s.deadline = now + s.settings.questSeconds * 1000
    effects.push({ kind: 'voice', policy: VOICE_MUTED }, { kind: 'timer', ms: s.settings.questSeconds * 1000 })
    return
  }
  if (s.voteRound >= MAX_VOTE_ROUNDS) {
    finish(s, effects, 'EVIL', 'FIVE_REJECTS', now)
    return
  }
  s.voteRound += 1
  startTeamPick(s, effects, now, rng)
}

function resolveQuest(s: GameState, effects: Effect[], now: number, rng: Rng): void {
  const votes = Object.values(s.questVotes)
  const failCount = votes.filter((v) => v === 'F').length
  const failed = isQuestFailed(failCount, s.players.length, s.questIndex)
  const cards = shuffle(votes, rng)
  const result: QuestResult = failed ? 'F' : 'S'
  s.questResults.push(result)
  s.questReveal = cards
  const record = s.history[s.history.length - 1]
  if (record) {
    record.failCount = failCount
    record.result = result
  }
  effects.push({ kind: 'questReveal', cards, failed })

  const goodWins = s.questResults.filter((r) => r === 'S').length
  const evilWins = s.questResults.filter((r) => r === 'F').length
  if (goodWins >= QUESTS_TO_WIN) {
    s.phase = 'ASSASSIN'
    s.deadline = now + s.settings.assassinSeconds * 1000
    const evilSeats = s.players.filter((p) => sideOf(p.role) === 'EVIL').map((p) => p.seat)
    effects.push(
      { kind: 'voice', policy: { muteAll: false, publishSeats: evilSeats, subscribeSeats: evilSeats } },
      { kind: 'timer', ms: s.settings.assassinSeconds * 1000 },
    )
    return
  }
  if (evilWins >= QUESTS_TO_WIN) {
    finish(s, effects, 'EVIL', 'THREE_QUESTS_EVIL', now)
    return
  }
  s.questIndex += 1
  s.voteRound = 1
  startTeamPick(s, effects, now, rng)
}

function handleTimeout(s: GameState, effects: Effect[], now: number, rng: Rng): void {
  switch (s.phase) {
    case 'NIGHT':
      startTeamPick(s, effects, now, rng)
      return
    case 'TEAM_PICK': {
      const size = s.questSizes[s.questIndex]!
      const others = shuffle(
        s.players.map((p) => p.seat).filter((seat) => seat !== s.leaderSeat),
        rng,
      )
      const team = [s.leaderSeat, ...others.slice(0, size - 1)]
      startTeamVote(s, effects, team, now)
      return
    }
    case 'TEAM_VOTE': {
      if (s.speaker) {
        advanceSpeaker(s, effects, now)
        if (s.speaker) {
          effects.push({ kind: 'timer', ms: s.speaker.deadline - now })
          return
        }
        s.deadline = now + s.settings.voteSeconds * 1000
        effects.push({ kind: 'timer', ms: s.settings.voteSeconds * 1000 })
        return
      }
      for (const p of s.players) if (!(p.seat in s.teamVotes)) s.teamVotes[p.seat] = false
      resolveTeamVote(s, effects, now, rng)
      return
    }
    case 'QUEST': {
      for (const seat of s.currentTeam) if (!(seat in s.questVotes)) s.questVotes[seat] = 'S'
      resolveQuest(s, effects, now, rng)
      return
    }
    case 'ASSASSIN':
      s.assassinTarget = null
      finish(s, effects, 'GOOD', 'ASSASSIN_MISS', now)
      return
    default:
      return
  }
}

function finish(s: GameState, effects: Effect[], winner: Side | null, reason: WinReason, now: number): void {
  s.phase = 'GAME_OVER'
  s.winner = winner
  s.winReason = reason
  s.endedAt = now
  s.deadline = 0
  s.speaker = null
  effects.push({ kind: 'clearTimer' }, { kind: 'voice', policy: VOICE_FREE }, { kind: 'gameOver', summary: summarize(s) })
}

export function summarize(s: GameState): MatchSummary {
  return {
    roomCode: s.roomCode,
    playerCount: s.players.length,
    winner: s.winner,
    winReason: s.winReason ?? 'ABORTED',
    roles: rolesMap(s),
    history: structuredClone(s.history),
    assassinTarget: s.assassinTarget,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? s.startedAt,
  }
}

export function seatOfRole(s: GameState, role: RoleId): number | null {
  return s.players.find((p) => p.role === role)?.seat ?? null
}
