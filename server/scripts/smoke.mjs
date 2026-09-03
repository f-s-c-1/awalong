// 线上冒烟：node scripts/smoke.mjs https://域名
// 建 5 个匿名用户 → 建房 → WebSocket 入座准备 → 开局 → 收到身份与夜晚阶段 → 语音令牌 → LiveKit 令牌校验
import WebSocket from 'ws'

const base = (process.argv[2] ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')
const wsBase = base.replace(/^http/, 'ws')

async function api(path, body, token) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${wsBase}/ws?token=${token}`)
    const client = { socket, msgs: [], state: null, secret: null, waiters: [] }
    socket.on('open', () => resolve(client))
    socket.on('error', reject)
    socket.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      client.msgs.push(msg)
      if (msg.type === 'game.sync') client.state = msg.state
      if (msg.type === 'game.secret') client.secret = msg.secret
      for (const w of [...client.waiters]) if (w.pred(msg)) { client.waiters.splice(client.waiters.indexOf(w), 1); w.resolve(msg) }
    })
  })
}

function waitFor(client, pred, label, ms = 8000) {
  const hit = client.msgs.find(pred)
  if (hit) return Promise.resolve(hit)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${label} 超时`)), ms)
    client.waiters.push({ pred, resolve: (m) => { clearTimeout(timer); resolve(m) } })
  })
}

const send = (c, msg) => c.socket.send(JSON.stringify(msg))
const ok = (label) => console.log(`✓ ${label}`)

const health = await api('/api/health')
if (!health.json.ok) throw new Error('health 失败')
ok(`health ${base}`)

const names = ['老K', '阿明', 'Momo', '小舟', 'Leo']
const users = []
for (const n of names) {
  const r = await api('/api/auth/anon', { nickname: n, avatar: 'sword' })
  if (r.status !== 200) throw new Error(`anon ${r.status}`)
  users.push(r.json)
}
ok('匿名注册 ×5')

const room = await api('/api/rooms', { playerCount: 5 }, users[0].token)
if (room.status !== 200) throw new Error(`建房 ${room.status} ${JSON.stringify(room.json)}`)
ok(`建房 ${room.json.code}`)

const clients = []
for (const u of users) clients.push(await connect(u.token))
ok('WebSocket 连接 ×5')

send(clients[0], { type: 'sync.request', version: 0 })
for (const c of clients.slice(1)) send(c, { type: 'room.join', code: room.json.code })
for (const c of clients) await waitFor(c, (m) => m.type === 'room.sync' && m.room.seats.length === 5, '5 人入座')
ok('5 人入座')

for (const c of clients.slice(1)) send(c, { type: 'room.ready', ready: true })
await waitFor(clients[0], (m) => m.type === 'room.sync' && m.room.seats.filter((s) => s.ready).length === 4, '4 人准备')
ok('4 人准备')

send(clients[0], { type: 'game.start' })
for (const c of clients) {
  await waitFor(c, (m) => m.type === 'game.secret', '身份')
  await waitFor(c, (m) => m.type === 'game.sync' && m.state.phase === 'NIGHT', '夜晚阶段')
}
ok(`开局：身份 ${clients.map((c) => c.secret.role).join(' / ')}`)
if (JSON.stringify(clients[0].state).includes('"role":')) throw new Error('公开态泄露身份')
ok('公开态不含身份')

const voice = await api('/api/voice/token', {}, users[0].token)
if (voice.status === 200) {
  ok(`语音令牌签发 url=${voice.json.url}`)
  const validate = await fetch(`${voice.json.url.replace(/^ws/, 'http')}/rtc/validate?access_token=${voice.json.token}`)
  console.log(`${validate.status === 200 ? '✓' : '✗'} LiveKit 信令校验 HTTP ${validate.status} ${(await validate.text()).slice(0, 60)}`)
} else {
  console.log(`- 语音未配置（${voice.status}）`)
}

send(clients[0], { type: 'game.decide', action: 'ABORT' })
await waitFor(clients[0], (m) => m.type === 'game.over', '作废结算')
ok('房主作废对局 → 结算')
for (const c of clients) c.socket.close()
console.log('冒烟通过')
