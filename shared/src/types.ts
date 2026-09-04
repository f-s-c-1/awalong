export type Side = 'GOOD' | 'EVIL'

export type RoleId =
  | 'MERLIN'
  | 'PERCIVAL'
  | 'LOYAL'
  | 'MORGANA'
  | 'ASSASSIN'
  | 'MORDRED'
  | 'OBERON'
  | 'MINION'

export type Phase =
  | 'LOBBY'
  | 'NIGHT'
  | 'TEAM_PICK'
  | 'TEAM_VOTE'
  | 'QUEST'
  | 'ASSASSIN'
  | 'GAME_OVER'

export type QuestResult = 'S' | 'F'

export type SpeechMode = 'free' | 'turns'

export type WinReason =
  | 'THREE_QUESTS_GOOD'
  | 'THREE_QUESTS_EVIL'
  | 'FIVE_REJECTS'
  | 'ASSASSIN_HIT'
  | 'ASSASSIN_MISS'
  | 'ABORTED'

export interface RoomSettings {
  playerCount: number
  roles: RoleId[]
  allowMarks: boolean
  speechMode: SpeechMode
  turnSeconds: number
  ladyOfLake: boolean
  pickSeconds: number
  voteSeconds: number
  questSeconds: number
  assassinSeconds: number
}

export interface PlayerPublic {
  seat: number
  uid: string
  nickname: string
  avatar: string
  online: boolean
}

export interface RoundRecord {
  questIndex: number
  voteRound: number
  leaderSeat: number
  team: number[]
  teamVotes: Record<number, boolean>
  approved: boolean
  failCount?: number
  result?: QuestResult
}

/** 经视角过滤后下发给客户端的对局状态，不含任何身份信息 */
export interface ClientGameState {
  roomCode: string
  version: number
  phase: Phase
  playerCount: number
  players: PlayerPublic[]
  roleConfig: RoleId[]
  settings: RoomSettings
  questSizes: number[]
  questIndex: number
  questResults: QuestResult[]
  leaderSeat: number
  voteRound: number
  currentTeam: number[]
  /** 表决阶段：已投票的座位；亮票后为空 */
  teamVotedSeats: number[]
  /** 亮票后的公开表决结果 */
  teamVotes: Record<number, boolean> | null
  /** 任务阶段：已出票人数 */
  questVotedCount: number
  /** 揭晓时的洗乱票序 */
  questReveal: QuestResult[] | null
  nightConfirmedSeats: number[]
  history: RoundRecord[]
  deadline: number
  serverTime: number
  speaker: { seat: number; deadline: number } | null
  winner: Side | null
  winReason: WinReason | null
  assassinTarget: number | null
  /** 终局公开的全员身份 */
  revealedRoles: Record<number, RoleId> | null
}

export interface SecretInfo {
  seat: number
  role: RoleId
  side: Side
  visionSeats: number[]
  visionHint: string
}

export interface MatchSummary {
  roomCode: string
  playerCount: number
  winner: Side | null
  winReason: WinReason
  roles: Record<number, RoleId>
  history: RoundRecord[]
  assassinTarget: number | null
  startedAt: number
  endedAt: number
}

export interface MatchPlayer {
  seat: number
  uid: string
  nickname: string
  avatar: string
}

/** 落库的一局完整记录：结算摘要 + 记录 id + 玩家表（作废局不入库） */
export interface MatchRecord extends MatchSummary {
  id: string
  players: MatchPlayer[]
}

/** 「我的战绩」列表项：以查看者视角标注座位、角色与胜负 */
export interface MatchListItem {
  id: string
  roomCode: string
  playerCount: number
  winner: Side | null
  winReason: WinReason
  startedAt: number
  endedAt: number
  mySeat: number
  myRole: RoleId
  mySide: Side
  won: boolean
}

export interface MatchStats {
  games: number
  wins: number
  goodGames: number
  goodWins: number
  evilGames: number
  evilWins: number
  asMerlin: number
  merlinSurvived: number
  asAssassin: number
  assassinHits: number
}

export interface MyMatchesResponse {
  total: number
  stats: MatchStats
  items: MatchListItem[]
}
