import assert from "node:assert/strict";
import test from "node:test";

import {
  MONSTER_GENERATOR_TABLE_FLAG,
  MONSTER_GENERATOR_TABLE_KEYS,
  getSceneMonsterGeneratorTables,
  monsterGeneratorTableStatus,
  normalizeMonsterGeneratorTables,
  renderMonsterGeneratorSetup,
  resolveMonsterGeneratorEntries,
  setSceneMonsterGeneratorTable,
} from "../scripts/gm-screen/monster-generator-settings.js";

function mockTable(id, name = id) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    documentName: "RollTable",
    roll() {},
  };
}

test("Monster Generator assignments normalize to seven Scene-owned table slots", () => {
  assert.deepEqual(normalizeMonsterGeneratorTables({
    combat: { uuid: "RollTable.combat" },
    quality: "RollTable.quality",
    strength: "RollTable.strength",
    weakness: "RollTable.weakness",
    mutation_1: "RollTable.mutation-1",
    mutation2: "RollTable.mutation-2",
    mutation3: "RollTable.mutation-3",
  }), {
    schema: 1,
    combat: "RollTable.combat",
    quality: "RollTable.quality",
    strength: "RollTable.strength",
    weakness: "RollTable.weakness",
    mutation1: "RollTable.mutation-1",
    mutation2: "RollTable.mutation-2",
    mutation3: "RollTable.mutation-3",
  });
  assert.deepEqual(MONSTER_GENERATOR_TABLE_KEYS, [
    "combat",
    "quality",
    "strength",
    "weakness",
    "mutation1",
    "mutation2",
    "mutation3",
  ]);
});

test("Monster Generator status reports incomplete and unavailable linked assignments", () => {
  const status = monsterGeneratorTableStatus({
    combat: "RollTable.combat",
    quality: "RollTable.quality",
    strength: "RollTable.strength",
    weakness: "",
    mutation1: "RollTable.mutation-1",
    mutation2: "RollTable.mutation-2",
    mutation3: "",
  }, [mockTable("combat"), mockTable("quality"), mockTable("strength")]);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Weakness", "Mutation 3"]);
  assert.deepEqual(status.unavailable, ["Mutation 1", "Mutation 2"]);
  assert.equal(status.tables.combat.name, "combat");
});

test("Monster Generator settings render one Title | Description | RollTable row per assignment", () => {
  const html = renderMonsterGeneratorSetup(MONSTER_GENERATOR_TABLE_KEYS.map(key => ({
    key,
    label: key,
    description: `${key} description`,
    uuid: `RollTable.${key}`,
    table: mockTable(key, `${key} table`),
  })));

  assert.equal((html.match(/data-mk-monster-generator-slot=/g) ?? []).length, 7);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 7);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /combat table/);
  assert.match(html, /mutation1 table/);
  assert.match(html, /mutation3 table/);
  assert.match(html, /data-mk-monster-generator-clear/);
  assert.match(html, /requires all seven linked tables/);
});

test("Monster Generator assignments read, write, and resolve the active Scene tables", async () => {
  let stored = {
    combat: "RollTable.combat",
    quality: "RollTable.quality",
    strength: "RollTable.strength",
    weakness: "",
    mutation1: "RollTable.mutation-1",
    mutation2: "",
    mutation3: "",
  };
  const scene = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, MONSTER_GENERATOR_TABLE_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, MONSTER_GENERATOR_TABLE_FLAG);
      stored = value;
    },
  };

  assert.deepEqual(getSceneMonsterGeneratorTables(scene), {
    schema: 1,
    combat: "RollTable.combat",
    quality: "RollTable.quality",
    strength: "RollTable.strength",
    weakness: "",
    mutation1: "RollTable.mutation-1",
    mutation2: "",
    mutation3: "",
  });
  await setSceneMonsterGeneratorTable("weakness", "RollTable.weakness", scene, { user: { isGM: true } });
  assert.equal(stored.weakness, "RollTable.weakness");

  const entries = await resolveMonsterGeneratorEntries(scene, [
    mockTable("combat", "Combat"),
    mockTable("quality", "Quality"),
    mockTable("strength", "Strength"),
    mockTable("weakness", "Weakness"),
    mockTable("mutation-1", "Mutation 1"),
  ]);
  assert.deepEqual(entries.map(entry => entry.table?.name ?? ""), [
    "Combat",
    "Quality",
    "Strength",
    "Weakness",
    "Mutation 1",
    "",
    "",
  ]);
});
