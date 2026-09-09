import { Hono } from 'hono'
import { db, sqlite } from '../db/client.js'
import { games, game_players, battles, question_versions } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { enqueueExecution } from '../execution/queue.js'
import { evaluateAnswer, calcBattleXP, getBaseXP } from '../game/engine.js'
import { buildSnapshot, appendEvent } from '../game/snapshot.js'
import { broadcastAll } from '../realtime/rooms.js'
import { makeEnvelope } from '../realtime/protocol.js'
import type { TestCase } from '../execution/queue.js'
import type { BattleParticipant } from '../types.js'

export const battlesRouter = new Hono()

// GET /api/games/:id/battles/:bid — current state of a battle
battlesRouter.get('/:bid', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const battleId = c.req.param('bid')

  const battle = db.select().from(battles).where(eq(battles.id, battleId)).get()
  if (!battle || battle.game_id !== gameId) {
    return c.json({ code: 'BATTLE_NOT_FOUND', message: 'Battle not found', recoverable: false }, 404)
  }
  return c.json(battle)
})

// POST /api/games/:id/battles/:bid/submit — submit answer for a battle
battlesRouter.post('/:bid/submit', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const battleId = c.req.param('bid')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))

  const battle = db.select().from(battles).where(eq(battles.id, battleId)).get()
  if (!battle || battle.game_id !== gameId) {
    return c.json({ code: 'BATTLE_NOT_FOUND', message: 'Battle not found', recoverable: false }, 404)
  }
  if (battle.status !== 'active') {
    return c.json({ code: 'INVALID_GAME_STATE', message: 'Battle is not active', recoverable: false }, 400)
  }

  const participants = battle.participants as BattleParticipant[]
  const me = participants.find(p => p.player_id === player.id)
  if (!me) {
    return c.json({ code: 'UNAUTHORIZED', message: 'You are not in this battle', recoverable: false }, 401)
  }
  if (me.submitted) {
    return c.json({ code: 'BATTLE_ALREADY_SUBMITTED', message: 'Already submitted', recoverable: false }, 400)
  }

  const qv = battle.question_version_id
    ? db.select().from(question_versions).where(eq(question_versions.id, battle.question_version_id)).get()
    : null

  let correct = false
  const submittedAt = new Date().toISOString()

  if (qv) {
    const answerData = qv.answer_data as Record<string, unknown>
    const isCode = body.code !== undefined

    if (isCode) {
      const code = body.code as string
      const publicTests = (answerData.public_tests ?? []) as Array<{ input: string; expected_output: string }>
      const hiddenTests = (answerData.hidden_tests ?? []) as Array<{ input: string; expected_output: string }>
      const tests: TestCase[] = [
        ...publicTests.map(t => ({ input: t.input, expected_output: t.expected_output, is_hidden: false })),
        ...hiddenTests.map(t => ({ input: t.input, expected_output: t.expected_output, is_hidden: true })),
      ]
      const result = await enqueueExecution(code, tests, 'submit')
      correct = result.results.length > 0 && result.results.every(r => r.passed)
    } else {
      correct = evaluateAnswer(answerData, body)
    }
  }

  // Update participant record
  const updatedParticipants = participants.map(p =>
    p.player_id === player.id
      ? { ...p, submitted: true, correct, submitted_at: submittedAt }
      : p
  )

  const allSubmitted = updatedParticipants.every(p => p.submitted)

  sqlite.transaction(() => {
    db.update(battles)
      .set({
        participants: updatedParticipants as any,
        status: allSubmitted ? 'complete' : 'active',
      })
      .where(eq(battles.id, battleId))
      .run()

    appendEvent(gameId, 'BATTLE_SUBMITTED', player.id, { battle_id: battleId, correct })
  })()

  // If all submitted, rank and award XP
  if (allSubmitted) {
    await finalizeBattle(gameId, battleId, qv)
  }

  const cfg = db.select().from(games).where(eq(games.id, gameId)).get()?.configuration as { board_id: string }
  const snapshot = await buildSnapshot(gameId, cfg.board_id)
  broadcastAll(gameId, makeEnvelope('GAME_STATE_UPDATED', gameId, snapshot.last_event_sequence, snapshot as any))
  return c.json({ ...snapshot, battle_correct: correct })
})

// ── Internal: finalize battle results ─────────────────────────────────────────

async function finalizeBattle(gameId: string, battleId: string, qv: any) {
  const battle = db.select().from(battles).where(eq(battles.id, battleId)).get()
  if (!battle) return

  const participants = battle.participants as Array<BattleParticipant & { submitted_at?: string }>

  // Sort: correct first, then by submission time
  const ranked = [...participants].sort((a, b) => {
    if (a.correct && !b.correct) return -1
    if (!a.correct && b.correct) return 1
    if (a.submitted_at && b.submitted_at) return a.submitted_at < b.submitted_at ? -1 : 1
    return 0
  })

  const baseXP = qv ? getBaseXP(qv.challenge_type ?? 'QUIZ', qv.difficulty ?? 'medium') : 60

  const results: BattleParticipant[] = []
  let rank = 1

  sqlite.transaction(() => {
    for (const p of ranked) {
      const xp = p.correct ? calcBattleXP(baseXP, rank) : 0
      results.push({ ...p, rank, xp_awarded: xp })

      if (xp > 0) {
        const playerRecord = db.select().from(game_players).where(eq(game_players.id, p.player_id)).get()
        if (playerRecord) {
          db.update(game_players)
            .set({ match_xp: playerRecord.match_xp + xp })
            .where(eq(game_players.id, p.player_id))
            .run()
        }
      }

      if (p.correct) rank++
    }

    db.update(battles)
      .set({ status: 'complete', results: results as any })
      .where(eq(battles.id, battleId))
      .run()

    // Transition back to TURN_COMPLETE for the current player
    const game = db.select().from(games).where(eq(games.id, gameId)).get()
    if (game) {
      db.update(games)
        .set({ turn_state: 'TURN_COMPLETE', current_battle_id: null, state_version: game.state_version + 1 })
        .where(eq(games.id, gameId))
        .run()
    }

    appendEvent(gameId, 'BATTLE_COMPLETED', null, { battle_id: battleId, results })
    appendEvent(gameId, 'TURN_COMPLETED', null, { note: 'battle_complete' })
  })()
}

// ── Start a battle (called internally from actions.ts) ────────────────────────

export async function startBattle(
  game: any,
  triggeringPlayer: any,
  boardId: string,
  type: '1v1' | 'all',
): Promise<string> {
  const { randomUUID } = await import('node:crypto')
  const { selectQuestion } = await import('../game/questions.js')

  // Pick a question
  const seenIds = triggeringPlayer.seen_question_ids
    ? JSON.parse(triggeringPlayer.seen_question_ids as string)
    : []
  let question
  try {
    question = await selectQuestion('QUIZ', seenIds, game.current_round)
  } catch {
    question = null
  }

  const now = new Date()
  const countdownEndsAt = new Date(now.getTime() + 5_000).toISOString()  // 5s countdown
  const battleEndsAt = new Date(now.getTime() + 5_000 + 60_000).toISOString() // 60s to answer

  // Build participant list
  const allPlayers = db.select().from(game_players)
    .where(eq(game_players.game_id, game.id))
    .all()
    .filter(p => p.status === 'ACTIVE')

  let participants: BattleParticipant[]
  if (type === '1v1') {
    const others = allPlayers.filter(p => p.id !== triggeringPlayer.id)
    const opponent = others[Math.floor(Math.random() * others.length)]
    participants = opponent
      ? [triggeringPlayer, opponent].map(p => ({ player_id: p.id, display_name: p.display_name, submitted: false }))
      : [{ player_id: triggeringPlayer.id, display_name: triggeringPlayer.display_name, submitted: false }]
  } else {
    participants = allPlayers.map(p => ({ player_id: p.id, display_name: p.display_name, submitted: false }))
  }

  const battleId = randomUUID()

  sqlite.transaction(() => {
    db.insert(battles).values({
      id: battleId,
      game_id: game.id,
      type,
      status: 'active',
      question_version_id: question?.questionVersionId ?? null,
      participants: participants as any,
      countdown_ends_at: countdownEndsAt,
      battle_ends_at: battleEndsAt,
      results: [] as any,
    }).run()

    db.update(games)
      .set({
        turn_state: 'BATTLE_ACTIVE',
        current_battle_id: battleId,
        state_version: game.state_version + 1,
      })
      .where(eq(games.id, game.id))
      .run()

    appendEvent(game.id, 'BATTLE_STARTED', triggeringPlayer.id, { battle_id: battleId, type })
  })()

  return battleId
}
