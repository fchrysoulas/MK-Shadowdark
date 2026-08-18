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

const NPC_SOURCE_COLUMNS = Object.freeze({
  ancestry: Object.freeze(["d12", "Ancestry"]),
  alignment: Object.freeze(["d6", "Alignment"]),
  age: Object.freeze(["d8", "Age"]),
  wealth: Object.freeze(["d6", "Wealth"]),
  qualities: Object.freeze(["d20", "Appearance", "Does", "Secret"]),
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

function findNpcQualitiesTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npc qualities", requiredColumns: NPC_SOURCE_COLUMNS.qualities, tables });
}

function findNpcOccupationTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npcs — occupation", requiredColumns: NPC_SOURCE_COLUMNS.occupation, tables });
}

function findNpcNamesTable(tables = globalThis.game?.tables) {
  return npcTable({ nameIncludes: "npc names by ancestry", requiredColumns: NPC_SOURCE_COLUMNS.names, tables });
}

function npcSourceStatus(tables = globalThis.game?.tables) {
  const resolved = {
    ancestry: findNpcAncestryTable(tables),
    alignment: findNpcAlignmentTable(tables),
    age: findNpcAgeTable(tables),
    wealth: findNpcWealthTable(tables),
    qualities: findNpcQualitiesTable(tables),
    occupation: findNpcOccupationTable(tables),
    names: findNpcNamesTable(tables),
  };
  const labels = {
    ancestry: "NPC Ancestry",
    alignment: "NPC Alignment",
    age: "NPC Age",
    wealth: "NPC Wealth",
    qualities: "NPC Qualities",
    occupation: "NPC Occupation",
    names: "NPC Names By Ancestry",
  };
  const missing = Object.entries(resolved)
    .filter(([, table]) => !table)
    .map(([key]) => labels[key]);
  return { available: missing.length === 0, missing, tables: resolved };
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
  return match?.[1] ?? "";
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

  const qualitiesDraw = await rollTable(source.tables.qualities);
  const qualities = parseLabeledResultText(tableResultText(qualitiesDraw.result));
  const appearance = qualities.Appearance ?? "";
  const does = qualities.Does ?? "";
  const secret = qualities.Secret ?? "";

  const occupationRow = await rollTable(source.tables.occupation);
  const occupationColumn = await rollOccupationColumn();
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
      qualities: qualitiesDraw.total,
      occupationRow: occupationRow.total,
      occupationColumn,
      name: nameDraw.total,
    },
    sources: Object.fromEntries(Object.entries(source.tables).map(([key, table]) => [key, tableProvenance(table)])),
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
  findNpcQualitiesTable,
  findNpcOccupationTable,
  findNpcNamesTable,
  npcSourceStatus,
  simpleResultValue,
  rollSimple,
  rollSecondD4,
  occupationField,
  nameFieldForAncestry,
  tableProvenance,
  rollNpcProfileFromSource,
};
