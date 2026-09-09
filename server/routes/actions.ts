import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players, boards } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { checkIdempotency, storeIdempotencyResult } from '../middleware/idempotency.js'
import { GameError } from '../types.js'
import { rollDie, nodeTypeToQuestionType, timerForType, getBaseXP, pickMysteryOutcome } from '../game/engine.js'
import { startBattle } from './battles.js'
import { getBoardGraph, computeReachablePaths } from '../game/board.js'
import { assertAction } from '../game/stateMachine.js'
import { selectQuestion } from '../game/questions.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { scheduleChallenge } from './challenges.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'

export const actionsRouter = new Hono()

// ── POST /api/games/:id/actions/roll ────────────────────────────────────────

actionsRouter.post('/roll', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const commandId = body.command_id as string | undefined

  if (!commandId) {
    return c.json({ code: 'VALIDATION_ERROR', message: 'command_id is required', recoverable: false }, 400)
  }

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.status === 'GAME_COMPLETE') return c.json({ code: 'GAME_COMPLETE', message: 'Game is over', recoverable: false }, 400)
  if (game.current_player_id !== player.id) {
    return c.json({ code: 'NOT_YOUR_TURN', message: 'It is not your turn', recoverable: true }, 400)
  }

  // Idempotency check
  const idempKey = { game_id: gameId, player_id: player.id, command_id: commandId, action_type: 'ROLL_DICE' }
  c.set('idempotency_key', idempKey)
  const cached = checkIdempotency(c)
  if (cached) return c.json(cached)

  try {
    assertAction(game.turn_state as any, 'ROLL_DICE')
  } catch (e: any) {
    return c.json({ code: e.code, message: e.message, recoverable: e.recoverable }, 400)
  }

  const diceResult = rollDie()
  const cfg = game.configuration as { board_id: string }
  const graph = getBoardGraph(cfg.board_id)
  const paths = computeReachablePaths(graph, player.current_node_id, diceResult)

  const hasFork = paths.length > 1

  let responseData: Record<string, unknown>

  sqlite.transaction(() => {
    if (hasFork) {
      db.update(games)
        .set({
          turn_state: 'AWAITING_PATH_CHOICE',
          dice_result: diceResult,
          state_version: game.state_version + 1,
        })
        .where(eq(games.id, gameId))
        .run()

      appendEvent(gameId, 'DICE_ROLLED', player.id, { result: diceResult })
      appendEvent(gameId, 'PATH_CHOICE_REQUIRED', player.id, { paths: paths.map(p => ({ path_id: p.path_id, destination: p.destination_node_id })) })
    } else {
      // Single path — move immediately
      const destination = paths[0]?.destination_node_id ?? 0
      const destNode = graph.byKey.get(destination)
      if (!destNode) throw new Error('Destination node not found')

      db.update(game_players)
        .set({ current_node_id: destNode.id })
        .where(eq(game_players.id, player.id))
        .run()

      db.update(games)
        .set({
          turn_state: 'TILE_RESOLVED',
          dice_result: diceResult,
          state_version: game.state_version + 1,
        })
        .where(eq(games.id, gameId))
        .run()

      appendEvent(gameId, 'DICE_ROLLED', player.id, { result: diceResult })
      appendEvent(gameId, 'PLAYER_MOVED', player.id, { node_key: destination, node_type: destNode.type })
    }
  })()

  // If single path and tile needs a challenge, create it
  if (!hasFork) {
    const updatedGame = db.select().from(games).where(eq(games.id, gameId)).get()!
    await maybeStartChallenge(updatedGame, player, cfg.board_id)
  }

  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  responseData = snapshot as unknown as Record<string, unknown>
  storeIdempotencyResult(idempKey, responseData)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(responseData)
})

// ── POST /api/games/:id/actions/path ────────────────────────────────────────

actionsRouter.post('/path', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const commandId = body.command_id as string | undefined
  const destinationNodeKey = body.destination_node_key as number | undefined

  if (!commandId) return c.json({ code: 'VALIDATION_ERROR', message: 'command_id is required', recoverable: false }, 400)
  if (destinationNodeKey === undefined) return c.json({ code: 'VALIDATION_ERROR', message: 'destination_node_key is required', recoverable: false }, 400)

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.current_player_id !== player.id) return c.json({ code: 'NOT_YOUR_TURN', message: 'It is not your turn', recoverable: true }, 400)

  const idempKey = { game_id: gameId, player_id: player.id, command_id: commandId, action_type: 'SELECT_PATH' }
  c.set('idempotency_key', idempKey)
  const cached = checkIdempotency(c)
  if (cached) return c.json(cached)

  try {
    assertAction(game.turn_state as any, 'SELECT_PATH')
  } catch (e: any) {
    return c.json({ code: e.code, message: e.message, recoverable: e.recoverable }, 400)
  }

  const cfg = game.configuration as { board_id: string }
  const graph = getBoardGraph(cfg.board_id)

  // Validate that this destination is actually reachable
  if (!game.dice_result) return c.json({ code: 'INVALID_GAME_STATE', message: 'No dice result found', recoverable: false }, 400)
  const validPaths = computeReachablePaths(graph, player.current_node_id, game.dice_result)
  const chosen = validPaths.find(p => p.destination_node_id === destinationNodeKey)
  if (!chosen) return c.json({ code: 'INVALID_PATH', message: 'Destination is not a valid path choice', recoverable: true }, 400)

  const destNode = graph.byKey.get(destinationNodeKey)
  if (!destNode) return c.json({ code: 'INVALID_PATH', message: 'Node not found', recoverable: false }, 400)

  sqlite.transaction(() => {
    db.update(game_players)
      .set({ current_node_id: destNode.id })
      .where(eq(game_players.id, player.id))
      .run()

    db.update(games)
      .set({ turn_state: 'TILE_RESOLVED', state_version: game.state_version + 1 })
      .where(eq(games.id, gameId))
      .run()

    appendEvent(gameId, 'PATH_SELECTED', player.id, { destination_node_key: destinationNodeKey })
    appendEvent(gameId, 'PLAYER_MOVED', player.id, { node_key: destinationNodeKey, node_type: destNode.type })
  })()

  const updatedGame = db.select().from(games).where(eq(games.id, gameId)).get()!
  await maybeStartChallenge(updatedGame, player, cfg.board_id)

  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  const responseData = snapshot as unknown as Record<string, unknown>
  storeIdempotencyResult(idempKey, responseData)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(responseData)
})

// ── Shared: create a challenge or advance to TURN_COMPLETE ─────────────────

export async function maybeStartChallenge(
  game: any,
  player: any,
  boardId: string,
): Promise<void> {
  const graph = getBoardGraph(boardId)
  const playerRecord = db.select().from(game_players).where(eq(game_players.id, player.id)).get()
  if (!playerRecord) return

  const currentNode = graph.nodes.get(playerRecord.current_node_id)
  if (!currentNode) return

  // MYSTERY tile: transition to MYSTERY_RESOLVING state
  if (currentNode.type === 'MYSTERY') {
    const outcome = pickMysteryOutcome()
    db.update(games).set({
      turn_state: 'MYSTERY_RESOLVING',
      mystery_outcome: JSON.stringify(outcome),
      state_version: game.state_version + 1,
    }).where(eq(games.id, game.id)).run()
    appendEvent(game.id, 'MYSTERY_TILE_LANDED', player.id, {})
    return
  }

  // BATTLE tile: start battle for all active players
  if (currentNode.type === 'BATTLE') {
    const activePlayers = db.select().from(game_players)
      .where(eq(game_players.game_id, game.id))
      .all()
      .filter((p: any) => p.status === 'ACTIVE')
    const battleType = activePlayers.length === 2 ? '1v1' : 'all'
    await startBattle(game, playerRecord, boardId, battleType)
    return
  }

  const qType = nodeTypeToQuestionType(currentNode.type)

  if (!qType) {
    // CORNER, BOSS, etc. — skip challenge
    db.update(games).set({ turn_state: 'TURN_COMPLETE', state_version: game.state_version + 1 }).where(eq(games.id, game.id)).run()
    appendEvent(game.id, 'TURN_COMPLETED', player.id, { note: 'no_challenge', node_type: currentNode.type })
    return
  }

  const seenIds = JSON.parse(playerRecord.seen_question_ids as string || '[]') as string[]

  let question
  try {
    question = await selectQuestion(qType, seenIds, game.current_round)
  } catch {
    db.update(games).set({ turn_state: 'TURN_COMPLETE', state_version: game.state_version + 1 }).where(eq(games.id, game.id)).run()
    appendEvent(game.id, 'TURN_COMPLETED', player.id, { note: 'no_question_available' })
    return
  }

  await scheduleChallenge(game, player, question)
}
