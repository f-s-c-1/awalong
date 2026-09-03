# @awalong/web

阿瓦隆移动端 H5 客户端（Vue 3 + TypeScript + Vite + Pinia + vue-router），pnpm monorepo 的 `web` 工作区包。协议与规则类型全部来自 `@awalong/shared`，REST 形态以 `server/src/http/routes.ts` 为准。

## 启动

在仓库根目录统一安装依赖后运行：

```bash
pnpm install
pnpm dev:web            # 等价于 pnpm --filter @awalong/web dev，带 --host 便于手机同网段访问
```

其他脚本（在 `web/` 目录或通过 `--filter @awalong/web` 执行）：

| 脚本 | 说明 |
|---|---|
| `dev` | Vite 开发服务器，`/api` 与 `/ws` 代理到 `http://localhost:3000`（需先启动 `@awalong/server`） |
| `build` | 产物输出到 `dist/`，由 nginx 托管 |
| `preview` | 本地预览构建产物 |
| `typecheck` | `vue-tsc --noEmit` |

可选环境变量（`.env.local`）：

- `VITE_API_BASE`：REST 基地址，默认同源（走代理）
- `VITE_WS_URL`：WebSocket 地址，默认 `ws(s)://当前域名/ws`（连接时追加 `?token=<jwt>`）

## 目录

```
web/
├── index.html                 # viewport-fit=cover、禁止缩放、theme-color
├── vite.config.ts             # plugin-vue、@ 别名、/api /ws 代理
├── src/
│   ├── main.ts                # 装载 pinia / router，预实例化监听 WS 的 store
│   ├── App.vue                # <RouterView> + 重连提示条 + 横屏遮罩
│   ├── styles/
│   │   ├── tokens.css         # 设计令牌（颜色、字体、安全区），html 字号 = 100vw/39（≥480px 固定 12.3px）
│   │   └── base.css           # 重置、.page 容器、按钮三态、.card/.chip、减少动效
│   ├── router/index.ts        # / /welcome /join /r/:code /game /result /rules 及守卫
│   ├── views/
│   │   ├── HomeView.vue       # 封面（星幕 + 圣剑徽章，按 Main 画板还原）；已登录时显示「回到房间」
│   │   ├── WelcomeView.vue    # 昵称 + 12 个预设头像（字符串 id）
│   │   ├── JoinView.vue       # 6 位房间码 + 自绘数字键盘（支持粘贴与物理键盘）
│   │   ├── RoomView.vue       # 大厅：房间码、座位环（点空位入座）、角色板子、准备/开始
│   │   ├── GameView.vue       # 桌面骨架：QuestTrack / SeatRing / PhaseBar / 操作区占位
│   │   ├── ResultView.vue     # 结算占位：胜负、胜因、身份揭示、再来一局
│   │   └── RulesView.vue      # 规则说明（人数、板子、任务表直接取自 @awalong/shared）
│   ├── components/
│   │   ├── SeatRing.vue       # 环形座位，「我」固定正下方；点击 / 长按事件
│   │   ├── SeatAvatar.vue     # 头像圆 + 角标插槽（皇冠、剑徽、序号、对勾、断线、私人标记）
│   │   ├── AvatarIcon.vue     # 按 id 渲染预设头像徽记（单色描边 SVG 占位）
│   │   ├── QuestTrack.vue     # 5 面任务盾 + 流局点 + 双失败票注
│   │   ├── PhaseBar.vue       # 阶段文案 + 服务端时钟倒计时（最后 5 秒变红并震动）
│   │   └── OrientationGuard.vue # 触屏横屏时的全屏「请竖屏游玩」
│   ├── services/
│   │   ├── api.ts             # fetch 封装，自动 Bearer；匿名登录 / 我的资料 / 房间 / 语音 token
│   │   ├── ws.ts              # WS 单例：心跳 15s、指数退避重连、version 去重、回前台 sync.request
│   │   ├── voice.ts           # LiveKit 语音客户端封装
│   │   └── sfx.ts             # Web Audio 合成音效
│   ├── stores/
│   │   ├── user.ts            # uid / token / 昵称 / 头像 id（localStorage）
│   │   ├── room.ts            # RoomSync（座位、房主、状态、我的座位）+ room.closed / error
│   │   ├── game.ts            # ClientGameState + SecretInfo + MatchSummary + 服务端时钟偏移
│   │   └── marks.ts           # 私人标记（localStorage `marks:<房间码>`，对局结束清除）
│   ├── assets/avatars.ts      # 头像 id、名称、底色、路径
│   ├── utils/                 # storage / clipboard / rules（规则表安全取值）/ roles（角色与胜因文案）
│   └── types/ui.ts            # 纯前端视图模型（RingSeat、MarkKind）
└── README.md
```

## 协议要点

- WS 消息为扁平对象（`{ type: 'room.ready', ready: true }`），无外层 `data` 包裹
- 连接建立后服务端自动补发 `room.sync` / `game.sync` / `game.secret`；前端首次进房发一次 `room.join`，重连后只发 `sync.request`
- `game.sync` 全量快照始终采纳并刷新版本基线；`phase.change` / `team.reveal` / `quest.reveal` / `game.over` 版本低于基线时丢弃
- 服务端时钟偏移由 `heartbeat.ack`（往返一半）、`phase.change`、`game.sync` 的 `serverTime` 校准，倒计时按服务端时钟
- 匿名登录 `POST /api/auth/anon` 要求昵称与头像非空，因此建房 / 进房前必须先完成引导页；`GET /api/rooms/:code` 不需要登录

## 约定

- 设计稿 390px 基准，`1rem = 10px @390`；尺寸一律用 `rem`，容器 `max-width: 480px` 居中
- 不引入 UI 组件库与 tailwind，视觉全部按 `tokens.css` 自写；图标全部内联 SVG
- 金色只用于当前可操作点与队长标识；红 / 蓝只表达阵营语义
- 组件使用 `<script setup lang="ts">`，2 空格缩进，单引号，无分号
- 客户端不做任何规则判定，只发送意图；所有状态来自服务端推送

## 本地存储键

| 键 | 存储 | 内容 |
|---|---|---|
| `avalon.auth` | localStorage | `{ uid, token }`，由 `services/api.ts` 维护 |
| `avalon.profile` | localStorage | `{ nickname, avatar }` |
| `avalon.room` | sessionStorage | 当前房间码，刷新后凭 JWT 回到对局 |
| `avalon.sfx.muted` | localStorage | 音效开关 |
| `marks:<房间码>` | localStorage | 私人标记，`game.over` 时清除 |

## 字体

`tokens.css` 中 `.serif` 使用 `'Noto Serif SC', 'STSong', serif`，`.latin` 使用 `'Cinzel'`。国内环境不可直连 Google Fonts，上线前需用 fontmin 子集化后自托管并在 `tokens.css` 增加 `@font-face`；未配置时回退到系统衬线字体。
