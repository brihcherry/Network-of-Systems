// NetworkPage.tsx — Full-screen page that renders the network of systems graph.
// Phase 1: fetch DataObject list from backend → show dropdown.
// Phase 2: once a DataObject is selected → fetch graph via reactor → render.

import { useMemo, useState, useCallback, useEffect } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { NetworkGraph } from "@/components/NetworkGraph";
import { GraphTooltip } from "@/components/GraphTooltip";
import { GraphLegend } from "@/components/GraphLegend";
import { GraphSidebar, type AnalysisMode, type ConnectionMode } from "@/components/GraphSidebar";
import { getGraphData, type GraphDataResult } from "@/lib/graphData";
import { findLoops, findIslands, type HighlightSet, getConnectionsAtDepth } from "@/lib/graphAnalysis";
import type { TooltipData, RawGraphData } from "@/types/graph";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

interface DataObjectOption {
	uri: string;
	label: string;
}

interface NetworkPageProps {
	/** Controls edge rendering style. Default: "curved" (bowed arcs, separate per direction). */
	edgeStyle?: "curved" | "straight-bidir";
}

export const NetworkPage = ({ edgeStyle = "curved" }: NetworkPageProps) => {
	const { insightId } = useInsight();

	const curveOffset = edgeStyle === "straight-bidir" ? 0 : 30;
	const mergeBidirectional = edgeStyle === "straight-bidir";

	// Dropdown state
	const [dataObjects, setDataObjects] = useState<DataObjectOption[]>([]);
	const [isLoadingOptions, setIsLoadingOptions] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [selectedDataObject, setSelectedDataObject] = useState<DataObjectOption | null>(null);

	// Graph state
	const [graphData, setGraphData] = useState<GraphDataResult | null>(null);
	const [isLoadingGraph, setIsLoadingGraph] = useState(false);
	const [graphError, setGraphError] = useState<string | null>(null);
	const [tooltip, setTooltip] = useState<TooltipData | null>(null);
	const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("none");
	const [isGraphLocked, setIsGraphLocked] = useState(false);
	const [latencySliderMinutes, setLatencySliderMinutes] = useState(60_000);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
	const [connectionDepth, setConnectionDepth] = useState(0);
	
	// Latency analysis: single-call caching pattern matching legacy DataLatencyPerformer.
	// Reactor computes ALL edge scores in one call (fixed 1000h threshold), returns grouped result.
	// Frontend caches the result and filters by slider value client-side on each movement.
	const [latencyCachedResult, setLatencyCachedResult] = useState<Record<string, any> | null>(null);
	const [isLoadingLatency, setIsLoadingLatency] = useState(false);
	const [latencyHighlight, setLatencyHighlight] = useState<HighlightSet | null>(null);

	// ── Phase 1: Fetch DataObject list on mount ──────────────────────────────
	useEffect(() => {
		if (!insightId) return;

		let cancelled = false;
		const pixel = `ListDataObjects(database=["${DATABASE_ID}"]);`;

		setIsLoadingOptions(true);
		setLoadError(null);

		runPixel(pixel, insightId)
			.then((response) => {
				if (cancelled) return;
				if (response.errors.length > 0) {
					setLoadError(response.errors.join(", "));
					return;
				}
				const output = response.pixelReturn[0]?.output;
				if (Array.isArray(output)) {
					setDataObjects(output);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setLoadError(err instanceof Error ? err.message : "Failed to load data objects");
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoadingOptions(false);
			});

		return () => { cancelled = true; };
	}, [insightId]);

	// ── Phase 2: Fetch graph data when a DataObject is selected ──────────────
	useEffect(() => {
		if (!insightId || !selectedDataObject) return;

		let cancelled = false;
		const pixel = `GetGraphForDataObject(database=["${DATABASE_ID}"], dataObject=["${selectedDataObject.uri}"]);`;

		setIsLoadingGraph(true);
		setGraphError(null);
		setGraphData(null);

		runPixel(pixel, insightId)
			.then((response) => {
				if (cancelled) return;
				if (response.errors.length > 0) {
					setGraphError(response.errors.join(", "));
					return;
				}
				const output = response.pixelReturn[0]?.output as RawGraphData;
				if (output && output.nodes && output.edges) {
					setGraphData(getGraphData(output));
				} else {
					setGraphError("Unexpected response format from server");
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setGraphError(err instanceof Error ? err.message : "Failed to load graph");
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoadingGraph(false);
			});

		return () => { cancelled = true; };
	}, [insightId, selectedDataObject]);

	const loopResult = useMemo(
		() => (graphData ? findLoops(graphData.nodes, graphData.edges) : null),
		[graphData],
	);
	const islandResult = useMemo(
		() => (graphData ? findIslands(graphData.nodes, graphData.edges) : null),
		[graphData],
	);
	const dataObjectNodeIds = useMemo(() => {
		if (!graphData) return new Set<string>();
		return new Set(graphData.nodes.filter((node) => node.type === "DataObject").map((node) => node.id));
	}, [graphData]);

	const highlightSet: HighlightSet | null = useMemo(() => {
		if (!loopResult || !islandResult) return null;
		switch (analysisMode) {
			case "loops":
				return loopResult;
			case "islands":
				return islandResult;
			case "latency":
				return latencyHighlight;
			case "connections": {
				if (!selectedNode || !connectionMode || !graphData) return null;
				return getConnectionsAtDepth(
					selectedNode,
					connectionMode,
					graphData.edges,
					dataObjectNodeIds,
					connectionDepth,
				);
			}
			default:
				return null;
		}
	}, [analysisMode, loopResult, islandResult, latencyHighlight, selectedNode, connectionMode, connectionDepth, graphData, dataObjectNodeIds]);

	// Check if we can expand connections further
	const canExpandConnections = useMemo(() => {
		if (analysisMode !== "connections" || !selectedNode || !connectionMode || !graphData) {
			return false;
		}
		const currentHighlight = getConnectionsAtDepth(
			selectedNode,
			connectionMode,
			graphData.edges,
			dataObjectNodeIds,
			connectionDepth,
		);
		const nextHighlight = getConnectionsAtDepth(
			selectedNode,
			connectionMode,
			graphData.edges,
			dataObjectNodeIds,
			connectionDepth + 1,
		);
		// Can expand if the next level would have more nodes than current
		return nextHighlight.nodeIds.size > currentHighlight.nodeIds.size;
	}, [analysisMode, selectedNode, connectionMode, connectionDepth, graphData, dataObjectNodeIds]);

	// ── Phase 3a: Fetch latency result ONCE when entering latency analysis mode ───────────
	// Reactor computes all scores at fixed 1000h threshold. Frontend caches and filters.
	useEffect(() => {
		if (
			analysisMode !== "latency"
			|| !insightId
			|| !selectedDataObject
			|| !graphData
		) {
			setLatencyCachedResult(null);
			return;
		}

		let cancelled = false;
		// Single call: no thresholdHours parameter. Reactor uses fixed 1000h and returns all scores.
		// selectedNodeUri omitted here to match legacy pattern (all roots, no specific node selected).
		const pixel = `RunDataLatencyAnalysis(database=["${DATABASE_ID}"], dataObject=["${selectedDataObject.uri}"]);`;

		setIsLoadingLatency(true);

		runPixel(pixel, insightId)
			.then((response) => {
				if (cancelled) return;
				if (response.errors.length > 0) {
					console.error("Latency analysis error:", response.errors);
					setLatencyCachedResult(null);
					return;
				}
				const output = response.pixelReturn[0]?.output as Record<string, any>;
				if (output) {
					// Cache the full grouped result (e.g., { "24.0": [...], "168.0": [...], "0.0": [...] })
					setLatencyCachedResult(output);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					console.error("Failed to fetch latency data:", err);
					setLatencyCachedResult(null);
				}
			})
			.finally(() => {
				if (!cancelled) setIsLoadingLatency(false);
			});

		return () => { cancelled = true; };
	}, [analysisMode, insightId, selectedDataObject, graphData]);

	// ── Phase 3b: Filter cached latency result based on slider value ──────────────────────
	// As user moves slider, client-side code selects which score buckets to highlight.
	// Avoids repeated backend calls; matches legacy UI pattern.
	useEffect(() => {
		if (analysisMode !== "latency" || !latencyCachedResult) {
			setLatencyHighlight(null);
			return;
		}

		// slider is in minutes (e.g., 60000 = 1000 hours)
		const thresholdHours = latencySliderMinutes / 60;

		// Collect nodes and edges whose score is <= threshold.
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();

		// Iterate over score buckets (keys are string representations like "24.0", "168.0", "0.0")
		Object.entries(latencyCachedResult).forEach(([scoreKey, edgeList]) => {
			// Skip metadata and non-edge entries
			if (scoreKey.startsWith("_") || !Array.isArray(edgeList)) {
				return;
			}

			const score = parseFloat(scoreKey);
			if (!isNaN(score) && score <= thresholdHours) {
				(edgeList as Array<{ uri: string; source: string; target: string }>).forEach(
					(edge) => {
						edgeIds.add(edge.uri);
						if (edge.source) nodeIds.add(edge.source);
						if (edge.target) nodeIds.add(edge.target);
					},
				);
			}
		});

		setLatencyHighlight({ nodeIds, edgeIds });
	}, [analysisMode, latencyCachedResult, latencySliderMinutes]);

	const handleModeChange = useCallback((mode: AnalysisMode) => {
		setAnalysisMode(mode);
		if (mode !== "latency") {
			setLatencyHighlight(null);
			setLatencyCachedResult(null); // Clear cached latency data when exiting latency mode
		}
	}, []);

	const handleSelect = useCallback((uri: string) => {
		const found = dataObjects.find((d) => d.uri === uri);
		if (found) {
			setSelectedDataObject(found);
			setAnalysisMode("none");
		}
	}, [dataObjects]);

	const handleBack = useCallback(() => {
		setSelectedDataObject(null);
		setAnalysisMode("none");
		setIsGraphLocked(false);
		setLatencyHighlight(null);
		setLatencyCachedResult(null); // Clear cached latency data
		setTooltip(null);
		setSelectedNode(null);
		setConnectionMode(null);
		setConnectionDepth(0);
	}, []);

	const handleNodeClick = useCallback((nodeId: string) => {
		setSelectedNode(nodeId);
		setConnectionMode(null); // Reset connection mode when selecting a new node
		setConnectionDepth(0); // Reset depth when selecting a new node
	}, []);

	const handleNodeDeselect = useCallback(() => {
		setSelectedNode(null);
		setConnectionMode(null);
		setConnectionDepth(0);
	}, []);

	const handleConnectionModeChange = useCallback((mode: ConnectionMode | null) => {
		setConnectionMode(mode);
		setConnectionDepth(0); // Reset depth when changing mode
	}, []);

	const handleExpandConnections = useCallback(() => {
		setConnectionDepth((prev) => prev + 1);
	}, []);

	// ── Selection screen ──────────────────────────────────────────────────────
	if (!selectedDataObject) {
		return (
			<div className="flex flex-col h-full">
				<header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
					<h1 className="text-lg font-semibold text-gray-900">
						Network of Systems
					</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						Select a data object to view its system network
					</p>
				</header>

				<div className="flex-1 flex items-center justify-center bg-gray-50">
					<div className="w-full max-w-md px-6">
						{isLoadingOptions && (
							<div className="text-center">
								<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
								<p className="mt-3 text-sm text-gray-500">
									Loading available data objects…
								</p>
							</div>
						)}

						{loadError && (
							<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
								<p className="text-sm font-medium text-red-800">
									Failed to load data objects
								</p>
								<p className="mt-1 text-xs text-red-600">{loadError}</p>
							</div>
						)}

						{!isLoadingOptions && !loadError && (
							<div>
								<label
									htmlFor="data-object-select"
									className="block text-sm font-medium text-gray-700 mb-2"
								>
									Data Object
								</label>
								<select
									id="data-object-select"
									className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
									defaultValue=""
									onChange={(e) => {
										if (e.target.value) handleSelect(e.target.value);
									}}
								>
									<option value="" disabled>
										Choose a data object…
									</option>
									{dataObjects.map((opt) => (
										<option key={opt.uri} value={opt.uri}>
											{opt.label}
										</option>
									))}
								</select>
								<p className="mt-2 text-xs text-gray-400">
									{dataObjects.length} data objects available
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	// ── Graph view (after selection) ──────────────────────────────────────────
	return (
		<div className="flex flex-col h-full">
			<header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3 flex items-center gap-4">
				<button
					type="button"
					onClick={handleBack}
					className="text-sm text-blue-600 hover:text-blue-800 font-medium"
				>
					&larr; Back
				</button>
				<div>
					<h1 className="text-lg font-semibold text-gray-900">
						{graphData?.title ?? "Network of Systems"}
					</h1>
					<p className="text-sm text-gray-500 mt-0.5">
						{selectedDataObject.label}
						{graphData && (
							<>
								{" "}&middot; {graphData.nodes.length} systems
								{" "}&middot; {graphData.edges.length} interfaces
							</>
						)}
					</p>
				</div>
			</header>

			{isLoadingGraph && (
				<div className="flex-1 flex items-center justify-center bg-gray-50">
					<div className="text-center">
						<div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
						<p className="mt-3 text-sm text-gray-500">
							Loading network graph…
						</p>
					</div>
				</div>
			)}

			{graphError && (
				<div className="flex-1 flex items-center justify-center bg-gray-50">
					<div className="w-full max-w-md px-6">
						<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
							<p className="text-sm font-medium text-red-800">
								Failed to load graph
							</p>
							<p className="mt-1 text-xs text-red-600">{graphError}</p>
						</div>
					</div>
				</div>
			)}

			{graphData && !isLoadingGraph && !graphError && (
				<div className="flex-1 flex overflow-hidden">
					<GraphSidebar
						activeMode={analysisMode}
						onModeChange={handleModeChange}
						isGraphLocked={isGraphLocked}
						onLockGraph={() => setIsGraphLocked(true)}
						onUnlockGraph={() => setIsGraphLocked(false)}
						selectedNode={selectedNode}
						onNodeDeselect={handleNodeDeselect}
						connectionMode={connectionMode}
						onConnectionModeChange={handleConnectionModeChange}
						connectionDepth={connectionDepth}
						onExpandConnections={handleExpandConnections}
						canExpandConnections={canExpandConnections}
						loopCount={loopResult?.nodeIds.size ?? 0}
						islandCount={islandResult?.nodeIds.size ?? 0}
						latencyMinutes={latencySliderMinutes}
						onLatencyMinutesChange={setLatencySliderMinutes}
						latencyNodeCount={latencyHighlight?.nodeIds.size ?? 0}
						isLoadingLatency={isLoadingLatency}
					/>

					<main className="flex-1 relative overflow-hidden">
						<NetworkGraph
							nodes={graphData.nodes}
							edges={graphData.edges}
							onTooltipChange={setTooltip}
							onNodeClick={handleNodeClick}
							highlightSet={highlightSet}
							isInteractionLocked={isGraphLocked}
							curveOffset={curveOffset}
							mergeBidirectional={mergeBidirectional}
						/>
						<GraphLegend entries={graphData.legend} />
						<GraphTooltip tooltip={tooltip} />
					</main>
				</div>
			)}
		</div>
	);
};
