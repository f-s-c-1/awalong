// 纯前端视图模型类型（与协议无关；协议类型一律从 @awalong/shared 导入）

/** 私人标记种类：疑好 / 疑坏 / 存疑 */
export type MarkKind = 'good' | 'evil' | 'unsure'

/** 座位环渲染单元 */
export interface RingSeat {
  seat: number
  nickname: string
  /** 头像 id（空位为空串） */
  avatar: string
  online: boolean
  /** 空位（大厅未坐满） */
  empty?: boolean
  ready?: boolean
  isLeader?: boolean
  /** 被提名出征 */
  selected?: boolean
  /** 已投票（表决进行中） */
  voted?: boolean
  /** 本机私人标记 */
  mark?: MarkKind
  /** 正在说话（语音音浪） */
  speaking?: boolean
}
