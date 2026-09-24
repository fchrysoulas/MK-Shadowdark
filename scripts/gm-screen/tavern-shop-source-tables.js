import {
  findImportedSourceTable,
  parseLabeledResultText,
  rollImportedSourceTable,
  rollImportedSourceTableField,
  tableResultText,
} from "../source-tables/source-table-service.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import {
  currentScene,
  getSceneTavernGeneratorTables,
  tavernGeneratorTableStatus,
} from "./tavern-generator-settings.js";

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

const TAVERN_FOOD_PRICE_SPECS = Object.freeze({
  poor: Object.freeze({ formula: "1d4", currency: "cp" }),
  standard: Object.freeze({ formula: "1d6", currency: "sp" }),
  wealthy: Object.freeze({ formula: "1d8", currency: "gp" }),
});
const MAX_UNIQUE_RESULT_ATTEMPTS = 100;

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
  if (Array.isArray(metadata.columns) && metadata.columns.length) return metadata.columns;
  const firstResult = collectionValues(table?.results)[0];
  return Object.keys(parseLabeledResultText(tableResultText(firstResult)));
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

function tavernSourceStatus(tables = globalThis.game?.tables, {
  scene = currentScene(),
} = {}) {
  const assignments = getSceneTavernGeneratorTables(scene);
  if (Object.entries(assignments)
    .some(([key, value]) => key !== "schema" && Boolean(value))) {
    return {
      ...tavernGeneratorTableStatus(assignments, tables),
      mode: "linked",
    };
  }

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
  return {
    available: missing.length === 0,
    configured: false,
    mode: "legacy",
    missing,
    unavailable: [],
    assignments,
    tables: resolved,
  };
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

function normalizeTavernWealth(value) {
  const key = normalize(value);
  if (TAVERN_QUALITIES[key]) return key;
  return ["poor", "standard", "wealthy"].find(wealth => key.includes(wealth)) ?? "";
}

function foodColumnForTier(table, tier) {
  const wanted = normalize(tier);
  return sourceColumns(table).find(column => normalize(column).startsWith(`${wanted} (`)) ?? "";
}

function tavernTierTableKey(family, tier) {
  return `${family}${tier[0].toUpperCase()}${tier.slice(1)}`;
}

function foodPriceSpecForTier(tier) {
  return TAVERN_FOOD_PRICE_SPECS[normalize(tier)] ?? null;
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

function tableFormula(table, fallback = "die") {
  const metadata = sourceTableFlag(table) ?? {};
  return String(metadata.formulaRaw ?? table?.formula ?? fallback);
}

function generatorTextValue(draw, labels = []) {
  const text = tableResultText(draw?.result);
  const fields = parseLabeledResultText(text);
  const wanted = labels.map(normalize);
  const match = Object.entries(fields).find(([label]) => wanted.includes(normalize(label)));
  return String(match?.[1] ?? text).trim();
}

async function rollUniqueResult({ draw, value, seen, label }) {
  for (let attempt = 0; attempt < MAX_UNIQUE_RESULT_ATTEMPTS; attempt += 1) {
    const candidate = await draw();
    const resolved = String(value(candidate) ?? "").trim();
    if (!resolved) continue;
    const key = normalize(resolved).replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    return { draw: candidate, value: resolved };
  }
  throw new Error(`${label} did not provide another unique result after ${MAX_UNIQUE_RESULT_ATTEMPTS} rolls.`);
}

async function rollTavernFromSource({
  quality = "poor",
  tables = globalThis.game?.tables,
  scene = currentScene(),
  status = null,
  rollTable = rollImportedSourceTable,
  rollField = rollImportedSourceTableField,
  rollDice = rollFormula,
} = {}) {
  const source = status ?? tavernSourceStatus(tables, { scene });
  if (!source.available) return null;

  let qualityKey = "";
  let name = "";
  let firstPart = "";
  let secondPart = "";
  let knownFor = "";
  const rolls = {};
  const sources = {};
  if (source.mode === "linked") {
    const wealthDraw = await rollTable(source.tables.wealth);
    const wealthResult = generatorTextValue(wealthDraw, ["Wealth", "Tavern Wealth", "Quality"]);
    qualityKey = normalizeTavernWealth(wealthResult);
    if (!qualityKey) throw new Error("The linked Wealth RollTable must resolve to Poor, Standard, or Wealthy.");
    rolls.wealth = wealthDraw.total;
    sources.wealth = tableProvenance(source.tables.wealth);

    const firstPartDraw = await rollTable(source.tables.firstPart);
    const secondPartDraw = await rollTable(source.tables.secondPart);
    const knownForDraw = await rollTable(source.tables.knownFor);
    firstPart = generatorTextValue(firstPartDraw, ["First Part", "Name"]);
    secondPart = generatorTextValue(secondPartDraw, ["Second Part", "Name"]);
    knownFor = generatorTextValue(knownForDraw, ["Known For"]);
    name = [firstPart, secondPart].filter(Boolean).join(" ");
    if (!name || !knownFor) throw new Error("The linked Tavern Generator RollTables could not resolve the name and Known For.");
    rolls.firstPart = firstPartDraw.total;
    rolls.secondPart = secondPartDraw.total;
    rolls.knownFor = knownForDraw.total;
    sources.firstPart = tableProvenance(source.tables.firstPart);
    sources.secondPart = tableProvenance(source.tables.secondPart);
    sources.knownFor = tableProvenance(source.tables.knownFor);
  } else {
    const identityDraw = await rollTable(source.tables.generator);
    const identity = pairedGeneratorResult(identityDraw);
    if (!identity.name || !identity.knownFor) throw new Error("The imported Tavern Generator could not resolve Name and Known For together.");
    name = identity.name;
    knownFor = identity.knownFor;
    rolls.identity = identityDraw.total;
    sources.generator = tableProvenance(source.tables.generator);
  }

  if (!qualityKey) qualityKey = normalizeQuality(quality, TAVERN_QUALITIES);
  const config = TAVERN_QUALITIES[qualityKey];
  const foods = [];
  const seenFoods = new Set();
  for (const tier of config.foodTiers) {
    const linked = source.mode === "linked";
    const sourceKey = linked ? tavernTierTableKey("food", tier) : "food";
    const foodTable = source.tables[sourceKey];
    let foodDraw;
    let item;
    let priceSpec;
    if (linked) {
      const uniqueFood = await rollUniqueResult({
        draw: () => rollTable(foodTable),
        value: draw => generatorTextValue(draw, ["Food", `${tier} Food`, "Result", "Item"]),
        seen: seenFoods,
        label: `${TAVERN_QUALITIES[tier]?.label ?? tier} Food`,
      });
      foodDraw = uniqueFood.draw;
      item = uniqueFood.value;
      priceSpec = foodPriceSpecForTier(tier);
    } else {
      const column = foodColumnForTier(foodTable, tier);
      priceSpec = foodPriceSpec(column);
      if (!column || !priceSpec) throw new Error(`The imported Food table does not expose a priced ${tier} column.`);
      const uniqueFood = await rollUniqueResult({
        draw: () => rollField(foodTable, column),
        value: draw => draw.value,
        seen: seenFoods,
        label: `${TAVERN_QUALITIES[tier]?.label ?? tier} Food`,
      });
      foodDraw = uniqueFood.draw;
      item = uniqueFood.value;
    }
    const priceRoll = await rollDice(priceSpec.formula);
    if (!item) throw new Error(`The ${linked ? "linked " : "imported "}${tier} Food table could not resolve a result.`);
    if (linked) sources[sourceKey] = tableProvenance(foodTable);
    foods.push({
      tier,
      tierLabel: TAVERN_QUALITIES[tier]?.label ?? tier,
      roll: foodDraw.total,
      item,
      formula: tableFormula(foodTable, "d12"),
      priceFormula: priceSpec.formula,
      priceRoll: priceRoll.total,
      currency: priceSpec.currency,
      sourceKey,
    });
  }

  const drinks = [];
  const seenDrinks = new Set();
  const linked = source.mode === "linked";
  const drinksSourceKey = linked ? tavernTierTableKey("drinks", qualityKey) : "drinks";
  const drinksTable = source.tables[drinksSourceKey];
  if (linked) sources[drinksSourceKey] = tableProvenance(drinksTable);
  for (let index = 0; index < config.drinks.count; index += 1) {
    let formula = config.drinks.formula;
    let roll;
    let details;
    if (linked) {
      const uniqueDrink = await rollUniqueResult({
        draw: () => rollTable(drinksTable),
        value: draw => generatorTextValue(draw, ["Drink", "Drinks", "Details", "Result"]),
        seen: seenDrinks,
        label: `${config.label} Drinks`,
      });
      const drinkDraw = uniqueDrink.draw;
      formula = tableFormula(drinksTable, formula);
      roll = drinkDraw.total;
      details = uniqueDrink.value;
    } else {
      const uniqueDrink = await rollUniqueResult({
        draw: async () => {
          const drinkRoll = await rollDice(formula);
          return {
            drinkRoll,
            result: findResultForTotal(drinksTable, drinkRoll.total),
          };
        },
        value: candidate => tableResultText(candidate.result),
        seen: seenDrinks,
        label: `${config.label} Drinks`,
      });
      roll = uniqueDrink.draw.drinkRoll.total;
      details = uniqueDrink.value;
    }
    if (!details) throw new Error(`The ${linked ? "linked " : "imported "}Drinks table could not resolve a result.`);
    drinks.push({
      formula,
      roll,
      details,
      sourceKey: drinksSourceKey,
    });
  }

  return {
    kind: "tavern",
    quality: qualityKey,
    qualityLabel: config.label,
    wealth: qualityKey,
    wealthLabel: config.label,
    name,
    nameParts: source.mode === "linked"
      ? { first: firstPart, second: secondPart }
      : null,
    knownFor,
    rolls,
    foods,
    drinks,
    sources: {
      ...sources,
      ...(source.mode === "linked"
        ? {}
        : {
          food: tableProvenance(source.tables.food),
          drinks: tableProvenance(source.tables.drinks),
        }),
    },
    sourceBookTitle: source.mode === "linked"
      ? "Scene-linked Tavern Generator RollTables"
      : CORE_BOOK_TITLE,
    sourceMode: source.mode ?? "legacy",
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
