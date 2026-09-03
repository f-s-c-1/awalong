# 部署

单机 Docker Compose：nginx（静态站 + 反代）、server（Fastify）、livekit（语音）、redis / mysql（预留）。

## 前置
1. 域名已备案并解析到服务器；证书放到 `deploy/certs/fullchain.pem` 与 `privkey.pem`（acme.sh 自动续签后 `docker compose restart nginx`）
2. 云安全组放行：TCP 80/443/7881/5349，UDP 3478、50000-60000
3. 复制根目录 `.env.example` 为 `.env` 并填写；`LIVEKIT_KEYS` 格式为 `APIkey: secret`

## 步骤
```bash
pnpm install
pnpm --filter @awalong/web build          # 产出 web/dist
cd deploy
docker compose up -d --build
docker compose logs -f server
```

前端的 LiveKit 地址用 `wss://域名/rtc`（nginx 已反代）；服务端 `LIVEKIT_URL` 同样填这个地址。
