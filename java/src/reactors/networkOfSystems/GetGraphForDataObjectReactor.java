package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Retrieves the full network-of-systems graph for a selected DataObject.
 *
 * <p>Replicates the legacy insight #140 CONSTRUCT query logic:
 * <ol>
 *   <li>Find ActiveSystem nodes that Provide the DataObject with CRM in ('C','M')</li>
 *   <li>Find System↔System edges via SystemInterface (ICD) pattern where
 *       the interface carries the selected DataObject</li>
 *   <li>Load node and edge properties via Contains predicates</li>
 * </ol>
 *
 * <p>Pixel call:
 * <pre>
 *   GetGraphForDataObject(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     dataObject=["http://health.mil/ontologies/Concept/DataObject/Admissions"]
 *   );
 * </pre>
 */
public class GetGraphForDataObjectReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(GetGraphForDataObjectReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();
  private static final String DATA_OBJECT_KEY = "dataObject";

  private static final String SYSTEM_COLOR = "31,119,180";
  private static final String DATA_OBJECT_COLOR = "255,127,14";

  public GetGraphForDataObjectReactor() {
    this.keysToGet = new String[] { DATABASE_KEY, DATA_OBJECT_KEY };
    this.keyRequired = new int[] { 1, 1 };
  }

  @Override
  protected NounMetadata doExecute() {
    String engineId = this.keyValue.get(DATABASE_KEY);
    String dataObjectUri = this.keyValue.get(DATA_OBJECT_KEY);
    LOGGER.info("GetGraphForDataObject: engine=" + engineId + " dataObject=" + dataObjectUri);

    QueryExecutor executor = new QueryExecutor(engineId);

    String dataObjectName = dataObjectUri.contains("/")
        ? dataObjectUri.substring(dataObjectUri.lastIndexOf('/') + 1)
        : dataObjectUri;

    // ── 1. Get ActiveSystems that Provide this DataObject (CRM = C or M) ─────
    // Legacy query: ?System1 rdf:type ActiveSystem; ?provide rdfs:subPropertyOf Provide;
    //   ?System1 ?provide ?Data1; ?provide Contains/CRM ?crm  BINDINGS ?crm {('C')('M')}
    String provideQuery =
        "SELECT DISTINCT ?System ?provide ?crm WHERE {"
        + " ?System <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Concept/ActiveSystem> ."
        + " ?provide <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> "
        + "   <http://semoss.org/ontologies/Relation/Provide> ."
        + " ?System ?provide <" + dataObjectUri + "> ."
        + " ?provide <http://semoss.org/ontologies/Relation/Contains/CRM> ?crm ."
        + " FILTER(?crm = 'C' || ?crm = 'M')"
        + "}";

    List<Map<String, String>> provideRows = executor.executeSelect(provideQuery);
    Set<String> provideSystemUris = new HashSet<>();
    // Store provide predicate URIs for later property loading
    Map<String, String> providePredicateMap = new HashMap<>(); // systemUri -> providePredicateUri
    for (Map<String, String> row : provideRows) {
      String uri = row.get("System");
      String provPred = row.get("provide");
      if (uri != null) {
        provideSystemUris.add(uri);
        if (provPred != null) providePredicateMap.put(uri, provPred);
      }
    }
    LOGGER.info("GetGraphForDataObject: found " + provideSystemUris.size()
        + " active systems via Provide (CRM=C|M)");

    // ── 2. Get System↔System edges via SystemInterface (ICD) pattern ─────────
    // Legacy: System2 --upstream(Provide)--> ICD --downstream(Consume)--> System3
    //   where ICD --carries(Payload)--> DataObject
    //   and both System2/System3 are ActiveSystem
    String icdQuery =
        "SELECT DISTINCT ?System2 ?System3 ?carries ?contains ?prop WHERE {"
        + " ?System2 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Concept/ActiveSystem> ."
        + " ?System3 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Concept/ActiveSystem> ."
        + " ?icd1 <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Concept/SystemInterface> ."
        + " ?upstream1 <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> "
        + "   <http://semoss.org/ontologies/Relation/Provide> ."
        + " ?downstream1 <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> "
        + "   <http://semoss.org/ontologies/Relation/Consume> ."
        + " ?carries <http://www.w3.org/2000/01/rdf-schema#subPropertyOf> "
        + "   <http://semoss.org/ontologies/Relation/Payload> ."
        + " ?contains <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Relation/Contains> ."
        + " ?System2 ?upstream1 ?icd1 ."
        + " ?icd1 ?downstream1 ?System3 ."
        + " ?icd1 ?carries <" + dataObjectUri + "> ."
        + " ?carries ?contains ?prop ."
        + "}";

    List<Map<String, String>> icdRows = executor.executeSelect(icdQuery);
    LOGGER.info("GetGraphForDataObject: found " + icdRows.size() + " ICD edge rows");

    // Deduplicate system-system edges and collect edge properties from ICD
    // EdgeKey = sourceUri + "|" + targetUri
    Map<String, Map<String, Object>> edgeMap = new LinkedHashMap<>();
    Set<String> icdSystemUris = new HashSet<>();

    for (Map<String, String> row : icdRows) {
      String sys2Uri = row.get("System2");
      String sys3Uri = row.get("System3");
      String containsUri = row.get("contains");
      String propValue = row.get("prop");
      if (sys2Uri == null || sys3Uri == null) continue;

      icdSystemUris.add(sys2Uri);
      icdSystemUris.add(sys3Uri);

      String edgeKey = sys2Uri + "|" + sys3Uri;
      Map<String, Object> edgeData = edgeMap.get(edgeKey);
      if (edgeData == null) {
        String sourceName = localName(sys2Uri);
        String targetName = localName(sys3Uri);
        String edgeUri = "http://health.mil/ontologies/Relation/" + sourceName + ":" + targetName;

        edgeData = new HashMap<>();
        edgeData.put("uri", edgeUri);
        edgeData.put("source", sys2Uri);
        edgeData.put("target", sys3Uri);

        Map<String, Object> propHash = new HashMap<>();
        propHash.put("EDGE_NAME", sourceName + ":" + targetName);
        propHash.put("EDGE_TYPE", "Relation");
        propHash.put("URI", edgeUri);
        edgeData.put("propHash", propHash);
        edgeMap.put(edgeKey, edgeData);
      }

      // Add edge property from the ICD Contains triple
      if (containsUri != null && propValue != null) {
        @SuppressWarnings("unchecked")
        Map<String, Object> propHash = (Map<String, Object>) edgeData.get("propHash");
        String propName = localName(containsUri);
        propHash.put(propName, propValue);
      }
    }

    LOGGER.info("GetGraphForDataObject: " + edgeMap.size() + " unique system-system edges");

    // ── 3. Collect all system URIs (from Provide + ICD edges) ────────────────
    Set<String> allSystemUris = new HashSet<>();
    allSystemUris.addAll(provideSystemUris);
    allSystemUris.addAll(icdSystemUris);

    // ── 4. Build edge list ───────────────────────────────────────────────────
    List<Map<String, Object>> edges = new ArrayList<>(edgeMap.values());

    // Add Provide edges (DataObject → System) for Provide systems
    for (String sysUri : provideSystemUris) {
      String sysName = localName(sysUri);
      String edgeUri = "http://health.mil/ontologies/Relation/Provide/" + sysName + ":" + dataObjectName;

      Map<String, Object> edge = new HashMap<>();
      edge.put("uri", edgeUri);
      edge.put("source", dataObjectUri);
      edge.put("target", sysUri);

      Map<String, Object> edgePropHash = new HashMap<>();
      edgePropHash.put("EDGE_NAME", sysName + ":" + dataObjectName);
      edgePropHash.put("EDGE_TYPE", "Provide");
      edgePropHash.put("URI", edgeUri);
      edge.put("propHash", edgePropHash);

      edges.add(edge);
    }

    LOGGER.info("GetGraphForDataObject: total edges = " + edges.size());

    // ── 5. Load Provide edge properties ──────────────────────────────────────
    loadProvideEdgeProperties(executor, edges, providePredicateMap);

    // ── 6. Build node map ────────────────────────────────────────────────────
    Map<String, Map<String, Object>> nodes = new LinkedHashMap<>();

    // DataObject node
    Map<String, Object> doNode = new HashMap<>();
    Map<String, Object> doPropHash = new HashMap<>();
    doPropHash.put("VERTEX_LABEL_PROPERTY", dataObjectName.replace('_', ' '));
    doPropHash.put("VERTEX_TYPE_PROPERTY", "DataObject");
    doPropHash.put("VERTEX_COLOR_PROPERTY", DATA_OBJECT_COLOR);
    doPropHash.put("URI", dataObjectUri);
    doPropHash.put("PhysicalName", dataObjectName);
    doPropHash.put("System", String.valueOf(provideSystemUris.size()));
    doPropHash.put("Outputs", String.valueOf(provideSystemUris.size()));
    loadNodeProperties(executor, dataObjectUri, doPropHash);
    doNode.put("propHash", doPropHash);
    nodes.put(dataObjectUri, doNode);

    // System nodes
    for (String sysUri : allSystemUris) {
      Map<String, Object> sysNode = new HashMap<>();
      Map<String, Object> sysPropHash = new HashMap<>();
      String sysName = localName(sysUri);
      sysPropHash.put("VERTEX_LABEL_PROPERTY", sysName.replace('_', ' '));
      sysPropHash.put("VERTEX_TYPE_PROPERTY", "System");
      sysPropHash.put("VERTEX_COLOR_PROPERTY", SYSTEM_COLOR);
      sysPropHash.put("URI", sysUri);
      sysPropHash.put("PhysicalName", sysName);
      loadNodeProperties(executor, sysUri, sysPropHash);
      sysNode.put("propHash", sysPropHash);
      nodes.put(sysUri, sysNode);
    }

    LOGGER.info("GetGraphForDataObject: total nodes = " + nodes.size());

    // ── 7. Build response ────────────────────────────────────────────────────
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("nodes", nodes);
    result.put("edges", edges);
    result.put("title", "What is the network of systems for this data?");
    result.put("dataMakerName", "GraphDataModel");
    result.put("layout", "prerna.ui.components.specific.tap.InterfaceGraphPlaySheet");

    return new NounMetadata(result, PixelDataType.CUSTOM_DATA_STRUCTURE);
  }

  /**
   * Load properties for a single node from RDF Contains predicates.
   */
  private void loadNodeProperties(QueryExecutor executor, String nodeUri,
      Map<String, Object> propHash) {
    String query =
        "SELECT ?Predicate ?Value WHERE {"
        + " <" + nodeUri + "> ?Predicate ?Value ."
        + " ?Predicate <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
        + "   <http://semoss.org/ontologies/Relation/Contains> ."
        + "}";

    try {
      List<Map<String, String>> rows = executor.executeSelect(query);
      for (Map<String, String> row : rows) {
        String predUri = row.get("Predicate");
        String value = row.get("Value");
        if (predUri != null && value != null) {
          String propName = localName(predUri);
          propHash.put(propName, value);
        }
      }
    } catch (Exception e) {
      LOGGER.warn("Failed to load properties for " + nodeUri + ": " + e.getMessage());
    }
  }

  /**
   * Load properties for Provide edges (CRM etc.) from the provide predicate URI.
   */
  private void loadProvideEdgeProperties(QueryExecutor executor,
      List<Map<String, Object>> edges, Map<String, String> providePredicateMap) {
    for (Map<String, Object> edge : edges) {
      @SuppressWarnings("unchecked")
      Map<String, Object> propHash = (Map<String, Object>) edge.get("propHash");
      if (!"Provide".equals(propHash.get("EDGE_TYPE"))) continue;

      String targetUri = (String) edge.get("target");
      String provPredUri = providePredicateMap.get(targetUri);
      if (provPredUri == null) continue;

      // Load properties from the provide predicate instance
      String query =
          "SELECT ?Predicate ?Value WHERE {"
          + " <" + provPredUri + "> ?Predicate ?Value ."
          + " ?Predicate <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
          + "   <http://semoss.org/ontologies/Relation/Contains> ."
          + "}";

      try {
        List<Map<String, String>> rows = executor.executeSelect(query);
        for (Map<String, String> row : rows) {
          String predUri = row.get("Predicate");
          String value = row.get("Value");
          if (predUri != null && value != null) {
            propHash.put(localName(predUri), value);
          }
        }
      } catch (Exception e) {
        LOGGER.debug("Failed to load provide edge properties: " + e.getMessage());
      }
    }
  }

  /** Extract the local name from a URI (portion after the last /). */
  private static String localName(String uri) {
    if (uri == null) return "";
    int idx = uri.lastIndexOf('/');
    return idx >= 0 ? uri.substring(idx + 1) : uri;
  }

  @Override
  public String getReactorDescription() {
    return "Returns the full network-of-systems graph for a selected DataObject.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    if (DATABASE_KEY.equals(key)) {
      return "The UUID of the RDF database engine to query.";
    }
    if (DATA_OBJECT_KEY.equals(key)) {
      return "The full URI of the DataObject to build the network for.";
    }
    return null;
  }
}
