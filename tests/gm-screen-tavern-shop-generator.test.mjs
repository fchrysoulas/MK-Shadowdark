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
    "1d4": 2,
    "1d6": 3,
    "1d8": 4,
    "2d6": 7,
    "1d12": 8,
  };
  const roll = async formula => {
    calls.push(formula);
    return { formula, total: totals[formula] ?? 1 };
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
    priceFormula: "1d4",
    priceRoll: 2,
    currency: "cp",
  });
  assert.equal(result.foods[1].tier, "standard");
  assert.equal(result.foods[1].priceFormula, "1d6");
  assert.equal(result.foods[1].currency, "sp");
});

test("Shop quality selects its own source table and customer uses two independent d4 rolls", async () => {
  for (const [quality, expectedType] of Object.entries({
    poor: "Poor Type 2",
    standard: "Standard Type 3",
    wealthy: "Wealthy Type 4",
  })) {
    const tables = syntheticTables();
    const dice = diceRecorder();
    const result = await rollShopFromSource({
      quality,
      status: shopSourceStatus(tables),
      tables,
      rollDice: dice.roll,
    });
    assert.equal(result.shopType, expectedType);
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
  const tavernHtml = tavernPageContent(tavern, "Edited Tavern");
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
      promptQuality: async () => "standard",
      promptGenerated: async () => ({ mode: "generated", name: "Imported Test Shop", result: generatedResult }),
    });

    assert.equal(imports, 1);
    assert.equal(created.name, "Imported Test Shop");
    assert.match(created.pages[0].text.content, /Synthetic Customer/);
  } finally {
    restoreGlobals(saved);
  }
});

test("Tavern and Shop controller is loaded after existing Exploration and NPC creation controls", () => {
  const explorationIndex = manifest.esmodules.indexOf("scripts/gm-screen/exploration-creation-controls.js");
  const npcIndex = manifest.esmodules.indexOf("scripts/gm-screen/npc-creation-controls.js");
  const establishmentsIndex = manifest.esmodules.indexOf("scripts/gm-screen/tavern-shop-creation-controls.js");
  assert.ok(explorationIndex >= 0);
  assert.ok(npcIndex > explorationIndex);
  assert.ok(establishmentsIndex > npcIndex);
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