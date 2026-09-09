You are implementing the backend foundation for an existing project called **Codepoly**.

IMPORTANT CONTEXT:

* The frontend/UI is already designed and implemented in **Figma Make**.
* DO NOT redesign, restyle, restructure, or replace the current frontend.
* Your job in this phase is ONLY to build the backend foundation required to support the game.
* Do NOT implement Battles, Mystery tiles, power-ups, analytics, adaptive learning, large-scale load testing, or advanced multiplayer yet.
* Do NOT jump ahead to future phases.
* Complete this phase properly first.

## PRODUCT

Codepoly is an educational coding board game for beginners and introductory computer-science students.

Eventually it will support:

* 1–4 players
* real-time multiplayer
* coding questions
* quizzes
* debugging
* logic questions
* output prediction
* Battles
* power-ups
* Boss challenges
* XP
* mastery
* WebSockets

However, THIS PHASE is only about establishing the production-quality backend foundation and getting a single-player game flow working correctly.

---

# PHASE 1 GOAL

At the end of this phase I must be able to:

1. Create a game.
2. Start a Solo game.
3. Have the backend select the starting player.
4. Roll a server-generated dice.
5. Move through the real board.
6. Handle branching paths.
7. Land on a tile.
8. Receive a real persisted question.
9. Answer a Quiz / Logic / Output Prediction question.
10. Have the SERVER evaluate correctness.
11. Have the SERVER calculate XP.
12. Complete a turn.
13. Progress through multiple rounds.
14. Persist game state.
15. Refresh the browser and recover the current authoritative game state.

Do NOT fake any of these.

---

# FIRST STEP — REPOSITORY AUDIT

Before writing code:

Inspect the entire repository.

Identify:

* frontend framework
* backend framework, if any
* database
* ORM
* authentication
* state management
* API conventions
* folder structure
* existing server functions
* Figma Make-generated code
* existing environment variables
* existing deployment assumptions
* current dependencies
* existing tests

Then report internally what architecture already exists.

REUSE the existing project architecture wherever reasonable.

Do not add FastAPI if the project already has a functioning equivalent backend.

Do not create a second database system.

Do not introduce unnecessary frameworks.

Do not rewrite the existing frontend.

---

# SERVER-AUTHORITATIVE RULE

This is the most important architecture rule.

The backend is the source of truth.

The frontend must NEVER determine:

* dice result
* player position
* legal path
* challenge correctness
* XP
* streak
* current round
* current turn
* game completion

The frontend may only:

* send user intent
* display server state
* animate server-approved results

Example:

BAD:

frontend:

Math.random()

then sends:

{
"roll": 6
}

GOOD:

frontend sends:

{
"action": "ROLL_DICE",
"command_id": "uuid"
}

backend generates:

6

backend persists:

6

backend returns:

{
"roll": 6
}

frontend animates the dice to 6.

Never trust any XP value supplied by the frontend.

---

# DATABASE

Create proper persistent database models.

Use the project's existing database/ORM if available.

Minimum models:

## Game

Fields should conceptually include:

id

mode

status

round_count

current_round

current_player_id

turn_state

state_version

created_at

started_at

completed_at

configuration

## GamePlayer

id

game_id

user_id

seat_number

current_board_node_id

match_xp

hearts

streak

status

joined_at

last_seen_at

## Board

id

name

version

active

## BoardNode

id

board_id

node_key

type

label

difficulty

topic

metadata

## BoardEdge

id

board_id

from_node_id

to_node_id

metadata

## Question

id

type

topic

subtopic

difficulty

active

## QuestionVersion

id

question_id

version

prompt

instructions

answer_data

explanation

created_at

## GameChallenge

id

game_id

player_id

question_version_id

challenge_type

difficulty

status

started_at

expires_at

incorrect_submit_count

hints_used

base_xp

awarded_xp

resolved_at

## Submission

id

challenge_id

player_id

answer_payload

correct

submitted_at

## GameEvent

id

game_id

sequence_number

event_type

actor_user_id

payload

created_at

## IdempotencyRecord

id

game_id

user_id

command_id

action_type

response_payload

created_at

Adapt naming to the existing project's conventions.

Do not store the entire application inside one giant JSON object.

Use proper relational structure.

---

# GAME STATUS

Implement game-level states:

LOBBY

STARTING

ROUND_START

ACTIVE

ROUND_COMPLETE

GAME_COMPLETE

CANCELLED

---

# TURN STATE MACHINE

Implement explicit turn states:

WAITING

TURN_START

AWAITING_ROLL

ROLL_RESOLVED

AWAITING_PATH_CHOICE

MOVING

TILE_RESOLVED

CHALLENGE_ACTIVE

SUBMISSION_PENDING

CHALLENGE_RESOLVED

REWARD_RESOLVED

TURN_COMPLETE

The backend must control transitions.

Invalid transitions must be rejected.

Example:

If state is:

AWAITING_ROLL

and frontend sends:

SUBMIT_CHALLENGE

return:

INVALID_GAME_STATE

Do NOT silently accept or mutate state.

---

# ALLOWED ACTIONS

Every authoritative game-state response should include:

allowed_actions

Example:

{
"game_status": "ACTIVE",
"turn_state": "AWAITING_ROLL",
"current_player_id": "...",
"allowed_actions": [
"ROLL_DICE"
]
}

Frontend should use this to determine what buttons are enabled.

Do not make React infer game rules independently.

---

# BOARD MODEL

The Codepoly board contains branches.

Therefore DO NOT model movement as only:

position = 7

Represent the board as a GRAPH.

Use:

BoardNode

BoardEdge

Each node represents a game tile.

Initial supported node types:

START

QUIZ

LOGIC

OUTPUT

CODE

DEBUG

BOSS

FINISH

For THIS phase, backend gameplay only needs to fully support:

START

QUIZ

LOGIC

OUTPUT

FINISH

Code and Debug may exist in the model but do not implement execution yet.

---

# MOVEMENT

Dice values:

1–6.

Dice is generated server-side.

After rolling:

backend calculates legal destinations exactly N steps away.

If there is exactly one valid route:

server selects that route.

If there are multiple legal routes:

turn state becomes:

AWAITING_PATH_CHOICE

Return:

reachable_paths

Example:

{
"reachable_paths": [
{
"path_id": "...",
"destination_node_id": "...",
"label": "Easy Route"
},
{
"path_id": "...",
"destination_node_id": "...",
"label": "Risk Route"
}
]
}

Frontend displays/highlights ONLY these choices.

When frontend chooses one:

backend validates that path.

Never accept arbitrary node IDs as movement destinations.

---

# IDEMPOTENCY

Every state-changing request must contain:

command_id

Generate UUID client-side.

Examples:

ROLL_DICE

SELECT_PATH

SUBMIT_ANSWER

COMPLETE_TURN

If the same command_id arrives twice:

DO NOT execute the action twice.

Return the previous result.

This must prevent:

double dice

double movement

double XP

double challenge completion

double round increment

---

# QUESTION SYSTEM

Create a real persisted question model.

For this phase implement:

QUIZ

LOGIC

OUTPUT_PREDICTION

Question attributes:

type

topic

difficulty

prompt

answer options if applicable

correct answer

explanation

learning objective

active status

version

Questions must be versioned.

A live challenge references the specific QuestionVersion.

Editing a question later must not modify active game history.

---

# SEED INITIAL QUESTIONS

Create at least:

30 high-quality introductory Python questions.

Approximately:

10 Quiz

10 Logic

10 Output Prediction

Topics:

variables

strings

integers

floats

booleans

operators

comparisons

if/else basics

range

basic loops

simple function concepts

Questions must be:

unambiguous

correct

appropriate for beginner/intro CS level

fully validated.

Every question must include:

correct answer

short explanation.

Do not create filler or nonsense questions.

---

# QUESTION SELECTION

When player lands on a question tile:

backend selects an eligible question based on:

tile type

difficulty

configured topics

questions already seen in the current game.

Do not repeat the same question during the same game unless the available bank is exhausted.

Persist which QuestionVersion was assigned.

---

# ANSWER SUBMISSION

Frontend should send:

challenge_id

answer

command_id

Backend verifies:

user belongs to game

challenge belongs to player

challenge is active

game is active

turn is correct

challenge has not expired

command has not already run.

Then evaluate answer on server.

Frontend must NEVER send:

correct: true

as trusted information.

---

# XP SYSTEM

Implement Match XP only in this phase.

Match XP resets every game.

Base values:

QUIZ:

Easy = 40

Medium = 60

Hard = 80

LOGIC:

Easy = 50

Medium = 80

Hard = 120

OUTPUT:

Easy = 50

Medium = 80

Hard = 120

Incorrect final result:

0 Base XP.

Correct:

Base XP.

For this phase implement:

attempt penalty

streak bonus.

Do NOT implement power-up/hint penalties yet unless Hint functionality already exists.

---

# ATTEMPT PENALTY

Run attempts do not apply because Code execution is not implemented in this phase.

For answer submissions:

0 previous wrong submissions:

1.00

1 previous wrong:

0.90

2 previous wrong:

0.80

3+ previous wrong:

0.70

Minimum:

70% due to attempts.

---

# STREAK

Correct challenge:

streak += 1

Failed completed challenge:

streak = 0

Bonus:

1 correct:
0%

2:
5%

3–4:
10%

5–6:
15%

7+:
20%

Formula:

xp_before_streak =
base_xp * attempt_multiplier

final_xp =
round(
xp_before_streak *
(1 + streak_bonus)
)

XP calculations happen ONLY on backend.

---

# ATOMIC CHALLENGE RESOLUTION

Resolving a challenge should atomically:

mark submission

determine correctness

update incorrect submit count if needed

update streak

award XP if correct

update GameChallenge

create GameEvent

transition state

Do not allow situations where:

XP is awarded but challenge remains active.

Or:

challenge completes but XP is missing.

Use a database transaction.

---

# GAME EVENTS

Create append-only event history.

Events for this phase:

GAME_CREATED

GAME_STARTED

ROUND_STARTED

TURN_STARTED

DICE_ROLLED

PATH_CHOICE_REQUIRED

PATH_SELECTED

PLAYER_MOVED

CHALLENGE_STARTED

ANSWER_SUBMITTED

CHALLENGE_CORRECT

CHALLENGE_INCORRECT

XP_AWARDED

TURN_COMPLETED

ROUND_COMPLETED

GAME_COMPLETED

Each event has a monotonically increasing:

sequence_number

per game.

Never reuse sequence numbers.

---

# GAME SNAPSHOT

Create an endpoint/service that returns authoritative current state.

Example concept:

GET /games/{game_id}/state

Return:

game status

current round

round count

turn state

current player

players

board positions

Match XP

streak

active challenge if authorized

reachable paths

allowed actions

state_version

last_event_sequence.

This will later become the basis of WebSocket reconnect.

---

# SOLO GAME LOGIC

Implement Solo first.

Solo:

1 player.

Game starts.

Player receives TURN_START.

Turn enters:

AWAITING_ROLL.

Player rolls.

Moves.

Tile resolves.

Question challenge starts.

Player answers.

XP resolves.

Turn completes.

Round completes.

Next round begins.

Use default:

4 rounds.

After Round 4:

game completes.

Do not implement multiplayer yet.

---

# GAME CONFIGURATION

Create a typed configuration.

At minimum:

mode

round_count

topics

difficulty_min

difficulty_max

question_types

board_id

Do not scatter values throughout code.

Create a centralized game rules/config object.

---

# API DESIGN

Adapt to existing project conventions.

Conceptually support:

POST /games

POST /games/{id}/start

GET /games/{id}

GET /games/{id}/state

POST /games/{id}/actions/roll

POST /games/{id}/actions/path

POST /games/{id}/challenges/{challenge_id}/submit

GET /games/{id}/results

All mutations require authorization and command_id.

---

# AUTHORIZATION

Every action must verify:

authenticated user

player belongs to game

game is active where required

player owns current turn

challenge belongs to player

action allowed in current state.

Never trust IDs just because frontend sends them.

---

# CONCURRENCY

Even Solo must be safe against multiple tabs/double clicks.

Use:

database transaction

state_version

and row lock / equivalent when mutating the same Game.

Prevent:

double Roll

double submit

double XP

double turn completion

double round progression.

---

# ERROR MODEL

Use consistent errors.

Examples:

NOT_YOUR_TURN

INVALID_GAME_STATE

ALREADY_ROLLED

INVALID_PATH

CHALLENGE_NOT_FOUND

CHALLENGE_ALREADY_COMPLETE

QUESTION_UNAVAILABLE

GAME_NOT_FOUND

GAME_COMPLETE

DUPLICATE_ACTION

UNAUTHORIZED

Return structured responses like:

{
"code": "ALREADY_ROLLED",
"message": "The dice has already been rolled for this turn.",
"recoverable": true
}

Do not use generic 500s for normal game-rule violations.

---

# FRONTEND INTEGRATION

Use the EXISTING Figma Make frontend.

Do NOT redesign it.

Connect:

Roll button

board movement

path selection

question area

answer buttons

XP display

round indicator

result feedback.

Frontend should display real backend state.

Remove mock state only when equivalent real state exists.

Do not break the existing UI.

---

# NO WEBSOCKETS YET

For THIS phase:

REST / regular backend state synchronization is enough.

Do not implement realtime multiplayer yet.

We need the game engine correct before WebSockets.

Structure code so WebSocket support can be added cleanly later.

---

# NO CODE EXECUTION YET

Do not execute arbitrary student Python in this phase.

CODE and DEBUG tiles may exist in schemas/models.

If encountered during Solo testing:

either avoid them in the Phase 1 board configuration

or return a controlled NOT_AVAILABLE_IN_THIS_PHASE response.

Do not fake Code execution.

Do not use eval.

Do not use exec.

---

# TESTING

Create strong tests.

## UNIT

dice returns 1–6

XP calculations

attempt penalty

streak calculation

route traversal

branch calculation

question correctness

question selection avoiding repeats

state transitions.

## INTEGRATION

create Solo game

start game

roll

move

branch choice

receive question

correct answer

incorrect answer

XP award

turn completion

round completion

four rounds

game completion.

## CONCURRENCY

double roll command

same command_id retry

double answer submit

double turn completion.

Expected:

no duplicate mutations.

---

# E2E TEST

Create one automated complete Solo test:

Create game

Start

Round 1

Roll

Move

Answer

Complete

Round 2

Roll

Move

Answer

Complete

Round 3

Roll

Move

Answer

Complete

Round 4

Roll

Move

Answer

Complete

Game result.

Verify:

exactly 4 rounds

no duplicate XP

correct final state

event sequence monotonic.

---

# DO NOT DO IN THIS PHASE

Do NOT implement:

WebSockets

Redis Pub/Sub

multiplayer

Battles

Mystery

power-ups

Side Quests

Hearts / Recovery

adaptive difficulty

Mastery

Account XP

professor analytics

Python sandbox

load testing

250 users

new UI design

new landing page

new authentication system unless absolutely required.

Those come AFTER the game engine works.

---

# QUALITY AUDIT

Before claiming this phase is complete, search the repository for:

Math.random used for authoritative dice

frontend XP calculations

frontend answer correctness

client-controlled board positions

TODO

FIXME

mock challenge results

hardcoded current player

hardcoded winner

duplicate game rules

missing transactions

missing authorization

missing idempotency.

Fix all problems relevant to this phase.

---

# FINAL ACCEPTANCE TEST

Do NOT tell me this phase is complete unless:

* Solo game can be created.
* Solo game can start.
* Dice comes from backend.
* Dice cannot be rolled twice.
* Board movement comes from backend.
* Branching path is validated by backend.
* Question comes from database.
* Question answer is checked by backend.
* XP comes from backend.
* Wrong submissions affect XP correctly.
* Streak works.
* Turn completes.
* Four rounds progress.
* Game completes.
* Refresh restores current game state.
* Duplicate commands do not duplicate actions.
* Database state remains consistent.
* Existing Figma Make UI still works and looks the same.
* Automated tests pass.

---

# WHEN FINISHED

STOP.

DO NOT START MULTIPLAYER.

Give me a detailed implementation report containing:

1. Existing architecture discovered
2. Backend architecture used
3. Files created
4. Files modified
5. Database models created
6. Database migrations
7. API endpoints added
8. State-machine implementation
9. Board movement implementation
10. Question-bank implementation
11. XP calculation implementation
12. Idempotency strategy
13. Concurrency strategy
14. Frontend integration changes
15. Tests added
16. Exact tests run
17. Test results
18. Any known bugs
19. Any shortcuts taken
20. Anything mocked or incomplete
21. Exact local commands to run and test this phase

Be extremely explicit about anything that is not actually complete.

Do not claim functionality that has not been tested.

Do not move to Phase 2 until I explicitly tell you to.
