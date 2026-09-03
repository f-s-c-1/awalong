// 角色与胜因的展示文案（角色名与阵营判定来自 @awalong/shared，这里只补充说明文字）
import { ROLE_NAMES, sideOf } from '@awalong/shared'
import type { RoleId, Side, WinReason } from '@awalong/shared'

export interface RoleIntro {
  /** 一句话简介（角色一览卡片） */
  brief: string
  /** 完整说明（来自 docs/01-游戏规则） */
  desc: string
}

export const ROLE_INTRO: Record<RoleId, RoleIntro> = {
  MERLIN: {
    brief: '知晓邪恶',
    desc: '知道所有邪恶方成员（莫德雷德除外），但不能暴露自己，被刺杀则正义方失败',
  },
  PERCIVAL: {
    brief: '识别梅林',
    desc: '能看到梅林与莫甘娜，但无法区分谁是谁',
  },
  LOYAL: {
    brief: '凭推理而战',
    desc: '没有额外信息，凭表决记录与发言推理',
  },
  MORGANA: {
    brief: '伪装梅林',
    desc: '在派西维尔眼中与梅林无法区分',
  },
  ASSASSIN: {
    brief: '终局一击',
    desc: '正义方完成 3 轮任务后，可指定刺杀一人，刺中梅林则邪恶方反败为胜',
  },
  MORDRED: {
    brief: '隐于梅林',
    desc: '梅林看不到他，但邪恶方同伴可见',
  },
  OBERON: {
    brief: '孤狼邪徒',
    desc: '邪恶方互相不认识他，他也不认识队友',
  },
  MINION: {
    brief: '普通邪徒',
    desc: '普通邪恶方成员，夜晚与同伴互认',
  },
}

/** 角色一览的展示顺序：正义在前，邪恶在后 */
export const ROLE_ORDER: readonly RoleId[] = [
  'MERLIN',
  'PERCIVAL',
  'LOYAL',
  'MORGANA',
  'ASSASSIN',
  'MORDRED',
  'OBERON',
  'MINION',
]

export function roleName(id: RoleId): string {
  return ROLE_NAMES[id]
}

export function roleSide(id: RoleId): Side {
  return sideOf(id)
}

export function sideName(side: Side): string {
  return side === 'GOOD' ? '正义方' : '邪恶方'
}

export const WIN_REASON_TEXT: Record<WinReason, string> = {
  THREE_QUESTS_GOOD: '正义方完成了 3 轮任务',
  THREE_QUESTS_EVIL: '邪恶方破坏了 3 轮任务',
  FIVE_REJECTS: '连续 5 次组队被否决',
  ASSASSIN_HIT: '刺客刺中了梅林',
  ASSASSIN_MISS: '刺客刺错了目标，梅林安然无恙',
  ABORTED: '本局已作废，不计战绩',
}

export function winReasonText(reason: WinReason | null | undefined): string {
  return reason ? WIN_REASON_TEXT[reason] : ''
}
