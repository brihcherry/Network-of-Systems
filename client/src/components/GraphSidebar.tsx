// GraphSidebar.tsx — Sidebar with graph analysis tool buttons.
// Provides Loop Identifier, Island Identifier, and Reset controls.

import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AnalysisMode = "none" | "loops" | "islands" | "latency" | "connections";
export type ConnectionMode = "adjacent" | "upstream" | "downstream";

interface GraphSidebarProps {
	activeMode: AnalysisMode;
	onModeChange: (mode: AnalysisMode) => void;
	isGraphLocked: boolean;
	onLockGraph: () => void;
	onUnlockGraph: () => void;
	selectedNode: string | null;
	onNodeDeselect: () => void;
	connectionMode: ConnectionMode | null;
	onConnectionModeChange: (mode: ConnectionMode | null) => void;
	connectionDepth: number;
	onExpandConnections: () => void;
	canExpandConnections: boolean;
	loopCount?: number;
	islandCount?: number;
	latencyMinutes?: number;
	onLatencyMinutesChange?: (minutes: number) => void;
	latencyNodeCount?: number;
	isLoadingLatency?: boolean;
}

export const GraphSidebar = ({
	activeMode,
	onModeChange,
	isGraphLocked,
	onLockGraph,
	onUnlockGraph,
	selectedNode,
	onNodeDeselect,
	connectionMode,
	onConnectionModeChange,
	connectionDepth,
	onExpandConnections,
	canExpandConnections,
	loopCount,
	islandCount,
	latencyMinutes = 60000,
	onLatencyMinutesChange,
	latencyNodeCount,
	isLoadingLatency = false,
}: GraphSidebarProps) => {
	const days = Math.floor(latencyMinutes / (24 * 60));
	const hours = Math.floor((latencyMinutes % (24 * 60)) / 60);
	const minutes = latencyMinutes % 60;

	return (
		<aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-4 flex flex-col gap-4 overflow-y-auto">
			<div>
				<h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
					Analysis Tools
				</h2>
			</div>

			<div className="flex flex-col gap-2">
				<Button
					variant={activeMode === "loops" ? "default" : "outline"}
					className="h-auto w-full justify-start whitespace-normal py-3 text-left"
					onClick={() =>
						onModeChange(activeMode === "loops" ? "none" : "loops")
					}
				>
					<div className="w-full">
						<div className="font-medium">Loop Identifier</div>
						<div className="mt-0.5 text-xs font-normal leading-4 opacity-70">
							Highlight systems in directed cycles
						</div>
					</div>
				</Button>
				{activeMode === "loops" && loopCount !== undefined && (
					<div className="text-xs text-gray-500 px-3">
						{loopCount > 0
							? `${loopCount} node${loopCount !== 1 ? "s" : ""} in loops`
							: "No loops detected"}
					</div>
				)}

				<Button
					variant={activeMode === "islands" ? "default" : "outline"}
					className="h-auto w-full justify-start whitespace-normal py-3 text-left"
					onClick={() =>
						onModeChange(activeMode === "islands" ? "none" : "islands")
					}
				>
					<div className="w-full">
						<div className="font-medium">Island Identifier</div>
						<div className="mt-0.5 text-xs font-normal leading-4 opacity-70">
							Highlight disconnected clusters
						</div>
					</div>
				</Button>
				{activeMode === "islands" && islandCount !== undefined && (
					<div className="text-xs text-gray-500 px-3">
						{islandCount > 0
							? `${islandCount} node${islandCount !== 1 ? "s" : ""} disconnected from Admissions`
							: "All nodes connected to Admissions"}
					</div>
				)}

				<Button
					variant={activeMode === "latency" ? "default" : "outline"}
					className="h-auto w-full justify-start whitespace-normal py-3 text-left"
					onClick={() =>
						onModeChange(activeMode === "latency" ? "none" : "latency")
					}
				>
					<div className="w-full">
						<div className="font-medium">Run Data Latency Analysis</div>
						<div className="mt-0.5 text-xs font-normal leading-4 opacity-70">
							Highlight systems reachable within latency threshold
						</div>
					</div>
				</Button>
				{activeMode === "latency" && (
					<div className="px-1 pt-1 flex flex-col gap-3">
						{isLoadingLatency && (
							<div className="text-xs text-gray-500 px-1 py-2">
								<div className="animate-pulse">Loading latency data...</div>
							</div>
						)}
						<input
							type="range"
							min={0}
							max={60000}
							step={15}
							value={latencyMinutes}
							onChange={(e) => onLatencyMinutesChange?.(Number(e.target.value))}
							className="w-full"
							disabled={isLoadingLatency}
						/>
						<div className="grid grid-cols-3 gap-2 text-center">
							<div className="rounded border border-gray-200 bg-white p-2">
								<div className="text-[10px] uppercase tracking-wide text-gray-500">Days</div>
								<div className="text-sm font-semibold text-gray-800">{days}</div>
							</div>
							<div className="rounded border border-gray-200 bg-white p-2">
								<div className="text-[10px] uppercase tracking-wide text-gray-500">Hours</div>
								<div className="text-sm font-semibold text-gray-800">{hours}</div>
							</div>
							<div className="rounded border border-gray-200 bg-white p-2">
								<div className="text-[10px] uppercase tracking-wide text-gray-500">Minutes</div>
								<div className="text-sm font-semibold text-gray-800">{minutes}</div>
							</div>
						</div>
						{!isLoadingLatency && latencyNodeCount !== undefined && (
							<div className="text-xs text-gray-500 px-1">
								{latencyNodeCount > 0
									? `${latencyNodeCount} node${latencyNodeCount !== 1 ? "s" : ""} within threshold`
									: "No nodes within threshold"}
							</div>
						)}
					</div>
				)}
			</div>

			<hr className="border-gray-200" />

			<div className="flex flex-col gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Connection Explorer
				</h3>
				{selectedNode ? (
					<div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs">
						<div className="font-medium text-blue-900 truncate">
							Selected: {selectedNode.split("/").pop()}
						</div>
						<button
							onClick={onNodeDeselect}
							className="mt-1 text-blue-600 hover:text-blue-800 text-xs font-medium"
						>
							Clear Selection
						</button>
					</div>
				) : (
					<div className="rounded bg-gray-100 border border-gray-200 p-2 text-xs text-gray-500 text-center">
						Please select a node on the canvas to use this tool.
					</div>
				)}
				<div className="flex flex-col gap-2">
					<label className={`text-xs font-medium ${selectedNode ? "text-gray-700" : "text-gray-400"}`}>
						Connection Type
					</label>
					<select
						value={connectionMode || ""}
						onChange={(e) => {
							const val = e.target.value as ConnectionMode;
							onConnectionModeChange(val);
							if (activeMode !== "connections") {
								onModeChange("connections");
							}
						}}
						disabled={!selectedNode}
						className={`w-full rounded border bg-white px-2.5 py-1.5 text-xs shadow-sm focus:outline-none ${selectedNode ? "border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500" : "border-gray-200 text-gray-400 cursor-not-allowed"}`}
					>
						<option value="">Choose connection type…</option>
						<option value="adjacent">Highlight Adjacent</option>
						<option value="upstream">Upstream Only</option>
						<option value="downstream">Downstream Only</option>
					</select>
					{connectionMode && (
						<div className="text-xs text-gray-600 italic">
							{connectionMode === "adjacent"
								? "All incoming and outgoing connections"
								: connectionMode === "upstream"
									? "Incoming direct Provide connections to this node"
									: "Outgoing Provide and Relation connections from this node"}
						</div>
					)}
					{connectionMode && (
						<Button
							variant="default"
							className="w-full"
							onClick={onExpandConnections}
							disabled={!canExpandConnections}
						>
							{!canExpandConnections
								? "No more connections"
								: `Expand Connections ${connectionDepth > 0 ? `(Level ${connectionDepth})` : ""}`}
						</Button>
					)}
				</div>
			</div>

			<hr className="border-gray-200" />

			<div className="flex flex-col gap-2">
				<h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Canvas Controls
				</h3>
				<div className="grid grid-cols-2 gap-2">
					<Button
						variant={isGraphLocked ? "default" : "outline"}
						className="h-auto px-3 py-2"
						onClick={onLockGraph}
						disabled={isGraphLocked}
					>
						<Lock />
						<span>Lock</span>
					</Button>
					<Button
						variant={!isGraphLocked ? "default" : "outline"}
						className="h-auto px-3 py-2"
						onClick={onUnlockGraph}
						disabled={!isGraphLocked}
					>
						<Unlock />
						<span>Unlock</span>
					</Button>
				</div>
				<div className="text-xs text-gray-500 px-1">
					{isGraphLocked
						? "Nodes are locked in place. You can still pan and zoom the canvas."
						: "Nodes are unlocked. You can pan, zoom, and drag nodes."}
				</div>
			</div>

			<Button
				variant="outline"
				className="w-full"
				onClick={() => onModeChange("none")}
				disabled={activeMode === "none"}
			>
				Reset
			</Button>
		</aside>
	);
};
