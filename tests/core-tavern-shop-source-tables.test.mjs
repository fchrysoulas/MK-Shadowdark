import assert from "node:assert/strict";
import test from "node:test";

import { parseSupportedSourceTables } from "../scripts/source-tables/source-parser.js";
import {
  DYNAMIC_DRINKS_KEY,
  DYNAMIC_DRINKS_WARNING,
} from "../scripts/source-tables/core-dynamic-tables.js";
import {
  splitGeneratorNameKnownFor,
  splitMatrixPhrases,
} from "../scripts/source-tables/core-structured-tables.js";

function numberedRows(count, build) {
  return Array.from({ length: count }, (_, index) => build(index + 1)).join("\n");
}

const SYNTHETIC_CORE = `
# Shadowdark RPG
<!-- PDF Page 140 -->
## Game Master
## Taverns
#### TAVERN GENERATOR
d20 Name Name Known For...
${numberedRows(20, value => `${value} The Test Inn${value} Trait ${value}`)}

<!-- PDF Page 141 -->
#### FOOD
d12 Poor (1d4 cp) Standard (1d6 sp) Wealthy (1d8 gp)
${numberedRows(12, value => `${value} PoorMeal${value} StandardMeal${value} WealthyMeal${value}`)}
#### DRINKS
d* Details
${numberedRows(12, value => `${value} Test drink ${value}. Synthetic effect ${value}`)}

<!-- PDF Page 142 -->
## Shops
#### POOR SHOP
d12 Shop
${numberedRows(12, value => `${value} PoorShop${value}`)}
#### STANDARD SHOP
d10 Shop
${numberedRows(10, value => `${value} StandardShop${value}`)}
#### WEALTHY SHOP
d10 Shop
${numberedRows(10, value => `${value} WealthyShop${value}`)}

<!-- PDF Page 143 -->
#### SHOP GENERATOR
d20 Name Name Known For...
${numberedRows(20, value => `${value} Shop${value} Place Trait ${value}`)}
#### INTERESTING CUSTOMER
d4, d4 1 2 3 4
${numberedRows(4, value => `${value} Visitor${value} 1d${value + 3} helpers Guest${value} Patron${value}`)}
`;

function findTitle(tables, title) {
  return tables.find(table => String(table.title ?? "").toLowerCase() === title.toLowerCase());
}

test("generator name helper separates structural name forms from Known For text", () => {
  assert.deepEqual(splitGeneratorNameKnownFor("The Copper Fox Quiet card games"), [
    "The Copper Fox",
    "Quiet card games",
  ]);
  assert.deepEqual(splitGeneratorNameKnownFor("The Dog & Bell Hidden cellar"), [
    "The Dog & Bell",
    "Hidden cellar",
  ]);
  assert.deepEqual(splitGeneratorNameKnownFor("Copper & Bell Curious owner"), [
    "Copper & Bell",
    "Curious owner",
  ]);
  assert.deepEqual(splitGeneratorNameKnownFor("Amber Lantern Rare visitors"), [
    "Amber Lantern",
    "Rare visitors",
  ]);
  assert.equal(splitGeneratorNameKnownFor("ambiguous lowercase text"), null);
});

test("matrix helper recognizes dice-led customer cells without embedding source rows", () => {
  assert.deepEqual(splitMatrixPhrases("Odd wizard 1d8 helpers Cackling guest Loud miner", 4), [
    "Odd wizard",
    "1d8 helpers",
    "Cackling guest",
    "Loud miner",
  ]);
});

test("Core Tavern generator and Food preserve field-addressable source columns", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const generator = findTitle(parsed.tables, "TAVERN GENERATOR");
  const food = findTitle(parsed.tables, "FOOD");

  assert.deepEqual(generator.columns, ["d20", "Name", "Known For"]);
  assert.equal(generator.results[0].text, "Name: The Test Inn1 | Known For: Trait 1");

  assert.deepEqual(food.columns, [
    "d12",
    "Poor (1d4 cp)",
    "Standard (1d6 sp)",
    "Wealthy (1d8 gp)",
  ]);
  assert.equal(
    food.results[0].text,
    "Poor (1d4 cp): PoorMeal1 | Standard (1d6 sp): StandardMeal1 | Wealthy (1d8 gp): WealthyMeal1",
  );
});

test("Core dynamic Drinks is recovered as lookup data without pretending d* is fixed", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const drinks = findTitle(parsed.tables, "DRINKS");

  assert.ok(drinks);
  assert.equal(drinks.key, DYNAMIC_DRINKS_KEY);
  assert.equal(drinks.formulaRaw, "d*");
  assert.equal(drinks.formula, "1d12");
  assert.deepEqual(drinks.columns, ["d*", "Details"]);
  assert.equal(drinks.results.length, 12);
  assert.equal(drinks.results[0].text, "Test drink 1. Synthetic effect 1");
  assert.ok(drinks.warnings.includes(DYNAMIC_DRINKS_WARNING));
});

test("Core Shop Generator and Interesting Customer matrix preserve separate fields", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const generator = findTitle(parsed.tables, "SHOP GENERATOR");
  const customer = findTitle(parsed.tables, "INTERESTING CUSTOMER");

  assert.deepEqual(generator.columns, ["d20", "Name", "Known For"]);
  assert.equal(generator.results[0].text, "Name: Shop1 Place | Known For: Trait 1");

  assert.deepEqual(customer.columns, ["d4, d4", "1", "2", "3", "4"]);
  assert.equal(customer.results[0].text, "1: Visitor1 | 2: 1d4 helpers | 3: Guest1 | 4: Patron1");
});

test("Core Shop quality tables remain ordinary imported RollTables", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  assert.equal(findTitle(parsed.tables, "POOR SHOP")?.formula, "1d12");
  assert.equal(findTitle(parsed.tables, "STANDARD SHOP")?.formula, "1d10");
  assert.equal(findTitle(parsed.tables, "WEALTHY SHOP")?.formula, "1d10");
});

test("dynamic Drinks stable key is deterministic across repeated imports", () => {
  const first = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const second = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  assert.equal(findTitle(first.tables, "DRINKS")?.key, findTitle(second.tables, "DRINKS")?.key);
});