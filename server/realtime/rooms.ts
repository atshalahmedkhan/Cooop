interface RoomConn {
  ws: { send(data: string): void }
  lastPong: number
}

// gameId -> Map<playerId, RoomConn>
const rooms = new Map<string, Map<string, RoomConn>>()

export function joinRoom(gameId: string, playerId: string, ws: { send(data: string): void }): void {
  if (!rooms.has(gameId)) rooms.set(gameId, new Map())
  rooms.get(gameId)!.set(playerId, { ws, lastPong: Date.now() })
}

export function leaveRoom(gameId: string, playerId: string): void {
  const room = rooms.get(gameId)
  if (!room) return
  room.delete(playerId)
  if (room.size === 0) rooms.delete(gameId)
}

export function pongReceived(gameId: string, playerId: string): void {
  const conn = rooms.get(gameId)?.get(playerId)
  if (conn) conn.lastPong = Date.now()
}

export function broadcastAll(gameId: string, msg: object): void {
  const room = rooms.get(gameId)
  if (!room) return
  const text = JSON.stringify(msg)
  for (const [, conn] of room) {
    try { conn.ws.send(text) } catch { /* ignore stale sockets */ }
  }
}

export function broadcast(gameId: string, msg: object, excludePlayerId?: string): void {
  const room = rooms.get(gameId)
  if (!room) return
  const text = JSON.stringify(msg)
  for (const [pid, conn] of room) {
    if (excludePlayerId && pid === excludePlayerId) continue
    try { conn.ws.send(text) } catch { /* ignore stale sockets */ }
  }
}

// Heartbeat: ping every 15 s; drop connections silent for 45 s+
setInterval(() => {
  const now = Date.now()
  for (const [gameId, room] of rooms) {
    for (const [playerId, conn] of room) {
      if (now - conn.lastPong > 45_000) {
        room.delete(playerId)
        continue
      }
      try { conn.ws.send(JSON.stringify({ type: 'PING' })) } catch { room.delete(playerId) }
    }
    if (room.size === 0) rooms.delete(gameId)
  }
}, 15_000)
