// TypeScript types mirroring the backend API response shapes

export type GameStatus = 'LOBBY' | 'STARTING' | 'ROUND_START' | 'ACTIVE' | 'ROUND_COMPLETE' | 'GAME_COMPLETE' | 'CANCELLED'

export type TurnState =
  | 'WAITING'
  | 'TURN_START'
  | 'AWAITING_ROLL'
  | 'AWAITING_DOUBLE_DICE'
  | 'ROLL_RESOLVED'
  | 'AWAITING_PATH_CHOICE'
  | 'MOVING'
  | 'TILE_RESOLVED'
  | 'CHALLENGE_ACTIVE'
  | 'SUBMISSION_PENDING'
  | 'CHALLENGE_RESOLVED'
  | 'REWARD_RESOLVED'
  | 'MYSTERY_RESOLVING'
  | 'BATTLE_PREPARING'
  | 'BATTLE_ACTIVE'
  | 'TURN_COMPLETE'

export type QuestionType = 'QUIZ' | 'LOGIC' | 'OUTPUT' | 'CODE' | 'DEBUG'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type AllowedAction = 'ROLL_DICE' | 'SELECT_PATH' | 'SUBMIT_ANSWER' | 'RUN_CODE' | 'COMPLETE_TURN' | 'RESOLVE_MYSTERY' | 'SUBMIT_BATTLE'

export interface ReachablePath {
  path_id: string
  node_ids: number[]
  destination_node_id: number
  label: string
}

export interface PowerUps {
  HINT: number
  SHIELD: number
  DOUBLE_DICE: number
  SKIP: number
  DEBUGGER: number
  EXTRA_TEST: number
}

export interface PlayerSnapshot {
  id: string
  seat_number: number
  current_node_id: number
  match_xp: number
  hearts: number
  streak: number
  status: string
  display_name: string
  is_host: boolean
  is_ready: boolean
  power_ups: PowerUps
}

export interface ChallengeSnapshot {
  id: string
  question_version_id: string
  challenge_type: QuestionType
  difficulty: Difficulty
  prompt: string
  instructions: string | null
  choices: Record<string, string> | null
  expires_at: string
  incorrect_submit_count: number
  hints_used: number
  base_xp: number
  is_code_challenge: boolean
}

export interface BattleParticipant {
  player_id: string
  display_name: string
  submitted: boolean
  correct?: boolean
  rank?: number
  xp_awarded?: number
}

export interface BattleSnapshot {
  id: string
  type: '1v1' | 'all'
  status: 'preparing' | 'active' | 'complete'
  countdown_ends_at: string | null
  battle_ends_at: string | null
  participants: BattleParticipant[]
  question?: {
    prompt: string
    instructions: string | null
    choices: Record<string, string> | null
    is_code_challenge: boolean
  }
}

export interface MysteryOutcome {
  category: 'positive' | 'neutral' | 'negative'
  effect: string
  description: string
  xp_delta: number
  spaces_delta: number
  power_up_granted: string | null
}

export interface GameStateSnapshot {
  game_id: string
  game_status: GameStatus
  turn_state: TurnState
  current_round: number
  round_count: number
  current_player_id: string | null
  players: PlayerSnapshot[]
  dice_result: number | null
  double_dice_results: [number, number] | null
  reachable_paths: ReachablePath[]
  active_challenge: ChallengeSnapshot | null
  active_battle: BattleSnapshot | null
  mystery_outcome: MysteryOutcome | null
  allowed_actions: AllowedAction[]
  state_version: number
  last_event_sequence: number
  join_code: string | null
  can_start: boolean
}

export interface TestResult {
  passed: boolean
  output: string
  expected: string
  hidden: boolean
  error: string | null
  hint?: string
}

export interface CodeRunResult {
  results: TestResult[]
  error: string | null
  timedOut: boolean
  public_passed: number
  public_total: number
}

export interface SubmitResponse extends GameStateSnapshot {
  correct: boolean
  awarded_xp: number
  explanation: string | null
  expired?: boolean
  code_results?: TestResult[]
}

export interface CreateGameResponse {
  game_id: string
  player_id: string
  player_token: string
  join_code: string
  message: string
}

export interface JoinGameResponse {
  game_id: string
  player_id: string
  player_token: string
  join_code: string
  snapshot: GameStateSnapshot
  message: string
}

export interface GameResultPlayer extends PlayerSnapshot {
  rank: number
}

export interface GameResults {
  game_id: string
  completed_at: string
  players: GameResultPlayer[]
}

export interface ApiError {
  code: string
  message: string
  recoverable: boolean
}

export class GameApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable: boolean,
    public status: number,
  ) {
    super(message)
    this.name = 'GameApiError'
  }
}
