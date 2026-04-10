// NetworkStraightPage.tsx — "Network of Systems V2" view.
// Renders the same data as NetworkPage but with straight edges and
// bidirectional pairs (A→B + B→A) merged into a single double-headed edge.

import { NetworkPage } from "./NetworkPage";

export const NetworkStraightPage = () => {
	return <NetworkPage edgeStyle="straight-bidir" />;
};
