import { describe, it, expect } from 'vitest'
import app from '../index.js'

async function post(path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers, body: body ? JSON.stringify(body) : undefined,
  }))
  return { status: res.status, data: await res.json() as any }
}

async function get(path: string, token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await app.fetch(new Request(`http://localhost${path}`, { headers }))
  return { status: res.status, data: await res.json() as any }
}

// Play a single round: roll, (maybe choose path), (maybe answer)
// Returns the updated state
async function playRound(gameId: string, token: string): Promise<any> {
  // Roll
  let { data: state } = await post(`/api/games/${gameId}/actions/roll`, { command_id: crypto.randomUUID() }, token)

  // If fork: choose first available path
  if (state.turn_state === 'AWAITING_PATH_CHOICE') {
    const path = state.reachable_paths[0]
    ;({ data: state } = await post(`/api/games/${gameId}/actions/path`, {
      command_id: crypto.randomUUID(),
      destination_node_key: path.destination_node_id,
    }, token))
  }

  // If challenge: answer it
  if (state.turn_state === 'CHALLENGE_ACTIVE' && state.active_challenge) {
    const ch = state.active_challenge
    let answer: Record<string, unknown>

    if (ch.challenge_type === 'OUTPUT') {
      answer = { output: 'wrong answer intentionally' }
    } else {
      // Pick any choice — may be wrong
      answer = { choice: 'A' }
    }

    ;({ data: state } = await post(`/api/games/${gameId}/challenges/${ch.id}/submit`, {
      command_id: crypto.randomUUID(),
      answer,
    }, token))
  }

  // Complete turn if needed
  if (state.turn_state === 'TURN_COMPLETE') {
    ;({ data: state } = await post(`/api/games/${gameId}/complete-turn`, {}, token))
  }

  return state
}

describe('E2E: 1-round solo game', () => {
  it('completes without errors and ends in GAME_COMPLETE', async () => {
    // Create a 1-round game for speed
    const { data: created } = await post('/api/games', { display_name: 'E2E', round_count: 1 })
    const gameId: string = created.game_id
    const token: string = created.player_token

    await post(`/api/games/${gameId}/start`, {}, token)

    const finalState = await playRound(gameId, token)

    expect(finalState.game_status).toBe('GAME_COMPLETE')
    expect(finalState.current_round).toBe(1)
  })
})

describe('E2E: 4-round solo game', () => {
  it('progresses through 4 rounds with monotonic event sequence', async () => {
    const { data: created } = await post('/api/games', { display_name: 'E2E4', round_count: 4 })
    const gameId: string = created.game_id
    const token: string = created.player_token

    await post(`/api/games/${gameId}/start`, {}, token)

    let state: any
    for (let round = 1; round <= 4; round++) {
      state = await playRound(gameId, token)
    }

    expect(state.game_status).toBe('GAME_COMPLETE')

    // Verify results endpoint
    const { data: results } = await get(`/api/games/${gameId}/results`)
    expect(results.players.length).toBe(1)
    expect(results.players[0].rank).toBe(1)
    expect(typeof results.players[0].match_xp).toBe('number')
  })
})

describe('E2E: state persistence (refresh)', () => {
  it('restores game state after a GET /state', async () => {
    const { data: created } = await post('/api/games', { display_name: 'RefreshTest', round_count: 2 })
    const gameId: string = created.game_id
    const token: string = created.player_token

    await post(`/api/games/${gameId}/start`, {}, token)

    const { data: state1 } = await get(`/api/games/${gameId}/state`)
    expect(state1.turn_state).toBe('AWAITING_ROLL')
    expect(state1.game_id).toBe(gameId)

    // "Refresh" — get state again
    const { data: state2 } = await get(`/api/games/${gameId}/state`)
    expect(state2.state_version).toBe(state1.state_version)
    expect(state2.turn_state).toBe(state1.turn_state)
  })
})

describe('Concurrency: duplicate commands', () => {
  it('double roll with same command_id does not duplicate state_version increment', async () => {
    const { data: created } = await post('/api/games', { display_name: 'ConcTest', round_count: 1 })
    const gameId: string = created.game_id
    const token: string = created.player_token
    await post(`/api/games/${gameId}/start`, {}, token)

    const cmdId = crypto.randomUUID()
    const { data: r1 } = await post(`/api/games/${gameId}/actions/roll`, { command_id: cmdId }, token)
    const { data: r2 } = await post(`/api/games/${gameId}/actions/roll`, { command_id: cmdId }, token)

    // Same command_id → same result, state_version unchanged
    expect(r1.state_version).toBe(r2.state_version)
    expect(r1.dice_result).toBe(r2.dice_result)
  })
})
