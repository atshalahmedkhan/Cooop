import { db } from '../db/client.js'
import { games, game_players, game_challenges, game_events, question_versions, battles } from '../db/schema.js'
import { eq, and, max } from 'drizzle-orm'
import { allowedActions } from './stateMachine.js'
import { getBoardGraph, computeReachablePaths } from './board.js'
import { isCodeChallenge } from './engine.js'
import type { GameStateSnapshot, PlayerSnapshot, ChallengeSnapshot, BattleSnapshot, PowerUps } from '../types.js'
import { randomUUID } from 'node:crypto'

export async function buildSnapshot(gameId: string, boardId: string): Promise<GameStateSnapshot> {
  const game = db.select().from(games).where(eq(games.id, gameId)).get()
  if (!game) throw new Error('Game not found: ' + gameId)

  const players = db.select().from(game_players).where(eq(game_players.game_id, gameId)).all()

  const playerSnapshots: PlayerSnapshot[] = players.map(p => {
    const rawPowerUps = JSON.parse(p.power_ups || '{}') as Record<string, number>
    const powerUps: PowerUps = {
      HINT: rawPowerUps.HINT ?? 0,
      SHIELD: rawPowerUps.SHIELD ?? 0,
      DOUBLE_DICE: rawPowerUps.DOUBLE_DICE ?? 0,
      SKIP: rawPowerUps.SKIP ?? 0,
      DEBUGGER: rawPowerUps.DEBUGGER ?? 0,
      EXTRA_TEST: rawPowerUps.EXTRA_TEST ?? 0,
    }
    return {
      id: p.id,
      seat_number: p.seat_number,
      current_node_id: nodeKeyForNodeId(boardId, p.current_node_id),
      match_xp: p.match_xp,
      hearts: p.hearts,
      streak: p.streak,
      status: p.status,
      display_name: p.display_name,
      is_host: p.is_host ?? false,
      is_ready: p.is_ready ?? false,
      power_ups: powerUps,
    }
  })

  // Active challenge for current player
  let activeChallenge: ChallengeSnapshot | null = null
  let reachablePaths: ReturnType<typeof computeReachablePaths> = []

  if (game.current_player_id) {
    const challenge = db
      .select()
      .from(game_challenges)
      .where(and(
        eq(game_challenges.game_id, gameId),
        eq(game_challenges.player_id, game.current_player_id),
        eq(game_challenges.status, 'ACTIVE'),
      ))
      .get()

    if (challenge) {
      const qv = db.select().from(question_versions).where(eq(question_versions.id, challenge.question_version_id)).get()
      if (qv) {
        const answerData = qv.answer_data as Record<string, unknown>
        const choices = (answerData.choices ?? null) as Record<string, string> | null
        activeChallenge = {
          id: challenge.id,
          question_version_id: challenge.question_version_id,
          challenge_type: challenge.challenge_type as any,
          difficulty: challenge.difficulty as any,
          prompt: qv.prompt,
          instructions: qv.instructions,
          choices,
          expires_at: challenge.expires_at,
          incorrect_submit_count: challenge.incorrect_submit_count,
          hints_used: challenge.hints_used,
          base_xp: challenge.base_xp,
          is_code_challenge: isCodeChallenge(challenge.challenge_type as any),
        }
      }
    }

    // Compute reachable paths when awaiting path choice
    if (game.turn_state === 'AWAITING_PATH_CHOICE' && game.dice_result && game.current_player_id) {
      const currentPlayer = players.find(p => p.id === game.current_player_id)
      if (currentPlayer) {
        const graph = getBoardGraph(boardId)
        reachablePaths = computeReachablePaths(graph, currentPlayer.current_node_id, game.dice_result)
      }
    }
  }

  // Last event sequence
  const lastSeq = db
    .select({ seq: max(game_events.sequence_number) })
    .from(game_events)
    .where(eq(game_events.game_id, gameId))
    .get()

  // Active battle
  let activeBattle: BattleSnapshot | null = null
  const currentBattleId = game.current_battle_id
  if (currentBattleId) {
    const battle = db.select().from(battles).where(eq(battles.id, currentBattleId)).get()
    if (battle && battle.status !== 'complete') {
      let battleQuestion: BattleSnapshot['question'] | undefined
      if (battle.question_version_id) {
        const bqv = db.select().from(question_versions).where(eq(question_versions.id, battle.question_version_id)).get()
        if (bqv) {
          const bAnswerData = bqv.answer_data as Record<string, unknown>
          battleQuestion = {
            prompt: bqv.prompt,
            instructions: bqv.instructions,
            choices: (bAnswerData.choices ?? null) as Record<string, string> | null,
            is_code_challenge: isCodeChallenge(bqv.question_id as any) ?? false,
          }
        }
      }
      activeBattle = {
        id: battle.id,
        type: battle.type as '1v1' | 'all',
        status: battle.status as 'preparing' | 'active' | 'complete',
        countdown_ends_at: battle.countdown_ends_at,
        battle_ends_at: battle.battle_ends_at,
        participants: battle.participants as any,
        question: battleQuestion,
      }
    }
  }

  // Mystery outcome (stored on the game until turn completes)
  const mysteryOutcome = game.mystery_outcome
    ? JSON.parse(game.mystery_outcome)
    : null

  // Double dice results
  const doubleDiceRaw = game.double_dice_results
  const doubleDiceResults: [number, number] | null = doubleDiceRaw
    ? (typeof doubleDiceRaw === 'string' ? JSON.parse(doubleDiceRaw) : doubleDiceRaw)
    : null

  const activePlayers = players.filter(p => p.status === 'ACTIVE')
  const nonHostNonReady = activePlayers.filter(p => !p.is_host && !p.is_ready)
  const canStart = activePlayers.length >= 1 && nonHostNonReady.length === 0

  return {
    game_id: gameId,
    game_status: game.status as any,
    turn_state: game.turn_state as any,
    current_round: game.current_round,
    round_count: game.round_count,
    current_player_id: game.current_player_id,
    players: playerSnapshots,
    dice_result: game.dice_result,
    double_dice_results: doubleDiceResults,
    reachable_paths: reachablePaths,
    active_challenge: activeChallenge,
    active_battle: activeBattle,
    mystery_outcome: mysteryOutcome,
    allowed_actions: allowedActions(game.turn_state as any),
    state_version: game.state_version,
    last_event_sequence: lastSeq?.seq ?? 0,
    join_code: game.join_code ?? null,
    can_start: canStart,
  }
}

// Helper: get the node_key (0-31) for a node id
const nodeKeyCache = new Map<string, number>()

function nodeKeyForNodeId(boardId: string, nodeId: string): number {
  if (nodeKeyCache.has(nodeId)) return nodeKeyCache.get(nodeId)!
  const graph = getBoardGraph(boardId)
  const node = graph.nodes.get(nodeId)
  const key = node?.node_key ?? 0
  nodeKeyCache.set(nodeId, key)
  return key
}

export function getLastSeq(gameId: string): number {
  const result = db
    .select({ seq: max(game_events.sequence_number) })
    .from(game_events)
    .where(eq(game_events.game_id, gameId))
    .get()
  return result?.seq ?? 0
}

export function appendEvent(
  gameId: string,
  eventType: string,
  actorPlayerId: string | null,
  payload: Record<string, unknown>,
): void {
  // Get next sequence number
  const last = db
    .select({ seq: max(game_events.sequence_number) })
    .from(game_events)
    .where(eq(game_events.game_id, gameId))
    .get()

  const nextSeq = (last?.seq ?? 0) + 1

  db.insert(game_events).values({
    id: randomUUID(),
    game_id: gameId,
    sequence_number: nextSeq,
    event_type: eventType,
    actor_player_id: actorPlayerId,
    payload,
  }).run()
}
