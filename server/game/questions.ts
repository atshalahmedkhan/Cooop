import { db } from '../db/client.js'
import { questions, question_versions } from '../db/schema.js'
import { eq, and, inArray, notInArray } from 'drizzle-orm'
import type { QuestionType, Difficulty } from '../types.js'
import { GameError } from '../types.js'
import { getBaseXP } from './engine.js'

export interface SelectedQuestion {
  questionVersionId: string
  type: QuestionType
  difficulty: Difficulty
  prompt: string
  instructions: string | null
  answerData: Record<string, unknown>
  explanation: string
  baseXP: number
}

export async function selectQuestion(
  type: QuestionType,
  seenVersionIds: string[],
  round: number,
): Promise<SelectedQuestion> {
  // Build base query: active questions of this type
  let pool = db
    .select({
      qvId: question_versions.id,
      type: questions.type,
      difficulty: questions.difficulty,
      prompt: question_versions.prompt,
      instructions: question_versions.instructions,
      answer_data: question_versions.answer_data,
      explanation: question_versions.explanation,
    })
    .from(question_versions)
    .innerJoin(questions, eq(question_versions.question_id, questions.id))
    .where(and(eq(questions.type, type), eq(questions.active, true)))
    .all()

  // Filter out already-seen question versions
  let candidates = pool.filter(q => !seenVersionIds.includes(q.qvId))

  // Round-based difficulty preference
  if (round === 1) {
    const easy = candidates.filter(q => q.difficulty === 'easy')
    if (easy.length > 0) candidates = easy
  } else if (round === 2) {
    const notHard = candidates.filter(q => q.difficulty !== 'hard')
    if (notHard.length > 0) candidates = notHard
  }
  // Round 3+: open pool

  // Fall back to full pool if no candidates
  if (candidates.length === 0) candidates = pool
  if (candidates.length === 0) {
    throw new GameError('QUESTION_UNAVAILABLE', `No questions available for type ${type}`, false)
  }

  const pick = candidates[Math.floor(Math.random() * candidates.length)]

  return {
    questionVersionId: pick.qvId,
    type: pick.type as QuestionType,
    difficulty: pick.difficulty as Difficulty,
    prompt: pick.prompt,
    instructions: pick.instructions,
    answerData: pick.answer_data as Record<string, unknown>,
    explanation: pick.explanation,
    baseXP: getBaseXP(pick.type as QuestionType, pick.difficulty as Difficulty),
  }
}
