import { describe, expect, it } from 'vitest'
import {
  PLAYER_CONFIG,
  QUEST_SIZE,
  RECOMMENDED_ROLES,
  computeVision,
  failsNeeded,
  getQuestSizes,
  isQuestFailed,
  isTeamApproved,
  needsTwoFails,
  sideOf,
  validateRoles,
} from '../src/rules'
import type { RoleId } from '../src/types'

describe('人数与任务配置表', () => {
  it('5-10 人每档都有配置且正邪之和等于人数', () => {
    for (let n = 5; n <= 10; n++) {
      const [good, evil] = PLAYER_CONFIG[n]!
      expect(good + evil).toBe(n)
      expect(QUEST_SIZE[n]).toHaveLength(5)
      expect(getQuestSizes(n)).toEqual(QUEST_SIZE[n])
    }
  })

  it('不支持的人数抛错', () => {
    expect(() => getQuestSizes(4)).toThrow()
    expect(() => getQuestSizes(11)).toThrow()
  })

  it('仅 7 人以上第 4 轮需要 2 张失败票', () => {
    for (let n = 5; n <= 10; n++) {
      for (let q = 0; q < 5; q++) {
        expect(needsTwoFails(n, q)).toBe(n >= 7 && q === 3)
        expect(failsNeeded(n, q)).toBe(n >= 7 && q === 3 ? 2 : 1)
      }
    }
  })
})

describe('表决与任务判定', () => {
  it('严格过半通过，平局否决', () => {
    expect(isTeamApproved({ 1: true, 2: true, 3: true, 4: true, 5: true, 6: false, 7: false, 8: false }, 8)).toBe(true)
    expect(isTeamApproved({ 1: true, 2: true, 3: true, 4: true, 5: false, 6: false, 7: false, 8: false }, 8)).toBe(false)
    expect(isTeamApproved({ 1: true, 2: true, 3: true, 4: false, 5: false }, 5)).toBe(true)
    expect(isTeamApproved({ 1: true, 2: true, 3: false, 4: false, 5: false }, 5)).toBe(false)
  })

  it('任务失败阈值', () => {
    expect(isQuestFailed(1, 5, 0)).toBe(true)
    expect(isQuestFailed(0, 5, 0)).toBe(false)
    expect(isQuestFailed(1, 8, 3)).toBe(false)
    expect(isQuestFailed(2, 8, 3)).toBe(true)
  })
})

describe('角色板子校验', () => {
  it('推荐板子全部合法', () => {
    for (let n = 5; n <= 10; n++) {
      expect(validateRoles(n, RECOMMENDED_ROLES[n]!)).toEqual([])
    }
  })

  it('派西维尔必须搭配莫甘娜', () => {
    const roles: RoleId[] = ['MERLIN', 'PERCIVAL', 'LOYAL', 'ASSASSIN', 'MINION']
    expect(validateRoles(5, roles)).toContain('启用派西维尔必须同时启用莫甘娜')
  })

  it('缺少梅林或刺客报错', () => {
    expect(validateRoles(5, ['LOYAL', 'LOYAL', 'LOYAL', 'MINION', 'MINION'])).toEqual(
      expect.arrayContaining(['梅林为必选角色', '刺客为必选角色']),
    )
  })

  it('阵营人数不符报错', () => {
    const roles: RoleId[] = ['MERLIN', 'LOYAL', 'LOYAL', 'LOYAL', 'ASSASSIN']
    const errors = validateRoles(5, roles)
    expect(errors.some((e) => e.includes('正义方应为 3 人'))).toBe(true)
    expect(errors.some((e) => e.includes('邪恶方应为 2 人'))).toBe(true)
  })

  it('唯一角色不能重复', () => {
    const roles: RoleId[] = ['MERLIN', 'MERLIN', 'LOYAL', 'MORGANA', 'ASSASSIN']
    expect(validateRoles(5, roles)).toContain('梅林 只能有一位')
  })
})

describe('夜晚视野', () => {
  const roles: Record<number, RoleId> = {
    1: 'PERCIVAL',
    2: 'MORGANA',
    3: 'LOYAL',
    4: 'LOYAL',
    5: 'MERLIN',
    6: 'LOYAL',
    7: 'MORDRED',
    8: 'ASSASSIN',
  }

  it('梅林看见邪恶方但看不见莫德雷德', () => {
    expect(computeVision(5, roles).sort()).toEqual([2, 8])
  })

  it('派西维尔看见梅林与莫甘娜', () => {
    expect(computeVision(1, roles).sort()).toEqual([2, 5])
  })

  it('邪恶方互认（含莫德雷德），不含自己', () => {
    expect(computeVision(2, roles).sort()).toEqual([7, 8])
    expect(computeVision(7, roles).sort()).toEqual([2, 8])
  })

  it('忠臣无视野', () => {
    expect(computeVision(3, roles)).toEqual([])
  })

  it('奥伯伦不被同伴看见且自己无视野', () => {
    const withOberon: Record<number, RoleId> = { ...roles, 7: 'OBERON' }
    expect(computeVision(7, withOberon)).toEqual([])
    expect(computeVision(2, withOberon).sort()).toEqual([8])
    expect(computeVision(5, withOberon).sort()).toEqual([2, 7, 8])
  })

  it('阵营判定', () => {
    expect(sideOf('MERLIN')).toBe('GOOD')
    expect(sideOf('OBERON')).toBe('EVIL')
  })
})
