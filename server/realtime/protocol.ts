export interface WsEnvelope {
  type: string
  gameId: string
  seq: number
  serverTs: number
  payload: Record<string, unknown>
}

export function makeEnvelope(
  type: string,
  gameId: string,
  seq: number,
  payload: Record<string, unknown>,
): WsEnvelope {
  return { type, gameId, seq, serverTs: Date.now(), payload }
}
