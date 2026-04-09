// DebugComparisonPage.tsx — Temporary debug page that compares legacy vs new
// reactor output for every DataObject. Delete this file when verification is done.

import { useCallback, useEffect, useRef, useState } from "react";
import { runPixel } from "@semoss/sdk";
import { useInsight } from "@semoss/sdk/react";

const DATABASE_ID = "133db94b-4371-4763-bff9-edf7e5ed021b";

interface DataObjectOption {
	uri: string;
	label: string;
}

interface ComparisonResult {
	dataObject: string;
	dataObjectUri: string;
	match: boolean;
	error?: string;
	legacy?: { nodes: number; edges: number };
	new?: { nodes: number; edges: number };
	nodesOnlyInLegacy?: string[];
	nodesOnlyInNew?: string[];
	edgesOnlyInLegacy?: string[];
	edgesOnlyInNew?: string[];
}

type Status = "idle" | "loading-list" | "running" | "done";

export const DebugComparisonPage = () => {
	const { insightId } = useInsight();
	const [status, setStatus] = useState<Status>("idle");
	const [dataObjects, setDataObjects] = useState<DataObjectOption[]>([]);
	const [results, setResults] = useState<ComparisonResult[]>([]);
	const [currentIndex, setCurrentIndex] = useState(-1);
	const [error, setError] = useState<string | null>(null);
	const cancelledRef = useRef(false);

	// Load DataObject list
	const loadDataObjects = useCallback(async () => {
		if (!insightId) return;
		setStatus("loading-list");
		setError(null);
		try {
			const pixel = `ListDataObjects(database=["${DATABASE_ID}"]);`;
			const response = await runPixel(pixel, insightId);
			if (response.errors.length > 0) {
				setError(response.errors.join(", "));
				setStatus("idle");
				return;
			}
			const output = response.pixelReturn[0]?.output;
			if (Array.isArray(output)) {
				setDataObjects(output);
			}
			setStatus("idle");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load list");
			setStatus("idle");
		}
	}, [insightId]);

	useEffect(() => {
		loadDataObjects();
	}, [loadDataObjects]);

	// Run comparisons sequentially
	const runAll = useCallback(async () => {
		if (!insightId || dataObjects.length === 0) return;
		cancelledRef.current = false;
		setStatus("running");
		setResults([]);
		setCurrentIndex(0);

		const allResults: ComparisonResult[] = [];

		for (let i = 0; i < dataObjects.length; i++) {
			if (cancelledRef.current) break;
			setCurrentIndex(i);

			const dObj = dataObjects[i];
			try {
				const pixel = `CompareGraphOutputs(database=["${DATABASE_ID}"], dataObject=["${dObj.uri}"]);`;
				const response = await runPixel(pixel, insightId);

				if (response.errors.length > 0) {
					allResults.push({
						dataObject: dObj.label,
						dataObjectUri: dObj.uri,
						match: false,
						error: response.errors.join(", "),
					});
				} else {
					const output = response.pixelReturn[0]?.output as ComparisonResult;
					allResults.push(output);
				}
			} catch (err) {
				allResults.push({
					dataObject: dObj.label,
					dataObjectUri: dObj.uri,
					match: false,
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}

			setResults([...allResults]);
		}

		setStatus("done");
	}, [insightId, dataObjects]);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
	}, []);

	// Run a single comparison
	const runOne = useCallback(
		async (dObj: DataObjectOption) => {
			if (!insightId) return;
			setStatus("running");
			setCurrentIndex(dataObjects.indexOf(dObj));

			try {
				const pixel = `CompareGraphOutputs(database=["${DATABASE_ID}"], dataObject=["${dObj.uri}"]);`;
				const response = await runPixel(pixel, insightId);

				let result: ComparisonResult;
				if (response.errors.length > 0) {
					result = {
						dataObject: dObj.label,
						dataObjectUri: dObj.uri,
						match: false,
						error: response.errors.join(", "),
					};
				} else {
					result = response.pixelReturn[0]?.output as ComparisonResult;
				}

				setResults((prev) => {
					const existing = prev.findIndex(
						(r) => r.dataObjectUri === dObj.uri,
					);
					if (existing >= 0) {
						const copy = [...prev];
						copy[existing] = result;
						return copy;
					}
					return [...prev, result];
				});
			} catch (err) {
				setResults((prev) => [
					...prev,
					{
						dataObject: dObj.label,
						dataObjectUri: dObj.uri,
						match: false,
						error: err instanceof Error ? err.message : "Unknown error",
					},
				]);
			}

			setStatus("done");
		},
		[insightId, dataObjects],
	);

	// Summary counts
	const passed = results.filter((r) => r.match).length;
	const failed = results.filter((r) => !r.match).length;

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-lg font-semibold text-gray-900">
							Debug: Legacy vs New Reactor Comparison
						</h1>
						<p className="text-sm text-gray-500 mt-0.5">
							{dataObjects.length} data objects loaded
							{status === "running" && (
								<>
									{" "}
									&middot; Running {currentIndex + 1} of{" "}
									{dataObjects.length}…
								</>
							)}
							{status === "done" && (
								<>
									{" "}
									&middot;{" "}
									<span className="text-green-600 font-medium">
										{passed} passed
									</span>
									{failed > 0 && (
										<>
											{" "}
											&middot;{" "}
											<span className="text-red-600 font-medium">
												{failed} failed
											</span>
										</>
									)}
								</>
							)}
						</p>
					</div>
					<div className="flex gap-2">
						{status === "running" ? (
							<button
								type="button"
								onClick={cancel}
								className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
							>
								Cancel
							</button>
						) : (
							<button
								type="button"
								onClick={runAll}
								disabled={
									dataObjects.length === 0 ||
									status === "loading-list"
								}
								className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
							>
								Run All Comparisons
							</button>
						)}
					</div>
				</div>
			</header>

			{/* Error banner */}
			{error && (
				<div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
					{error}
				</div>
			)}

			{/* Progress bar */}
			{status === "running" && (
				<div className="mx-6 mt-4">
					<div className="h-2 w-full rounded-full bg-gray-200">
						<div
							className="h-2 rounded-full bg-blue-600 transition-all"
							style={{
								width: `${((currentIndex + 1) / dataObjects.length) * 100}%`,
							}}
						/>
					</div>
				</div>
			)}

			{/* Results table */}
			<div className="flex-1 overflow-auto px-6 py-4 bg-gray-50">
				{results.length === 0 && status !== "running" ? (
					<div className="text-center py-12 text-gray-400 text-sm">
						Click "Run All Comparisons" to start, or click a row
						below to run individually.
					</div>
				) : null}

				{/* DataObject list / results */}
				<table className="w-full text-sm border-collapse">
					<thead>
						<tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
							<th className="pb-2 pr-4">#</th>
							<th className="pb-2 pr-4">Data Object</th>
							<th className="pb-2 pr-4">Status</th>
							<th className="pb-2 pr-4">Legacy Nodes</th>
							<th className="pb-2 pr-4">New Nodes</th>
							<th className="pb-2 pr-4">Legacy Edges</th>
							<th className="pb-2 pr-4">New Edges</th>
							<th className="pb-2">Details</th>
						</tr>
					</thead>
					<tbody>
						{dataObjects.map((dObj, idx) => {
							const r = results.find(
								(res) => res.dataObjectUri === dObj.uri,
							);
							const isRunning =
								status === "running" && idx === currentIndex;

							return (
								<ResultRow
									key={dObj.uri}
									index={idx}
									dataObject={dObj}
									result={r}
									isRunning={isRunning}
									onRunOne={() => runOne(dObj)}
								/>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
};

function ResultRow({
	index,
	dataObject,
	result,
	isRunning,
	onRunOne,
}: {
	index: number;
	dataObject: DataObjectOption;
	result?: ComparisonResult;
	isRunning: boolean;
	onRunOne: () => void;
}) {
	const [expanded, setExpanded] = useState(false);

	const statusBadge = () => {
		if (isRunning)
			return (
				<span className="inline-flex items-center gap-1 text-blue-600">
					<span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
					Running
				</span>
			);
		if (!result)
			return (
				<button
					type="button"
					onClick={onRunOne}
					className="text-blue-600 hover:text-blue-800 underline"
				>
					Run
				</button>
			);
		if (result.error)
			return <span className="text-red-600 font-medium">Error</span>;
		if (result.match)
			return <span className="text-green-600 font-medium">Match</span>;
		return <span className="text-red-600 font-medium">Mismatch</span>;
	};

	return (
		<>
			<tr
				className={`border-t border-gray-200 ${
					result && !result.match ? "bg-red-50" : ""
				} ${isRunning ? "bg-blue-50" : ""}`}
			>
				<td className="py-2 pr-4 text-gray-400">{index + 1}</td>
				<td className="py-2 pr-4 font-medium text-gray-900">
					{dataObject.label}
				</td>
				<td className="py-2 pr-4">{statusBadge()}</td>
				<td className="py-2 pr-4 text-gray-600 tabular-nums">
					{result?.legacy?.nodes ?? "—"}
				</td>
				<td className="py-2 pr-4 text-gray-600 tabular-nums">
					{result?.new?.nodes ?? "—"}
				</td>
				<td className="py-2 pr-4 text-gray-600 tabular-nums">
					{result?.legacy?.edges ?? "—"}
				</td>
				<td className="py-2 pr-4 text-gray-600 tabular-nums">
					{result?.new?.edges ?? "—"}
				</td>
				<td className="py-2">
					{result && !result.match && (
						<button
							type="button"
							onClick={() => setExpanded(!expanded)}
							className="text-blue-600 hover:text-blue-800 text-xs"
						>
							{expanded ? "Hide" : "Details"}
						</button>
					)}
				</td>
			</tr>
			{expanded && result && (
				<tr>
					<td colSpan={8} className="px-8 py-3 bg-gray-100">
						<DiffDetails result={result} />
					</td>
				</tr>
			)}
		</>
	);
}

function DiffDetails({ result }: { result: ComparisonResult }) {
	if (result.error) {
		return <p className="text-red-700 text-xs">{result.error}</p>;
	}

	const sections: { label: string; items: string[] | undefined }[] = [
		{
			label: "Nodes only in Legacy",
			items: result.nodesOnlyInLegacy,
		},
		{ label: "Nodes only in New", items: result.nodesOnlyInNew },
		{
			label: "Edges only in Legacy",
			items: result.edgesOnlyInLegacy,
		},
		{ label: "Edges only in New", items: result.edgesOnlyInNew },
	];

	return (
		<div className="space-y-2">
			{sections.map(
				(s) =>
					s.items &&
					s.items.length > 0 && (
						<div key={s.label}>
							<p className="text-xs font-semibold text-gray-600">
								{s.label} ({s.items.length})
							</p>
							<ul className="text-xs text-gray-500 ml-4 list-disc">
								{s.items.map((item) => (
									<li key={item} className="break-all">
										{item}
									</li>
								))}
							</ul>
						</div>
					),
			)}
		</div>
	);
}
