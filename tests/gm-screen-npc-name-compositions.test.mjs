import assert from "node:assert/strict";
import test from "node:test";

import {
  NPC_NAME_COMPOSITION_FLAG,
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
  normalizeNpcNameComposition,
  normalizeNpcTraitTables,
  npcNameCompositionStatus,
  npcTraitTableStatus,
  renderNpcNameCompositionSetup,
  renderNpcTraitTableSetup,
  rollNpcNameComposition,
  setSceneNpcNameCompositionChance,
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

test("NPC name composition normalizes ordered assignments, legacy scalar syllables, and chance", () => {
  assert.deepEqual(normalizeNpcNameComposition({
    prefix: { uuid: "RollTable.prefix" },
    syllables: "RollTable.syllables",
    suffix: "RollTable.suffix",
  }), {
    schema: 1,
    prefix: "RollTable.prefix",
    syllables: ["RollTable.syllables"],
    suffix: "RollTable.suffix",
    identifier: "",
    twoSyllableChance: 50,
  });

  assert.equal(normalizeNpcNameComposition({ twoSyllableChance: 125 }).twoSyllableChance, 100);
  assert.equal(normalizeNpcNameComposition({ twoSyllableChance: -20 }).twoSyllableChance, 0);
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
  await setSceneNpcNameCompositionChance(75, scene, {
    user: { isGM: true },
  });

  assert.deepEqual(getSceneNpcNameComposition(scene), {
    schema: 1,
    prefix: "RollTable.prefix",
    syllables: ["RollTable.syllables", "RollTable.syllables-2"],
    suffix: "RollTable.suffix",
    identifier: "RollTable.identifier",
    twoSyllableChance: 75,
  });

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
    twoSyllableChance: 0,
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
    twoSyllableChance: 100,
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
  ], { twoSyllableChance: 65 });

  assert.match(html, /data-mk-npc-name-composition/);
  assert.match(html, /Prefix Table/);
  assert.match(html, /Possible Syllables/);
  assert.match(html, /Syllables A/);
  assert.match(html, /Syllables B/);
  assert.match(html, /data-mk-npc-name-composition-multiple/);
  assert.match(html, /data-mk-npc-name-composition-two-syllable-chance/);
  assert.match(html, /value="65"/);
  assert.match(html, /Drop another RollTable/);
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
  assert.match(html, /data-mk-npc-trait-multiple/);
  assert.match(html, /NPC Features/);
  assert.match(html, /Occupation/);
});
