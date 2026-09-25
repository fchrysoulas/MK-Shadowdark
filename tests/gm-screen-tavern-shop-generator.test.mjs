import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  SHOP_QUALITIES,
  TAVERN_QUALITIES,
  foodPriceSpec,
  rollShopFromSource,
  rollTavernFromSource,
  shopSourceStatus,
  tavernSourceStatus,
} from "../scripts/gm-screen/tavern-shop-source-tables.js";
import {
  buildEstablishmentJournalData,
  createSourceDrivenShop,
  createSourceDrivenTavern,
  shopPageContent,
  tavernPageContent,
} from "../scripts/gm-screen/tavern-shop-generator.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const sourceRuntime = fs.readFileSync(new URL("../scripts/gm-screen/tavern-shop-source-tables.js", import.meta.url), "utf8");
const generatorRuntime = fs.readFileSync(new URL("../scripts/gm-screen/tavern-shop-generator.js", import.meta.url), "utf8");

function sourceFlag({ key, columns, pages, formulaRaw }) {
  return {
    key,
    bookId: CORE_BOOK_ID,
    bookTitle: CORE_BOOK_TITLE,
    columns,
    pages,
    formulaRaw,
  };
}

function mockTable({ id, name, formula, formulaRaw = formula, columns, results, totals = [], pages = [200], forbidRoll = false }) {
  let rollIndex = 0;
  const table = {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula,
    results: results.map((result, index) => ({ id: `${id}-${index}`, ...result })),
    flags: {
      "mk-shadowdark": {
        sourceTable: sourceFlag({ key: `${CORE_BOOK_ID}:${id}`, columns, pages, formulaRaw }),
      },
    },
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
    async roll() {
      if (forbidRoll) throw new Error(`${name} must be resolved by contextual total, not native table.roll().`);
      const total = totals[rollIndex++] ?? totals.at(-1) ?? 1;
      const result = this.results.find(entry => total >= entry.range[0] && total <= entry.range[1]);
      return { roll: { total }, results: result ? [result] : [] };
    },
    get rollCalls() {
      return rollIndex;
    },
  };
  return table;
}

function numberedResults(count, buildText) {
  return Array.from({ length: count }, (_, index) => ({
    range: [index + 1, index + 1],
    text: buildText(index + 1),
  }));
}

function syntheticTables() {
  const tavernGenerator = mockTable({
    id: "tavern-generator",
    name: "Taverns — TAVERN GENERATOR",
    formula: "1d20",
    columns: ["d20", "Name", "Known For"],
    results: numberedResults(20, value => `Name: Test Tavern ${value} | Known For: Tavern Trait ${value}`),
    totals: [4, 5, 6],
    pages: [200],
  });
  const food = mockTable({
    id: "food",
    name: "Taverns — FOOD",
    formula: "1d12",
    columns: ["d12", "Poor (1d4 cp)", "Standard (1d6 sp)", "Wealthy (1d8 gp)"],
    results: numberedResults(12, value => (
      `Poor (1d4 cp): Poor Meal ${value} | Standard (1d6 sp): Standard Meal ${value} | Wealthy (1d8 gp): Wealthy Meal ${value}`
    )),
    totals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    pages: [201],
  });
  const drinks = mockTable({
    id: "drinks",
    name: "Game Master — Taverns — DRINKS",
    formula: "1d12",
    formulaRaw: "d*",
    columns: ["d*", "Details"],
    results: numberedResults(12, value => `Synthetic drink ${value}`),
    forbidRoll: true,
    pages: [201],
  });

  const poor = mockTable({
    id: "poor-shop",
    name: "Shops — POOR SHOP",
    formula: "1d12",
    columns: ["d12", "Shop"],
    results: numberedResults(12, value => `Poor Type ${value}`),
    totals: [2],
    pages: [202],
  });
  const standard = mockTable({
    id: "standard-shop",
    name: "Shops — STANDARD SHOP",
    formula: "1d10",
    columns: ["d10", "Shop"],
    results: numberedResults(10, value => `Standard Type ${value}`),
    totals: [3],
    pages: [202],
  });
  const wealthy = mockTable({
    id: "wealthy-shop",
    name: "Shops — WEALTHY SHOP",
    formula: "1d10",
    columns: ["d10", "Shop"],
    results: numberedResults(10, value => `Wealthy Type ${value}`),
    totals: [4],
    pages: [202],
  });
  const shopGenerator = mockTable({
    id: "shop-generator",
    name: "Shops — SHOP GENERATOR",
    formula: "1d20",
    columns: ["d20", "Name", "Known For"],
    results: numberedResults(20, value => `Name: Test Shop ${value} | Known For: Shop Trait ${value}`),
    totals: [6],
    pages: [203],
  });
  const customer = mockTable({
    id: "interesting-customer",
    name: "Shops — INTERESTING CUSTOMER",
    formula: "1d4",
    formulaRaw: "d4, d4",
    columns: ["d4, d4", "1", "2", "3", "4"],
    results: numberedResults(4, value => (
      `1: Customer ${value}.1 | 2: Customer ${value}.2 | 3: Customer ${value}.3 | 4: Customer ${value}.4`
    )),
    totals: [3],
    pages: [203],
  });

  return [tavernGenerator, food, drinks, poor, standard, wealthy, shopGenerator, customer];
}

function diceRecorder() {
  const calls = [];
  const totals = {
    "1d4": [2],
    "1d6": [3, 4, 5, 6],
    "1d8": [4, 5, 6, 7],
    "2d6": [7, 8, 9, 10],
    "1d12": [8, 9, 10, 11],
  };
  const indexes = new Map();
  const roll = async formula => {
    calls.push(formula);
    const sequence = totals[formula] ?? [1];
    const index = indexes.get(formula) ?? 0;
    indexes.set(formula, index + 1);
    return { formula, total: sequence[index] ?? sequence.at(-1) };
  };
  return { calls, roll };
}

function saveGlobals(...keys) {
  return Object.fromEntries(keys.map(key => [key, globalThis[key]]));
}

function restoreGlobals(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globalThis[key];
    else globalThis[key] = value;
  }
}

test("Tavern and Shop quality configurations preserve the Core procedures", () => {
  assert.deepEqual(TAVERN_QUALITIES.poor.foodTiers, ["poor", "poor", "poor"]);
  assert.deepEqual(TAVERN_QUALITIES.poor.drinks, { count: 2, formula: "1d6" });
  assert.deepEqual(TAVERN_QUALITIES.standard.foodTiers, ["poor", "standard", "standard"]);
  assert.deepEqual(TAVERN_QUALITIES.standard.drinks, { count: 3, formula: "2d6" });
  assert.deepEqual(TAVERN_QUALITIES.wealthy.foodTiers, ["standard", "standard", "wealthy", "wealthy"]);
  assert.deepEqual(TAVERN_QUALITIES.wealthy.drinks, { count: 4, formula: "1d12" });
  assert.deepEqual(Object.keys(SHOP_QUALITIES), ["poor", "standard", "wealthy"]);
});

test("source status resolves all imported Core Tavern and Shop tables by metadata and columns", () => {
  const tables = syntheticTables();
  assert.equal(tavernSourceStatus(tables).available, true);
  assert.equal(shopSourceStatus(tables).available, true);
  assert.equal(tavernSourceStatus(tables.filter(table => table.id !== "drinks")).available, false);
  assert.ok(shopSourceStatus(tables.filter(table => table.id !== "wealthy-shop")).missing.includes("Wealthy Shop"));
});

test("linked Tavern Generator assignments take precedence over legacy source discovery", () => {
  const tables = syntheticTables();
  const scene = {
    getFlag() {
      return {
        firstPart: "RollTable.tavern-generator",
        secondPart: "RollTable.tavern-generator",
        knownFor: "RollTable.tavern-generator",
        wealth: "RollTable.tavern-generator",
        foodPoor: "RollTable.food",
        foodStandard: "RollTable.food",
        foodWealthy: "RollTable.food",
        drinksPoor: "RollTable.drinks",
        drinksStandard: "RollTable.drinks",
        drinksWealthy: "RollTable.drinks",
      };
    },
  };
  const status = tavernSourceStatus(tables, { scene });

  assert.equal(status.mode, "linked");
  assert.equal(status.configured, true);
  assert.equal(status.available, true);
  assert.equal(status.tables.firstPart.name, "Taverns — TAVERN GENERATOR");

  const incomplete = tavernSourceStatus(tables, {
    scene: {
      getFlag() {
        return { firstPart: "RollTable.tavern-generator" };
      },
    },
  });
  assert.equal(incomplete.mode, "linked");
  assert.equal(incomplete.available, false);
  assert.deepEqual(incomplete.missing, [
    "Second Part",
    "Known For",
    "Wealth",
    "Poor Food",
    "Standard Food",
    "Wealthy Food",
    "Poor Drinks",
    "Standard Drinks",
    "Wealthy Drinks",
  ]);
});

test("linked Shop Generator assignments take precedence over legacy source discovery", async () => {
  const tables = syntheticTables();
  tables.push(
    mockTable({
      id: "shop-quality",
      name: "Shops — QUALITY",
      formula: "1d3",
      columns: ["d3", "Quality"],
      results: numberedResults(3, value => ["Poor", "Standard", "Wealthy"][value - 1]),
      totals: [2],
      pages: [203],
    }),
    mockTable({
      id: "shop-first",
      name: "Shops — FIRST PART",
      formula: "1d6",
      columns: ["d6", "First Part"],
      results: numberedResults(6, value => `First Part ${value}`),
      totals: [2],
      pages: [203],
    }),
    mockTable({
      id: "shop-second",
      name: "Shops — SECOND PART",
      formula: "1d6",
      columns: ["d6", "Second Part"],
      results: numberedResults(6, value => `Second Part ${value}`),
      totals: [3],
      pages: [203],
    }),
    mockTable({
      id: "shop-known-for",
      name: "Shops — KNOWN FOR",
      formula: "1d6",
      columns: ["d6", "Known For"],
      results: numberedResults(6, value => `Known For ${value}`),
      totals: [4],
      pages: [203],
    }),
  );
  const scene = {
    getFlag() {
      return {
        quality: "RollTable.shop-quality",
        firstPart: "RollTable.shop-first",
        secondPart: "RollTable.shop-second",
        knownFor: "RollTable.shop-known-for",
        poorShop: "RollTable.poor-shop",
        standardShop: "RollTable.standard-shop",
        wealthyShop: "RollTable.wealthy-shop",
        customer: "RollTable.interesting-customer",
      };
    },
  };
  const status = shopSourceStatus(tables, { scene });

  assert.equal(status.mode, "linked");
  assert.equal(status.configured, true);
  assert.equal(status.available, true);
  assert.equal(status.tables.standardShop.name, "Shops — STANDARD SHOP");

  const result = await rollShopFromSource({
    quality: "standard",
    status,
    tables,
    scene,
    rollDice: diceRecorder().roll,
  });

  assert.equal(result.sourceMode, "linked");
  assert.equal(result.sourceBookTitle, "Scene-linked Shop Generator RollTables");
  assert.equal(result.quality, "standard");
  assert.equal(result.qualityLabel, "Standard");
  assert.equal(result.rolls.quality, 2);
  assert.equal(result.sources.quality.tableName, "Shops — QUALITY");
  assert.equal(result.shopType, "Standard Type 3");
  assert.equal(result.name, "First Part 2 Second Part 3");
  assert.deepEqual(result.nameParts, { first: "First Part 2", second: "Second Part 3" });
  assert.equal(result.knownFor, "Known For 4");
  assert.equal(result.customer, "Customer 3.2");
  assert.equal(result.sources.shopType.tableName, "Shops — STANDARD SHOP");
  assert.equal(result.sources.firstPart.tableName, "Shops — FIRST PART");
  assert.equal(result.sources.secondPart.tableName, "Shops — SECOND PART");
  assert.equal(result.sources.knownFor.tableName, "Shops — KNOWN FOR");
  assert.equal(result.sources.customer.tableName, "Shops — INTERESTING CUSTOMER");
  const journalHtml = shopPageContent(result, "First Part 2 Second Part 3");
  assert.match(journalHtml, /First Part/);
  assert.match(journalHtml, /Second Part/);
  assert.match(journalHtml, /Known For/);
});

test("linked Tavern Generator rolls Wealth, First Part, Second Part, and Known For separately", async () => {
  const tables = syntheticTables();
  tables.push(
    mockTable({
      id: "tavern-wealth",
      name: "Tavern Wealth",
      formula: "1d3",
      columns: ["d3"],
      results: numberedResults(3, value => ["Poor", "Standard", "Wealthy"][value - 1]),
      totals: [2],
    }),
    mockTable({
      id: "tavern-first",
      name: "Tavern First Part",
      formula: "1d6",
      columns: ["d6"],
      results: numberedResults(6, value => "First " + value),
      totals: [2],
    }),
    mockTable({
      id: "tavern-second",
      name: "Tavern Second Part",
      formula: "1d6",
      columns: ["d6"],
      results: numberedResults(6, value => "Second " + value),
      totals: [3],
    }),
    mockTable({
      id: "tavern-known-for",
      name: "Tavern Known For",
      formula: "1d6",
      columns: ["d6"],
      results: numberedResults(6, value => "Known For " + value),
      totals: [4],
    }),
    ...["poor", "standard", "wealthy"].map(tier => mockTable({
      id: `tavern-food-${tier}`,
      name: `Tavern ${tier} Food`,
      formula: "1d12",
      columns: ["d12"],
      results: numberedResults(12, value => `${tier[0].toUpperCase()}${tier.slice(1)} Meal ${value}`),
      totals: tier === "standard" ? [3, 3, 4] : [2],
    })),
    ...["poor", "standard", "wealthy"].map(tier => mockTable({
      id: `tavern-drinks-${tier}`,
      name: `Tavern ${tier} Drinks`,
      formula: tier === "wealthy" ? "1d12" : "1d6",
      columns: [tier === "wealthy" ? "d12" : "d6"],
      results: numberedResults(12, value => `${tier[0].toUpperCase()}${tier.slice(1)} Drink ${value}`),
      totals: [3, 3, 4, 5],
    })),
  );
  const scene = {
    getFlag() {
      return {
        firstPart: "RollTable.tavern-first",
        secondPart: "RollTable.tavern-second",
        knownFor: "RollTable.tavern-known-for",
        wealth: "RollTable.tavern-wealth",
        foodPoor: "RollTable.tavern-food-poor",
        foodStandard: "RollTable.tavern-food-standard",
        foodWealthy: "RollTable.tavern-food-wealthy",
        drinksPoor: "RollTable.tavern-drinks-poor",
        drinksStandard: "RollTable.tavern-drinks-standard",
        drinksWealthy: "RollTable.tavern-drinks-wealthy",
      };
    },
  };
  const dice = diceRecorder();
  const result = await rollTavernFromSource({
    quality: "poor",
    tables,
    scene,
    rollDice: dice.roll,
  });

  assert.equal(result.name, "First 2 Second 3");
  assert.equal(result.knownFor, "Known For 4");
  assert.equal(result.quality, "standard");
  assert.equal(result.wealth, "standard");
  assert.equal(result.wealthLabel, "Standard");
  assert.deepEqual(result.nameParts, { first: "First 2", second: "Second 3" });
  assert.deepEqual(result.rolls, {
    wealth: 2,
    firstPart: 2,
    secondPart: 3,
    knownFor: 4,
  });
  assert.equal(result.sources.firstPart.tableName, "Tavern First Part");
  assert.equal(result.sources.secondPart.tableName, "Tavern Second Part");
  assert.equal(result.sources.knownFor.tableName, "Tavern Known For");
  assert.equal(result.sources.wealth.tableName, "Tavern Wealth");
  assert.deepEqual(result.foods.map(food => food.sourceKey), ["foodPoor", "foodStandard", "foodStandard"]);
  assert.deepEqual(result.drinks.map(drink => drink.sourceKey), ["drinksStandard", "drinksStandard", "drinksStandard"]);
  assert.equal(new Set(result.foods.map(food => food.item)).size, result.foods.length);
  assert.equal(new Set(result.drinks.map(drink => drink.details)).size, result.drinks.length);
  assert.equal(result.sources.foodPoor.tableName, "Tavern poor Food");
  assert.equal(result.sources.foodStandard.tableName, "Tavern standard Food");
  assert.equal(result.sources.drinksStandard.tableName, "Tavern standard Drinks");
  const journalHtml = tavernPageContent(result, "First 2 Second 3", { debug: true });
  assert.match(journalHtml, /First Part/);
  assert.match(journalHtml, /Second Part/);
  assert.match(journalHtml, /Known For/);
});

test("food price formulas and currencies are derived from source column labels", () => {
  assert.deepEqual(foodPriceSpec("Poor (1d4 cp)"), { formula: "1d4", currency: "cp" });
  assert.deepEqual(foodPriceSpec("Standard (1d6 sp)"), { formula: "1d6", currency: "sp" });
  assert.deepEqual(foodPriceSpec("Wealthy (1d8 gp)"), { formula: "1d8", currency: "gp" });
  assert.equal(foodPriceSpec("Poor"), null);
});

for (const quality of ["poor", "standard", "wealthy"]) {
  test(`${quality} Tavern follows exact menu counts and contextual drink formula`, async () => {
    const tables = syntheticTables();
    const status = tavernSourceStatus(tables);
    const dice = diceRecorder();
    const result = await rollTavernFromSource({ quality, status, tables, rollDice: dice.roll });
    const config = TAVERN_QUALITIES[quality];

    assert.equal(result.quality, quality);
    assert.deepEqual(result.foods.map(food => food.tier), [...config.foodTiers]);
    assert.equal(result.foods.length, config.foodTiers.length);
    assert.equal(result.drinks.length, config.drinks.count);
    assert.ok(result.drinks.every(drink => drink.formula === config.drinks.formula));
    assert.ok(result.drinks.every(drink => drink.details.startsWith("Synthetic drink ")));
    assert.equal(status.tables.drinks.rollCalls, 0);

    const contextualDrinkCalls = dice.calls.filter(formula => formula === config.drinks.formula);
    const priceCallsOfSameFormula = result.foods.filter(food => food.priceFormula === config.drinks.formula).length;
    assert.equal(contextualDrinkCalls.length - priceCallsOfSameFormula, config.drinks.count);
  });
}

test("Tavern Food records source roll, source-derived price formula, and price roll", async () => {
  const tables = syntheticTables();
  const dice = diceRecorder();
  const result = await rollTavernFromSource({
    quality: "standard",
    status: tavernSourceStatus(tables),
    tables,
    rollDice: dice.roll,
  });
  assert.deepEqual(result.foods[0], {
    tier: "poor",
    tierLabel: "Poor",
    roll: 1,
    item: "Poor Meal 1",
    formula: "1d12",
    priceFormula: "1d4",
    priceRoll: 2,
    currency: "cp",
    sourceKey: "food",
  });
  assert.equal(result.foods[1].tier, "standard");
  assert.equal(result.foods[1].priceFormula, "1d6");
  assert.equal(result.foods[1].currency, "sp");
});

test("Shop quality is rolled before selecting its source table and customer uses two independent d4 rolls", async () => {
  for (const [qualityRoll, expected] of [
    [1, { quality: "poor", shopType: "Poor Type 2" }],
    [2, { quality: "standard", shopType: "Standard Type 3" }],
    [3, { quality: "wealthy", shopType: "Wealthy Type 4" }],
  ]) {
    const tables = syntheticTables();
    const dice = diceRecorder();
    const result = await rollShopFromSource({
      status: shopSourceStatus(tables),
      tables,
      rollDice: async formula => formula === "1d3"
        ? { formula, total: qualityRoll }
        : dice.roll(formula),
    });
    assert.equal(result.quality, expected.quality);
    assert.equal(result.rolls.quality, qualityRoll);
    assert.equal(result.shopType, expected.shopType);
    assert.equal(result.rolls.customerRow, 3);
    assert.equal(result.rolls.customerColumn, 2);
    assert.equal(result.customer, "Customer 3.2");
    assert.ok(dice.calls.includes("1d4"));
  }
});

test("generated Tavern and Shop Journal pages preserve rolls and source provenance", async () => {
  const tavernTables = syntheticTables();
  const tavern = await rollTavernFromSource({
    quality: "poor",
    status: tavernSourceStatus(tavernTables),
    tables: tavernTables,
    rollDice: diceRecorder().roll,
  });
  const tavernHtml = tavernPageContent(tavern, "Edited Tavern", { debug: true });
  assert.match(tavernHtml, /Edited Tavern/);
  assert.match(tavernHtml, /Shadowdark RPG Core Rulebook v4\.9/);
  assert.match(tavernHtml, /PDF p\./);
  assert.match(tavernHtml, /Known For/);
  assert.match(tavernHtml, /Food/);
  assert.match(tavernHtml, /Drinks/);

  const shopTables = syntheticTables();
  const shop = await rollShopFromSource({
    quality: "standard",
    status: shopSourceStatus(shopTables),
    tables: shopTables,
    rollDice: diceRecorder().roll,
  });
  const shopHtml = shopPageContent(shop, "Edited Shop");
  assert.match(shopHtml, /Edited Shop/);
  assert.match(shopHtml, /Shop Type/);
  assert.match(shopHtml, /Interesting Customer/);
  assert.match(shopHtml, /d4 3, d4 2/);
});

test("Tavern Journal pages hide roll details by default and preserve ampersands", () => {
  const result = {
    sourceMode: "linked",
    sourceBookTitle: "Linked Tavern Tables",
    qualityLabel: "Standard",
    wealthLabel: "Standard",
    knownFor: "dancing & contests",
    nameParts: { first: "Cup", second: "Blade" },
    rolls: { wealth: 2, firstPart: 3, secondPart: 4, knownFor: 5 },
    sources: {
      wealth: { formulaRaw: "1d6", pages: [1] },
      firstPart: { formulaRaw: "1d20", pages: [2] },
      secondPart: { formulaRaw: "1d20", pages: [2] },
      knownFor: { formulaRaw: "1d20", pages: [2] },
    },
    foods: [{
      tierLabel: "Poor",
      formula: "1d12",
      roll: 3,
      item: "Bread & Butter",
      priceRoll: 2,
      currency: "cp",
      priceFormula: "1d4",
    }],
    drinks: [{ formula: "2d6", roll: 7, details: "Cider & Spice" }],
  };

  const readable = tavernPageContent(result, "Cup &amp; Blade");
  assert.match(readable, /Cup &amp; Blade/);
  assert.doesNotMatch(readable, /&amp;amp;/);
  assert.match(readable, /Tavern Overview/);
  assert.match(readable, /Food/);
  assert.match(readable, /Drinks/);
  assert.match(readable, /GM Notes/);
  assert.doesNotMatch(readable, /Roll Details|Source:|1d6|1d12|2d6/);

  const debug = tavernPageContent(result, "Cup &amp; Blade", { debug: true });
  assert.match(debug, /Roll Details/);
  assert.match(debug, /Source:/);
  assert.match(debug, /1d12/);
  assert.match(debug, /2d6/);
});

test("Journal payloads use one native editable text page and no custom gameplay state", () => {
  const tavern = buildEstablishmentJournalData({ kind: "tavern", name: "Blank Tavern", htmlFormat: 1 });
  const shop = buildEstablishmentJournalData({ kind: "shop", name: "Blank Shop", htmlFormat: 1 });
  assert.equal(tavern.pages.length, 1);
  assert.equal(tavern.pages[0].type, "text");
  assert.equal(tavern.pages[0].text.format, 1);
  assert.equal(shop.pages.length, 1);
  assert.equal(shop.pages[0].type, "text");
  assert.equal("flags" in tavern, false);
  assert.equal("flags" in shop, false);
});

test("missing Tavern source supports Create Blank Tavern without generated source state", async () => {
  const saved = saveGlobals("game", "JournalEntry", "CONST", "ui");
  let created = null;
  try {
    globalThis.game = { user: { isGM: true }, tables: [] };
    globalThis.CONST = { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } };
    globalThis.ui = { notifications: {} };
    globalThis.JournalEntry = {
      implementation: {
        create: async data => {
          created = data;
          return { sheet: { render() {} } };
        },
      },
    };

    await createSourceDrivenTavern({
      tables: [],
      promptMissingSource: undefined,
      promptMissing: async () => "blank",
      promptBlank: async () => "Blank Test Tavern",
    });
    assert.equal(created.name, "Blank Test Tavern");
    assert.match(created.pages[0].text.content, /GM Notes/);
    assert.doesNotMatch(created.pages[0].text.content, /Source:/);
  } finally {
    restoreGlobals(saved);
  }
});

test("Import / Update retries Shop source status before generated creation", async () => {
  const saved = saveGlobals("game", "JournalEntry", "CONST", "ui");
  let created = null;
  let imports = 0;
  let qualityPrompts = 0;
  const tables = syntheticTables();
  const generatedResult = {
    kind: "shop",
    quality: "standard",
    qualityLabel: "Standard",
    name: "Generated Test Shop",
    shopType: "Synthetic Type",
    knownFor: "Synthetic Trait",
    customer: "Synthetic Customer",
    rolls: { shopType: 2, identity: 3, customerRow: 1, customerColumn: 4 },
    sources: {
      shopType: { pages: [202], formulaRaw: "d10" },
      generator: { pages: [203] },
      customer: { pages: [203] },
    },
    sourceBookTitle: CORE_BOOK_TITLE,
  };

  try {
    globalThis.game = { user: { isGM: true }, tables: [] };
    globalThis.CONST = { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } };
    globalThis.ui = { notifications: { warn() {} } };
    globalThis.JournalEntry = {
      implementation: {
        create: async data => {
          created = data;
          return { sheet: { render() {} } };
        },
      },
    };

    await createSourceDrivenShop({
      tables: [],
      promptMissing: async () => "import",
      importSources: async () => {
        imports += 1;
        globalThis.game.tables = tables;
      },
      promptQuality: async () => {
        qualityPrompts += 1;
        return "standard";
      },
      promptGenerated: async () => ({ mode: "generated", name: "Imported Test Shop", result: generatedResult }),
    });

    assert.equal(imports, 1);
    assert.equal(qualityPrompts, 0);
    assert.equal(created.name, "Imported Test Shop");
    assert.match(created.pages[0].text.content, /Synthetic Customer/);
  } finally {
    restoreGlobals(saved);
  }
});

test("Settlement creation controllers are enabled together", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/exploration-creation-controls.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/npc-creation-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/tavern-shop-creation-controls.js"), true);
});

test("public Tavern/Shop runtime contains procedures and resolvers without hardcoded result maps", () => {
  assert.match(sourceRuntime, /TAVERN_QUALITIES/);
  assert.match(sourceRuntime, /findTavernDrinksTable/);
  assert.match(sourceRuntime, /findResultForTotal/);
  assert.match(sourceRuntime, /rollShopFromSource/);
  assert.match(generatorRuntime, /createSourceDrivenTavern/);
  assert.match(generatorRuntime, /createSourceDrivenShop/);
  assert.doesNotMatch(sourceRuntime, /TAVERN_RESULTS|DRINK_RESULTS|FOOD_RESULTS|SHOP_RESULTS|CUSTOMER_RESULTS/);
});
