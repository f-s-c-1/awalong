import type { Phase, QuestResult, RoleId, RoomSettings, RoundRecord, Side, WinReason } from '@awalong/shared'

export interface PlayerState {
  seat: number
  uid: string
  nickname: string
  avatar: string
  online: boolean
  role: RoleId
}

/** 服务端权威对局状态，含全部身份信息，绝不直接下发 */
export interface GameState {
  roomCode: string
  version: number
  phase: Phase
  settings: RoomSettings
  players: PlayerState[]
  questSizes: number[]
  questIndex: number
  questResults: QuestResult[]
  leaderSeat: number
  voteRound: number
  currentTeam: number[]
  teamVotes: Record<number, boolean>
  lastTeamVotes: Record<number, boolean> | null
  questVotes: Record<number, QuestResult>
  questReveal: QuestResult[] | null
  nightConfirmed: number[]
  history: RoundRecord[]
  deadline: number
  speaker: { seat: number; deadline: number } | null
  winner: Side | null
  winReason: WinReason | null
  assassinTarget: number | null
  startedAt: number
  endedAt: number | null
}

export function playerAt(state: GameState, seat: number): PlayerState {
  const p = state.players.find((x) => x.seat === seat)
  if (!p) throw new Error(`座位 ${seat} 不存在`)
  return p
}

export function rolesMap(state: GameState): Record<number, RoleId> {
  const map: Record<number, RoleId> = {}
  for (const p of state.players) map[p.seat] = p.role
  return map
}

export function nextSeat(state: GameState, seat: number): number {
  const seats = state.players.map((p) => p.seat).sort((a, b) => a - b)
  const idx = seats.indexOf(seat)
  return seats[(idx + 1) % seats.length]!
}
