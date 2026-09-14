package reactors.networkOfSystems;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import prerna.sablecc2.om.PixelDataType;
import prerna.sablecc2.om.nounmeta.NounMetadata;
import reactors.AbstractProjectReactor;
import util.QueryExecutor;

/**
 * Returns the list of distinct DataObject entries from the TAP_Core_Data RDF database.
 * Each entry includes the full URI (needed by GetGraphForDataObject) and a display label.
 * The database engine ID is read from java/project.properties (not a Pixel param).
 *
 * <p>Pixel call:
 * <pre>
 *   ListDataObjects();
 * </pre>
 *
 * <p>Output: List of {uri, label} maps, e.g.:
 * <pre>
 *   [
 *     {"uri": "http://health.mil/ontologies/Concept/DataObject/Admissions", "label": "Admissions"},
 *     ...
 *   ]
 * </pre>
 */
public class ListDataObjectsReactor extends AbstractProjectReactor {

  private static final Logger LOGGER = LogManager.getLogger(ListDataObjectsReactor.class);

  private static final String DATA_OBJECTS_QUERY =
      "SELECT DISTINCT ?DataObject WHERE {"
      + " ?DataObject <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> "
      + "   <http://semoss.org/ontologies/Concept/DataObject> ."
      + "} ORDER BY ?DataObject";

  public ListDataObjectsReactor() {
    this.keysToGet = new String[] {};
    this.keyRequired = new int[] {};
  }

  @Override
  protected NounMetadata doExecute() {
    String engineId = projectProperties.getDatabaseId();
    LOGGER.info("ListDataObjects: querying engine " + engineId);

    QueryExecutor executor = new QueryExecutor(engineId);
    List<Map<String, String>> rows = executor.executeSelect(DATA_OBJECTS_QUERY);

    List<Map<String, String>> dataObjects = new ArrayList<>();
    for (Map<String, String> row : rows) {
      String uri = row.get("DataObject");
      if (uri != null) {
        String label = uri.contains("/") ? uri.substring(uri.lastIndexOf('/') + 1) : uri;
        label = label.replace('_', ' ');

        Map<String, String> entry = new HashMap<>();
        entry.put("uri", uri);
        entry.put("label", label);
        dataObjects.add(entry);
      }
    }

    LOGGER.info("ListDataObjects: found " + dataObjects.size() + " data objects");

    return new NounMetadata(dataObjects, PixelDataType.CUSTOM_DATA_STRUCTURE);
  }

  @Override
  public String getReactorDescription() {
    return "Lists every data object tracked in the systems ontology. "
        + "Returns one entry per distinct DataObject, each containing 'uri' (the full ontology "
        + "URI, for example 'http://health.mil/ontologies/Concept/DataObject/Admissions') and "
        + "'label' (a human readable name such as 'Admissions'). "
        + "Call this tool first to discover what data objects exist, or to translate a user's "
        + "wording into the exact URI required by the GetGraphForDataObject tool. "
        + "Use it to answer questions like 'what data objects are available?' or 'which data can "
        + "I see the system network for?'.";
  }

  @Override
  public String getDescriptionForKey(String key) {
    return null;
  }
}
