// Type definitions for the Network of Systems graph data.
// Mirrors the shape of admissions_data.json (InterfaceGraphPlaySheet / GraphDataModel).

/** Raw node from the JSON "nodes" object (keyed by URI). */
export interface RawGraphNode {
	uri: string;
	propHash: Record<string, unknown>;
}

/** Raw edge from the JSON "edges" array. */
export interface RawGraphEdge {
	uri: string;
	source: string;
	target: string;
	propHash: Record<string, unknown>;
}

/** Top-level shape of admissions_data.json. */
export interface RawGraphData {
	layout: string;
	nodes: Record<string, RawGraphNode>;
	edges: RawGraphEdge[];
	title: string;
	insightID: string;
	dataMakerName: string;
}

/** Processed node ready for D3 force simulation. */
export interface ProcessedNode extends d3.SimulationNodeDatum {
	id: string;
	label: string;
	type: string;
	color: string;
	fullName: string;
	description: string;
	connectionCount: number;
	propHash: Record<string, unknown>;
}

/** Processed edge ready for D3 force simulation. */
export interface ProcessedEdge extends d3.SimulationLinkDatum<ProcessedNode> {
	id: string;
	sourceId: string;
	targetId: string;
	edgeType: string;
	edgeName: string;
	data: string;
	format: string;
	protocol: string;
	frequency: string;
	interfaceName: string;
	/** Set by NetworkGraph when mergeBidirectional=true: two opposite edges merged into one. */
	bidirectional?: boolean;
	/** Metadata from the reverse edge (target→source) when bidirectional=true. */
	reverseEdgeData?: {
		edgeType: string;
		data: string;
		format: string;
		protocol: string;
		frequency: string;
		interfaceName: string;
	};
}

/** Tooltip data for hover display. */
export interface TooltipData {
	x: number;
	y: number;
	type: "node" | "edge";
	node?: ProcessedNode;
	edge?: ProcessedEdge;
	sourceLabel?: string;
	targetLabel?: string;
}

/** Legend entry for a node type. */
export interface LegendEntry {
	type: string;
	color: string;
	count: number;
}
