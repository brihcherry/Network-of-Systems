// Graph analysis algorithms — pure TypeScript implementations of
// loop (cycle) detection and island (disconnected component) detection.
// These operate entirely in-memory on the processed graph data.

import type { ProcessedNode, ProcessedEdge } from "@/types/graph";

/** Result of a graph analysis: sets of node/edge IDs to highlight. */
export interface HighlightSet {
	nodeIds: Set<string>;
	edgeIds: Set<string>;
	reverseEdgeIds?: Set<string>; // edges that match the opposite direction (for bidirectional highlighting)
}

/**
 * Find all nodes and edges that participate in directed cycles (loops).
 * Uses iterative DFS with back-edge detection on the directed graph.
 */
export function findLoops(
	nodes: ProcessedNode[],
	edges: ProcessedEdge[],
): HighlightSet {
	// Build adjacency list: nodeId → outgoing edges
	const adjList = new Map<string, ProcessedEdge[]>();
	for (const node of nodes) {
		adjList.set(node.id, []);
	}
	for (const edge of edges) {
		const sourceId =
			typeof edge.source === "string" ? edge.source : (edge.source as ProcessedNode).id;
		adjList.get(sourceId)?.push(edge);
	}

	const loopNodeIds = new Set<string>();
	const loopEdgeIds = new Set<string>();

	// For each node, run DFS to find cycles
	const WHITE = 0; // unvisited
	const GRAY = 1; // in current DFS path
	const BLACK = 2; // fully processed
	const color = new Map<string, number>();
	for (const node of nodes) {
		color.set(node.id, WHITE);
	}

	// Track the parent edge for each node in the current DFS path
	// so we can collect all edges in the cycle when a back-edge is found
	const pathEdges = new Map<string, ProcessedEdge>(); // nodeId → edge that led to it
	const pathSet = new Set<string>(); // nodes in current DFS stack

	function getSourceId(edge: ProcessedEdge): string {
		return typeof edge.source === "string"
			? edge.source
			: (edge.source as ProcessedNode).id;
	}
	function getTargetId(edge: ProcessedEdge): string {
		return typeof edge.target === "string"
			? edge.target
			: (edge.target as ProcessedNode).id;
	}

	function dfs(nodeId: string): void {
		color.set(nodeId, GRAY);
		pathSet.add(nodeId);

		for (const edge of adjList.get(nodeId) || []) {
			const targetId = getTargetId(edge);
			const targetColor = color.get(targetId);

			if (targetColor === GRAY && pathSet.has(targetId)) {
				// Back-edge found — cycle detected
				// Mark this edge and trace back through the path to collect the cycle
				loopEdgeIds.add(edge.id);
				loopNodeIds.add(nodeId);
				loopNodeIds.add(targetId);

				// Walk back from nodeId to targetId through pathEdges to mark the full cycle
				let current = nodeId;
				while (current !== targetId) {
					const parentEdge = pathEdges.get(current);
					if (!parentEdge) break;
					loopEdgeIds.add(parentEdge.id);
					current = getSourceId(parentEdge);
					loopNodeIds.add(current);
				}
			} else if (targetColor === WHITE) {
				pathEdges.set(targetId, edge);
				dfs(targetId);
			}
		}

		pathSet.delete(nodeId);
		color.set(nodeId, BLACK);
	}

	for (const node of nodes) {
		if (color.get(node.id) === WHITE) {
			dfs(node.id);
		}
	}

	return { nodeIds: loopNodeIds, edgeIds: loopEdgeIds };
}

/**
 * Find "island" nodes — nodes that are NOT reachable from/to the central
 * DataObject node ("Admissions"). These are disconnected clusters that have
 * no path connecting them to the main hub.
 *
 * We treat the graph as undirected for reachability (any connection counts).
 */
export function findIslands(
	nodes: ProcessedNode[],
	edges: ProcessedEdge[],
): HighlightSet {
	// Find the Admissions DataObject node (the central hub)
	const admissionsNode = nodes.find(
		(n) => n.type === "DataObject",
	);

	if (!admissionsNode) {
		// No DataObject found — everything is an island
		return {
			nodeIds: new Set(nodes.map((n) => n.id)),
			edgeIds: new Set(edges.map((e) => e.id)),
		};
	}

	// Build undirected adjacency list
	const neighbors = new Map<string, Set<string>>();
	const edgesByPair = new Map<string, ProcessedEdge[]>();

	for (const node of nodes) {
		neighbors.set(node.id, new Set());
	}

	function getSourceId(edge: ProcessedEdge): string {
		return typeof edge.source === "string"
			? edge.source
			: (edge.source as ProcessedNode).id;
	}
	function getTargetId(edge: ProcessedEdge): string {
		return typeof edge.target === "string"
			? edge.target
			: (edge.target as ProcessedNode).id;
	}

	for (const edge of edges) {
		const sId = getSourceId(edge);
		const tId = getTargetId(edge);
		neighbors.get(sId)?.add(tId);
		neighbors.get(tId)?.add(sId);

		// Track edges for later marking
		const pairKey = [sId, tId].sort().join("|");
		if (!edgesByPair.has(pairKey)) edgesByPair.set(pairKey, []);
		edgesByPair.get(pairKey)!.push(edge);
	}

	// BFS from the Admissions node to find all reachable nodes
	const reachable = new Set<string>();
	const queue = [admissionsNode.id];
	reachable.add(admissionsNode.id);

	while (queue.length > 0) {
		const current = queue.shift()!;
		for (const neighbor of neighbors.get(current) || []) {
			if (!reachable.has(neighbor)) {
				reachable.add(neighbor);
				queue.push(neighbor);
			}
		}
	}

	// Island nodes = all nodes NOT reachable from Admissions
	const islandNodeIds = new Set<string>();
	for (const node of nodes) {
		if (!reachable.has(node.id)) {
			islandNodeIds.add(node.id);
		}
	}

	// Island edges = edges where BOTH endpoints are island nodes
	const islandEdgeIds = new Set<string>();
	for (const edge of edges) {
		const sId = getSourceId(edge);
		const tId = getTargetId(edge);
		if (islandNodeIds.has(sId) && islandNodeIds.has(tId)) {
			islandEdgeIds.add(edge.id);
		}
	}

	return { nodeIds: islandNodeIds, edgeIds: islandEdgeIds };
}

/**
 * Get connections expanding N levels from a selected node in a given direction.
 * Progressive exploration: depth=0 → direct connections, depth=1 → next level out, etc.
 * Handles bidirectional edges by tracking reverse-direction edges separately.
 * @param selectedNode - starting node ID
 * @param mode - "adjacent" (both directions), "upstream" (incoming), or "downstream" (outgoing)
 * @param edges - all edges in the graph
 * @param depth - how many levels to expand (0 = direct only, 1 = direct + their connections, etc.)
 */
export function getConnectionsAtDepth(
	selectedNode: string,
	mode: "adjacent" | "upstream" | "downstream",
	edges: ProcessedEdge[],
	dataObjectNodeIds: Set<string>,
	depth: number,
): HighlightSet {
	const nodeIds = new Set<string>();
	const edgeIds = new Set<string>();
	const reverseEdgeIds = new Set<string>(); // edges that match opposite direction

	// Always include the selected node
	nodeIds.add(selectedNode);

	// Track visited nodes to avoid re-expanding inward
	const visited = new Set<string>([selectedNode]);

	// Start with the selected node as the frontier
	let frontier = new Set<string>([selectedNode]);

	// For each depth level
	for (let level = 0; level <= depth; level++) {
		const nextFrontier = new Set<string>();

		// Find all edges from/to nodes in current frontier
		for (const edge of edges) {
			const sourceId = edge.sourceId;
			const targetId = edge.targetId;
			const edgeType = (edge.edgeType || "").toLowerCase();

			// DataObject connections are treated as outward-only.
			// Ignore any edge that points INTO a DataObject (System -> DataObject).
			if (dataObjectNodeIds.has(targetId) && !dataObjectNodeIds.has(sourceId)) {
				continue;
			}

			let isMatch = false;
			let isReverse = false;
			let fromFrontier = false;
			let connectedNode: string | null = null;

			if (mode === "adjacent") {
				// Both directions
				if (frontier.has(sourceId)) {
					isMatch = true;
					fromFrontier = true;
					connectedNode = targetId;
				} else if (frontier.has(targetId)) {
					isMatch = true;
					fromFrontier = true;
					connectedNode = sourceId;
				}
			} else if (mode === "upstream") {
				// Incoming Provide only: frontier node is the target
				if (edgeType === "provide" && frontier.has(targetId)) {
					isMatch = true;
					fromFrontier = true;
					connectedNode = sourceId;
				} else if (edgeType === "provide" && frontier.has(sourceId)) {
					// Reverse direction: frontier node is source, but edge goes the opposite way
					isReverse = true;
				}
			} else if (mode === "downstream") {
				// Outgoing Provide/Relation only: frontier node is the source
				const isAllowedDownstreamType = edgeType === "provide" || edgeType === "relation";
				if (isAllowedDownstreamType && frontier.has(sourceId)) {
					isMatch = true;
					fromFrontier = true;
					connectedNode = targetId;
				} else if (isAllowedDownstreamType && frontier.has(targetId)) {
					// Reverse direction: frontier node is target, but edge goes the opposite way
					isReverse = true;
				}
			}

			// If edge matches current frontier, mark it and add connected node to next frontier
			if (isMatch && fromFrontier && connectedNode !== null) {
				edgeIds.add(edge.id);
				nodeIds.add(connectedNode);
				if (!visited.has(connectedNode)) {
					nextFrontier.add(connectedNode);
					visited.add(connectedNode);
				}
			}

			// If edge matches reverse direction (bidirectional case), mark it separately
			if (isReverse) {
				reverseEdgeIds.add(edge.id);
			}
		}

		// Move to next level
		frontier = nextFrontier;

		// Stop if no new frontier nodes
		if (frontier.size === 0) break;
	}

	return { nodeIds, edgeIds, reverseEdgeIds: reverseEdgeIds.size > 0 ? reverseEdgeIds : undefined };
}
