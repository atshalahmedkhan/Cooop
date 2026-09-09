import type { Context, Next } from 'hono'
import { db } from '../db/client.js'
import { idempotency_records } from '../db/schema.js'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

// Wraps a route handler with idempotency checking.
// The caller must set c.set('idempotency_key', { game_id, player_id, command_id, action_type })
// before calling next(), and then call storeIdempotencyResult(c, responseData) after the action.

export interface IdempotencyKey {
  game_id: string
  player_id: string
  command_id: string
  action_type: string
}

export function checkIdempotency(c: Context): Record<string, unknown> | null {
  const key = c.get('idempotency_key') as IdempotencyKey | undefined
  if (!key) return null

  const existing = db
    .select()
    .from(idempotency_records)
    .where(
      and(
        eq(idempotency_records.game_id, key.game_id),
        eq(idempotency_records.player_id, key.player_id),
        eq(idempotency_records.command_id, key.command_id),
      ),
    )
    .get()

  return existing ? (existing.response_payload as Record<string, unknown>) : null
}

export function storeIdempotencyResult(
  key: IdempotencyKey,
  response: Record<string, unknown>,
): void {
  db.insert(idempotency_records)
    .values({
      id: randomUUID(),
      game_id: key.game_id,
      player_id: key.player_id,
      command_id: key.command_id,
      action_type: key.action_type,
      response_payload: response,
    })
    .run()
}
