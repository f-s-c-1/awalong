#!/usr/bin/env bash
# 下载大厅等待音乐到 web/public/music/（Git Bash 可运行）
# 曲目来自 OpenGameArt，作者 RandomMind，许可 CC0 1.0；mp3 不进仓库（见 .gitignore），清单 playlist.json 进仓库
# 规则：已存在且 >1MB 的文件跳过；下载后校验 MP3 文件头（ID3 或帧同步字），不合法则删除并报错退出
# 代理：curl 自动读取 HTTP_PROXY / HTTPS_PROXY 环境变量
# 用法：bash scripts/fetch-music.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/web/public/music"
MIN_BYTES=$((1024 * 1024))

# 文件名|下载地址
TRACKS=(
  "the-old-tower-inn.mp3|https://opengameart.org/sites/default/files/The_Old_Tower_Inn.mp3"
  "the-bards-tale.mp3|https://opengameart.org/sites/default/files/The_Bards_Tale.mp3"
  "kings-feast.mp3|https://opengameart.org/sites/default/files/Kings_Feast.mp3"
  "minstrel-dance.mp3|https://opengameart.org/sites/default/files/Minstrel_Dance.mp3"
)

file_size() {
  wc -c <"$1" | tr -d ' '
}

human_size() {
  awk -v b="$1" 'BEGIN { printf "%.1f MB", b / 1048576 }'
}

# 前 3 字节：49 44 33 = "ID3" 标签；ff fb / ff f3 / ff f2 = MPEG 音频帧同步字
is_mp3() {
  local hex
  hex="$(head -c 3 "$1" | od -An -tx1 | tr -d ' \n')"
  case "$hex" in
    494433* | fffb* | fff3* | fff2*) return 0 ;;
  esac
  return 1
}

mkdir -p "$DEST"

for entry in "${TRACKS[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"
  target="$DEST/$name"
  part="$target.part"

  if [[ -f "$target" ]] && (($(file_size "$target") > MIN_BYTES)); then
    echo "跳过  $name（已存在，$(human_size "$(file_size "$target")")）"
    continue
  fi

  echo "下载  $name"
  rm -f "$part"
  if ! curl -fsSL --retry 3 --retry-delay 2 --connect-timeout 20 -o "$part" "$url"; then
    rm -f "$part"
    echo "错误：下载失败 $url" >&2
    exit 1
  fi

  if ! is_mp3 "$part"; then
    rm -f "$part"
    echo "错误：$name 不是有效的 MP3 文件（文件头校验失败），已删除" >&2
    exit 1
  fi

  mv -f "$part" "$target"
  echo "完成  $name（$(human_size "$(file_size "$target")")）"
done

echo
echo "曲目目录：$DEST"
for entry in "${TRACKS[@]}"; do
  name="${entry%%|*}"
  printf '  %-24s %10s 字节  %s\n' "$name" "$(file_size "$DEST/$name")" "$(human_size "$(file_size "$DEST/$name")")"
done
