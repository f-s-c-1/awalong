// 预设头像：12 个以字符串 id 索引的单色描边 SVG 徽记（24×24 viewBox），后续可整体替换为角色剪影
// 服务端只校验 avatar 为 1-32 字符的字符串，未知 id 统一回退到第一个

export interface AvatarDef {
  id: string
  /** 名称（无障碍朗读与选择器标签） */
  name: string
  /** 底色：低饱和，与暗色桌面协调 */
  color: string
  /** 徽记路径（stroke 绘制） */
  path: string
}

const CROWN: AvatarDef = {
  id: 'crown',
  name: '王冠',
  color: '#55688F',
  path: 'M4 18h16M4 18L5.5 8l4.5 4L12 6l2 6 4.5-4L18.5 18',
}

export const AVATARS: readonly AvatarDef[] = [
  CROWN,
  {
    id: 'sword',
    name: '长剑',
    color: '#8A5A44',
    path: 'M12 3l2.5 3.5L13 15h-2L9.5 6.5zM7 16h10M12 16v5',
  },
  {
    id: 'shield',
    name: '盾牌',
    color: '#7A5CA8',
    path: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z',
  },
  {
    id: 'helm',
    name: '头盔',
    color: '#4E7A6A',
    path: 'M5 14a7 7 0 0 1 14 0v4h-4v-4h-6v4H5zM12 4v3',
  },
  {
    id: 'chalice',
    name: '圣杯',
    color: '#A8663F',
    path: 'M6 4h12v3c0 4-3 6-6 6s-6-2-6-6zM12 13v5M8 18h8',
  },
  {
    id: 'tower',
    name: '高塔',
    color: '#5F7A4E',
    path: 'M6 21V8h2V5h2v3h4V5h2v3h2v13M10 21v-5h4v5M5 21h14',
  },
  {
    id: 'key',
    name: '钥匙',
    color: '#9B6B8D',
    path: 'M12 9a4 4 0 1 1-8 0a4 4 0 0 1 8 0zM11 10.5l9 9M15.5 15l2-2M18 17.5l2-2',
  },
  {
    id: 'scroll',
    name: '卷轴',
    color: '#6B5E85',
    path: 'M7 4h12v13a3 3 0 0 1-3 3H5M7 4a2 2 0 0 0-2 2v2h4V6a2 2 0 0 0-2-2zM10 9h6M10 13h6',
  },
  {
    id: 'moon',
    name: '弯月',
    color: '#7A6A3F',
    path: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  },
  {
    id: 'star',
    name: '星辰',
    color: '#4F6E8A',
    path: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z',
  },
  {
    id: 'banner',
    name: '旗帜',
    color: '#8A4F5E',
    path: 'M6 21V4h11l-2.5 4L17 12H6',
  },
  {
    id: 'torch',
    name: '火炬',
    color: '#5E7A8A',
    path: 'M12 3c-3 3-4 5-4 7a4 4 0 0 0 8 0c0-2-1-4-4-7zM10 14l-1.5 7h7L14 14',
  },
]

export function isAvatarId(id: string): boolean {
  return AVATARS.some((a) => a.id === id)
}

/** 按 id 取头像定义；未知 id 回退到第一个 */
export function avatarById(id: string): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? CROWN
}
