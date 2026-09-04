// 快捷短语：id 与文案的映射。固定短语文案来自 @awalong/shared 的 PHRASES；「N 号可疑」按座位号动态生成
import { MAX_PLAYERS, PHRASES } from '@awalong/shared'

/** 固定短语 id（数组顺序即 chips 的展示顺序） */
export const FIXED_PHRASE_IDS = ['good', 'pick_me', 'reject'] as const

export type FixedPhraseId = (typeof FIXED_PHRASE_IDS)[number]

const SUSPECT_PREFIX = 'suspect:'

function isFixedPhraseId(id: string): id is FixedPhraseId {
  return (FIXED_PHRASE_IDS as readonly string[]).includes(id)
}

/** 座位号是否合法：1 到最大人数之间的整数 */
function isValidSeat(seat: number): boolean {
  return Number.isInteger(seat) && seat >= 1 && seat <= MAX_PLAYERS
}

/** 生成「N 号可疑」的短语 id */
export function suspectPhraseId(seat: number): string {
  return `${SUSPECT_PREFIX}${seat}`
}

/** 解析 `suspect:N` 中的座位号；不是 suspect 短语或 N 不合法时返回 null */
export function parseSuspectSeat(phraseId: string): number | null {
  if (!phraseId.startsWith(SUSPECT_PREFIX)) return null
  const raw = phraseId.slice(SUSPECT_PREFIX.length)
  // 只接受纯数字，排除 "+3"、"3.0"、" 3" 等 Number() 会宽松接受的写法
  if (!/^\d{1,2}$/.test(raw)) return null
  const seat = Number(raw)
  return isValidSeat(seat) ? seat : null
}

/** 短语 id 转展示文案；未知 id 返回空串 */
export function phraseText(phraseId: string): string {
  const seat = parseSuspectSeat(phraseId)
  if (seat !== null) return `${seat} ${PHRASES.suspect ?? '号可疑'}`
  if (isFixedPhraseId(phraseId)) return PHRASES[phraseId] ?? ''
  return ''
}

/**
 * 本局可发的短语 id：固定三条 + 除自己外每个座位一条「N 号可疑」。
 * 座位按传入顺序保留，去重并剔除不合法座位号。
 */
export function buildPhraseIds(seats: number[], mySeat?: number): string[] {
  const seen = new Set<number>()
  const suspects: string[] = []
  for (const seat of seats) {
    if (!isValidSeat(seat) || seat === mySeat || seen.has(seat)) continue
    seen.add(seat)
    suspects.push(suspectPhraseId(seat))
  }
  return [...FIXED_PHRASE_IDS, ...suspects]
}
