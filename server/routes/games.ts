import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players, boards } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { randomUUID, randomInt } from 'node:crypto'
import { getBoardGraph, getStartNodeId } from '../game/board.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { authMiddleware } from '../middleware/auth.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'

export const gamesRouter = new Hono()

// ── Join code generation ─────────────────────────────────────────────────────

const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0,O,1,I,L

function generateJoinCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += JOIN_CODE_CHARS[randomInt(JOIN_CODE_CHARS.length)]
  }
  return code
}

function uniqueJoinCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateJoinCode()
    const existing = db.select({ id: games.id })
      .from(games)
      .where(and(eq(games.join_code as any, code), eq(games.status, 'LOBBY')))
      .get()
    if (!existing) return code
  }
  throw new Error('Could not generate unique join code')
}

// ── POST /api/games ──────────────────────────────────────────────────────────

gamesRouter.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const displayName = (body.display_name as string | undefined)?.trim() || 'Player 1'
  const roundCount = (body.round_count as number | undefined) ?? 4

  const board = db.select().from(boards).where(eq(boards.active, true)).get()
  if (!board) return c.json({ code: 'VALIDATION_ERROR', message: 'No active board found' }, 500)

  const graph = getBoardGraph(board.id)
  const startNodeId = getStartNodeId(graph)

  const gameId = randomUUID()
  const playerId = randomUUID()
  const playerToken = randomUUID()
  const joinCode = uniqueJoinCode()

  const configuration = {
    mode: 'MULTI',
    round_count: roundCount,
    board_id: board.id,
    topics: [],
    difficulty_min: 'easy',
    difficulty_max: 'hard',
    question_types: ['QUIZ', 'LOGIC', 'OUTPUT'],
  }

  sqlite.transaction(() => {
    db.insert(games).values({
      id: gameId,
      join_code: joinCode,
      mode: 'MULTI',
      status: 'LOBBY',
      round_count: roundCount,
      current_round: 1,
      current_player_id: null,
      turn_state: 'WAITING',
      state_version: 0,
      configuration,
    } as any).run()

    db.insert(game_players).values({
      id: playerId,
      game_id: gameId,
      player_token: playerToken,
      display_name: displayName,
      seat_number: 1,
      current_node_id: startNodeId,
      match_xp: 0,
      hearts: 3,
      streak: 0,
      seen_question_ids: JSON.stringify([]),
      is_host: true,
      is_ready: true, // host is always ready
      status: 'ACTIVE',
    } as any).run()

    appendEvent(gameId, 'GAME_CREATED', playerId, { display_name: displayName, join_code: joinCode })
  })()

  return c.json({
    game_id: gameId,
    player_id: playerId,
    player_token: playerToken,
    join_code: joinCode,
    message: 'Game created. Share the join code with other players.',
  }, 201)
})

// ── POST /api/games/join ─────────────────────────────────────────────────────

gamesRouter.post('/join', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const joinCode = (body.join_code as string | undefined)?.trim().toUpperCase()
  const displayName = (body.display_name as string | undefined)?.trim()

  if (!joinCode || joinCode.length !== 6) {
    return c.json({ code: 'VALIDATION_ERROR', message: 'join_code must be 6 characters', recoverable: true }, 400)
  }
  if (!displayName) {
    return c.json({ code: 'VALIDATION_ERROR', message: 'display_name is required', recoverable: true }, 400)
  }

  const game = db.select().from(games).where(eq(games.join_code as any, joinCode)).get() as any
  if (!game) return c.json({ code: 'INVALID_CODE', message: 'Game not found. Check the code and try again.', recoverable: true }, 404)
  if (game.status !== 'LOBBY') return c.json({ code: 'GAME_ALREADY_STARTED', message: 'That game has already started.', recoverable: false }, 400)

  const existingPlayers = db.select().from(game_players).where(eq(game_players.game_id, game.id)).all()
  if (existingPlayers.length >= 4) {
    return c.json({ code: 'LOBBY_FULL', message: 'This game is full (max 4 players).', recoverable: false }, 400)
  }

  const nextSeat = existingPlayers.length + 1
  const playerId = randomUUID()
  const playerToken = randomUUID()

  const board = db.select().from(boards).where(eq(boards.active, true)).get()
  if (!board) return c.json({ code: 'VALIDATION_ERROR', message: 'No active board found' }, 500)
  const graph = getBoardGraph(board.id)
  const startNodeId = getStartNodeId(graph)

  db.insert(game_players).values({
    id: playerId,
    game_id: game.id,
    player_token: playerToken,
    display_name: displayName,
    seat_number: nextSeat,
    current_node_id: startNodeId,
    match_xp: 0,
    hearts: 3,
    streak: 0,
    seen_question_ids: JSON.stringify([]),
    is_host: false,
    is_ready: false,
    status: 'ACTIVE',
  } as any).run()

  appendEvent(game.id, 'PLAYER_JOINED', playerId, { display_name: displayName, seat: nextSeat })

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(game.id, cfg.board_id)
  broadcastAll(game.id, makeEnvelope('GAME_STATE_UPDATED', game.id, snapshot.last_event_sequence, snapshot as any))

  return c.json({
    game_id: game.id,
    player_id: playerId,
    player_token: playerToken,
    join_code: joinCode,
    snapshot,
    message: 'Joined successfully.',
  }, 200)
})

// ── POST /api/games/:id/ready ────────────────────────────────────────────────

gamesRouter.post('/:id/ready', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any

  const game = db.select().from(games).where(eq(games.id, gameId)).get() as any
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.status !== 'LOBBY') return c.json({ code: 'INVALID_GAME_STATE', message: 'Game is not in lobby', recoverable: false }, 400)

  if (player.is_host) {
    // Host is always ready; ignore toggle
    const cfg = game.configuration as { board_id: string }
    const snapshot = await buildSnapshot(gameId, cfg.board_id)
    return c.json(snapshot)
  }

  const body = await c.req.json().catch(() => ({}))
  const ready = body.ready as boolean | undefined

  const newReady = ready !== undefined ? ready : !player.is_ready

  db.update(game_players)
    .set({ is_ready: newReady } as any)
    .where(eq(game_players.id, player.id))
    .run()

  appendEvent(gameId, newReady ? 'PLAYER_READY' : 'PLAYER_UNREADY', player.id, {})

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(snapshot)
})

// ── POST /api/games/:id/start ────────────────────────────────────────────────

gamesRouter.post('/:id/start', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any

  const game = db.select().from(games).where(eq(games.id, gameId)).get() as any
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.status !== 'LOBBY') {
    return c.json({ code: 'INVALID_GAME_STATE', message: `Game is already ${game.status}`, recoverable: false }, 400)
  }
  if (!player.is_host) {
    return c.json({ code: 'NOT_HOST', message: 'Only the host can start the game', recoverable: false }, 403)
  }

  const allPlayers = db.select().from(game_players)
    .where(and(eq(game_players.game_id, gameId), eq(game_players.status, 'ACTIVE')))
    .all()

  const nonHostNotReady = allPlayers.filter((p: any) => !p.is_host && !p.is_ready)
  if (nonHostNotReady.length > 0) {
    return c.json({ code: 'PLAYERS_NOT_READY', message: 'All players must be ready before starting', recoverable: true }, 400)
  }

  const sortedPlayers = [...allPlayers].sort((a, b) => a.seat_number - b.seat_number)
  const firstPlayer = sortedPlayers[0]
  const cfg = game.configuration as { board_id: string }

  sqlite.transaction(() => {
    db.update(games)
      .set({
        status: 'ACTIVE',
        current_player_id: firstPlayer.id,
        turn_state: 'AWAITING_ROLL',
        state_version: game.state_version + 1,
        started_at: new Date().toISOString(),
      } as any)
      .where(eq(games.id, gameId))
      .run()

    appendEvent(gameId, 'GAME_STARTED', player.id, { player_count: allPlayers.length })
    appendEvent(gameId, 'ROUND_STARTED', player.id, { round: 1 })
    appendEvent(gameId, 'TURN_STARTED', firstPlayer.id, { player_id: firstPlayer.id })
  })()

  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(snapshot)
})

// ── GET /api/games/:id/state ─────────────────────────────────────────────────

gamesRouter.get('/:id/state', async (c) => {
  const gameId = c.req.param('id')
  const game = db.select().from(games).where(eq(games.id, gameId)).get() as any
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  return c.json(snapshot)
})

// ── GET /api/games/:id/results ───────────────────────────────────────────────

gamesRouter.get('/:id/results', async (c) => {
  const gameId = c.req.param('id')
  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.status !== 'GAME_COMPLETE') {
    return c.json({ code: 'INVALID_GAME_STATE', message: 'Game is not complete yet', recoverable: false }, 400)
  }

  const players = db.select().from(game_players).where(eq(game_players.game_id, gameId)).all()
  const sorted = [...players].sort((a, b) => b.match_xp - a.match_xp)

  return c.json({
    game_id: gameId,
    completed_at: game.completed_at,
    players: sorted.map((p, i) => ({
      id: p.id,
      display_name: p.display_name,
      seat_number: p.seat_number,
      match_xp: p.match_xp,
      streak: p.streak,
      rank: i + 1,
    })),
  })
})
