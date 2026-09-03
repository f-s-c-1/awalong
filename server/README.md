# @awalong/server

Fastify + WebSocket 游戏服务端。核心是纯函数状态机，网络层只做消息路由与视角投影。

## 目录

```
src/
├── main.ts            # 进程入口（读取 config 并 listen）
├── app.ts             # buildApp()：组装 Fastify、路由、网关、服务，供测试复用
├── config.ts          # 环境变量
├── auth.ts            # 匿名账号 + JWT
├── game/
│   ├── fsm.ts         # createGame / reduce：规则判定全部在这里，无 I/O
│   ├── state.ts       # 服务端权威状态（含身份，绝不直接下发）
│   ├── projection.ts  # projectFor（公开视角）/ secretFor（定向私密信息）
│   ├── game.service.ts# 每房间串行执行、计时器、副作用落地
│   └── rng.ts         # 随机源（生产用 crypto，测试用种子）
├── room/room.service.ts  # 房间/座位/准备/配置（内存版）
├── ws/gateway.ts      # WebSocket 网关、心跳、断线保座
├── ws/schemas.ts      # zod 消息校验
├── http/routes.ts     # REST：认证、建房、查房、语音令牌
└── voice/voice.service.ts # LiveKit 令牌与阶段权限联动（未配置时空操作）
```

## 命令

```bash
pnpm dev        # tsx watch，默认 3000 端口
pnpm test       # vitest：规则/状态机/模糊测试/五人局端到端
pnpm typecheck
pnpm build      # tsup 打包到 dist/main.js
```

## 约定

- 新规则先在 `test/fsm.test.ts` 写场景，再改 `fsm.ts`
- 任何广播前必须经过 `projectFor`；私密信息只走 `secretFor` 定向发送
- 超时动作携带 `version`，过期计时器会被 reducer 忽略
- 房间存储目前是内存版，`RoomService` 的方法签名已按 Redis 版设计，替换时保持接口不变
