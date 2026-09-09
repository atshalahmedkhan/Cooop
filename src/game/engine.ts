import { QUESTIONS, MYSTERY_EVENTS } from './questions'
import type { Difficulty, QuestionType, Question, MysteryEvent } from './questions'

// ── XP table (from game-logic spec) ────────────────────────────────────────

const BASE_XP: Record<QuestionType, Record<Difficulty, number>> = {
  QUIZ:   { easy: 40, medium: 60,  hard: 80  },
  OUTPUT: { easy: 50, medium: 80,  hard: 120 },
  CODE:   { easy: 60, medium: 100, hard: 160 },
  DEBUG:  { easy: 70, medium: 110, hard: 170 },
}

function attemptMult(n: number): number {
  if (n === 0) return 1.0
  if (n === 1) return 0.9
  if (n === 2) return 0.8
  return 0.7
}

function hintMult(n: number): number {
  if (n === 0) return 1.0
  if (n === 1) return 0.85
  return 0.70
}

function streakBonus(n: number): number {
  if (n >= 7) return 0.20
  if (n >= 5) return 0.15
  if (n >= 3) return 0.10
  if (n >= 2) return 0.05
  return 0
}

// Canonical XP formula from spec section 15
export function calcXP(
  type: QuestionType,
  difficulty: Difficulty,
  incorrectSubmits: number,
  hintsUsed: number,
  streak: number,
): number {
  const base = BASE_XP[type][difficulty]
  const perf = Math.max(0.5, attemptMult(incorrectSubmits) * hintMult(Math.min(hintsUsed, 2)))
  return Math.round(base * perf * (1 + streakBonus(streak)))
}

export function getBaseXP(type: QuestionType, difficulty: Difficulty): number {
  return BASE_XP[type][difficulty]
}

// ── Dice ────────────────────────────────────────────────────────────────────

export function rollDie(): number {
  return Math.ceil(Math.random() * 6)
}

// ── Board movement ──────────────────────────────────────────────────────────

const BOARD_SIZE = 32

export function nextSpace(current: number, steps: number): number {
  return ((current + steps) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE
}

// ── Board space kinds (mirrors SPACES array in App.tsx) ────────────────────

export type TileKind = 'CODE' | 'QUIZ' | 'DEBUG' | 'LOGIC' | 'MYSTERY' | 'BATTLE' | 'BOSS' | 'CORNER'

export const SPACE_KINDS: TileKind[] = [
  'CORNER', 'CODE',  'QUIZ',  'DEBUG', 'LOGIC', 'MYSTERY', 'CODE', 'BATTLE', 'QUIZ',
  'CORNER', 'CODE',  'DEBUG', 'LOGIC', 'MYSTERY', 'QUIZ', 'CODE',
  'CORNER', 'BOSS',  'BATTLE','CODE',  'QUIZ',  'DEBUG', 'LOGIC', 'MYSTERY', 'CODE',
  'CORNER', 'QUIZ',  'CODE',  'LOGIC', 'DEBUG', 'MYSTERY', 'BATTLE',
]

// ── Question selection ──────────────────────────────────────────────────────

export function tileKindToQuestionType(kind: TileKind): QuestionType {
  const map: Partial<Record<TileKind, QuestionType>> = {
    CODE:   'CODE',
    QUIZ:   'QUIZ',
    DEBUG:  'DEBUG',
    LOGIC:  'OUTPUT',
    BATTLE: 'CODE',
    BOSS:   'DEBUG',
  }
  return map[kind] ?? 'QUIZ'
}

export function pickQuestion(
  type: QuestionType,
  seenIds: string[],
  round: number,
): Question | null {
  let pool = QUESTIONS.filter(q => q.type === type && !seenIds.includes(q.id))

  // Round 1: prefer easy; Round 2: avoid hard; Round 3+: open
  if (round === 1) {
    const easy = pool.filter(q => q.difficulty === 'easy')
    if (easy.length > 0) pool = easy
  } else if (round === 2) {
    const notHard = pool.filter(q => q.difficulty !== 'hard')
    if (notHard.length > 0) pool = notHard
  }

  // Fall back to all questions of this type if pool is empty
  if (pool.length === 0) pool = QUESTIONS.filter(q => q.type === type)
  if (pool.length === 0) return null

  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Mystery event selection ─────────────────────────────────────────────────
// Distribution: ~60% positive, ~25% neutral, ~15% negative (per spec §26)

const MYSTERY_WEIGHTS = [3, 2, 2, 1, 2, 2, 2, 1, 1, 2]

export function pickMysteryEvent(): MysteryEvent {
  const total = MYSTERY_WEIGHTS.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total
  for (let i = 0; i < MYSTERY_EVENTS.length; i++) {
    rand -= MYSTERY_WEIGHTS[i]
    if (rand <= 0) return MYSTERY_EVENTS[i]
  }
  return MYSTERY_EVENTS[0]
}

// ── Timer durations (Standard mode, spec §24) ─────────────────────────────

export function timerForType(type: QuestionType): number {
  return type === 'CODE' || type === 'DEBUG' ? 120 : 60
}
