import { useState, useCallback, useRef, useEffect } from 'react'
import type { Question, MysteryEvent } from './questions'
import {
  calcXP, rollDie, nextSpace, pickQuestion, pickMysteryEvent,
  tileKindToQuestionType, timerForType, SPACE_KINDS,
  type TileKind,
} from './engine'

// ── Types ───────────────────────────────────────────────────────────────────

export interface PowerUps {
  hint: number
  shield: number
  doubleDice: number
  skip: number
}

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
  powerUps: PowerUps
  seenQuestionIds: string[]
}

export interface ActiveChallengeState {
  question: Question
  tileKind: TileKind
  incorrectSubmits: number
  hintsUsed: number
  maxTime: number
  userInput: string
  selectedChoice: 'A' | 'B' | 'C' | 'D' | null
  result: 'correct' | 'incorrect' | null
  xpAwarded: number
  currentHint: 0 | 1 | 2
  abandoned: boolean
}

export interface TurnSummary {
  xp: number
  message: string
}

export type GamePhase = 'lobby' | 'playing' | 'complete'
export type TurnState =
  | 'awaiting_roll'
  | 'rolling'
  | 'moving'
  | 'challenge'
  | 'mystery'
  | 'turn_complete'

export interface GameState {
  phase: GamePhase
  round: number
  maxRounds: number
  currentPlayerIdx: number
  turnState: TurnState
  diceResult: number | null
  players: PlayerState[]
  activeChallenge: ActiveChallengeState | null
  mysteryEvent: (MysteryEvent & { applied: boolean }) | null
  turnSummary: TurnSummary | null
  winner: PlayerState | null
}

// ── Initial data ─────────────────────────────────────────────────────────────

const INITIAL_PLAYERS: PlayerState[] = [
  { id: 'atshal', name: 'Atshal', color: '#e8443b', dark: '#a51f18', abbr: 'AT',
    space: 0, xp: 0, hearts: 3, streak: 0,
    powerUps: { hint: 1, shield: 0, doubleDice: 0, skip: 0 }, seenQuestionIds: [] },
  { id: 'maya', name: 'Maya', color: '#3ec74e', dark: '#1f8a2c', abbr: 'MA',
    space: 0, xp: 0, hearts: 3, streak: 0,
    powerUps: { hint: 0, shield: 0, doubleDice: 0, skip: 0 }, seenQuestionIds: [] },
  { id: 'leo', name: 'Leo', color: '#4aa3ff', dark: '#1f6fd6', abbr: 'LE',
    space: 0, xp: 0, hearts: 3, streak: 0,
    powerUps: { hint: 0, shield: 0, doubleDice: 0, skip: 0 }, seenQuestionIds: [] },
  { id: 'sam', name: 'Sam', color: '#fbc23b', dark: '#c8850e', abbr: 'SA',
    space: 0, xp: 0, hearts: 3, streak: 0,
    powerUps: { hint: 0, shield: 0, doubleDice: 0, skip: 0 }, seenQuestionIds: [] },
]

const INITIAL_STATE: GameState = {
  phase: 'lobby',
  round: 1,
  maxRounds: 4,
  currentPlayerIdx: 0,
  turnState: 'awaiting_roll',
  diceResult: null,
  players: INITIAL_PLAYERS,
  activeChallenge: null,
  mysteryEvent: null,
  turnSummary: null,
  winner: null,
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function advanceTurn(state: GameState): GameState {
  const nextIdx = (state.currentPlayerIdx + 1) % state.players.length
  const completedRound = nextIdx === 0
  const newRound = completedRound ? state.round + 1 : state.round

  if (newRound > state.maxRounds) {
    const sorted = [...state.players].sort((a, b) => b.xp - a.xp)
    return {
      ...state,
      phase: 'complete',
      winner: sorted[0],
      currentPlayerIdx: nextIdx,
      activeChallenge: null,
      mysteryEvent: null,
      turnSummary: null,
      diceResult: null,
    }
  }

  return {
    ...state,
    round: newRound,
    currentPlayerIdx: nextIdx,
    turnState: 'awaiting_roll',
    diceResult: null,
    activeChallenge: null,
    mysteryEvent: null,
    turnSummary: null,
  }
}

function resolveTile(state: GameState): GameState {
  const player = state.players[state.currentPlayerIdx]
  const kind = SPACE_KINDS[player.space]

  if (kind === 'CORNER') {
    return {
      ...state,
      turnState: 'turn_complete',
      turnSummary: { xp: 0, message: 'Corner passed — no challenge here!' },
    }
  }

  if (kind === 'MYSTERY') {
    const event = pickMysteryEvent()
    const newPlayers = state.players.map((p, i) => {
      if (i !== state.currentPlayerIdx) return p
      const newXP = Math.max(0, p.xp + event.xp)
      const newPowerUps = event.powerUp
        ? { ...p.powerUps, [event.powerUp]: p.powerUps[event.powerUp as keyof PowerUps] + 1 }
        : p.powerUps
      const newSpace = event.spaces !== 0 ? nextSpace(p.space, event.spaces) : p.space
      return { ...p, xp: newXP, powerUps: newPowerUps, space: newSpace }
    })
    return {
      ...state,
      players: newPlayers,
      mysteryEvent: { ...event, applied: true },
      turnState: 'mystery',
    }
  }

  const qType = tileKindToQuestionType(kind)
  const question = pickQuestion(qType, player.seenQuestionIds, state.round)

  if (!question) {
    return {
      ...state,
      turnState: 'turn_complete',
      turnSummary: { xp: 0, message: 'No challenge available — moving on!' },
    }
  }

  const maxTime = timerForType(question.type)

  return {
    ...state,
    turnState: 'challenge',
    activeChallenge: {
      question,
      tileKind: kind,
      incorrectSubmits: 0,
      hintsUsed: 0,
      maxTime,
      userInput: question.starterCode ?? '',
      selectedChoice: null,
      result: null,
      xpAwarded: 0,
      currentHint: 0,
      abandoned: false,
    },
  }
}

function awardCorrect(state: GameState): GameState {
  const ch = state.activeChallenge!
  const player = state.players[state.currentPlayerIdx]
  const xp = calcXP(
    ch.question.type,
    ch.question.difficulty,
    ch.incorrectSubmits,
    ch.hintsUsed,
    player.streak,
  )
  const newStreak = player.streak + 1
  const newPlayers = state.players.map((p, i) =>
    i !== state.currentPlayerIdx ? p : {
      ...p,
      xp: p.xp + xp,
      streak: newStreak,
      seenQuestionIds: [...p.seenQuestionIds, ch.question.id],
    }
  )
  return {
    ...state,
    players: newPlayers,
    activeChallenge: { ...ch, result: 'correct', xpAwarded: xp },
    turnSummary: { xp, message: `+${xp} XP! Streak ×${newStreak}` },
  }
}

function applyTimeout(state: GameState): GameState {
  if (state.turnState !== 'challenge' || !state.activeChallenge) return state
  const ch = state.activeChallenge
  const player = state.players[state.currentPlayerIdx]
  const newHearts = Math.max(0, player.hearts - 1)
  const newPlayers = state.players.map((p, i) =>
    i !== state.currentPlayerIdx ? p : {
      ...p, hearts: newHearts, streak: 0,
      seenQuestionIds: [...p.seenQuestionIds, ch.question.id],
    }
  )
  return {
    ...state,
    players: newPlayers,
    activeChallenge: { ...ch, result: 'incorrect', xpAwarded: 0, abandoned: true },
    turnSummary: { xp: 0, message: "⏰ Time's up! Lost a heart." },
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGame() {
  const [state, setState] = useState<GameState>(INITIAL_STATE)
  const [timeLeft, setTimeLeft] = useState(60)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback((seconds: number) => {
    stopTimer()
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopTimer()
          setState(s => applyTimeout(s))
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, [stopTimer])

  useEffect(() => () => stopTimer(), [stopTimer])

  const startGame = useCallback(() => {
    setState({ ...INITIAL_STATE, phase: 'playing', turnState: 'awaiting_roll' })
  }, [])

  const roll = useCallback(() => {
    setState(s => ({ ...s, turnState: 'rolling' }))
    setTimeout(() => {
      const result = rollDie()
      setState(s => {
        const player = s.players[s.currentPlayerIdx]
        const newSpace = nextSpace(player.space, result)
        return {
          ...s,
          diceResult: result,
          turnState: 'moving',
          players: s.players.map((p, i) =>
            i === s.currentPlayerIdx ? { ...p, space: newSpace } : p
          ),
        }
      })
      setTimeout(() => {
        setState(s => {
          const newState = resolveTile(s)
          if (newState.turnState === 'challenge' && newState.activeChallenge) {
            startTimer(newState.activeChallenge.maxTime)
          }
          return newState
        })
      }, 700)
    }, 1500)
  }, [startTimer])

  const selectChoice = useCallback((choice: 'A' | 'B' | 'C' | 'D') => {
    setState(s => {
      if (!s.activeChallenge || s.activeChallenge.result !== null) return s
      return { ...s, activeChallenge: { ...s.activeChallenge, selectedChoice: choice } }
    })
  }, [])

  const updateCode = useCallback((code: string) => {
    setState(s => {
      if (!s.activeChallenge) return s
      return { ...s, activeChallenge: { ...s.activeChallenge, userInput: code } }
    })
  }, [])

  const submitAnswer = useCallback(() => {
    setState(s => {
      if (s.turnState !== 'challenge' || !s.activeChallenge) return s
      const ch = s.activeChallenge
      const q = ch.question

      let isCorrect = false
      if (q.type === 'QUIZ') {
        isCorrect = ch.selectedChoice === q.correctChoice
      } else if (q.type === 'OUTPUT') {
        isCorrect = ch.userInput.trim() === (q.expectedOutput ?? '').trim()
      } else {
        isCorrect = q.checkAnswer ? q.checkAnswer(ch.userInput) : false
      }

      if (isCorrect) {
        stopTimer()
        return awardCorrect(s)
      }

      return {
        ...s,
        activeChallenge: {
          ...ch,
          incorrectSubmits: ch.incorrectSubmits + 1,
          result: 'incorrect',
        },
      }
    })
  }, [stopTimer])

  const useHint = useCallback(() => {
    setState(s => {
      if (!s.activeChallenge || s.activeChallenge.result !== null) return s
      const ch = s.activeChallenge
      if (ch.currentHint >= 2) return s
      const newHint = (ch.currentHint + 1) as 1 | 2
      return {
        ...s,
        activeChallenge: { ...ch, hintsUsed: ch.hintsUsed + 1, currentHint: newHint },
      }
    })
  }, [])

  const retry = useCallback(() => {
    setState(s => {
      if (!s.activeChallenge || s.activeChallenge.result !== 'incorrect') return s
      const ch = s.activeChallenge
      startTimer(ch.maxTime)
      return { ...s, activeChallenge: { ...ch, result: null, abandoned: false } }
    })
  }, [startTimer])

  const giveUp = useCallback(() => {
    setState(s => {
      if (s.turnState !== 'challenge' || !s.activeChallenge) return s
      stopTimer()
      const ch = s.activeChallenge
      const player = s.players[s.currentPlayerIdx]
      const newHearts = Math.max(0, player.hearts - 1)
      const newPlayers = s.players.map((p, i) =>
        i !== s.currentPlayerIdx ? p : {
          ...p, hearts: newHearts, streak: 0,
          seenQuestionIds: [...p.seenQuestionIds, ch.question.id],
        }
      )
      return {
        ...s,
        players: newPlayers,
        activeChallenge: { ...ch, result: 'incorrect', xpAwarded: 0, abandoned: true },
        turnSummary: { xp: 0, message: 'Challenge skipped. Lost a heart.' },
      }
    })
  }, [stopTimer])

  const continueGame = useCallback(() => {
    stopTimer()
    setState(s => {
      if (s.turnState === 'mystery') return advanceTurn({ ...s, mysteryEvent: null })
      if (s.turnState === 'challenge' && s.activeChallenge?.result === 'correct') {
        return advanceTurn({ ...s, activeChallenge: null })
      }
      if (s.turnState === 'challenge' && s.activeChallenge?.abandoned) {
        return advanceTurn({ ...s, activeChallenge: null })
      }
      if (s.turnState === 'turn_complete') return advanceTurn(s)
      return s
    })
  }, [stopTimer])

  const resetGame = useCallback(() => {
    stopTimer()
    setState({ ...INITIAL_STATE })
  }, [stopTimer])

  return {
    state,
    timeLeft,
    startGame,
    roll,
    selectChoice,
    updateCode,
    submitAnswer,
    useHint,
    retry,
    giveUp,
    continueGame,
    resetGame,
  }
}
