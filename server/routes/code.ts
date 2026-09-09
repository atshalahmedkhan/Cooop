import { Hono } from 'hono'
import { db } from '../db/client.js'
import { games, game_challenges, question_versions } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth.js'
import { enqueueExecution } from '../execution/queue.js'
import type { TestCase } from '../execution/queue.js'
import type { CodeRunResult } from '../types.js'

export const codeRouter = new Hono()

// POST /api/games/:id/challenges/:cid/run
// Non-destructive: runs public tests only, does not change game state
codeRouter.post('/:cid/run', authMiddleware, async (c) => {
  const gameId = c.req.param('id')
  const challengeId = c.req.param('cid')
  const player = c.get('player') as any
  const body = await c.req.json().catch(() => ({}))
  const code = body.code as string | undefined

  if (!code) return c.json({ code: 'VALIDATION_ERROR', message: 'code is required', recoverable: false }, 400)
  if (code.length > 20_000) return c.json({ code: 'VALIDATION_ERROR', message: 'Code too large (max 20 KB)', recoverable: false }, 400)

  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) return c.json({ code: 'GAME_NOT_FOUND', message: 'Game not found', recoverable: false }, 404)

  const challenge = db.select().from(game_challenges).where(eq(game_challenges.id, challengeId)).get()
  if (!challenge) return c.json({ code: 'CHALLENGE_NOT_FOUND', message: 'Challenge not found', recoverable: false }, 404)
  if (challenge.game_id !== gameId) return c.json({ code: 'UNAUTHORIZED', message: 'Wrong game', recoverable: false }, 401)
  if (challenge.player_id !== player.id) return c.json({ code: 'UNAUTHORIZED', message: 'Not your challenge', recoverable: false }, 401)
  if (challenge.status !== 'ACTIVE') return c.json({ code: 'CHALLENGE_ALREADY_COMPLETE', message: 'Challenge is no longer active', recoverable: false }, 400)

  const qv = db.select().from(question_versions).where(eq(question_versions.id, challenge.question_version_id)).get()
  if (!qv) return c.json({ code: 'CHALLENGE_NOT_FOUND', message: 'Question not found', recoverable: false }, 404)

  const answerData = qv.answer_data as Record<string, unknown>
  const publicTests = (answerData.public_tests ?? []) as Array<{
    input: string
    expected_output: string
    hint?: string
  }>

  const tests: TestCase[] = publicTests.map(t => ({
    input: t.input,
    expected_output: t.expected_output,
    is_hidden: false,
    hint: t.hint,
  }))

  const result = await enqueueExecution(code, tests, 'run')

  const publicPassed = result.results.filter(r => r.passed).length
  const response: CodeRunResult = {
    results: result.results,
    error: result.error,
    timedOut: result.timedOut,
    public_passed: publicPassed,
    public_total: tests.length,
  }

  return c.json(response)
})
