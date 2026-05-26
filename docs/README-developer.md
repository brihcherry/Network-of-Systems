# Network of Systems — Developer Guide

This document covers the SPARQL queries, data model, Pixel API, and internal logic for the four Java reactors powering this application. All data access goes against an RDF triplestore using two ontology namespaces: `http://semoss.org/ontologies/` for concept and relation types and `http://health.mil/ontologies/` for domain instances.

---

## Reactor Summaries

| Reactor | Pixel Command | Purpose |
|---|---|---|
| `ListDataObjectsReactor` | `ListDataObjects` | Queries the RDF database for all distinct `DataObject` instances and returns a label/URI list that populates the data object selection dropdown on page load. |
| `GetGraphForDataObjectReactor` | `GetGraphForDataObject` | Given a selected data object URI, runs four SPARQL queries to identify the systems that provide it and the inter-system interfaces that carry it, then assembles and returns the full node/edge graph payload. |
| `RunDataLatencyAnalysisReactor` | `RunDataLatencyAnalysis` | Builds the same system graph and performs a single DFS traversal at a fixed 1,000-hour ceiling, scoring every interface edge by its cumulative path frequency. Returns all scored edges grouped by score so the frontend can filter client-side as the user moves the latency slider. |
| `CompareGraphOutputsReactor` | `CompareGraphOutputs` | Debug-only. Runs the legacy insight #140 playsheet and `GetGraphForDataObjectReactor` against the same data object and diffs their node/edge sets, returning a match report. |

---

## Reactor: `ListDataObjectsReactor`

**Package:** `reactors.networkOfSystems`  
**Pixel command:** `ListDataObjects`

### Parameters

| Key | Type | Required | Description |
|---|---|---|---|
| `database` | String (UUID) | Yes | UUID of the RDF engine to query |

### SPARQL Query

```sparql
SELECT DISTINCT ?DataObject WHERE {
  ?DataObject <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
    <http://semoss.org/ontologies/Concept/DataObject> .
} ORDER BY ?DataObject
```

Returns all distinct `DataObject` concept instances, ordered by URI.

### Processing

For each result row:
- Extracts the `?DataObject` URI
- Derives the display label: `uri.substring(lastIndexOf('/') + 1)`, then replaces `_` with spaces
- Builds `Map<String, String>` with keys `"uri"` and `"label"`

### Return Value

`NounMetadata(List<Map<String, String>>, PixelDataType.CUSTOM_DATA_STRUCTURE)`

```json
[
  { "uri": "http://health.mil/ontologies/Concept/DataObject/Admissions", "label": "Admissions" },
  { "uri": "http://health.mil/ontologies/Concept/DataObject/Allergy_Data", "label": "Allergy Data" }
]
```

### Frontend Pixel Call

```js
actions.run('ListDataObjects(database=["133db94b-4371-4763-bff9-edf7e5ed021b"]);')
```

---

## Reactor: `GetGraphForDataObjectReactor`

**Package:** `reactors.networkOfSystems`  
**Pixel command:** `GetGraphForDataObject`

### Parameters

| Key | Type | Required | Description |
|---|---|---|---|
| `database` | String (UUID) | Yes | UUID of the RDF engine |
| `dataObject` | String (URI) | Yes | Full RDF URI of the data object to graph |

### SPARQL Queries

**Query 1 — Provide systems (CRM = C or M):**

Finds all `ActiveSystem` instances that provide (Create or Modify) the given data object.

```sparql
SELECT DISTINCT ?System ?provide ?crm WHERE {
  ?System rdf:type <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?provide rdfs:subPropertyOf <http://semoss.org/ontologies/Relation/Provide> .
  ?System ?provide <{dataObjectUri}> .
  ?provide <http://semoss.org/ontologies/Relation/Contains/CRM> ?crm .
  FILTER(?crm = 'C' || ?crm = 'M')
}
```

`?provide` is the individual predicate URI (not a class), used in Query 4 to load edge properties.

**Query 2 — ICD edges (inter-system interfaces):**

Finds directed system↔system relationships via `SystemInterface` nodes that carry the data object as payload. Restricted to the `LifeCycle/Supported` phase.

```sparql
SELECT DISTINCT ?System2 ?System3 ?carries ?contains ?prop WHERE {
  ?System2 rdf:type <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?System3 rdf:type <http://semoss.org/ontologies/Concept/ActiveSystem> .
  ?icd1 rdf:type <http://semoss.org/ontologies/Concept/SystemInterface> .
  ?upstream1 rdfs:subPropertyOf <http://semoss.org/ontologies/Relation/Provide> .
  ?downstream1 rdfs:subPropertyOf <http://semoss.org/ontologies/Relation/Consume> .
  ?carries rdfs:subPropertyOf <http://semoss.org/ontologies/Relation/Payload> .
  ?contains rdf:type <http://semoss.org/ontologies/Relation/Contains> .
  ?System2 ?upstream1 ?icd1 .
  ?icd1 ?downstream1 ?System3 .
  ?icd1 ?carries <{dataObjectUri}> .
  ?icd1 <http://semoss.org/ontologies/Relation/Phase>
        <http://health.mil/ontologies/Concept/LifeCycle/Supported> .
}
```

ICD edges are deduplicated within the request using a `LinkedHashMap<String, Map<String, Object>>` keyed by `"sourceUri|targetUri"`. Properties from the `contains`/`prop` columns are merged into the same edge's `propHash`.

**Query 3 — Node properties (per node URI):**

```sparql
SELECT ?Predicate ?Value WHERE {
  <{nodeUri}> ?Predicate ?Value .
  ?Predicate rdf:type <http://semoss.org/ontologies/Relation/Contains> .
}
```

Called once per unique node (the DataObject and each System). Results are merged into the node's `propHash`.

**Query 4 — Provide edge properties (per Provide predicate):**

```sparql
SELECT ?Predicate ?Value WHERE {
  <{providePredicateUri}> ?Predicate ?Value .
  ?Predicate rdf:type <http://semoss.org/ontologies/Relation/Contains> .
}
```

Called once per Provide system. Uses the individual predicate URI (`?provide`) captured in Query 1. Results merged into the edge's `propHash` (e.g., CRM, Frequency).

### Graph Construction

**Nodes:** The DataObject node + all systems from Query 1 union systems from Query 2 endpoints.

**Edges:**
- **ICD edges** — one per unique `(System2, System3)` pair from Query 2; `EDGE_TYPE = "Relation"`
- **Provide edges** — one per Provide system from Query 1; directed DataObject→System; `EDGE_TYPE = "Provide"`

**Node `propHash` fields:**

| Field | DataObject | System |
|---|---|---|
| `VERTEX_LABEL_PROPERTY` | local name (underscores→spaces) | system name (underscores→spaces) |
| `VERTEX_TYPE_PROPERTY` | `"DataObject"` | `"System"` |
| `VERTEX_COLOR_PROPERTY` | `"255,127,14"` (orange) | `"31,119,180"` (blue) |
| `URI` | full URI | full URI |
| `PhysicalName` | local name | local name |
| `System` | count of Provide systems | — |
| `Outputs` | count of Provide systems | — |
| *(dynamic)* | Contains-predicate values | Contains-predicate values |

**Edge `propHash` fields:**

| Field | ICD edge | Provide edge |
|---|---|---|
| `EDGE_NAME` | `"Source:Target"` | `"SystemName:DataObjectName"` |
| `EDGE_TYPE` | `"Relation"` | `"Provide"` |
| `URI` | `http://health.mil/ontologies/Relation/{Src}:{Tgt}` | `http://health.mil/ontologies/Relation/Provide/{Sys}:{DO}` |
| *(dynamic)* | ICD Contains properties | Provide predicate Contains properties |

### Return Value

`NounMetadata(Map<String, Object>, PixelDataType.CUSTOM_DATA_STRUCTURE)`

```json
{
  "title": "What is the network of systems for this data?",
  "dataMakerName": "GraphDataModel",
  "layout": "prerna.ui.components.specific.tap.InterfaceGraphPlaySheet",
  "nodes": {
    "http://health.mil/ontologies/Concept/DataObject/Admissions": {
      "propHash": { "VERTEX_LABEL_PROPERTY": "Admissions", "VERTEX_TYPE_PROPERTY": "DataObject", ... }
    },
    "http://health.mil/ontologies/Concept/ActiveSystem/CHCS": {
      "propHash": { "VERTEX_LABEL_PROPERTY": "CHCS", "VERTEX_TYPE_PROPERTY": "System", ... }
    }
  },
  "edges": [
    {
      "uri": "http://health.mil/ontologies/Relation/Provide/CHCS:Admissions",
      "source": "http://health.mil/ontologies/Concept/DataObject/Admissions",
      "target": "http://health.mil/ontologies/Concept/ActiveSystem/CHCS",
      "propHash": { "EDGE_NAME": "CHCS:Admissions", "EDGE_TYPE": "Provide", "CRM": "C", "Frequency": "Daily" }
    }
  ]
}
```

### Frontend Pixel Call

```js
actions.run(
  'GetGraphForDataObject(' +
  'database=["133db94b-4371-4763-bff9-edf7e5ed021b"], ' +
  'dataObject=["http://health.mil/ontologies/Concept/DataObject/Admissions"]' +
  ');'
)
```

---

## Reactor: `RunDataLatencyAnalysisReactor`

**Package:** `reactors`  
**Pixel command:** `RunDataLatencyAnalysis`

### Design Rationale

The legacy approach called the backend once per slider position (20–50 calls per analysis session). This reactor implements a **single-call, cache-filter** pattern instead:
- The backend runs a DFS traversal of the entire graph at a fixed ceiling threshold of **1,000 hours**.
- Every edge is scored by the cumulative path frequency from the root system(s) to that edge.
- The complete grouped result is returned to the frontend once.
- The frontend's slider filters the cached result client-side with no further backend calls.

### Parameters

| Key | Type | Required | Description |
|---|---|---|---|
| `database` | String (UUID) | Yes | UUID of the RDF engine |
| `dataObject` | String (URI) | Yes | Full RDF URI of the data object |
| `selectedNodeUri` | String (URI) | No | Single root for traversal; absent = all vertices used as roots |

### SPARQL Queries

**Query 1 — Provide systems (same CRM filter as `GetGraphForDataObjectReactor`):**  
Finds `ActiveSystem` instances with CRM ∈ {C, M} and captures the individual predicate URI for property loading.

**Query 2 — Provide predicate properties:**
```sparql
SELECT ?Predicate ?Value WHERE {
  <{providePredicateUri}> ?Predicate ?Value .
  ?Predicate rdf:type <http://semoss.org/ontologies/Relation/Contains> .
}
```
Loads `Frequency` (and other Contains-typed properties) from each Provide predicate. Called per Provide system.

**Query 3 — ICD edges:**  
Same structure as `GetGraphForDataObjectReactor` Query 2, **without** the `LifeCycle/Supported` filter. This means the latency analysis includes interfaces across all lifecycle phases, not just active ones.

### Internal Data Structures

```
GraphContext
├── Map<String, VertexState> verticesByUri
└── List<EdgeState> edges

VertexState
├── String uri
└── List<EdgeState> outgoing   ← edges where this vertex is source

EdgeState
├── String uri
├── String source
├── String target
├── Map<String, Object> propHash
├── String getFrequencyValue()   ← reads propHash.get("Frequency")
└── Map<String, Object> toLegacyMap()  ← {uri, source, target, propHash}

LegacyLatencyResult
├── Map<Double, List<Map>> edgeScores          ← keyed by numeric score
├── Map<String, List<Map>> edgeScoresByStringKey ← same, keyed by String.valueOf(score)
├── List<String> nodeUris
└── List<String> edgeUris
```

### DFS Traversal (`runLegacyLatency`)

1. For each root vertex (all vertices, or just `selectedNodeUri`):
   - Runs iterative DFS via `traverseDepthDownward()`
   - Accumulates edge frequency values as path cost in `currentPathLate` (a `MutableDouble`)
   - Outgoing edges sorted by URI — ensures deterministic ordering that mirrors the legacy `masterEdgeVector`
   - Skips an edge if:
     - Adding its frequency would exceed the 1,000-hour threshold
     - The edge was already scored at a lower cost on a prior path (greedy minimum-cost per edge)
     - The edge creates a cycle (already in the current DFS path)
   - Updates `finalEdgeScores` with the lowest score seen per edge across all traversal paths
2. Groups edges by final score: `Map<Double, List<edgeMaps>>`

### Frequency Translation (`translateString`)

Maps named frequency strings to integer hours. Key mappings (partial):

| Input | Hours |
|---|---|
| `null`, `""`, `"Real-time"`, `"Transactional"`, `"On Demand"`, `"Batch"` | 0 |
| `"Hourly"` | 1 |
| `"Batch (12/day)"` | 2 |
| `"Batch (4/day)"` | 6 |
| `"Daily"`, `"Batch (daily)"` | 24 |
| `"Weekly"`, `"TBD"`, `"n/a"` | 168 |
| `"Bi-Weekly"` | 336 |
| `"Monthly"`, `"Batch (monthly)"` | 720 |
| `"Quarterly"` | 2184 |
| `"Annually"`, `"Annual"` | 8760 |
| `"SMSS_HOURS_{N}"` | N (parsed from suffix) |
| Any numeric string | parsed as double → int |
| Unrecognized string | 0 (silent fallback, legacy behavior) |

### Return Value

`NounMetadata(Map<String, Object>, PixelDataType.CUSTOM_DATA_STRUCTURE)`

```json
{
  "0.0":   [ { "uri": "...", "source": "...", "target": "...", "propHash": {...} } ],
  "24.0":  [ ... ],
  "168.0": [ ... ],
  "_meta": {
    "computedThresholdHours": 1000.0,
    "selectedNodeUri": null,
    "numRootsUsed": 5,
    "totalEdgesScored": 23,
    "totalNodesIncluded": 18,
    "scoreBuckets": ["0.0", "24.0", "168.0"]
  }
}
```

The `_meta` key is for debugging only. The frontend ignores it; the slider logic reads only the numeric string keys.

### Frontend Pixel Call

```js
actions.run(
  'RunDataLatencyAnalysis(' +
  'database=["133db94b-4371-4763-bff9-edf7e5ed021b"], ' +
  'dataObject=["http://health.mil/ontologies/Concept/DataObject/Admissions"]' +
  ');'
)
```

---

## Reactor: `CompareGraphOutputsReactor` (Debug)

**Package:** `reactors.debug`  
**Pixel command:** `CompareGraphOutputs`

This is a regression testing tool. It compares the output of the legacy `InterfaceGraphPlaySheet` insight (#140) against `GetGraphForDataObjectReactor` for the same data object URI and returns a diff report.

### Parameters

| Key | Type | Required |
|---|---|---|
| `database` | String (UUID) | Yes |
| `dataObject` | String (URI) | Yes |

### How It Works

**Step 1 — Run legacy insight via `RunPlaysheetReactor`:**
- Instantiates `prerna.reactor.legacy.playsheets.RunPlaysheetReactor`
- Wires its noun store with: `database`, `app` (same UUID, legacy fallback), `id = "140"`, `param = {"Data": [dataObjectUri]}`
- Calls `execute()` and casts result to `Map<String, Object>`

**Step 2 — Run new reactor programmatically:**
- Instantiates `GetGraphForDataObjectReactor`
- Wires `database` and `dataObject` using `GenRowStruct` / `PixelPlanner`
- Calls `execute()`

**Step 3 — Diff:**
- Collects node URI sets from both results (keys of the `"nodes"` map)
- Collects edge keys: `"source|target"` strings, handling both `SEMOSSEdge` objects (legacy) and plain `Map` objects (new reactor)
- Computes: `nodesOnlyInLegacy`, `nodesOnlyInNew`, `edgesOnlyInLegacy`, `edgesOnlyInNew`

**Step 4 — Return:**
```json
{
  "dataObject":       "Admissions",
  "dataObjectUri":    "http://health.mil/ontologies/Concept/DataObject/Admissions",
  "legacy":           { "nodes": 12, "edges": 18 },
  "new":              { "nodes": 12, "edges": 18 },
  "match":            true,
  "nodesOnlyInLegacy": [],
  "edgesOnlyInNew":    []
}
```

If either reactor throws, an `"error"` key is added, `"match"` is set to `false`, and the reactor returns gracefully without re-throwing.

---

## Utility Classes

### `QueryExecutor`

**Package:** `util`

Wraps SEMOSS's `WrapperManager` to execute SPARQL SELECT queries and return typed results.

**Constructor:**
```java
public QueryExecutor(String engineId)
```
1. Validates `engineId` is non-null/non-empty → `IllegalArgumentException`
2. Resolves alias → UUID via `MasterDatabaseUtility.testDatabaseIdIfAlias(engineId)`
3. Gets `IDatabaseEngine` via `Utility.getDatabase(resolvedId)` → `IllegalArgumentException` if null

**`executeSelect(String query)`:**
```java
public List<Map<String, String>> executeSelect(String query)
```
1. Gets `IRawSelectWrapper` via `WrapperManager.getInstance().getRawWrapper(engine, query)`
2. Reads variable names from `wrapper.getHeaders()`
3. Iterates rows: prefers `statement.getRawValues()`, falls back to `statement.getValues()`
4. Builds a `TreeMap<String, String>` per row (keys = SPARQL variable names, values = `.toString()`)
5. Skips null values and empty rows; closes wrapper in `finally`
6. On any exception: logs, re-throws as `RuntimeException("Query execution error: " + e.getMessage(), e)`

**Other accessors:** `getEngine()` → `IDatabaseEngine`, `getEngineId()` → `String`

---

### `ProjectProperties`

**Package:** `util`  
**Pattern:** Singleton

Loads configuration from `{projectAssetsFolder}/java/project.properties`.

**`getInstance(String projectId)`** — lazily creates the singleton by calling `loadProp(projectId)`.  
**`getInstance()` (no-arg)** — returns existing instance or throws `RuntimeException("Unable to load project configuration")` if not yet initialized.

`loadProp` uses `AssetUtility.getProjectAssetsFolder(projectId)` to resolve the path and `Utility.normalizePath()` for cross-platform compatibility.

> **Note:** No properties are currently extracted from the file — the class is a scaffold with `TODO` placeholders for fields and getters. Extend it by adding `private String fieldName;` fields, getters, and assignments inside `loadProp`.

**Thread safety:** Not synchronized. Multiple simultaneous first calls can trigger duplicate `loadProp` invocations. This is non-damaging but worth addressing with a `synchronized` block if needed.

---
## Data Model Reference

### Node (in `GetGraphForDataObject` response)

A node is a map entry in the top-level `"nodes"` object. The key is the full RDF URI.

```json
"http://health.mil/ontologies/Concept/DataObject/Admissions": {
  "propHash": {
    "VERTEX_LABEL_PROPERTY": "Admissions",
    "VERTEX_TYPE_PROPERTY":  "DataObject",
    "VERTEX_COLOR_PROPERTY": "255,127,14",
    "URI":                   "http://health.mil/...",
    "PhysicalName":          "Admissions",
    "System":                "7",
    "Outputs":               "7",
    "Description":           "...",
    "DataType":              "..."
  }
}
```

System nodes use `VERTEX_TYPE_PROPERTY = "System"` and `VERTEX_COLOR_PROPERTY = "31,119,180"`.

### Edge (in `GetGraphForDataObject` response)

An edge is an element in the `"edges"` list:

```json
{
  "uri":    "http://health.mil/ontologies/Relation/Provide/CHCS:Admissions",
  "source": "http://health.mil/ontologies/Concept/DataObject/Admissions",
  "target": "http://health.mil/ontologies/Concept/ActiveSystem/CHCS",
  "propHash": {
    "EDGE_NAME": "CHCS:Admissions",
    "EDGE_TYPE": "Provide",
    "URI":       "http://health.mil/ontologies/Relation/Provide/CHCS:Admissions",
    "CRM":       "C",
    "Frequency": "Daily"
  }
}
```

ICD (system-to-system) edges use `EDGE_TYPE = "Relation"` and both `source` and `target` are system URIs.

---

## Pixel API Summary

| Pixel Command | Class | Package | Called When |
|---|---|---|---|
| `ListDataObjects` | `ListDataObjectsReactor` | `reactors.networkOfSystems` | Page load — populates data object dropdown |
| `GetGraphForDataObject` | `GetGraphForDataObjectReactor` | `reactors.networkOfSystems` | User selects a data object |
| `RunDataLatencyAnalysis` | `RunDataLatencyAnalysisReactor` | `reactors` | User activates latency analysis toggle |
| `CompareGraphOutputs` | `CompareGraphOutputsReactor` | `reactors.debug` | Debug page only — iterates all data objects |

---

## Error Handling Reference

| Location | Condition | Behavior |
|---|---|---|
| `AbstractProjectReactor.execute()` | Any uncaught `Exception` | Returns error `NounMetadata` with message and `PixelOperationType.ERROR` |
| `QueryExecutor` constructor | `engineId` null or blank | `IllegalArgumentException` |
| `QueryExecutor` constructor | Engine UUID unresolvable | `IllegalArgumentException` |
| `QueryExecutor.executeSelect()` | Null wrapper from `WrapperManager` | `RuntimeException` |
| `QueryExecutor.executeSelect()` | SPARQL execution failure | `RuntimeException` wrapping original cause |
| `QueryExecutor.executeSelect()` | Wrapper close fails | Logged as WARN, not re-thrown |
| `ProjectProperties.getInstance()` | Not yet initialized | `RuntimeException` |
| `ProjectProperties.loadProp()` | File missing or unreadable | Sets `INSTANCE = null`, logs WARN |
| `GetGraphForDataObjectReactor` | `loadNodeProperties()` query fails | Logs WARN, continues without properties |
| `GetGraphForDataObjectReactor` | `loadProvideEdgeProperties()` fails | Logs DEBUG, continues |
| `RunDataLatencyAnalysisReactor` | `loadContainsProperties()` fails | Logs DEBUG, continues |
| `RunDataLatencyAnalysisReactor.translateString()` | `SMSS_HOURS_{N}` unparseable | Logs ERROR, returns 0 |
| `RunDataLatencyAnalysisReactor.translateString()` | Unknown/non-numeric string | Silent 0 fallback (legacy behavior) |
| `CompareGraphOutputsReactor` | Either sub-reactor throws | Returns `{"error": "...", "match": false}` |

---

## Key SEMOSS API Dependencies

| SEMOSS Class | Role |
|---|---|
| `prerna.reactor.AbstractReactor` | Parent class for all reactors |
| `prerna.sablecc2.om.nounmeta.NounMetadata` | Return type wrapper for all reactors |
| `prerna.sablecc2.om.PixelDataType` | Enum for return type classification |
| `prerna.sablecc2.om.PixelOperationType` | Enum for operation type (e.g., ERROR) |
| `prerna.sablecc2.om.ReactorKeysEnum` | Enum for standard Pixel parameter key names |
| `prerna.sablecc2.om.GenRowStruct` | Used to wire noun stores when calling reactors programmatically |
| `prerna.engine.api.IDatabaseEngine` | Handle to the RDF engine |
| `prerna.engine.api.IRawSelectWrapper` | Iterator over SPARQL result rows |
| `prerna.engine.api.IHeadersDataRow` | One row of SPARQL results |
| `prerna.rdf.engine.wrappers.WrapperManager` | Factory for query wrappers |
| `prerna.masterdatabase.utility.MasterDatabaseUtility` | Resolves engine alias → UUID |
| `prerna.util.AssetUtility` | Resolves project asset folder path |
| `prerna.util.Utility` | Path normalization; engine lookup |
| `prerna.om.SEMOSSEdge` | Legacy edge type used by `CompareGraphOutputsReactor` for diff |
| `prerna.reactor.legacy.playsheets.RunPlaysheetReactor` | Invokes legacy insight #140 for diff comparison |

---

