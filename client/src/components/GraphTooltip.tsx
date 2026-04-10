// GraphTooltip.tsx — Floating tooltip that follows the cursor when hovering
// over a node or edge in the network graph.

import type { TooltipData } from "@/types/graph";

interface GraphTooltipProps {
	tooltip: TooltipData | null;
}

export const GraphTooltip = ({ tooltip }: GraphTooltipProps) => {
	if (!tooltip) return null;

	return (
		<div
			className="fixed z-50 pointer-events-none bg-gray-900 text-white text-xs rounded-md px-3 py-2 shadow-xl leading-relaxed max-w-xs"
			style={{ left: tooltip.x, top: tooltip.y }}
		>
			{tooltip.type === "node" && tooltip.node && (
				<>
					<div className="font-semibold text-sm">{tooltip.node.label}</div>
					<div className="text-gray-400 text-[10px] uppercase tracking-wide mt-0.5">
						{tooltip.node.type}
					</div>
					{tooltip.node.fullName && (
						<div className="text-gray-300 mt-1">
							{tooltip.node.fullName}
						</div>
					)}
					{tooltip.node.description && (
						<div className="text-gray-400 mt-1 italic">
							{tooltip.node.description}
						</div>
					)}
					{tooltip.node.connectionCount > 0 && (
						<div className="text-blue-300 mt-1 font-mono">
							Connections: {tooltip.node.connectionCount}
						</div>
					)}
				</>
			)}
			{tooltip.type === "edge" && tooltip.edge && (
				<>
					<div className="font-semibold">
						{tooltip.sourceLabel}
					</div>
					<div className="text-gray-300">→ {tooltip.targetLabel}</div>
					<div className="text-gray-400 text-[10px] uppercase tracking-wide mt-1">
						{tooltip.edge.edgeType}
					</div>
					<div className="mt-1">
						<span className="text-gray-400">Data:</span>{" "}
						<span className="text-yellow-300">{tooltip.edge.data || "N/A"}</span>
					</div>
					<div>
						<span className="text-gray-400">Format:</span>{" "}
						{tooltip.edge.format || "N/A"}
					</div>
					<div>
						<span className="text-gray-400">Protocol:</span>{" "}
						{tooltip.edge.protocol || "N/A"}
					</div>
					<div>
						<span className="text-gray-400">Frequency:</span>{" "}
						{tooltip.edge.frequency || "N/A"}
					</div>
					<div className="text-gray-400 mt-1 italic text-[10px]">
						{tooltip.edge.interfaceName || "N/A"}
					</div>

					{/* Reverse direction (bidirectional edges on V2 page only) */}
					{tooltip.edge.bidirectional && tooltip.edge.reverseEdgeData && (
						<>
							<div className="border-t border-gray-600 mt-2 pt-2 text-gray-400 text-[10px] uppercase tracking-wide">
								{tooltip.targetLabel} → {tooltip.sourceLabel}
							</div>
							<div className="mt-1">
								<span className="text-gray-400">Data:</span>{" "}
								<span className="text-yellow-300">{tooltip.edge.reverseEdgeData.data || "N/A"}</span>
							</div>
							<div>
								<span className="text-gray-400">Format:</span>{" "}
								{tooltip.edge.reverseEdgeData.format || "N/A"}
							</div>
							<div>
								<span className="text-gray-400">Protocol:</span>{" "}
								{tooltip.edge.reverseEdgeData.protocol || "N/A"}
							</div>
							<div>
								<span className="text-gray-400">Frequency:</span>{" "}
								{tooltip.edge.reverseEdgeData.frequency || "N/A"}
							</div>
							<div className="text-gray-400 mt-1 italic text-[10px]">
								{tooltip.edge.reverseEdgeData.interfaceName || "N/A"}
							</div>
						</>
					)}
				</>
			)}
		</div>
	);
};
