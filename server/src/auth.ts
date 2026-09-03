import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from './config'

export interface AuthPayload {
  uid: string
}

export function newUid(): string {
  return `u_${randomBytes(8).toString('hex')}`
}

export function signToken(uid: string): string {
  return jwt.sign({ uid } satisfies AuthPayload, config.jwtSecret, { expiresIn: '180d' })
}

export function verifyToken(token: string | undefined): AuthPayload | null {
  if (!token) return null
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    if (typeof payload === 'object' && payload && typeof payload.uid === 'string') return { uid: payload.uid }
    return null
  } catch {
    return null
  }
}

export interface UserProfile {
  uid: string
  nickname: string
  avatar: string
}

/** 匿名用户档案（内存版，后续换 MySQL） */
export class UserStore {
  private users = new Map<string, UserProfile>()

  create(nickname: string, avatar: string): UserProfile {
    const user = { uid: newUid(), nickname, avatar }
    this.users.set(user.uid, user)
    return user
  }

  get(uid: string): UserProfile | undefined {
    return this.users.get(uid)
  }

  update(uid: string, patch: Partial<Pick<UserProfile, 'nickname' | 'avatar'>>): UserProfile | undefined {
    const user = this.users.get(uid)
    if (!user) return undefined
    Object.assign(user, patch)
    return user
  }
}
