import { GameError } from '../types.js'
import type { TurnState, AllowedAction } from '../types.js'

// Valid transitions: from state → allowed next states
const TRANSITIONS: Record<TurnState, TurnState[]> = {
  WAITING:               ['TURN_START'],
  TURN_START:            ['AWAITING_ROLL'],
  AWAITING_ROLL:         ['ROLL_RESOLVED'],
  AWAITING_DOUBLE_DICE:  ['ROLL_RESOLVED'],
  ROLL_RESOLVED:         ['AWAITING_PATH_CHOICE', 'MOVING'],
  AWAITING_PATH_CHOICE:  ['MOVING'],
  MOVING:                ['TILE_RESOLVED'],
  TILE_RESOLVED:         ['CHALLENGE_ACTIVE', 'MYSTERY_RESOLVING', 'BATTLE_PREPARING', 'TURN_COMPLETE'],
  CHALLENGE_ACTIVE:      ['SUBMISSION_PENDING', 'TURN_COMPLETE'],
  SUBMISSION_PENDING:    ['CHALLENGE_RESOLVED'],
  CHALLENGE_RESOLVED:    ['REWARD_RESOLVED'],
  REWARD_RESOLVED:       ['TURN_COMPLETE'],
  MYSTERY_RESOLVING:     ['TURN_COMPLETE'],
  BATTLE_PREPARING:      ['BATTLE_ACTIVE'],
  BATTLE_ACTIVE:         ['TURN_COMPLETE'],
  TURN_COMPLETE:         ['TURN_START', 'WAITING'],
}

export function assertTransition(current: TurnState, next: TurnState): void {
  const allowed = TRANSITIONS[current] ?? []
  if (!allowed.includes(next)) {
    throw new GameError(
      'INVALID_GAME_STATE',
      `Cannot transition from ${current} to ${next}`,
      true,
    )
  }
}

// What actions are allowed in each turn state
export function allowedActions(turnState: TurnState): AllowedAction[] {
  switch (turnState) {
    case 'AWAITING_ROLL':
    case 'AWAITING_DOUBLE_DICE':
      return ['ROLL_DICE']
    case 'AWAITING_PATH_CHOICE':
      return ['SELECT_PATH']
    case 'CHALLENGE_ACTIVE':
      return ['SUBMIT_ANSWER', 'RUN_CODE']
    case 'MYSTERY_RESOLVING':
      return ['RESOLVE_MYSTERY']
    case 'BATTLE_ACTIVE':
      return ['SUBMIT_BATTLE']
    case 'TURN_COMPLETE':
    case 'REWARD_RESOLVED':
      return ['COMPLETE_TURN']
    default:
      return []
  }
}

export function assertAction(turnState: TurnState, action: AllowedAction): void {
  const allowed = allowedActions(turnState)
  if (!allowed.includes(action)) {
    const code = action === 'ROLL_DICE' && turnState !== 'AWAITING_ROLL'
      ? 'ALREADY_ROLLED'
      : 'INVALID_GAME_STATE'
    throw new GameError(code, `Action ${action} is not allowed in state ${turnState}`, true)
  }
}
