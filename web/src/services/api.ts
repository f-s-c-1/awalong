// REST 封装（与 server/src/http/routes.ts 一致）：匿名登录、我的资料、房间、语音凭证；自动携带 Bearer
import type { RoomSync } from '@awalong/shared'
import { local } from '@/utils/storage'

const AUTH_KEY = 'avalon.auth'
const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

/** 本地保存的凭证 */
export interface AuthInfo {
  uid: string
  token: string
}

/** 昵称与头像（匿名登录、更新资料共用；两者均不能为空） */
export interface AuthProfile {
  nickname: string
  avatar: string
}

/** POST /api/auth/anon 响应 */
export interface AuthResponse extends AuthInfo, AuthProfile {}

/** GET /api/me 响应 */
export interface MeResponse extends AuthProfile {
  uid: string
  roomCode: string | null
}

/** GET /api/rooms/:code 响应 */
export interface RoomInfo {
  code: string
  status: RoomSync['status']
  playerCount: number
  seated: number
  spectatorCount: number
}

/** POST /api/voice/token 响应 */
export interface VoiceTokenInfo {
  url: string
  token: string
}

export class ApiError extends Error {
  readonly status: number
  /** 服务端业务错误码（如 ROOM_NOT_FOUND / VOICE_NOT_CONFIGURED） */
  readonly code: string | null

  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function loadAuth(): AuthInfo | null {
  const auth = local.read<AuthInfo | null>(AUTH_KEY, null)
  return auth && typeof auth.uid === 'string' && typeof auth.token === 'string' ? auth : null
}

export function saveAuth(auth: AuthInfo): void {
  local.write(AUTH_KEY, auth)
}

export function clearAuth(): void {
  local.remove(AUTH_KEY)
}

function defaultMessage(status: number): string {
  if (status === 0) return '网络连接失败，请检查网络后重试'
  if (status === 401) return '登录已失效，请重试'
  if (status === 403) return '没有权限执行此操作'
  if (status === 404) return '未找到对应资源'
  if (status === 429) return '操作过于频繁，请稍后再试'
  if (status === 501) return '该功能尚未开放'
  if (status >= 500) return '服务暂时不可用，请稍后再试'
  return `请求失败（${status}）`
}

interface ErrorBody {
  code: string | null
  message: string | null
}

function parseErrorBody(data: unknown): ErrorBody {
  const body: ErrorBody = { code: null, message: null }
  if (data && typeof data === 'object') {
    const { code, message } = data as { code?: unknown; message?: unknown }
    if (typeof code === 'string') body.code = code
    if (typeof message === 'string' && message.trim()) body.message = message
  }
  return body
}

interface RequestOptions {
  /** 是否携带 Bearer（匿名登录接口不带） */
  auth?: boolean
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const useAuth = options.auth !== false
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (useAuth) {
    const auth = loadAuth()
    if (auth) headers.Authorization = `Bearer ${auth.token}`
  }

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, defaultMessage(0))
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    if (res.status === 401 && useAuth) clearAuth()
    const err = parseErrorBody(data)
    throw new ApiError(res.status, err.message ?? defaultMessage(res.status), err.code)
  }
  return data as T
}

/** 需要登录态的请求：401 时用给定资料重新匿名登录并重试一次 */
async function withAuthRetry<T>(fn: () => Promise<T>, profile?: AuthProfile): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && profile) {
      await api.anonAuth(profile)
      return fn()
    }
    throw err
  }
}

export const api = {
  /** 匿名注册：服务端创建用户并签发 JWT，本地保存凭证 */
  async anonAuth(profile: AuthProfile): Promise<AuthResponse> {
    const res = await request<AuthResponse>('POST', '/api/auth/anon', profile, { auth: false })
    saveAuth({ uid: res.uid, token: res.token })
    return res
  },

  /** 已有凭证直接返回，否则用资料匿名注册 */
  async ensureAuth(profile: AuthProfile): Promise<AuthInfo> {
    const existing = loadAuth()
    if (existing) return existing
    const res = await api.anonAuth(profile)
    return { uid: res.uid, token: res.token }
  },

  /** 当前用户资料与所在房间 */
  getMe(): Promise<MeResponse> {
    return request<MeResponse>('GET', '/api/me')
  },

  /** 更新昵称 / 头像 */
  updateMe(profile: AuthProfile): Promise<MeResponse> {
    return withAuthRetry(() => request<MeResponse>('PUT', '/api/me', profile), profile)
  },

  /** 创建房间：创建者自动入座 1 号位并成为房主，返回房间码 */
  createRoom(playerCount?: number, profile?: AuthProfile): Promise<{ code: string }> {
    const body = playerCount === undefined ? {} : { playerCount }
    return withAuthRetry(() => request<{ code: string }>('POST', '/api/rooms', body), profile)
  },

  /** 查询房间（无需登录），不存在时 404 */
  getRoom(code: string): Promise<RoomInfo> {
    return request<RoomInfo>('GET', `/api/rooms/${encodeURIComponent(code)}`, undefined, {
      auth: false,
    })
  },

  /** 语音接入凭证（LiveKit）；未配置语音时服务端返回 501 */
  voiceToken(profile?: AuthProfile): Promise<VoiceTokenInfo> {
    return withAuthRetry(() => request<VoiceTokenInfo>('POST', '/api/voice/token'), profile)
  },
}
