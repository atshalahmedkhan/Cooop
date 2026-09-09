import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { checkIdempotency, storeIdempotencyResult } from '../middleware/idempotency.js'
import { pickMysteryOutcome } from '../game/engine.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'
import type { PowerUpType } from '../types.js'

export const mysteryRouter = new Hono()

// POST /api/games/:id/mystery/resolve
// Called when current player lands on a MYSTERY tile and resolves the outcome
mysteryRouter.post('/resolve', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const commandId = body.command_id as string | undefined

  if (!commandId) return c.json({ code: 'VALIDATION_ERROR', message: 'command_id is required', recoverable: false }, 400)

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.current_player_id !== player.id) return c.json({ code: 'NOT_YOUR_TURN', message: 'Not your turn', recoverable: true }, 400)
  if (game.turn_state !== 'MYSTERY_RESOLVING') return c.json({ code: 'INVALID_GAME_STATE', message: 'Not in MYSTERY_RESOLVING state', recoverable: true }, 400)

  const idempKey = { game_id: gameId, player_id: player.id, command_id: commandId, action_type: 'RESOLVE_MYSTERY' }
  c.set('idempotency_key', idempKey)
  const cached = checkIdempotency(c)
  if (cached) return c.json(cached)

  // Use cached outcome if already picked (e.g. reconnect before completing)
  let outcome: ReturnType<typeof pickMysteryOutcome>
  const existingOutcome = game.mystery_outcome
  if (existingOutcome) {
    outcome = typeof existingOutcome === 'string' ? JSON.parse(existingOutcome) : existingOutcome
  } else {
    outcome = pickMysteryOutcome()
  }

  const playerRecord = db.select().from(game_players).where(eq(game_players.id, player.id)).get()!

  sqlite.transaction(() => {
    let newXP = playerRecord.match_xp + outcome.xp_delta
    if (newXP < 0) newXP = 0

    // Apply spaces delta by updating player position if needed
    // Note: spaces_delta is advisory — the frontend/snapshot shows the effect
    // Actual node movement for spaces_delta would require board traversal; skip for now

    // Grant power-up if applicable
    let newPowerUps = JSON.parse(playerRecord.power_ups || '{}') as Record<string, number>
    if (outcome.power_up_granted) {
      const k = outcome.power_up_granted as PowerUpType
      newPowerUps[k] = (newPowerUps[k] ?? 0) + 1
    }

    db.update(game_players).set({
      match_xp: newXP,
      power_ups: JSON.stringify(newPowerUps),
    }).where(eq(game_players.id, player.id)).run()

    db.update(games).set({
      turn_state: 'TURN_COMPLETE',
      mystery_outcome: JSON.stringify(outcome),
      state_version: game.state_version + 1,
    }).where(eq(games.id, gameId)).run()

    appendEvent(gameId, 'MYSTERY_RESOLVED', player.id, { outcome })
    appendEvent(gameId, 'TURN_COMPLETED', player.id, { note: 'mystery', xp_delta: outcome.xp_delta })
  })()

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  const responseData = { ...snapshot, mystery_outcome: outcome } as unknown as Record<string, unknown>
  storeIdempotencyResult(idempKey, responseData)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(responseData)
})
