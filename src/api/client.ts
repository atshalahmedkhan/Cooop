import {
  GameApiError,
  type CreateGameResponse,
  type JoinGameResponse,
  type GameStateSnapshot,
  type SubmitResponse,
  type GameResults,
  type CodeRunResult,
} from './types'

const BASE = '/api'

function getToken(): string | null {
  return sessionStorage.getItem('cp_player_token')
}

function setSession(gameId: string, playerId: string, token: string) {
  sessionStorage.setItem('cp_game_id', gameId)
  sessionStorage.setItem('cp_player_id', playerId)
  sessionStorage.setItem('cp_player_token', token)
}

export function getSession() {
  return {
    gameId: sessionStorage.getItem('cp_game_id'),
    playerId: sessionStorage.getItem('cp_player_id'),
    token: sessionStorage.getItem('cp_player_token'),
  }
}

export function clearSession() {
  sessionStorage.removeItem('cp_game_id')
  sessionStorage.removeItem('cp_player_id')
  sessionStorage.removeItem('cp_player_token')
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  withAuth = false,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (withAuth) {
    const token = getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data = await res.json()

  if (!res.ok) {
    throw new GameApiError(
      data.code ?? 'UNKNOWN',
      data.message ?? 'Request failed',
      data.recoverable ?? false,
      res.status,
    )
  }

  return data as T
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createGame(displayName: string, roundCount = 4): Promise<CreateGameResponse> {
  const result = await request<CreateGameResponse>('POST', '/games', {
    display_name: displayName,
    round_count: roundCount,
  })
  setSession(result.game_id, result.player_id, result.player_token)
  return result
}

export async function joinGame(joinCode: string, displayName: string): Promise<JoinGameResponse> {
  const result = await request<JoinGameResponse>('POST', '/games/join', {
    join_code: joinCode,
    display_name: displayName,
  })
  setSession(result.game_id, result.player_id, result.player_token)
  return result
}

export async function setReady(gameId: string, ready: boolean): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/ready`, { ready }, true)
}

export async function startGame(gameId: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/start`, {}, true)
}

export async function getState(gameId: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('GET', `/games/${gameId}/state`)
}

export async function rollDice(gameId: string, commandId: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/actions/roll`, { command_id: commandId }, true)
}

export async function selectPath(gameId: string, commandId: string, destinationNodeKey: number): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/actions/path`, {
    command_id: commandId,
    destination_node_key: destinationNodeKey,
  }, true)
}

export async function submitAnswer(
  gameId: string,
  challengeId: string,
  commandId: string,
  answer: Record<string, unknown>,
): Promise<SubmitResponse> {
  return request<SubmitResponse>('POST', `/games/${gameId}/challenges/${challengeId}/submit`, {
    command_id: commandId,
    answer,
  }, true)
}

export async function completeTurn(gameId: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/complete-turn`, {}, true)
}

export async function getResults(gameId: string): Promise<GameResults> {
  return request<GameResults>('GET', `/games/${gameId}/results`)
}

export async function runCode(
  gameId: string,
  challengeId: string,
  code: string,
): Promise<CodeRunResult> {
  return request<CodeRunResult>('POST', `/games/${gameId}/challenges/${challengeId}/run`, { code }, true)
}

export async function resolveMystery(gameId: string, commandId: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/mystery/resolve`, { command_id: commandId }, true)
}

export async function usePowerUp(gameId: string, type: string): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/powerups/use`, { type }, true)
}

export async function submitBattle(
  gameId: string,
  battleId: string,
  payload: Record<string, unknown>,
): Promise<GameStateSnapshot> {
  return request<GameStateSnapshot>('POST', `/games/${gameId}/battles/${battleId}/submit`, payload, true)
}
