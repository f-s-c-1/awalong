import type { FastifyInstance, FastifyRequest } from 'fastify'
import { signToken, verifyToken, type UserStore } from '../auth'
import { GameError } from '../game/fsm'
import type { RoomService } from '../room/room.service'
import type { VoiceService } from '../voice/voice.service'
import { anonAuthSchema, createRoomSchema } from '../ws/schemas'

function authUid(req: FastifyRequest): string {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
  const auth = verifyToken(token)
  if (!auth) throw new GameError('UNAUTHORIZED', '未登录')
  return auth.uid
}

export function registerRoutes(app: FastifyInstance, users: UserStore, rooms: RoomService, voice: VoiceService): void {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof GameError) {
      const status = err.code === 'UNAUTHORIZED' ? 401 : err.code === 'ROOM_NOT_FOUND' ? 404 : 400
      void reply.status(status).send({ code: err.code, message: err.message })
      return
    }
    if (typeof err === 'object' && err && 'issues' in err) {
      void reply.status(400).send({ code: 'BAD_REQUEST', message: '参数错误' })
      return
    }
    app.log.error(err)
    void reply.status(500).send({ code: 'INTERNAL', message: '服务器内部错误' })
  })

  app.get('/api/health', async () => ({ ok: true, time: Date.now() }))

  app.post('/api/auth/anon', async (req) => {
    const body = anonAuthSchema.parse(req.body)
    const user = users.create(body.nickname, body.avatar)
    return { uid: user.uid, token: signToken(user.uid), nickname: user.nickname, avatar: user.avatar }
  })

  app.get('/api/me', async (req) => {
    const uid = authUid(req)
    const user = users.get(uid)
    if (!user) throw new GameError('UNAUTHORIZED', '用户不存在，请重新进入')
    const room = rooms.roomOf(uid)
    return { ...user, roomCode: room?.code ?? null }
  })

  app.put('/api/me', async (req) => {
    const uid = authUid(req)
    const body = anonAuthSchema.parse(req.body)
    const user = users.update(uid, body)
    if (!user) throw new GameError('UNAUTHORIZED', '用户不存在，请重新进入')
    return user
  })

  app.post('/api/rooms', async (req) => {
    const uid = authUid(req)
    const user = users.get(uid)
    if (!user) throw new GameError('UNAUTHORIZED', '用户不存在，请重新进入')
    const body = createRoomSchema.parse(req.body ?? {})
    const room = rooms.create(user, body.playerCount ?? 8)
    return { code: room.code }
  })

  app.get('/api/rooms/:code', async (req) => {
    const { code } = req.params as { code: string }
    const room = rooms.require(code)
    return {
      code: room.code,
      status: room.status,
      playerCount: room.settings.playerCount,
      seated: room.seats.size,
      spectatorCount: room.spectators.size,
    }
  })

  app.post('/api/voice/token', async (req, reply) => {
    const uid = authUid(req)
    if (!voice.enabled) {
      void reply.status(501)
      return { code: 'VOICE_NOT_CONFIGURED', message: '实时语音尚未配置' }
    }
    const room = rooms.roomOf(uid)
    if (!room) throw new GameError('NOT_IN_ROOM', '你不在任何房间中')
    const seat = rooms.seatOf(room, uid)
    if (!seat) throw new GameError('SPECTATOR', '旁观者不能加入语音')
    // 多域名共用一套反代时，信令地址跟随访问域名
    const forwarded = req.headers['x-forwarded-host']
    const host = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.headers.host
    const publicUrl = host && voice.followHost ? `wss://${host}` : undefined
    return voice.token(room.code, { uid, seat: seat.seat, nickname: seat.nickname }, publicUrl)
  })
}
