#!/usr/bin/env bash
# 一键重发到单机（Git Bash 可用）：构建前端与服务端 → 打包 → 上传 → 重建容器
# 注意：代码通过 bind mount 挂入容器，compose 检测不到文件变化，必须 --force-recreate 才会加载新代码
# 用法：deploy/host/publish.sh root@107.173.49.32 [仅重启的服务名，默认 server]
set -euo pipefail
HOST="${1:?用法: publish.sh user@host [service]}"
SERVICE="${2:-server}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$(mktemp -d)"

cd "$ROOT"
pnpm --filter @awalong/web build
pnpm --filter @awalong/server build

mkdir -p "$PKG/server" "$PKG/web" "$PKG/caddy"
cp server/dist/main.js "$PKG/server/"
cp -r web/dist/. "$PKG/web/"
cp deploy/host/docker-compose.yml deploy/host/livekit.yaml "$PKG/"
cp deploy/host/Caddyfile "$PKG/caddy/"
# 等待音乐（约 17MB）不进发布包：首次或曲目变更时单独 scp -r web/public/music root@host:/opt/awalong/web/
tar czf "$PKG.tgz" -C "$PKG" --exclude='./web/music' .

for i in 1 2 3 4; do
  if ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 "$HOST" \
    "mkdir -p /opt/awalong && tar xzf - -C /opt/awalong && cd /opt/awalong && docker compose up -d --force-recreate --no-deps $SERVICE && (docker exec awalong-caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true) && docker ps --filter name=awalong --format 'table {{.Names}}\t{{.Status}}'" \
    < "$PKG.tgz"; then
    echo "发布完成"
    break
  fi
  echo "第 $i 次连接失败，15 秒后重试"; sleep 15
done
rm -rf "$PKG" "$PKG.tgz"
