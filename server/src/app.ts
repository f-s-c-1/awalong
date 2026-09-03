import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import { UserStore } from './auth'
import { config } from './config'
import { GameService } from './game/game.service'
import { cryptoRng, type Rng } from './game/rng'
import { registerRoutes } from './http/routes'
import { RoomService } from './room/room.service'
import { Gateway } from './ws/gateway'

export interface AppContext {
  app: FastifyInstance
  users: UserStore
  rooms: RoomService
  games: GameService
  gateway: Gateway
}

export async function buildApp(options: { logger?: boolean; rng?: Rng } = {}): Promise<AppContext> {
  const app = Fastify({ logger: options.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' } })
  await app.register(cors, { origin: config.corsOrigin })
  await app.register(websocket)

  const users = new UserStore()
  const rooms = new RoomService()
  let gateway!: Gateway
  const games = new GameService(
    rooms,
    {
      sendToUid: (uid, msg) => gateway.sendToUid(uid, msg),
      sendToUids: (uids, msg) => gateway.sendToUids(uids, msg),
      roomChanged: (code) => gateway.roomChanged(code),
    },
    options.rng ?? cryptoRng(),
  )
  gateway = new Gateway(rooms, games, users)

  registerRoutes(app, users, rooms)
  gateway.register(app)

  const sweeper = setInterval(() => {
    for (const code of rooms.sweep(Date.now(), config.idleRoomMs)) games.discard(code)
  }, 60_000)
  app.addHook('onClose', () => clearInterval(sweeper))

  return { app, users, rooms, games, gateway }
}
