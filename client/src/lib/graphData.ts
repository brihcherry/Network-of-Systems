// Transforms raw graph data (from reactor or static JSON) into processed
// nodes and edges ready for D3 force simulation.

import type {
	RawGraphData,
	ProcessedNode,
	ProcessedEdge,
	LegendEntry,
} from "@/types/graph";

/** Extract a clean string from a propHash value, stripping wrapping quotes. */
function cleanPropString(value: unknown): string {
	if (value == null) return "";
	const str = String(value);
	// Many values are wrapped like "\"Theater\"" — strip outer quotes
	if (str.startsWith('"') && str.endsWith('"')) {
		return str.slice(1, -1);
	}
	return str;
}

/** Convert VERTEX_COLOR_PROPERTY "R,G,B" string to CSS rgb(). */
function rgbString(raw: unknown): string {
	const str = cleanPropString(raw);
	const parts = str.split(",").map((s) => s.trim());
	if (parts.length === 3 && parts.every((p) => !isNaN(Number(p)))) {
		return `rgb(${parts[0]},${parts[1]},${parts[2]})`;
	}
	return "rgb(120,120,120)"; // fallback gray
}

/** Truncate description to a readable excerpt. */
function truncateDescription(raw: unknown, maxLen = 200): string {
	const desc = cleanPropString(raw).replace(/_/g, " ");
	if (desc.length <= maxLen) return desc;
	return desc.slice(0, maxLen) + "…";
}

export interface GraphDataResult {
	nodes: ProcessedNode[];
	edges: ProcessedEdge[];
	legend: LegendEntry[];
	title: string;
}

/** Process raw graph data into the structures needed for rendering. */
export function getGraphData(data: RawGraphData): GraphDataResult {
	// Build node map from the nodes object (keyed by URI)
	const nodeMap = new Map<string, ProcessedNode>();
	const typeCounts = new Map<string, { color: string; count: number }>();

	for (const [uri, rawNode] of Object.entries(data.nodes)) {
		const ph = rawNode.propHash;
		const type = cleanPropString(ph.VERTEX_TYPE_PROPERTY) || "Unknown";
		const color = rgbString(ph.VERTEX_COLOR_PROPERTY);
		const label = cleanPropString(ph.VERTEX_LABEL_PROPERTY) || uri.split("/").pop() || uri;

		const node: ProcessedNode = {
			id: uri,
			label,
			type,
			color,
			fullName: cleanPropString(ph.Full_System_Name).replace(/_/g, " "),
			description: truncateDescription(ph.Description),
			connectionCount: 0,
			propHash: ph,
		};

		nodeMap.set(uri, node);

		// Track legend counts
		const existing = typeCounts.get(type);
		if (existing) {
			existing.count++;
		} else {
			typeCounts.set(type, { color, count: 1 });
		}
	}

	// Process edges — only include edges where both source and target exist in node map
	const edges: ProcessedEdge[] = [];
	for (const rawEdge of data.edges) {
		const sourceNode = nodeMap.get(rawEdge.source);
		const targetNode = nodeMap.get(rawEdge.target);
		if (!sourceNode || !targetNode) continue;

		sourceNode.connectionCount++;
		targetNode.connectionCount++;

		const ph = rawEdge.propHash;
		edges.push({
			id: rawEdge.uri,
			source: sourceNode,
			target: targetNode,
			sourceId: rawEdge.source,
			targetId: rawEdge.target,
			edgeType: cleanPropString(ph.EDGE_TYPE) || "Unknown",
			edgeName: cleanPropString(ph.EDGE_NAME) || "",
			data: cleanPropString(ph.Data) || "",
			format: cleanPropString(ph.Format) || "",
			protocol: cleanPropString(ph.Protocol) || "",
			frequency: cleanPropString(ph.Frequency) || "",
			interfaceName: cleanPropString(ph.Interface_Name) || "",
		});
	}

	const nodes = Array.from(nodeMap.values());

	// Build legend entries sorted by count descending
	const legend: LegendEntry[] = Array.from(typeCounts.entries())
		.map(([type, { color, count }]) => ({ type, color, count }))
		.sort((a, b) => b.count - a.count);

	return {
		nodes,
		edges,
		legend,
		title: data.title || "Network of Systems",
	};
}
