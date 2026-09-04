// 战绩：对局结束时落一条 MatchRecord，按 uid 建索引供「我的战绩」查询；作废局不计
import { randomBytes } from 'node:crypto'
import { sideOf } from '@awalong/shared'
import type { MatchListItem, MatchPlayer, MatchRecord, MatchStats, MatchSummary, MyMatchesResponse } from '@awalong/shared'
import { MemoryList, type Persistence } from '../store/jsonl'

function newMatchId(endedAt: number): string {
  return `m_${endedAt.toString(36)}_${randomBytes(3).toString('hex')}`
}

function emptyStats(): MatchStats {
  return {
    games: 0,
    wins: 0,
    goodGames: 0,
    goodWins: 0,
    evilGames: 0,
    evilWins: 0,
    asMerlin: 0,
    merlinSurvived: 0,
    asAssassin: 0,
    assassinHits: 0,
  }
}

export class MatchStore {
  private byId = new Map<string, MatchRecord>()
  /** uid → 该玩家参与的记录（按结束时间升序追加） */
  private byUid = new Map<string, MatchRecord[]>()

  constructor(private readonly persistence: Persistence<MatchRecord> = new MemoryList()) {
    for (const record of persistence.load()) this.index(record)
  }

  /** 结算入库；作废局或无胜方的记录返回 null */
  save(summary: MatchSummary, players: MatchPlayer[]): MatchRecord | null {
    if (summary.winReason === 'ABORTED' || !summary.winner) return null
    const record: MatchRecord = {
      ...summary,
      history: structuredClone(summary.history),
      roles: { ...summary.roles },
      id: newMatchId(summary.endedAt),
      players: players.map((p) => ({ seat: p.seat, uid: p.uid, nickname: p.nickname, avatar: p.avatar })),
    }
    this.persistence.append(record)
    this.index(record)
    return record
  }

  get(id: string): MatchRecord | undefined {
    return this.byId.get(id)
  }

  /** 某玩家的战绩：统计 + 倒序分页列表 */
  listFor(uid: string, limit = 30, offset = 0): MyMatchesResponse {
    const records = this.byUid.get(uid) ?? []
    const stats = emptyStats()
    const items: MatchListItem[] = []
    for (const record of records) {
      const item = this.itemFor(record, uid)
      if (!item) continue
      items.push(item)
      stats.games += 1
      if (item.won) stats.wins += 1
      if (item.mySide === 'GOOD') {
        stats.goodGames += 1
        if (item.won) stats.goodWins += 1
      } else {
        stats.evilGames += 1
        if (item.won) stats.evilWins += 1
      }
      if (item.myRole === 'MERLIN') {
        stats.asMerlin += 1
        if (record.winner === 'GOOD') stats.merlinSurvived += 1
      }
      if (item.myRole === 'ASSASSIN') {
        stats.asAssassin += 1
        if (record.winReason === 'ASSASSIN_HIT') stats.assassinHits += 1
      }
    }
    items.sort((a, b) => b.endedAt - a.endedAt)
    return { total: items.length, stats, items: items.slice(offset, offset + limit) }
  }

  private itemFor(record: MatchRecord, uid: string): MatchListItem | null {
    const me = record.players.find((p) => p.uid === uid)
    if (!me) return null
    const role = record.roles[me.seat]
    if (!role) return null
    const side = sideOf(role)
    return {
      id: record.id,
      roomCode: record.roomCode,
      playerCount: record.playerCount,
      winner: record.winner,
      winReason: record.winReason,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      mySeat: me.seat,
      myRole: role,
      mySide: side,
      won: record.winner === side,
    }
  }

  private index(record: MatchRecord): void {
    if (this.byId.has(record.id)) return
    this.byId.set(record.id, record)
    for (const p of record.players) {
      const list = this.byUid.get(p.uid)
      if (list) list.push(record)
      else this.byUid.set(p.uid, [record])
    }
  }
}
