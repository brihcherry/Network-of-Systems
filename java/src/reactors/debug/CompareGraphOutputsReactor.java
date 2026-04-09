package reactors.debug;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.om.SEMOSSEdge;
import prerna.reactor.PixelPlanner;
import prerna.reactor.legacy.playsheets.RunPlaysheetReactor;
import prerna.sablecc2.om.GenRowStruct;
import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.ReactorKeysEnum;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import reactors.networkOfSystems.GetGraphForDataObjectReactor;

/**
 * Debug reactor that compares the legacy insight #140 output against the new
 * {@link GetGraphForDataObjectReactor} output for a single DataObject.
 *
 * <p>Uses {@link RunPlaysheetReactor} to invoke the legacy playsheet
 * programmatically (same pattern as the System-Similarity example), then
 * invokes the new reactor, and diffs the node/edge sets.
 *
 * <p>Pixel call:
 * <pre>
 *   CompareGraphOutputs(
 *     database=["133db94b-4371-4763-bff9-edf7e5ed021b"],
 *     dataObject=["http://health.mil/ontologies/Concept/DataObject/Admissions"]
 *   );
 * </pre>
 */
public class CompareGraphOutputsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(CompareGraphOutputsReactor.class);

  private static final String DATABASE_KEY = ReactorKeysEnum.DATABASE.getKey();
  private static final String DATA_OBJECT_KEY = "dataObject";
  private static final String LEGACY_INSIGHT_ID = "140";
  private static final String APP_KEY = "app";

  public CompareGraphOutputsReactor() {
    this.keysToGet = new String[] { DATABASE_KEY, DATA_OBJECT_KEY };
    this.keyRequired = new int[] { 1, 1 };
  }

  @Override
  @SuppressWarnings("unchecked")
  protected NounMetadata doExecute() {
    String engineId = this.keyValue.get(DATABASE_KEY);
    String dataObjectUri = this.keyValue.get(DATA_OBJECT_KEY);
    String dataObjectName = dataObjectUri.contains("/")
        ? dataObjectUri.substring(dataObjectUri.lastIndexOf('/') + 1)
        : dataObjectUri;

    LOGGER.info("CompareGraphOutputs: engine={} dataObject={}", engineId, dataObjectUri);

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("dataObject", dataObjectName);
    result.put("dataObjectUri", dataObjectUri);

    // ── 1. Run legacy insight #140 via RunPlaysheetReactor ───────────────────
    Map<String, Object> legacyResult;
    try {
      legacyResult = runLegacyInsight(engineId, dataObjectUri);
    } catch (Exception e) {
      LOGGER.error("Legacy insight failed for " + dataObjectName, e);
      result.put("error", "Legacy insight failed: " + e.getMessage());
      result.put("match", false);
      return new NounMetadata(result, PixelDataType.CUSTOM_DATA_STRUCTURE);
    }

    // ── 2. Run new GetGraphForDataObject reactor ─────────────────────────────
    Map<String, Object> newResult;
    try {
      newResult = runNewReactor(engineId, dataObjectUri);
    } catch (Exception e) {
      LOGGER.error("New reactor failed for " + dataObjectName, e);
      result.put("error", "New reactor failed: " + e.getMessage());
      result.put("match", false);
      return new NounMetadata(result, PixelDataType.CUSTOM_DATA_STRUCTURE);
    }

    // ── 3. Extract node URIs from both outputs ───────────────────────────────
    Set<String> legacyNodeUris = extractNodeUris(legacyResult);
    Set<String> newNodeUris = extractNodeUris(newResult);

    // ── 4. Extract edge keys (source|target) from both outputs ───────────────
    Set<String> legacyEdgeKeys = extractEdgeKeys(legacyResult);
    Set<String> newEdgeKeys = extractEdgeKeys(newResult);

    // ── 5. Compute diffs ─────────────────────────────────────────────────────
    Set<String> nodesOnlyInLegacy = new TreeSet<>(legacyNodeUris);
    nodesOnlyInLegacy.removeAll(newNodeUris);

    Set<String> nodesOnlyInNew = new TreeSet<>(newNodeUris);
    nodesOnlyInNew.removeAll(legacyNodeUris);

    Set<String> edgesOnlyInLegacy = new TreeSet<>(legacyEdgeKeys);
    edgesOnlyInLegacy.removeAll(newEdgeKeys);

    Set<String> edgesOnlyInNew = new TreeSet<>(newEdgeKeys);
    edgesOnlyInNew.removeAll(legacyEdgeKeys);

    boolean match = nodesOnlyInLegacy.isEmpty() && nodesOnlyInNew.isEmpty()
        && edgesOnlyInLegacy.isEmpty() && edgesOnlyInNew.isEmpty();

    // ── 6. Build comparison report ───────────────────────────────────────────
    Map<String, Object> legacyCounts = new LinkedHashMap<>();
    legacyCounts.put("nodes", legacyNodeUris.size());
    legacyCounts.put("edges", legacyEdgeKeys.size());
    result.put("legacy", legacyCounts);

    Map<String, Object> newCounts = new LinkedHashMap<>();
    newCounts.put("nodes", newNodeUris.size());
    newCounts.put("edges", newEdgeKeys.size());
    result.put("new", newCounts);

    result.put("match", match);

    if (!nodesOnlyInLegacy.isEmpty()) {
      result.put("nodesOnlyInLegacy", new ArrayList<>(nodesOnlyInLegacy));
    }
    if (!nodesOnlyInNew.isEmpty()) {
      result.put("nodesOnlyInNew", new ArrayList<>(nodesOnlyInNew));
    }
    if (!edgesOnlyInLegacy.isEmpty()) {
      result.put("edgesOnlyInLegacy", new ArrayList<>(edgesOnlyInLegacy));
    }
    if (!edgesOnlyInNew.isEmpty()) {
      result.put("edgesOnlyInNew", new ArrayList<>(edgesOnlyInNew));
    }

    LOGGER.info("CompareGraphOutputs [{}]: match={} legacy={}/{} new={}/{} "
        + "nodesOnlyLegacy={} nodesOnlyNew={} edgesOnlyLegacy={} edgesOnlyNew={}",
        dataObjectName, match,
        legacyNodeUris.size(), legacyEdgeKeys.size(),
        newNodeUris.size(), newEdgeKeys.size(),
        nodesOnlyInLegacy.size(), nodesOnlyInNew.size(),
        edgesOnlyInLegacy.size(), edgesOnlyInNew.size());

    return new NounMetadata(result, PixelDataType.CUSTOM_DATA_STRUCTURE);
  }

  /**
   * Invokes legacy insight #140 via {@link RunPlaysheetReactor}, following the
   * same pattern as GetSystemSimilarityHeatmapReactor.
   */
  @SuppressWarnings("unchecked")
  private Map<String, Object> runLegacyInsight(String engineId, String dataObjectUri) {
    RunPlaysheetReactor playsheetReactor = new RunPlaysheetReactor();
    playsheetReactor.In();
    playsheetReactor.setInsight(this.insight);

    PixelPlanner planner = new PixelPlanner();
    planner.setVarStore(this.insight.getVarStore());
    playsheetReactor.setPixelPlanner(planner);

    // Wire noun store: database, app (legacy fallback), id
    GenRowStruct grsEngine = new GenRowStruct();
    grsEngine.add(new NounMetadata(engineId, PixelDataType.CONST_STRING));
    playsheetReactor.getNounStore().addNoun(ReactorKeysEnum.DATABASE.getKey(), grsEngine);
    playsheetReactor.getNounStore().addNoun(APP_KEY, grsEngine);

    GenRowStruct grsId = new GenRowStruct();
    grsId.add(new NounMetadata(LEGACY_INSIGHT_ID, PixelDataType.CONST_STRING));
    playsheetReactor.getNounStore().addNoun(ReactorKeysEnum.ID.getKey(), grsId);

    // Wire params: {"Data": [dataObjectUri]}
    Map<String, List<Object>> params = new HashMap<>();
    List<Object> dataList = new ArrayList<>();
    dataList.add(dataObjectUri);
    params.put("Data", dataList);

    GenRowStruct grsParams = new GenRowStruct();
    grsParams.add(new NounMetadata(params, PixelDataType.MAP));
    playsheetReactor.getNounStore().addNoun(ReactorKeysEnum.PARAM_KEY.getKey(), grsParams);

    NounMetadata legacyNoun = playsheetReactor.execute();
    return (Map<String, Object>) legacyNoun.getValue();
  }

  /**
   * Invokes the new {@link GetGraphForDataObjectReactor} programmatically.
   */
  @SuppressWarnings("unchecked")
  private Map<String, Object> runNewReactor(String engineId, String dataObjectUri) {
    GetGraphForDataObjectReactor reactor = new GetGraphForDataObjectReactor();
    reactor.In();
    reactor.setInsight(this.insight);

    PixelPlanner planner = new PixelPlanner();
    planner.setVarStore(this.insight.getVarStore());
    reactor.setPixelPlanner(planner);

    GenRowStruct grsEngine = new GenRowStruct();
    grsEngine.add(new NounMetadata(engineId, PixelDataType.CONST_STRING));
    reactor.getNounStore().addNoun(DATABASE_KEY, grsEngine);

    GenRowStruct grsDataObject = new GenRowStruct();
    grsDataObject.add(new NounMetadata(dataObjectUri, PixelDataType.CONST_STRING));
    reactor.getNounStore().addNoun(DATA_OBJECT_KEY, grsDataObject);

    NounMetadata newNoun = reactor.execute();
    return (Map<String, Object>) newNoun.getValue();
  }

  /**
   * Extracts node URI keys from the "nodes" map in a reactor/playsheet result.
   * The nodes map keyed by URI → {propHash: {...}}.
   */
  @SuppressWarnings("unchecked")
  private Set<String> extractNodeUris(Map<String, Object> resultMap) {
    Set<String> uris = new TreeSet<>();
    Object nodesObj = resultMap.get("nodes");
    if (nodesObj instanceof Map) {
      uris.addAll(((Map<String, ?>) nodesObj).keySet());
    }
    return uris;
  }

  /**
   * Extracts edge keys ("source|target") from the "edges" collection in a result.
   * Handles both SEMOSSEdge objects (legacy) and Map objects (new reactor).
   */
  @SuppressWarnings("unchecked")
  private Set<String> extractEdgeKeys(Map<String, Object> resultMap) {
    Set<String> keys = new TreeSet<>();
    Object edgesObj = resultMap.get("edges");
    if (edgesObj instanceof Collection) {
      for (Object edgeObj : (Collection<?>) edgesObj) {
        String source = null;
        String target = null;

        if (edgeObj instanceof SEMOSSEdge) {
          // Legacy path: SEMOSSEdge has getProperty("source")/outVertex/inVertex
          SEMOSSEdge semossEdge = (SEMOSSEdge) edgeObj;
          source = semossEdge.outVertex != null ? semossEdge.outVertex.getURI() : null;
          target = semossEdge.inVertex != null ? semossEdge.inVertex.getURI() : null;
        } else if (edgeObj instanceof Map) {
          // New reactor path: plain Map with "source" and "target" keys
          Map<String, Object> edge = (Map<String, Object>) edgeObj;
          source = toString(edge.get("source"));
          target = toString(edge.get("target"));
        }

        if (source != null && target != null) {
          keys.add(source + "|" + target);
        }
      }
    }
    return keys;
  }

  private static String toString(Object obj) {
    return obj != null ? obj.toString() : null;
  }
}
