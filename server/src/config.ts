export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  /** 用户与战绩的持久化目录（JSON Lines）；为空则只存内存 */
  dataDir: process.env.DATA_DIR ?? '',
  /** 大厅阶段断线保座时长 */
  lobbyDisconnectMs: 120_000,
  /** 游戏中主动退出后等待重连时长 */
  gameLeaveGraceMs: 180_000,
  /** 空房回收 */
  idleRoomMs: 10 * 60_000,
  phraseCooldownMs: 5_000,
  livekit: {
    /** 下发给客户端的公网地址（wss://域名） */
    url: process.env.LIVEKIT_URL ?? '',
    /** 服务端调用 RoomService 的内网地址（默认由 url 推导） */
    apiUrl: process.env.LIVEKIT_API_URL ?? '',
    /** 多域名部署：信令地址跟随请求域名 */
    followHost: process.env.LIVEKIT_FOLLOW_HOST === '1',
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  },
}
