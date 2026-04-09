// NetworkPage.tsx — Full-screen page that renders the network of systems graph.
// Phase 1: fetch DataObject list from backend → show dropdown.
// Phase 2: once a DataObject is selected → fetch graph via reactor → render.

import { useMemo, useState, useCallback, useEffect } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";
import { NetworkGraph } from "@/components/NetworkGraph";
import { GraphTooltip } from "@/components/GraphTooltip";
import { GraphLegend } from "@/components/GraphLegend";
import { GraphSidebar, type AnalysisMode } from "@/components/GraphSidebar";
import { getGraphData, type GraphDataResult } from "@/lib/graphData";
import { findLoops, findIslands, type HighlightSet } from "@/lib/graphAnalysis";
import type { TooltipData, RawGraphData } from "@/types/graph";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

interface DataObjectOption {
	uri: string;
	label: string;
}

export const NetworkPage = () => {
	const { insightId } = useInsight();

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

	const highlightSet: HighlightSet | null = useMemo(() => {
		if (!loopResult || !islandResult) return null;
		switch (analysisMode) {
			case "loops":
				return loopResult;
			case "islands":
				return islandResult;
			default:
				return null;
		}
	}, [analysisMode, loopResult, islandResult]);

	const handleModeChange = useCallback((mode: AnalysisMode) => {
		setAnalysisMode(mode);
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
		setTooltip(null);
	}, []);

	// ── Selection screen ──────────────────────────────────────────────────────
	if (!selectedDataObject) {
		return (
			<div className="flex flex-col h-full -m-4">
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
		<div className="flex flex-col h-full -m-4">
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
						loopCount={loopResult?.nodeIds.size ?? 0}
						islandCount={islandResult?.nodeIds.size ?? 0}
					/>

					<main className="flex-1 relative overflow-hidden">
						<NetworkGraph
							nodes={graphData.nodes}
							edges={graphData.edges}
							onTooltipChange={setTooltip}
							highlightSet={highlightSet}
						/>
						<GraphLegend entries={graphData.legend} />
						<GraphTooltip tooltip={tooltip} />
					</main>
				</div>
			)}
		</div>
	);
};
