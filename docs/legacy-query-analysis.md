# Legacy "Network of Systems" Query Analysis

## Overview

This document describes how the legacy SEMOSS platform executes **Insight #140** — *"What is the network of systems for this data?"* — from the `TAP_Core_Data` RDF database (`133db94b-4371-4763-bff9-edf7e5ed021b`). The insight renders a force-directed graph showing which systems exchange a selected DataObject and how they are interconnected through SystemInterface (ICD) entities.

---

## Execution Flow

### 1. User selects a DataObject from a dropdown

The dropdown is populated by insight **#125**, which runs:

```sparql
SELECT DISTINCT ?Data ?Description WHERE {
  {?Data <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
         <http://semoss.org/ontologies/Concept/DataObject> ;}
  {?Data <http://semoss.org/ontologies/Relation/Contains/Description> ?Description ;}
}
```

The user selects a value (e.g. `Admissions`). This value is passed to insight #140 as a parameter.

### 2. Insight #140 loads from the H2 insights database

**Source**: `insights_database.mv.db` in `Semoss/db/TAP_Core_Data__133db94b-.../`

The `QUESTION_ID` table row for ID `140` contains:
- `QUESTION_MAKEUP`: N-Triples string encoding the query, engine, and transformations
- `QUESTION_DATA_MAKER`: `GraphDataModel`
- `QUESTION_LAYOUT`: `prerna.ui.components.specific.tap.InterfaceGraphPlaySheet`

### 3. OldInsight parses the N-Triples makeup

**Source file**: `Semoss/src/prerna/om/OldInsight.java`

The `digestNTriples()` method (line ~340) parses the N-Triples encoded in `QUESTION_MAKEUP` into an in-memory Sesame RDF engine. It extracts:

- **Component/0**: The query component targeting `TAP_Core_Data`
- **Engine**: `TAP_Core_Data`
- **Query**: The CONSTRUCT SPARQL query (see Section 4)
- **PreTransformation/0**: A filter transformation

The N-Triples contain these key triples:

```
<.../Component/0> <.../Contains/Query> "CONSTRUCT { ... } WHERE { ... }" .
<.../PreTransformation/0> <.../Contains/propMap> '{"Type":"filter","colHeader":"Data"}' .
<.../Component/0> <Comp:PreTrans> <.../PreTransformation/0> .
```

### 4. PreTransformation fills the parameterized query

**Source files**:
- `Semoss/src/prerna/ui/components/playsheets/datamakers/FilterTransformation.java`
- `Semoss/src/prerna/util/Utility.java` — `fillParam()` (line 392), `normalizeParam()` (line 362)

The CONSTRUCT query contains a parameterized BIND: `BIND(<@Data-http://semoss.org/ontologies/Concept/DataObject@> AS ?Data1)`.

The `FilterTransformation` (configured as a pre-transformation with `colHeader=Data`) invokes `Utility.fillParam()` which replaces the `@Data@` placeholder with the user's selected DataObject URI, e.g.:

```
@Data@ → http://health.mil/ontologies/Concept/DataObject/Admissions
```

### 5. GraphDataModel executes the CONSTRUCT query

**Source file**: `Semoss/src/prerna/om/GraphDataModel.java`

The `processData()` method (line ~327) executes the parameterized CONSTRUCT query against the BigData (Blazegraph) RDF engine. The results are loaded into an in-memory Sesame repository connection (`rc`), which serves as the graph model.

Key processing steps (with log line references):
1. **Main query execution** (line ~370): Processes CONSTRUCT triples into in-memory RDF store
2. **Base data loading** (line ~423): `loadBaseData()` loads base ontology relationships
3. **Hierarchy loading** (line ~433): `RDFEngineHelper.loadConceptHierarchy()` and `loadRelationHierarchy()` resolve class/property hierarchies
4. **Contains detection** (line ~449): `findContainsRelation()` detects the Contains property URI
5. **Property loading** (line ~467): `RDFEngineHelper.genNodePropertiesLocal()` and `genEdgePropertiesLocal()` extract all Contains-based properties for nodes and edges
6. **Graph building** (line ~1257): `fillStoresFromModel()` queries the in-memory model for:
   - All Concepts (orphan nodes): `?Subject rdf:type semoss:Concept`
   - All Relations (edges): `?Subject ?Predicate ?Object` where `?Predicate rdfs:subPropertyOf semoss:Relation` and `?Subject rdf:type semoss:Concept`

### 6. InterfaceGraphPlaySheet serializes the result

**Source**: The playsheet class is `prerna.ui.components.specific.tap.InterfaceGraphPlaySheet` (compiled .class only — no source available). It delegates to `GraphGDMPlaySheetHelper` for JSON serialization.

The output JSON contains:
- `nodes`: Map of URI → `{uri, propHash}` for each concept in the graph
- `edges`: Array of `{uri, source, target, propHash}` for each relation
- `title`, `dataMakerName`, `layout`

---

## The CONSTRUCT Query

This is the exact query stored in insight #140's `QUESTION_MAKEUP`, formatted for readability:

```sparql
CONSTRUCT {
  ?Data1 ?provide ?System1 .
  ?System2 ?passes ?System3 .
  ?passes ?contains ?prop .
  ?passes ?subprop ?relation .
  ?provide ?contains2 ?crm .
}
WHERE {
  BIND(<@Data-http://semoss.org/ontologies/Concept/DataObject@> AS ?Data1) .

  {
    -- UNION 1: Provide edges (ActiveSystem → DataObject)
    {?System1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
              <http://semoss.org/ontologies/Concept/ActiveSystem> ;}
    {?provide <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
              <http://semoss.org/ontologies/Relation/Provide> ;}
    {?System1 ?provide ?Data1 ;}
    BIND(<http://semoss.org/ontologies/Relation/Contains/CRM> AS ?contains2) .
    {?provide ?contains2 ?crm ;}
  }
  UNION
  {
    -- UNION 2: System↔System edges via SystemInterface (ICD)
    BIND(URI(CONCAT(
      'http://health.mil/ontologies/Relation/',
      SUBSTR(STR(?System2), 45), ':',
      SUBSTR(STR(?System3), 45)
    )) AS ?passes) .

    {?System2 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
              <http://semoss.org/ontologies/Concept/ActiveSystem> ;}
    {?System3 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
              <http://semoss.org/ontologies/Concept/ActiveSystem> ;}
    {?carries <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
              <http://semoss.org/ontologies/Relation/Payload> ;}
    {?contains <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
               <http://semoss.org/ontologies/Relation/Contains> ;}
    {?icd1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>
            <http://semoss.org/ontologies/Concept/SystemInterface> ;}
    {?upstream1 <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
                <http://semoss.org/ontologies/Relation/Provide> ;}
    {?downstream1 <http://www.w3.org/2000/01/rdf-schema#subPropertyOf>
                  <http://semoss.org/ontologies/Relation/Consume> ;}
    {?System2 ?upstream1 ?icd1 ;}
    {?icd1 ?downstream1 ?System3 ;}
    {?icd1 ?carries ?Data1 ;}
    {?carries ?contains ?prop ;}
  }

  BIND(<http://www.w3.org/2000/01/rdf-schema#subPropertyOf> AS ?subprop)
  BIND(<http://semoss.org/ontologies/Relation> AS ?relation)
}
BINDINGS ?crm { ('C') ('M') }
```

---

## Query Logic Explained

### UNION 1: Provide Edges (DataObject → System)

**Purpose**: Find all active systems that provide or consume the selected DataObject.

**Triple pattern**:
```
System1 --[?provide]--> DataObject
```
Where `?provide` is a subproperty of `semoss:Relation/Provide`.

**Filters**:
- `System1` must be of type `ActiveSystem` (not just `System` — this excludes decommissioned/inactive systems)
- The provide relationship must have a `Contains/CRM` property with value `'C'` (Create) or `'M'` (Modify)
  - This is enforced by `BINDINGS ?crm { ('C') ('M') }` at the bottom of the query
  - The CRM value indicates the system's relationship to the data: **C**reate, **R**ead, or **M**odify
  - Read-only (`'R'`) relationships are excluded from the network graph because this insight focuses on data flow/interfaces, not passive consumers

**CONSTRUCT output**: `?Data1 ?provide ?System1` — the DataObject-to-System provide edge
**CONSTRUCT output**: `?provide ?contains2 ?crm` — the CRM property on the provide edge

### UNION 2: System↔System Interface Edges

**Purpose**: Find all system-to-system data interfaces that carry the selected DataObject.

**Data model**: The TAP ontology models system interfaces using **SystemInterface** (ICD) entities as intermediary nodes:

```
System2 --[upstream/Provide]--> SystemInterface --[downstream/Consume]--> System3
                                       |
                                       +--[carries/Payload]--> DataObject
```

- `SystemInterface` (ICD = Interface Control Document) represents a point-to-point data exchange
- `upstream` (subPropertyOf `Provide`): the source system provides data to the ICD
- `downstream` (subPropertyOf `Consume`): the target system consumes data from the ICD
- `carries` (subPropertyOf `Payload`): the ICD carries a specific DataObject

**Filters**:
- Both `System2` and `System3` must be `ActiveSystem`
- The ICD must carry (`Payload`) the selected DataObject specifically
- Only ICDs linking the DataObject are included

**Synthetic edge URI**: The query constructs a synthetic edge URI using:
```sparql
BIND(URI(CONCAT('http://health.mil/ontologies/Relation/',
     SUBSTR(STR(?System2), 45), ':', SUBSTR(STR(?System3), 45))) AS ?passes)
```
The `SUBSTR(..., 45)` strips the `http://health.mil/ontologies/Concept/System/` prefix (44 chars + 1), leaving just the system name. This creates URIs like `http://health.mil/ontologies/Relation/MHS_GENESIS:TMDS`.

**CONSTRUCT output**: `?System2 ?passes ?System3` — the system-to-system edge
**CONSTRUCT output**: `?passes ?contains ?prop` — edge properties from the Payload relation's Contains predicates
**CONSTRUCT output**: `?passes ?subprop ?relation` — ensures the synthetic edge is recognized as a `rdfs:subPropertyOf semoss:Relation`, so GraphDataModel includes it as a proper edge

### Post-CONSTRUCT Processing

After the CONSTRUCT results are loaded into the in-memory model, `GraphDataModel.fillStoresFromModel()` queries the model to build the final graph:

1. **Node property loading**: For each concept in the model, queries `?node ?pred ?value` where `?pred rdf:type Contains` to get all system properties (Description, Full_System_Name, Disposition, etc.)
2. **Edge property loading**: Similarly loads properties for each relation instance
3. **Orphan detection**: Finds concepts that appear in the model but have no edges (included as isolated nodes)

The `BINDINGS ?crm { ('C') ('M') }` clause acts as a pre-filter before the CONSTRUCT executes — it restricts the CRM variable to only C or M values, which means systems with `CRM = 'R'` (Read-only) are never included in the Provide edges.

---

## Why the Original Reactor Was Wrong

The original reactor implementation had three fundamental errors:

| Aspect | Original Reactor | Legacy System |
|--------|-----------------|---------------|
| **System type** | `rdf:type Concept/System` | `rdf:type Concept/ActiveSystem` |
| **Provide filter** | No CRM filter (all provides) | CRM = 'C' or 'M' only |
| **System-System edges** | Direct `rdfs:subPropertyOf Relation` between systems | Via SystemInterface (ICD) intermediary with Payload→DataObject |

These errors produced:
- **120 Provide systems** instead of 37 (included Requirements and inactive systems)
- **58 Requirement nodes** that shouldn't exist (Requirements also have Provide→DataObject in the ontology)
- **39 direct system-system edges** instead of 57 ICD-derived edges (different edge topology entirely)
- **179 total nodes** instead of 79; **217 edges** instead of 94

---

## Source File Reference

| File | Location | Role |
|------|----------|------|
| `OldInsight.java` | `Semoss/src/prerna/om/` | Parses QUESTION_MAKEUP N-Triples, creates DataMakerComponents, wires pre/post transformations |
| `GraphDataModel.java` | `Semoss/src/prerna/om/` | Executes CONSTRUCT query, builds in-memory RDF model, extracts nodes/edges/properties |
| `FilterTransformation.java` | `Semoss/src/prerna/ui/components/playsheets/datamakers/` | Pre-transformation that fills `@param@` placeholders in the query with user-selected values |
| `Utility.java` | `Semoss/src/prerna/util/` | `fillParam()` / `normalizeParam()` — string replacement of `@key@` patterns in queries |
| `RDFEngineHelper.java` | `Semoss/src/prerna/ui/components/` | Loads concept/relation hierarchies and property data from RDF into GraphDataModel |
| `WrapperManager.java` | `Semoss/src/prerna/rdf/engine/wrappers/` | Factory for RDF query wrappers (SELECT/CONSTRUCT) against database engines |
| `BigDataEngine` | (Blazegraph) | The underlying RDF triplestore holding TAP_Core_Data |
| `insights_database.mv.db` | `Semoss/db/TAP_Core_Data__133db94b-.../` | H2 database storing QUESTION_ID table with insight definitions |
| `TAP_Core_Data_OWL.OWL` | `Semoss/db/TAP_Core_Data__133db94b-.../` | OWL ontology defining System, ActiveSystem, DataObject, SystemInterface, Provide, Consume, Payload, Contains relationships |

---

## TAP Ontology Key Concepts

```
ActiveSystem ─── subClassOf ──→ System ─── subClassOf ──→ Concept
DataObject ──────────────────────────────── subClassOf ──→ Concept
SystemInterface ─────────────────────────── subClassOf ──→ Concept
Requirement ─────────────────────────────── subClassOf ──→ Concept

Provide ─── subPropertyOf ──→ Relation    (System→DataObject, System→SystemInterface)
Consume ─── subPropertyOf ──→ Relation    (SystemInterface→System)
Payload ─── subPropertyOf ──→ Relation    (SystemInterface→DataObject)
Contains ── (property type)               (attaches key-value properties to any entity)
```

The `ActiveSystem` type is critical — it's a subset of `System` that represents currently active/operational systems, excluding decommissioned or planned-only systems.
