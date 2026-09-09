import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from '../db/client.js'
import { seed } from '../db/seed.js'
import { getBoardGraph, computeReachablePaths, invalidateBoardCache } from '../game/board.js'
import { db } from '../db/client.js'
import { boards } from '../db/schema.js'
import { eq } from 'drizzle-orm'

let boardId: string

beforeAll(async () => {
  initDb()
  await seed()
  invalidateBoardCache()
  const board = db.select().from(boards).where(eq(boards.active, true)).get()!
  boardId = board.id
})

describe('getBoardGraph', () => {
  it('loads 32 nodes', () => {
    const graph = getBoardGraph(boardId)
    expect(graph.nodes.size).toBe(32)
  })

  it('node 0 is START/CORNER type', () => {
    const graph = getBoardGraph(boardId)
    const node = graph.byKey.get(0)
    expect(node).toBeDefined()
    expect(node!.type).toBe('CORNER')
  })

  it('node 4 has more than 1 outgoing edge (fork)', () => {
    const graph = getBoardGraph(boardId)
    const node4 = graph.byKey.get(4)!
    const edges = graph.edges.get(node4.id) ?? []
    expect(edges.length).toBeGreaterThanOrEqual(2)
  })
})

describe('computeReachablePaths', () => {
  it('returns 1 path on simple ring segment', () => {
    const graph = getBoardGraph(boardId)
    const node0 = graph.byKey.get(0)!
    const paths = computeReachablePaths(graph, node0.id, 1)
    // Node 0 → Node 1 (single edge)
    expect(paths.length).toBe(1)
    expect(paths[0].destination_node_id).toBe(1)
  })

  it('wraps around from node 31 → node 0 with 1 step', () => {
    const graph = getBoardGraph(boardId)
    const node31 = graph.byKey.get(31)!
    const paths = computeReachablePaths(graph, node31.id, 1)
    expect(paths.some(p => p.destination_node_id === 0)).toBe(true)
  })

  it('detects fork near node 4', () => {
    const graph = getBoardGraph(boardId)
    // Starting from node 3, rolling 2: can reach either 5 (via 4→5) or 8 (via 4→8)
    const node3 = graph.byKey.get(3)!
    const paths = computeReachablePaths(graph, node3.id, 2)
    const destinations = paths.map(p => p.destination_node_id)
    // Should have 2 distinct destinations because of the fork at node 4
    expect(destinations.length).toBeGreaterThanOrEqual(2)
    expect(destinations).toContain(5)
    expect(destinations).toContain(8)
  })

  it('returns at least 1 path for any starting node and step 1-6', () => {
    const graph = getBoardGraph(boardId)
    for (let key = 0; key < 32; key++) {
      const node = graph.byKey.get(key)!
      for (let steps = 1; steps <= 6; steps++) {
        const paths = computeReachablePaths(graph, node.id, steps)
        expect(paths.length).toBeGreaterThanOrEqual(1)
      }
    }
  })
})
