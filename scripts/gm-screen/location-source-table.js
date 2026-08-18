import { CURSED_SCROLL_4_BOOK } from "../source-tables/source-parser.js";
import {
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

async function rollShadowdarkPointOfInterestFromSource({
  tables = globalThis.game?.tables,
  table = null,
  rollField = rollImportedSourceTableField,
} = {}) {
  const sourceTable = table ?? findPointsOfInterestSourceTable(tables);
  if (!sourceTable) return null;

  const descriptor = await rollField(sourceTable, "Descriptor");
  const location = await rollField(sourceTable, "Location");
  const feature = await rollField(sourceTable, "Feature");

  if (!descriptor.value || !location.value || !feature.value) {
    throw new Error("The imported Points of Interest table does not expose Descriptor, Location, and Feature fields.");
  }

  const metadata = sourceTableFlag(sourceTable) ?? {};
  return {
    descriptorRoll: descriptor.total,
    descriptor: descriptor.value,
    locationRoll: location.total,
    location: location.value,
    featureRoll: feature.total,
    feature: feature.value,
    source: {
      tableId: String(sourceTable.id ?? sourceTable._id ?? ""),
      tableUuid: String(sourceTable.uuid ?? ""),
      tableName: String(sourceTable.name ?? "Points of Interest"),
      bookId: String(metadata.bookId ?? CURSED_SCROLL_4_BOOK.id),
      bookTitle: String(metadata.bookTitle ?? CURSED_SCROLL_4_BOOK.title),
      key: String(metadata.key ?? ""),
      pages: Array.isArray(metadata.pages) ? [...metadata.pages] : [],
    },
  };
}

export {
  POINTS_OF_INTEREST_COLUMNS,
  findPointsOfInterestSourceTable,
  rollShadowdarkPointOfInterestFromSource,
};