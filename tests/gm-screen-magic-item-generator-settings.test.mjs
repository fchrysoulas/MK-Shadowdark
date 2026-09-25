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

test("Magic Item Generator assignments normalize to three Scene-owned table slots", () => {
  assert.deepEqual(normalizeMagicItemGeneratorTables({
    itemName: { uuid: "RollTable.name" },
    bonus: "RollTable.bonus",
    benefit: "RollTable.benefit",
    curse: "RollTable.curse",
    personality: "RollTable.personality",
  }), {
    schema: 2,
    type: "RollTable.name",
    qualities: "",
    personality: "RollTable.personality",
  });
  assert.deepEqual(MAGIC_ITEM_GENERATOR_TABLE_KEYS, ["type", "qualities", "personality"]);
});

test("Magic Item Generator status reports incomplete and unavailable linked assignments", () => {
  const status = magicItemGeneratorTableStatus({
    type: "RollTable.type",
    qualities: "",
    personality: "RollTable.personality",
  }, [mockTable("type")]);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Qualities"]);
  assert.deepEqual(status.unavailable, ["Personality"]);
  assert.equal(status.tables.type.name, "type");
});

test("Magic Item Generator settings render one Title | Description | RollTable row per assignment", () => {
  const html = renderMagicItemGeneratorSetup(MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(key => ({
    key,
    label: key,
    description: `${key} description`,
    uuid: `RollTable.${key}`,
    table: mockTable(key, `${key} table`),
  })));

  assert.equal((html.match(/data-mk-magic-item-generator-slot=/g) ?? []).length, 3);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 3);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /type table/);
  assert.match(html, /qualities table/);
  assert.match(html, /personality table/);
  assert.match(html, /data-mk-magic-item-generator-clear/);
  assert.match(html, /requires all three linked tables/);
});

test("Magic Item Generator assignments read, write, and resolve active Scene tables", async () => {
  let stored = {
    type: "RollTable.type",
    qualities: "",
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
    schema: 2,
    type: "RollTable.type",
    qualities: "",
    personality: "",
  });
  await setSceneMagicItemGeneratorTable("qualities", "RollTable.qualities", scene, { user: { isGM: true } });
  assert.equal(stored.qualities, "RollTable.qualities");

  const entries = await resolveMagicItemGeneratorEntries(scene, [
    mockTable("type", "Type"),
    mockTable("qualities", "Qualities"),
  ]);
  assert.deepEqual(entries.map(entry => entry.table?.name ?? ""), [
    "Type",
    "Qualities",
    "",
  ]);
});
