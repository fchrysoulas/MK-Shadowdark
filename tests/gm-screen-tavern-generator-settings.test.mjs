import assert from "node:assert/strict";
import test from "node:test";

import {
  TAVERN_GENERATOR_TABLE_FLAG,
  TAVERN_GENERATOR_TABLE_KEYS,
  getSceneTavernGeneratorTables,
  normalizeTavernGeneratorTables,
  renderTavernGeneratorSetup,
  resolveTavernGeneratorEntries,
  setSceneTavernGeneratorTable,
  tavernGeneratorTableStatus,
} from "../scripts/gm-screen/tavern-generator-settings.js";

function mockTable(id, name = id) {
  return {
    id,
    uuid: "RollTable." + id,
    name,
    documentName: "RollTable",
    roll() {},
  };
}

test("Tavern Generator assignments normalize to the ten Scene-owned table slots", () => {
  assert.deepEqual(normalizeTavernGeneratorTables({
    firstPart: { uuid: "RollTable.first" },
    secondPart: "RollTable.second",
    knownFor: "RollTable.known-for",
    wealth: "RollTable.wealth",
    foodPoor: "RollTable.food-poor",
    foodStandard: "RollTable.food-standard",
    foodWealthy: "RollTable.food-wealthy",
    drinksPoor: "RollTable.drinks-poor",
    drinksStandard: "RollTable.drinks-standard",
    drinksWealthy: null,
  }), {
    schema: 4,
    firstPart: "RollTable.first",
    secondPart: "RollTable.second",
    knownFor: "RollTable.known-for",
    wealth: "RollTable.wealth",
    foodPoor: "RollTable.food-poor",
    foodStandard: "RollTable.food-standard",
    foodWealthy: "RollTable.food-wealthy",
    drinksPoor: "RollTable.drinks-poor",
    drinksStandard: "RollTable.drinks-standard",
    drinksWealthy: "",
  });
  assert.deepEqual(TAVERN_GENERATOR_TABLE_KEYS, [
    "firstPart",
    "secondPart",
    "knownFor",
    "wealth",
    "foodPoor",
    "foodStandard",
    "foodWealthy",
    "drinksPoor",
    "drinksStandard",
    "drinksWealthy",
  ]);
  assert.deepEqual(normalizeTavernGeneratorTables({
    food: "RollTable.legacy-food",
    drinks: "RollTable.legacy-drinks",
  }).foodWealthy, "RollTable.legacy-food");
  assert.deepEqual(normalizeTavernGeneratorTables({ generator: "RollTable.legacy" }).firstPart, "RollTable.legacy");
});

test("Tavern Generator status reports incomplete and unavailable linked assignments", () => {
  const tables = [mockTable("first")];
  const status = tavernGeneratorTableStatus({
    firstPart: "RollTable.first",
    secondPart: "RollTable.second",
    knownFor: "",
    wealth: "",
    foodPoor: "RollTable.food-poor",
    foodStandard: "",
    foodWealthy: "",
    drinksPoor: "",
    drinksStandard: "",
    drinksWealthy: "",
  }, tables);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Known For", "Wealth", "Standard Food", "Wealthy Food", "Poor Drinks", "Standard Drinks", "Wealthy Drinks"]);
  assert.deepEqual(status.unavailable, ["Second Part", "Poor Food"]);
  assert.equal(status.tables.firstPart.name, "first");
});

test("Tavern Generator settings render one drag target for each assigned RollTable", () => {
  const html = renderTavernGeneratorSetup([
    { key: "firstPart", label: "First Part", description: "First", uuid: "RollTable.first", table: mockTable("first", "First Part Tables") },
    { key: "secondPart", label: "Second Part", description: "Second", uuid: "RollTable.second", table: mockTable("second", "Second Part Tables") },
    { key: "knownFor", label: "Known For", description: "Known For", uuid: "", table: null },
    { key: "wealth", label: "Wealth", description: "Wealth", uuid: "RollTable.wealth", table: mockTable("wealth", "Wealth Tables") },
    { key: "foodPoor", label: "Poor Food", description: "Poor menu", uuid: "", table: null },
    { key: "foodStandard", label: "Standard Food", description: "Standard menu", uuid: "RollTable.food-standard", table: mockTable("food-standard", "Standard Food Tables") },
    { key: "foodWealthy", label: "Wealthy Food", description: "Wealthy menu", uuid: "", table: null },
    { key: "drinksPoor", label: "Poor Drinks", description: "Poor drinks", uuid: "", table: null },
    { key: "drinksStandard", label: "Standard Drinks", description: "Standard drinks", uuid: "", table: null },
    { key: "drinksWealthy", label: "Wealthy Drinks", description: "Wealthy drinks", uuid: "RollTable.drinks-wealthy", table: mockTable("drinks-wealthy", "Wealthy Drink Tables") },
  ]);

  assert.equal((html.match(/data-mk-tavern-generator-slot=/g) ?? []).length, 10);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 10);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /First Part Tables/);
  assert.match(html, /Second Part Tables/);
  assert.match(html, /Wealth Tables/);
  assert.match(html, /Standard Food Tables/);
  assert.match(html, /Drop RollTable here/);
  assert.match(html, /Wealthy Drink Tables/);
  assert.match(html, /data-mk-tavern-generator-clear/);
});

test("Tavern Generator assignments read and write the active Scene flag", async () => {
  let stored = {
    firstPart: "RollTable.first",
    secondPart: "",
    knownFor: "",
    wealth: "",
    foodPoor: "",
    foodStandard: "",
    foodWealthy: "",
    drinksPoor: "",
    drinksStandard: "",
    drinksWealthy: "",
  };
  const scene = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, TAVERN_GENERATOR_TABLE_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, TAVERN_GENERATOR_TABLE_FLAG);
      stored = value;
    },
  };

  assert.deepEqual(getSceneTavernGeneratorTables(scene), {
    schema: 4,
    firstPart: "RollTable.first",
    secondPart: "",
    knownFor: "",
    wealth: "",
    foodPoor: "",
    foodStandard: "",
    foodWealthy: "",
    drinksPoor: "",
    drinksStandard: "",
    drinksWealthy: "",
  });
  await setSceneTavernGeneratorTable("foodStandard", "RollTable.food-standard", scene, { user: { isGM: true } });
  assert.equal(stored.foodStandard, "RollTable.food-standard");
});

test("Tavern Generator settings resolve assigned table documents for display", async () => {
  const scene = {
    getFlag() {
      return {
        firstPart: "RollTable.first",
        secondPart: "RollTable.second",
        knownFor: "RollTable.known-for",
        wealth: "RollTable.wealth",
        foodPoor: "RollTable.food-poor",
        foodStandard: "RollTable.food-standard",
        foodWealthy: "RollTable.food-wealthy",
        drinksPoor: "RollTable.drinks-poor",
        drinksStandard: "RollTable.drinks-standard",
        drinksWealthy: "RollTable.drinks-wealthy",
      };
    },
  };
  const entries = await resolveTavernGeneratorEntries(scene, [
    mockTable("first", "First"),
    mockTable("second", "Second"),
    mockTable("known-for", "Known For"),
    mockTable("wealth", "Wealth"),
    mockTable("food-poor", "Poor Food"),
    mockTable("food-standard", "Standard Food"),
    mockTable("food-wealthy", "Wealthy Food"),
    mockTable("drinks-poor", "Poor Drinks"),
    mockTable("drinks-standard", "Standard Drinks"),
    mockTable("drinks-wealthy", "Wealthy Drinks"),
  ]);

  assert.deepEqual(entries.map(entry => entry.table.name), [
    "First",
    "Second",
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
