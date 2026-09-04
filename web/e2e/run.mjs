#!/usr/bin/env node
// 阿瓦隆 H5 端到端脚本：N 个独立浏览器上下文模拟 N 名玩家，跑通「引导页 → 建房/进房 → 准备 → 开局 → 对局 → 结算」
//
// 用法：
//   node run.mjs --players 5 [--headed] [--slow 100] [--lobby-only] [--evil-fails 1,3]
//                [--reject-first] [--reject-all] [--again] [--speech free|turns]
//                [--base http://localhost:5173] [--timeout 15000] [--browser chrome|msedge|chromium] [--exe <浏览器路径>]
//
// 说明：
//   --players       玩家人数 5-10，默认 5
//   --headed        有头模式（默认无头）
//   --slow          每个操作放慢的毫秒数（Playwright slowMo）
//   --lobby-only    只跑大厅流程（进房、准备、开局、跳到 /game）
//   --evil-fails    第几次任务要出现失败票（1 起算，逗号分隔）。该轮队长会把足够数量的邪恶方带进队伍
//                   （队长自己是邪恶方就优先带自己），队内邪恶方出失败票，并校验揭晓结果确为失败
//   --reject-first  第一次组队全员反对，校验进入第 2 次组队且座位环出现 vote-badge[data-approve="false"]
//   --reject-all    每次组队全员反对，校验连续 5 次否决后直接到 /result 且标题为「邪恶方胜利」
//   --again         结算后房主点「再来一局」，校验全员 10 秒内回到大厅，再准备、再开局、再进入 NIGHT 并读到身份牌
//   --records       结算后每名玩家在同一浏览器上下文新开标签打开 /records，校验统计卡与至少一条战绩
//   --speech        发言模式：turns（默认，与服务端默认一致；房主在大厅把每人时长改为 20s 加快用例）/ free
//                   （房主在大厅切回自由发言）。turns 时表决前依次让当前发言者点 speaker-done
//   --base          前端地址，默认 http://localhost:5173
//   --timeout       单步超时毫秒，默认 15000
//   --browser       使用系统已装浏览器的 channel（chrome / msedge），或 chromium（Playwright 自带缓存）
//   --exe           直接指定浏览器可执行文件路径（优先级高于 --browser）
//
// 退出码：0 成功；1 某一步失败（已打印该玩家 URL / data-phase / 可见文本）；2 参数或环境问题

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS_DIR = join(__dirname, 'shots')

/** 人数 → 五轮任务队员数（与 shared/src/rules.ts 一致，页面读不到时兜底） */
const QUEST_SIZE = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
}

/** 7 人及以上第 4 轮（索引 3）需要 2 张失败票 */
function failsNeeded(playerCount, questIndex) {
  return playerCount >= 7 && questIndex === 3 ? 2 : 1
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`用法：node run.mjs --players 5 [--headed] [--slow 100] [--lobby-only] [--evil-fails 1]
             [--reject-first] [--reject-all] [--again] [--speech free|turns]
             [--base http://localhost:5173] [--timeout 15000] [--browser chrome|msedge|chromium] [--exe <路径>]`)
}

function parseArgs(argv) {
  const opts = {
    players: 5,
    headed: false,
    slow: 0,
    lobbyOnly: false,
    evilFails: [],
    rejectFirst: false,
    rejectAll: false,
    again: false,
    speech: 'turns',
    records: false,
    base: 'http://localhost:5173',
    timeout: 15000,
    browser: 'chrome',
    exe: '',
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`参数 ${arg} 缺少取值`)
      return argv[i]
    }
    switch (arg) {
      case '--players':
        opts.players = Number(next())
        break
      case '--headed':
        opts.headed = true
        break
      case '--slow':
        opts.slow = Number(next())
        break
      case '--lobby-only':
        opts.lobbyOnly = true
        break
      case '--evil-fails':
        opts.evilFails = String(next())
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
        break
      case '--reject-first':
        opts.rejectFirst = true
        break
      case '--reject-all':
        opts.rejectAll = true
        break
      case '--records':
        opts.records = true
        break
      case '--again':
        opts.again = true
        break
      case '--speech':
        opts.speech = next()
        break
      case '--base':
        opts.base = String(next()).replace(/\/+$/, '')
        break
      case '--timeout':
        opts.timeout = Number(next())
        break
      case '--browser':
        opts.browser = next()
        break
      case '--exe':
        opts.exe = next()
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      default:
        throw new Error(`未知参数：${arg}`)
    }
  }
  if (!Number.isInteger(opts.players) || opts.players < 5 || opts.players > 10) {
    throw new Error('--players 必须是 5-10 的整数')
  }
  if (!Number.isFinite(opts.timeout) || opts.timeout < 1000) throw new Error('--timeout 至少 1000 毫秒')
  if (!['free', 'turns'].includes(opts.speech)) throw new Error('--speech 只能是 free 或 turns')
  return opts
}

// ---------------------------------------------------------------------------
// 通用工具
// ---------------------------------------------------------------------------

function ts() {
  const d = new Date()
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`)
}

function warn(msg) {
  console.warn(`[${ts()}] [警告] ${msg}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 步骤失败：诊断信息已打印，向上抛出时只带简短说明 */
class StepError extends Error {
  constructor(player, stepName, cause) {
    super(`${player.name} 在「${stepName}」失败：${String(cause?.message ?? cause).split('\n')[0]}`)
    this.player = player
    this.stepName = stepName
    this.cause = cause
  }
}

let shotCounter = 0

/** 等待页面上正在进行的 CSS 动画 / 过渡结束（翻牌、揭晓等），最多等 maxMs，避免截到动画中间帧 */
async function settleAnimations(page, maxMs = 1500) {
  await Promise.race([
    page
      .evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
      .catch(() => undefined),
    sleep(maxMs),
  ])
}

/** 关键节点截图：文件名带序号，便于按时间顺序查看 */
async function shot(player, name) {
  await settleAnimations(player.page)
  shotCounter += 1
  // 多名玩家并发截图时序号要先固定住，避免日志里串号
  const idx = String(shotCounter).padStart(2, '0')
  const file = join(SHOTS_DIR, `${idx}-${name}.png`)
  try {
    await player.page.screenshot({ path: file, fullPage: true })
    log(`${player.name} 截图 -> shots/${idx}-${name}.png`)
  } catch (err) {
    warn(`${player.name} 截图失败（${name}）：${err.message.split('\n')[0]}`)
  }
}

/** 超时/失败时打印该玩家的现场：URL、data-phase、可见文本前 300 字、最近的浏览器错误 */
async function diagnose(player, stepName, err) {
  const { page } = player
  let url = '(未知)'
  let phase = '(无 main.game)'
  let text = ''
  try {
    url = page.url()
  } catch {
    // 页面已关闭
  }
  try {
    const attr = await page.locator('main.game').first().getAttribute('data-phase', { timeout: 1000 })
    phase = attr ?? '(main.game 无 data-phase 属性)'
  } catch {
    // 不在桌面页
  }
  try {
    text = (await page.locator('body').innerText({ timeout: 2000 })).replace(/\s+/g, ' ').trim().slice(0, 300)
  } catch {
    text = '(读取失败)'
  }
  console.error(`\n[${ts()}] [失败] ${player.name} 在「${stepName}」：${String(err?.message ?? err).split('\n')[0]}`)
  console.error(`  URL        : ${url}`)
  console.error(`  data-phase : ${phase}`)
  console.error(`  可见文本   : ${text}`)
  if (player.errors.length) console.error(`  浏览器错误 : ${player.errors.slice(-5).join(' | ')}`)
  try {
    await page.screenshot({ path: join(SHOTS_DIR, `fail-${player.name}.png`), fullPage: true })
    console.error(`  现场截图   : shots/fail-${player.name}.png`)
  } catch {
    // 忽略
  }
}

/** 包装一步操作：成功打日志，失败打诊断后抛 StepError */
async function step(player, stepName, fn) {
  try {
    const result = await fn()
    log(`${player.name} ${stepName}`)
    return result
  } catch (err) {
    if (err instanceof StepError) throw err
    await diagnose(player, stepName, err)
    throw new StepError(player, stepName, err)
  }
}

/** 校验失败（非超时，而是结果不符预期）：同样打诊断并终止 */
async function fail(player, stepName, message) {
  const err = new Error(message)
  await diagnose(player, stepName, err)
  throw new StepError(player, stepName, err)
}

// ---------------------------------------------------------------------------
// 环境准备
// ---------------------------------------------------------------------------

/** 轮询前端地址直到返回 200（最多 maxMs）。Node 的 fetch 不读取 HTTP_PROXY，不会被本机代理拦截 */
async function waitForServer(base, maxMs = 60_000) {
  const start = Date.now()
  let lastErr = ''
  let attempt = 0
  while (Date.now() - start < maxMs) {
    attempt += 1
    try {
      const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(3000), redirect: 'manual' })
      if (res.status === 200) {
        log(`前端 ${base} 已就绪（第 ${attempt} 次探测，用时 ${Date.now() - start} ms）`)
        return
      }
      lastErr = `HTTP ${res.status}`
    } catch (err) {
      lastErr = err?.cause?.code ?? err.message
    }
    if (attempt === 1) log(`等待前端 ${base} 就绪…（${lastErr}）`)
    await sleep(1000)
  }
  throw new Error(`等待 ${base} 超过 ${maxMs / 1000} 秒仍未返回 200，最后一次结果：${lastErr}`)
}

async function launchBrowser(opts) {
  const launch = {
    headless: !opts.headed,
    // 浏览器直连本机服务：本机设置了 HTTP_PROXY 时避免 localhost 被代理拦成 502
    args: ['--no-proxy-server'],
  }
  if (opts.slow > 0) launch.slowMo = opts.slow
  if (opts.exe) launch.executablePath = opts.exe
  else if (opts.browser !== 'chromium') launch.channel = opts.browser
  const browser = await chromium.launch(launch)
  log(`浏览器已启动：${opts.exe || opts.browser} ${browser.version()}（${opts.headed ? '有头' : '无头'}${opts.slow ? `，slowMo ${opts.slow}ms` : ''}）`)
  return browser
}

/** 每名玩家一个独立 context（独立 localStorage / sessionStorage），手机视口 390×844 */
async function createPlayer(browser, index, opts) {
  const name = `P${index + 1}`
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    // 游戏中会申请麦克风；事先拒绝，避免弹窗阻塞
    permissions: [],
  })
  context.setDefaultTimeout(opts.timeout)
  context.setDefaultNavigationTimeout(opts.timeout)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 160)}`)
  })
  return { index, name, context, page, errors, seat: undefined, role: undefined, side: undefined }
}

// ---------------------------------------------------------------------------
// 大厅流程
// ---------------------------------------------------------------------------

/** 引导页：填写昵称、选头像、保存并跳到 redirect */
async function setupProfile(player, opts, redirect = '/') {
  const { page, name } = player
  await step(player, `打开引导页 /welcome?redirect=${redirect}`, () =>
    page.goto(`${opts.base}/welcome?redirect=${encodeURIComponent(redirect)}`, { waitUntil: 'domcontentloaded' }),
  )
  await step(player, `填写昵称「${name}」`, async () => {
    const input = page.locator('input[autocomplete="nickname"], input.field__input').first()
    await input.fill(name)
  })
  await step(player, '选择头像', async () => {
    const grid = page.getByRole('radiogroup', { name: '头像' })
    const items = grid.getByRole('radio')
    const total = await items.count()
    if (total === 0) throw new Error('头像网格为空')
    const target = items.nth(player.index % total)
    await target.click()
    await grid.locator('[role="radio"][aria-checked="true"]').waitFor()
  })
  await step(player, `保存并跳转到 ${redirect}`, async () => {
    await page.getByRole('button', { name: '保存并继续' }).click()
    const targetPath = new URL(redirect, opts.base).pathname
    await page.waitForURL((u) => new URL(u).pathname === targetPath)
  })
}

/** 房主在首页建 N 人房，返回房间码 */
async function createRoom(owner, opts) {
  const { page } = owner
  await step(owner, '点击「创建房间」', () => page.getByRole('button', { name: '创建房间', exact: true }).click())
  await step(owner, `设置面板选择 ${opts.players} 人`, async () => {
    const group = page.getByRole('radiogroup', { name: '人数' })
    await group.getByRole('radio', { name: String(opts.players), exact: true }).click()
    await group.locator(`[role="radio"][aria-checked="true"]`).filter({ hasText: new RegExp(`^${opts.players}$`) }).waitFor()
  })
  await step(owner, `确认「创建 ${opts.players} 人房间」`, async () => {
    await page.getByRole('button', { name: `创建 ${opts.players} 人房间` }).click()
    await page.waitForURL(/\/r\/\d{6}/)
  })
  const code = new URL(page.url()).pathname.match(/\/r\/(\d{6})/)[1]
  log(`房间码：${code}`)
  await step(owner, '等待房间同步（出现「开始游戏」按钮）', () =>
    page.getByRole('button', { name: '开始游戏' }).waitFor(),
  )
  return code
}

/** 房主在大厅打开「设置」，按 mode 切发言模式（turns 同时把每人时长改为 20s）并保存 */
async function configureSpeech(owner, mode) {
  const { page } = owner
  const dialog = page.getByRole('dialog', { name: '对局设置' })
  const label = mode === 'turns' ? '轮流发言' : '自由发言'
  await step(owner, '大厅打开「设置」面板', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await dialog.waitFor()
  })
  await step(owner, '切换为「' + label + '」' + (mode === 'turns' ? '，每人 20s' : ''), async () => {
    const group = dialog.getByRole('radiogroup', { name: '发言模式' })
    await group.getByRole('radio', { name: label }).click()
    await group.locator('[role="radio"][aria-checked="true"]').filter({ hasText: label }).waitFor()
    if (mode === 'turns') await dialog.locator('[aria-label="每人发言时长"]').getByRole('button', { name: /^20s/ }).click()
  })
  await shot(owner, 'settings-speech-' + mode)
  await step(owner, '点击「保存设置」', async () => {
    await dialog.getByRole('button', { name: '保存设置' }).click()
    await dialog.waitFor({ state: 'hidden' })
  })
}

/** 等待大厅完成首次同步：中心文案离开「正在连接…」（或出现错误框） */
async function waitLobbySynced(page, timeout) {
  await page.waitForFunction(
    () => {
      if (document.querySelector('.room__error')) return true
      const sub = document.querySelector('.room__center-sub')?.textContent?.trim() ?? ''
      return sub !== '' && sub !== '正在连接…'
    },
    null,
    timeout ? { timeout } : undefined,
  )
}

/** 非房主：访问 /r/:code 进房，确认已入座（未入座则点空位） */
async function joinRoom(player, code, opts) {
  const { page } = player
  await step(player, `进入房间 /r/${code}`, () =>
    page.goto(`${opts.base}/r/${code}`, { waitUntil: 'domcontentloaded' }),
  )
  await step(player, '等待入座', async () => {
    const readyBtn = page.getByRole('button', { name: '准备', exact: true })
    const spectating = page.getByRole('button', { name: '旁观中' })
    const errorBox = page.locator('.room__error')
    // room.sync 到达前页脚会先渲染出禁用的「旁观中」，必须先等首次同步完成
    await waitLobbySynced(page)
    await readyBtn.or(spectating).or(errorBox).first().waitFor()
    if (await errorBox.isVisible()) {
      throw new Error(`房间页报错：${(await errorBox.innerText()).trim()}`)
    }
    if (await spectating.isVisible()) {
      // 同步后仍是旁观者且大厅未满：点第一个空位入座
      const hint = (await page.locator('.room__hint').innerText().catch(() => '')).trim()
      if (!hint.includes('点击空位入座')) throw new Error(`进房后为旁观者且无法入座：${hint}`)
      warn(`${player.name} 进房后是旁观者，点击空位入座`)
      await page.locator('button[aria-label*="空位"]').first().click()
      await readyBtn.waitFor()
    }
  })
}

/** 点「准备」直到按钮变成「取消准备」；已经是准备状态则跳过 */
async function ensureReady(player, label = '点击「准备」') {
  const { page } = player
  await step(player, label, async () => {
    const readyBtn = page.getByRole('button', { name: '准备', exact: true })
    const cancelBtn = page.getByRole('button', { name: '取消准备' })
    await readyBtn.or(cancelBtn).first().waitFor()
    if (await cancelBtn.isVisible()) return
    await readyBtn.click()
    await cancelBtn.waitFor()
  })
}

/** 房主等所有人准备后点「开始游戏」 */
async function startGame(owner, tag = 'lobby-all-ready') {
  const { page } = owner
  await step(owner, '等待全员准备（「开始游戏」变为可点）', async () => {
    const btn = page.getByRole('button', { name: '开始游戏' })
    await btn.waitFor()
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '开始游戏')
      return !!el && !el.disabled
    }, null)
  })
  await shot(owner, tag)
  await step(owner, '点击「开始游戏」', () => page.getByRole('button', { name: '开始游戏' }).click())
}

/** 所有人等待跳到 /game 并渲染出 main.game */
async function waitEnterGame(players, tag = 'game-entered') {
  await Promise.all(
    players.map((p) =>
      step(p, '等待跳转 /game', async () => {
        await p.page.waitForURL(/\/game(\?|$)/)
        await p.page.locator('main.game').waitFor()
      }),
    ),
  )
  const phase = await players[0].page.locator('main.game').getAttribute('data-phase').catch(() => null)
  log(`全员已进入 /game，当前 data-phase=${phase ?? '(尚未提供)'}`)
  await shot(players[0], tag)
}

/**
 * 大厅完整流程：引导页 → 房主建房（可选：改发言模式）→ 其他人进房准备 → 房主开局 → 全员跳到 /game
 * 返回房间码
 */
async function runLobby(players, opts) {
  const [owner, ...others] = players

  log(`==== 大厅流程：${players.length} 名玩家设置资料 ====`)
  await Promise.all(players.map((p) => setupProfile(p, opts, '/')))

  log('==== 房主建房 ====')
  const code = await createRoom(owner, opts)
  log('==== 房主设置发言模式：' + (opts.speech === 'turns' ? '轮流发言 20s' : '自由发言') + ' ====')
  await configureSpeech(owner, opts.speech)

  log('==== 其他玩家进房并准备 ====')
  await Promise.all(
    others.map(async (p) => {
      await joinRoom(p, code, opts)
      await ensureReady(p)
    }),
  )

  log('==== 房主开局 ====')
  await startGame(owner)
  await waitEnterGame(players)
  return code
}

// ---------------------------------------------------------------------------
// 对局流程（依赖桌面 data-test 契约）
// ---------------------------------------------------------------------------

/** 从某名玩家的桌面读取阶段信息；不在桌面时 phase 为 RESULT 或 null */
async function readTable(page) {
  return page.evaluate(() => {
    if (location.pathname.startsWith('/result')) return { phase: 'RESULT' }
    const main = document.querySelector('main.game')
    if (!main) return { phase: null }
    const text = document.body.innerText
    const leaderBtn = document.querySelector('button[data-test="seat"][aria-label*="队长"]')
    let leaderSeat = leaderBtn ? Number(leaderBtn.getAttribute('data-seat')) : NaN
    if (!leaderSeat) {
      const m = text.match(/队长\s*(\d+)\s*号/)
      if (m) leaderSeat = Number(m[1])
    }
    const sizeM = text.match(/(\d+)\s*人队伍/)
    const roundM = text.match(/第\s*(\d+)\s*轮任务/)
    const voteM = text.match(/第\s*(\d+)\s*次(?:组队|表决)/)
    return {
      phase: main.getAttribute('data-phase'),
      leaderSeat: Number.isFinite(leaderSeat) ? leaderSeat : undefined,
      teamSize: sizeM ? Number(sizeM[1]) : undefined,
      questIndex: roundM ? Number(roundM[1]) - 1 : undefined,
      voteRound: voteM ? Number(voteM[1]) : undefined,
    }
  })
}

/** 汇总多名玩家页面：队长自己的页面没有「队长 N 号」「第 N 次组队」等文案，用其他人的页面补齐 */
async function readTableAny(players) {
  const merged = {}
  for (const p of players) {
    const info = await readTable(p.page).catch(() => ({}))
    for (const [k, v] of Object.entries(info)) {
      if (merged[k] === undefined && v !== undefined && v !== null) merged[k] = v
    }
    if (merged.leaderSeat && merged.teamSize && merged.questIndex !== undefined && merged.voteRound) break
  }
  return merged
}

/**
 * 点完操作后等待「完成标记」出现；全员几乎同时操作时最后一人点完阶段会立刻推进，
 * 标记可能一闪而过甚至不渲染，因此「阶段已离开 phase」或已到结算页同样视为完成
 */
async function waitDoneOrPhaseLeft(page, doneSelector, phase, timeout) {
  await page.waitForFunction(
    ({ sel, ph }) => {
      if (document.querySelector(sel)) return true
      if (location.pathname.startsWith('/result')) return true
      const cur = document.querySelector('main.game')?.getAttribute('data-phase')
      return !!cur && cur !== ph
    },
    { sel: doneSelector, ph: phase },
    { timeout },
  )
}

/** 等待阶段离开 prev（或进入结算页），返回新阶段 */
async function waitPhaseChange(player, prev, timeout) {
  const handle = await player.page.waitForFunction(
    (prevPhase) => {
      if (location.pathname.startsWith('/result')) return 'RESULT'
      const main = document.querySelector('main.game')
      const phase = main?.getAttribute('data-phase')
      return phase && phase !== prevPhase ? phase : false
    },
    prev,
    { timeout },
  )
  return handle.jsonValue()
}

/** 夜晚：读身份牌 → 翻牌 → 截图 → 确认。tag 用于区分第几局的截图 */
async function runNight(players, opts, tag = '') {
  const suffix = tag ? `-${tag}` : ''
  await Promise.all(players.map((p) => step(p, '等待夜晚阶段 data-phase=NIGHT', () => p.page.locator('main.game[data-phase="NIGHT"]').waitFor())))
  await Promise.all(
    players.map(async (p) => {
      await step(p, '读取身份牌', async () => {
        const cards = p.page.locator('[data-test="role-card"]')
        await cards.first().waitFor()
        let card = cards.first()
        const count = await cards.count()
        if (count > 1) {
          // 页面上有多张牌时，按顶部「N 号 · 昵称」找到自己的那张
          const mySeat = (await p.page.locator('body').innerText()).match(/(\d+)\s*号\s*·/)?.[1]
          if (mySeat) card = cards.filter({ has: p.page.locator(`:scope[data-seat="${mySeat}"]`) }).first()
          warn(`${p.name} 页面有 ${count} 张 role-card，取 data-seat=${mySeat ?? '?'} 的一张`)
        }
        p.role = await card.getAttribute('data-role')
        p.side = await card.getAttribute('data-side')
        p.seat = Number(await card.getAttribute('data-seat'))
        if ((await card.getAttribute('data-face')) !== 'up') {
          await card.click()
          await p.page.locator('[data-test="role-card"][data-face="up"]').first().waitFor()
        }
        if (!p.role || !p.side || !Number.isFinite(p.seat)) {
          throw new Error(`身份牌属性不完整 role=${p.role} side=${p.side} seat=${p.seat}`)
        }
      })
      await shot(p, `role${suffix}-${p.name}-seat${p.seat}-${p.role}`)
      await step(p, `确认夜晚（${p.seat} 号 ${p.role}/${p.side}）`, async () => {
        await p.page.locator('button[data-test="night-confirm"]').click()
        await waitDoneOrPhaseLeft(p.page, '[data-test="night-waiting"]', 'NIGHT', opts.timeout)
      })
    }),
  )
  log(`身份分配${tag ? `（${tag}）` : ''}：` + players.map((p) => `${p.name}=${p.seat}号 ${p.role}(${p.side})`).join('；'))
}

/** 轮流发言：在各玩家页面轮询 speaker-done，找到当前发言者 */
async function findSpeaker(players, maxMs) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    for (const p of players) {
      if (await p.page.locator('button[data-test="speaker-done"]').isVisible().catch(() => false)) return p
    }
    await sleep(150)
  }
  return null
}

/**
 * 轮流发言：依次让当前发言者点「说完了」，直到不再有人出现 speaker-done。
 * required 为 true 时一次都没观察到即判失败
 */
async function runSpeakingTurns(players, opts, ctx, { firstWait, required }) {
  const order = []
  for (let i = 0; i < players.length * 2; i += 1) {
    const speaker = await findSpeaker(players, i === 0 ? firstWait : 3000)
    if (!speaker) break
    if (ctx.speakerTurns === 0 && order.length === 0) await shot(speaker, `speaker-done-${speaker.name}-seat${speaker.seat}`)
    await step(speaker, `轮流发言：第 ${order.length + 1} 位发言者（${speaker.seat} 号）点「说完了」`, async () => {
      const btn = speaker.page.locator('button[data-test="speaker-done"]')
      await btn.click()
      await btn.waitFor({ state: 'hidden' })
    })
    order.push(speaker)
  }
  ctx.speakerTurns += order.length
  if (order.length) log(`轮流发言顺序：${order.map((p) => `${p.seat}号${p.name}`).join(' → ')}（共 ${order.length} 位）`)
  else if (required) await fail(players[0], '等待 speaker-done', '轮流发言模式下未在任何玩家页面观察到 speaker-done')
}

/**
 * 组队：队长点满座位，确认出征并二次确认；返回队员列表
 * 默认策略：自己 → 正义方 → 其余。
 * --evil-fails 命中即将进行的这次任务时：把足够数量的邪恶方带进队伍（队长是邪恶方就先算上自己），保证真的出现失败票
 */
async function runTeamPick(players, opts, ctx) {
  const n = players.length
  const bySeat = new Map(players.map((p) => [p.seat, p]))
  const observer = players[0]

  // 任务揭晓覆盖层可能还在，先等它消失
  const reveal = observer.page.locator('[data-test="quest-reveal"]')
  if (await reveal.isVisible().catch(() => false)) {
    await reveal.waitFor({ state: 'hidden', timeout: opts.timeout }).catch(() => warn('quest-reveal 未在超时内消失，继续尝试组队'))
  }
  // 轮流发言若安排在组队前，先把发言走完
  if (opts.speech === 'turns') await runSpeakingTurns(players, opts, ctx, { firstWait: 1500, required: false })

  const info = await readTableAny(players)
  // 队长识别兜底：座位按钮 aria-label 与 PhaseBar 文案都没有时，逐个玩家找「你是队长」
  if (!info.leaderSeat) {
    for (const p of players) {
      const txt = await p.page.locator('body').innerText().catch(() => '')
      if (/你是队长/.test(txt)) {
        info.leaderSeat = p.seat
        break
      }
    }
  }
  const leader = bySeat.get(info.leaderSeat)
  if (!leader) await fail(observer, '识别队长', `无法识别队长座位（读到 ${JSON.stringify(info)}）`)
  const questIndex = info.questIndex ?? ctx.questNo
  const teamSize = info.teamSize ?? QUEST_SIZE[n]?.[questIndex]
  if (!teamSize) await fail(observer, '读取队伍人数', `无法读取本轮人数（读到 ${JSON.stringify(info)}）`)
  log(`第 ${questIndex + 1} 轮 · 第 ${info.voteRound ?? '?'} 次组队：队长 ${leader.name}（${leader.seat} 号，${leader.side}），需 ${teamSize} 人`)

  const good = players.filter((p) => p.side === 'GOOD' && p !== leader).sort((a, b) => a.seat - b.seat)
  const evil = players.filter((p) => p.side === 'EVIL' && p !== leader).sort((a, b) => a.seat - b.seat)
  const upcoming = ctx.questNo + 1
  let order
  if (opts.evilFails.includes(upcoming)) {
    const need = failsNeeded(n, questIndex)
    const bring = evil.slice(0, Math.max(0, need - (leader.side === 'EVIL' ? 1 : 0)))
    order = [leader, ...bring, ...good, ...evil.slice(bring.length)]
    log(
      `选人策略：第 ${upcoming} 次任务要出现 ${need} 张失败票，` +
        (leader.side === 'EVIL' ? '队长是邪恶方先带自己' : '队长是正义方') +
        (bring.length ? `，再带邪恶方 ${bring.map((p) => `${p.seat}号${p.name}`).join('、')}` : ''),
    )
  } else {
    order = [leader, ...good, ...evil]
  }
  const team = order.slice(0, teamSize)

  await step(leader, `选择队员：${team.map((p) => `${p.seat}号${p.name}(${p.side})`).join('、')}`, async () => {
    for (const member of team) {
      const seatBtn = leader.page.locator(`button[data-test="seat"][data-seat="${member.seat}"]`)
      await seatBtn.click()
      // 座位按钮若暴露 aria-pressed，则等它变为 true；没有就略过
      const pressed = await seatBtn.getAttribute('aria-pressed')
      if (pressed !== null) {
        await leader.page.locator(`button[data-test="seat"][data-seat="${member.seat}"][aria-pressed="true"]`).waitFor()
      }
    }
  })
  await step(leader, '确认出征并二次确认', async () => {
    await leader.page.locator('button[data-test="team-confirm"]').click()
    await leader.page.locator('button[data-test="dialog-confirm"]').click()
  })
  return team
}

/** 表决：轮流发言模式先走完发言，然后全员同意或全员反对 */
async function runTeamVote(players, opts, ctx, reject) {
  if (opts.speech === 'turns') {
    await runSpeakingTurns(players, opts, ctx, { firstWait: Math.min(opts.timeout, 6000), required: ctx.speakerTurns === 0 })
  }
  const label = reject ? '反对' : '同意'
  await Promise.all(
    players.map((p) =>
      step(p, `表决：${label}`, async () => {
        await p.page.locator(`button[data-test="${reject ? 'vote-reject' : 'vote-approve'}"]`).click()
        await waitDoneOrPhaseLeft(p.page, '[data-test="vote-done"]', 'TEAM_VOTE', opts.timeout)
      }),
    ),
  )
}

/** 否决之后：应进入下一次组队，且座位环上出现 data-approve="false" 的亮票角标 */
async function verifyRejected(players, opts, ctx) {
  const observer = players[0]
  const expectedRound = ctx.rejectStreak + 1
  await step(observer, `校验否决结果：进入第 ${expectedRound} 次组队并出现反对亮票角标`, async () => {
    const badges = observer.page.locator('[data-test="vote-badge"][data-approve="false"]')
    await badges.first().waitFor()
    const count = await badges.count()
    const approves = await observer.page.locator('[data-test="vote-badge"][data-approve="true"]').count()
    const info = await readTableAny(players)
    if (info.voteRound === undefined) warn('页面上读不到「第 N 次组队」文案，跳过组队次数校验')
    else if (info.voteRound !== expectedRound) throw new Error(`应为第 ${expectedRound} 次组队，页面显示第 ${info.voteRound} 次`)
    log(`反对亮票角标 ${count} 个、同意 ${approves} 个（共 ${players.length} 人），当前第 ${info.voteRound ?? '?'} 次组队`)
  })
  if (ctx.rejectStreak === 1) await shot(observer, 'vote-rejected-badges')
}

/** 任务出票：队员出成功票；邪恶方在 --evil-fails 指定的第几次任务出失败票；随后等待揭晓消失并校验结果 */
async function runQuest(players, team, opts, ctx) {
  const questNo = ctx.questNo + 1 // 1 起算
  const wantFail = opts.evilFails.includes(questNo)
  await Promise.all(
    team.map((p) => {
      const failVote = p.side === 'EVIL' && wantFail
      return step(p, `第 ${questNo} 次任务出票：${failVote ? '失败' : '成功'}`, async () => {
        await p.page.locator(`button[data-test="${failVote ? 'quest-fail' : 'quest-success'}"]`).click()
        await waitDoneOrPhaseLeft(p.page, '[data-test="quest-done"]', 'QUEST', opts.timeout)
      })
    }),
  )

  // 揭晓覆盖层：每个客户端各自展示；出现即截图（仅 P1），随后等它消失，不消失就点一下再等
  let failedFlag
  await Promise.all(
    players.map(async (p, i) => {
      const reveal = p.page.locator('[data-test="quest-reveal"]')
      const appeared = await reveal.waitFor({ state: 'visible', timeout: Math.min(opts.timeout, 8000) }).then(() => true).catch(() => false)
      if (!appeared) {
        if (i === 0) warn(`${p.name} 未观察到 quest-reveal 覆盖层（可能已快速消失）`)
        return
      }
      if (i === 0) {
        failedFlag = await reveal.getAttribute('data-failed')
        // 揭晓卡牌是延迟翻开的分段动画（覆盖层约 3 秒后自动消失），稍等再截才能拍到翻开的票面
        await sleep(1200)
        await shot(p, `quest-${questNo}-reveal${failedFlag === 'true' || failedFlag === '' ? '-failed' : ''}`)
      }
      const hidden = await reveal.waitFor({ state: 'hidden', timeout: opts.timeout }).then(() => true).catch(() => false)
      if (!hidden) {
        warn(`${p.name} 的 quest-reveal 未自动消失，尝试点击关闭`)
        await reveal.click({ timeout: 2000 }).catch(() => {})
        await reveal.waitFor({ state: 'hidden', timeout: opts.timeout }).catch(() => warn(`${p.name} 的 quest-reveal 仍未消失`))
      }
    }),
  )
  ctx.questNo += 1
  const result = failedFlag === null || failedFlag === undefined ? '?' : failedFlag === 'false' ? '成功' : '失败'
  ctx.questResults.push(result)
  log(`第 ${questNo} 次任务揭晓：${result}`)
  if (wantFail && result !== '失败') {
    await fail(players[0], `校验第 ${questNo} 次任务失败`, `--evil-fails 指定第 ${questNo} 次任务应失败，揭晓 data-failed=${failedFlag}`)
  }
}

/** 刺杀：刺客点梅林座位 → 确认 → 二次确认 */
async function runAssassin(players) {
  const assassin = players.find((p) => p.role === 'ASSASSIN')
  const merlin = players.find((p) => p.role === 'MERLIN')
  if (!assassin || !merlin) {
    await fail(players[0], '刺杀', `找不到刺客或梅林（刺客=${assassin?.name}，梅林=${merlin?.name}）`)
  }
  await step(assassin, `刺杀：指认 ${merlin.seat} 号（${merlin.name}，梅林）`, async () => {
    await assassin.page.locator(`button[data-test="seat"][data-seat="${merlin.seat}"]`).click()
    await assassin.page.locator('button[data-test="assassin-confirm"]').click()
    await assassin.page.locator('button[data-test="dialog-confirm"]').click()
  })
}

/** 结算：全员到 /result，读标题；--reject-all 时校验为邪恶方胜利 */
async function runResult(players, opts, ctx) {
  await Promise.all(players.map((p) => step(p, '等待跳转 /result', () => p.page.waitForURL(/\/result(\?|$)/))))
  const title = await step(players[0], '读取结算标题', async () => {
    const el = players[0].page.locator('[data-test="result-title"]')
    await el.waitFor()
    return (await el.innerText()).trim()
  })
  log(`结算结果：${title}（任务：${ctx.questResults.join(' / ') || '无'}，连续否决 ${ctx.rejectStreak} 次）`)
  await shot(players[0], 'result')
  if (opts.rejectAll) {
    if (ctx.rejectStreak !== 5) await fail(players[0], '校验五次流局', `应连续否决 5 次后结束，实际 ${ctx.rejectStreak} 次`)
    if (!title.includes('邪恶方胜利')) await fail(players[0], '校验流局结果', `五次流局后标题应为「邪恶方胜利」，读到「${title}」`)
    log('校验通过：连续 5 次否决直接到 /result，标题为邪恶方胜利')
  }
  return title
}

/** --records：结算后每名玩家在同一上下文新开标签打开 /records，校验统计卡与至少一条战绩（不打断结算页） */
async function runRecordsCheck(players, opts) {
  log('==== 我的战绩 ====')
  for (const p of players) {
    const page = await p.page.context().newPage()
    try {
      await step(p, '新标签打开 /records', () => page.goto(`${opts.base}/records`, { waitUntil: 'domcontentloaded' }))
      await step(p, '等待战绩列表出现', () => page.locator('[data-test="record-item"]').first().waitFor({ timeout: opts.timeout }))
      const count = await page.locator('[data-test="record-item"]').count()
      const statsVisible = await page.locator('[data-test="records-stats"]').isVisible().catch(() => false)
      if (count < 1 || !statsVisible) await fail(p, '校验战绩页', `记录 ${count} 条，统计卡${statsVisible ? '可见' : '不可见'}`)
      if (p === players[0]) {
        await page.locator('[data-test="record-item"]').first().click()
        await page.waitForTimeout(800)
        const path = join(SHOTS_DIR, `records-${p.name}.png`)
        await page.screenshot({ path, fullPage: true })
        log(`${p.name} 截图 -> shots/records-${p.name}.png`)
      }
    } finally {
      await page.close().catch(() => {})
    }
  }
  log(`校验通过：${players.length} 名玩家的战绩页均有统计卡与记录`)
}

/** 对局完整流程：夜晚 → 循环（组队 / 表决 / 任务）→ 刺杀 → 结算 */
async function runGame(players, opts) {
  const modes = []
  if (opts.evilFails.length) modes.push(`第 ${opts.evilFails.join(',')} 次任务出失败票`)
  if (opts.rejectFirst) modes.push('首次组队全员反对')
  if (opts.rejectAll) modes.push('每次组队全员反对')
  if (opts.speech === 'turns') modes.push('轮流发言')
  log(`==== 对局流程（${modes.join('；') || '常规'}） ====`)
  await runNight(players, opts)

  const ctx = { questNo: 0, questResults: [], voteCount: 0, lastVoteRejected: false, rejectStreak: 0, speakerTurns: 0 }
  const observer = players[0]
  let phase = 'NIGHT'
  let team = []
  let voteShotTaken = false
  const phaseTimeout = Math.max(opts.timeout, 20_000)

  for (let guard = 0; guard < 80; guard += 1) {
    const prev = phase
    let next
    try {
      next = await waitPhaseChange(observer, prev, phaseTimeout)
    } catch (err) {
      await diagnose(observer, `等待阶段离开 ${prev}`, err)
      throw new StepError(observer, `等待阶段离开 ${prev}`, err)
    }
    if (prev === 'TEAM_VOTE') {
      if (!voteShotTaken) {
        // 表决刚结束：截一张揭晓（契约未定义表决揭晓元素，这里截整页）
        await shot(observer, 'vote-reveal')
        voteShotTaken = true
      }
      if (ctx.lastVoteRejected && next === 'TEAM_PICK') await verifyRejected(players, opts, ctx)
    }
    phase = next
    log(`阶段 -> ${phase}`)

    switch (phase) {
      case 'TEAM_PICK':
        team = await runTeamPick(players, opts, ctx)
        break
      case 'TEAM_VOTE': {
        const reject = opts.rejectAll || (opts.rejectFirst && ctx.voteCount === 0)
        await runTeamVote(players, opts, ctx, reject)
        ctx.voteCount += 1
        ctx.lastVoteRejected = reject
        ctx.rejectStreak = reject ? ctx.rejectStreak + 1 : 0
        break
      }
      case 'QUEST':
        await runQuest(players, team, opts, ctx)
        break
      case 'ASSASSIN':
        await runAssassin(players)
        return runResult(players, opts, ctx)
      case 'GAME_OVER':
      case 'RESULT':
        return runResult(players, opts, ctx)
      case 'NIGHT':
        // 理论上不会回到夜晚；防御性等待
        break
      default:
        warn(`未知阶段 ${phase}，继续等待`)
    }
  }
  throw new StepError(observer, '对局循环', new Error('阶段循环超过 80 次仍未结束'))
}

/** 再来一局：房主点 play-again → 全员 10 秒内回大厅 → 其他人再准备 → 房主再开局 → 第二局夜晚读身份牌 */
async function runPlayAgain(players, code, opts) {
  const [owner, ...others] = players
  log('==== 再来一局 ====')
  await step(owner, '结算页点击「再来一局」', () => owner.page.locator('[data-test="play-again"]').click())
  await Promise.all(
    players.map((p) =>
      step(p, `10 秒内回到大厅 /r/${code} 且完成同步`, async () => {
        await p.page.waitForURL(new RegExp(`/r/${code}(\\?|$)`), { timeout: 10_000 })
        await waitLobbySynced(p.page, 10_000)
        const sub = (await p.page.locator('.room__center-sub').innerText()).trim()
        if (sub === '正在连接…' || sub === '') throw new Error(`大厅中心文案仍为「${sub}」`)
      }),
    ),
  )
  await shot(owner, 'again-lobby')
  await Promise.all(others.map((p) => ensureReady(p, '第二局：点击「准备」')))
  await startGame(owner, 'again-lobby-all-ready')
  await waitEnterGame(players, 'again-game-entered')
  const firstRoles = players.map((p) => `${p.name}=${p.seat}号 ${p.role}`).join('；')
  await runNight(players, opts, 'game2')
  log(`第一局身份：${firstRoles}`)
  log('校验通过：第二局进入 NIGHT 且每人再次读到 role-card')
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`参数错误：${err.message}`)
    printHelp()
    process.exit(2)
  }
  if (!existsSync(SHOTS_DIR)) mkdirSync(SHOTS_DIR, { recursive: true })

  log(`参数：${JSON.stringify(opts)}`)
  try {
    await waitForServer(opts.base, 60_000)
  } catch (err) {
    console.error(`[${ts()}] ${err.message}`)
    process.exit(2)
  }

  let browser
  const started = Date.now()
  let exitCode = 0
  try {
    browser = await launchBrowser(opts)
    const players = []
    for (let i = 0; i < opts.players; i += 1) players.push(await createPlayer(browser, i, opts))
    log(`已创建 ${players.length} 个独立浏览器上下文（390×844 手机视口）`)

    const code = await runLobby(players, opts)
    log(`大厅流程完成：房间 ${code}，全员已进入 /game，用时 ${((Date.now() - started) / 1000).toFixed(1)} s`)

    if (opts.lobbyOnly) {
      log('--lobby-only：跳过对局流程')
    } else {
      const title = await runGame(players, opts)
      log(`对局流程完成：${title}，用时 ${((Date.now() - started) / 1000).toFixed(1)} s`)
      if (opts.records) await runRecordsCheck(players, opts)
      if (opts.again) await runPlayAgain(players, code, opts)
    }
    log(`全部完成，总用时 ${((Date.now() - started) / 1000).toFixed(1)} s`)
  } catch (err) {
    exitCode = 1
    if (err instanceof StepError) console.error(`\n[${ts()}] 脚本终止：${err.message}`)
    else console.error(`\n[${ts()}] 脚本异常：${err?.stack ?? err}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
  process.exit(exitCode)
}

process.on('SIGINT', () => {
  console.error('\n收到中断信号，退出')
  process.exit(130)
})

main()
