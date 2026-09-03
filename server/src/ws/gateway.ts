import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import type { ClientMsg, ServerMsg } from '@awalong/shared'
import { verifyToken, type UserStore } from '../auth'
import { config } from '../config'
import { GameError } from '../game/fsm'
import type { GameService, Transport } from '../game/game.service'
import type { RoomService } from '../room/room.service'
import { clientMsgSchema } from './schemas'

interface Conn {
  uid: string
  socket: WebSocket
  alive: boolean
}

export class Gateway implements Transport {
  private conns = new Map<string, Set<Conn>>()
  private phraseAt = new Map<string, number>()
  private releaseTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly rooms: RoomService,
    private readonly games: GameService,
    private readonly users: UserStore,
  ) {}

  sendToUid(uid: string, msg: ServerMsg): void {
    const set = this.conns.get(uid)
    if (!set) return
    const data = JSON.stringify(msg)
    for (const c of set) if (c.socket.readyState === c.socket.OPEN) c.socket.send(data)
  }

  sendToUids(uids: string[], msg: ServerMsg): void {
    for (const uid of uids) this.sendToUid(uid, msg)
  }

  roomChanged(code: string): void {
    this.broadcastRoom(code)
  }

  register(app: FastifyInstance): void {
    app.get('/ws', { websocket: true }, (socket, req) => {
      const token = (req.query as Record<string, string | undefined>).token
      const auth = verifyToken(token)
      if (!auth || !this.users.get(auth.uid)) {
        socket.close(4001, 'unauthorized')
        return
      }
      const conn: Conn = { uid: auth.uid, socket, alive: true }
      this.addConn(conn)
      socket.on('pong', () => (conn.alive = true))
      socket.on('message', (raw) => void this.onMessage(conn, raw.toString()))
      socket.on('close', () => this.onClose(conn))
      this.onOpen(conn)
    })

    const interval = setInterval(() => {
      for (const set of this.conns.values()) {
        for (const c of set) {
          if (!c.alive) {
            c.socket.terminate()
            continue
          }
          c.alive = false
          c.socket.ping()
        }
      }
    }, 15_000)
    app.addHook('onClose', () => clearInterval(interval))
  }

  private addConn(conn: Conn): void {
    let set = this.conns.get(conn.uid)
    if (!set) {
      set = new Set()
      this.conns.set(conn.uid, set)
    }
    set.add(conn)
  }

  private onOpen(conn: Conn): void {
    const room = this.rooms.roomOf(conn.uid)
    if (!room) return
    this.cancelRelease(conn.uid)
    this.rooms.setOnline(room.code, conn.uid, true)
    const seat = this.games.seatOf(room.code, conn.uid)
    if (room.status === 'IN_GAME' && seat !== null) {
      void this.games.dispatch(room.code, { type: 'PLAYER_ONLINE', seat, online: true, now: Date.now() }).catch(() => undefined)
    }
    this.broadcastRoom(room.code)
    this.games.resend(room.code, conn.uid)
  }

  private onClose(conn: Conn): void {
    const set = this.conns.get(conn.uid)
    set?.delete(conn)
    if (set && set.size > 0) return
    this.conns.delete(conn.uid)
    const room = this.rooms.roomOf(conn.uid)
    if (!room) return
    this.rooms.setOnline(room.code, conn.uid, false)
    const seat = this.games.seatOf(room.code, conn.uid)
    if (room.status === 'IN_GAME' && seat !== null) {
      void this.games.dispatch(room.code, { type: 'PLAYER_ONLINE', seat, online: false, now: Date.now() }).catch(() => undefined)
    } else if (room.status === 'LOBBY') {
      const timer = setTimeout(() => {
        this.releaseTimers.delete(conn.uid)
        if (this.rooms.releaseIfExpired(room.code, conn.uid)) this.broadcastRoom(room.code)
      }, config.lobbyDisconnectMs)
      this.releaseTimers.set(conn.uid, timer)
    }
    this.broadcastRoom(room.code)
  }

  private cancelRelease(uid: string): void {
    const t = this.releaseTimers.get(uid)
    if (t) clearTimeout(t)
    this.releaseTimers.delete(uid)
  }

  private broadcastRoom(code: string): void {
    const room = this.rooms.get(code)
    if (!room) return
    for (const uid of this.rooms.members(room)) {
      this.sendToUid(uid, { type: 'room.sync', room: this.rooms.toSync(room, uid) })
    }
  }

  private async onMessage(conn: Conn, raw: string): Promise<void> {
    let msg: ClientMsg
    try {
      msg = clientMsgSchema.parse(JSON.parse(raw)) as ClientMsg
    } catch {
      this.sendToUid(conn.uid, { type: 'error', code: 'BAD_MESSAGE', message: '消息格式错误' })
      return
    }
    try {
      await this.handle(conn, msg)
    } catch (err) {
      if (err instanceof GameError) {
        this.sendToUid(conn.uid, { type: 'error', code: err.code, message: err.message })
      } else {
        this.sendToUid(conn.uid, { type: 'error', code: 'INTERNAL', message: '服务器内部错误' })
        console.error(err)
      }
    }
  }

  private async handle(conn: Conn, msg: ClientMsg): Promise<void> {
    const uid = conn.uid
    const now = Date.now()
    if (msg.type === 'heartbeat') {
      this.sendToUid(uid, { type: 'heartbeat.ack', t: msg.t, serverTime: now })
      return
    }
    if (msg.type === 'room.join') {
      const user = this.users.get(uid)
      if (!user) throw new GameError('NO_USER', '请先设置昵称')
      const { room } = this.rooms.join(msg.code, user, now)
      this.broadcastRoom(room.code)
      this.games.resend(room.code, uid)
      return
    }
    const room = this.rooms.roomOf(uid)
    if (!room) throw new GameError('NOT_IN_ROOM', '你不在任何房间中')
    const code = room.code

    switch (msg.type) {
      case 'sync.request':
        this.sendToUid(uid, { type: 'room.sync', room: this.rooms.toSync(room, uid) })
        this.games.resend(code, uid)
        return
      case 'room.leave':
        this.rooms.leave(code, uid, now)
        this.sendToUid(uid, { type: 'room.closed', reason: 'left' })
        this.broadcastRoom(code)
        return
      case 'room.ready':
        this.rooms.setReady(code, uid, msg.ready)
        this.broadcastRoom(code)
        return
      case 'room.sit':
        this.rooms.sit(code, uid, msg.seat)
        this.broadcastRoom(code)
        return
      case 'room.settings':
        this.rooms.updateSettings(code, uid, msg.settings)
        this.broadcastRoom(code)
        return
      case 'room.kick': {
        const target = room.seats.get(msg.seat)
        this.rooms.kick(code, uid, msg.seat)
        if (target) this.sendToUid(target.uid, { type: 'room.closed', reason: 'kicked' })
        this.broadcastRoom(code)
        return
      }
      case 'room.transfer':
        this.rooms.transfer(code, uid, msg.uid)
        this.broadcastRoom(code)
        return
      case 'game.start':
        await this.games.start(room, uid)
        this.broadcastRoom(code)
        return
      case 'game.again': {
        if (room.status !== 'LOBBY') throw new GameError('WRONG_STATUS', '对局尚未结束')
        this.games.discard(code)
        this.broadcastRoom(code)
        return
      }
      case 'game.decide': {
        if (room.ownerUid !== uid) throw new GameError('NOT_OWNER', '只有房主可以决定')
        if (msg.action === 'ABORT') {
          await this.games.dispatch(code, { type: 'ABORT', now })
          this.broadcastRoom(code)
        }
        return
      }
      case 'phrase.send': {
        const last = this.phraseAt.get(uid) ?? 0
        if (now - last < config.phraseCooldownMs) throw new GameError('TOO_FAST', '说得太快了，稍等一下')
        const seat = this.rooms.seatOf(room, uid)?.seat
        if (seat === undefined) throw new GameError('SPECTATOR', '旁观者不能发送短语')
        this.phraseAt.set(uid, now)
        this.sendToUids(this.rooms.members(room), { type: 'phrase.shown', seat, phraseId: msg.phraseId })
        return
      }
      default:
        break
    }

    const seat = this.games.seatOf(code, uid)
    if (seat === null) throw new GameError('NOT_PLAYING', '你不是本局玩家')
    switch (msg.type) {
      case 'night.confirm':
        await this.games.dispatch(code, { type: 'NIGHT_CONFIRM', seat, now })
        return
      case 'team.pick':
        await this.games.dispatch(code, { type: 'TEAM_PICK', seat, team: msg.seats, now })
        return
      case 'team.vote':
        await this.games.dispatch(code, { type: 'TEAM_VOTE', seat, approve: msg.approve, now })
        return
      case 'quest.vote':
        await this.games.dispatch(code, { type: 'QUEST_VOTE', seat, success: msg.success, now })
        return
      case 'assassin.kill':
        await this.games.dispatch(code, { type: 'ASSASSIN_KILL', seat, target: msg.targetSeat, now })
        return
      case 'speaker.done':
        await this.games.dispatch(code, { type: 'SPEAKER_DONE', seat, now })
        return
    }
  }
}
