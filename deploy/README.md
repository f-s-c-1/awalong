# 部署

两套方案：
- `deploy/host/`（**当前线上**）：无域名、80 端口被占的单机——Caddy 只听 443 用 TLS-ALPN 签证书，全部 host 网络，只跑 caddy / server / livekit 三个容器。域名用 `107-173-49-32.sslip.io` 这类免费 IP 域名。重发：`deploy/host/publish.sh root@107.173.49.32`（构建 → 打包 → 上传 → 重启 server）。线上验证：`node server/scripts/smoke.mjs https://107-173-49-32.sslip.io`。
- `deploy/`（根目录）：有域名与 80/443 的标准方案：nginx + server + livekit + redis / mysql。

正式域名 **https://awl.sanmude.com** 通过机器上已有的 Cloudflare Tunnel（隧道名 `grok`，配置 `/etc/cloudflared/config.yml`）回源到 Caddy 的 HTTP 8079 端口，DNS 记录由 `cloudflared tunnel route dns grok awl.sanmude.com` 自动创建；LiveKit 媒体流不经隧道，直连服务器 IP 的 UDP 50000-50200 / TCP 7881。语音信令地址由服务端按访问域名返回（`LIVEKIT_FOLLOW_HOST=1`）。

LiveKit 服务端必须与前端 `livekit-client` 同代：客户端 2.22 配服务端 ≥ 1.13（v1.8 会因不识别新版数据通道导致"negotiation timed out"反复重连），compose 里用 `livekit/livekit-server:latest`。

线上机器备注：1 核 / 961MB，与其他项目共用；`nf_conntrack_max` 已从 8192 提到 65536（`/etc/sysctl.d/99-awalong-conntrack.conf`），否则连接表打满会导致丢包与 Docker 拉取失败。

## 标准方案（nginx）

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
