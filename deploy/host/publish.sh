#!/usr/bin/env bash
# 一键重发到单机（Git Bash 可用）：构建前端与服务端 → 打包 → 上传 → 重启容器
# 用法：deploy/host/publish.sh root@107.173.49.32 [仅重启的服务名，默认 server]
set -euo pipefail
HOST="${1:?用法: publish.sh user@host [service]}"
SERVICE="${2:-server}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PKG="$(mktemp -d)"

cd "$ROOT"
pnpm --filter @awalong/web build
pnpm --filter @awalong/server build

mkdir -p "$PKG/server" "$PKG/web"
cp server/dist/main.js "$PKG/server/"
cp -r web/dist/. "$PKG/web/"
cp deploy/host/docker-compose.yml deploy/host/Caddyfile deploy/host/livekit.yaml "$PKG/"
tar czf "$PKG.tgz" -C "$PKG" .

for i in 1 2 3 4; do
  if ssh -o ConnectTimeout=30 -o ServerAliveInterval=10 "$HOST" \
    "mkdir -p /opt/awalong && tar xzf - -C /opt/awalong && cd /opt/awalong && docker compose up -d $SERVICE && docker ps --filter name=awalong --format 'table {{.Names}}\t{{.Status}}'" \
    < "$PKG.tgz"; then
    echo "发布完成"
    break
  fi
  echo "第 $i 次连接失败，15 秒后重试"; sleep 15
done
rm -rf "$PKG" "$PKG.tgz"
