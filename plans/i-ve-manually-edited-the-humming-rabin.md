# Codepoly — Phase 1 Backend Foundation

## Context

The current app is a pure React + Vite + Tailwind frontend with all game logic living client-side (`useGame.ts`, `engine.ts`). This is fine for a prototype but violates the server-authoritative rule: dice rolls use `Math.random()`, XP is calculated in the browser, and there is no persistence — refreshing destroys all game state.

Phase 1 builds a real backend that owns every authoritative game decision, persists state to SQLite, and exposes a REST API the existing frontend can consume. The visual UI does not change.

---

## Architecture chosen

| Layer | Technology | Rationale |
|---|---|---|
| HTTP server | **Hono** (TypeScript) | Lightweight, zero-dep, TypeScript-first, no config overhead |
| Database | **SQLite** (file-based) | No separate server process; perfect for single-container dev |
| ORM | **Drizzle ORM** | TypeScript-first, excellent SQLite support, SQL-transparent |
| Test runner | **Vitest** | Already in Vite ecosystem; shares tsconfig |
| Auth | **Bearer token** (UUID) | Returned on game creation; required on all mutations |
| Dev proxy | **Vite `server.proxy`** | Forwards `/api/*` → `localhost:3001` so frontend needs no CORS config |

---

## Files to create

### Backend (`server/`)
```
server/index.ts              Hono app, routes registration, listen on port 3001
server/types.ts              Shared error codes, API response shapes, GameError class
server/db/schema.ts          Drizzle table definitions (10 tables)
server/db/client.ts          SQLite connection singleton; runs migrations on startup
server/db/migrate.ts         Migration runner (reads schema, applies to DB)
server/db/seed.ts            Seeds board (32 nodes + edges + fork) and 30 questions
server/game/engine.ts        Server-side dice (crypto.randomInt), XP formula, streak
server/game/board.ts         Graph traversal — computes reachable nodes N steps away
server/game/stateMachine.ts  Turn state transitions; rejects invalid moves
server/game/questions.ts     Question selection (type, difficulty, seen-filter)
server/routes/games.ts       POST /games, POST /games/:id/start, GET /games/:id/state, GET /games/:id/results
server/routes/actions.ts     POST /games/:id/actions/roll, POST /games/:id/actions/path
server/routes/challenges.ts  POST /games/:id/challenges/:cid/submit
server/middleware/auth.ts    Verifies Authorization: Bearer <token> → resolves game_player
server/middleware/idempotency.ts  command_id lookup / store in idempotency_records
server/__tests__/engine.test.ts       Unit: dice range, XP table, attempt penalty, streak
server/__tests__/board.test.ts        Unit: graph traversal, branch detection
server/__tests__/stateMachine.test.ts Unit: valid/invalid state transitions
server/__tests__/questions.test.ts    Unit: selection, no-repeat, pool exhaustion
server/__tests__/api.test.ts          Integration: full solo game flow (HTTP requests)
server/__tests__/concurrency.test.ts  Concurrency: double-roll, duplicate command_id
server/__tests__/e2e.test.ts          E2E: create → start → 4 rounds → game complete
```

### Frontend (`src/`)
```
src/api/client.ts       Typed fetch wrapper; adds Authorization header; throws GameApiError
src/api/types.ts        TypeScript types mirroring API responses
src/game/useGameApi.ts  New hook replacing useGame.ts; all state comes from backend
```

---

## Files to modify

| File | Change |
|---|---|
| `package.json` | Add deps + scripts (`server`, `dev:all`) |
| `vite.config.ts` | Add `server.proxy` for `/api` → `localhost:3001` |
| `src/App.tsx` | Import `useGameApi` instead of `useGame`; add `command_id` (uuid) to roll/submit calls; add `allowed_actions` gating |

**`src/game/useGame.ts` and `src/game/engine.ts` are NOT deleted** — they remain as reference. Only the import in `App.tsx` changes.

---

## Database schema (10 tables)

```
boards           id, name, version, active
board_nodes      id, board_id, node_key (0–31), type, label, difficulty, topic, metadata
board_edges      id, board_id, from_node_id, to_node_id, metadata
questions        id, type, topic, subtopic, difficulty, active
question_versions  id, question_id, version, prompt, instructions, answer_data (JSON), explanation
games            id, mode, status, round_count, current_round, current_player_id,
                 turn_state, state_version, configuration (JSON),
                 created_at, started_at, completed_at
game_players     id, game_id, player_token (UUID — bearer auth), seat_number,
                 current_node_id, match_xp, hearts, streak, status, joined_at
game_challenges  id, game_id, player_id, question_version_id, challenge_type, difficulty,
                 status, started_at, expires_at, incorrect_submit_count, hints_used,
                 base_xp, awarded_xp, resolved_at
submissions      id, challenge_id, player_id, answer_payload (JSON), correct, submitted_at
game_events      id, game_id, sequence_number (auto-increment per game), event_type,
                 actor_player_id, payload (JSON), created_at
idempotency_records  id, game_id, player_id, command_id, action_type, response_payload (JSON), created_at
```

---

## Board seed (32 nodes, one fork)

Nodes mirror the existing `SPACES` array in `App.tsx`. Node 4 is the fork node (LOGIC type); two edges leave it — one continues the ring (to node 5), one is the fork branch (to node 8, rejoining the ring). For Phase 1 the fork choice is presented to the player when dice roll lands on node 4 with >0 remaining steps past it.

Node types that map to challenge questions: QUIZ, LOGIC, OUTPUT, CODE, DEBUG, BOSS.
Corners (nodes 0, 9, 16, 25) trigger no challenge.

---

## 30 seed questions

- 10 QUIZ (easy/medium/hard mix) — variables, booleans, operators, comparisons
- 10 LOGIC (easy/medium/hard mix) — if/else, range, basic loops
- 10 OUTPUT (easy/medium/hard mix) — output prediction from simple Python snippets

All questions include: correct answer, explanation, learning_objective. Stored in `question_versions.answer_data` as JSON. For QUIZ: `{ type: "QUIZ", choices: {A,B,C,D}, correct_choice: "B" }`. For OUTPUT: `{ type: "OUTPUT", expected_output: "..." }`.

---

## Key implementation details

### Dice (server-side)
```ts
import { randomInt } from 'crypto'
const roll = randomInt(1, 7) // 1–6 inclusive, cryptographically random
```

### XP formula (mirrors spec exactly)
```ts
xp_before_streak = base_xp * attempt_multiplier   // 1.0 / 0.9 / 0.8 / 0.7
final_xp = round(xp_before_streak * (1 + streak_bonus))
// streak_bonus: 0% / 5% / 10% / 15% / 20%
```

### State machine guard pattern
```ts
function assertTurnState(game, expected, errorCode) {
  if (game.turn_state !== expected) throw new GameError(errorCode, 'INVALID_GAME_STATE')
}
```

### Idempotency
Every mutation endpoint first queries `idempotency_records` by `(game_id, player_id, command_id)`. If found, return `response_payload` directly. If not, execute action, store result, then return it.

### Atomic challenge resolution
All of: mark submission, evaluate correctness, update streak, award XP, update game_challenges, append game_events, advance turn_state — inside a single `db.transaction(() => {...})` call.

### Authorization
`game_players.player_token` is returned once on `POST /games`. The client stores it in `sessionStorage`. Every subsequent request includes `Authorization: Bearer <token>`. The auth middleware resolves the `game_player` record and attaches it to the request context.

---

## API endpoints

```
POST   /api/games                                  Create game (returns game_id + player_token)
POST   /api/games/:id/start                        Start game (selects starting player)
GET    /api/games/:id/state                        Get authoritative game state
POST   /api/games/:id/actions/roll                 Roll dice (requires command_id)
POST   /api/games/:id/actions/path                 Choose path at fork (requires command_id)
POST   /api/games/:id/challenges/:cid/submit       Submit answer (requires command_id)
GET    /api/games/:id/results                      Final results after GAME_COMPLETE
```

All mutations return the updated game state snapshot including `allowed_actions`.

---

## Frontend hook (`useGameApi.ts`)

The hook maintains a local mirror of the server state (`GameApiState`) fetched after each action. It exposes the same surface as `useGame` so `App.tsx` changes are minimal:

```ts
const { state, timeLeft, startGame, roll, selectChoice, submitAnswer, continueGame } = useGameApi()
```

Differences from `useGame`:
- `roll()` sends `POST /api/games/:id/actions/roll` with `command_id: uuid()`; no `Math.random()`
- `submitAnswer()` sends `POST /api/games/:id/challenges/:cid/submit`; backend returns correctness
- Timer still runs client-side (UI countdown) but the backend has `expires_at` as ground truth
- `allowed_actions` array gates button rendering (replaces React-inferred state checks)
- On mount, calls `GET /api/games/:id/state` to restore after browser refresh

`game_id` and `player_token` are stored in `sessionStorage` so refresh re-attaches.

---

## Package additions

```bash
pnpm add hono better-sqlite3 drizzle-orm uuid
pnpm add -D @types/better-sqlite3 @types/uuid drizzle-kit tsx concurrently vitest @vitest/ui
```

New `package.json` scripts:
```json
"server": "tsx watch server/index.ts",
"dev:all": "concurrently \"pnpm dev\" \"pnpm server\"",
"test": "vitest run",
"db:seed": "tsx server/db/seed.ts"
```

---

## Vite proxy

In `vite.config.ts`:
```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true }
  }
}
```

---

## Tests

| File | What it tests |
|---|---|
| `engine.test.ts` | dice always 1–6; XP table values; attempt multipliers; streak thresholds |
| `board.test.ts` | reachable nodes at 1–6 steps; fork detection at node 4; wraparound at node 31 |
| `stateMachine.test.ts` | valid transitions; rejection of SUBMIT while AWAITING_ROLL |
| `questions.test.ts` | type filter; no-repeat within game; pool exhaustion fallback |
| `api.test.ts` | full HTTP integration: create → start → roll → (optional path) → challenge → submit → turn complete |
| `concurrency.test.ts` | same command_id returns same result; double roll is a no-op |
| `e2e.test.ts` | 4 complete rounds; monotonic event sequence; no duplicate XP |

---

## Verification

1. `pnpm add ...` installs cleanly
2. `pnpm db:seed` runs without error; SQLite file created
3. `pnpm dev:all` starts both servers
4. Browser loads at preview URL — existing UI unchanged
5. Create Solo game → player_token stored in sessionStorage
6. Roll dice → result comes from server response, not Math.random
7. Browser refresh → game state restored from `GET /api/games/:id/state`
8. `pnpm test` — all test suites pass
9. `npx tsc --noEmit` — zero TypeScript errors
