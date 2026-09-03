import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'
import type { VoicePolicy } from '@awalong/shared'
import { config } from '../config'

export interface VoiceParticipant {
  uid: string
  seat: number
  nickname: string
}

/**
 * LiveKit 语音房封装。未配置时所有方法为空操作，游戏流程不受影响。
 * 令牌 identity 使用 uid，服务端按座位下发权限，客户端无法自行提权。
 */
export class VoiceService {
  readonly enabled: boolean
  /** 信令地址是否跟随请求域名（LIVEKIT_FOLLOW_HOST=1） */
  readonly followHost: boolean
  private client: RoomServiceClient | null = null

  constructor(private readonly cfg = config.livekit) {
    this.enabled = Boolean(cfg.url && cfg.apiKey && cfg.apiSecret)
    this.followHost = cfg.followHost
    if (this.enabled) this.client = new RoomServiceClient(cfg.apiUrl || httpUrl(cfg.url), cfg.apiKey, cfg.apiSecret)
  }

  /** publicUrl：按请求域名生成的 wss 地址（同一反代下多域名共用），缺省用配置 */
  async token(roomCode: string, participant: VoiceParticipant, publicUrl?: string): Promise<{ url: string; token: string }> {
    if (!this.enabled) throw new Error('VOICE_NOT_CONFIGURED')
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, {
      identity: participant.uid,
      name: participant.nickname,
      metadata: JSON.stringify({ seat: participant.seat }),
      ttl: '2h',
    })
    at.addGrant({ roomJoin: true, room: roomCode, canPublish: true, canSubscribe: true, canPublishData: false })
    return { url: publicUrl ?? this.cfg.url, token: await at.toJwt() }
  }

  /** 按阶段策略调整每个参与者的发布/订阅权限与静音 */
  async applyPolicy(roomCode: string, policy: VoicePolicy, players: VoiceParticipant[]): Promise<void> {
    if (!this.client) return
    try {
      const participants = await this.client.listParticipants(roomCode)
      for (const p of participants) {
        const player = players.find((x) => x.uid === p.identity)
        const seat = player?.seat ?? -1
        const canPublish = !policy.muteAll && (policy.publishSeats === null || policy.publishSeats.includes(seat))
        const canSubscribe = policy.subscribeSeats === null || policy.subscribeSeats.includes(seat)
        await this.client.updateParticipant(roomCode, p.identity, undefined, {
          canPublish,
          canSubscribe,
          canPublishData: false,
        })
        if (policy.muteAll) {
          for (const track of p.tracks) {
            if (track.type === 1 /* AUDIO */ && !track.muted) {
              await this.client.mutePublishedTrack(roomCode, p.identity, track.sid, true)
            }
          }
        }
      }
    } catch (err) {
      console.error('[voice] applyPolicy 失败', roomCode, err)
    }
  }

  async closeRoom(roomCode: string): Promise<void> {
    if (!this.client) return
    try {
      await this.client.deleteRoom(roomCode)
    } catch {
      /* 房间可能尚未创建 */
    }
  }
}

function httpUrl(wsUrl: string): string {
  return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
}
