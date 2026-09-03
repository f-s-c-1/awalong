export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  corsOrigin: process.env.CORS_ORIGIN ?? true,
  /** 大厅阶段断线保座时长 */
  lobbyDisconnectMs: 120_000,
  /** 游戏中主动退出后等待重连时长 */
  gameLeaveGraceMs: 180_000,
  /** 空房回收 */
  idleRoomMs: 10 * 60_000,
  phraseCooldownMs: 5_000,
  livekit: {
    url: process.env.LIVEKIT_URL ?? '',
    apiKey: process.env.LIVEKIT_API_KEY ?? '',
    apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
  },
}
