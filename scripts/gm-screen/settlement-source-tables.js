import {
  findImportedSourceTable,
  parseLabeledResultText,
  rollImportedSourceTable,
  rollImportedSourceTableField,
  tableResultText,
} from "../source-tables/source-table-service.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";

const CORE_BOOK_ID = "shadowdark-core-v4.9";
const CORE_BOOK_TITLE = "Shadowdark RPG Core Rulebook v4.9";

const SETTLEMENT_SOURCE_COLUMNS = Object.freeze({
  names: Object.freeze(["d8", "Village", "Town", "City/Metropolis"]),
  type: Object.freeze(["d6", "Settlement Type", "Dice"]),
  districts: Object.freeze(["d8", "Type"]),
  alignment: Object.freeze(["d6", "Alignment"]),
  districtPoi: Object.freeze(["d6", "Point of Interest"]),
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  try {
    return [...collection];
  } catch (_error) {
    return [];
  }
}

function findCoreSettlementTable({ nameIncludes, requiredColumns, tables = globalThis.game?.tables } = {}) {
  return findImportedSourceTable({
    bookId: CORE_BOOK_ID,
    nameIncludes,
    requiredColumns,
    tables,
  });
}

function findCoreSettlementNameTable(tables = globalThis.game?.tables) {
  return findCoreSettlementTable({
    nameIncludes: "settlement name",
    requiredColumns: SETTLEMENT_SOURCE_COLUMNS.names,
    tables,
  });
}

function findCoreSettlementTypeTable(tables = globalThis.game?.tables) {
  return findCoreSettlementTable({
    nameIncludes: "type",
    requiredColumns: SETTLEMENT_SOURCE_COLUMNS.type,
    tables,
  });
}

function findCoreDistrictsTable(tables = globalThis.game?.tables) {
  return findCoreSettlementTable({
    nameIncludes: "districts",
    requiredColumns: SETTLEMENT_SOURCE_COLUMNS.districts,
    tables,
  });
}

function findCoreAlignmentTable(tables = globalThis.game?.tables) {
  return findCoreSettlementTable({
    nameIncludes: "alignment",
    requiredColumns: SETTLEMENT_SOURCE_COLUMNS.alignment,
    tables,
  });
}

function findCoreDistrictPoiTable(districtType, tables = globalThis.game?.tables) {
  return findCoreSettlementTable({
    nameIncludes: normalize(districtType),
    requiredColumns: SETTLEMENT_SOURCE_COLUMNS.districtPoi,
    tables,
  });
}

function resultRange(result) {
  const range = result?.range ?? result?._source?.range;
  if (!Array.isArray(range) || range.length < 2) return null;
  const low = Number(range[0]);
  const high = Number(range[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return [Math.min(low, high), Math.max(low, high)];
}

function findTableResultForTotal(table, total) {
  const value = Number(total);
  if (!Number.isFinite(value)) return null;
  return collectionValues(table?.results).find(result => {
    const range = resultRange(result);
    return range && value >= range[0] && value <= range[1];
  }) ?? null;
}

function resultField(result, field) {
  const text = tableResultText(result);
  const fields = parseLabeledResultText(text);
  const needle = normalize(field);
  const match = Object.entries(fields).find(([label]) => normalize(label) === needle);
  if (match) return match[1];
  if (Object.keys(fields).length === 0) return text;
  return "";
}

function resolveTableFieldForTotal(table, total, field = "") {
  const result = findTableResultForTotal(table, total);
  if (!result) return "";
  return field ? resultField(result, field) : tableResultText(result);
}

function parseDiceFormula(value) {
  const match = /^\s*(\d+)d(\d+)\s*$/i.exec(String(value ?? ""));
  if (!match) return null;
  const count = Number(match[1]);
  const sides = Number(match[2]);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 2) return null;
  return { formula: `${count}d${sides}`, count, sides };
}

function resolveSettlementTypeConfig(type, { tables = globalThis.game?.tables, table = null } = {}) {
  const typeTable = table ?? findCoreSettlementTypeTable(tables);
  if (!typeTable) return null;
  const wanted = normalize(type);

  for (const result of collectionValues(typeTable.results)) {
    const settlementType = resultField(result, "Settlement Type");
    if (normalize(settlementType) !== wanted) continue;
    const dice = parseDiceFormula(resultField(result, "Dice"));
    if (!dice) return null;
    return {
      id: wanted,
      label: settlementType,
      diceFormula: dice.formula,
      diceCount: dice.count,
      dieSides: dice.sides,
      sourceTable: typeTable,
    };
  }
  return null;
}

function nameFieldForType(type, table) {
  const metadata = sourceTableFlag(table) ?? {};
  const columns = Array.isArray(metadata.columns) ? metadata.columns : [];
  const wanted = normalize(type);
  if (wanted === "city" || wanted === "metropolis") {
    return columns.find(column => {
      const value = normalize(column);
      return value.includes("city") && value.includes("metropolis");
    }) ?? "City/Metropolis";
  }
  return columns.find(column => normalize(column) === wanted)
    ?? `${wanted.charAt(0).toUpperCase()}${wanted.slice(1)}`;
}

async function rollSettlementNameFromSource(type, {
  tables = globalThis.game?.tables,
  table = null,
  rollField = rollImportedSourceTableField,
} = {}) {
  const nameTable = table ?? findCoreSettlementNameTable(tables);
  if (!nameTable) return null;
  const field = nameFieldForType(type, nameTable);
  const draw = await rollField(nameTable, field);
  if (!draw.value) return null;
  return {
    roll: draw.total,
    name: draw.value,
    table: nameTable,
  };
}

async function rollAlignmentFromSource({
  tables = globalThis.game?.tables,
  table = null,
  rollTable = rollImportedSourceTable,
} = {}) {
  const alignmentTable = table ?? findCoreAlignmentTable(tables);
  if (!alignmentTable) return null;
  const draw = await rollTable(alignmentTable);
  const alignment = resultField(draw.result, "Alignment") || tableResultText(draw.result);
  if (!alignment) return null;
  return {
    roll: draw.total,
    alignment,
    table: alignmentTable,
  };
}

function districtTypeFromSourceRoll(total, {
  tables = globalThis.game?.tables,
  table = null,
} = {}) {
  const districtTable = table ?? findCoreDistrictsTable(tables);
  if (!districtTable) return null;
  const districtType = resolveTableFieldForTotal(districtTable, total, "Type");
  if (!districtType) return null;
  return { districtType, table: districtTable };
}

async function rollDistrictPoiFromSource(districtType, {
  tables = globalThis.game?.tables,
  table = null,
  rollTable = rollImportedSourceTable,
} = {}) {
  const poiTable = table ?? findCoreDistrictPoiTable(districtType, tables);
  if (!poiTable) return null;
  const draw = await rollTable(poiTable);
  const result = resultField(draw.result, "Point of Interest") || tableResultText(draw.result);
  if (!result) return null;
  return {
    roll: draw.total,
    result,
    table: poiTable,
  };
}

function tableProvenance(table) {
  if (!table) return null;
  const metadata = sourceTableFlag(table) ?? {};
  return {
    id: String(table.id ?? table._id ?? ""),
    uuid: String(table.uuid ?? ""),
    name: String(table.name ?? ""),
    key: String(metadata.key ?? ""),
    bookId: String(metadata.bookId ?? CORE_BOOK_ID),
    bookTitle: String(metadata.bookTitle ?? CORE_BOOK_TITLE),
    pages: Array.isArray(metadata.pages) ? [...metadata.pages] : [],
  };
}

export {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  SETTLEMENT_SOURCE_COLUMNS,
  collectionValues,
  findCoreSettlementTable,
  findCoreSettlementNameTable,
  findCoreSettlementTypeTable,
  findCoreDistrictsTable,
  findCoreAlignmentTable,
  findCoreDistrictPoiTable,
  resultRange,
  findTableResultForTotal,
  resultField,
  resolveTableFieldForTotal,
  parseDiceFormula,
  resolveSettlementTypeConfig,
  nameFieldForType,
  rollSettlementNameFromSource,
  rollAlignmentFromSource,
  districtTypeFromSourceRoll,
  rollDistrictPoiFromSource,
  tableProvenance,
};