import { randomInt } from 'node:crypto'
import type { QuestionType, Difficulty } from '../types.js'

export function rollDie(): number {
  return randomInt(1, 7) // cryptographically random 1-6
}

// ── XP tables ────────────────────────────────────────────────────────────────

const BASE_XP: Record<QuestionType, Record<Difficulty, number>> = {
  QUIZ:   { easy: 40,  medium: 60,  hard: 80  },
  LOGIC:  { easy: 50,  medium: 80,  hard: 120 },
  OUTPUT: { easy: 50,  medium: 80,  hard: 120 },
  CODE:   { easy: 80,  medium: 130, hard: 200 },
  DEBUG:  { easy: 70,  medium: 110, hard: 170 },
}

export function getBaseXP(type: QuestionType, difficulty: Difficulty): number {
  return BASE_XP[type]?.[difficulty] ?? 50
}

export function attemptMultiplier(incorrectSubmits: number): number {
  if (incorrectSubmits === 0) return 1.0
  if (incorrectSubmits === 1) return 0.9
  if (incorrectSubmits === 2) return 0.8
  return 0.7
}

export function streakBonus(streak: number): number {
  if (streak >= 7) return 0.20
  if (streak >= 5) return 0.15
  if (streak >= 3) return 0.10
  if (streak >= 2) return 0.05
  return 0
}

export function calcXP(
  type: QuestionType,
  difficulty: Difficulty,
  incorrectSubmits: number,
  streak: number,
): number {
  const base = getBaseXP(type, difficulty)
  const total = base * attemptMultiplier(incorrectSubmits) * (1 + streakBonus(streak))
  return Math.round(total)
}

// ── Timers ────────────────────────────────────────────────────────────────────

export function timerForType(type: QuestionType): number {
  switch (type) {
    case 'CODE':   return 120
    case 'DEBUG':  return 90
    case 'LOGIC':
    case 'OUTPUT': return 75
    default:       return 60
  }
}

// ── Answer evaluation (QUIZ / LOGIC / OUTPUT only) ───────────────────────────
// CODE/DEBUG are evaluated by the Python execution sandbox — not here.

export function evaluateAnswer(
  answerData: Record<string, unknown>,
  submission: Record<string, unknown>,
): boolean {
  if (typeof answerData.correct_choice === 'string') {
    // QUIZ / LOGIC: multiple choice
    const given = String(submission.choice ?? '').trim().toUpperCase()
    return given === String(answerData.correct_choice).toUpperCase()
  }
  if (typeof answerData.expected_output === 'string') {
    // OUTPUT: exact string match (trimmed)
    const expected = String(answerData.expected_output).trim()
    const given = String(submission.output ?? '').trim()
    return given === expected
  }
  return false
}

// ── Tile → question type mapping ─────────────────────────────────────────────

export function nodeTypeToQuestionType(nodeType: string): QuestionType | null {
  switch (nodeType) {
    case 'QUIZ':    return 'QUIZ'
    case 'LOGIC':   return 'LOGIC'
    case 'OUTPUT':  return 'OUTPUT'
    case 'CODE':    return 'CODE'
    case 'DEBUG':   return 'DEBUG'
    default:        return null
  }
}

export function isCodeChallenge(type: QuestionType): boolean {
  return type === 'CODE' || type === 'DEBUG'
}

// ── Battle XP schedule ────────────────────────────────────────────────────────

const BATTLE_RANK_PCT = [1.0, 0.80, 0.65, 0.50]

export function calcBattleXP(baseXP: number, rank: number): number {
  if (rank === 0) return 0
  const pct = BATTLE_RANK_PCT[rank - 1] ?? 0.50
  return Math.round(baseXP * pct)
}

// ── Mystery tile outcomes ─────────────────────────────────────────────────────

export interface MysteryOutcome {
  category: 'positive' | 'neutral' | 'negative'
  effect: string
  description: string
  xp_delta: number
  spaces_delta: number
  power_up_granted: string | null
}

const MYSTERY_POOL: MysteryOutcome[] = [
  { category: 'positive', effect: 'XP_BONUS',      description: '+25 XP bonus!',         xp_delta: 25,  spaces_delta: 0,  power_up_granted: null },
  { category: 'positive', effect: 'XP_BONUS',      description: '+50 XP bonus!',         xp_delta: 50,  spaces_delta: 0,  power_up_granted: null },
  { category: 'positive', effect: 'XP_BONUS',      description: '+75 XP bonus!',         xp_delta: 75,  spaces_delta: 0,  power_up_granted: null },
  { category: 'positive', effect: 'POWER_UP',      description: 'You found a Hint!',     xp_delta: 0,   spaces_delta: 0,  power_up_granted: 'HINT' },
  { category: 'positive', effect: 'POWER_UP',      description: 'Skip acquired!',        xp_delta: 0,   spaces_delta: 0,  power_up_granted: 'SKIP' },
  { category: 'positive', effect: 'POWER_UP',      description: 'Double Dice acquired!', xp_delta: 0,   spaces_delta: 0,  power_up_granted: 'DOUBLE_DICE' },
  { category: 'positive', effect: 'POWER_UP',      description: 'Shield acquired!',      xp_delta: 0,   spaces_delta: 0,  power_up_granted: 'SHIELD' },
  { category: 'positive', effect: 'MOVE_FORWARD',  description: 'Move forward 1 space!', xp_delta: 0,   spaces_delta: 1,  power_up_granted: null },
  { category: 'neutral',  effect: 'NOTHING',       description: 'Nothing happens…',      xp_delta: 0,   spaces_delta: 0,  power_up_granted: null },
  { category: 'neutral',  effect: 'NOTHING',       description: 'The stars are quiet.',  xp_delta: 0,   spaces_delta: 0,  power_up_granted: null },
  { category: 'neutral',  effect: 'XP_BONUS',      description: '+10 XP',                xp_delta: 10,  spaces_delta: 0,  power_up_granted: null },
  { category: 'negative', effect: 'XP_LOSS',       description: '-15 XP penalty.',       xp_delta: -15, spaces_delta: 0,  power_up_granted: null },
  { category: 'negative', effect: 'MOVE_BACK',     description: 'Move back 1 space.',    xp_delta: 0,   spaces_delta: -1, power_up_granted: null },
  { category: 'negative', effect: 'MOVE_BACK',     description: 'Move back 2 spaces.',   xp_delta: 0,   spaces_delta: -2, power_up_granted: null },
]

const MYSTERY_WEIGHTS = [8, 8, 8, 6, 6, 6, 6, 4, 4, 4, 3, 3, 2, 2]

export function pickMysteryOutcome(): MysteryOutcome {
  const total = MYSTERY_WEIGHTS.reduce((a, b) => a + b, 0)
  let r = randomInt(0, total)
  for (let i = 0; i < MYSTERY_POOL.length; i++) {
    r -= MYSTERY_WEIGHTS[i]
    if (r < 0) return MYSTERY_POOL[i]
  }
  return MYSTERY_POOL[0]
}
