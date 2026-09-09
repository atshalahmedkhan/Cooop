import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  real,
} from 'drizzle-orm/sqlite-core'

// ── Boards ──────────────────────────────────────────────────────────────────

export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: integer('version').notNull().default(1),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const board_nodes = sqliteTable('board_nodes', {
  id: text('id').primaryKey(),
  board_id: text('board_id').notNull().references(() => boards.id),
  node_key: integer('node_key').notNull(),
  type: text('type').notNull(),
  label: text('label').notNull(),
  difficulty: text('difficulty'),
  topic: text('topic'),
  metadata: text('metadata', { mode: 'json' }),
})

export const board_edges = sqliteTable('board_edges', {
  id: text('id').primaryKey(),
  board_id: text('board_id').notNull().references(() => boards.id),
  from_node_id: text('from_node_id').notNull().references(() => board_nodes.id),
  to_node_id: text('to_node_id').notNull().references(() => board_nodes.id),
  metadata: text('metadata', { mode: 'json' }),
})

// ── Questions ────────────────────────────────────────────────────────────────

export const questions = sqliteTable('questions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  topic: text('topic').notNull(),
  subtopic: text('subtopic'),
  difficulty: text('difficulty').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
})

export const question_versions = sqliteTable('question_versions', {
  id: text('id').primaryKey(),
  question_id: text('question_id').notNull().references(() => questions.id),
  version: integer('version').notNull().default(1),
  prompt: text('prompt').notNull(),
  instructions: text('instructions'),
  answer_data: text('answer_data', { mode: 'json' }).notNull(),
  explanation: text('explanation').notNull(),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Games ────────────────────────────────────────────────────────────────────

export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  join_code: text('join_code'),
  mode: text('mode').notNull().default('SOLO'),
  status: text('status').notNull().default('LOBBY'),
  round_count: integer('round_count').notNull().default(4),
  current_round: integer('current_round').notNull().default(1),
  current_player_id: text('current_player_id'),
  turn_state: text('turn_state').notNull().default('WAITING'),
  state_version: integer('state_version').notNull().default(0),
  dice_result: integer('dice_result'),
  configuration: text('configuration', { mode: 'json' }).notNull(),
  current_battle_id: text('current_battle_id'),
  mystery_outcome: text('mystery_outcome'),
  double_dice_results: text('double_dice_results'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
  started_at: text('started_at'),
  completed_at: text('completed_at'),
})

export const game_players = sqliteTable('game_players', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id),
  player_token: text('player_token').notNull().unique(),
  display_name: text('display_name').notNull(),
  seat_number: integer('seat_number').notNull(),
  current_node_id: text('current_node_id').notNull(),
  match_xp: integer('match_xp').notNull().default(0),
  hearts: integer('hearts').notNull().default(3),
  streak: integer('streak').notNull().default(0),
  seen_question_ids: text('seen_question_ids', { mode: 'json' }).notNull().default(sql`'[]'`),
  is_host: integer('is_host', { mode: 'boolean' }).notNull().default(false),
  is_ready: integer('is_ready', { mode: 'boolean' }).notNull().default(false),
  status: text('status').notNull().default('ACTIVE'),
  power_ups: text('power_ups').notNull().default('{}'),
  joined_at: text('joined_at').notNull().default(sql`(datetime('now'))`),
  last_seen_at: text('last_seen_at').notNull().default(sql`(datetime('now'))`),
})

// ── Challenges ───────────────────────────────────────────────────────────────

export const game_challenges = sqliteTable('game_challenges', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id),
  player_id: text('player_id').notNull().references(() => game_players.id),
  question_version_id: text('question_version_id').notNull().references(() => question_versions.id),
  challenge_type: text('challenge_type').notNull(),
  difficulty: text('difficulty').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  started_at: text('started_at').notNull().default(sql`(datetime('now'))`),
  expires_at: text('expires_at').notNull(),
  incorrect_submit_count: integer('incorrect_submit_count').notNull().default(0),
  hints_used: integer('hints_used').notNull().default(0),
  base_xp: integer('base_xp').notNull(),
  awarded_xp: integer('awarded_xp').notNull().default(0),
  resolved_at: text('resolved_at'),
})

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  challenge_id: text('challenge_id').notNull().references(() => game_challenges.id),
  player_id: text('player_id').notNull().references(() => game_players.id),
  answer_payload: text('answer_payload', { mode: 'json' }).notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  submitted_at: text('submitted_at').notNull().default(sql`(datetime('now'))`),
})

// ── Events ───────────────────────────────────────────────────────────────────

export const game_events = sqliteTable('game_events', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id),
  sequence_number: integer('sequence_number').notNull(),
  event_type: text('event_type').notNull(),
  actor_player_id: text('actor_player_id'),
  payload: text('payload', { mode: 'json' }).notNull(),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Battles ──────────────────────────────────────────────────────────────────

export const battles = sqliteTable('battles', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id),
  type: text('type').notNull().default('all'), // '1v1' | 'all'
  status: text('status').notNull().default('preparing'), // 'preparing'|'active'|'complete'
  question_version_id: text('question_version_id').references(() => question_versions.id),
  participants: text('participants', { mode: 'json' }).notNull().default(sql`'[]'`),
  countdown_ends_at: text('countdown_ends_at'),
  battle_ends_at: text('battle_ends_at'),
  results: text('results', { mode: 'json' }).notNull().default(sql`'[]'`),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Idempotency ──────────────────────────────────────────────────────────────

export const idempotency_records = sqliteTable('idempotency_records', {
  id: text('id').primaryKey(),
  game_id: text('game_id').notNull().references(() => games.id),
  player_id: text('player_id').notNull().references(() => game_players.id),
  command_id: text('command_id').notNull(),
  action_type: text('action_type').notNull(),
  response_payload: text('response_payload', { mode: 'json' }).notNull(),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// Type exports for use in routes/game logic
export type Battle = typeof battles.$inferSelect
export type Board = typeof boards.$inferSelect
export type BoardNode = typeof board_nodes.$inferSelect
export type BoardEdge = typeof board_edges.$inferSelect
export type Question = typeof questions.$inferSelect
export type QuestionVersion = typeof question_versions.$inferSelect
export type Game = typeof games.$inferSelect
export type GamePlayer = typeof game_players.$inferSelect
export type GameChallenge = typeof game_challenges.$inferSelect
export type Submission = typeof submissions.$inferSelect
export type GameEvent = typeof game_events.$inferSelect
export type IdempotencyRecord = typeof idempotency_records.$inferSelect
