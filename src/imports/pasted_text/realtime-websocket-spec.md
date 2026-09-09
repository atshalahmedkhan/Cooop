Continue development of the existing **Codepoly** project inside Figma Make.

IMPORTANT CURRENT STATE:

The following already works and MUST NOT be rebuilt from scratch:

* Hono backend on port 3001
* SQLite + Drizzle
* React + Vite + Tailwind frontend
* 32-space NES/retro board
* Create Game
* 6-character join codes
* Join by code + display name
* Lobby
* Ready / Unready
* Host-only Start
* 1–4 player turn rotation
* Seat-order turns
* Round tracking
* Game-over detection
* Server-authoritative dice
* Idempotent actions
* Fork-path board movement
* QUIZ / LOGIC / OUTPUT challenges
* timers
* backend-calculated XP
* backend-calculated streaks
* persisted game state
* refresh/session restore
* winner screen

DO NOT redesign the UI.

DO NOT replace working game logic.

DO NOT migrate away from Hono, SQLite, Drizzle, React, Vite, or Tailwind.

The goal of this phase is ONLY:

# REAL-TIME MULTIPLAYER WITH WEBSOCKETS

Current limitation:

Lobby polls every 2 seconds.

Players do not receive live game-state updates.

Non-active players see stale state until refresh.

Fix this completely.

---

# GOAL

If Player 1 rolls a dice:

Players 2, 3, and 4 should see the dice result almost immediately.

If Player 1 moves:

everyone should see the movement.

If Player 1 earns XP:

everyone should see the XP update.

If a player joins:

everyone in the lobby sees them instantly.

If someone Readies:

everyone sees it instantly.

If the turn changes:

everyone sees it instantly.

No manual refresh.

No 2-second polling.

The multiplayer experience should feel like a real online game.

---

# 1. REMOVE LOBBY POLLING

Find the existing lobby polling implementation.

It currently refreshes roughly every 2 seconds.

Replace polling with WebSocket events.

Do not keep polling as the normal realtime mechanism.

You may retain a very low-frequency recovery fallback only if technically useful, but realtime behavior must be WebSocket-driven.

---

# 2. ADD WEBSOCKET SERVER

Use the WebSocket approach most compatible with the current:

* Hono
* Node
* Vite

architecture.

Do NOT create an unnecessary second backend framework.

Do NOT migrate away from Hono.

Create a clean realtime module such as:

```text
/server/realtime/
  websocket.ts
  rooms.ts
  connections.ts
  protocol.ts
  events.ts
  presence.ts
  reconnect.ts
```

Adapt names to the existing codebase.

---

# 3. GAME ROOMS

Each active game should have a realtime room.

Conceptually:

```text
GAME ABC123
├── Player 1 socket
├── Player 2 socket
├── Player 3 socket
└── Player 4 socket
```

Use efficient in-memory connection mapping for socket transport.

Example concept:

```ts
Map<gameId, Set<Connection>>
```

BUT:

authoritative game state must remain persisted in SQLite.

Do NOT make WebSocket memory the only source of truth.

If backend restarts:

game state should still exist.

---

# 4. WEBSOCKET CONNECTION FLOW

When a player opens or reconnects to an active game:

1. authenticate/resolve guest session
2. verify player belongs to game
3. connect WebSocket
4. join game room
5. send authoritative snapshot
6. begin realtime events

Frontend should not manually recreate game state from local assumptions.

---

# 5. INITIAL SNAPSHOT

On initial socket connection send:

```json
{
  "type": "GAME_SNAPSHOT",
  "gameId": "...",
  "seq": 40,
  "payload": {
    "status": "ACTIVE",
    "round": 2,
    "currentPlayerId": "...",
    "turnState": "AWAITING_ROLL",
    "players": [],
    "positions": {},
    "xp": {},
    "streaks": {},
    "activeChallenge": null,
    "allowedActions": []
  }
}
```

Use the existing snapshot/game serialization layer if possible.

Do not duplicate serialization logic.

---

# 6. EVENT PROTOCOL

Every event should follow one consistent envelope.

Example:

```json
{
  "type": "DICE_ROLLED",
  "gameId": "...",
  "seq": 41,
  "serverTs": 1760000000000,
  "payload": {}
}
```

Required:

* type
* gameId
* seq
* server timestamp
* payload

Every game should have a monotonically increasing sequence number.

---

# 7. EVENTS TO IMPLEMENT

Lobby:

```text
PLAYER_JOINED
PLAYER_LEFT
PLAYER_READY
PLAYER_UNREADY
HOST_CHANGED
```

Game:

```text
GAME_STARTED
ROUND_STARTED
TURN_STARTED

DICE_ROLLED

PATH_CHOICE_REQUIRED
PATH_SELECTED

PLAYER_MOVED

CHALLENGE_STARTED
CHALLENGE_SUBMITTED
CHALLENGE_RESOLVED

XP_AWARDED
STREAK_UPDATED

TURN_COMPLETED
ROUND_COMPLETED

PLAYER_DISCONNECTED
PLAYER_RECONNECTED

GAME_COMPLETED
```

Use existing backend events if they already exist.

Do not create duplicate competing event systems.

---

# 8. FRONTEND COMMANDS

Frontend should send user intent.

Example:

```json
{
  "type": "ROLL_DICE",
  "commandId": "uuid",
  "gameId": "..."
}
```

Server validates and performs the mutation.

Server returns/broadcasts:

```json
{
  "type": "DICE_ROLLED",
  "payload": {
    "playerId": "...",
    "value": 5
  }
}
```

The frontend must NOT send authoritative values like:

```json
{
  "roll": 5,
  "xp": 100,
  "newPosition": 12
}
```

---

# 9. IDEMPOTENCY

Continue using the existing idempotency system.

Every important realtime command must include:

```text
commandId
```

Examples:

```text
ROLL_DICE
SELECT_PATH
SUBMIT_ANSWER
COMPLETE_TURN
READY
UNREADY
```

Duplicate command must NOT cause:

* second dice roll
* second move
* second XP award
* duplicate challenge submission
* duplicate turn transition

If a duplicate command arrives:

return/replay the existing result.

---

# 10. FAST REALTIME PERFORMANCE

Make WebSocket handling extremely lightweight.

Normal event flow should be:

```text
Client action
↓
Validate
↓
Mutate authoritative game state
↓
Persist
↓
Broadcast minimal event
```

Avoid:

* sending full game snapshots after every event
* database connection held for socket lifetime
* huge JSON messages
* expensive computation inside socket handlers
* unnecessary full-game queries
* broadcasting to unrelated games
* excessive React rerenders

Use incremental events.

Example:

BAD:

```json
{
  "entireGame": { "...huge object..." }
}
```

GOOD:

```json
{
  "type": "XP_AWARDED",
  "payload": {
    "playerId": "...",
    "amount": 80,
    "totalXp": 340
  }
}
```

---

# 11. TARGET LATENCY

Target where practical:

```text
WebSocket command → room broadcast
p95 < 150 ms
```

inside the same deployment region.

Do not fake this number.

Later test it.

The game should feel instantaneous to users.

---

# 12. FRONTEND STATE

Separate:

## SERVER STATE

* players
* positions
* current round
* current player
* XP
* streak
* challenge
* allowed actions
* game status

## LOCAL UI STATE

* dice animation
* token animation
* code text
* hover
* transition animation
* confetti

Never let animation state become authoritative game state.

---

# 13. FRONTEND EVENT BEHAVIOR

DICE_ROLLED:

animate the dice result for every player.

PLAYER_MOVED:

animate the correct token for every player.

XP_AWARDED:

update score and trigger existing XP animation.

TURN_STARTED:

highlight correct player.

PLAYER_JOINED:

show new player immediately.

PLAYER_READY:

update Ready state immediately.

GAME_STARTED:

all clients enter game simultaneously.

GAME_COMPLETED:

everyone sees the same results screen.

Preserve the NES/retro visual design.

---

# 14. CHALLENGE PRIVACY

Do not broadcast private challenge answer data unnecessarily.

Other players may know:

* current player is solving a challenge
* challenge type
* timer/status

But do not expose:

* hidden answers
* correctness logic
* future questions
* private answer state

until appropriate.

---

# 15. HEARTBEAT

Implement heartbeat/ping-pong.

Suggested:

```text
ping every 15 sec
```

Consider connection stale around:

```text
45 sec
```

Do not instantly mark user disconnected because one packet was missed.

---

# 16. DISCONNECT

If a player socket drops:

mark presence as disconnected.

Do NOT:

* delete player
* reset XP
* reset board position
* reset round
* reset challenge

Game should continue according to existing rules.

Broadcast:

```text
PLAYER_DISCONNECTED
```

---

# 17. RECONNECT

Reconnect is mandatory.

If player:

* refreshes
* loses Wi-Fi
* closes/reopens page
* socket crashes

they should return to the same seat.

Reconnect flow:

```text
resolve existing player session
↓
connect WebSocket
↓
join same game room
↓
send authoritative snapshot
↓
resume current game
```

Preserve:

* seat
* XP
* streak
* board position
* current round
* current turn
* active challenge
* timer
* current allowed actions

Frontend should temporarily show:

```text
Reconnecting...
```

using existing visual language.

---

# 18. EVENT SEQUENCE

Each event gets:

```text
seq
```

Frontend tracks:

```text
lastSeq
```

If:

```text
seq <= lastSeq
```

ignore duplicate.

If:

```text
seq == lastSeq + 1
```

apply normally.

If:

```text
seq > lastSeq + 1
```

request resync/full snapshot.

This prevents stale/out-of-order state corruption.

---

# 19. MULTIPLE TABS

Test same player opening multiple tabs.

One tab must not be able to:

* roll twice
* submit twice
* move twice
* award XP twice

Use server state + idempotency.

---

# 20. REST API

Do not remove useful REST endpoints.

REST remains useful for:

* create game
* join game
* initial state
* challenge submission where appropriate
* history/results

WebSocket handles:

* realtime updates
* presence
* synchronization

Do not create unnecessary duplicate mutation paths.

---

# 21. TESTS

Add tests for:

## WebSocket

* connection
* room join
* auth/session validation
* broadcast
* lobby realtime
* dice realtime
* movement realtime
* XP realtime
* turn realtime
* game complete

## Reconnect

* refresh
* disconnect/reconnect
* reconnect mid-turn
* reconnect during challenge
* reconnect after game completed

## Ordering

* duplicate event
* missed event
* out-of-order event

## Idempotency

* double roll
* double move
* double submit
* double XP

---

# 22. MANUAL 4-BROWSER TEST

Open 4 separate browser sessions.

Join same Codepoly game.

Verify:

Player 1 rolls.

ALL 4 browsers see dice.

Player 1 moves.

ALL 4 browsers see movement.

Player 1 answers.

ALL 4 browsers see XP change.

Turn moves to Player 2.

ALL browsers highlight Player 2.

Repeat.

No refresh.

No polling dependency.

---

# PHASE 2 ACCEPTANCE

Do not say Phase 2 is complete until:

* lobby updates instantly
* Ready updates instantly
* game starts on all clients
* dice syncs
* movement syncs
* XP syncs
* turns sync
* round sync
* winner screen syncs
* reconnect works
* duplicate commands do not duplicate mutations
* stale clients can resync
* no major socket leaks
* no 2-second lobby polling is required
* existing REST gameplay still works
* existing tests still pass
* new realtime tests pass

When complete:

STOP.

Give me:

1. files created
2. files modified
3. WebSocket library used
4. realtime architecture
5. event protocol
6. reconnect implementation
7. polling removed
8. tests added
9. test results
10. known issues

Do NOT begin Phase 3 until Phase 2 passes.
