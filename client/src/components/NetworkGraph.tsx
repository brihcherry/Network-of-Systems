// NetworkGraph.tsx — D3 force-directed graph rendered in SVG.
// Ported from the legacy AngularJS force-graph directive (D3 v3) to React + D3 v7.

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { ProcessedNode, ProcessedEdge, TooltipData } from "@/types/graph";
import type { HighlightSet } from "@/lib/graphAnalysis";

interface NetworkGraphProps {
	nodes: ProcessedNode[];
	edges: ProcessedEdge[];
	onTooltipChange: (tooltip: TooltipData | null) => void;
	onNodeClick?: (nodeId: string) => void;
	highlightSet?: HighlightSet | null;
	isInteractionLocked?: boolean;
	/** Perpendicular bow distance for edges (px). 0 = straight lines. Default: 30. */
	curveOffset?: number;
	/** Merge A→B + B→A pairs into a single double-headed edge. Default: false. */
	mergeBidirectional?: boolean;
}

// Force layout parameters (matching legacy force-graph defaults)
const CHARGE_STRENGTH = -200;
const LINK_DISTANCE = 60;
const CENTER_GRAVITY = 0.09;
const NODE_RADIUS = 8;
const LABEL_FONT_SIZE = 10;
const ZOOM_EXTENT: [number, number] = [0.1, 10];

export const NetworkGraph = ({
	nodes,
	edges,
	onTooltipChange,
	onNodeClick,
	highlightSet,
	isInteractionLocked = false,
	curveOffset = 30,
	mergeBidirectional = false,
}: NetworkGraphProps) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const simulationRef = useRef<d3.Simulation<ProcessedNode, ProcessedEdge> | null>(null);
	const onTooltipChangeRef = useRef(onTooltipChange);
	onTooltipChangeRef.current = onTooltipChange;

	// Refs for D3 selections so we can update highlighting without re-initializing
	const nodeGroupRef = useRef<d3.Selection<SVGGElement, ProcessedNode, SVGGElement, unknown> | null>(null);
	const linkGroupRef = useRef<d3.Selection<SVGPathElement, ProcessedEdge, SVGGElement, unknown> | null>(null);

	// Keep a ref to the current highlightSet so hover handlers can read it synchronously
	const highlightSetRef = useRef<HighlightSet | null | undefined>(highlightSet);
	highlightSetRef.current = highlightSet;

	// Build a label lookup for edge tooltips
	const nodeLabelMap = useRef(new Map<string, string>());

	const initGraph = useCallback(() => {
		const svg = d3.select(svgRef.current);
		const container = containerRef.current;
		if (!container || !svgRef.current) return;

		const width = container.clientWidth;
		const height = container.clientHeight;

		svg.attr("width", width).attr("height", height);
		svg.selectAll("*").remove();

		// Build label lookup
		const labelMap = new Map<string, string>();
		for (const n of nodes) {
			labelMap.set(n.id, n.label);
		}
		nodeLabelMap.current = labelMap;

		// Merge bidirectional edge pairs (A→B + B→A) into a single double-headed edge.
		// Uses a canonical pair key so order doesn't matter. The first-seen edge is kept;
		// its bidirectional flag is set to true when the reverse is found.
		const pairKey = (a: string, b: string) => (a < b ? `${a}||${b}` : `${b}||${a}`);
		let workingEdges: ProcessedEdge[];
		if (mergeBidirectional) {
			const seen = new Map<string, ProcessedEdge>();
			const result: ProcessedEdge[] = [];
			for (const edge of edges) {
				const key = pairKey(edge.sourceId, edge.targetId);
				if (seen.has(key)) {
					const kept = seen.get(key)!;
					kept.bidirectional = true;
					// Store the reverse edge's metadata so the tooltip can show both directions.
					// The kept edge's source→target is one direction; the dropped edge's source
					// is the reverse direction (target→source from the kept edge's perspective).
					kept.reverseEdgeData = {
						edgeType: edge.edgeType,
						data: edge.data,
						format: edge.format,
						protocol: edge.protocol,
						frequency: edge.frequency,
						interfaceName: edge.interfaceName,
					};
				} else {
					edge.bidirectional = false; // reset in case of re-init
					seen.set(key, edge);
					result.push(edge);
				}
			}
			workingEdges = result;
		} else {
			workingEdges = edges;
		}

		// Arrow marker definitions
		const defs = svg.append("defs");
		// End arrowhead (all edges)
		defs.append("marker")
			.attr("id", "arrowhead")
			.attr("viewBox", "0 -5 10 10")
			.attr("refX", NODE_RADIUS + 10)
			.attr("refY", 0)
			.attr("markerWidth", 6)
			.attr("markerHeight", 6)
			.attr("orient", "auto")
			.append("path")
			.attr("d", "M0,-5L10,0L0,5")
			.attr("fill", "#999");
		// Start arrowhead (bidirectional edges only) — auto-start-reverse mirrors the
		// end marker so it points FROM the target back TOWARD the source.
		defs.append("marker")
			.attr("id", "arrowhead-start")
			.attr("viewBox", "0 -5 10 10")
			.attr("refX", NODE_RADIUS + 10)
			.attr("refY", 0)
			.attr("markerWidth", 6)
			.attr("markerHeight", 6)
			.attr("orient", "auto-start-reverse")
			.append("path")
			.attr("d", "M0,-5L10,0L0,5")
			.attr("fill", "#999");

		// Zoom group
		const g = svg.append("g");

		const zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent(ZOOM_EXTENT)
			.on("zoom", (event) => {
				g.attr("transform", event.transform);
			});

		svg.call(zoomBehavior);

		// Edges — rendered as <path> to support curved arcs for bidirectional pairs
		const linkGroup = g
			.append("g")
			.attr("class", "links")
			.selectAll("path")
			.data(workingEdges)
			.join("path")
			.attr("fill", "none")
			.attr("stroke", "#999")
			.attr("stroke-opacity", 0.6)
			.attr("stroke-width", 1.5)
			.attr("marker-end", "url(#arrowhead)")
			.attr("marker-start", (d) => (d.bidirectional ? "url(#arrowhead-start)" : null))
			.on("mouseenter", (event: MouseEvent, d: ProcessedEdge) => {
				onTooltipChangeRef.current({
					x: event.clientX + 12,
					y: event.clientY + 12,
					type: "edge",
					edge: d,
					sourceLabel: labelMap.get(d.sourceId) || "",
					targetLabel: labelMap.get(d.targetId) || "",
				});
			})
			.on("mouseleave", () => {
				onTooltipChangeRef.current(null);
			});

		linkGroupRef.current = linkGroup;

		// Nodes
		const nodeGroup = g
			.append("g")
			.attr("class", "nodes")
			.selectAll("g")
			.data(nodes)
			.join("g")
			.attr("cursor", "pointer");

		nodeGroupRef.current = nodeGroup;

		// Node circles
		nodeGroup
			.append("circle")
			.attr("r", NODE_RADIUS)
			.attr("fill", (d) => d.color)
			.attr("stroke", "#fff")
			.attr("stroke-width", 1.5);

		// Node labels
		nodeGroup
			.append("text")
			.text((d) => d.label)
			.attr("x", 0)
			.attr("y", NODE_RADIUS + LABEL_FONT_SIZE + 2)
			.attr("text-anchor", "middle")
			.attr("font-size", `${LABEL_FONT_SIZE}px`)
			.attr("fill", "#333")
			.attr("pointer-events", "none");

		// Node hover
		nodeGroup
			.on("mouseenter", (event: MouseEvent, d: ProcessedNode) => {
				d3.select(event.currentTarget as SVGGElement)
					.select("circle")
					.attr("stroke", "#000")
					.attr("stroke-width", 2.5);
				onTooltipChangeRef.current({
					x: event.clientX + 12,
					y: event.clientY + 12,
					type: "node",
					node: d,
				});
			})
			.on("mousemove", (event: MouseEvent, d: ProcessedNode) => {
				onTooltipChangeRef.current({
					x: event.clientX + 12,
					y: event.clientY + 12,
					type: "node",
					node: d,
				});
			})
			.on("mouseleave", (event: MouseEvent, d: ProcessedNode) => {
				const hs = highlightSetRef.current;
				const isHighlighted = hs && hs.nodeIds.size > 0 && hs.nodeIds.has(d.id);
				d3.select(event.currentTarget as SVGGElement)
					.select("circle")
					.attr("stroke", isHighlighted ? "#000" : "#fff")
					.attr("stroke-width", isHighlighted ? 2.5 : 1.5);
				onTooltipChangeRef.current(null);
			})
			.on("click", (event: MouseEvent, d: ProcessedNode) => {
				event.stopPropagation();
				onNodeClick?.(d.id);
			});

		// Drag behavior — always enabled, but simulation pauses when locked
		const drag = d3
			.drag<SVGGElement, ProcessedNode>()
			.on("start", (event, d) => {
				// When dragging starts, pause simulation to keep nodes in place
				// (unless already paused by lock)
				if (!event.active) simulation.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
				d3.select(event.sourceEvent.currentTarget).attr("cursor", "grabbing");
			})
			.on("drag", (event, d) => {
				d.fx = event.x;
				d.fy = event.y;
			})
			.on("end", (event, d) => {
				if (!event.active) simulation.alphaTarget(0);
				// In locked mode, keep node fixed at dropped position
				// In unlocked mode, release node to physics forces
				if (!isInteractionLocked) {
					d.fx = null;
					d.fy = null;
				}
				d3.select(event.sourceEvent.currentTarget).attr("cursor", "pointer");
			});

		nodeGroup
			.attr("cursor", "pointer")
			.call(drag);

		// Force simulation
		const simulation = d3
			.forceSimulation<ProcessedNode>(nodes)
			.force(
				"link",
				d3
					.forceLink<ProcessedNode, ProcessedEdge>(workingEdges)
					.id((d) => d.id)
					.distance(LINK_DISTANCE),
			)
			.force("charge", d3.forceManyBody().strength(CHARGE_STRENGTH))
			.force("center", d3.forceCenter(width / 2, height / 2))
			.force("gravity", d3.forceRadial(0, width / 2, height / 2).strength(CENTER_GRAVITY))
			.force("collide", d3.forceCollide(NODE_RADIUS + 4))
			.on("tick", () => {
				linkGroup.attr("d", (d) => {
					const sx = (d.source as ProcessedNode).x ?? 0;
					const sy = (d.source as ProcessedNode).y ?? 0;
					const tx = (d.target as ProcessedNode).x ?? 0;
					const ty = (d.target as ProcessedNode).y ?? 0;

					// Quadratic bezier — control point offset perpendicular to the midpoint.
					// Every edge curves the same way relative to its own direction vector,
					// so bidirectional pairs naturally bow to opposite sides.
					const mx = (sx + tx) / 2;
					const my = (sy + ty) / 2;
					const dx = tx - sx;
					const dy = ty - sy;
					const len = Math.sqrt(dx * dx + dy * dy) || 1;
					// Perpendicular unit vector
					const px = -dy / len;
					const py = dx / len;
const cx = mx + px * curveOffset;
				const cy = my + py * curveOffset;

					return `M ${sx},${sy} Q ${cx},${cy} ${tx},${ty}`;
				});

				nodeGroup.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
			});

		simulationRef.current = simulation;

		// Fit the graph into view after simulation settles
		simulation.on("end", () => {
			const bounds = (g.node() as SVGGElement)?.getBBox();
			if (!bounds) return;
			const pad = 40;
			const fullWidth = bounds.width + pad * 2;
			const fullHeight = bounds.height + pad * 2;
			const scale = Math.min(width / fullWidth, height / fullHeight, 1);
			const tx = (width - bounds.width * scale) / 2 - bounds.x * scale;
			const ty = (height - bounds.height * scale) / 2 - bounds.y * scale;
			svg.transition()
				.duration(500)
				.call(
					zoomBehavior.transform,
					d3.zoomIdentity.translate(tx, ty).scale(scale),
				);
		});
	}, [nodes, edges, curveOffset, mergeBidirectional, isInteractionLocked]);

	useEffect(() => {
		initGraph();

		const observer = new ResizeObserver(() => {
			if (simulationRef.current) {
				simulationRef.current.stop();
			}
			initGraph();
		});

		if (containerRef.current) {
			observer.observe(containerRef.current);
		}

		return () => {
			observer.disconnect();
			if (simulationRef.current) {
				simulationRef.current.stop();
			}
		};
	}, [initGraph]);

	// When lock state changes, pause or resume the simulation
	// Locked = no physics forces (nodes frozen but still draggable)
	// Unlocked = physics forces enabled (liquid-like motion)
	useEffect(() => {
		const simulation = simulationRef.current;
		if (!simulation) return;

		if (isInteractionLocked) {
			// Pause simulation — stops physics forces so nodes don't drift
			simulation.stop();
		} else {
			// Resume simulation — enables physics forces for free movement
			simulation.restart();
		}
	}, [isInteractionLocked]);

	// Apply or remove highlighting when highlightSet changes — without
	// re-initializing the simulation or the graph layout.
	useEffect(() => {
		const nodeGroup = nodeGroupRef.current;
		const linkGroup = linkGroupRef.current;
		if (!nodeGroup || !linkGroup) return;

		const TRANSITION_MS = 600;

		if (!highlightSet || highlightSet.nodeIds.size === 0) {
			// Reset: restore all nodes and edges to default appearance
			nodeGroup
				.select("circle")
				.transition()
				.duration(TRANSITION_MS)
				.attr("opacity", 1)
				.attr("stroke", "#fff")
				.attr("stroke-width", 1.5);

			nodeGroup
				.select("text")
				.transition()
				.duration(TRANSITION_MS)
				.attr("opacity", 1);

			linkGroup
				.transition()
				.duration(TRANSITION_MS)
				.attr("stroke", "#999")
				.attr("stroke-opacity", 0.6)
				.attr("stroke-width", 1.5);
		} else {
			// Highlight mode: bold the matched set, dim everything else
			nodeGroup.each(function (d) {
				const el = d3.select(this);
				const isHighlighted = highlightSet.nodeIds.has(d.id);

				el.select("circle")
					.transition()
					.duration(TRANSITION_MS)
					.attr("opacity", isHighlighted ? 1 : 0.15)
					.attr("stroke", isHighlighted ? "#000" : "#777")
					.attr("stroke-width", isHighlighted ? 2.5 : 1);

				el.select("text")
					.transition()
					.duration(TRANSITION_MS)
					.attr("opacity", isHighlighted ? 1 : 0.15);
			});

			linkGroup.each(function (d) {
				const el = d3.select(this);
				const isHighlighted = highlightSet.edgeIds.has(d.id);
				const isReverseHighlighted = highlightSet.reverseEdgeIds?.has(d.id) ?? false;

				if (isHighlighted) {
					// Primary match: full highlight
					el.transition()
						.duration(TRANSITION_MS)
						.attr("stroke", "#000")
						.attr("stroke-opacity", 1)
						.attr("stroke-width", 2.5);
				} else if (isReverseHighlighted) {
					// Reverse direction match: lighter highlight to show opposite direction
					el.transition()
						.duration(TRANSITION_MS)
						.attr("stroke", "#666")
						.attr("stroke-opacity", 0.5)
						.attr("stroke-width", 1.5);
				} else {
					// Not matched: dim
					el.transition()
						.duration(TRANSITION_MS)
						.attr("stroke", "#999")
						.attr("stroke-opacity", 0.08)
						.attr("stroke-width", 1);
				}
			});
		}
	}, [highlightSet]);

	return (
		<div ref={containerRef} className="w-full h-full">
			<svg
				ref={svgRef}
				className="w-full h-full"
				style={{ background: "#fafafa", cursor: "default" }}
			/>
		</div>
	);
};
