You are continuing development of my existing **Codepoly** project directly inside **Figma Make**.

IMPORTANT:

* The UI/design is already complete in Figma Make.
* DO NOT redesign the app.
* DO NOT replace existing components.
* DO NOT change the visual theme.
* DO NOT create a new frontend architecture.
* Work inside the existing generated project.
* Reuse the current React/Vite/Tailwind frontend.
* Extend the existing Hono backend.
* Reuse the current SQLite + Drizzle setup.
* Preserve all current working functionality.

The frontend should only receive the backend/game state and animate it.

The backend must remain the only source of truth.

Current project:

Frontend:

* React 19
* Vite 8
* Tailwind CSS v4

Backend:

* Hono
* SQLite
* better-sqlite3
* Drizzle ORM

Existing working functionality:

* game creation
* server-generated dice
* board movement
* backend questions
* challenge submissions
* XP
* persisted game state
* REST API
* basic end-to-end game flow

Existing backend files include:

```text
/server
  index.ts
  db/
  game/
  routes/
  middleware/
  types.ts
```

Existing frontend uses:

```text
/src
  api/
  game/
  App.tsx
```

Legacy client-side game logic may still exist.

The backend must eventually become the ONLY gameplay authority.

---

# OVERALL GOAL

Implement the next version of Codepoly in THREE PHASES:

PHASE 1:
Multiplayer lobby + join codes + 1–4 player turn system.

PHASE 2:
Very fast WebSocket realtime multiplayer + reconnect.

PHASE 3:
Battles + Mystery + Power-Ups + Python execution + backend cleanup.

Complete the phases in order.

Do NOT skip ahead until the current phase works.

---

# ==================================

# PHASE 1 — LOBBY + MULTIPLAYER

# ==================================

Build the simplest possible multiplayer joining experience.

## FLOW

Host clicks:

CREATE GAME

Backend creates:

```text
Game Code: AB7K2P
```

Players open the existing Codepoly landing/join UI.

Player enters:

```text
AB7K2P
```

Then enters:

```text
Display Name
```

Then:

JOIN GAME

No account should be required for V1.

Use temporary guest player/session IDs.

---

# JOIN CODE

Generate a unique 6-character uppercase code.

Avoid confusing characters:

```text
0
O
1
I
L
```

Example:

```text
CP7K9M
```

Store code in SQLite.

Do not allow two active games with the same code.

---

# LOBBY

Support maximum:

4 players.

Lobby state:

```text
CODEPOLY

GAME CODE
CP7K9M

Atshal     READY
Maya       READY
Leo        READY
Sam        READY

START GAME
```

Backend must track:

* player ID
* display name
* seat number
* host status
* ready state
* connection state

Seats:

```text
1
2
3
4
```

---

# HOST

Game creator becomes host.

Only host can start.

Host may start when:

* minimum players requirement is satisfied
* all joined non-host players are ready

Backend decides:

```text
canStart
```

Frontend does not calculate this rule.

---

# JOIN VALIDATION

Reject:

* invalid code
* expired game
* full lobby
* joining after game started
* same guest/session joining twice
* 5th player entering 4-player room

Return polished errors to existing UI.

---

# READY

Players can:

```text
READY
UNREADY
```

Broadcast/update lobby immediately.

---

# START

When host starts:

Backend should atomically:

* lock lobby
* stop new joins
* set game ACTIVE
* set round = 1
* assign active player
* initialize turn state

Use seat order:

```text
P1
P2
P3
P4
```

Do not randomize every round.

---

# TURN LOGIC

For 2 players:

```text
P1
P2
```

For 3 players:

```text
P1
P2
P3
```

For 4:

```text
P1
P2
P3
P4
```

Each active player gets one main turn per round.

After last player:

```text
ROUND_COMPLETE
```

Then:

```text
currentRound += 1
```

Then first active player begins.

Default game:

4 rounds.

---

# FRONTEND INTEGRATION

Use the EXISTING Figma Make UI.

Connect:

Create Game

Join Game

Game code input

Name input

Lobby

Ready button

Start button

Player list

Current turn display

Round display

Do not rebuild these screens from scratch unless they do not exist.

Match the current design system exactly.

---

# PHASE 1 TESTS

Test:

1-player

2-player

3-player

4-player

5th player rejected

invalid join code

double join

double Ready

non-host Start

host Start twice

refresh lobby

refresh active game

player leaves lobby

turn order

round progression

Do not move to Phase 2 until this works.

---

# ==================================

# PHASE 2 — FAST WEBSOCKETS

# ==================================

Now make Codepoly feel like a real realtime game.

The target is:

PLAYER ACTION → SERVER → OTHER PLAYERS

should feel nearly instant.

Do not use REST polling for live gameplay.

Use WebSockets.

Keep Hono as the backend.

Use the WebSocket solution that fits the current Hono + Node runtime.

Do not replace the backend framework.

---

# REALTIME EVENTS

Implement:

```text
PLAYER_JOINED
PLAYER_READY
PLAYER_UNREADY
PLAYER_LEFT

GAME_STARTED

ROUND_STARTED
TURN_STARTED

DICE_ROLLED
PATH_CHOICE_REQUIRED
PATH_SELECTED
PLAYER_MOVED

CHALLENGE_STARTED
CHALLENGE_RESOLVED

XP_AWARDED

TURN_COMPLETED
ROUND_COMPLETED

PLAYER_DISCONNECTED
PLAYER_RECONNECTED

GAME_COMPLETED
```

---

# CONNECTION MODEL

Create one realtime room per game.

Conceptually:

```text
gameId
  ├─ player1 socket
  ├─ player2 socket
  ├─ player3 socket
  └─ player4 socket
```

Do not store authoritative game state only in memory.

SQLite remains durable source of truth.

WebSockets are transport.

---

# FAST WEBSOCKET REQUIREMENTS

Keep payloads small.

Do NOT send the full game state after every action.

Example:

Instead of sending:

```text
entire game object
```

send:

```json
{
  "type": "XP_AWARDED",
  "seq": 51,
  "payload": {
    "playerId": "...",
    "amount": 110,
    "total": 320
  }
}
```

Use incremental events.

Send full snapshot only:

* initial connection
* reconnect
* state mismatch
* explicit resync

---

# EVENT ENVELOPE

All events:

```json
{
  "type": "DICE_ROLLED",
  "gameId": "...",
  "seq": 42,
  "serverTs": 123456789,
  "payload": {}
}
```

Every game receives monotonically increasing:

```text
seq
```

Client tracks last sequence.

If:

```text
seq <= lastSeq
```

ignore duplicate.

If:

```text
seq > lastSeq + 1
```

request resync.

---

# CLIENT COMMANDS

Every state mutation should include:

```text
commandId
```

Example:

```json
{
  "type": "ROLL_DICE",
  "commandId": "uuid"
}
```

Backend must make commands idempotent.

If same command arrives twice:

return/replay same result.

DO NOT:

roll twice

move twice

award XP twice.

---

# PERFORMANCE

Optimize for extremely fast realtime response.

Avoid:

* database connection per WebSocket
* large JSON snapshots every action
* unnecessary component rerenders
* synchronous expensive work inside socket handlers
* repeated database queries for the same event
* sending events to users outside the game room

Socket handlers should:

1. validate
2. perform small authoritative mutation
3. persist
4. broadcast minimal event

Keep the WebSocket event loop free.

---

# CONNECTION HEARTBEAT

Implement heartbeat.

Suggested:

```text
ping every 15 seconds
```

Consider stale around:

```text
45 seconds
```

Do not remove a user instantly because of one lost connection.

---

# RECONNECT

This is mandatory.

If Wi-Fi drops or browser refreshes:

player should rejoin the SAME seat.

Return authoritative snapshot:

```text
game
round
turn
players
positions
XP
challenge
timer
allowed actions
last seq
```

Do not reset:

* game
* round
* XP
* challenge
* timer
* position

Frontend should display:

```text
Reconnecting...
```

then automatically resume.

No page restart if avoidable.

---

# MULTIPLE TABS

Protect against:

same player rolling from two tabs.

Use:

* commandId
* backend authorization
* game state
* idempotency
* state version

Only one authoritative result.

---

# REALTIME UI

Do NOT redesign.

Use events to drive existing animations:

DICE_ROLLED:
animate dice.

PLAYER_MOVED:
animate token.

XP_AWARDED:
animate XP toward score.

TURN_STARTED:
highlight current player.

PLAYER_JOINED:
animate lobby player appearing.

BATTLE_STARTED later:
animate Battle state.

---

# PHASE 2 ACCEPTANCE

Verify:

4 browsers can join same room.

Player 1 rolls.

Players 2–4 see it immediately.

Movement synchronizes.

XP synchronizes.

Turns synchronize.

No refresh required.

Refresh reconnects player.

Wi-Fi/socket drop reconnects.

Duplicate messages do not duplicate actions.

Out-of-order events do not corrupt state.

No memory leaks after rooms close.

Only then proceed.

---

# ==================================

# PHASE 3 — GAME SYSTEMS

# ==================================

Now add:

1. Battles
2. Mystery Tiles
3. Power-Ups
4. Code execution
5. Remove legacy frontend logic
6. Performance tests

---

# BATTLES

Support:

```text
1v1
ALL_PLAYER
```

## 1v1

When Battle starts:

select opponent.

Both players receive SAME:

* question
* difficulty
* timer
* test conditions

Start:

```text
3
2
1
CODE
```

Correctness matters first.

Speed only ranks players who are correct.

Never allow a wrong fast answer to beat a correct slower answer.

---

# ALL PLAYER BATTLE

For 3–4 player games:

everyone may participate.

Example ranking:

```text
1st correct = 100%
2nd = 80%
3rd = 65%
4th = 50%
incorrect = 0
```

Use server-received timestamp.

Never use browser clocks.

Broadcast Battle state through WebSockets.

---

# MYSTERY

Backend decides Mystery result.

Suggested distribution:

```text
60% positive
25% neutral
15% negative
```

Positive:

```text
+25 XP
+50 XP
Hint
Shield
Double Dice
Extra Test
Move +1
```

Neutral:

```text
mini battle
group quiz
route event
```

Negative:

```text
move -1
small XP loss
lose temporary power-up
```

Never reduce XP below zero.

Do not allow Mystery luck to overpower educational challenge XP.

---

# POWER-UPS

Implement:

```text
HINT
SHIELD
DOUBLE_DICE
SKIP
EXTRA_TEST
DEBUGGER
```

Inventory is backend-owned.

Frontend displays only.

---

# DOUBLE DICE

Player must activate BEFORE rolling.

Backend generates:

```text
roll1
roll2
```

Player selects one.

Reconnect must preserve the two values.

Do not reroll after reconnect.

---

# SKIP

Replace current question with:

same type

same difficulty

same topic if available.

No free XP.

Cannot use:

Battle

Boss.

---

# HINT

Reveal predefined hint.

Do not reveal full answer.

Apply XP penalty according to current scoring rules.

---

# PYTHON CODE EXECUTION

Now implement real Code and Debug challenges.

CRITICAL:

DO NOT execute arbitrary Python inside:

* Hono API process
* WebSocket process
* main app process

Create isolated execution worker/service.

Minimum safety:

```text
timeout
memory limit
CPU limit
output limit
no network
no environment secrets
temporary filesystem only
```

Handle:

```text
while True
syntax errors
runtime errors
massive output
memory abuse
```

One bad student's code must not freeze multiplayer.

---

# EXECUTION FLOW

Frontend:

```text
Submit Code
```

Backend:

```text
validate challenge
create submission
queue execution
```

Worker:

```text
execute safely
run tests
return result
```

Game engine:

```text
calculate correctness
XP
challenge result
```

WebSocket:

```text
CHALLENGE_RESOLVED
XP_AWARDED
```

Never block WebSocket handlers waiting for Python.

---

# LEGACY FRONTEND CLEANUP

Audit:

```text
src/game/useGame.ts
src/game/engine.ts
src/game/questions.ts
```

If backend equivalents are now authoritative:

remove their gameplay authority.

Either:

delete safely

or

convert to pure frontend helpers/types.

Frontend must NOT calculate:

dice

XP

question correctness

movement

winner.

Search the whole frontend for duplicate rules.

---

# PERFORMANCE TEST

After functionality works:

simulate at least:

```text
250 concurrent WebSocket users
```

Approximately:

```text
62 simultaneous 4-player games
```

Test:

join

ready

start

roll

move

answer

Battle

disconnect

reconnect

game complete.

Measure:

```text
connection success
WebSocket p50
WebSocket p95
WebSocket p99
API p95
error rate
memory
CPU
database latency
```

Target:

normal WebSocket actions should feel effectively instant.

Aim where practical for:

```text
WebSocket command → room broadcast p95 < 150 ms
```

within the same deployment region.

Do NOT fake results.

Report actual measurements.

---

# SQLITE NOTE

Current system uses SQLite.

For the current 200–250-user target:

do not migrate databases prematurely.

First load test the actual implementation.

Optimize:

* indexes
* transaction duration
* WAL mode where appropriate
* prepared queries
* short writes

If SQLite becomes a measured bottleneck:

DOCUMENT the evidence.

Then recommend PostgreSQL as a later scaling migration.

Do NOT migrate merely because PostgreSQL is fashionable.

---

# FINAL EDGE CASE AUDIT

Test:

duplicate Roll

duplicate Submit

duplicate power-up

join twice

room full

host disconnect

player disconnect

refresh

reconnect during challenge

reconnect during Battle

Battle submission tie

Battle timeout

timer expiration during Submit

same user multiple tabs

invalid path

wrong turn

question missing

worker crash

worker timeout

Boss completion

last round completion

perfect XP tie.

---

# FIGMA MAKE REQUIREMENT

This is being built ENTIRELY inside the existing Figma Make project.

Do not create unrelated external projects.

Do not generate a replacement frontend.

Do not change the visual design.

Do not remove the NES/retro Codepoly style.

Do not convert the app into a generic SaaS UI.

All backend implementation must integrate into the existing Figma Make-generated project.

When backend state requires new UI behavior:

extend existing components using the existing design language.

---

# FINAL AUDIT

Before saying complete, search for:

```text
Math.random
client XP calculation
client question correctness
client movement authority
mock multiplayer
fake WebSocket
setInterval polling being used instead of realtime
TODO
FIXME
hardcoded players
hardcoded winner
duplicate XP
duplicate subscriptions
socket leaks
unbounded listeners
hidden answers exposed in client
exec(
eval(
```

Fix all relevant problems.

---

# FINAL REPORT

When all three phases are complete, give me:

1. Exact files created
2. Exact files modified
3. Database schema changes
4. Lobby implementation
5. Join-code implementation
6. Multiplayer implementation
7. WebSocket architecture
8. WebSocket event protocol
9. Reconnect design
10. Idempotency design
11. Battle implementation
12. Mystery implementation
13. Power-up implementation
14. Python sandbox implementation
15. Legacy frontend logic removed
16. Tests added
17. Tests run
18. Actual test results
19. Actual load-test results
20. Known limitations
21. Any mocked/incomplete behavior
22. Exact commands used to run the project

Do not claim anything was completed if it was not actually implemented and tested.
