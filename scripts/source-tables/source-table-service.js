import { sourceTableFlag } from "./source-table-importer.js";

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

function normalizeColumn(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sourceTableColumns(table) {
  const metadata = sourceTableFlag(table);
  return Array.isArray(metadata?.columns) ? metadata.columns.map(normalizeColumn) : [];
}

function getImportedSourceTables(tables = globalThis.game?.tables) {
  return collectionValues(tables).filter(table => Boolean(sourceTableFlag(table)?.key));
}

function findImportedSourceTable({
  bookId = "",
  nameIncludes = "",
  requiredColumns = [],
  tables = globalThis.game?.tables,
} = {}) {
  const normalizedBookId = String(bookId ?? "").trim();
  const nameNeedle = String(nameIncludes ?? "").trim().toLowerCase();
  const required = requiredColumns.map(normalizeColumn).filter(Boolean);

  return getImportedSourceTables(tables).find(table => {
    const metadata = sourceTableFlag(table);
    if (normalizedBookId && String(metadata?.bookId ?? "") !== normalizedBookId) return false;
    if (nameNeedle && !String(table?.name ?? "").toLowerCase().includes(nameNeedle)) return false;
    const columns = sourceTableColumns(table);
    if (required.some(column => !columns.includes(column))) return false;
    return true;
  }) ?? null;
}

function parseLabeledResultText(text) {
  const fields = {};
  for (const segment of String(text ?? "").split("|")) {
    const value = segment.trim();
    if (!value) continue;
    const separator = value.indexOf(":");
    if (separator < 0) continue;
    const label = value.slice(0, separator).trim();
    const result = value.slice(separator + 1).trim();
    if (!label || !result) continue;
    fields[label] = result;
  }
  return fields;
}

function tableResultText(result) {
  return String(result?.text ?? result?.description ?? "").trim();
}

async function rollImportedSourceTable(table, { recursive = false } = {}) {
  if (!table?.roll) throw new Error("Imported RollTable cannot be rolled.");
  const draw = await table.roll({ recursive });
  const results = Array.isArray(draw?.results) ? draw.results : [];
  const total = Number(draw?.roll?.total);
  return {
    total: Number.isFinite(total) ? total : null,
    results,
    result: results[0] ?? null,
  };
}

async function rollImportedSourceTableField(table, field, options = {}) {
  const draw = await rollImportedSourceTable(table, options);
  const fields = parseLabeledResultText(tableResultText(draw.result));
  const requested = String(field ?? "").trim().toLowerCase();
  const match = Object.entries(fields).find(([label]) => label.toLowerCase() === requested);
  return {
    ...draw,
    fields,
    value: match?.[1] ?? "",
  };
}

export {
  collectionValues,
  normalizeColumn,
  sourceTableColumns,
  getImportedSourceTables,
  findImportedSourceTable,
  parseLabeledResultText,
  tableResultText,
  rollImportedSourceTable,
  rollImportedSourceTableField,
};