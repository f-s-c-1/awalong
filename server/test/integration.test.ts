import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import type { ClientGameState, ClientMsg, RoomSync, SecretInfo, ServerMsg } from '@awalong/shared'
import { buildApp, type AppContext } from '../src/app'
import { seededRng } from '../src/game/rng'

let ctx: AppContext
let baseUrl: string
let wsUrl: string

class Client {
  socket!: WebSocket
  messages: ServerMsg[] = []
  state: ClientGameState | null = null
  room: RoomSync | null = null
  secret: SecretInfo | null = null
  /** 已消费的消息游标：waitFor 只向后匹配，保证按时序消费 */
  private cursor = 0
  private waiter: { pred: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void } | null = null

  constructor(
    public readonly name: string,
    public readonly token: string,
    public readonly uid: string,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(`${wsUrl}?token=${this.token}`)
      this.socket.on('open', () => resolve())
      this.socket.on('error', reject)
      this.socket.on('message', (raw) => {
        const msg = JSON.parse(raw.toString()) as ServerMsg
        this.messages.push(msg)
        if (msg.type === 'game.sync') this.state = msg.state
        if (msg.type === 'room.sync') this.room = msg.room
        if (msg.type === 'game.secret') this.secret = msg.secret
        if (this.waiter && this.waiter.pred(msg)) {
          const w = this.waiter
          this.waiter = null
          this.cursor = this.messages.length
          w.resolve(msg)
        }
      })
    })
  }

  send(msg: ClientMsg): void {
    this.socket.send(JSON.stringify(msg))
  }

  waitFor(pred: (m: ServerMsg) => boolean, label = '', timeoutMs = 3000): Promise<ServerMsg> {
    for (let i = this.cursor; i < this.messages.length; i++) {
      const m = this.messages[i]!
      if (pred(m)) {
        this.cursor = i + 1
        return Promise.resolve(m)
      }
    }
    this.cursor = this.messages.length
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null
        const recent = this.messages.slice(-3).map((m) => m.type).join(',')
        reject(new Error(`${this.name} 等待 ${label || '消息'} 超时（最近: ${recent}）`))
      }, timeoutMs)
      this.waiter = {
        pred,
        resolve: (m) => {
          clearTimeout(timer)
          resolve(m)
        },
      }
    })
  }

  waitPhase(phase: string): Promise<ClientGameState> {
    return this.waitFor((m) => m.type === 'game.sync' && m.state.phase === phase, `阶段 ${phase}`).then(
      (m) => (m as Extract<ServerMsg, { type: 'game.sync' }>).state,
    )
  }

  close(): void {
    this.socket.close()
  }
}

async function api<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json()) as T & { message?: string }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.message}`)
  return json
}

async function makeClient(name: string): Promise<Client> {
  const auth = await api<{ uid: string; token: string }>('/api/auth/anon', { nickname: name, avatar: 'sword' })
  const c = new Client(name, auth.token, auth.uid)
  await c.connect()
  return c
}

beforeAll(async () => {
  ctx = await buildApp({ logger: false, rng: seededRng(42) })
  await ctx.app.listen({ port: 0, host: '127.0.0.1' })
  const address = ctx.app.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`
  wsUrl = `ws://127.0.0.1:${port}/ws`
})

afterAll(async () => {
  await ctx.app.close()
})

describe('HTTP 接口', () => {
  it('健康检查、匿名注册、建房、查房', async () => {
    const health = await api<{ ok: boolean }>('/api/health')
    expect(health.ok).toBe(true)
    const auth = await api<{ uid: string; token: string }>('/api/auth/anon', { nickname: '老K', avatar: 'shield' })
    expect(auth.token).toBeTruthy()
    const room = await api<{ code: string }>('/api/rooms', { playerCount: 5 }, auth.token)
    expect(room.code).toMatch(/^\d{6}$/)
    const info = await api<{ status: string; seated: number }>(`/api/rooms/${room.code}`)
    expect(info.status).toBe('LOBBY')
    expect(info.seated).toBe(1)
    await expect(api('/api/rooms/000000')).rejects.toThrow(/404/)
    await expect(api('/api/rooms', { playerCount: 5 })).rejects.toThrow(/401/)
  })

  it('非法昵称被拒绝', async () => {
    await expect(api('/api/auth/anon', { nickname: '', avatar: 'x' })).rejects.toThrow(/400/)
  })
})

describe('五人局完整流程（WebSocket）', () => {
  it('从建房到刺杀结算', async () => {
    const names = ['老K', '阿明', 'Momo', '小舟', 'Leo']
    const clients: Client[] = []
    for (const n of names) clients.push(await makeClient(n))
    const [owner, ...others] = clients as [Client, ...Client[]]

    const { code } = await api<{ code: string }>('/api/rooms', { playerCount: 5 }, owner.token)
    owner.send({ type: 'sync.request', version: 0 })
    for (const c of others) c.send({ type: 'room.join', code })
    for (const c of clients) {
      await c.waitFor((m) => m.type === 'room.sync' && m.room.seats.length === 5)
    }
    expect(owner.room?.ownerUid).toBe(owner.uid)
    expect(owner.room?.mySeat).toBe(1)

    // 默认轮流发言会在表决前插入发言轮次，本用例改为自由发言以聚焦流程
    owner.send({ type: 'room.settings', settings: { speechMode: 'free' } })
    await owner.waitFor((m) => m.type === 'room.sync' && m.room.settings.speechMode === 'free', '发言模式')

    for (const c of others) c.send({ type: 'room.ready', ready: true })
    await owner.waitFor((m) => m.type === 'room.sync' && m.room.seats.filter((s) => s.ready).length === 4)

    owner.send({ type: 'game.start' })
    for (const c of clients) {
      await c.waitFor((m) => m.type === 'game.secret', '身份')
      await c.waitPhase('NIGHT')
    }
    const roles = clients.map((c) => c.secret!.role)
    expect(roles.filter((r) => r === 'MERLIN')).toHaveLength(1)
    expect(roles.filter((r) => r === 'ASSASSIN')).toHaveLength(1)
    for (const c of clients) {
      expect(JSON.stringify(c.state)).not.toMatch(/"role":/)
    }

    for (const c of clients) c.send({ type: 'night.confirm' })
    for (const c of clients) await c.waitPhase('TEAM_PICK')

    const bySeat = (seat: number) => clients.find((c) => c.secret!.seat === seat)!
    const goodSeats = clients.filter((c) => c.secret!.side === 'GOOD').map((c) => c.secret!.seat)

    let rounds = 0
    while (owner.state!.phase !== 'ASSASSIN' && rounds < 10) {
      rounds += 1
      const state = owner.state!
      const size = state.questSizes[state.questIndex]!
      const leader = bySeat(state.leaderSeat)
      const team = [state.leaderSeat, ...goodSeats.filter((s) => s !== state.leaderSeat)].slice(0, size)
      if (team.length < size) team.push(...clients.map((c) => c.secret!.seat).filter((s) => !team.includes(s)).slice(0, size - team.length))
      leader.send({ type: 'team.pick', seats: team })
      for (const c of clients) await c.waitPhase('TEAM_VOTE')
      for (const c of clients) c.send({ type: 'team.vote', approve: true })
      for (const c of clients) await c.waitFor((m) => m.type === 'team.reveal' && m.approved)
      for (const c of clients) await c.waitPhase('QUEST')
      for (const seat of team) bySeat(seat).send({ type: 'quest.vote', success: true })
      await owner.waitFor((m) => m.type === 'quest.reveal' && m.version > state.version)
      await owner.waitFor((m) => m.type === 'game.sync' && m.state.questResults.length === state.questResults.length + 1)
    }
    expect(owner.state!.phase).toBe('ASSASSIN')
    expect(owner.state!.questResults).toEqual(['S', 'S', 'S'])

    const assassin = clients.find((c) => c.secret!.role === 'ASSASSIN')!
    const merlin = clients.find((c) => c.secret!.role === 'MERLIN')!
    const loyal = clients.find((c) => c.secret!.role === 'LOYAL' || c.secret!.role === 'PERCIVAL')!
    loyal.send({ type: 'assassin.kill', targetSeat: merlin.secret!.seat })
    await loyal.waitFor((m) => m.type === 'error' && m.code === 'NOT_ASSASSIN')

    assassin.send({ type: 'assassin.kill', targetSeat: merlin.secret!.seat })
    for (const c of clients) {
      const over = (await c.waitFor((m) => m.type === 'game.over')) as Extract<ServerMsg, { type: 'game.over' }>
      expect(over.summary.winner).toBe('EVIL')
      expect(over.summary.winReason).toBe('ASSASSIN_HIT')
      expect(Object.keys(over.summary.roles)).toHaveLength(5)
    }
    await owner.waitPhase('GAME_OVER')
    expect(owner.state!.revealedRoles).not.toBeNull()
    await owner.waitFor((m) => m.type === 'room.sync' && m.room.status === 'LOBBY')

    // 战绩已落库：每人一条，视角字段正确，单局详情含全员
    interface MineResp {
      total: number
      stats: { games: number; wins: number }
      items: { id: string; mySeat: number; myRole: string; won: boolean }[]
    }
    const mine = await api<MineResp>('/api/me/matches', undefined, assassin.token)
    expect(mine.total).toBe(1)
    expect(mine.stats.games).toBe(1)
    expect(mine.stats.wins).toBe(1)
    expect(mine.items[0]!.myRole).toBe('ASSASSIN')
    expect(mine.items[0]!.won).toBe(true)
    const merlinMine = await api<MineResp>('/api/me/matches', undefined, merlin.token)
    expect(merlinMine.items[0]!.won).toBe(false)
    const record = await api<{ id: string; players: unknown[]; roles: Record<string, string> }>(
      '/api/matches/' + mine.items[0]!.id,
      undefined,
      owner.token,
    )
    expect(record.players).toHaveLength(5)
    expect(Object.keys(record.roles)).toHaveLength(5)
    await expect(api('/api/matches/m_none', undefined, owner.token)).rejects.toThrow(/404/)
    await expect(api('/api/me/matches')).rejects.toThrow(/401/)

    // 再来一局：只有房主能发起，全员收到 game.reset 回大厅
    const guest = others[0]!
    guest.send({ type: 'game.again' })
    await guest.waitFor((m) => m.type === 'error' && m.code === 'NOT_OWNER', '非房主再来一局被拒')
    owner.send({ type: 'game.again' })
    for (const c of clients) await c.waitFor((m) => m.type === 'game.reset', 'game.reset')
    await owner.waitFor((m) => m.type === 'room.sync' && m.room.status === 'LOBBY')

    for (const c of clients) c.close()
  })

  it('房间码错误、非房主开局、非法消息都会收到错误', async () => {
    const c = await makeClient('球球')
    c.send({ type: 'room.join', code: '000000' })
    await c.waitFor((m) => m.type === 'error' && m.code === 'ROOM_NOT_FOUND')
    c.socket.send('not json')
    await c.waitFor((m) => m.type === 'error' && m.code === 'BAD_MESSAGE')
    const host = await makeClient('七七')
    const { code } = await api<{ code: string }>('/api/rooms', { playerCount: 5 }, host.token)
    c.send({ type: 'room.join', code })
    await c.waitFor((m) => m.type === 'room.sync' && m.room.mySeat === 2)
    c.send({ type: 'game.start' })
    await c.waitFor((m) => m.type === 'error' && m.code === 'CANNOT_START')
    c.close()
    host.close()
  })
})
