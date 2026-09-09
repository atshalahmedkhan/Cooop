You are implementing the complete production game logic for an educational coding game called **Codepoly**.

The visual design of the gameplay screen is ALREADY COMPLETE.

DO NOT redesign the UI.

DO NOT replace the existing design with generic cards, dashboards, templates, or a new visual system.

Your job is to inspect the existing repository and connect the existing frontend design to a robust production-quality game engine.

The result must be a genuinely playable multiplayer web game, not a prototype with mocked state.

# 1. FIRST: INSPECT THE EXISTING REPOSITORY

Before changing code:

1. Inspect the full repository structure.
2. Identify:

   * frontend framework
   * backend framework
   * authentication system
   * database
   * ORM
   * current API patterns
   * WebSocket infrastructure
   * state management
   * existing component library
   * testing framework
   * deployment environment
3. Reuse the existing architecture wherever reasonable.
4. Do not introduce a second framework if one already exists.
5. Do not rewrite working systems unnecessarily.
6. Preserve the finished Codepoly gameplay design exactly unless a tiny change is technically required to support game states.

If no backend architecture currently exists, default to:

Frontend:
Next.js / React / TypeScript

Backend:
FastAPI / Python async

Database:
PostgreSQL

Cache / realtime:
Redis

Realtime:
Native WebSockets

Background jobs:
Redis-backed job queue

Code execution:
isolated worker service

However, if equivalent technologies already exist in the repository, USE THEM.

# 2. PRODUCT OVERVIEW

Codepoly is a multiplayer educational programming board game.

Primary users:

* complete programming beginners
* introductory computer science students
* university introductory programming classes

Supported match sizes:

1 player
2 players
3 players
4 players

V1 maximum:
4 students per match.

The backend must support AT LEAST:

200 simultaneously connected students

which means approximately:

50 simultaneous four-player games

plus hosts/instructors.

Design and load-test for at least:

250 simultaneous WebSocket clients

to provide safety margin.

The application should be architected so this can scale beyond 200 users later.

# 3. CORE PRINCIPLE: SERVER AUTHORITATIVE

The server is the absolute source of truth.

The browser MUST NOT decide:

* dice results
* player movement
* available paths
* question correctness
* challenge selection
* XP rewards
* streak bonuses
* hint penalties
* battle rankings
* mystery outcomes
* power-up results
* heart changes
* round completion
* turn order
* Boss completion
* game winner

The frontend may animate server-approved results.

For example:

WRONG:

client rolls Math.random() and tells backend:

"I rolled 6."

CORRECT:

client sends:

ROLL_DICE

backend generates the result

backend replies:

DICE_ROLLED = 6

frontend animates the die landing on 6.

Never trust XP values submitted by the client.

Never trust board position submitted by the client.

Never trust "correct=true" submitted by the client.

# 4. GAME TYPES

Implement the architecture to support multiple modes.

V1 needs:

## SOLO

1 player.

No turn waiting.

No multiplayer battle requirement.

Focus on progression and mastery.

## CLASSIC

2–4 players.

Default:
4 rounds.

Highest Match XP wins.

## TIMED

2–4 players.

Match ends after configured duration.

Example:

10 minutes
20 minutes
30 minutes

Highest Match XP wins after active challenges resolve according to configured rules.

The game mode must exist in server configuration.

Do not hard-code frontend assumptions about mode.

# 5. FOUR-ROUND DEFAULT MATCH

Classic Codepoly defaults to 4 rounds.

A ROUND means:

every active player receives exactly one main turn.

Example with 4 players:

ROUND 1

Player 1
Player 2
Player 3
Player 4

then:

ROUND 2

Player 1
Player 2
Player 3
Player 4

etc.

Player order is selected when the match begins and remains stable unless game configuration explicitly says otherwise.

Default round personality:

ROUND 1:
Learn

Focus on:
Quiz
Code
Debug
Logic

Low/medium difficulty.

Purpose:
allow users to learn mechanics.

ROUND 2:
Explore

Unlock:
Mystery
Power-ups
1v1 Battles

ROUND 3:
Compete

Allow:
harder questions
risk/reward branches
all-player Battles
higher rewards

ROUND 4:
Prove

Boss becomes active.

Boss challenges become available.

After every active player completes Round 4, the game ends.

Never end the game immediately just because Player 1 finishes the Boss.

Everyone gets an equal Round 4 turn.

# 6. GAME STATE MACHINE

Implement explicit server-side states.

At the game level:

LOBBY

STARTING

ROUND_START

ACTIVE

ROUND_COMPLETE

GAME_COMPLETE

PAUSED

CANCELLED

At the turn level:

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

For battles:

BATTLE_PREPARING

BATTLE_COUNTDOWN

BATTLE_ACTIVE

BATTLE_RESOLVING

BATTLE_COMPLETE

For Boss:

BOSS_ACTIVE

BOSS_STAGE_ACTIVE

BOSS_STAGE_COMPLETE

BOSS_COMPLETE

The server must expose:

current state

allowed actions

next expected action

Do not let the client infer allowed actions.

Example server snapshot:

{
"game_state": "ACTIVE",
"turn_state": "AWAITING_ROLL",
"current_player_id": "...",
"allowed_actions": [
"ROLL_DICE",
"USE_DOUBLE_DICE"
]
}

If the player tries SUBMIT_CHALLENGE while the state is AWAITING_ROLL:

reject it.

Return:

INVALID_GAME_STATE

Do not corrupt game state.

# 7. BOARD MODEL

Do NOT model the board as simply:

position = integer

because the Codepoly design contains branching paths.

Represent the board as a GRAPH.

Suggested concepts:

Board

BoardNode

BoardEdge

Each BoardNode contains:

id
board_id
type
label
difficulty
topic_constraints
round_constraints
coordinates / frontend reference
metadata

Possible node types:

START

CODE

QUIZ

DEBUG

LOGIC

MYSTERY

BATTLE

POWERUP

BOSS

FINISH

RECOVERY

Each BoardEdge:

from_node

to_node

direction metadata if needed

requirements

weight/default status

When dice is rolled:

server calculates possible destinations exactly N movements away.

If only one path:

move automatically.

If multiple legal paths:

server sends:

PATH_CHOICE_REQUIRED

with legal route options.

Frontend highlights only those routes.

Player chooses.

Server verifies the selected route is actually legal.

Never allow:

client-selected arbitrary destination.

# 8. DICE

Default die:

1–6.

Dice generation happens ONLY on server.

Use secure server randomness.

Persist the result.

One roll per eligible turn.

Prevent:

double click
duplicate requests
replay attacks
multiple tabs sending roll simultaneously

Every action must include:

command_id / idempotency_key.

If the same ROLL_DICE command is received twice:

return the original result.

Do NOT roll again.

# 9. DOUBLE DICE POWER-UP

Player can activate Double Dice BEFORE rolling.

Server generates two independent rolls.

Example:

2
5

Frontend displays both.

Player chooses one.

If player fails to choose before configured timeout:

automatically use the FIRST generated roll.

Not the larger roll.

Persist:

both rolls

selected roll

power-up consumption

Power-up must be consumed atomically.

# 10. QUESTION TYPES

Implement:

CODE

QUIZ

DEBUG

LOGIC

OUTPUT_PREDICTION

ORDERING

BATTLE

BOSS_STAGE

Create a proper question model.

Each question requires:

id

version

type

topic

subtopic

difficulty

prompt

instructions

starter_code if applicable

language

answer data

public tests

hidden tests

hint 1

hint 2

explanation

estimated_time

learning_objective

active flag

created_at

updated_at

Questions must be versioned.

A live game should always reference the question version originally assigned.

Editing a question later must not change an active match.

# 11. INITIAL PYTHON QUESTION BANK

Seed a real introductory Python question bank.

Minimum:

60 validated questions.

Include approximately:

12 Quiz questions

10 Output Prediction questions

10 Logic / Ordering questions

10 Code questions

10 Debug questions

6 Battle questions

2 complete multi-stage Boss challenges

Cover:

variables

strings

integers

floats

booleans

print

input concepts

operators

comparison

if

elif

else

for loops

while loops

range

simple functions

parameters

return values

introductory lists where appropriate

Questions should be genuinely appropriate for introductory CS.

Do not create ambiguous questions.

Do not create questions with incorrect answer keys.

Every Code and Debug question must have automated tests.

Every seed question must include a short explanation of the correct solution.

# 12. QUESTION SELECTION ENGINE

When a player lands on a learning node, select a question using:

1. allowed game topics
2. node type
3. node difficulty
4. professor settings
5. student's recent mastery
6. questions already seen this game
7. player challenge history
8. game mode

Avoid repeats in the same match.

If the bank is exhausted:

allow a repeat only after a reasonable gap.

Never immediately repeat the same question.

For normal individual challenges:

adaptive difficulty may be used.

For BATTLE:

ALL players MUST receive the same question and same difficulty.

Never adapt Battle questions separately per player.

That would make the competition unfair.

# 13. ADAPTIVE LEARNING

Track performance per topic.

Example:

loops

conditionals

variables

functions

lists

If a player struggles with a topic, adapt question format.

Example:

full coding problem
↓ failed
debugging problem
↓ failed
output prediction
↓
fill missing line
↓
return later to full coding

Do NOT label the student publicly as:

weak
bad
behind

Adapt quietly.

Suggested adaptive rules:

If last 3 same-topic attempts are unsuccessful:

reduce one difficulty level where allowed

or

switch to a more scaffolded question type.

If last 5 same-topic attempts have:

> = 80% weighted success

and

minimal hint usage

allow one level harder.

Never exceed professor-configured maximum difficulty.

Never go below configured minimum.

Risk-route questions should preserve the difficulty the player explicitly selected unless accessibility/recovery rules require otherwise.

# 14. MATCH XP

Match XP determines the winner of the current match.

It resets every match.

Use ONE canonical scoring table.

BASE XP:

QUIZ

Easy = 40
Medium = 60
Hard = 80

LOGIC / OUTPUT / ORDERING

Easy = 50
Medium = 80
Hard = 120

CODE

Easy = 60
Medium = 100
Hard = 160

DEBUG

Easy = 70
Medium = 110
Hard = 170

BATTLE

Easy base = 100
Medium base = 150
Hard base = 200

Boss full total:

300 XP

Do not invent random XP values outside the configured scoring system.

# 15. NORMAL CHALLENGE XP FORMULA

If final result is incorrect:

base XP = 0.

If correct:

Start with Base XP.

Attempts:

first incorrect SUBMIT before eventual success:

-10% maximum reward.

second incorrect submit:

-20%.

third or more:

minimum attempt multiplier = 70%.

RUN CODE does NOT count as an incorrect submission.

Students should be encouraged to test.

attempt_multiplier:

0 wrong submits:
1.00

1:
0.90

2:
0.80

3+:
0.70

Hints:

Each normal Hint reduces maximum reward by:

15%.

hint multiplier:

0 hints:
1.00

1:
0.85

2:
0.70

Minimum combined performance multiplier:

0.50

Streak bonus:

2 consecutive correct:
+5%

3–4:
+10%

5–6:
+15%

7+:
+20%

Formula:

performance_multiplier =
max(
0.50,
attempt_multiplier * hint_multiplier
)

xp_before_streak =
base_xp * performance_multiplier

final_xp =
round(
xp_before_streak *
(1 + streak_bonus)
)

Never allow negative XP from a normal learning challenge.

Example:

Medium Code

Base:
100

1 incorrect submission:
0.90

1 hint:
0.85

3-question streak:
+10%

performance:

0.90 * 0.85 = 0.765

XP before streak:

76.5

With streak:

84.15

Award:

84 XP

Server performs this calculation.

# 16. STREAK

Correct main challenge:

streak += 1.

Incorrect completed main challenge:

streak = 0.

Side quests do not affect streak.

Mystery events do not affect streak.

Battle loss does not necessarily reset streak if the player still answers correctly.

Battle incorrect:

reset streak only if configured.

Store streak server-side.

# 17. RUN CODE VS SUBMIT

Important distinction:

RUN CODE:

may be used repeatedly.

Does not reduce XP.

Runs against safe visible/public tests.

SUBMIT:

runs against:

public tests
+
hidden tests.

Incorrect Submit increments:

incorrect_submit_count.

Never expose hidden test input/output if doing so reveals the solution.

Return enough information to teach:

example:

3 / 5 tests passed.

Possible message:

"Your function fails for a negative number."

Do not return hidden expected implementation.

# 18. SECURE CODE EXECUTION

THIS IS CRITICAL.

NEVER execute arbitrary student Python inside:

the API process

the WebSocket process

the main backend container

Never use unrestricted eval.

Never use unrestricted exec.

Create a separate CodeExecution service / worker abstraction.

For local development:

an isolated Docker-based runner may be used.

For production:

use isolated sandbox workers.

Each execution must have:

non-root user

read-only filesystem wherever possible

NO network access

NO access to application secrets

NO database credentials

NO Redis credentials

NO host filesystem mounts

strict CPU limit

strict memory limit

strict process count

strict timeout

limited output size

Suggested initial limits:

code size:
20 KB

execution timeout:
3 seconds normal

maximum hard timeout:
5 seconds

memory:
128–256 MB

stdout/stderr:
maximum 64 KB

network:
disabled

process spawning:
restricted

filesystem:
temporary sandbox only

Kill executions that exceed limits.

Handle:

infinite loops

fork bombs

massive output

recursive runaway code

memory exhaustion

syntax errors

runtime errors

timeouts

worker crashes

Do not let one student's code degrade other games.

# 19. CODE EXECUTION FLOW

Recommended:

Client:

POST submission

Backend:

validates game state

creates Submission record

queues code job

returns:

SUBMISSION_ACCEPTED

Worker:

runs code securely

writes result

Backend:

updates challenge

calculates reward

updates game state

pushes result over WebSocket

Frontend:

animates result.

Never block the WebSocket event loop waiting for code execution.

# 20. BATTLES

Battle types:

1v1

ALL_PLAYER

For 1v1:

triggering player + selected/random opponent.

For 3 or 4 player matches:

ALL_PLAYER battle may involve everybody.

Every participant receives:

same question

same version

same timer

same difficulty

same tests

Battle lifecycle:

BATTLE_PREPARING

3-second countdown

BATTLE_ACTIVE

submissions accepted

BATTLE_RESOLVING

BATTLE_COMPLETE

Correctness ALWAYS outranks speed.

Incorrect fast answer cannot beat a slower correct answer.

Rank correct submissions by:

server-received valid correct submission time.

Store:

battle_started_at

first_correct_submission_at

attempt count

final ranking

For four-player all-player battle:

example ranking multiplier:

1st correct:
100% Battle XP

2nd:
80%

3rd:
65%

4th:
50%

Incorrect:
0 Battle XP

Example Medium Battle:

base 150.

1st:
150

2nd:
120

3rd:
98

4th:
75

If two valid correct submissions are effectively tied inside a very small threshold:

allow equal rank/reward rather than inventing unreliable client-side timing.

Never use client clocks for ranking.

# 21. BATTLE FAIRNESS

During battle:

disable Hint

disable Skip

disable Debugger

unless game configuration explicitly enables them for everybody.

A disconnected battle player may reconnect while timer remains active.

Do not restart the timer.

If player reconnects after battle ends:

send battle result snapshot.

# 22. SIDE QUESTS

Waiting is dangerous in a multiplayer coding game.

When the current player enters a longer Code/Debug challenge:

other players may receive one optional Side Quest.

Side Quest:

10–20 seconds

small Quiz / Output / Logic question

maximum reward:

15 XP

Side Quest:

does NOT move token

does NOT consume main turn

does NOT affect main-turn streak

does NOT take hearts

does NOT block next turn

Maximum:

1 side quest per inactive player per active main turn.

Do not create side quests in Solo mode.

# 23. HEARTS

Players start with:

3 Hearts.

Hearts are NOT elimination lives.

Never remove a learner from the game.

A heart is lost when a main non-Battle challenge ends unsuccessfully due to:

timer expiration

explicit give-up

configured maximum/failure condition

Do not lose an additional heart for every incorrect submit.

No double punishment.

If Hearts reaches:

0

the player's next normal turn becomes:

RECOVERY MODE.

Recovery challenge:

easy/scaffolded

related to a weak/recent topic

correct:

restore 1 Heart

award 50% normal Base XP.

incorrect:

remain at 0 Hearts

do NOT eliminate player.

# 24. CHALLENGE TIMERS

Timers depend on mode.

RELAXED:

Quiz / Logic:
60 seconds

Code / Debug:
240 seconds

Battle:
90 seconds

Boss stage:
180 seconds

STANDARD:

Quiz / Logic:
45 seconds

Code / Debug:
180 seconds

Battle:
60 seconds

Boss stage:
120 seconds

COMPETITIVE:

Quiz / Logic:
30 seconds

Code / Debug:
120 seconds

Battle:
45 seconds

Boss stage:
90 seconds

Server owns timers.

Client merely displays server timing.

Never trust client countdown.

Persist:

started_at

expires_at

On reconnect:

calculate remaining time from server timestamp.

# 25. POWER-UPS

Implement inventory server-side.

Power-ups:

HINT

DEBUGGER

EXTRA_TEST

SHIELD

DOUBLE_DICE

SKIP

## HINT

Allowed:

normal Code
Quiz
Debug
Logic

Not default Battle.

Reveal next predefined hint.

Maximum:
2 hints/question.

XP penalty:
15% per hint.

## DEBUGGER

For a code/debug challenge:

highlight an approximate problematic line or provide a debugging clue.

Do NOT reveal exact final solution.

Consume once.

## EXTRA TEST

Reveal one additional test case.

No XP penalty because this is an earned power-up.

Cannot reveal protected hidden tests that directly expose solution logic.

Instead promote one safe additional test to visible.

## SHIELD

Automatically or manually blocks one negative Mystery event.

Consume atomically.

## DOUBLE_DICE

Must activate before roll.

Generate two server-side values.

Player chooses one.

## SKIP

Replace current normal challenge with:

same type

same difficulty

same topic if possible.

Do not award XP merely for skipping.

Cannot be used:

Battle

Boss

after challenge is already completed.

Never assign the exact same question again.

# 26. MYSTERY TILE

Mystery outcomes should be server-generated.

Distribution target:

60% positive

25% neutral / competitive

15% negative

Positive examples:

+25 XP

+50 XP

+75 XP maximum

Hint power-up

Shield

Extra Test

Double Dice

Move +1

Neutral/competitive:

trigger mini battle

swap optional route opportunity

group quiz

Negative:

move backward 1–2

lose small XP

lose one eligible temporary power-up

Negative XP:

never below 0.

Never make a random Mystery reward comparable to Boss reward.

Knowledge must determine the match more than luck.

Do not repeatedly select the same mystery event if alternatives are available.

Persist selected event.

# 27. BOSS

Round 4 unlocks Boss content.

Default Boss total:

300 XP.

Boss contains 3 stages.

Example:

Stage 1:
Concept / Output

75 XP

Stage 2:
Debug

90 XP

Stage 3:
Code

135 XP

Total:

300.

Each stage awards independently.

A player completing 2/3 stages receives:

Stage 1 XP + Stage 2 XP

not zero.

Boss challenge should combine skills learned in the current world.

Do not let hints completely trivialize Boss.

Boss hint penalties use standard hint rules unless configuration says otherwise.

# 28. PLAYER WINNER LOGIC

At Game Complete:

sort by:

1. Match XP

Tie breaker:

2. higher overall learning accuracy

then:

3. more Hard challenges completed correctly

then:

4. fewer hints used

then:

5. higher Battle correctness

If still tied:

declare tie.

Do NOT break a perfect tie using:

dice

randomness

client latency.

# 29. THREE DIFFERENT PROGRESSION SYSTEMS

Keep these completely separate.

## MATCH XP

Purpose:

current match score.

Resets every game.

Determines winner.

## MASTERY

Purpose:

academic learning performance.

Persistent per user/topic.

Used for:

adaptive learning

teacher analytics

recommendations.

## ACCOUNT XP

Purpose:

long-term game progression.

Persistent.

Used for:

levels

cosmetics

world unlocks

achievements.

Do NOT use Match XP as Mastery.

A student receiving Mystery/Battle rewards should not artificially appear more academically proficient.

# 30. MASTERY CALCULATION

For V1 use a transparent weighted evidence model.

Difficulty weights:

Easy:
1.0

Medium:
1.25

Hard:
1.5

Outcome score:

fully correct:
1.0

partial:
0.25–0.9 depending on valid stage/test completion

incorrect:
0

Weighted Mastery:

sum(outcome_score * difficulty_weight)
/
sum(difficulty_weight)
*
100

Maintain per-topic:

attempt_count

correct_count

weighted_points

weighted_possible

hint_count

average_attempts

last_attempted_at

recent_results

Only display a confident percentage after at least:

3 meaningful attempts

Otherwise show:

"Collecting data"

or equivalent.

Mastery must not include:

Mystery XP

dice

random events

cosmetics

movement.

# 31. ACCOUNT XP

After a match, calculate separate account progression.

Suggested V1:

participation:
50

each completed main learning challenge:
10

Boss completion:
50

match completion:
30

maximum reasonable bonus for excellent performance:
50

Keep Account XP independent from Match XP.

Do not allow users to farm massive account XP from repeated reconnects or duplicate completion calls.

One account progression grant per completed game.

# 32. GAME CREATION

GameConfiguration must support:

mode

max_players

round_count

topics

difficulty_min

difficulty_max

adaptive_difficulty

timer_mode

battles_enabled

mystery_enabled

powerups_enabled

side_quests_enabled

boss_enabled

question_types

language

teacher/host id if applicable

Use sensible defaults.

For classroom games:

create short join code.

Example:

PY84KD

Join code must be unique while game is joinable.

Codes should expire after game/lobby lifetime.

# 33. LOBBY

Players join.

Server assigns seat:

1
2
3
4

Player can:

join

leave

ready

reconnect

Host can:

start once requirements satisfied.

Prevent:

5th player entering a 4-player game

same account occupying two seats

duplicate join requests

joining completed game

joining cancelled game

starting twice

non-host starting host-controlled game

# 34. DATABASE MODEL

Adapt names to existing conventions.

Minimum conceptual models:

User

Game

GamePlayer

GameConfiguration

Board

BoardNode

BoardEdge

Question

QuestionVersion

QuestionTestCase

GameChallenge

Submission

Battle

BattleParticipant

PowerUpInventory

MysteryEvent

GameEvent

TopicMastery

AccountProgress

IdempotencyRecord

Suggested Game fields:

id

join_code

host_id

mode

status

round_count

current_round

current_player_id

current_turn_number

state_version

configuration

created_at

started_at

completed_at

Suggested GamePlayer:

id

game_id

user_id

seat_number

board_node_id

match_xp

hearts

streak

status

boss_progress

connected

last_seen_at

joined_at

Suggested GameChallenge:

id

game_id

player_id nullable for group challenge

question_version_id

challenge_type

status

difficulty

started_at

expires_at

resolved_at

incorrect_submits

hints_used

base_xp

awarded_xp

result metadata

Store relational fields normally.

Use JSONB only where metadata is genuinely flexible.

Do not put the entire application state into one giant JSON blob.

# 35. GAME EVENT LOG

Maintain append-only GameEvent records for meaningful actions.

Examples:

PLAYER_JOINED

GAME_STARTED

ROUND_STARTED

TURN_STARTED

DICE_ROLLED

PATH_SELECTED

PLAYER_MOVED

CHALLENGE_STARTED

HINT_USED

SUBMISSION_RECEIVED

CHALLENGE_CORRECT

CHALLENGE_FAILED

XP_AWARDED

POWERUP_AWARDED

POWERUP_USED

MYSTERY_RESOLVED

BATTLE_STARTED

BATTLE_COMPLETED

BOSS_STAGE_COMPLETED

TURN_COMPLETED

ROUND_COMPLETED

PLAYER_DISCONNECTED

PLAYER_RECONNECTED

GAME_COMPLETED

Each event includes:

id

game_id

sequence_number

type

actor_user_id if applicable

server_timestamp

payload

Sequence numbers must increase per game.

Use sequence numbers to detect missed realtime events.

# 36. REALTIME ARCHITECTURE

Use WebSockets for realtime game state.

REST/API may be used for:

game creation

game discovery

question submission

code execution submission

history

analytics

WebSocket handles realtime:

presence

turn updates

dice result

movement

path choices

player state changes

battle countdown

battle results

XP events

power-up events

round transition

game completion.

Use Redis Pub/Sub or equivalent if more than one backend instance exists.

Do NOT keep critical game state only inside process memory.

The canonical game must survive process restart.

# 37. WEBSOCKET CONNECTION SECURITY

Do not put long-lived auth credentials in URLs.

Recommended:

client requests short-lived one-time WebSocket ticket through authenticated REST endpoint.

Example:

POST /api/realtime/ticket

returns ticket valid around:

30 seconds.

Client connects:

wss://.../games/{game_id}?ticket=...

Server validates:

user

game membership

ticket expiration

single use

allowed origin.

Implement:

origin allowlist

authentication

authorization

payload size limits

connection limits

rate limits.

# 38. WEBSOCKET EVENT ENVELOPE

Use a consistent envelope.

Server event example:

{
"type": "DICE_ROLLED",
"event_id": "...",
"game_id": "...",
"seq": 104,
"server_ts": "...",
"payload": {
"player_id": "...",
"roll": 5
}
}

Client command example:

{
"type": "ROLL_DICE",
"command_id": "uuid",
"game_id": "..."
}

Every state-changing command must contain a unique:

command_id.

Server stores/reuses result for duplicate command ID.

# 39. WEBSOCKET HEARTBEAT

Implement ping/pong or equivalent.

Suggested:

heartbeat every:
15 seconds

consider stale:
~45 seconds

Mark player disconnected only after reasonable timeout.

Do not instantly remove player on a brief mobile/network interruption.

# 40. RECONNECT

Reconnect must be first-class.

When client reconnects, provide:

current game snapshot

current round

current turn

current server time

current player

board positions

player scores

hearts

inventory

active challenge

challenge expiration

battle status

last known sequence

allowed actions.

Client may send:

last_seq.

If missed events are available:

send missed events.

Otherwise:

send complete authoritative snapshot.

Never assume browser local state is correct after reconnect.

# 41. PLAYER DISCONNECTION LOGIC

Short disconnect:

preserve seat.

Grace period:

approximately 30–60 seconds depending mode.

If active player's normal turn is ongoing:

timer continues unless game configuration pauses disconnected active player.

Default Standard mode:

timer continues.

If disconnected player fails to return:

resolve according to challenge timeout.

Do NOT freeze all 4 players forever.

If player leaves permanently:

mark:

LEFT

Do not delete historical records.

Round logic must continue with remaining active players.

If player returns after being marked LEFT:

only allow return if game rules permit.

# 42. CONCURRENCY CONTROL

Critical actions must be atomic.

Prevent cases like:

two Roll commands

two Path selections

double XP

two next-turn transitions

two Battle completions

duplicate Boss rewards

Use:

database transactions

row/version locking

and/or a short per-game Redis distributed lock.

Game-changing commands for the same game should be serialized.

Different games should run concurrently.

A slow action in Game A must not block Game B.

Maintain:

state_version.

Update using optimistic concurrency where appropriate.

If expected version does not match:

reload state

reject/retry safely.

# 43. IDEMPOTENCY

Implement idempotency for every important mutation.

Examples:

roll dice

choose path

use power-up

submit answer

claim hint

complete challenge

complete turn

game completion

account XP award

Network retry must NEVER result in:

double roll

double movement

double XP

double heart loss

double power-up consumption

double level-up.

# 44. API ENDPOINTS

Adapt to current codebase patterns.

Conceptually provide:

POST /games

GET /games/{game_id}

POST /games/{game_id}/join

POST /games/{game_id}/ready

POST /games/{game_id}/start

POST /games/{game_id}/leave

GET /games/{game_id}/state

POST /games/{game_id}/actions/roll

POST /games/{game_id}/actions/path

POST /games/{game_id}/actions/powerup

POST /games/{game_id}/challenges/{challenge_id}/hint

POST /games/{game_id}/challenges/{challenge_id}/run

POST /games/{game_id}/challenges/{challenge_id}/submit

GET /games/{game_id}/results

GET /games/{game_id}/analytics

POST /realtime/ticket

Prefer domain/action endpoints over random frontend-driven database mutations.

# 45. FRONTEND STATE

Connect the finished UI to authoritative game state.

If existing state library exists:

use it.

Otherwise use a simple predictable store.

Frontend state should distinguish:

server state

temporary animation state

local editor state.

SERVER STATE:

round

turn

players

positions

XP

hearts

inventory

challenge

timer

allowed actions.

LOCAL UI STATE:

dice animation playing

movement animation

selected code text

modal transition

hover

confetti.

Never overwrite canonical game state based solely on animation.

# 46. FRONTEND GAME FLOW

Example:

Server says:

AWAITING_ROLL.

Frontend:

enables Roll.

Player clicks.

Immediately:

disable Roll button.

Show rolling animation.

Send command.

Server returns:

DICE_ROLLED 5.

Animate result to 5.

Server sends reachable routes.

If one route:

animate movement.

If two:

highlight exactly two server-approved paths.

After selection:

disable both.

Send selection.

Server validates.

Animate movement.

Server resolves tile.

If challenge:

open/populate existing central challenge workspace.

No page refresh.

No navigation away from game.

# 47. OPTIMISTIC UI

Be conservative.

Do NOT optimistically:

award XP

move player permanently

consume inventory

declare correct

declare winner.

You MAY immediately:

animate pressed button

show loading

start non-final dice animation

show submission spinner.

Finalize only after server acknowledgment.

# 48. FRONTEND ERROR STATES

Design implementation must gracefully handle:

lost connection

reconnecting

submission pending

code worker busy

code timeout

server unavailable

invalid action

game already completed

player turn changed

expired challenge

duplicate command

question unavailable

room full.

Do not replace finished design with ugly browser alerts.

Use existing visual language.

Provide clear actionable messages.

# 49. CODE EDITOR

Preserve the existing editor design.

Implement:

Python editor

editable code

syntax highlighting

line numbers

Run

Submit

Reset

Format if already designed

keyboard accessibility.

Do not lose code if:

a WebSocket reconnect occurs.

Store active unsent editor text locally in component/session state.

Do NOT treat that local text as submitted until backend accepts it.

# 50. QUESTION FEEDBACK

Correct:

show:

Correct

XP gained

tests passed

explanation where appropriate

next action.

Incorrect:

show:

Not quite yet

tests passed/failed

useful error

Try Again

Hint if available.

Do not shame users.

Do not immediately expose full solution after first failure.

After final failure/timeout, show educational explanation according to game rules.

# 51. PROFESSOR / HOST CONFIG

If existing host interface exists, wire it up.

Configuration:

topics

difficulty range

game mode

round count

timer mode

battle enabled

mystery enabled

adaptive learning

side quests

Boss

question types.

Server validates configuration.

Do not trust arbitrary client JSON.

# 52. CLASSROOM ANALYTICS

At game end calculate:

player accuracy

questions attempted

questions correct

hints used

average submissions/question

topic mastery evidence

hardest topic

strongest topic

Battle accuracy

Boss performance.

Class-level aggregation:

average accuracy

topic accuracy

frequently missed questions

topics needing reinforcement

completion rate.

Do NOT derive educational analytics from Match XP.

# 53. RATE LIMITING

Protect backend.

Example reasonable limits:

WebSocket commands:
10/sec/user burst

normal API:
reasonable per-user/IP limit

code execution:
max small number simultaneously per user

submission spam:
prevent repeated submit while previous submission is unresolved unless explicitly supported.

Do not make rate limits so aggressive that normal gameplay breaks.

Return:

429 / RATE_LIMITED

cleanly.

# 54. 200-CONCURRENT-USER PERFORMANCE REQUIREMENTS

Target:

200 active students

approximately 50 four-player games

with simultaneous WebSockets.

Test at:

250 concurrent WebSocket clients.

Performance goals under load:

ordinary API p95:
< 250 ms where practical

WebSocket command → fanout p95:
< 150 ms where practical inside deployment region

game mutation should not block unrelated games.

Code execution latency is separate and depends on sandbox execution.

Code submissions must queue without blocking realtime.

WebSocket server must remain responsive while code jobs execute.

# 55. LOAD TEST

Create a real automated load-test scenario using:

k6

Locust

or existing repo load-test tool.

Simulate:

250 connected clients

~62 simultaneous 4-player rooms

join

ready

start

roll

move

answer simple Quiz

occasional Code submission

Battle events

disconnect/reconnect

heartbeat

round completion.

Run for several minutes.

Measure:

connection success rate

p50/p95/p99 event latency

API latency

error rate

CPU

memory

Redis usage

database connections

queue depth.

Acceptance:

no state corruption

no duplicated XP

no dropped games

no runaway memory growth

no unhandled server exceptions.

# 56. DATABASE CONNECTION MANAGEMENT

Use proper connection pooling.

Do not open a new database connection per WebSocket and keep it forever.

Acquire database connections only when needed.

Release promptly.

Avoid N+1 queries when broadcasting game state.

Batch/query efficiently.

Create necessary indexes.

Likely indexes:

games(join_code)

game_players(game_id, user_id)

game_events(game_id, sequence_number)

game_challenges(game_id, player_id, status)

submissions(challenge_id, player_id)

topic_mastery(user_id, topic)

questions(type, topic, difficulty, active)

# 57. REDIS

Use Redis for:

Pub/Sub realtime fanout

presence

short-lived locks

hot game snapshot/cache if useful

rate limiting

short event replay buffer

job queue if architecture uses it.

Do NOT make Redis the only permanent source of game history.

Postgres remains durable source.

If Redis cache is lost:

game should be rebuildable from persistent state.

# 58. OBSERVABILITY

Add structured logs.

Include:

request_id

game_id

user_id where safe

event_type

sequence_number

latency

error_code.

Never log:

passwords

auth tokens

complete arbitrary student code unnecessarily

sensitive secrets.

Add metrics for:

active WebSockets

active games

game actions/sec

code jobs pending

code job duration

submission success

reconnect count

WebSocket errors

database latency

Redis latency.

Provide:

/health

/readiness

appropriate health checks.

# 59. SECURITY

Validate every action:

authenticated?

member of game?

correct role?

correct current player?

correct game state?

challenge belongs to this player/game?

power-up actually owned?

question active?

timer valid?

command already processed?

Never expose:

hidden test source

answer keys before resolution

other student's private code

backend secrets.

Sanitize user-facing text.

Set maximum WebSocket payload size.

Reject malformed JSON.

Reject unknown event types.

# 60. EDGE CASES — MUST HANDLE

Implement tests and behavior for ALL of these.

## GAME / LOBBY

player joins twice

two tabs same user

room full

game already started

game already complete

host starts game twice

players not ready

host disconnects

player leaves lobby

join code expired

invalid join code.

## TURN

double Roll click

Roll during someone else's turn

Roll after already rolled

power-up activated after roll when not allowed

path chosen twice

invalid path

path not reachable by roll

player disconnects during movement

round increments twice

last player leaves.

## CHALLENGE

question missing

question deactivated after match started

question version changed

challenge already completed

Submit twice quickly

Run while Submit is processing

Hint requested twice

Hint unavailable

Skip with no replacement question

timer expires exactly during Submit

correct result arrives after timer expiration

code worker crashes

code times out

syntax error

runtime error

massive stdout

infinite loop

hidden test failure

duplicate worker callback.

Define deterministic resolution for timer race:

if submission was RECEIVED by backend before expires_at:

allow it to finish and count.

If received after expires_at:

reject as expired.

## XP

duplicate reward event

negative XP

hint penalty below allowed minimum

attempt multiplier below minimum

streak applied twice

Mystery XP exceeds cap

Boss stage awarded twice

Account XP awarded twice.

## POWERUPS

using power-up not owned

using already consumed power-up

two simultaneous power-up commands

Shield with no negative event

Double Dice reconnect before selection

Skip during Battle

Hint during disabled Battle

Extra Test when no safe additional test exists.

## BATTLE

opponent disconnects

all participants disconnect

two players submit same millisecond

Battle starts twice

player submits before countdown completes

player submits after Battle closes

incorrect answer arrives first

same question mutated after assignment

participant joins game after Battle started

reconnect after Battle ended.

## NETWORK

WebSocket drops

duplicate WebSocket event

out-of-order event

missed event

reconnect from stale state

multiple backend instances

Redis Pub/Sub duplicate

Redis temporary failure

client sleeps laptop

mobile network changes.

## GAME COMPLETION

Player 1 completes Boss before others

two final turns complete simultaneously

tie Match XP

perfect tie after all tie breakers

player disconnected during final result

reconnect to completed game.

# 61. EVENT ORDERING

Every game has monotonically increasing:

sequence_number.

Client tracks:

last_seq.

If received event seq <= last_seq:

ignore duplicate.

If seq > last_seq + 1:

request synchronization or wait for server snapshot flow.

Never blindly apply out-of-order game mutations.

# 62. TRANSACTIONS

Operations like:

resolve challenge
+
award XP
+
update streak
+
update mastery evidence
+
update heart
+
mark challenge complete

must be one logical atomic transaction where appropriate.

Either the operation succeeds consistently or is safely retried.

Never allow:

challenge marked complete

but XP missing

or:

XP awarded

but challenge still active.

# 63. TESTING

Create serious automated tests.

## UNIT TESTS

XP formula

hint penalties

attempt penalties

streak

dice range

route calculation

mastery calculation

Mystery distribution constraints

Battle ranking

Boss partial XP

power-up rules.

## STATE MACHINE TESTS

valid transitions.

Reject invalid transitions.

## INTEGRATION TESTS

create game

join players

ready

start

full four-player round

four rounds

Boss

game completion.

## WEBSOCKET TESTS

connect

authenticate

events

sequence

disconnect

reconnect

missed state recovery.

## CONCURRENCY TESTS

double roll

double submit

double path

double reward

simultaneous final turns.

## CODE SANDBOX TESTS

valid Python

syntax error

runtime error

infinite loop

memory abuse

large output

network attempt

filesystem attempt.

## END-TO-END

Automate at least:

1-player complete game

2-player game

3-player game

4-player game

Battle

Mystery

power-up

reconnect

Boss

winner screen.

# 64. EXAMPLE FULL 4-PLAYER FLOW

Use this to verify implementation.

Players:

Atshal

Maya

Leo

Sam.

Round 1:

Atshal:
Quiz

Maya:
Code

Leo:
Logic

Sam:
Debug

Round completes only after all 4 main turns resolve.

Round 2:

allow Mystery and 1v1 Battle.

Round 3:

allow all-player Battle and harder risk paths.

Round 4:

unlock Boss.

After Sam's final Round 4 main turn resolves:

calculate results.

Winner:

highest Match XP using tie-breaker rules.

Persist complete game results.

# 65. 1-PLAYER BEHAVIOR

Do not force multiplayer assumptions.

Solo:

player always owns current turn.

After TURN_COMPLETE:

start next round/turn automatically after Continue.

No Side Quest.

1v1 Battles convert to:

Time Challenge

or

personal Code Rush.

Boss works normally.

# 66. 2-PLAYER BEHAVIOR

Alternating turns:

P1
P2.

Round completes after both.

1v1 Battle naturally uses both players.

Side quest available to inactive player during longer challenge.

# 67. 3-PLAYER BEHAVIOR

Turns:

P1
P2
P3.

1v1 Battle selects one opponent.

All-player Battle uses all three.

Rank rewards proportionally.

# 68. 4-PLAYER BEHAVIOR

Turns:

P1
P2
P3
P4.

All-player Battle uses four.

Side quests can involve the other three.

No player should remain idle for several minutes while another writes code.

# 69. DO NOT OVERENGINEER THE FRONTEND

Frontend should NOT contain copies of backend game rules.

Avoid:

if round === 4 then boss logic

inside random React components.

Instead server provides:

boss_unlocked

allowed_actions

challenge

reachable_paths

current_phase.

Frontend renders it.

One canonical rule engine.

# 70. USER EXPERIENCE REQUIREMENTS

Game should feel fast.

Normal state changes should appear immediate.

When waiting for backend:

show subtle active state.

When rolling:

animate.

When moving:

smoothly animate token node-to-node.

When correct:

animate XP toward score.

When Battle begins:

clear synchronized countdown.

When connection drops:

show:

Reconnecting…

Do not instantly throw player out.

When reconnect succeeds:

restore game without refresh if possible.

# 71. ACCESSIBILITY

Do not make game logic mouse-only.

All primary actions keyboard accessible.

Provide text equivalents for:

tile type

power-up

dice result

test state.

Respect reduced-motion preference.

If reduced motion:

skip elaborate token movement

but preserve understandable state changes.

# 72. MIGRATIONS + SEEDING

Create proper database migrations.

Create idempotent seed command for:

board

question bank

Boss questions

Mystery event definitions

power-up definitions

default scoring rules.

Do not require hand-editing production database.

# 73. CONFIGURABLE RULES

Do not scatter magic values through code.

Create centralized typed rules/configuration for:

XP table

hint penalty

attempt penalty

streak percentages

timer durations

Mystery distribution

starting Hearts

starting inventory

Battle ranking multiplier

Boss XP

side quest XP

maximum players

round count.

Make defaults match this specification.

# 74. DOCUMENTATION

Create:

GAME_RULES.md

REALTIME_PROTOCOL.md

CODE_EXECUTION_SECURITY.md

LOAD_TESTING.md

ARCHITECTURE.md

Document:

state machine

XP formulas

WebSocket events

API commands

database ownership

reconnect flow

concurrency strategy

code sandbox

how to run locally

how to seed questions

how to run tests

how to run load tests.

# 75. IMPLEMENTATION QUALITY

Do NOT leave:

fake data

mock timers

TODO handlers

client-generated XP

client-generated dice

hardcoded player names

hardcoded question answers in frontend

fake WebSocket events

placeholder Battle logic

placeholder Boss logic

unimplemented reconnect.

Avoid giant 1,000-line files.

Separate concerns:

game engine

question engine

scoring service

battle service

movement service

power-up service

mastery service

realtime service

code execution service

persistence.

Keep abstractions practical.

# 76. ERROR MODEL

Use consistent machine-readable errors.

Example:

{
"code": "NOT_YOUR_TURN",
"message": "It is currently Maya's turn.",
"recoverable": true
}

Other codes:

INVALID_GAME_STATE

GAME_FULL

GAME_STARTED

GAME_COMPLETE

INVALID_PATH

ALREADY_ROLLED

CHALLENGE_EXPIRED

SUBMISSION_PENDING

QUESTION_UNAVAILABLE

POWERUP_NOT_OWNED

POWERUP_NOT_ALLOWED

RATE_LIMITED

CODE_TIMEOUT

CODE_EXECUTION_ERROR

REALTIME_RESYNC_REQUIRED.

Frontend maps these to polished messages.

# 77. DELIVERY ORDER

Implement in this order:

PHASE 1

Repository audit

Database schema

Game state model

Game configuration

Question model

Seed questions.

PHASE 2

Single-player complete game engine

dice

movement

questions

submissions

XP

rounds

Boss

completion.

PHASE 3

2–4 player turn logic

WebSockets

presence

reconnect

event ordering.

PHASE 4

Battles

Side Quests

Mystery

Power-ups

Hearts / Recovery.

PHASE 5

Mastery

Account XP

Analytics.

PHASE 6

Code sandbox hardening

Concurrency hardening

idempotency.

PHASE 7

Load tests

250 WebSocket clients

performance fixes.

PHASE 8

full E2E tests

documentation

final cleanup.

Do not skip correctness in order to move to the next phase.

# 78. FINAL ACCEPTANCE CRITERIA

The work is complete only if all of the following work:

A user can create a game.

1–4 students can join.

Players can ready.

Game can start.

The server chooses turn order.

Round 1 starts.

Player can roll.

Server calculates legal movement.

Branches work.

Player moves.

Tile resolves.

Correct question type opens.

Quiz works.

Logic works.

Output Prediction works.

Code works.

Debug works.

Run Code works.

Submit works.

Hidden tests work.

Hints work.

Attempts affect XP correctly.

Streak works.

Hearts work.

Recovery works.

Mystery works.

Power-ups work.

Double Dice works.

Skip works.

Extra Test works.

Shield works.

1v1 Battle works.

All-player Battle works.

Side Quests work.

Round progression works.

Round 4 works.

Boss stages work.

Partial Boss XP works.

Match winner works.

Mastery is separate from Match XP.

Account XP is separate from Match XP.

WebSocket reconnect works.

Duplicate commands do not duplicate rewards.

Out-of-order events do not corrupt client state.

Server restart does not permanently destroy canonical game state.

A malicious client cannot simply assign itself XP.

Arbitrary code does not execute in the main backend.

The system survives at least 250 simulated concurrent WebSocket clients without game-state corruption.

Existing Codepoly visual design remains intact.

# 79. BEFORE DECLARING DONE

Perform a final audit.

Specifically search for:

Math.random used for authoritative game logic

XP calculations inside frontend

client-controlled board position

duplicate state-machine logic

race conditions

unawaited async operations

blocking code inside async request/WebSocket handlers

database queries inside tight broadcast loops

unbounded Redis keys

WebSockets that never clean up

timers that leak

duplicate subscriptions

missing indexes

unbounded code output

hidden tests sent to browser

secrets inside sandbox

missing idempotency

missing authorization

TODO/FIXME placeholders

hardcoded fake players

hardcoded winner

mock question results.

Fix them.

Then run:

unit tests

integration tests

WebSocket tests

E2E tests

sandbox tests

load test.

Provide a final implementation report containing:

1. architecture implemented
2. files created
3. files modified
4. database migrations
5. WebSocket protocol
6. game logic summary
7. XP logic
8. sandbox security
9. concurrency strategy
10. reconnect strategy
11. tests executed
12. load-test results
13. known limitations
14. exact commands to run locally.

Do not merely describe what should be built.

IMPLEMENT IT.
