import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { initDb, runMigrations } from './db/client.js'
import { seed } from './db/seed.js'
import { gamesRouter } from './routes/games.js'
import { actionsRouter } from './routes/actions.js'
import { challengesRouter, completeTurnRouter } from './routes/challenges.js'
import { codeRouter } from './routes/code.js'
import { mysteryRouter } from './routes/mystery.js'
import { powerupsRouter } from './routes/powerups.js'
import { battlesRouter } from './routes/battles.js'
import { setupWebSocket } from './realtime/websocket.js'
import { GameError } from './types.js'

// Initialize database and seed on first import
initDb()
runMigrations()
seed().catch(() => {}) // seed is idempotent — silently skip if already seeded

const app = new Hono()

// CORS (Vite proxy handles prod-dev; useful for direct API testing)
app.use('/api/*', cors({
  origin: ['http://localhost:8443', 'http://0.0.0.0:8443'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

app.route('/api/games', gamesRouter)
app.route('/api/games/:id/actions', actionsRouter)
app.route('/api/games/:id/challenges', challengesRouter)
app.route('/api/games/:id/challenges', codeRouter)
app.route('/api/games/:id/complete-turn', completeTurnRouter)
app.route('/api/games/:id/mystery', mysteryRouter)
app.route('/api/games/:id/powerups', powerupsRouter)
app.route('/api/games/:id/battles', battlesRouter)

app.onError((err, c) => {
  if (err instanceof GameError) {
    return c.json({ code: err.code, message: err.message, recoverable: err.recoverable }, err.status as 400 | 401 | 404 | 500)
  }
  console.error('[Server Error]', err)
  return c.json({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', recoverable: false }, 500)
})

app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Endpoint not found' }, 404))

export default app

// Only start HTTP listener when run directly (not imported by tests)
const isMain = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')
if (isMain) {
  const { serve } = await import('@hono/node-server')
  const PORT = 3001
  const server = serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`Codepoly API server running on http://localhost:${PORT}`)
  })
  // Attach WebSocket server to the same HTTP server (handles /ws/<gameId>)
  setupWebSocket(server)
}
