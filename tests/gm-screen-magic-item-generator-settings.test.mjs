import assert from "node:assert/strict";
import test from "node:test";

import {
  MAGIC_ITEM_GENERATOR_TABLE_FLAG,
  MAGIC_ITEM_GENERATOR_TABLE_KEYS,
  getSceneMagicItemGeneratorTables,
  magicItemGeneratorTableStatus,
  normalizeMagicItemGeneratorTables,
  renderMagicItemGeneratorSetup,
  resolveMagicItemGeneratorEntries,
  setSceneMagicItemGeneratorTable,
} from "../scripts/gm-screen/magic-item-generator-settings.js";

function mockTable(id, name = id) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    documentName: "RollTable",
    roll() {},
  };
}

test("Magic Item Generator assignments normalize to five Scene-owned table slots", () => {
  assert.deepEqual(normalizeMagicItemGeneratorTables({
    itemName: { uuid: "RollTable.name" },
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "RollTable.curse",
    personality: "RollTable.personality",
  }), {
    schema: 1,
    name: "RollTable.name",
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "RollTable.curse",
    personality: "RollTable.personality",
  });
  assert.deepEqual(MAGIC_ITEM_GENERATOR_TABLE_KEYS, ["name", "bonus", "benefit", "curse", "personality"]);
});

test("Magic Item Generator status reports incomplete and unavailable linked assignments", () => {
  const status = magicItemGeneratorTableStatus({
    name: "RollTable.name",
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "",
    personality: "RollTable.personality",
  }, [mockTable("name"), mockTable("benefit")]);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Curse"]);
  assert.deepEqual(status.unavailable, ["Bonus", "Personality"]);
  assert.equal(status.tables.name.name, "name");
});

test("Magic Item Generator settings render one Title | Description | RollTable row per assignment", () => {
  const html = renderMagicItemGeneratorSetup(MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(key => ({
    key,
    label: key,
    description: `${key} description`,
    uuid: `RollTable.${key}`,
    table: mockTable(key, `${key} table`),
  })));

  assert.equal((html.match(/data-mk-magic-item-generator-slot=/g) ?? []).length, 5);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 5);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /name table/);
  assert.match(html, /personality table/);
  assert.match(html, /data-mk-magic-item-generator-clear/);
  assert.match(html, /requires all five linked tables/);
});

test("Magic Item Generator assignments read, write, and resolve active Scene tables", async () => {
  let stored = {
    name: "RollTable.name",
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "",
    personality: "",
  };
  const scene = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, MAGIC_ITEM_GENERATOR_TABLE_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, MAGIC_ITEM_GENERATOR_TABLE_FLAG);
      stored = value;
    },
  };

  assert.deepEqual(getSceneMagicItemGeneratorTables(scene), {
    schema: 1,
    name: "RollTable.name",
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "",
    personality: "",
  });
  await setSceneMagicItemGeneratorTable("curse", "RollTable.curse", scene, { user: { isGM: true } });
  assert.equal(stored.curse, "RollTable.curse");

  const entries = await resolveMagicItemGeneratorEntries(scene, [
    mockTable("name", "Name"),
    mockTable("bonus", "Bonus"),
    mockTable("benefit", "Benefit"),
    mockTable("curse", "Curse"),
  ]);
  assert.deepEqual(entries.map(entry => entry.table?.name ?? ""), [
    "Name",
    "Bonus",
    "Benefit",
    "Curse",
    "",
  ]);
});
