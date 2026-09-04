import type { MatchSummary, ServerMsg, VoicePolicy } from '@awalong/shared'
import { GameError, createGame, reduce, type Action, type Effect } from './fsm'
import { projectFor, secretFor } from './projection'
import { cryptoRng, type Rng } from './rng'
import type { GameState, PlayerState } from './state'
import type { Room, RoomService } from '../room/room.service'

export interface Transport {
  sendToUid(uid: string, msg: ServerMsg): void
  sendToUids(uids: string[], msg: ServerMsg): void
  /** 房间状态因对局变化（如终局回到大厅）时通知，用于广播 room.sync */
  roomChanged(code: string): void
}

export interface GameHooks {
  /** 语音权限策略变化（LiveKit 联动） */
  onVoicePolicy?: (room: Room, policy: VoicePolicy, players: PlayerState[]) => void
  /** 对局结束（含作废）：用于战绩落库 */
  onGameOver?: (room: Room, summary: MatchSummary, players: PlayerState[]) => void
}

/**
 * 持有每个房间的对局状态，串行执行动作，并把 reducer 的副作用落到网络与计时器上。
 */
export class GameService {
  private games = new Map<string, GameState>()
  private timers = new Map<string, NodeJS.Timeout>()
  private queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly rooms: RoomService,
    private readonly transport: Transport,
    private readonly rng: Rng = cryptoRng(),
    private readonly now: () => number = () => Date.now(),
    private readonly hooks: GameHooks = {},
  ) {}

  get(code: string): GameState | undefined {
    return this.games.get(code)
  }

  start(room: Room, uid: string): Promise<GameState> {
    return this.enqueue(room.code, () => {
      const errors = this.rooms.startErrors(room, uid)
      if (errors.length) throw new GameError('CANNOT_START', errors.join('；'))
      const players = [...room.seats.values()].map((s) => ({
        seat: s.seat,
        uid: s.uid,
        nickname: s.nickname,
        avatar: s.avatar,
        online: s.online,
      }))
      const { state, effects } = createGame({
        roomCode: room.code,
        settings: room.settings,
        players,
        now: this.now(),
        rng: this.rng,
      })
      this.rooms.markInGame(room)
      this.games.set(room.code, state)
      this.applyEffects(room, state, effects, null)
      return state
    })
  }

  dispatch(code: string, action: Action): Promise<GameState> {
    return this.enqueue(code, () => {
      const room = this.rooms.require(code)
      const prev = this.games.get(code)
      if (!prev) throw new GameError('NO_GAME', '对局不存在')
      const { state, effects } = reduce(prev, action, this.rng)
      if (state === prev) return prev
      this.games.set(code, state)
      this.applyEffects(room, state, effects, prev)
      return state
    })
  }

  /** 重连或旁观进入时补发当前视角 */
  resend(code: string, uid: string): void {
    const state = this.games.get(code)
    if (!state) return
    this.transport.sendToUid(uid, { type: 'game.sync', state: projectFor(state, this.now()) })
    const player = state.players.find((p) => p.uid === uid)
    if (player) this.transport.sendToUid(uid, { type: 'game.secret', secret: secretFor(state, player.seat, this.rng) })
  }

  seatOf(code: string, uid: string): number | null {
    return this.games.get(code)?.players.find((p) => p.uid === uid)?.seat ?? null
  }

  discard(code: string): void {
    this.clearTimer(code)
    this.games.delete(code)
    this.queues.delete(code)
  }

  private enqueue<T>(code: string, task: () => T): Promise<T> {
    const prev = this.queues.get(code) ?? Promise.resolve()
    const next = prev.then(task, task)
    this.queues.set(
      code,
      next.catch(() => undefined),
    )
    return next
  }

  private applyEffects(room: Room, state: GameState, effects: Effect[], prev: GameState | null): void {
    const uids = this.rooms.members(room)
    const now = this.now()
    let roomChanged = false
    for (const effect of effects) {
      switch (effect.kind) {
        case 'secrets':
          for (const p of state.players) {
            this.transport.sendToUid(p.uid, { type: 'game.secret', secret: secretFor(state, p.seat, this.rng) })
          }
          break
        case 'timer':
          this.setTimer(room.code, state.version, effect.ms)
          break
        case 'clearTimer':
          this.clearTimer(room.code)
          break
        case 'teamReveal':
          this.transport.sendToUids(uids, { type: 'team.reveal', votes: effect.votes, approved: effect.approved, version: state.version })
          break
        case 'questReveal':
          this.transport.sendToUids(uids, { type: 'quest.reveal', cards: effect.cards, failed: effect.failed, version: state.version })
          break
        case 'voice':
          this.transport.sendToUids(uids, { type: 'voice.policy', policy: effect.policy })
          this.hooks.onVoicePolicy?.(room, effect.policy, state.players)
          break
        case 'speaker':
          this.transport.sendToUids(uids, { type: 'speaker.turn', seat: effect.seat, deadline: effect.deadline })
          break
        case 'gameOver':
          this.transport.sendToUids(uids, { type: 'game.over', summary: effect.summary, version: state.version })
          this.hooks.onGameOver?.(room, effect.summary, state.players)
          this.rooms.markLobby(room, now)
          roomChanged = true
          break
      }
    }
    if (!prev || prev.phase !== state.phase) {
      this.transport.sendToUids(uids, {
        type: 'phase.change',
        phase: state.phase,
        deadline: state.deadline,
        serverTime: now,
        version: state.version,
      })
    }
    this.transport.sendToUids(uids, { type: 'game.sync', state: projectFor(state, now) })
    if (roomChanged) this.transport.roomChanged(room.code)
  }

  private setTimer(code: string, version: number, ms: number): void {
    this.clearTimer(code)
    const handle = setTimeout(() => {
      this.timers.delete(code)
      void this.dispatch(code, { type: 'TIMEOUT', version, now: this.now() }).catch(() => undefined)
    }, ms)
    this.timers.set(code, handle)
  }

  private clearTimer(code: string): void {
    const handle = this.timers.get(code)
    if (handle) clearTimeout(handle)
    this.timers.delete(code)
  }
}
