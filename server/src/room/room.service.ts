import { randomInt } from 'node:crypto'
import { MAX_PLAYERS, MIN_PLAYERS, RECOMMENDED_ROLES, defaultSettings, validateRoles } from '@awalong/shared'
import type { RoomSettings, RoomSync, SeatInfo } from '@awalong/shared'
import type { UserProfile } from '../auth'
import { GameError } from '../game/fsm'

export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'CLOSED'

export interface Room {
  code: string
  ownerUid: string
  status: RoomStatus
  settings: RoomSettings
  seats: Map<number, SeatInfo>
  spectators: Set<string>
  createdAt: number
  lastActiveAt: number
}

/** 房间与座位管理（内存版；接口保持与 Redis 版一致） */
export class RoomService {
  private rooms = new Map<string, Room>()
  private userRoom = new Map<string, string>()

  create(owner: UserProfile, playerCount = 8, now = Date.now()): Room {
    if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) throw new GameError('BAD_COUNT', '人数必须在 5-10 之间')
    this.leaveCurrent(owner.uid, now)
    const code = this.newCode()
    const room: Room = {
      code,
      ownerUid: owner.uid,
      status: 'LOBBY',
      settings: defaultSettings(playerCount),
      seats: new Map(),
      spectators: new Set(),
      createdAt: now,
      lastActiveAt: now,
    }
    this.rooms.set(code, room)
    this.seat(room, owner, 1, now)
    return room
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code)
  }

  require(code: string): Room {
    const room = this.rooms.get(code)
    if (!room || room.status === 'CLOSED') throw new GameError('ROOM_NOT_FOUND', '房间不存在或已解散')
    return room
  }

  roomOf(uid: string): Room | undefined {
    const code = this.userRoom.get(uid)
    return code ? this.rooms.get(code) : undefined
  }

  seatOf(room: Room, uid: string): SeatInfo | undefined {
    for (const s of room.seats.values()) if (s.uid === uid) return s
    return undefined
  }

  /** 加入：有空位且未开局则入座，否则旁观 */
  join(code: string, user: UserProfile, now = Date.now()): { room: Room; seat: number | null } {
    const room = this.require(code)
    const existing = this.seatOf(room, user.uid)
    if (existing) {
      existing.online = true
      existing.disconnectAt = null
      existing.nickname = user.nickname
      existing.avatar = user.avatar
      this.userRoom.set(user.uid, code)
      room.lastActiveAt = now
      return { room, seat: existing.seat }
    }
    this.leaveCurrent(user.uid, now)
    if (room.status === 'LOBBY' && room.seats.size < room.settings.playerCount) {
      const seat = this.firstFreeSeat(room)
      this.seat(room, user, seat, now)
      return { room, seat }
    }
    room.spectators.add(user.uid)
    this.userRoom.set(user.uid, code)
    room.lastActiveAt = now
    return { room, seat: null }
  }

  leave(code: string, uid: string, now = Date.now()): Room | undefined {
    const room = this.rooms.get(code)
    if (!room) return undefined
    const seat = this.seatOf(room, uid)
    if (seat) {
      if (room.status === 'IN_GAME') {
        seat.online = false
        seat.disconnectAt = now
      } else {
        room.seats.delete(seat.seat)
      }
    }
    room.spectators.delete(uid)
    this.userRoom.delete(uid)
    room.lastActiveAt = now
    if (room.status === 'LOBBY') {
      if (room.seats.size === 0 && room.spectators.size === 0) {
        room.status = 'CLOSED'
        this.rooms.delete(code)
      } else if (room.ownerUid === uid) {
        const next = [...room.seats.values()].filter((s) => s.online).sort((a, b) => a.seat - b.seat)[0]
        if (next) room.ownerUid = next.uid
      }
    }
    return room
  }

  setOnline(code: string, uid: string, online: boolean, now = Date.now()): Room | undefined {
    const room = this.rooms.get(code)
    if (!room) return undefined
    const seat = this.seatOf(room, uid)
    if (seat) {
      seat.online = online
      seat.disconnectAt = online ? null : now
      if (online) room.lastActiveAt = now
    }
    return room
  }

  /** 大厅阶段断线超时释放座位；返回是否释放 */
  releaseIfExpired(code: string, uid: string, now = Date.now()): boolean {
    const room = this.rooms.get(code)
    if (!room || room.status !== 'LOBBY') return false
    const seat = this.seatOf(room, uid)
    if (!seat || seat.online || seat.disconnectAt === null) return false
    this.leave(code, uid, now)
    return true
  }

  setReady(code: string, uid: string, ready: boolean): Room {
    const room = this.require(code)
    if (room.status !== 'LOBBY') throw new GameError('WRONG_STATUS', '对局进行中')
    const seat = this.seatOf(room, uid)
    if (!seat) throw new GameError('NOT_SEATED', '你不在座位上')
    seat.ready = ready
    return room
  }

  sit(code: string, uid: string, target: number): Room {
    const room = this.require(code)
    if (room.status !== 'LOBBY') throw new GameError('WRONG_STATUS', '对局进行中不能换座')
    if (target < 1 || target > room.settings.playerCount) throw new GameError('BAD_SEAT', '座位号无效')
    if (room.seats.has(target)) throw new GameError('SEAT_TAKEN', '该座位已有人')
    const current = this.seatOf(room, uid)
    if (current) {
      room.seats.delete(current.seat)
      current.seat = target
      room.seats.set(target, current)
    } else {
      if (!room.spectators.has(uid)) throw new GameError('NOT_IN_ROOM', '你不在房间内')
      throw new GameError('SPECTATOR', '旁观者请先加入座位')
    }
    return room
  }

  updateSettings(code: string, uid: string, patch: Partial<RoomSettings>): Room {
    const room = this.require(code)
    this.assertOwner(room, uid)
    if (room.status !== 'LOBBY') throw new GameError('WRONG_STATUS', '对局进行中不能修改设置')
    const next: RoomSettings = { ...room.settings, ...patch }
    if (patch.playerCount !== undefined && patch.roles === undefined) {
      next.roles = [...(RECOMMENDED_ROLES[patch.playerCount] ?? [])]
    }
    if (next.playerCount < MIN_PLAYERS || next.playerCount > MAX_PLAYERS) throw new GameError('BAD_COUNT', '人数必须在 5-10 之间')
    if (room.seats.size > next.playerCount) throw new GameError('TOO_MANY_SEATED', '在座人数超过新的人数上限')
    for (const seat of room.seats.keys()) {
      if (seat > next.playerCount) throw new GameError('SEAT_OUT_OF_RANGE', `${seat} 号座位超出新的人数范围，请先换座`)
    }
    const errors = validateRoles(next.playerCount, next.roles)
    if (errors.length) throw new GameError('INVALID_ROLES', errors.join('；'))
    if (next.ladyOfLake && next.playerCount < 7) throw new GameError('LADY_MIN_7', '湖中女神需要 7 人以上')
    room.settings = next
    for (const s of room.seats.values()) s.ready = false
    return room
  }

  kick(code: string, uid: string, seat: number): Room {
    const room = this.require(code)
    this.assertOwner(room, uid)
    if (room.status !== 'LOBBY') throw new GameError('WRONG_STATUS', '对局进行中不能踢人')
    const target = room.seats.get(seat)
    if (!target) throw new GameError('BAD_SEAT', '座位为空')
    if (target.uid === uid) throw new GameError('SELF_KICK', '不能踢自己')
    this.leave(code, target.uid)
    return room
  }

  transfer(code: string, uid: string, toUid: string): Room {
    const room = this.require(code)
    this.assertOwner(room, uid)
    if (!this.seatOf(room, toUid)) throw new GameError('NOT_SEATED', '对方不在座位上')
    room.ownerUid = toUid
    return room
  }

  startErrors(room: Room, uid: string): string[] {
    const errors: string[] = []
    if (room.ownerUid !== uid) errors.push('只有房主可以开始游戏')
    if (room.status !== 'LOBBY') errors.push('对局已在进行中')
    if (room.seats.size !== room.settings.playerCount) errors.push(`需要 ${room.settings.playerCount} 人入座，当前 ${room.seats.size} 人`)
    const notReady = [...room.seats.values()].filter((s) => !s.ready && s.uid !== room.ownerUid)
    if (notReady.length) errors.push(`等待 ${notReady.length} 人准备`)
    const offline = [...room.seats.values()].filter((s) => !s.online)
    if (offline.length) errors.push(`${offline.map((s) => s.nickname).join('、')} 已离线`)
    errors.push(...validateRoles(room.settings.playerCount, room.settings.roles))
    return errors
  }

  markInGame(room: Room): void {
    room.status = 'IN_GAME'
    for (const s of room.seats.values()) s.ready = false
  }

  /** 对局结束回到大厅，掉线未回的座位释放 */
  markLobby(room: Room, now = Date.now()): void {
    room.status = 'LOBBY'
    for (const s of [...room.seats.values()]) {
      s.ready = false
      if (!s.online) {
        room.seats.delete(s.seat)
        this.userRoom.delete(s.uid)
      }
    }
    room.lastActiveAt = now
    if (!this.seatOf(room, room.ownerUid)) {
      const next = [...room.seats.values()].sort((a, b) => a.seat - b.seat)[0]
      if (next) room.ownerUid = next.uid
    }
  }

  members(room: Room): string[] {
    return [...[...room.seats.values()].map((s) => s.uid), ...room.spectators]
  }

  toSync(room: Room, viewerUid: string): RoomSync {
    const mine = this.seatOf(room, viewerUid)
    return {
      code: room.code,
      ownerUid: room.ownerUid,
      status: room.status,
      settings: structuredClone(room.settings),
      seats: [...room.seats.values()].sort((a, b) => a.seat - b.seat).map((s) => ({ ...s })),
      spectatorCount: room.spectators.size,
      mySeat: mine?.seat ?? null,
    }
  }

  /** 回收空闲房间，返回被回收的房间码 */
  sweep(now = Date.now(), idleMs: number): string[] {
    const closed: string[] = []
    for (const room of this.rooms.values()) {
      const anyOnline = [...room.seats.values()].some((s) => s.online) || room.spectators.size > 0
      if (!anyOnline && now - room.lastActiveAt > idleMs) {
        room.status = 'CLOSED'
        for (const uid of this.members(room)) this.userRoom.delete(uid)
        this.rooms.delete(room.code)
        closed.push(room.code)
      }
    }
    return closed
  }

  private assertOwner(room: Room, uid: string): void {
    if (room.ownerUid !== uid) throw new GameError('NOT_OWNER', '只有房主可以执行该操作')
  }

  private seat(room: Room, user: UserProfile, seat: number, now: number): void {
    room.seats.set(seat, {
      seat,
      uid: user.uid,
      nickname: user.nickname,
      avatar: user.avatar,
      online: true,
      ready: false,
      disconnectAt: null,
    })
    this.userRoom.set(user.uid, room.code)
    room.lastActiveAt = now
  }

  private firstFreeSeat(room: Room): number {
    for (let i = 1; i <= room.settings.playerCount; i++) if (!room.seats.has(i)) return i
    throw new GameError('ROOM_FULL', '房间已满')
  }

  private leaveCurrent(uid: string, now: number): void {
    const code = this.userRoom.get(uid)
    if (code) this.leave(code, uid, now)
  }

  private newCode(): string {
    for (let i = 0; i < 20; i++) {
      const code = String(randomInt(100000, 1000000))
      if (!this.rooms.has(code)) return code
    }
    throw new GameError('CODE_EXHAUSTED', '房间码分配失败，请重试')
  }
}
