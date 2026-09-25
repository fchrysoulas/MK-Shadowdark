import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SHOP_GENERATOR_TABLE_FLAG,
  SHOP_GENERATOR_TABLE_KEYS,
  getSceneShopGeneratorTables,
  normalizeShopGeneratorTables,
  renderShopGeneratorSetup,
  resolveShopGeneratorEntries,
  setSceneShopGeneratorTable,
  shopGeneratorTableStatus,
} from "../scripts/gm-screen/tavern-generator-settings.js";

function mockTable(id, name = id) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    documentName: "RollTable",
    roll() {},
  };
}

test("Shop Generator assignments normalize to eight Scene-owned table slots", () => {
  assert.deepEqual(normalizeShopGeneratorTables({
    quality: { uuid: "RollTable.quality" },
    firstPart: { uuid: "RollTable.first" },
    secondPart: "RollTable.second",
    knownFor: "RollTable.known-for",
    poorShop: { uuid: "RollTable.poor" },
    standardShop: "RollTable.standard",
    wealthyShop: "RollTable.wealthy",
    customer: "RollTable.customer",
  }), {
    schema: 3,
    quality: "RollTable.quality",
    firstPart: "RollTable.first",
    secondPart: "RollTable.second",
    knownFor: "RollTable.known-for",
    poorShop: "RollTable.poor",
    standardShop: "RollTable.standard",
    wealthyShop: "RollTable.wealthy",
    customer: "RollTable.customer",
  });
  assert.deepEqual(SHOP_GENERATOR_TABLE_KEYS, [
    "quality",
    "firstPart",
    "secondPart",
    "knownFor",
    "poorShop",
    "standardShop",
    "wealthyShop",
    "customer",
  ]);
  assert.equal(normalizeShopGeneratorTables({ poor: "RollTable.legacy-poor" }).poorShop, "RollTable.legacy-poor");
  const legacy = normalizeShopGeneratorTables({ generator: "RollTable.legacy-generator" });
  assert.equal(legacy.quality, "");
  assert.equal(legacy.firstPart, "RollTable.legacy-generator");
  assert.equal(legacy.secondPart, "RollTable.legacy-generator");
  assert.equal(legacy.knownFor, "");
});

test("Shop Generator status reports incomplete and unavailable linked assignments", () => {
  const status = shopGeneratorTableStatus({
    quality: "RollTable.quality",
    firstPart: "RollTable.first",
    secondPart: "RollTable.second",
    knownFor: "",
    poorShop: "RollTable.poor",
    standardShop: "RollTable.standard",
    wealthyShop: "",
    customer: "RollTable.customer",
  }, [mockTable("poor")]);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Known For", "Wealthy Shop"]);
  assert.deepEqual(status.unavailable, ["Quality", "First Part", "Second Part", "Standard Shop", "Interesting Customer"]);
  assert.equal(status.tables.poorShop.name, "poor");
});

test("Shop Generator settings render one drag target for each linked RollTable", () => {
  const html = renderShopGeneratorSetup([
    { key: "quality", label: "Quality", description: "Quality", uuid: "RollTable.quality", table: mockTable("quality", "Shop Quality") },
    { key: "firstPart", label: "First Part", description: "First", uuid: "RollTable.first", table: mockTable("first", "Shop First Parts") },
    { key: "secondPart", label: "Second Part", description: "Second", uuid: "RollTable.second", table: mockTable("second", "Shop Second Parts") },
    { key: "knownFor", label: "Known For", description: "Known For", uuid: "RollTable.known-for", table: mockTable("known-for", "Shop Known For") },
    { key: "poorShop", label: "Poor Shop", description: "Poor", uuid: "RollTable.poor", table: mockTable("poor", "Poor Shops") },
    { key: "standardShop", label: "Standard Shop", description: "Standard", uuid: "", table: null },
    { key: "wealthyShop", label: "Wealthy Shop", description: "Wealthy", uuid: "RollTable.wealthy", table: mockTable("wealthy", "Wealthy Shops") },
    { key: "customer", label: "Interesting Customer", description: "Customer", uuid: "RollTable.customer", table: mockTable("customer", "Customers") },
  ]);

  assert.equal((html.match(/data-mk-shop-generator-slot=/g) ?? []).length, 8);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 8);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /Shop Quality/);
  assert.match(html, /Shop First Parts/);
  assert.match(html, /Shop Second Parts/);
  assert.match(html, /Shop Known For/);
  assert.match(html, /Poor Shops/);
  assert.match(html, /Wealthy Shops/);
  assert.match(html, /Customers/);
  assert.match(html, /Drop RollTable here/);
  assert.match(html, /data-mk-shop-generator-clear/);
});

test("Shop Generator settings use a title, description, and table grid", () => {
  const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-rolltable-assignment.css", import.meta.url), "utf8");

  assert.match(stylesheet, /\.mk-gm-rolltable-assignment-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(115px, \.7fr\) minmax\(220px, 1\.25fr\) minmax\(230px, 1\.4fr\)/);
  assert.match(stylesheet, /\.mk-gm-rolltable-assignment-title\s*\{[\s\S]*grid-column:\s*1/);
  assert.match(stylesheet, /\.mk-gm-rolltable-assignment-description\s*\{[\s\S]*grid-column:\s*2/);
  assert.match(stylesheet, /\.mk-gm-rolltable-assignment-table\s*\{[\s\S]*grid-column:\s*3[\s\S]*min-height:\s*42px/);
});

test("Shop Generator assignments read, write, and resolve the active Scene tables", async () => {
  let stored = {
    quality: "RollTable.quality",
    firstPart: "RollTable.first",
    secondPart: "",
    knownFor: "",
    poorShop: "RollTable.poor",
    standardShop: "",
    wealthyShop: "",
    customer: "",
  };
  const scene = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, SHOP_GENERATOR_TABLE_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, SHOP_GENERATOR_TABLE_FLAG);
      stored = value;
    },
  };

  assert.deepEqual(getSceneShopGeneratorTables(scene), {
    schema: 3,
    quality: "RollTable.quality",
    firstPart: "RollTable.first",
    secondPart: "",
    knownFor: "",
    poorShop: "RollTable.poor",
    standardShop: "",
    wealthyShop: "",
    customer: "",
  });
  await setSceneShopGeneratorTable("knownFor", "RollTable.known-for", scene, { user: { isGM: true } });
  assert.equal(stored.knownFor, "RollTable.known-for");

  const entries = await resolveShopGeneratorEntries(scene, [
    mockTable("quality", "Quality"),
    mockTable("first", "First"),
    mockTable("poor", "Poor"),
    mockTable("known-for", "Known For"),
  ]);
  assert.deepEqual(entries.map(entry => entry.table?.name ?? ""), ["Quality", "First", "", "Known For", "Poor", "", "", ""]);
});
