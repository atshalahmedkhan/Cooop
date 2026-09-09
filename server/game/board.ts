import { db } from '../db/client.js'
import { board_nodes, board_edges } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { ReachablePath } from '../types.js'
import { randomUUID } from 'node:crypto'

export interface GraphNode {
  id: string
  node_key: number
  type: string
  label: string
  topic: string | null
}

export interface GraphEdge {
  id: string
  from_node_id: string
  to_node_id: string
  is_fork: boolean
}

export interface BoardGraph {
  nodes: Map<string, GraphNode>   // id → node
  byKey: Map<number, GraphNode>   // node_key → node
  edges: Map<string, GraphEdge[]> // from_node_id → edges
}

// Cache board graph in memory (board rarely changes)
let cachedGraph: BoardGraph | null = null

export function getBoardGraph(boardId: string): BoardGraph {
  if (cachedGraph) return cachedGraph

  const nodes = db.select().from(board_nodes).where(eq(board_nodes.board_id, boardId)).all()
  const edges = db.select().from(board_edges).where(eq(board_edges.board_id, boardId)).all()

  const nodeMap = new Map<string, GraphNode>()
  const byKey = new Map<number, GraphNode>()
  const edgeMap = new Map<string, GraphEdge[]>()

  for (const n of nodes) {
    const node: GraphNode = { id: n.id, node_key: n.node_key, type: n.type, label: n.label, topic: n.topic ?? null }
    nodeMap.set(n.id, node)
    byKey.set(n.node_key, node)
  }

  for (const e of edges) {
    const meta = (e.metadata as { is_fork?: boolean } | null) ?? {}
    const edge: GraphEdge = { id: e.id, from_node_id: e.from_node_id, to_node_id: e.to_node_id, is_fork: meta.is_fork ?? false }
    const list = edgeMap.get(e.from_node_id) ?? []
    list.push(edge)
    edgeMap.set(e.from_node_id, list)
  }

  cachedGraph = { nodes: nodeMap, byKey, edges: edgeMap }
  return cachedGraph
}

export function invalidateBoardCache() {
  cachedGraph = null
}

// Returns all unique destination nodes reachable in exactly `steps` moves
// following all possible edge paths (BFS).
// Returns an array of ReachablePath objects.
export function computeReachablePaths(
  graph: BoardGraph,
  fromNodeId: string,
  steps: number,
): ReachablePath[] {
  // BFS: each state is { nodeId, stepsLeft, path: string[] }
  interface State { nodeId: string; stepsLeft: number; path: string[] }

  const queue: State[] = [{ nodeId: fromNodeId, stepsLeft: steps, path: [fromNodeId] }]
  const results: Map<string, ReachablePath> = new Map()

  while (queue.length > 0) {
    const { nodeId, stepsLeft, path } = queue.shift()!

    if (stepsLeft === 0) {
      // Reached destination
      const node = graph.nodes.get(nodeId)!
      const pathId = path.join('→')
      if (!results.has(pathId)) {
        results.set(pathId, {
          path_id: randomUUID(),
          node_ids: path.map(id => graph.nodes.get(id)!.node_key),
          destination_node_id: node.node_key,
          label: node.label,
        })
      }
      continue
    }

    const nextEdges = graph.edges.get(nodeId) ?? []
    for (const edge of nextEdges) {
      queue.push({ nodeId: edge.to_node_id, stepsLeft: stepsLeft - 1, path: [...path, edge.to_node_id] })
    }
  }

  // Deduplicate by destination_node_id — if multiple paths reach the same node
  // (due to branches reconnecting), merge them so the player sees one choice per destination.
  const byDest = new Map<number, ReachablePath>()
  for (const p of results.values()) {
    const existing = byDest.get(p.destination_node_id)
    if (!existing) {
      byDest.set(p.destination_node_id, p)
    }
    // keep the first path found for each destination
  }

  return Array.from(byDest.values())
}

export function hasForkInPath(graph: BoardGraph, fromNodeId: string, steps: number): boolean {
  const paths = computeReachablePaths(graph, fromNodeId, steps)
  return paths.length > 1
}

export function getStartNodeId(graph: BoardGraph): string {
  const startNode = graph.byKey.get(0)
  if (!startNode) throw new Error('Start node (key=0) not found in board graph')
  return startNode.id
}

export function getNodeByKey(graph: BoardGraph, key: number): GraphNode | undefined {
  return graph.byKey.get(key)
}

export function getNodeById(graph: BoardGraph, id: string): GraphNode | undefined {
  return graph.nodes.get(id)
}
