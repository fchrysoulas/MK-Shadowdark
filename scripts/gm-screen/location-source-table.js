import {
  rollImportedSourceTableField,
} from "../source-tables/source-table-service.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import {
  currentScene,
  getSceneLocationGeneratorTables,
  locationGeneratorTableStatus,
} from "./location-generator-settings.js";

function locationSourceStatus(tables = globalThis.game?.tables, {
  scene = currentScene(),
} = {}) {
  const assignments = getSceneLocationGeneratorTables(scene);
  return {
    ...locationGeneratorTableStatus(assignments, tables),
    mode: "linked",
  };
}

async function rollShadowdarkPointOfInterestFromSource({
  tables = globalThis.game?.tables,
  scene = currentScene(),
  rollField = rollImportedSourceTableField,
} = {}) {
  const sourceStatus = locationSourceStatus(tables, { scene });
  if (!sourceStatus.available) {
    return {
      mode: "missing-linked-tables",
      missing: sourceStatus.missing,
      unavailable: sourceStatus.unavailable,
    };
  }

  const sourceTables = sourceStatus.tables;

  const descriptor = await rollField(sourceTables.descriptor, "Descriptor");
  const location = await rollField(sourceTables.location, "Location");
  const feature = await rollField(sourceTables.feature, "Feature");

  if (!descriptor.value || !location.value || !feature.value) {
    throw new Error("The linked Location Generator RollTables must expose Descriptor, Location, and Feature fields.");
  }

  const provenance = sourceTable => {
    const metadata = sourceTableFlag(sourceTable) ?? {};
    return {
      tableId: String(sourceTable.id ?? sourceTable._id ?? ""),
      tableUuid: String(sourceTable.uuid ?? ""),
      tableName: String(sourceTable.name ?? "Location Generator RollTable"),
      bookId: String(metadata.bookId ?? ""),
      bookTitle: String(metadata.bookTitle ?? ""),
      key: String(metadata.key ?? ""),
      pages: Array.isArray(metadata.pages) ? [...metadata.pages] : [],
    };
  };
  const source = provenance(sourceTables.descriptor);
  const result = {
    descriptorRoll: descriptor.total,
    descriptor: descriptor.value,
    locationRoll: location.total,
    location: location.value,
    featureRoll: feature.total,
    feature: feature.value,
    source,
  };
  result.sources = Object.fromEntries(
    Object.entries(sourceTables).map(([key, sourceTable]) => [key, provenance(sourceTable)])
  );
  return result;
}

export {
  locationSourceStatus,
  rollShadowdarkPointOfInterestFromSource,
};
