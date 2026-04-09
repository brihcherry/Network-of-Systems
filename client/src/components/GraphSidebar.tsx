// GraphSidebar.tsx — Sidebar with graph analysis tool buttons.
// Provides Loop Identifier, Island Identifier, and Reset controls.

import { Button } from "@/components/ui/button";

export type AnalysisMode = "none" | "loops" | "islands" | "latency";

interface GraphSidebarProps {
	activeMode: AnalysisMode;
	onModeChange: (mode: AnalysisMode) => void;
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
					className="w-full justify-start text-left"
					onClick={() =>
						onModeChange(activeMode === "loops" ? "none" : "loops")
					}
				>
					<div>
						<div className="font-medium">Loop Identifier</div>
						<div className="text-xs opacity-70 font-normal mt-0.5">
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
					className="w-full justify-start text-left"
					onClick={() =>
						onModeChange(activeMode === "islands" ? "none" : "islands")
					}
				>
					<div>
						<div className="font-medium">Island Identifier</div>
						<div className="text-xs opacity-70 font-normal mt-0.5">
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
					className="w-full justify-start text-left"
					onClick={() =>
						onModeChange(activeMode === "latency" ? "none" : "latency")
					}
				>
					<div>
						<div className="font-medium">Run Data Latency Analysis</div>
						<div className="text-xs opacity-70 font-normal mt-0.5">
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
