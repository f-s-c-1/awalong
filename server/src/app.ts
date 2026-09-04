import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import { UserStore } from './auth'
import { config } from './config'
import { GameService } from './game/game.service'
import { cryptoRng, type Rng } from './game/rng'
import { registerRoutes } from './http/routes'
import { MatchStore } from './match/match.store'
import { RoomService } from './room/room.service'
import { openPersistence } from './store/jsonl'
import { VoiceService } from './voice/voice.service'
import { Gateway } from './ws/gateway'

export interface AppContext {
  app: FastifyInstance
  users: UserStore
  rooms: RoomService
  games: GameService
  gateway: Gateway
  voice: VoiceService
  matches: MatchStore
}

export async function buildApp(options: { logger?: boolean; rng?: Rng; dataDir?: string } = {}): Promise<AppContext> {
  const app = Fastify({ logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' } })
  await app.register(cors, { origin: config.corsOrigin })
  await app.register(websocket)

  // 用户与战绩落 DATA_DIR 下的 JSON Lines；未配置目录则仅内存（测试 / 本地）
  const dataDir = options.dataDir ?? config.dataDir
  const users = new UserStore(openPersistence(dataDir, 'users.ndjson'))
  const matches = new MatchStore(openPersistence(dataDir, 'matches.ndjson'))
  const rooms = new RoomService()
  const voice = new VoiceService()
  let gateway!: Gateway
  const games = new GameService(
    rooms,
    {
      sendToUid: (uid, msg) => gateway.sendToUid(uid, msg),
      sendToUids: (uids, msg) => gateway.sendToUids(uids, msg),
      roomChanged: (code) => gateway.roomChanged(code),
    },
    options.rng ?? cryptoRng(),
    () => Date.now(),
    {
      onVoicePolicy: (room, policy, players) => {
        void voice.applyPolicy(
          room.code,
          policy,
          players.map((p) => ({ uid: p.uid, seat: p.seat, nickname: p.nickname })),
        )
      },
      onGameOver: (_room, summary, players) => {
        try {
          matches.save(summary, players)
        } catch (err) {
          app.log.error({ err }, '战绩落库失败')
        }
      },
    },
  )
  gateway = new Gateway(rooms, games, users)

  registerRoutes(app, users, rooms, voice, matches)
  gateway.register(app)

  const sweeper = setInterval(() => {
    for (const code of rooms.sweep(Date.now(), config.idleRoomMs)) {
      games.discard(code)
      void voice.closeRoom(code)
    }
  }, 60_000)
  app.addHook('onClose', () => clearInterval(sweeper))

  return { app, users, rooms, games, gateway, voice, matches }
}
