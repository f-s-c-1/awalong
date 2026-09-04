# 阿瓦隆 · H5 网页游戏

线上多人社交推理桌游《阿瓦隆》的移动端 H5 实现：房间制对局（5-10 人）、服务端权威的游戏状态机、WebRTC 实时语音讨论、暗色中世纪奇幻 UI。微信内以链接分享直接开局。

## 设计文档

| 文档 | 内容 |
|---|---|
| [01-游戏规则](docs/01-游戏规则.md) | 角色/阵营配置、任务表、完整流程、线上适配规则 |
| [02-总体架构](docs/02-总体架构.md) | 技术选型、状态机、WS 协议、视角过滤防作弊、部署拓扑 |
| [03-房间系统设计](docs/03-房间系统设计.md) | 建房/加入/座位/断线/回收全生命周期 |
| [04-语音方案](docs/04-语音方案.md) | 自建 LiveKit 语音房 + 阶段联动闭麦，含浏览器兼容与降级链路 |
| [05-UI交互设计](docs/05-UI交互设计.md) | 视觉规范、封面定稿、页面结构、各阶段交互细节 |
| [06-开发路线图](docs/06-开发路线图.md) | 里程碑、仓库结构、质量要求、决策记录 |
| [07-实现方案](docs/07-实现方案.md) | 状态机 reducer、视角投影、WS 网关、LiveKit 联动、前端组件映射、测试与部署、尚缺清单 |

## 技术栈

- 前端：Vue 3 + TypeScript + Vite（移动端 H5）
- 服务端：Node.js + Fastify + WebSocket（纯函数状态机 + 视角投影）
- 存储：Redis（房间/对局态）+ MySQL（用户/战绩）
- 语音：自建 LiveKit SFU（WebRTC，纯音频）

## 规划中的目录结构

```
awalong/
├── docs/      # 设计文档
├── web/       # H5 前端
├── server/    # 游戏服务端
├── shared/    # 前后端共享协议类型
└── deploy/    # Docker Compose / nginx / livekit 配置
```

## 本地开发与测试

```bash
pnpm install
pnpm dev:server                 # Fastify + ws，默认 :3000（PORT 覆盖端口；DATA_DIR=./data 时用户与战绩落盘，否则只存内存）
pnpm dev:web                    # Vite，默认 :5173，/api 与 /ws 代理到 :3000
pnpm -r typecheck && pnpm -r test   # 类型检查 + 规则表 / 状态机 / WebSocket 集成测试
bash scripts/fetch-music.sh         # 下载大厅等待音乐（OpenGameArt · RandomMind · CC0）到 web/public/music/，mp3 不进仓库
```

等待音乐不随 `deploy/host/publish.sh` 发布包上传，首次部署或曲目变更时手动同步一次：`scp -r web/public/music root@107.173.49.32:/opt/awalong/web/`。服务器缺少该目录时大厅自动退回合成氛围垫。

多人端到端回归（Playwright，使用本机已装的 Chrome，每名玩家一个独立浏览器上下文，完整跑通建房 → 发牌 → 组队 → 表决 → 出票 → 刺杀 → 结算）：

```bash
pnpm --filter @awalong/web test:e2e -- --players 5
# 分支用例：--evil-fails 1（第 1 次任务出现失败票）--reject-first（首次组队全员反对）
#           --reject-all（五次流局）--again（再来一局）--speech turns（轮流发言）
#           --base http://localhost:5174（前端跑在其他端口时）--headed（有头观察）
```

截图输出在 `web/e2e/shots/`，桌面页的 `data-test` 锚点是脚本与界面之间的契约，改交互时请同步维护。
