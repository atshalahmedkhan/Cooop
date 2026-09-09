// @refresh reset
// v2 — WebSocket realtime, polling removed
import { useState, useCallback, useRef, useEffect } from 'react'
import * as api from '../api/client'
import { getSession, clearSession } from '../api/client'
import type { GameStateSnapshot, ChallengeSnapshot, AllowedAction } from '../api/types'

// ── Lobby screen sub-state ────────────────────────────────────────────────────

export type LobbyScreen = 'home' | 'creating' | 'joining' | 'lobby'

// ── Derived UI state ──────────────────────────────────────────────────────────

export type GamePhase = 'lobby' | 'playing' | 'complete'

export type UiTurnState =
  | 'awaiting_roll'
  | 'rolling'
  | 'moving'
  | 'awaiting_path'
  | 'challenge'
  | 'mystery'
  | 'battle'
  | 'turn_complete'

export interface PlayerState {
  id: string
  name: string
  color: string
  dark: string
  abbr: string
  space: number
  xp: number
  hearts: number
  streak: number
  powerUps: { hint: number; shield: number; doubleDice: number; skip: number }
  seenQuestionIds: string[]
  isHost: boolean
  isReady: boolean
  seatNumber: number
}

export interface CodeTestResult {
  passed: boolean
  output: string
  expected: string
  hidden: boolean
  error: string | null
  hint?: string
}

export interface ActiveChallengeState {
  id: string
  question: {
    id: string
    type: 'QUIZ' | 'LOGIC' | 'OUTPUT' | 'CODE' | 'DEBUG'
    difficulty: 'easy' | 'medium' | 'hard'
    prompt: string
    instructions: string | null
    choices: Record<string, string> | null
    expectedOutput?: string
    explanation?: string
    starterCode?: string
  }
  isCodeChallenge: boolean
  tileKind: string
  incorrectSubmits: number
  hintsUsed: number
  maxTime: number
  userInput: string
  selectedChoice: 'A' | 'B' | 'C' | 'D' | null
  result: 'correct' | 'incorrect' | null
  xpAwarded: number
  currentHint: 0 | 1 | 2
  abandoned: boolean
  expiresAt: string
  codeRunResults: CodeTestResult[] | null
  isRunning: boolean
}

export interface TurnSummary {
  xp: number
  message: string
}

export interface UiGameState {
  phase: GamePhase
  lobbyScreen: LobbyScreen
  round: number
  maxRounds: number
  currentPlayerIdx: number
  turnState: UiTurnState
  diceResult: number | null
  players: PlayerState[]
  activeChallenge: ActiveChallengeState | null
  activeBattleId: string | null
  mysteryOutcome: import('../api/types').MysteryOutcome | null
  turnSummary: TurnSummary | null
  winner: PlayerState | null
  reachablePaths: Array<{ destination_node_id: number; label: string; path_id: string }>
  allowedActions: AllowedAction[]
  gameId: string | null
  playerId: string | null
  joinCode: string | null
  isHost: boolean
  canStart: boolean
  myReady: boolean
  isReconnecting: boolean
  error: string | null
}

const PLAYER_COLORS = [
  { color: '#e8443b', dark: '#a51f18' },
  { color: '#3ec74e', dark: '#1f8a2c' },
  { color: '#4aa3ff', dark: '#1f6fd6' },
  { color: '#fbc23b', dark: '#c8850e' },
]

function mapTurnState(serverState: string): UiTurnState {
  switch (serverState) {
    case 'AWAITING_ROLL':
    case 'AWAITING_DOUBLE_DICE': return 'awaiting_roll'
    case 'ROLL_RESOLVED':
    case 'AWAITING_PATH_CHOICE': return 'awaiting_path'
    case 'TILE_RESOLVED':
    case 'CHALLENGE_ACTIVE':
    case 'SUBMISSION_PENDING':
    case 'CHALLENGE_RESOLVED':
    case 'REWARD_RESOLVED': return 'challenge'
    case 'MYSTERY_RESOLVING': return 'mystery'
    case 'BATTLE_PREPARING':
    case 'BATTLE_ACTIVE': return 'battle'
    case 'TURN_COMPLETE': return 'turn_complete'
    default: return 'awaiting_roll'
  }
}

function mapPlayers(snapshot: GameStateSnapshot): PlayerState[] {
  return snapshot.players.map((p, i) => {
    const colors = PLAYER_COLORS[i] ?? PLAYER_COLORS[0]
    return {
      id: p.id,
      name: p.display_name,
      color: colors.color,
      dark: colors.dark,
      abbr: p.display_name.slice(0, 2).toUpperCase(),
      space: p.current_node_id,
      xp: p.match_xp,
      hearts: p.hearts,
      streak: p.streak,
      powerUps: {
        hint: p.power_ups?.HINT ?? 0,
        shield: p.power_ups?.SHIELD ?? 0,
        doubleDice: p.power_ups?.DOUBLE_DICE ?? 0,
        skip: p.power_ups?.SKIP ?? 0,
      },
      seenQuestionIds: [],
      isHost: p.is_host,
      isReady: p.is_ready,
      seatNumber: p.seat_number,
    }
  })
}

function mapChallenge(ch: ChallengeSnapshot | null, prevChallenge?: ActiveChallengeState | null): ActiveChallengeState | null {
  if (!ch) return null
  const timerSecs = Math.max(0, Math.round((new Date(ch.expires_at).getTime() - Date.now()) / 1000))
  const isSame = prevChallenge?.id === ch.id
  const starterCode = ch.instructions ?? ''
  return {
    id: ch.id,
    question: {
      id: ch.question_version_id,
      type: ch.challenge_type as any,
      difficulty: ch.difficulty as any,
      prompt: ch.prompt,
      instructions: ch.instructions,
      choices: ch.choices,
      starterCode,
    },
    isCodeChallenge: ch.is_code_challenge,
    tileKind: ch.challenge_type,
    incorrectSubmits: ch.incorrect_submit_count,
    hintsUsed: ch.hints_used,
    maxTime: timerSecs,
    userInput: isSame ? prevChallenge!.userInput : starterCode,
    selectedChoice: isSame ? prevChallenge!.selectedChoice : null,
    result: null,
    xpAwarded: 0,
    currentHint: 0,
    abandoned: false,
    expiresAt: ch.expires_at,
    codeRunResults: isSame ? (prevChallenge!.codeRunResults ?? null) : null,
    isRunning: false,
  }
}

function buildUiState(
  snapshot: GameStateSnapshot,
  prev: UiGameState,
  overrides: Partial<UiGameState> = {},
): UiGameState {
  const isComplete = snapshot.game_status === 'GAME_COMPLETE'
  const isLobby = snapshot.game_status === 'LOBBY'
  const players = mapPlayers(snapshot)

  const currentPlayerIdx = snapshot.current_player_id
    ? players.findIndex(p => p.id === snapshot.current_player_id)
    : 0

  const winner = isComplete ? [...players].sort((a, b) => b.xp - a.xp)[0] ?? null : null
  const myPlayer = prev.playerId ? players.find(p => p.id === prev.playerId) : null

  return {
    phase: isLobby ? 'lobby' : isComplete ? 'complete' : 'playing',
    lobbyScreen: isLobby ? 'lobby' : prev.lobbyScreen,
    round: snapshot.current_round,
    maxRounds: snapshot.round_count,
    currentPlayerIdx: Math.max(0, currentPlayerIdx),
    turnState: mapTurnState(snapshot.turn_state),
    diceResult: snapshot.dice_result,
    players,
    activeChallenge: mapChallenge(snapshot.active_challenge, prev.activeChallenge),
    activeBattleId: snapshot.active_battle?.id ?? null,
    mysteryOutcome: snapshot.mystery_outcome ?? null,
    turnSummary: null,
    winner,
    reachablePaths: snapshot.reachable_paths,
    allowedActions: snapshot.allowed_actions,
    gameId: snapshot.game_id,
    playerId: prev.playerId,
    joinCode: snapshot.join_code,
    isHost: myPlayer?.isHost ?? false,
    canStart: snapshot.can_start,
    myReady: myPlayer?.isReady ?? false,
    isReconnecting: prev.isReconnecting,
    error: null,
    ...overrides,
  }
}

const INITIAL_UI: UiGameState = {
  phase: 'lobby',
  lobbyScreen: 'home',
  round: 1,
  maxRounds: 4,
  currentPlayerIdx: 0,
  turnState: 'awaiting_roll',
  diceResult: null,
  players: [],
  activeChallenge: null,
  activeBattleId: null,
  mysteryOutcome: null,
  turnSummary: null,
  winner: null,
  reachablePaths: [],
  allowedActions: [],
  gameId: null,
  playerId: null,
  joinCode: null,
  isHost: false,
  canStart: false,
  myReady: false,
  isReconnecting: false,
  error: null,
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGameApi() {
  const [state, setState] = useState<UiGameState>(INITIAL_UI)
  const [timeLeft, setTimeLeft] = useState(60)
  const [isLoading, setIsLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const lastSeqRef = useRef<number>(-1)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref to connectSocket so reconnect closure always calls latest version
  const connectSocketRef = useRef<(gameId: string, token: string) => void>(null!)

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }, [])

  const startTimer = useCallback((seconds: number) => {
    stopTimer()
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { stopTimer(); return 0 } return t - 1 })
    }, 1000)
  }, [stopTimer])

  const disconnectSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      const ws = wsRef.current
      ws.onclose = null
      ws.close()
      wsRef.current = null
    }
  }, [])

  const connectSocket = useCallback((gameId: string, token: string) => {
    // Cancel any pending reconnect and close existing socket
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current) {
      const old = wsRef.current
      old.onclose = null
      old.close()
      wsRef.current = null
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/${gameId}?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setState(prev => prev.isReconnecting ? { ...prev, isReconnecting: false } : prev)
    }

    ws.onmessage = (evt) => {
      let msg: any
      try { msg = JSON.parse(evt.data) } catch { return }

      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }))
        return
      }

      if (msg.type !== 'GAME_SNAPSHOT' && msg.type !== 'GAME_STATE_UPDATED') return
      if (typeof msg.seq !== 'number' || msg.seq <= lastSeqRef.current) return
      lastSeqRef.current = msg.seq

      const snapshot = msg.payload as GameStateSnapshot
      setState(prev => {
        const next = buildUiState(snapshot, prev)
        // If a new challenge just appeared, start its timer
        if (
          next.activeChallenge &&
          (!prev.activeChallenge || prev.activeChallenge.id !== next.activeChallenge.id)
        ) {
          const secs = Math.max(0, Math.round((new Date(next.activeChallenge.expiresAt).getTime() - Date.now()) / 1000))
          // Schedule outside setState to avoid side effects in pure function
          setTimeout(() => startTimer(secs), 0)
        } else if (!next.activeChallenge && prev.activeChallenge) {
          setTimeout(() => stopTimer(), 0)
        }
        return next
      })
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return // superseded by a newer connection
      wsRef.current = null
      setState(prev => ({ ...prev, isReconnecting: true }))
      reconnectTimerRef.current = setTimeout(() => {
        const { gameId: gid, token: tok } = getSession()
        if (gid && tok) connectSocketRef.current?.(gid, tok)
      }, 2000)
    }

    ws.onerror = () => ws.close()
  }, [startTimer, stopTimer])

  // Keep ref in sync so the reconnect timeout always calls the latest version
  useEffect(() => { connectSocketRef.current = connectSocket }, [connectSocket])

  useEffect(() => () => {
    stopTimer()
    disconnectSocket()
  }, [stopTimer, disconnectSocket])

  // Restore session on mount
  useEffect(() => {
    const { gameId, playerId, token } = getSession()
    if (gameId && token) {
      api.getState(gameId).then(snapshot => {
        lastSeqRef.current = snapshot.last_event_sequence
        setState(prev => {
          const next = buildUiState(snapshot, { ...prev, playerId: playerId ?? null })
          if (next.activeChallenge) {
            const secs = Math.max(0, Math.round((new Date(next.activeChallenge.expiresAt).getTime() - Date.now()) / 1000))
            startTimer(secs)
          }
          return next
        })
        connectSocket(gameId, token)
      }).catch(() => clearSession())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lobby actions ───────────────────────────────────────────────────────────

  const goToCreateScreen = useCallback(() => {
    setState(prev => ({ ...prev, lobbyScreen: 'creating', error: null }))
  }, [])

  const goToJoinScreen = useCallback(() => {
    setState(prev => ({ ...prev, lobbyScreen: 'joining', error: null }))
  }, [])

  const goHome = useCallback(() => {
    disconnectSocket()
    clearSession()
    lastSeqRef.current = -1
    setState(INITIAL_UI)
  }, [disconnectSocket])

  const createLobby = useCallback(async (displayName: string) => {
    setIsLoading(true)
    setState(prev => ({ ...prev, error: null }))
    try {
      const result = await api.createGame(displayName)
      const snapshot = await api.getState(result.game_id)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, { ...prev, playerId: result.player_id }))
      connectSocket(result.game_id, result.player_token)
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    } finally {
      setIsLoading(false)
    }
  }, [connectSocket])

  const joinLobby = useCallback(async (joinCode: string, displayName: string) => {
    setIsLoading(true)
    setState(prev => ({ ...prev, error: null }))
    try {
      const result = await api.joinGame(joinCode, displayName)
      lastSeqRef.current = result.snapshot.last_event_sequence
      setState(prev => buildUiState(result.snapshot, { ...prev, playerId: result.player_id }))
      connectSocket(result.game_id, result.player_token)
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    } finally {
      setIsLoading(false)
    }
  }, [connectSocket])

  const toggleReady = useCallback(async (currentReady: boolean) => {
    const { gameId } = getSession()
    if (!gameId) return
    setState(prev => ({ ...prev, error: null }))
    try {
      const snapshot = await api.setReady(gameId, !currentReady)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, prev))
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    }
  }, [])

  const startMatch = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    setIsLoading(true)
    setState(prev => ({ ...prev, error: null }))
    try {
      const snapshot = await api.startGame(gameId)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, prev))
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Game actions ────────────────────────────────────────────────────────────

  const roll = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    setState(prev => ({ ...prev, turnState: 'rolling', error: null }))
    try {
      const commandId = crypto.randomUUID()
      const snapshot = await api.rollDice(gameId, commandId)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => {
        const next = buildUiState(snapshot, prev)
        if (next.activeChallenge) {
          const secs = Math.max(0, Math.round((new Date(next.activeChallenge.expiresAt).getTime() - Date.now()) / 1000))
          setTimeout(() => startTimer(secs), 0)
        }
        return next
      })
    } catch (e: any) {
      setState(prev => ({ ...prev, turnState: 'awaiting_roll', error: e.message }))
    }
  }, [startTimer])

  const selectPath = useCallback(async (destinationNodeKey: number) => {
    const { gameId } = getSession()
    if (!gameId) return
    try {
      const commandId = crypto.randomUUID()
      const snapshot = await api.selectPath(gameId, commandId, destinationNodeKey)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => {
        const next = buildUiState(snapshot, prev)
        if (next.activeChallenge) {
          const secs = Math.max(0, Math.round((new Date(next.activeChallenge.expiresAt).getTime() - Date.now()) / 1000))
          setTimeout(() => startTimer(secs), 0)
        }
        return next
      })
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    }
  }, [startTimer])

  const selectChoice = useCallback((choice: 'A' | 'B' | 'C' | 'D') => {
    setState(prev => {
      if (!prev.activeChallenge || prev.activeChallenge.result !== null) return prev
      return { ...prev, activeChallenge: { ...prev.activeChallenge, selectedChoice: choice } }
    })
  }, [])

  const updateCode = useCallback((code: string) => {
    setState(prev => {
      if (!prev.activeChallenge) return prev
      return { ...prev, activeChallenge: { ...prev.activeChallenge, userInput: code } }
    })
  }, [])

  const submitAnswer = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    const currentChallenge = state.activeChallenge
    if (!currentChallenge) return
    stopTimer()
    setState(prev => ({ ...prev, error: null }))

    let answer: Record<string, unknown>
    const qt = currentChallenge.question.type
    if (qt === 'QUIZ' || qt === 'LOGIC') {
      if (!currentChallenge.selectedChoice) {
        startTimer(Math.max(0, Math.round((new Date(currentChallenge.expiresAt).getTime() - Date.now()) / 1000)))
        setState(prev => ({ ...prev, error: 'Please select an answer' }))
        return
      }
      answer = { choice: currentChallenge.selectedChoice }
    } else if (qt === 'CODE' || qt === 'DEBUG') {
      if (!currentChallenge.userInput.trim()) {
        startTimer(Math.max(0, Math.round((new Date(currentChallenge.expiresAt).getTime() - Date.now()) / 1000)))
        setState(prev => ({ ...prev, error: 'Please write some code first' }))
        return
      }
      answer = { code: currentChallenge.userInput }
    } else {
      answer = { output: currentChallenge.userInput }
    }

    try {
      const commandId = crypto.randomUUID()
      const response = await api.submitAnswer(gameId, currentChallenge.id, commandId, answer)
      lastSeqRef.current = response.last_event_sequence
      const isCorrect = response.correct
      setState(prev => {
        const next = buildUiState(response, prev)
        next.activeChallenge = prev.activeChallenge
          ? {
              ...prev.activeChallenge,
              result: isCorrect ? 'correct' : 'incorrect',
              xpAwarded: response.awarded_xp ?? 0,
              incorrectSubmits: isCorrect ? prev.activeChallenge.incorrectSubmits : prev.activeChallenge.incorrectSubmits + 1,
              codeRunResults: response.code_results ?? prev.activeChallenge.codeRunResults,
              isRunning: false,
            }
          : null
        next.turnState = isCorrect ? 'turn_complete' : 'challenge'
        if (isCorrect) next.turnSummary = { xp: response.awarded_xp ?? 0, message: `+${response.awarded_xp ?? 0} XP!` }
        return next
      })
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
      startTimer(Math.max(0, Math.round((new Date(currentChallenge.expiresAt).getTime() - Date.now()) / 1000)))
    }
  }, [state.activeChallenge, stopTimer, startTimer])

  const useHint = useCallback(() => {
    setState(prev => {
      if (!prev.activeChallenge || prev.activeChallenge.result !== null) return prev
      const ch = prev.activeChallenge
      if (ch.currentHint >= 2) return prev
      const newHint = (ch.currentHint + 1) as 1 | 2
      return { ...prev, activeChallenge: { ...ch, hintsUsed: ch.hintsUsed + 1, currentHint: newHint } }
    })
  }, [])

  const retry = useCallback(() => {
    setState(prev => {
      if (!prev.activeChallenge || prev.activeChallenge.result !== 'incorrect' || prev.activeChallenge.abandoned) return prev
      const ch = prev.activeChallenge
      const secs = Math.max(0, Math.round((new Date(ch.expiresAt).getTime() - Date.now()) / 1000))
      startTimer(secs)
      return { ...prev, activeChallenge: { ...ch, result: null } }
    })
  }, [startTimer])

  const giveUp = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    stopTimer()
    setState(prev => {
      if (!prev.activeChallenge) return prev
      return {
        ...prev,
        activeChallenge: { ...prev.activeChallenge, result: 'incorrect', abandoned: true },
        turnState: 'turn_complete',
        turnSummary: { xp: 0, message: 'Challenge skipped.' },
        error: null,
      }
    })
    try {
      await api.completeTurn(gameId)
      const snapshot = await api.getState(gameId)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, prev))
    } catch { /* ignore */ }
  }, [stopTimer])

  const continueGame = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    stopTimer()
    try {
      const snapshot = await api.completeTurn(gameId)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, prev))
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    }
  }, [stopTimer])

  const runCode = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    const currentChallenge = state.activeChallenge
    if (!currentChallenge || !currentChallenge.isCodeChallenge) return
    setState(prev => {
      if (!prev.activeChallenge) return prev
      return { ...prev, activeChallenge: { ...prev.activeChallenge, isRunning: true, codeRunResults: null } }
    })
    try {
      const result = await api.runCode(gameId, currentChallenge.id, currentChallenge.userInput)
      setState(prev => {
        if (!prev.activeChallenge) return prev
        return { ...prev, activeChallenge: { ...prev.activeChallenge, isRunning: false, codeRunResults: result.results } }
      })
    } catch (e: any) {
      setState(prev => {
        if (!prev.activeChallenge) return prev
        return { ...prev, activeChallenge: { ...prev.activeChallenge, isRunning: false }, error: e.message }
      })
    }
  }, [state.activeChallenge])

  const resolveMystery = useCallback(async () => {
    const { gameId } = getSession()
    if (!gameId) return
    try {
      const commandId = crypto.randomUUID()
      const snapshot = await api.resolveMystery(gameId, commandId)
      lastSeqRef.current = snapshot.last_event_sequence
      setState(prev => buildUiState(snapshot, prev))
    } catch (e: any) {
      setState(prev => ({ ...prev, error: e.message }))
    }
  }, [])

  const resetGame = useCallback(() => {
    stopTimer()
    disconnectSocket()
    lastSeqRef.current = -1
    clearSession()
    setState(INITIAL_UI)
  }, [stopTimer, disconnectSocket])

  return {
    state,
    timeLeft,
    isLoading,
    goHome,
    goToCreateScreen,
    goToJoinScreen,
    createLobby,
    joinLobby,
    toggleReady,
    startMatch,
    roll,
    selectPath,
    selectChoice,
    updateCode,
    submitAnswer,
    runCode,
    resolveMystery,
    useHint,
    retry,
    giveUp,
    continueGame,
    resetGame,
  }
}
