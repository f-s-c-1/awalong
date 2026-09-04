import type { RoleId, RoomSettings, Side } from './types'

export const MIN_PLAYERS = 5
export const MAX_PLAYERS = 10

/** 人数 → [正义, 邪恶] */
export const PLAYER_CONFIG: Record<number, readonly [number, number]> = {
  5: [3, 2],
  6: [4, 2],
  7: [4, 3],
  8: [5, 3],
  9: [6, 3],
  10: [6, 4],
}

/** 人数 → 五轮任务队员数 */
export const QUEST_SIZE: Record<number, readonly number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}

export const MAX_VOTE_ROUNDS = 5
export const QUESTS_TO_WIN = 3

export const GOOD_ROLES: readonly RoleId[] = ['MERLIN', 'PERCIVAL', 'LOYAL']
export const EVIL_ROLES: readonly RoleId[] = ['MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON', 'MINION']

export const ROLE_NAMES: Record<RoleId, string> = {
  MERLIN: '梅林',
  PERCIVAL: '派西维尔',
  LOYAL: '忠臣',
  MORGANA: '莫甘娜',
  ASSASSIN: '刺客',
  MORDRED: '莫德雷德',
  OBERON: '奥伯伦',
  MINION: '爪牙',
}

/** 推荐板子 */
export const RECOMMENDED_ROLES: Record<number, readonly RoleId[]> = {
  5: ['MERLIN', 'PERCIVAL', 'LOYAL', 'MORGANA', 'ASSASSIN'],
  6: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN'],
  7: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'OBERON'],
  8: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'MINION'],
  9: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'MORDRED'],
  10: ['MERLIN', 'PERCIVAL', 'LOYAL', 'LOYAL', 'LOYAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON'],
}

export function sideOf(role: RoleId): Side {
  return (GOOD_ROLES as readonly string[]).includes(role) ? 'GOOD' : 'EVIL'
}

export function getQuestSizes(playerCount: number): readonly number[] {
  const sizes = QUEST_SIZE[playerCount]
  if (!sizes) throw new Error(`不支持的人数: ${playerCount}`)
  return sizes
}

/** 7 人及以上局，第 4 轮（索引 3）需要 2 张失败票 */
export function needsTwoFails(playerCount: number, questIndex: number): boolean {
  return playerCount >= 7 && questIndex === 3
}

export function failsNeeded(playerCount: number, questIndex: number): number {
  return needsTwoFails(playerCount, questIndex) ? 2 : 1
}

/** 表决需严格过半同意，平局即否决 */
export function isTeamApproved(votes: Record<number, boolean>, playerCount: number): boolean {
  const approves = Object.values(votes).filter(Boolean).length
  return approves * 2 > playerCount
}

export function isQuestFailed(failCount: number, playerCount: number, questIndex: number): boolean {
  return failCount >= failsNeeded(playerCount, questIndex)
}

/** 校验角色板子，返回错误列表（空数组即合法） */
export function validateRoles(playerCount: number, roles: readonly RoleId[]): string[] {
  const errors: string[] = []
  const config = PLAYER_CONFIG[playerCount]
  if (!config) {
    errors.push(`人数必须在 ${MIN_PLAYERS}-${MAX_PLAYERS} 之间`)
    return errors
  }
  const [goodCount, evilCount] = config
  if (roles.length !== playerCount) errors.push(`角色数量 ${roles.length} 与人数 ${playerCount} 不符`)
  const good = roles.filter((r) => sideOf(r) === 'GOOD').length
  const evil = roles.filter((r) => sideOf(r) === 'EVIL').length
  if (good !== goodCount) errors.push(`正义方应为 ${goodCount} 人，当前 ${good} 人`)
  if (evil !== evilCount) errors.push(`邪恶方应为 ${evilCount} 人，当前 ${evil} 人`)
  if (!roles.includes('MERLIN')) errors.push('梅林为必选角色')
  if (!roles.includes('ASSASSIN')) errors.push('刺客为必选角色')
  if (roles.includes('PERCIVAL') && !roles.includes('MORGANA')) errors.push('启用派西维尔必须同时启用莫甘娜')
  for (const unique of ['MERLIN', 'PERCIVAL', 'MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON'] as RoleId[]) {
    if (roles.filter((r) => r === unique).length > 1) errors.push(`${ROLE_NAMES[unique]} 只能有一位`)
  }
  return errors
}

export function defaultSettings(playerCount = 8): RoomSettings {
  return {
    playerCount,
    roles: [...(RECOMMENDED_ROLES[playerCount] ?? RECOMMENDED_ROLES[8]!)],
    allowMarks: true,
    speechMode: 'turns',
    turnSeconds: 30,
    ladyOfLake: false,
    pickSeconds: 60,
    voteSeconds: 30,
    questSeconds: 30,
    assassinSeconds: 60,
  }
}

export const VISION_HINTS: Record<RoleId, string> = {
  MERLIN: '以下玩家是邪恶方（莫德雷德除外）',
  PERCIVAL: '以下两人中，一位是梅林，另一位是莫甘娜',
  LOYAL: '你没有额外信息，凭表决记录与发言推理',
  MORGANA: '以下是你的同伴（奥伯伦不在名单中）',
  ASSASSIN: '以下是你的同伴（奥伯伦不在名单中）',
  MORDRED: '以下是你的同伴（奥伯伦不在名单中）',
  MINION: '以下是你的同伴（奥伯伦不在名单中）',
  OBERON: '你是邪恶方，但你不认识同伴，同伴也不认识你',
}

/**
 * 计算某座位的夜晚视野。roles 为 座位 → 角色 的完整映射。
 * 返回的座位顺序由调用方洗乱，避免顺序泄露信息。
 */
export function computeVision(seat: number, roles: Record<number, RoleId>): number[] {
  const role = roles[seat]
  if (!role) return []
  const others = Object.entries(roles)
    .map(([s, r]) => ({ seat: Number(s), role: r }))
    .filter((p) => p.seat !== seat)
  switch (role) {
    case 'MERLIN':
      return others.filter((p) => sideOf(p.role) === 'EVIL' && p.role !== 'MORDRED').map((p) => p.seat)
    case 'PERCIVAL':
      return others.filter((p) => p.role === 'MERLIN' || p.role === 'MORGANA').map((p) => p.seat)
    case 'MORGANA':
    case 'ASSASSIN':
    case 'MORDRED':
    case 'MINION':
      return others.filter((p) => sideOf(p.role) === 'EVIL' && p.role !== 'OBERON').map((p) => p.seat)
    case 'OBERON':
    case 'LOYAL':
      return []
  }
}
