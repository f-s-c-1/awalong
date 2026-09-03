import { VISION_HINTS, computeVision, sideOf } from '@awalong/shared'
import type { ClientGameState, SecretInfo } from '@awalong/shared'
import { shuffle, type Rng } from './rng'
import { rolesMap, type GameState } from './state'

/**
 * 按视角投影对局状态。所有玩家与旁观者拿到的公开态一致，
 * 身份与个人任务票永远不会出现在返回值中。
 */
export function projectFor(s: GameState, now: number): ClientGameState {
  return {
    roomCode: s.roomCode,
    version: s.version,
    phase: s.phase,
    playerCount: s.players.length,
    players: s.players.map((p) => ({
      seat: p.seat,
      uid: p.uid,
      nickname: p.nickname,
      avatar: p.avatar,
      online: p.online,
    })),
    roleConfig: [...s.settings.roles],
    settings: structuredClone(s.settings),
    questSizes: [...s.questSizes],
    questIndex: s.questIndex,
    questResults: [...s.questResults],
    leaderSeat: s.leaderSeat,
    voteRound: s.voteRound,
    currentTeam: [...s.currentTeam],
    teamVotedSeats: s.phase === 'TEAM_VOTE' ? Object.keys(s.teamVotes).map(Number) : [],
    teamVotes: s.phase === 'TEAM_VOTE' ? null : s.lastTeamVotes ? { ...s.lastTeamVotes } : null,
    questVotedCount: Object.keys(s.questVotes).length,
    questReveal: s.questReveal ? [...s.questReveal] : null,
    nightConfirmedSeats: [...s.nightConfirmed],
    history: structuredClone(s.history),
    deadline: s.deadline,
    serverTime: now,
    speaker: s.speaker ? { ...s.speaker } : null,
    winner: s.winner,
    winReason: s.winReason,
    assassinTarget: s.assassinTarget,
    revealedRoles: s.phase === 'GAME_OVER' ? rolesMap(s) : null,
  }
}

/** 某座位的私密信息：角色 + 洗乱后的视野名单 */
export function secretFor(s: GameState, seat: number, rng: Rng): SecretInfo {
  const roles = rolesMap(s)
  const role = roles[seat]
  if (!role) throw new Error(`座位 ${seat} 不存在`)
  return {
    seat,
    role,
    side: sideOf(role),
    visionSeats: shuffle(computeVision(seat, roles), rng),
    visionHint: VISION_HINTS[role],
  }
}
