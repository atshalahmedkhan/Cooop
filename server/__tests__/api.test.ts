import { describe, it, expect, beforeAll } from 'vitest'
import app from '../index.js'

// Integration test: full solo game flow using the Hono app directly

async function post(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }))
  return { status: res.status, data: await res.json() }
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await app.fetch(new Request(`http://localhost${path}`, { headers }))
  return { status: res.status, data: await res.json() }
}

describe('POST /api/games', () => {
  it('creates a game and returns player_token', async () => {
    const { status, data } = await post('/api/games', { display_name: 'TestPlayer' })
    expect(status).toBe(201)
    expect(data.game_id).toBeDefined()
    expect(data.player_token).toBeDefined()
  })
})

describe('Full solo game flow', () => {
  let gameId: string
  let token: string

  beforeAll(async () => {
    const { data } = await post('/api/games', { display_name: 'Tester', round_count: 1 })
    gameId = data.game_id
    token = data.player_token
  })

  it('starts the game', async () => {
    const { status, data } = await post(`/api/games/${gameId}/start`, {}, token)
    expect(status).toBe(200)
    expect(data.game_status).toBe('ACTIVE')
    expect(data.turn_state).toBe('AWAITING_ROLL')
    expect(data.allowed_actions).toContain('ROLL_DICE')
  })

  it('returns state via GET', async () => {
    const { status, data } = await get(`/api/games/${gameId}/state`)
    expect(status).toBe(200)
    expect(data.turn_state).toBe('AWAITING_ROLL')
  })

  it('rolls the dice', async () => {
    const cmdId = crypto.randomUUID()
    const { status, data } = await post(`/api/games/${gameId}/actions/roll`, { command_id: cmdId }, token)
    expect(status).toBe(200)
    expect(data.dice_result).toBeGreaterThanOrEqual(1)
    expect(data.dice_result).toBeLessThanOrEqual(6)
  })

  it('idempotent: same command_id returns same result', async () => {
    const cmdId = crypto.randomUUID()
    const { data: d1 } = await post(`/api/games/${gameId}/actions/roll`, { command_id: cmdId }, token)
    // Start a new game to test idempotency on roll
    const { data: newGame } = await post('/api/games', { display_name: 'Tester2', round_count: 1 })
    await post(`/api/games/${newGame.game_id}/start`, {}, newGame.player_token)
    const { data: r1 } = await post(`/api/games/${newGame.game_id}/actions/roll`, { command_id: cmdId }, newGame.player_token)
    const { data: r2 } = await post(`/api/games/${newGame.game_id}/actions/roll`, { command_id: cmdId }, newGame.player_token)
    expect(r1.state_version).toBe(r2.state_version)
    expect(r1.dice_result).toBe(r2.dice_result)
  })

  it('rejects ROLL_DICE in wrong state', async () => {
    // Game just rolled — turn state should not be AWAITING_ROLL anymore
    const { data: state } = await get(`/api/games/${gameId}/state`)
    if (state.turn_state !== 'AWAITING_ROLL') {
      const cmdId = crypto.randomUUID()
      const { status } = await post(`/api/games/${gameId}/actions/roll`, { command_id: cmdId }, token)
      expect(status).toBe(400)
    }
  })
})

describe('Authorization', () => {
  it('rejects requests without token', async () => {
    const { data: g } = await post('/api/games', { display_name: 'AuthTest' })
    const { status } = await post(`/api/games/${g.game_id}/start`, {})
    expect(status).toBe(401)
  })

  it('rejects wrong token', async () => {
    const { data: g } = await post('/api/games', { display_name: 'AuthTest2' })
    const { status } = await post(`/api/games/${g.game_id}/start`, {}, 'bad-token')
    expect(status).toBe(401)
  })
})
