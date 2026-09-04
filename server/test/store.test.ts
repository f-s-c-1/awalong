import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { MatchSummary } from '@awalong/shared'
import { UserStore } from '../src/auth'
import { MatchStore } from '../src/match/match.store'
import { JsonlFile, openPersistence } from '../src/store/jsonl'

const dirs: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'awalong-store-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const players = [
  { seat: 1, uid: 'u1', nickname: 'A', avatar: 'sword' },
  { seat: 2, uid: 'u2', nickname: 'B', avatar: 'sword' },
  { seat: 3, uid: 'u3', nickname: 'C', avatar: 'sword' },
  { seat: 4, uid: 'u4', nickname: 'D', avatar: 'sword' },
  { seat: 5, uid: 'u5', nickname: 'E', avatar: 'sword' },
]

function summary(patch: Partial<MatchSummary> = {}): MatchSummary {
  return {
    roomCode: '123456',
    playerCount: 5,
    winner: 'EVIL',
    winReason: 'ASSASSIN_HIT',
    roles: { 1: 'MERLIN', 2: 'PERCIVAL', 3: 'LOYAL', 4: 'MORGANA', 5: 'ASSASSIN' },
    history: [{ questIndex: 0, voteRound: 1, leaderSeat: 1, team: [1, 2], teamVotes: { 1: true, 2: true, 3: true, 4: false, 5: false }, approved: true, failCount: 0, result: 'S' }],
    assassinTarget: 1,
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_600_000,
    ...patch,
  }
}

describe('JSON Lines 持久化', () => {
  it('战绩落盘后重新加载可查，作废局不入库，损坏行被跳过', () => {
    const dir = tempDir()
    const first = new MatchStore(openPersistence(dir, 'matches.ndjson'))
    const saved = first.save(summary(), players)
    expect(saved?.id).toMatch(/^m_/)
    expect(first.save(summary({ winner: null, winReason: 'ABORTED' }), players)).toBeNull()
    first.save(summary({ winner: 'GOOD', winReason: 'ASSASSIN_MISS', assassinTarget: 3, endedAt: 1_700_000_900_000 }), players)

    // 追加一行损坏数据模拟掉电
    const file = join(dir, 'matches.ndjson')
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"broken": tru`)

    const reloaded = new MatchStore(openPersistence(dir, 'matches.ndjson'))
    const merlin = reloaded.listFor('u1')
    expect(merlin.total).toBe(2)
    expect(merlin.items[0]!.endedAt).toBe(1_700_000_900_000)
    expect(merlin.items[0]!.won).toBe(true)
    expect(merlin.items[1]!.won).toBe(false)
    expect(merlin.stats).toMatchObject({ games: 2, wins: 1, goodGames: 2, goodWins: 1, asMerlin: 2, merlinSurvived: 1 })

    const assassin = reloaded.listFor('u5')
    expect(assassin.stats).toMatchObject({ games: 2, wins: 1, evilGames: 2, evilWins: 1, asAssassin: 2, assassinHits: 1 })
    expect(reloaded.listFor('u5', 1, 1).items).toHaveLength(1)
    expect(reloaded.listFor('nobody').total).toBe(0)
    expect(reloaded.get(saved!.id)?.players).toHaveLength(5)
  })

  it('用户档案落盘：重启后 uid 仍可用，资料以最后一次更新为准', () => {
    const dir = tempDir()
    const store = new UserStore(openPersistence(dir, 'users.ndjson'))
    const user = store.create('老K', 'sword')
    store.update(user.uid, { nickname: '新老K' })

    const reloaded = new UserStore(openPersistence(dir, 'users.ndjson'))
    expect(reloaded.get(user.uid)).toEqual({ uid: user.uid, nickname: '新老K', avatar: 'sword' })
    expect(new JsonlFile(join(dir, 'users.ndjson')).load()).toHaveLength(2)
  })

  it('未配置数据目录时仅存内存', () => {
    const store = new MatchStore(openPersistence('', 'matches.ndjson'))
    store.save(summary(), players)
    expect(store.listFor('u1').total).toBe(1)
    expect(new MatchStore(openPersistence('', 'matches.ndjson')).listFor('u1').total).toBe(0)
  })
})
