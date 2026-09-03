// 规则表访问助手：规则只在 @awalong/shared 写一份，这里仅做安全取值（人数非法时不抛错）
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_CONFIG, QUEST_SIZE, needsTwoFails } from '@awalong/shared'

/** 支持的人数 5-10 */
export const PLAYER_COUNTS: readonly number[] = Array.from(
  { length: MAX_PLAYERS - MIN_PLAYERS + 1 },
  (_, i) => MIN_PLAYERS + i,
)

/** 某人数下 5 轮任务的队员数；人数不合法返回空数组 */
export function questSizesFor(playerCount: number): readonly number[] {
  return QUEST_SIZE[playerCount] ?? []
}

/** 某人数下的 [正义, 邪恶] 人数；人数不合法返回 null */
export function playerConfigFor(playerCount: number): readonly [number, number] | null {
  return PLAYER_CONFIG[playerCount] ?? null
}

/** 需要 2 张失败票的任务索引（0-4）；没有则返回 undefined */
export function twoFailsIndexFor(playerCount: number): number | undefined {
  for (let i = 0; i < 5; i += 1) {
    if (needsTwoFails(playerCount, i)) return i
  }
  return undefined
}
