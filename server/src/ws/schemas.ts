import { z } from 'zod'

const roleId = z.enum(['MERLIN', 'PERCIVAL', 'LOYAL', 'MORGANA', 'ASSASSIN', 'MORDRED', 'OBERON', 'MINION'])

export const settingsPatchSchema = z
  .object({
    playerCount: z.number().int().min(5).max(10),
    roles: z.array(roleId).max(10),
    allowMarks: z.boolean(),
    speechMode: z.enum(['free', 'turns']),
    turnSeconds: z.number().int().min(10).max(120),
    ladyOfLake: z.boolean(),
    pickSeconds: z.number().int().min(15).max(300),
    voteSeconds: z.number().int().min(10).max(120),
    questSeconds: z.number().int().min(10).max(120),
    assassinSeconds: z.number().int().min(15).max(300),
  })
  .partial()

const seat = z.number().int().min(1).max(10)

export const clientMsgSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heartbeat'), t: z.number() }),
  z.object({ type: z.literal('sync.request'), version: z.number().int() }),
  z.object({ type: z.literal('room.join'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ type: z.literal('room.leave') }),
  z.object({ type: z.literal('room.ready'), ready: z.boolean() }),
  z.object({ type: z.literal('room.sit'), seat }),
  z.object({ type: z.literal('room.settings'), settings: settingsPatchSchema }),
  z.object({ type: z.literal('room.kick'), seat }),
  z.object({ type: z.literal('room.transfer'), uid: z.string().min(1) }),
  z.object({ type: z.literal('game.start') }),
  z.object({ type: z.literal('night.confirm') }),
  z.object({ type: z.literal('team.pick'), seats: z.array(seat).min(1).max(10) }),
  z.object({ type: z.literal('team.vote'), approve: z.boolean() }),
  z.object({ type: z.literal('quest.vote'), success: z.boolean() }),
  z.object({ type: z.literal('assassin.kill'), targetSeat: seat }),
  z.object({ type: z.literal('speaker.done') }),
  z.object({ type: z.literal('game.decide'), action: z.enum(['ABORT', 'CONTINUE']) }),
  z.object({ type: z.literal('game.again') }),
  z.object({ type: z.literal('phrase.send'), phraseId: z.string().min(1).max(20) }),
])

export const anonAuthSchema = z.object({
  nickname: z.string().trim().min(1).max(8),
  avatar: z.string().min(1).max(32),
})

export const createRoomSchema = z.object({
  playerCount: z.number().int().min(5).max(10).optional(),
})
