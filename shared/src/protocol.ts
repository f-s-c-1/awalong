import type { ClientGameState, MatchSummary, Phase, PlayerPublic, RoomSettings, SecretInfo } from './types'

export interface SeatInfo extends PlayerPublic {
  ready: boolean
  disconnectAt: number | null
}

export interface RoomSync {
  code: string
  ownerUid: string
  status: 'LOBBY' | 'IN_GAME' | 'CLOSED'
  settings: RoomSettings
  seats: SeatInfo[]
  spectatorCount: number
  mySeat: number | null
}

export interface VoicePolicy {
  muteAll: boolean
  /** 允许发布音频的座位；null 表示全员 */
  publishSeats: number[] | null
  /** 允许订阅音频的座位；null 表示全员 */
  subscribeSeats: number[] | null
}

/** 客户端 → 服务端 */
export type ClientMsg =
  | { type: 'heartbeat'; t: number }
  | { type: 'sync.request'; version: number }
  | { type: 'room.join'; code: string }
  | { type: 'room.leave' }
  | { type: 'room.ready'; ready: boolean }
  | { type: 'room.sit'; seat: number }
  | { type: 'room.settings'; settings: Partial<RoomSettings> }
  | { type: 'room.kick'; seat: number }
  | { type: 'room.transfer'; uid: string }
  | { type: 'game.start' }
  | { type: 'night.confirm' }
  | { type: 'team.pick'; seats: number[] }
  | { type: 'team.vote'; approve: boolean }
  | { type: 'quest.vote'; success: boolean }
  | { type: 'assassin.kill'; targetSeat: number }
  | { type: 'speaker.done' }
  | { type: 'game.decide'; action: 'ABORT' | 'CONTINUE' }
  | { type: 'game.again' }
  | { type: 'phrase.send'; phraseId: string }

/** 服务端 → 客户端 */
export type ServerMsg =
  | { type: 'heartbeat.ack'; t: number; serverTime: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'room.sync'; room: RoomSync }
  | { type: 'room.closed'; reason: string }
  | { type: 'game.sync'; state: ClientGameState }
  | { type: 'game.secret'; secret: SecretInfo }
  | { type: 'phase.change'; phase: Phase; deadline: number; serverTime: number; version: number }
  | { type: 'team.reveal'; votes: Record<number, boolean>; approved: boolean; version: number }
  | { type: 'quest.reveal'; cards: ('S' | 'F')[]; failed: boolean; version: number }
  | { type: 'voice.policy'; policy: VoicePolicy }
  | { type: 'speaker.turn'; seat: number; deadline: number }
  | { type: 'game.paused'; seat: number; nickname: string; deadline: number; ownerDecides: boolean }
  | { type: 'game.resumed' }
  | { type: 'game.over'; summary: MatchSummary; version: number }
  | { type: 'phrase.shown'; seat: number; phraseId: string }

export const PHRASES: Record<string, string> = {
  good: '我是好人',
  pick_me: '上我',
  reject: '反对这队',
  suspect: '号可疑',
}
