import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../../codepoly.db')

const sqlite = new Database(DB_PATH)

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

export const db = drizzle(sqlite, { schema })

export function initDb() {
  // Run migrations inline using SQL statements (no separate migration files needed)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS board_nodes (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      node_key INTEGER NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      difficulty TEXT,
      topic TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS board_edges (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL REFERENCES boards(id),
      from_node_id TEXT NOT NULL REFERENCES board_nodes(id),
      to_node_id TEXT NOT NULL REFERENCES board_nodes(id),
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT,
      difficulty TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS question_versions (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id),
      version INTEGER NOT NULL DEFAULT 1,
      prompt TEXT NOT NULL,
      instructions TEXT,
      answer_data TEXT NOT NULL,
      explanation TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'SOLO',
      status TEXT NOT NULL DEFAULT 'LOBBY',
      round_count INTEGER NOT NULL DEFAULT 4,
      current_round INTEGER NOT NULL DEFAULT 1,
      current_player_id TEXT,
      turn_state TEXT NOT NULL DEFAULT 'WAITING',
      state_version INTEGER NOT NULL DEFAULT 0,
      dice_result INTEGER,
      configuration TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      player_token TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      seat_number INTEGER NOT NULL,
      current_node_id TEXT NOT NULL,
      match_xp INTEGER NOT NULL DEFAULT 0,
      hearts INTEGER NOT NULL DEFAULT 3,
      streak INTEGER NOT NULL DEFAULT 0,
      seen_question_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_challenges (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      player_id TEXT NOT NULL REFERENCES game_players(id),
      question_version_id TEXT NOT NULL REFERENCES question_versions(id),
      challenge_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      incorrect_submit_count INTEGER NOT NULL DEFAULT 0,
      hints_used INTEGER NOT NULL DEFAULT 0,
      base_xp INTEGER NOT NULL,
      awarded_xp INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL REFERENCES game_challenges(id),
      player_id TEXT NOT NULL REFERENCES game_players(id),
      answer_payload TEXT NOT NULL,
      correct INTEGER NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_events (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      sequence_number INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_player_id TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS idempotency_records (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      player_id TEXT NOT NULL REFERENCES game_players(id),
      command_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      response_payload TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(game_id, player_id, command_id)
    );

    CREATE INDEX IF NOT EXISTS idx_board_nodes_board ON board_nodes(board_id);
    CREATE INDEX IF NOT EXISTS idx_board_edges_from ON board_edges(from_node_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
    CREATE INDEX IF NOT EXISTS idx_game_players_token ON game_players(player_token);
    CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id, sequence_number);
    CREATE INDEX IF NOT EXISTS idx_idempotency ON idempotency_records(game_id, player_id, command_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_game ON game_challenges(game_id, player_id);
  `)
}

export function runMigrations() {
  const alters = [
    // Phase 1
    'ALTER TABLE games ADD COLUMN join_code TEXT',
    'ALTER TABLE game_players ADD COLUMN is_host INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE game_players ADD COLUMN is_ready INTEGER NOT NULL DEFAULT 0',
    // Phase 3
    'ALTER TABLE game_players ADD COLUMN power_ups TEXT NOT NULL DEFAULT \'{}\'',
    'ALTER TABLE games ADD COLUMN current_battle_id TEXT',
    'ALTER TABLE games ADD COLUMN mystery_outcome TEXT',
    'ALTER TABLE games ADD COLUMN double_dice_results TEXT',
  ]
  for (const stmt of alters) {
    try { sqlite.exec(stmt) } catch { /* column already exists */ }
  }

  const ddls = [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_games_join_code ON games(join_code) WHERE join_code IS NOT NULL',
    `CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id),
      type TEXT NOT NULL DEFAULT 'all',
      status TEXT NOT NULL DEFAULT 'preparing',
      question_version_id TEXT REFERENCES question_versions(id),
      participants TEXT NOT NULL DEFAULT '[]',
      countdown_ends_at TEXT,
      battle_ends_at TEXT,
      results TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    'CREATE INDEX IF NOT EXISTS idx_battles_game ON battles(game_id)',
  ]
  for (const stmt of ddls) {
    try { sqlite.exec(stmt) } catch { /* already exists */ }
  }

  // If board has no MYSTERY nodes, clear board + games for re-seed with new tile types
  const hasMystery = sqlite.prepare("SELECT 1 FROM board_nodes WHERE type = 'MYSTERY' LIMIT 1").get()
  if (!hasMystery) {
    console.log('[Migration] Clearing board for re-seed with MYSTERY/BATTLE/CODE tiles...')
    sqlite.exec("DELETE FROM idempotency_records")
    sqlite.exec("DELETE FROM submissions")
    sqlite.exec("DELETE FROM game_challenges")
    sqlite.exec("DELETE FROM game_events")
    sqlite.exec("DELETE FROM battles")
    sqlite.exec("DELETE FROM game_players")
    sqlite.exec("DELETE FROM games")
    sqlite.exec("DELETE FROM board_edges")
    sqlite.exec("DELETE FROM board_nodes")
    sqlite.exec("DELETE FROM boards")
    // Keep questions and question_versions — they are still valid
  }
}

export { sqlite }
