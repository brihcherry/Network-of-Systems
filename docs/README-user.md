# Network of Systems — User Guide

This application lets you explore the network of IT systems surrounding any selected data object in your enterprise. You can visualize which systems exchange a given piece of data, trace how information flows across system interfaces, and run built-in analyses to detect data-flow problems.

---

## Getting Started

### Opening the App

Navigate to the app in your SEMOSS environment. The app loads automatically and connects to the backend. While it initializes you will see a full-screen loading spinner. If initialization fails, an error screen appears with guidance to contact support.

Once loaded, the navigation bar at the top shows three sections:

| Link | What it does |
|---|---|
| **Network of Systems** | Main graph view with curved edges (default) |
| **Network of Systems V2** | Same graph using straight, bidirectional edge arrows |
| **Debug Comparison** | Developer utility for regression testing (not for general use) |

---

## Step 1 — Select a Data Object

On the main page you are presented with a dropdown labeled **"Data Object"**. All available data objects in the connected database are listed here, sorted alphabetically.

- A count below the dropdown shows how many data objects are available (e.g., *"42 data objects available"*).
- If the list is loading, you will see a spinning indicator and the message *"Loading available data objects…"*.
- If loading fails, a red error card explains what went wrong.

Select any data object from the dropdown to proceed.

---

## Step 2 — Explore the Graph

After selecting a data object, the application fetches its full network and renders an interactive force-directed graph. A *"Loading network graph…"* spinner is shown during this step.

### What You See

The graph shows **two types of nodes** and **two types of connections**:

| Node type | Color | Meaning |
|---|---|---|
| **Data Object** | Orange | The data object you selected — the central hub |
| **System** | Blue | An enterprise IT system that exchanges this data |

| Connection type | Meaning |
|---|---|
| **Provide** | A system creates or maintains this data object (arrows point outward from the data object node) |
| **Relation** | Two systems exchange data through a shared interface (arrows connect system to system) |

A **legend** in the top-right corner of the graph canvas shows each node type, its color swatch, and the count of nodes of that type.

### Interacting with the Graph

**Zoom:** Scroll the mouse wheel to zoom in or out (range: 10% to 1000%).

**Pan:** Click and drag on the empty canvas background to move around.

**Drag nodes:** Click and drag any individual node to reposition it. In the default (unlocked) mode, releasing the node lets it drift back under physics forces. In locked mode the node stays exactly where you drop it.

**Hover tooltips:** Hovering over any node shows a dark tooltip with:
- The node's **label** (display name)
- Its **type** (e.g., *SYSTEM*, *DATAOBJECT*)
- Full name and description (when available)
- Connection count

Hovering over any edge shows:
- Source → target system names
- Edge type
- Data, Format, Protocol, Frequency fields (when available)
- Interface name

On the V2 page, bidirectional edges (A→B and B→A shown as one arrow) also display the reverse-direction properties in a separate section below a divider.

---

## Analysis Tools (Left Sidebar)

The sidebar on the left contains three analysis tools and one canvas control panel.

---

### Loop Identifier

**What it does:** Highlights systems that form directed cycles — meaning data that leaves a system can, through a chain of interfaces, eventually loop back to that same system.

**How to use:** Click the **Loop Identifier** toggle button to activate it. The button turns active/highlighted.

**What you see:** Nodes and edges that are part of a detected loop remain fully visible. Everything else is dimmed to 15% opacity. A status line below the button reads either:
- *"N nodes in loops"* — if cycles were found
- *"No loops detected"* — if the graph is cycle-free

Click the button again to turn it off. Alternatively, click **Reset** at the bottom of the sidebar.

---

### Island Identifier

**What it does:** Highlights systems that are disconnected from the main data object — meaning they appear in the network database but have no actual data-flow path back to the selected data object.

**How to use:** Click the **Island Identifier** toggle button.

**What you see:**
- *"N nodes disconnected from [Data Object]"* — if isolated nodes were found (they are highlighted, the rest dimmed)
- *"All nodes connected to [Data Object]"* — if the graph is fully connected

---

### Run Data Latency Analysis

**What it does:** Highlights the data-flow paths that fall within a time threshold. Every interface edge in the graph has a "Frequency" property (how often data is exchanged). The latency analysis accumulates these frequencies along each path, scoring every edge by how long it would take for data to travel from a source system to all reachable downstream systems.

**How to use:**
1. Click the **Run Data Latency Analysis** toggle button. The backend runs the analysis once and returns all scored edge paths.
2. A *"Loading latency data…"* pulsing text appears while the request is in flight.
3. Once loaded, a **slider** appears labeled from 0 to 60,000 minutes (~1,000 hours). Drag the slider left or right.
4. The graph instantly updates to show only the edges whose path score falls within the current slider value. Three read-only boxes display the current threshold broken into **Days**, **Hours**, and **Minutes** for readability.
5. A status line shows: *"N nodes within threshold"* or *"No nodes within threshold"*.

Since the full analysis result is fetched once upfront, moving the slider is instant — no additional backend calls are made.

---

## Connection Explorer (Left Sidebar)

This tool lets you trace the specific connections of any single node in the graph.

**How to use:**
1. Click any node on the canvas to select it. The sidebar shows a blue box with the node's name and a **"Clear Selection"** link.
2. From the **Connection Type** dropdown, choose one of:
   - **Highlight Adjacent** — shows all incoming and outgoing connections for the selected node
   - **Upstream Only** — shows only the direct Provide-type connections coming into this node
   - **Downstream Only** — shows only the Provide and Relation connections going out of this node
3. Click **Expand Connections** to apply the highlight. The button label shows the current depth level (e.g., *"Expand Connections (Level 1)"*).
4. Click again to expand one level deeper, following the graph outward from the selected node. The button becomes disabled once no more connections exist at the next depth.
5. Click **Clear Selection** to deselect the node, or click a different node to switch focus.

---

## Canvas Controls (Left Sidebar)

**Lock / Unlock Nodes:**
- **Lock** — freezes all nodes in their current positions. You can still pan and zoom, but physics forces are suspended and nodes no longer drift. Use this after arranging the graph to your liking.
- **Unlock** — resumes physics forces so nodes can be dragged and will settle under the simulation.

Status text below the buttons confirms the current state.

**Reset Button:** At the bottom of the sidebar, the **Reset** button clears the active analysis mode (Loop, Island, or Latency) and restores the full graph view with no highlighting.

---

## Graph Versions (V1 vs V2)

| Feature | Network of Systems (V1) | Network of Systems V2 |
|---|---|---|
| Edge style | Curved arcs | Straight lines |
| Bidirectional pairs | Two separate curved arcs bowing apart | Single double-headed arrow |
| Tooltip on reverse direction | Not shown | Shown below a divider |

Both versions show identical data and support all the same analysis tools.

---

## Header Bar (Graph View)

While viewing a graph, the header shows:
- **← Back** button — returns to the data object selection screen and clears all analysis state
- **Graph title** — fetched from the database (e.g., *"What is the network of systems for this data?"*)
- **Summary stats** — e.g., *"Admissions · 12 systems · 18 interfaces"*

---

## Error States

| Situation | What you see |
|---|---|
| App fails to connect to SEMOSS | Full-screen error page with a triangle icon and support message |
| Data object list fails to load | Red card: *"Failed to load data objects"* with error detail |
| Graph fails to load | Red card: *"Failed to load graph"* with error detail |
| Unknown URL | Automatically redirected to the home page |
