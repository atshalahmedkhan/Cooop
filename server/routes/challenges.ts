import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players, game_challenges, submissions } from '../db/schema.js'
import { eq, and, asc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { checkIdempotency, storeIdempotencyResult } from '../middleware/idempotency.js'
import { GameError } from '../types.js'
import { evaluateAnswer, calcXP, timerForType, isCodeChallenge } from '../game/engine.js'
import { getBoardGraph } from '../game/board.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { randomUUID } from 'node:crypto'
import type { SelectedQuestion } from '../game/questions.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'
import { enqueueExecution } from '../execution/queue.js'
import type { TestCase } from '../execution/queue.js'

export const challengesRouter = new Hono()

// ── Shared helper: create a challenge record ─────────────────────────────────

export async function scheduleChallenge(
  game: any,
  player: any,
  question: SelectedQuestion,
): Promise<void> {
  const timer = timerForType(question.type)
  const expiresAt = new Date(Date.now() + timer * 1000).toISOString()
  const challengeId = randomUUID()

  sqlite.transaction(() => {
    db.insert(game_challenges).values({
      id: challengeId,
      game_id: game.id,
      player_id: player.id,
      question_version_id: question.questionVersionId,
      challenge_type: question.type,
      difficulty: question.difficulty,
      status: 'ACTIVE',
      expires_at: expiresAt,
      incorrect_submit_count: 0,
      hints_used: 0,
      base_xp: question.baseXP,
      awarded_xp: 0,
    }).run()

    db.update(games)
      .set({ turn_state: 'CHALLENGE_ACTIVE', state_version: game.state_version + 1 })
      .where(eq(games.id, game.id))
      .run()

    appendEvent(game.id, 'CHALLENGE_STARTED', player.id, {
      challenge_id: challengeId,
      type: question.type,
      difficulty: question.difficulty,
    })
  })()
}

// ── POST /api/games/:id/challenges/:cid/submit ───────────────────────────────

challengesRouter.post('/:cid/submit', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const challengeId = c.req.param('cid')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const commandId = body.command_id as string | undefined
  const answer = body.answer as Record<string, unknown> | undefined

  if (!commandId) return c.json({ code: 'VALIDATION_ERROR', message: 'command_id is required', recoverable: false }, 400)
  if (!answer) return c.json({ code: 'VALIDATION_ERROR', message: 'answer is required', recoverable: false }, 400)

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.status === 'GAME_COMPLETE') return c.json({ code: 'GAME_COMPLETE', message: 'Game is over', recoverable: false }, 400)
  if (game.current_player_id !== player.id) return c.json({ code: 'NOT_YOUR_TURN', message: 'Not your turn', recoverable: true }, 400)

  // Idempotency
  const idempKey = { game_id: gameId, player_id: player.id, command_id: commandId, action_type: 'SUBMIT_ANSWER' }
  c.set('idempotency_key', idempKey)
  const cached = checkIdempotency(c)
  if (cached) return c.json(cached)

  const challenge = db.select().from(game_challenges).where(eq(game_challenges.id, challengeId)).get()
  if (!challenge) return c.json({ code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found', recoverable: false }, 404)
  if (challenge.game_id !== gameId) return c.json({ code: 'UNAUTHORIZED', message: 'Challenge does not belong to this game', recoverable: false }, 401)
  if (challenge.player_id !== player.id) return c.json({ code: 'UNAUTHORIZED', message: 'Challenge does not belong to you', recoverable: false }, 401)
  if (challenge.status !== 'ACTIVE') return c.json({ code: 'CHALLENGE_ALREADY_COMPLETE', message: 'Challenge is already resolved', recoverable: false }, 400)

  // Check expiry
  const expired = new Date() > new Date(challenge.expires_at)
  if (expired) {
    // Resolve as expired
    resolveChallenge(game, player, challenge, false, true)
    const cfg = game.configuration as { board_id: string }
    const snapshot = await buildSnapshot(gameId, cfg.board_id)
    const responseData = { ...snapshot, correct: false, expired: true } as unknown as Record<string, unknown>
    storeIdempotencyResult(idempKey, responseData)
    return c.json(responseData)
  }

  // Load answer data from question version
  const { question_versions } = await import('../db/schema.js')
  const qv = db.select().from(question_versions).where(eq(question_versions.id, challenge.question_version_id)).get()
  if (!qv) return c.json({ code: 'CHALLENGE_NOT_FOUND', message: 'Question not found', recoverable: false }, 404)

  const answerData = qv.answer_data as Record<string, unknown>
  const challengeType = challenge.challenge_type as string

  let isCorrect = false
  let codeRunResults: ReturnType<typeof Array.prototype.map> | undefined

  if (isCodeChallenge(challengeType as any)) {
    // CODE/DEBUG: evaluate via Python sandbox
    const code = answer.code as string | undefined
    if (!code) {
      return c.json({ code: 'VALIDATION_ERROR', message: 'code field required for CODE/DEBUG challenges', recoverable: false }, 400)
    }
    const publicTests = (answerData.public_tests ?? []) as Array<{ input: string; expected_output: string; hint?: string }>
    const hiddenTests = (answerData.hidden_tests ?? []) as Array<{ input: string; expected_output: string }>
    const tests: TestCase[] = [
      ...publicTests.map(t => ({ input: t.input, expected_output: t.expected_output, is_hidden: false, hint: t.hint })),
      ...hiddenTests.map(t => ({ input: t.input, expected_output: t.expected_output, is_hidden: true })),
    ]
    const result = await enqueueExecution(code, tests, 'submit')
    isCorrect = !result.timedOut && result.results.length > 0 && result.results.every(r => r.passed)
    codeRunResults = result.results
  } else {
    isCorrect = evaluateAnswer(answerData, answer)
  }

  // Atomically resolve the challenge
  const playerRecord = db.select().from(game_players).where(eq(game_players.id, player.id)).get()!
  const newIncorrect = isCorrect ? challenge.incorrect_submit_count : challenge.incorrect_submit_count + 1

  let awardedXP = 0

  sqlite.transaction(() => {
    // Record submission
    db.insert(submissions).values({
      id: randomUUID(),
      challenge_id: challengeId,
      player_id: player.id,
      answer_payload: answer,
      correct: isCorrect,
    }).run()

    if (isCorrect) {
      awardedXP = calcXP(challenge.challenge_type as any, challenge.difficulty as any, challenge.incorrect_submit_count, playerRecord.streak)

      const newStreak = playerRecord.streak + 1
      const seenIds = JSON.parse(playerRecord.seen_question_ids as string || '[]') as string[]

      db.update(game_players)
        .set({
          match_xp: playerRecord.match_xp + awardedXP,
          streak: newStreak,
          seen_question_ids: JSON.stringify([...seenIds, challenge.question_version_id]),
        })
        .where(eq(game_players.id, player.id))
        .run()

      db.update(game_challenges)
        .set({ status: 'CORRECT', awarded_xp: awardedXP, resolved_at: new Date().toISOString(), incorrect_submit_count: newIncorrect })
        .where(eq(game_challenges.id, challengeId))
        .run()

      db.update(games)
        .set({ turn_state: 'TURN_COMPLETE', state_version: game.state_version + 1 })
        .where(eq(games.id, gameId))
        .run()

      appendEvent(gameId, 'ANSWER_SUBMITTED', player.id, { correct: true })
      appendEvent(gameId, 'CHALLENGE_CORRECT', player.id, { challenge_id: challengeId })
      appendEvent(gameId, 'XP_AWARDED', player.id, { xp: awardedXP, new_total: playerRecord.match_xp + awardedXP })
      appendEvent(gameId, 'TURN_COMPLETED', player.id, { xp: awardedXP })
    } else {
      // Deduct a heart on failure (SHIELD power-up blocks this)
      const powerUps = JSON.parse(playerRecord.power_ups || '{}') as Record<string, number>
      const shieldActive = powerUps['_SHIELD_ACTIVE'] ?? 0
      let newHearts = playerRecord.hearts

      if (shieldActive > 0) {
        // Shield absorbs the heart loss
        powerUps['_SHIELD_ACTIVE'] = 0
        db.update(game_players)
          .set({ power_ups: JSON.stringify(powerUps) as any })
          .where(eq(game_players.id, player.id))
          .run()
        appendEvent(gameId, 'SHIELD_ABSORBED', player.id, {})
      } else {
        newHearts = Math.max(0, playerRecord.hearts - 1)
        db.update(game_players)
          .set({ hearts: newHearts })
          .where(eq(game_players.id, player.id))
          .run()
        if (newHearts === 0) {
          appendEvent(gameId, 'HEART_LOST', player.id, { hearts_remaining: 0, note: 'out_of_hearts' })
        } else {
          appendEvent(gameId, 'HEART_LOST', player.id, { hearts_remaining: newHearts })
        }
      }

      db.update(game_challenges)
        .set({ incorrect_submit_count: newIncorrect })
        .where(eq(game_challenges.id, challengeId))
        .run()

      appendEvent(gameId, 'ANSWER_SUBMITTED', player.id, { correct: false, attempt: newIncorrect })
      appendEvent(gameId, 'CHALLENGE_INCORRECT', player.id, { challenge_id: challengeId, attempt: newIncorrect })

      // For CODE/DEBUG: don't auto-resolve on single incorrect — player can retry
      // For QUIZ/LOGIC/OUTPUT: could still retry until expiry
      db.update(games).set({ state_version: game.state_version + 1 }).where(eq(games.id, gameId)).run()
    }
  })()

  const cfg = game.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  const responseData = {
    ...snapshot,
    correct: isCorrect,
    awarded_xp: awardedXP,
    explanation: isCorrect ? qv.explanation : undefined,
    code_results: codeRunResults,
  } as unknown as Record<string, unknown>
  storeIdempotencyResult(idempKey, responseData)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(responseData)
})

// ── POST /api/games/:id/challenges/:cid/complete-turn ────────────────────────

challengesRouter.post('/:cid/complete-turn', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.current_player_id !== player.id) return c.json({ code: 'NOT_YOUR_TURN', message: 'Not your turn', recoverable: true }, 400)
  if (game.turn_state !== 'TURN_COMPLETE') {
    return c.json({ code: 'INVALID_GAME_STATE', message: 'Turn is not complete yet', recoverable: true }, 400)
  }

  const cfg = game.configuration as { board_id: string }
  await advanceTurn(game)

  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(snapshot)
})

// ── POST /api/games/:id/complete-turn (no challenge needed) ──────────────────

export const completeTurnRouter = new Hono()

completeTurnRouter.post('/', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const player = c.get('player') as any

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)
  if (game.current_player_id !== player.id) return c.json({ code: 'NOT_YOUR_TURN', message: 'Not your turn', recoverable: true }, 400)
  if (game.turn_state !== 'TURN_COMPLETE') {
    return c.json({ code: 'INVALID_GAME_STATE', message: `Cannot complete turn from state ${game.turn_state}`, recoverable: true }, 400)
  }

  const cfg = game.configuration as { board_id: string }
  await advanceTurn(game)

  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json(snapshot)
})

// ── Shared: resolve an expired challenge ─────────────────────────────────────

function resolveChallenge(game: any, player: any, challenge: any, correct: boolean, expired: boolean) {
  const playerRecord = db.select().from(game_players).where(eq(game_players.id, player.id)).get()!
  const seenIds = JSON.parse(playerRecord.seen_question_ids as string || '[]') as string[]

  sqlite.transaction(() => {
    db.update(game_challenges)
      .set({ status: expired ? 'EXPIRED' : correct ? 'CORRECT' : 'INCORRECT', resolved_at: new Date().toISOString() })
      .where(eq(game_challenges.id, challenge.id))
      .run()

    // Reset streak on failure
    db.update(game_players)
      .set({
        streak: 0,
        seen_question_ids: JSON.stringify([...seenIds, challenge.question_version_id]),
      })
      .where(eq(game_players.id, player.id))
      .run()

    db.update(games)
      .set({ turn_state: 'TURN_COMPLETE', state_version: game.state_version + 1 })
      .where(eq(games.id, game.id))
      .run()

    appendEvent(game.id, 'TURN_COMPLETED', player.id, { note: expired ? 'expired' : 'incorrect' })
  })()
}

// ── Shared: advance to next player's turn, cycling rounds ───────────────────

export async function advanceTurn(game: any): Promise<void> {
  // Get active players in seat order
  const players = db.select().from(game_players)
    .where(and(eq(game_players.game_id, game.id), eq(game_players.status, 'ACTIVE')))
    .all()
    .sort((a, b) => a.seat_number - b.seat_number)

  if (players.length === 0) return

  const currentIdx = players.findIndex(p => p.id === game.current_player_id)
  const nextIdx = (currentIdx + 1) % players.length
  const nextPlayer = players[nextIdx]
  const isRoundComplete = nextIdx === 0 // wrapped back to first player

  const newRound = isRoundComplete ? game.current_round + 1 : game.current_round
  const gameOver = isRoundComplete && newRound > game.round_count

  sqlite.transaction(() => {
    if (gameOver) {
      db.update(games)
        .set({
          status: 'GAME_COMPLETE',
          turn_state: 'WAITING',
          state_version: game.state_version + 1,
          completed_at: new Date().toISOString(),
        })
        .where(eq(games.id, game.id))
        .run()
      appendEvent(game.id, 'GAME_COMPLETED', game.current_player_id, {})
    } else {
      db.update(games)
        .set({
          current_round: newRound,
          current_player_id: nextPlayer.id,
          turn_state: 'AWAITING_ROLL',
          dice_result: null,
          state_version: game.state_version + 1,
        })
        .where(eq(games.id, game.id))
        .run()

      if (isRoundComplete) {
        appendEvent(game.id, 'ROUND_COMPLETED', game.current_player_id, { completed_round: game.current_round })
        appendEvent(game.id, 'ROUND_STARTED', nextPlayer.id, { round: newRound })
      }
      appendEvent(game.id, 'TURN_STARTED', nextPlayer.id, { player_id: nextPlayer.id })
    }
  })()
}
