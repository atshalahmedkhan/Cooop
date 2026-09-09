import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import { db } from '../db/client.js'
import { game_players, games } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { joinRoom, leaveRoom, pongReceived, broadcast } from './rooms.js'
import { buildSnapshot } from '../game/snapshot.js'
import { makeEnvelope } from './protocol.js'

export function setupWebSocket(httpServer: any): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const rawUrl = req.url ?? ''
    // Only handle /ws/<gameId> paths
    const match = rawUrl.match(/^\/ws\/([^/?]+)/)
    if (!match) { ws.close(); return }

    const gameId = match[1]
    const urlObj = new URL(rawUrl, 'http://localhost')
    const token = urlObj.searchParams.get('token') ?? ''
    let playerId: string | null = null

    // Authenticate and send initial snapshot
    ;(async () => {
      const player = db.select().from(game_players)
        .where(eq(game_players.player_token, token))
        .get()

      if (!player || player.game_id !== gameId) {
        ws.send(JSON.stringify({ type: 'ERROR', payload: { message: 'Unauthorized' } }))
        ws.close()
        return
      }

      playerId = player.id
      const game = db.select().from(games).where(eq(games.id, gameId)).get()
      if (!game) { ws.close(); return }

      joinRoom(gameId, player.id, { send: (d: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(d) } })

      const cfg = game.configuration as { board_id: string }
      const snapshot = await buildSnapshot(gameId, cfg.board_id)
      const seq = snapshot.last_event_sequence

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(makeEnvelope('GAME_SNAPSHOT', gameId, seq, snapshot as any)))
      }

      if (game.status === 'ACTIVE') {
        broadcast(gameId, makeEnvelope('PLAYER_RECONNECTED', gameId, seq, { playerId: player.id }), player.id)
      }
    })().catch(() => ws.close())

    ws.on('message', (data) => {
      if (!playerId) return
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'PONG') pongReceived(gameId, playerId!)
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => {
      if (playerId) {
        leaveRoom(gameId, playerId)
        broadcast(gameId, makeEnvelope('PLAYER_DISCONNECTED', gameId, 0, { playerId }))
      }
    })

    ws.on('error', () => {
      if (playerId) leaveRoom(gameId, playerId)
    })
  })

  return wss
}
