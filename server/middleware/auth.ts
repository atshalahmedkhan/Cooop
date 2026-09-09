import type { Context, Next } from 'hono'
import { db } from '../db/client.js'
import { game_players, games } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { GameError } from '../types.js'

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Missing Authorization header', recoverable: false }, 401)
  }

  const token = authHeader.slice(7).trim()
  const player = db.select().from(game_players).where(eq(game_players.player_token, token)).get()

  if (!player) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Invalid player token', recoverable: false }, 401)
  }

  // Verify the player belongs to the game in the URL
  const gameId = c.req.param('id')
  if (gameId && player.game_id !== gameId) {
    return c.json({ code: 'UNAUTHORIZED', message: 'Player does not belong to this game', recoverable: false }, 401)
  }

  c.set('player', player)
  await next()
}

// For GET /state — no auth required but attach player if token present
export async function optionalAuth(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    const player = db.select().from(game_players).where(eq(game_players.player_token, token)).get()
    if (player) c.set('player', player)
  }
  await next()
}
