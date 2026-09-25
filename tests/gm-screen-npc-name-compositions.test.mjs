import assert from "node:assert/strict";
import test from "node:test";

import {
  NPC_NAME_COMPOSITION_FLAG,
  NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
  NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE,
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
  normalizeNpcNameComposition,
  normalizeNpcTraitTables,
  npcNameCompositionStatus,
  npcTraitTableStatus,
  renderNpcNameCompositionSetup,
  renderNpcTraitTableSetup,
  rollNpcNameComposition,
  setSceneNpcNameCompositionChances,
  setSceneNpcNameCompositionTable,
  setSceneNpcTraitTable,
} from "../scripts/gm-screen/npc-name-compositions.js";

function compositionTable(id, name, text) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    documentName: "RollTable",
    results: [{ text }],
  };
}

test("NPC name composition normalizes ordered assignments and second/third syllable chances", () => {
  assert.deepEqual(normalizeNpcNameComposition({
    prefix: { uuid: "RollTable.prefix" },
    syllables: "RollTable.syllables",
    suffix: "RollTable.suffix",
  }), {
    schema: 2,
    prefix: "RollTable.prefix",
    syllables: ["RollTable.syllables"],
    suffix: "RollTable.suffix",
    identifier: "",
    secondSyllableChance: NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
    thirdSyllableChance: NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE,
  });

  assert.deepEqual(normalizeNpcNameComposition({ twoSyllableChance: 125 }), {
    schema: 2,
    prefix: "",
    syllables: [],
    suffix: "",
    identifier: "",
    secondSyllableChance: 100,
    thirdSyllableChance: 0,
  });
  assert.equal(normalizeNpcNameComposition({ secondSyllableChance: 40, thirdSyllableChance: 80 }).thirdSyllableChance, 60);
});

test("NPC name composition assignments are stored on the active Scene", async () => {
  let stored = null;
  const scene = {
    getFlag: () => stored,
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, NPC_NAME_COMPOSITION_FLAG);
      stored = value;
    },
  };

  await setSceneNpcNameCompositionTable("prefix", "RollTable.prefix", scene, {
    user: { isGM: true },
  });
  await setSceneNpcNameCompositionTable("syllables", "RollTable.syllables", scene, {
    user: { isGM: true },
  });
  await setSceneNpcNameCompositionTable("syllables", "RollTable.syllables-2", scene, {
    user: { isGM: true },
  });
  await setSceneNpcNameCompositionTable("suffix", "RollTable.suffix", scene, {
    user: { isGM: true },
  });
  await setSceneNpcNameCompositionTable("identifier", "RollTable.identifier", scene, {
    user: { isGM: true },
  });
  await setSceneNpcNameCompositionChances(75, 20, scene, {
    user: { isGM: true },
  });

  assert.deepEqual(getSceneNpcNameComposition(scene), {
    schema: 2,
    prefix: "RollTable.prefix",
    syllables: ["RollTable.syllables", "RollTable.syllables-2"],
    suffix: "RollTable.suffix",
    identifier: "RollTable.identifier",
    secondSyllableChance: 75,
    thirdSyllableChance: 20,
  });

  await setSceneNpcNameCompositionTable("syllables", "RollTable.syllables-replaced", scene, {
    user: { isGM: true },
    index: 0,
    replace: true,
  });
  assert.deepEqual(getSceneNpcNameComposition(scene).syllables, [
    "RollTable.syllables-replaced",
    "RollTable.syllables-2",
  ]);

  await setSceneNpcNameCompositionTable("syllables", "", scene, {
    user: { isGM: true },
    index: 0,
  });
  assert.deepEqual(getSceneNpcNameComposition(scene).syllables, ["RollTable.syllables-2"]);
});

test("NPC name composition rolls Prefix, Possible Syllables, and Suffix in order", async () => {
  const tables = [
    compositionTable("prefix", "Prefix Table", "Ka"),
    compositionTable("syllables", "Syllables Table", "ra"),
    compositionTable("suffix", "Suffix Table", "th"),
  ];
  const calls = [];
  const result = await rollNpcNameComposition({
    prefix: tables[0].uuid,
    syllables: tables[1].uuid,
    suffix: tables[2].uuid,
  }, {
    tables,
    rollDie: async formula => (formula === "1d100" ? 100 : 1),
    rollTable: async table => {
      calls.push(table.uuid);
      return { total: 1, result: table.results[0] };
    },
  });

  assert.deepEqual(calls, tables.map(table => table.uuid));
  assert.equal(result.name, "Karath");
  assert.deepEqual(result.parts, {
    prefix: "Ka",
    syllables: "ra",
    suffix: "th",
    identifier: "",
  });
  assert.deepEqual(result.syllableParts, ["ra"]);
  assert.equal(result.rolls.syllableCountRoll, 100);
  assert.equal(result.rolls.syllableCount, 1);
});

test("NPC name composition rolls an assigned identifier after the composed name", async () => {
  const tables = [
    compositionTable("prefix", "Prefix Table", "Ka"),
    compositionTable("syllables", "Syllables Table", "ra"),
    compositionTable("suffix", "Suffix Table", "th"),
    compositionTable("identifier", "Identifier Table", " the Swift"),
  ];
  const calls = [];
  const result = await rollNpcNameComposition({
    prefix: tables[0].uuid,
    syllables: tables[1].uuid,
    suffix: tables[2].uuid,
    identifier: tables[3].uuid,
    secondSyllableChance: 0,
    thirdSyllableChance: 0,
  }, {
    tables,
    rollDie: async () => 100,
    rollTable: async table => {
      calls.push(table.uuid);
      return { total: 1, result: table.results[0] };
    },
  });

  assert.deepEqual(calls, tables.map(table => table.uuid));
  assert.equal(result.name, "Karath the Swift");
  assert.equal(result.identifier, "the Swift");
  assert.equal(result.parts.identifier, "the Swift");
  assert.equal(result.rolls.identifier, 1);
  assert.equal(result.sources.identifier.tableName, "Identifier Table");
});

test("NPC name composition can roll two syllables and select among multiple syllable tables", async () => {
  const tables = [
    compositionTable("prefix", "Prefix Table", "Ka"),
    compositionTable("syllables-a", "Syllables A", "ra"),
    compositionTable("syllables-b", "Syllables B", "th"),
    compositionTable("suffix", "Suffix Table", "n"),
  ];
  const formulas = [];
  let selection = 0;
  const result = await rollNpcNameComposition({
    prefix: tables[0].uuid,
    syllables: [tables[1].uuid, tables[2].uuid],
    suffix: tables[3].uuid,
    secondSyllableChance: 100,
    thirdSyllableChance: 0,
  }, {
    tables,
    rollDie: async formula => {
      formulas.push(formula);
      if (formula === "1d100") return 1;
      selection += 1;
      return selection;
    },
    rollTable: async table => ({ total: 1, result: table.results[0] }),
  });

  assert.equal(result.name, "Karathn");
  assert.deepEqual(result.syllableParts, ["ra", "th"]);
  assert.deepEqual(formulas, ["1d100", "1d2", "1d2"]);
  assert.deepEqual(result.rolls.syllableTableSelections.map(selection => selection.index), [1, 2]);
  assert.deepEqual(result.sources.syllables.map(source => source.tableName), ["Syllables A", "Syllables B"]);
});

test("NPC name composition can roll a third syllable using the third-syllable chance", async () => {
  const tables = [
    compositionTable("prefix", "Prefix Table", "Ka"),
    compositionTable("syllables", "Syllables Table", "ra"),
    compositionTable("suffix", "Suffix Table", "n"),
  ];
  const formulas = [];
  const result = await rollNpcNameComposition({
    prefix: tables[0].uuid,
    syllables: [tables[1].uuid],
    suffix: tables[2].uuid,
    secondSyllableChance: 0,
    thirdSyllableChance: 100,
  }, {
    tables,
    rollDie: async formula => {
      formulas.push(formula);
      return 1;
    },
    rollTable: async table => ({ total: 1, result: table.results[0] }),
  });

  assert.equal(result.name, "Karararan");
  assert.equal(result.rolls.syllableCount, 3);
  assert.equal(result.rolls.secondSyllableChance, 0);
  assert.equal(result.rolls.thirdSyllableChance, 100);
  assert.deepEqual(formulas, ["1d100"]);
});

test("NPC name composition setup renders the drop boxes with the composition order", () => {
  const html = renderNpcNameCompositionSetup([
    { key: "prefix", label: "Prefix", uuid: "RollTable.prefix", table: { name: "Prefix Table" } },
    {
      key: "syllables",
      label: "Possible Syllables",
      uuids: ["RollTable.syllables-a", "RollTable.syllables-b"],
      tables: [{ name: "Syllables A" }, { name: "Syllables B" }],
    },
    { key: "suffix", label: "Suffix", uuid: "RollTable.suffix", table: { name: "Suffix Table" } },
    { key: "identifier", label: "NPC Identifier", uuid: "", table: null },
  ], { secondSyllableChance: 33, thirdSyllableChance: 33 });

  assert.match(html, /data-mk-npc-name-composition/);
  assert.match(html, /Prefix Table/);
  assert.match(html, /Possible Syllables/);
  assert.match(html, /Syllables A/);
  assert.match(html, /Syllables B/);
  assert.equal((html.match(/data-mk-npc-name-composition-slot="syllables"/g) ?? []).length, 2);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 5);
  assert.match(html, /Possible Syllables 1/);
  assert.match(html, /Possible Syllables 2/);
  assert.match(html, /data-mk-npc-name-composition-multiple/);
  assert.match(html, /data-mk-npc-name-composition-second-syllable-chance/);
  assert.match(html, /data-mk-npc-name-composition-third-syllable-chance/);
  assert.match(html, /value="33"/);
  assert.match(html, /Suffix Table/);
  assert.match(html, /NPC Identifier/);
  assert.match(html, /Prefix \+ Possible Syllables \+ Suffix/);
});

test("NPC name composition status reports missing and unavailable tables", () => {
  const status = npcNameCompositionStatus({ prefix: "RollTable.prefix" }, [
    compositionTable("prefix", "Prefix Table", "Ka"),
  ]);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Possible Syllables", "Suffix"]);

  const unavailable = npcNameCompositionStatus({
    prefix: "RollTable.missing",
    syllables: ["RollTable.syllables"],
    suffix: "RollTable.suffix",
  }, []);
  assert.deepEqual(unavailable.unavailable, ["Prefix", "Possible Syllables", "Suffix"]);
});

test("NPC trait assignments normalize, persist, and support multiple feature tables", async () => {
  assert.deepEqual(normalizeNpcTraitTables({
    ancestry: { uuid: "RollTable.ancestry" },
    features: "RollTable.feature-a",
  }), {
    schema: 1,
    ancestry: "RollTable.ancestry",
    age: "",
    alignment: "",
    wealth: "",
    features: ["RollTable.feature-a"],
    occupation: "",
  });

  let stored = null;
  const scene = {
    getFlag: () => stored,
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, "npcTraitTables");
      stored = value;
    },
  };
  const user = { isGM: true };
  await setSceneNpcTraitTable("ancestry", "RollTable.ancestry", scene, { user });
  await setSceneNpcTraitTable("features", "RollTable.feature-a", scene, { user });
  await setSceneNpcTraitTable("features", "RollTable.feature-b", scene, { user });
  await setSceneNpcTraitTable("occupation", "RollTable.occupation", scene, { user });

  assert.deepEqual(getSceneNpcTraitTables(scene).features, ["RollTable.feature-a", "RollTable.feature-b"]);
  const status = npcTraitTableStatus(getSceneNpcTraitTables(scene), [
    compositionTable("ancestry", "Ancestry", "Goblin"),
    compositionTable("feature-a", "Feature A", "Alert"),
    compositionTable("feature-b", "Feature B", "Scarred"),
    compositionTable("occupation", "Occupation", "Scout"),
  ]);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Age", "Alignment", "Wealth"]);
});

test("NPC trait setup renders single trait boxes and a multi-table feature box", () => {
  const html = renderNpcTraitTableSetup([
    { key: "ancestry", label: "Ancestry", uuid: "RollTable.ancestry", table: { name: "Ancestry Table" } },
    { key: "age", label: "Age", uuid: "", table: null },
    { key: "alignment", label: "Alignment", uuid: "", table: null },
    { key: "wealth", label: "Wealth", uuid: "", table: null },
    {
      key: "features",
      label: "NPC Features",
      uuids: ["RollTable.feature-a", "RollTable.feature-b"],
      tables: [{ name: "Feature A" }, { name: "Feature B" }],
    },
    { key: "occupation", label: "Occupation", uuid: "", table: null },
  ]);

  assert.match(html, /data-mk-npc-trait-tables/);
  assert.match(html, /Ancestry Table/);
  assert.match(html, /Feature A/);
  assert.match(html, /Feature B/);
  assert.equal((html.match(/data-mk-npc-trait-slot="features"/g) ?? []).length, 3);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 8);
  assert.match(html, /NPC Features 1/);
  assert.match(html, /NPC Features 2/);
  assert.match(html, /NPC Features 3/);
  assert.match(html, /data-mk-npc-trait-multiple/);
  assert.match(html, /NPC Features/);
  assert.match(html, /Occupation/);
});
