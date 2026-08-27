import {
  collectionValues,
  findImportedSourceTable,
  parseLabeledResultText,
  rollImportedSourceTable,
  rollImportedSourceTableField,
  tableResultText,
} from "../source-tables/source-table-service.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";

const CORE_BOOK_ID = "shadowdark-core-v4.9";
const CORE_BOOK_TITLE = "Shadowdark RPG Core Rulebook v4.9";

const NPC_SOURCE_COLUMNS = Object.freeze({
  ancestry: Object.freeze(["d12", "Ancestry"]),
  alignment: Object.freeze(["d6", "Alignment"]),
  age: Object.freeze(["d8", "Age"]),
  wealth: Object.freeze(["d6", "Wealth"]),
  appearance: Object.freeze(["d20", "Appearance"]),
  does: Object.freeze(["d20", "Does"]),
  secret: Object.freeze(["d20", "Secret"]),
  occupation: Object.freeze(["d4, d4", "1", "2", "3", "4"]),
  names: Object.freeze(["d20", "Dwarf", "Elf", "Goblin", "Halfling", "Half-Orc", "Human"]),
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function npcTable({ nameIncludes, requiredColumns, tables = globalThis.game?.tables } = {}) {
  return findImportedSourceTable({
    bookId: CORE_BOOK_ID,
    nameIncludes,
    requiredColumns,
    tables,
  });
}

function findNpcAncestryTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — ancestry", requiredColumns: NPC_SOURCE_COLUMNS.ancestry, tables });
}

function findNpcAlignmentTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — alignment", requiredColumns: NPC_SOURCE_COLUMNS.alignment, tables });
}

function findNpcAgeTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — age", requiredColumns: NPC_SOURCE_COLUMNS.age, tables });
}

function findNpcWealthTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — wealth", requiredColumns: NPC_SOURCE_COLUMNS.wealth, tables });
}

function findNpcQualityTable(field, tables = globalThis.game?.tables) {
  const fieldName = normalize(field);
  return collectionValues(tables).find(table => {
    const metadata = sourceTableFlag(table);
    const columns = Array.isArray(metadata?.columns) ? metadata.columns.map(normalize) : [];
    const name = normalize(table?.name);
    return metadata?.bookId === CORE_BOOK_ID
      && name.includes("npc")
      && name.includes(fieldName)
      && columns.includes("d20");
  }) ?? null;
}

function findNpcAppearanceTable(tables = globalThis.game?.tables) {
  return findNpcQualityTable("appearance", tables);
}

function findNpcDoesTable(tables = globalThis.game?.tables) {
  return findNpcQualityTable("does", tables);
}

function findNpcSecretTable(tables = globalThis.game?.tables) {
  return findNpcQualityTable("secret", tables);
}

function findNpcOccupationTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — occupation", requiredColumns: NPC_SOURCE_COLUMNS.occupation, tables });
}

function findNpcNamesTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npc names by ancestry", requiredColumns: NPC_SOURCE_COLUMNS.names, tables });
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

function npcSourceStatus(tables = globalThis.game?.tables, {
  tableUuids = {},
} = {}) {
  const defaults = {
    ancestry: findNpcAncestryTable(tables),
    alignment: findNpcAlignmentTable(tables),
    age: findNpcAgeTable(tables),
    wealth: findNpcWealthTable(tables),
    appearance: findNpcAppearanceTable(tables),
    does: findNpcDoesTable(tables),
    secret: findNpcSecretTable(tables),
    occupation: findNpcOccupationTable(tables),
    names: findNpcNamesTable(tables),
  };
  const fieldTables = {
    ancestry: configuredOrDefault(defaults.ancestry, tableUuids, "ancestry", tables),
    alignment: configuredOrDefault(defaults.alignment, tableUuids, "alignment", tables),
    age: configuredOrDefault(defaults.age, tableUuids, "age", tables),
    wealth: configuredOrDefault(defaults.wealth, tableUuids, "wealth", tables),
    appearance: configuredOrDefault(defaults.appearance, tableUuids, "appearance", tables),
    does: configuredOrDefault(defaults.does, tableUuids, "does", tables),
    secret: configuredOrDefault(defaults.secret, tableUuids, "secret", tables),
    occupation: configuredOrDefault(defaults.occupation, tableUuids, "occupation", tables),
    name: configuredOrDefault(defaults.names, tableUuids, "name", tables),
  };
  const missingTables = [
    ["ancestry", "NPCs — Ancestry"],
    ["alignment", "NPCs — Alignment"],
    ["age", "NPCs — Age"],
    ["wealth", "NPCs — Wealth"],
    ["appearance", "NPCs — Appearance"],
    ["does", "NPCs — Does"],
    ["secret", "NPCs — Secret"],
    ["occupation", "NPC Occupation"],
    ["name", "NPC Names by Ancestry"],
  ].filter(([key]) => !fieldTables[key]).map(([, label]) => label);
  const missing = [
    ["ancestry", "NPC Ancestry"],
    ["alignment", "NPC Alignment"],
    ["age", "NPC Age"],
    ["wealth", "NPC Wealth"],
    ["appearance", "NPC Appearance"],
    ["does", "NPC Does"],
    ["secret", "NPC Secret"],
    ["occupation", "NPC Occupation"],
    ["name", "NPC Names By Ancestry"],
  ].filter(([key]) => !fieldTables[key]).map(([, label]) => label);
  return {
    available: missing.length === 0,
    missing,
    missingTables,
    tables: {
      ...defaults,
      ancestry: fieldTables.ancestry,
      alignment: fieldTables.alignment,
      age: fieldTables.age,
      wealth: fieldTables.wealth,
      appearance: fieldTables.appearance,
      does: fieldTables.does,
      secret: fieldTables.secret,
      occupation: fieldTables.occupation,
      names: fieldTables.name,
      fieldTables,
    },
  };
}

function simpleResultValue(draw, field = "") {
  const text = tableResultText(draw?.result);
  if (!field) return text;
  const fields = parseLabeledResultText(text);
  const wanted = normalize(field);
  const match = Object.entries(fields).find(([label]) => normalize(label) === wanted);
  return match?.[1] ?? text;
}

async function rollSimple(table, field, rollTable = rollImportedSourceTable) {
  const draw = await rollTable(table);
  return { roll: draw.total, value: simpleResultValue(draw, field), result: draw.result };
}

async function rollSecondD4({ RollClass = globalThis.Roll } = {}) {
  if (!RollClass) throw new Error("Foundry Roll is unavailable.");
  const roll = new RollClass("1d4");
  const evaluated = typeof roll.evaluate === "function" ? await roll.evaluate() : roll;
  const total = Number(evaluated?.total ?? roll?.total);
  if (!Number.isInteger(total) || total < 1 || total > 4) throw new Error("Could not resolve the second occupation d4.");
  return total;
}

function occupationField(result, column) {
  const fields = parseLabeledResultText(tableResultText(result));
  const match = Object.entries(fields).find(([label]) => normalize(label) === normalize(column));
  if (match?.[1]) return match[1];

  // Current local imports may flatten the d4 x d4 occupation matrix into
  // individual results. Those results carry their coordinate as metadata and
  // expose the occupation directly instead of using 1: ..., 2: ... labels.
  const matrix = result?.flags?.["mk-shadowdark"]?.occupationMatrix;
  return matrix && tableResultText(result) ? tableResultText(result) : "";
}

function occupationMatrixColumn(result) {
  const value = Number(result?.flags?.["mk-shadowdark"]?.occupationMatrix?.column);
  return Number.isInteger(value) && value >= 1 && value <= 4 ? value : null;
}

function nameFieldForAncestry(ancestry) {
  const value = normalize(ancestry).replace(/\s+/g, "-");
  const fields = {
    dwarf: "Dwarf",
    elf: "Elf",
    goblin: "Goblin",
    halfling: "Halfling",
    "half-orc": "Half-Orc",
    human: "Human",
  };
  return fields[value] ?? "";
}

function tableProvenance(table) {
  const metadata = sourceTableFlag(table) ?? {};
  return {
    tableId: String(table?.id ?? table?._id ?? ""),
    tableUuid: String(table?.uuid ?? ""),
    tableName: String(table?.name ?? ""),
    key: String(metadata.key ?? ""),
    bookId: String(metadata.bookId ?? CORE_BOOK_ID),
    bookTitle: String(metadata.bookTitle ?? CORE_BOOK_TITLE),
    pages: Array.isArray(metadata.pages) ? [...metadata.pages] : [],
  };
}

async function rollNpcProfileFromSource({
  tables = globalThis.game?.tables,
  status = null,
  rollTable = rollImportedSourceTable,
  rollField = rollImportedSourceTableField,
  rollOccupationColumn = rollSecondD4,
} = {}) {
  const source = status ?? npcSourceStatus(tables);
  if (!source.available) return null;

  const ancestry = await rollSimple(source.tables.ancestry, "Ancestry", rollTable);
  const alignment = await rollSimple(source.tables.alignment, "Alignment", rollTable);
  const age = await rollSimple(source.tables.age, "Age", rollTable);
  const wealth = await rollSimple(source.tables.wealth, "Wealth", rollTable);

  const qualityTables = source.tables.fieldTables ?? {
    appearance: source.tables.appearance,
    does: source.tables.does,
    secret: source.tables.secret,
  };
  const [appearanceDraw, doesDraw, secretDraw] = await Promise.all([
    rollSimple(qualityTables.appearance, "Appearance", rollTable),
    rollSimple(qualityTables.does, "Does", rollTable),
    rollSimple(qualityTables.secret, "Secret", rollTable),
  ]);
  const appearance = appearanceDraw.value;
  const does = doesDraw.value;
  const secret = secretDraw.value;

  const occupationRow = await rollTable(source.tables.occupation);
  const occupationColumn = occupationMatrixColumn(occupationRow.result) ?? await rollOccupationColumn();
  const occupation = occupationField(occupationRow.result, occupationColumn);

  const nameField = nameFieldForAncestry(ancestry.value);
  if (!nameField) throw new Error(`No Core NPC name column exists for ancestry: ${ancestry.value}.`);
  const nameDraw = await rollField(source.tables.names, nameField);

  const values = [ancestry.value, alignment.value, age.value, wealth.value, appearance, does, secret, occupation, nameDraw.value];
  if (values.some(value => !String(value ?? "").trim())) {
    throw new Error("The imported Core NPC tables could not resolve a complete NPC profile.");
  }

  return {
    name: nameDraw.value,
    ancestry: ancestry.value,
    alignment: alignment.value,
    age: age.value,
    wealth: wealth.value,
    appearance,
    does,
    secret,
    occupation,
    rolls: {
      ancestry: ancestry.roll,
      alignment: alignment.roll,
      age: age.roll,
      wealth: wealth.roll,
      appearance: appearanceDraw.roll,
      does: doesDraw.roll,
      secret: secretDraw.roll,
      occupationRow: occupationRow.total,
      occupationColumn,
      name: nameDraw.total,
    },
    sources: Object.fromEntries([
      ["ancestry", source.tables.ancestry],
      ["alignment", source.tables.alignment],
      ["age", source.tables.age],
      ["wealth", source.tables.wealth],
      ["appearance", qualityTables.appearance],
      ["does", qualityTables.does],
      ["secret", qualityTables.secret],
      ["occupation", source.tables.occupation],
      ["names", source.tables.names],
    ].map(([key, table]) => [key, tableProvenance(table)])),
    sourceBookTitle: CORE_BOOK_TITLE,
  };
}

export {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  NPC_SOURCE_COLUMNS,
  normalize,
  npcTable,
  findNpcAncestryTable,
  findNpcAlignmentTable,
  findNpcAgeTable,
  findNpcWealthTable,
  findNpcQualityTable,
  findNpcAppearanceTable,
  findNpcDoesTable,
  findNpcSecretTable,
  findNpcOccupationTable,
  findNpcNamesTable,
  npcSourceStatus,
  simpleResultValue,
  rollSimple,
  rollSecondD4,
  occupationField,
  occupationMatrixColumn,
  nameFieldForAncestry,
  tableProvenance,
  rollNpcProfileFromSource,
};
