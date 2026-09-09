import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players, game_challenges } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'
import type { PowerUpType } from '../types.js'

export const powerupsRouter = new Hono()

// POST /api/games/:id/powerups/use
// Body: { type: PowerUpType, command_id: string }
powerupsRouter.post('/use', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const type = body.type as PowerUpType | undefined

  if (!type) return c.json({ code: 'VALIDATION_ERROR', message: 'type is required', recoverable: false }, 400)

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)

  const playerRecord = db.select().from(game_players).where(eq(game_players.id, player.id)).get()
  if (!playerRecord) return c.json({ code: 'UNAUTHORIZED', message: 'Player not found', recoverable: false }, 401)

  const powerUps = JSON.parse(playerRecord.power_ups || '{}') as Record<string, number>
  const count = powerUps[type] ?? 0
  if (count <= 0) {
    return c.json({ code: 'INSUFFICIENT_POWER_UP', message: `No ${type} power-ups remaining`, recoverable: true }, 400)
  }

  let extraPayload: Record<string, unknown> = {}

  sqlite.transaction(() => {
    // Consume the power-up
    powerUps[type] = count - 1
    db.update(game_players).set({ power_ups: JSON.stringify(powerUps) }).where(eq(game_players.id, player.id)).run()

    if (type === 'SKIP') {
      // Skip current challenge — mark as SKIPPED and go to TURN_COMPLETE
      if (game.current_player_id === player.id && game.turn_state === 'CHALLENGE_ACTIVE') {
        const challenge = db.select().from(game_challenges)
          .where(eq(game_challenges.player_id, player.id))
          .all()
          .find(ch => ch.status === 'ACTIVE' && ch.game_id === gameId)

        if (challenge) {
          db.update(game_challenges)
            .set({ status: 'SKIPPED', resolved_at: new Date().toISOString() })
            .where(eq(game_challenges.id, challenge.id))
            .run()

          db.update(games)
            .set({ turn_state: 'TURN_COMPLETE', state_version: game.state_version + 1 })
            .where(eq(games.id, gameId))
            .run()

          appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'SKIP', challenge_id: challenge.id })
          appendEvent(gameId, 'TURN_COMPLETED', player.id, { note: 'skipped' })
        }
      }
    } else if (type === 'HINT') {
      // Mark hint used on active challenge
      const challenge = db.select().from(game_challenges)
        .where(eq(game_challenges.player_id, player.id))
        .all()
        .find(ch => ch.status === 'ACTIVE' && ch.game_id === gameId)
      if (challenge) {
        db.update(game_challenges)
          .set({ hints_used: challenge.hints_used + 1 })
          .where(eq(game_challenges.id, challenge.id))
          .run()
        db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
        appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'HINT' })
        extraPayload = { hint_revealed: true }
      }
    } else if (type === 'SHIELD') {
      // SHIELD blocks next heart loss — store as a flag in power_ups
      // We'll encode it as a special key; real use consumed on next failure
      powerUps['SHIELD'] = (powerUps['SHIELD'] ?? 0) // already decremented above
      powerUps['_SHIELD_ACTIVE'] = 1
      db.update(game_players).set({ power_ups: JSON.stringify(powerUps) }).where(eq(game_players.id, player.id)).run()
      db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
      appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'SHIELD' })
    } else if (type === 'DOUBLE_DICE') {
      // Double dice: allowed next time player is in AWAITING_ROLL
      // Store as flag
      powerUps['_DOUBLE_DICE_ACTIVE'] = 1
      db.update(game_players).set({ power_ups: JSON.stringify(powerUps) }).where(eq(game_players.id, player.id)).run()
      db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
      appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'DOUBLE_DICE' })
    } else if (type === 'EXTRA_TEST') {
      // Reveal one additional test case — handled client-side / no state change needed
      db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
      appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'EXTRA_TEST' })
    } else if (type === 'DEBUGGER') {
      // Show a hint line in the debug challenge
      db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
      appendEvent(gameId, 'POWER_UP_USED', player.id, { type: 'DEBUGGER' })
    }
  })()

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json({ ...snapshot, ...extraPayload })
})
