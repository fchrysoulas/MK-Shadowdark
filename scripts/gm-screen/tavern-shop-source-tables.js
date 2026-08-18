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

const TAVERN_QUALITIES = Object.freeze({
  poor: Object.freeze({
    id: "poor",
    label: "Poor",
    drinks: Object.freeze({ count: 2, formula: "1d6" }),
    foodTiers: Object.freeze(["poor", "poor", "poor"]),
  }),
  standard: Object.freeze({
    id: "standard",
    label: "Standard",
    drinks: Object.freeze({ count: 3, formula: "2d6" }),
    foodTiers: Object.freeze(["poor", "standard", "standard"]),
  }),
  wealthy: Object.freeze({
    id: "wealthy",
    label: "Wealthy",
    drinks: Object.freeze({ count: 4, formula: "1d12" }),
    foodTiers: Object.freeze(["standard", "standard", "wealthy", "wealthy"]),
  }),
});

const SHOP_QUALITIES = Object.freeze({
  poor: Object.freeze({ id: "poor", label: "Poor" }),
  standard: Object.freeze({ id: "standard", label: "Standard" }),
  wealthy: Object.freeze({ id: "wealthy", label: "Wealthy" }),
});

const TAVERN_SOURCE_COLUMNS = Object.freeze({
  generator: Object.freeze(["d20", "Name", "Known For"]),
  food: Object.freeze(["d12", "Poor (1d4 cp)", "Standard (1d6 sp)", "Wealthy (1d8 gp)"]),
  drinks: Object.freeze(["d*", "Details"]),
});

const SHOP_SOURCE_COLUMNS = Object.freeze({
  poor: Object.freeze(["d12", "Shop"]),
  standard: Object.freeze(["d10", "Shop"]),
  wealthy: Object.freeze(["d10", "Shop"]),
  generator: Object.freeze(["d20", "Name", "Known For"]),
  customer: Object.freeze(["d4, d4", "1", "2", "3", "4"]),
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function sourceColumns(table) {
  const metadata = sourceTableFlag(table) ?? {};
  return Array.isArray(metadata.columns) ? metadata.columns : [];
}

function findCoreTable({ nameIncludes, requiredColumns, tables = globalThis.game?.tables } = {}) {
  return findImportedSourceTable({
    bookId: CORE_BOOK_ID,
    nameIncludes,
    requiredColumns,
    tables,
  });
}

function findTavernGeneratorTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "tavern generator", requiredColumns: TAVERN_SOURCE_COLUMNS.generator, tables });
}

function findTavernFoodTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "food", requiredColumns: TAVERN_SOURCE_COLUMNS.food, tables });
}

function findTavernDrinksTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "drinks", requiredColumns: TAVERN_SOURCE_COLUMNS.drinks, tables });
}

function findPoorShopTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "poor shop", requiredColumns: SHOP_SOURCE_COLUMNS.poor, tables });
}

function findStandardShopTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "standard shop", requiredColumns: SHOP_SOURCE_COLUMNS.standard, tables });
}

function findWealthyShopTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "wealthy shop", requiredColumns: SHOP_SOURCE_COLUMNS.wealthy, tables });
}

function findShopGeneratorTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "shop generator", requiredColumns: SHOP_SOURCE_COLUMNS.generator, tables });
}

function findInterestingCustomerTable(tables = globalThis.game?.tables) {
  return findCoreTable({ nameIncludes: "interesting customer", requiredColumns: SHOP_SOURCE_COLUMNS.customer, tables });
}

function tavernSourceStatus(tables = globalThis.game?.tables) {
  const resolved = {
    generator: findTavernGeneratorTable(tables),
    food: findTavernFoodTable(tables),
    drinks: findTavernDrinksTable(tables),
  };
  const labels = {
    generator: "Tavern Generator",
    food: "Food",
    drinks: "Drinks",
  };
  const missing = Object.entries(resolved).filter(([, table]) => !table).map(([key]) => labels[key]);
  return { available: missing.length === 0, missing, tables: resolved };
}

function shopSourceStatus(tables = globalThis.game?.tables) {
  const resolved = {
    poor: findPoorShopTable(tables),
    standard: findStandardShopTable(tables),
    wealthy: findWealthyShopTable(tables),
    generator: findShopGeneratorTable(tables),
    customer: findInterestingCustomerTable(tables),
  };
  const labels = {
    poor: "Poor Shop",
    standard: "Standard Shop",
    wealthy: "Wealthy Shop",
    generator: "Shop Generator",
    customer: "Interesting Customer",
  };
  const missing = Object.entries(resolved).filter(([, table]) => !table).map(([key]) => labels[key]);
  return { available: missing.length === 0, missing, tables: resolved };
}

function resultRange(result) {
  const range = result?.range ?? result?._source?.range;
  if (!Array.isArray(range) || range.length < 2) return null;
  const low = Number(range[0]);
  const high = Number(range[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  return [Math.min(low, high), Math.max(low, high)];
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

function findResultForTotal(table, total) {
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
  const wanted = normalize(field);
  const match = Object.entries(fields).find(([label]) => normalize(label) === wanted);
  if (match) return match[1];
  return Object.keys(fields).length ? "" : text;
}

function pairedGeneratorResult(draw) {
  const fields = parseLabeledResultText(tableResultText(draw?.result));
  const name = Object.entries(fields).find(([label]) => normalize(label) === "name")?.[1] ?? "";
  const knownFor = Object.entries(fields).find(([label]) => normalize(label) === "known for")?.[1] ?? "";
  return { name, knownFor };
}

function normalizeQuality(value, allowed = TAVERN_QUALITIES) {
  const key = normalize(value);
  return allowed[key] ? key : "poor";
}

function foodColumnForTier(table, tier) {
  const wanted = normalize(tier);
  return sourceColumns(table).find(column => normalize(column).startsWith(`${wanted} (`)) ?? "";
}

function foodPriceSpec(column) {
  const match = /\((\d+d\d+)\s+(cp|sp|gp)\)/i.exec(String(column ?? ""));
  if (!match) return null;
  return { formula: match[1].toLowerCase(), currency: match[2].toLowerCase() };
}

async function rollFormula(formula, { RollClass = globalThis.Roll } = {}) {
  if (!RollClass) throw new Error("Foundry Roll is unavailable.");
  const roll = new RollClass(formula);
  const evaluated = typeof roll.evaluate === "function" ? await roll.evaluate() : roll;
  const total = Number(evaluated?.total ?? roll?.total);
  if (!Number.isFinite(total)) throw new Error(`Could not resolve roll formula ${formula}.`);
  return { formula, total, roll: evaluated ?? roll };
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
    formulaRaw: String(metadata.formulaRaw ?? table?.formula ?? ""),
  };
}

async function rollTavernFromSource({
  quality = "poor",
  tables = globalThis.game?.tables,
  status = null,
  rollTable = rollImportedSourceTable,
  rollField = rollImportedSourceTableField,
  rollDice = rollFormula,
} = {}) {
  const source = status ?? tavernSourceStatus(tables);
  if (!source.available) return null;
  const qualityKey = normalizeQuality(quality, TAVERN_QUALITIES);
  const config = TAVERN_QUALITIES[qualityKey];

  const identityDraw = await rollTable(source.tables.generator);
  const identity = pairedGeneratorResult(identityDraw);
  if (!identity.name || !identity.knownFor) throw new Error("The imported Tavern Generator could not resolve Name and Known For together.");

  const foods = [];
  for (const tier of config.foodTiers) {
    const column = foodColumnForTier(source.tables.food, tier);
    const priceSpec = foodPriceSpec(column);
    if (!column || !priceSpec) throw new Error(`The imported Food table does not expose a priced ${tier} column.`);
    const foodDraw = await rollField(source.tables.food, column);
    const priceRoll = await rollDice(priceSpec.formula);
    if (!foodDraw.value) throw new Error(`The imported Food table could not resolve ${column}.`);
    foods.push({
      tier,
      tierLabel: TAVERN_QUALITIES[tier]?.label ?? tier,
      roll: foodDraw.total,
      item: foodDraw.value,
      priceFormula: priceSpec.formula,
      priceRoll: priceRoll.total,
      currency: priceSpec.currency,
    });
  }

  const drinks = [];
  for (let index = 0; index < config.drinks.count; index += 1) {
    const drinkRoll = await rollDice(config.drinks.formula);
    const result = findResultForTotal(source.tables.drinks, drinkRoll.total);
    const details = tableResultText(result);
    if (!details) throw new Error(`The imported Drinks table has no result for ${config.drinks.formula} total ${drinkRoll.total}.`);
    drinks.push({
      formula: config.drinks.formula,
      roll: drinkRoll.total,
      details,
    });
  }

  return {
    kind: "tavern",
    quality: qualityKey,
    qualityLabel: config.label,
    name: identity.name,
    knownFor: identity.knownFor,
    rolls: { identity: identityDraw.total },
    foods,
    drinks,
    sources: {
      generator: tableProvenance(source.tables.generator),
      food: tableProvenance(source.tables.food),
      drinks: tableProvenance(source.tables.drinks),
    },
    sourceBookTitle: CORE_BOOK_TITLE,
  };
}

async function rollShopFromSource({
  quality = "poor",
  tables = globalThis.game?.tables,
  status = null,
  rollTable = rollImportedSourceTable,
  rollDice = rollFormula,
} = {}) {
  const source = status ?? shopSourceStatus(tables);
  if (!source.available) return null;
  const qualityKey = normalizeQuality(quality, SHOP_QUALITIES);
  const config = SHOP_QUALITIES[qualityKey];

  const typeDraw = await rollTable(source.tables[qualityKey]);
  const shopType = resultField(typeDraw.result, "Shop") || tableResultText(typeDraw.result);

  const identityDraw = await rollTable(source.tables.generator);
  const identity = pairedGeneratorResult(identityDraw);

  const customerRow = await rollTable(source.tables.customer);
  const customerColumnRoll = await rollDice("1d4");
  const customer = resultField(customerRow.result, String(customerColumnRoll.total));

  if (!shopType || !identity.name || !identity.knownFor || !customer) {
    throw new Error("The imported Core Shop tables could not resolve a complete shop.");
  }

  return {
    kind: "shop",
    quality: qualityKey,
    qualityLabel: config.label,
    name: identity.name,
    shopType,
    knownFor: identity.knownFor,
    customer,
    rolls: {
      shopType: typeDraw.total,
      identity: identityDraw.total,
      customerRow: customerRow.total,
      customerColumn: customerColumnRoll.total,
    },
    sources: {
      shopType: tableProvenance(source.tables[qualityKey]),
      generator: tableProvenance(source.tables.generator),
      customer: tableProvenance(source.tables.customer),
    },
    sourceBookTitle: CORE_BOOK_TITLE,
  };
}

export {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  TAVERN_QUALITIES,
  SHOP_QUALITIES,
  TAVERN_SOURCE_COLUMNS,
  SHOP_SOURCE_COLUMNS,
  normalize,
  sourceColumns,
  findCoreTable,
  findTavernGeneratorTable,
  findTavernFoodTable,
  findTavernDrinksTable,
  findPoorShopTable,
  findStandardShopTable,
  findWealthyShopTable,
  findShopGeneratorTable,
  findInterestingCustomerTable,
  tavernSourceStatus,
  shopSourceStatus,
  resultRange,
  collectionValues,
  findResultForTotal,
  resultField,
  pairedGeneratorResult,
  normalizeQuality,
  foodColumnForTier,
  foodPriceSpec,
  rollFormula,
  tableProvenance,
  rollTavernFromSource,
  rollShopFromSource,
};