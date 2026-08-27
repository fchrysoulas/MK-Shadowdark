import { CURSED_SCROLL_4_BOOK } from "../source-tables/source-parser.js";
import {
  collectionValues,
  findImportedSourceTable,
  rollImportedSourceTableField,
} from "../source-tables/source-table-service.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";

const POINTS_OF_INTEREST_COLUMNS = Object.freeze([
  "d20",
  "Descriptor",
  "Location",
  "Feature",
]);

function findPointsOfInterestSourceTable(tables = globalThis.game?.tables) {
  return findImportedSourceTable({
    bookId: CURSED_SCROLL_4_BOOK.id,
    nameIncludes: "points of interest",
    requiredColumns: POINTS_OF_INTEREST_COLUMNS,
    tables,
  });
}

function configuredTable(tableUuids, key, tables = globalThis.game?.tables) {
  const uuid = String(tableUuids?.[key] ?? "").trim();
  if (!uuid) return undefined;
  return collectionValues(tables).find(table => String(table?.uuid ?? "") === uuid);
}

function configuredOrDefault(defaultTable, tableUuids, key, tables) {
  const configured = configuredTable(tableUuids, key, tables);
  return configured === undefined ? defaultTable : configured;
}

async function rollShadowdarkPointOfInterestFromSource({
  tables = globalThis.game?.tables,
  table = null,
  tableUuids = {},
  rollField = rollImportedSourceTableField,
} = {}) {
  const defaultTable = table ?? findPointsOfInterestSourceTable(tables);
  const sourceTables = {
    descriptor: table
      ? table
      : configuredOrDefault(defaultTable, tableUuids, "descriptor", tables),
    location: table
      ? table
      : configuredOrDefault(defaultTable, tableUuids, "location", tables),
    feature: table
      ? table
      : configuredOrDefault(defaultTable, tableUuids, "feature", tables),
  };
  if (Object.values(sourceTables).some(sourceTable => !sourceTable)) return null;

  const descriptor = await rollField(sourceTables.descriptor, "Descriptor");
  const location = await rollField(sourceTables.location, "Location");
  const feature = await rollField(sourceTables.feature, "Feature");

  if (!descriptor.value || !location.value || !feature.value) {
    throw new Error("The imported Points of Interest table does not expose Descriptor, Location, and Feature fields.");
  }

  const provenance = sourceTable => {
    const metadata = sourceTableFlag(sourceTable) ?? {};
    return {
      tableId: String(sourceTable.id ?? sourceTable._id ?? ""),
      tableUuid: String(sourceTable.uuid ?? ""),
      tableName: String(sourceTable.name ?? "Points of Interest"),
      bookId: String(metadata.bookId ?? CURSED_SCROLL_4_BOOK.id),
      bookTitle: String(metadata.bookTitle ?? CURSED_SCROLL_4_BOOK.title),
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
  const sourceUuids = Object.values(sourceTables).map(sourceTable => String(sourceTable.uuid ?? ""));
  if (!sourceUuids.every(uuid => uuid && uuid === sourceUuids[0])) {
    result.sources = Object.fromEntries(
      Object.entries(sourceTables).map(([key, sourceTable]) => [key, provenance(sourceTable)])
    );
  }
  return result;
}

export {
  POINTS_OF_INTEREST_COLUMNS,
  findPointsOfInterestSourceTable,
  configuredOrDefault,
  rollShadowdarkPointOfInterestFromSource,
};
