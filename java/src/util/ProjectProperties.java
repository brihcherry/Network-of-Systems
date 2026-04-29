package util;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.Properties;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import prerna.util.AssetUtility;
import prerna.util.Utility;

// Loads configuration from java/project.properties and exposes values to reactors.
//
// This is a singleton: AbstractProjectReactor calls getInstance(projectId) during
// preExecute() to initialize it. After that, getInstance() returns the cached instance.
//
// To add a new property:
//   1. Add key=value to java/project.properties
//   2. Add a private field and getter below
//   3. Read the value in loadProp() via projectProperties.getProperty("yourKey")
public class ProjectProperties {

  private static final Logger LOGGER = LogManager.getLogger(ProjectProperties.class);

  private static ProjectProperties INSTANCE = null;

  private String databaseId;

  private ProjectProperties() {}

  // Returns the cached singleton. Throws if getInstance(projectId) hasn't been called yet.
  public static ProjectProperties getInstance() {
    if (INSTANCE == null) {
      throw new RuntimeException("Unable to load project configuration");
    }
    return INSTANCE;
  }

  // First call: loads properties from disk. Subsequent calls: returns cached instance.
  public static ProjectProperties getInstance(String projectId) {
    if (INSTANCE == null) {
      loadProp(projectId);
    }
    return INSTANCE;
  }

  // Reads java/project.properties and populates this instance's fields.
  // If the file is missing or unreadable, INSTANCE stays null and a warning is logged.
  private static void loadProp(String projectId) {
    ProjectProperties newInstance = new ProjectProperties();

    try (final FileInputStream fileIn =
        new FileInputStream(
            Utility.normalizePath(
                AssetUtility.getProjectAssetsFolder(projectId) + "/java/project.properties"))) {
      Properties projectProperties = new Properties();
      projectProperties.load(fileIn);

      newInstance.databaseId = projectProperties.getProperty("databaseId");

      INSTANCE = newInstance;
    } catch (IOException e) {
      INSTANCE = null;
      LOGGER.warn("java/project.properties not defined");
    }
  }

  public String getDatabaseId() { return databaseId; }

}
