import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  findNpcAlignmentTable,
  findNpcAppearanceTable,
  findNpcAncestryTable,
  findNpcDoesTable,
  findNpcNamesTable,
  findNpcOccupationTable,
  findNpcSecretTable,
  nameFieldForAncestry,
  npcSourceStatus,
  occupationMatrixColumn,
  rollNpcProfileFromSource,
} from "../scripts/gm-screen/npc-source-tables.js";
import {
  buildNpcActorData,
  createNpcActor,
  npcGeneratorDialogContent,
  npcProfileDescription,
} from "../scripts/gm-screen/npc-generator.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const generatorRuntime = fs.readFileSync(new URL("../scripts/gm-screen/npc-generator.js", import.meta.url), "utf8");
const sourceRuntime = fs.readFileSync(new URL("../scripts/gm-screen/npc-source-tables.js", import.meta.url), "utf8");

function flag(columns, pages) {
  return {
    bookId: CORE_BOOK_ID,
    bookTitle: CORE_BOOK_TITLE,
    key: `${CORE_BOOK_ID}:${pages[0]}:${columns.join("-")}`,
    pages,
    columns,
  };
}

function table({ id, name, formula, columns, results, totals = [], pages = [128] }) {
  let index = 0;
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula,
    results: results.map((entry, entryIndex) => ({ id: `${id}-${entryIndex}`, ...entry })),
    flags: { "mk-shadowdark": { sourceTable: flag(columns, pages) } },
    getFlag(moduleId, key) { return this.flags?.[moduleId]?.[key]; },
    async roll() {
      const total = totals[index++] ?? totals.at(-1) ?? 1;
      const result = this.results.find(entry => total >= entry.range[0] && total <= entry.range[1]);
      return { roll: { total }, results: result ? [result] : [] };
    },
  };
}

function syntheticNpcTables() {
  const ancestry = table({
    id: "npc-ancestry",
    name: "Game Master — NPCs — ANCESTRY",
    formula: "1d12",
    columns: ["d12", "Ancestry"],
    results: [
      { range: [1, 4], text: "Human" },
      { range: [5, 6], text: "Elf" },
      { range: [7, 8], text: "Dwarf" },
      { range: [9, 10], text: "Halfling" },
      { range: [11, 11], text: "Half-orc" },
      { range: [12, 12], text: "Goblin" },
    ],
    totals: [7],
  });
  const alignment = table({
    id: "npc-alignment",
    name: "Game Master — NPCs — ALIGNMENT",
    formula: "1d6",
    columns: ["d6", "Alignment"],
    results: [
      { range: [1, 3], text: "Lawful" },
      { range: [4, 4], text: "Neutral" },
      { range: [5, 6], text: "Chaotic" },
    ],
    totals: [4],
  });
  const age = table({
    id: "npc-age",
    name: "Game Master — NPCs — AGE",
    formula: "1d8",
    columns: ["d8", "Age"],
    results: [{ range: [1, 8], text: "Synthetic Age" }],
    totals: [6],
  });
  const wealth = table({
    id: "npc-wealth",
    name: "Game Master — NPCs — WEALTH",
    formula: "1d6",
    columns: ["d6", "Wealth"],
    results: [{ range: [1, 6], text: "Synthetic Wealth" }],
    totals: [5],
  });
  const appearance = table({
    id: "npc-appearance",
    name: "Game Master — NPCs — APPEARANCE",
    formula: "1d20",
    columns: ["d20", "Appearance"],
    results: [{ range: [1, 20], text: "Striking" }],
    totals: [13],
    pages: [129],
  });
  const does = table({
    id: "npc-does",
    name: "Game Master — NPCs — DOES",
    formula: "1d20",
    columns: ["d20", "Does"],
    results: [{ range: [1, 20], text: "Hums" }],
    totals: [13],
    pages: [129],
  });
  const secret = table({
    id: "npc-secret",
    name: "Game Master — NPCs — SECRET",
    formula: "1d20",
    columns: ["d20", "Secret"],
    results: [{ range: [1, 20], text: "Owes a favor" }],
    totals: [13],
    pages: [129],
  });
  const occupation = table({
    id: "npc-occupation",
    name: "Game Master — NPCs — OCCUPATION",
    formula: "1d4",
    columns: ["d4, d4", "1", "2", "3", "4"],
    results: [
      { range: [1, 1], text: "1: Job 1A | 2: Job 1B | 3: Job 1C | 4: Job 1D" },
      { range: [2, 2], text: "1: Job 2A | 2: Job 2B | 3: Job 2C | 4: Job 2D" },
      { range: [3, 3], text: "1: Job 3A | 2: Job 3B | 3: Job 3C | 4: Job 3D" },
      { range: [4, 4], text: "1: Job 4A | 2: Job 4B | 3: Job 4C | 4: Job 4D" },
    ],
    totals: [3],
    pages: [129],
  });
  const names = table({
    id: "npc-names",
    name: "Game Master — NPC Names — NPC NAMES BY ANCESTRY",
    formula: "1d20",
    columns: ["d20", "Dwarf", "Elf", "Goblin", "Halfling", "Half-Orc", "Human"],
    results: [{ range: [1, 20], text: "Dwarf: Daro | Elf: Elar | Goblin: Gik | Halfling: Pella | Half-Orc: Ugra | Human: Mira" }],
    totals: [9],
    pages: [132],
  });
  return [ancestry, alignment, age, wealth, appearance, does, secret, occupation, names];
}

test("NPC source resolver selects NPC-scoped Ancestry and Alignment instead of rival crawler tables", () => {
  const tables = syntheticNpcTables();
  const rivalAncestry = {
    ...tables[0],
    id: "rival-ancestry",
    name: "Game Master — Rival Crawlers — ANCESTRY",
  };
  const rivalAlignment = {
    ...tables[1],
    id: "rival-alignment",
    name: "Game Master — Rival Crawlers — ALIGNMENT",
  };
  const mixed = [rivalAncestry, rivalAlignment, ...tables];
  assert.equal(findNpcAncestryTable(mixed)?.id, "npc-ancestry");
  assert.equal(findNpcAlignmentTable(mixed)?.id, "npc-alignment");
  assert.equal(findNpcAppearanceTable(mixed)?.id, "npc-appearance");
  assert.equal(findNpcDoesTable(mixed)?.id, "npc-does");
  assert.equal(findNpcSecretTable(mixed)?.id, "npc-secret");
  assert.equal(findNpcOccupationTable(mixed)?.id, "npc-occupation");
  assert.equal(findNpcNamesTable(mixed)?.id, "npc-names");
});

test("NPC source status requires all Core NPC/name tables, including split qualities", () => {
  const tables = syntheticNpcTables();
  assert.equal(npcSourceStatus(tables).available, true);
  const missingNames = tables.filter(entry => entry.id !== "npc-names");
  const status = npcSourceStatus(missingNames);
  assert.equal(status.available, false);
  assert.ok(status.missing.includes("NPC Names By Ancestry"));
  const missingSecret = tables.filter(entry => entry.id !== "npc-secret");
  const secretStatus = npcSourceStatus(missingSecret);
  assert.ok(secretStatus.missing.includes("NPC Secret"));
  assert.ok(secretStatus.missingTables.includes("NPCs — Secret"));
});

test("NPC source status honors value-specific table selections", () => {
  const tables = syntheticNpcTables();
  const customAncestry = {
    ...tables[0],
    id: "custom-ancestry",
    uuid: "RollTable.custom-ancestry",
  };
  const status = npcSourceStatus([customAncestry, ...tables], {
    tableUuids: { ancestry: customAncestry.uuid },
  });

  assert.equal(status.available, true);
  assert.equal(status.tables.ancestry, customAncestry);
  assert.equal(status.tables.fieldTables.appearance, tables[4]);
});

test("ancestry selects the matching ancestry-specific name column", () => {
  assert.equal(nameFieldForAncestry("Dwarf"), "Dwarf");
  assert.equal(nameFieldForAncestry("Half-orc"), "Half-Orc");
  assert.equal(nameFieldForAncestry("Human"), "Human");
  assert.equal(nameFieldForAncestry("Unknown"), "");
});

test("Core NPC generation rolls split qualities independently and resolves occupation with two independent d4s", async () => {
  const tables = syntheticNpcTables();
  const profile = await rollNpcProfileFromSource({
    tables,
    rollOccupationColumn: async () => 4,
  });
  assert.equal(profile.ancestry, "Dwarf");
  assert.equal(profile.name, "Daro");
  assert.equal(profile.appearance, "Striking");
  assert.equal(profile.does, "Hums");
  assert.equal(profile.secret, "Owes a favor");
  assert.equal(profile.rolls.appearance, 13);
  assert.equal(profile.rolls.does, 13);
  assert.equal(profile.rolls.secret, 13);
  assert.equal(profile.rolls.occupationRow, 3);
  assert.equal(profile.rolls.occupationColumn, 4);
  assert.equal(profile.occupation, "Job 3D");
  assert.equal(profile.rolls.name, 9);
});

test("NPC generation resolves flattened occupation matrix results", async () => {
  const tables = syntheticNpcTables();
  const occupation = tables.find(entry => entry.id === "npc-occupation");
  occupation.results = [{
    id: "occupation-14",
    range: [14, 14],
    description: "Blacksmith",
    flags: {
      "mk-shadowdark": {
        occupationMatrix: { row: 1, column: 4, coordinate: 14, formula: "d4, d4" },
      },
    },
  }];
  occupation.roll = async () => ({
    roll: { total: 14 },
    results: [occupation.results[0]],
  });
  assert.equal(occupationMatrixColumn(occupation.results[0]), 4);

  const profile = await rollNpcProfileFromSource({
    tables,
    rollOccupationColumn: async () => {
      throw new Error("The flattened matrix should provide its own occupation column.");
    },
  });

  assert.equal(profile.occupation, "Blacksmith");
  assert.equal(profile.rolls.occupationColumn, 4);
});

test("generated profile formats result values one per line without roll or source metadata", () => {
  const profile = {
    name: "Daro",
    ancestry: "Dwarf",
    alignment: "Neutral",
    age: "Synthetic Age",
    wealth: "Synthetic Wealth",
    appearance: "Striking",
    does: "Hums",
    secret: "Owes a favor",
    occupation: "Job 3D",
    sourceBookTitle: CORE_BOOK_TITLE,
    rolls: { ancestry: 7, alignment: 4, age: 6, wealth: 5, qualities: 13, occupationRow: 3, occupationColumn: 4, name: 9 },
    sources: {
      ancestry: { pages: [128] },
      qualities: { pages: [129] },
      names: { pages: [132] },
    },
  };
  const description = npcProfileDescription(profile);
  assert.match(description, /Ancestry:<\/strong> Dwarf/);
  assert.match(description, /Occupation:<\/strong> Job 3D/);
  assert.doesNotMatch(description, /d12|d6|d8|d20|PDF|Shadowdark RPG Core Rulebook|>7<|>13</);
  const dialog = npcGeneratorDialogContent(profile);
  assert.match(dialog, /<dt>Ancestry<\/dt><dd>Dwarf<\/dd>/);
  assert.doesNotMatch(dialog, /d12|d6|d8|d20|PDF|Shadowdark RPG Core Rulebook|>7<|>13</);
  assert.equal(buildNpcActorData("Daro").type, "NPC");
  assert.match(npcProfileDescription(profile), /Appearance/);
});

test("Actor creation stores the generated profile on Description before opening the sheet", async () => {
  const previousActor = globalThis.Actor;
  let actorData = null;
  let rendered = false;
  try {
    globalThis.Actor = {
      implementation: {
        async create(data) {
          actorData = data;
          return {
            sheet: { render(force) { rendered = force; } },
          };
        },
      },
    };
    const actor = await createNpcActor({
      name: "Synthetic NPC",
      profile: {
        name: "Synthetic NPC",
        ancestry: "Human",
        alignment: "Lawful",
        age: "Adult",
        wealth: "Standard",
        appearance: "Plain",
        does: "Nods",
        secret: "Test secret",
        occupation: "Test job",
        sourceBookTitle: CORE_BOOK_TITLE,
        rolls: { ancestry: 1, alignment: 1, age: 1, wealth: 1, qualities: 1, occupationRow: 1, occupationColumn: 1, name: 1 },
        sources: {},
      },
    });
    assert.ok(actor);
    assert.equal(actorData.name, "Synthetic NPC");
    assert.equal(actorData.type, "NPC");
    assert.match(actorData.system.notes, /Ancestry:<\/strong> Human/);
    assert.doesNotMatch(actorData.system.notes, /d20|PDF|Shadowdark RPG Core Rulebook/);
    assert.equal(rendered, true);
  } finally {
    globalThis.Actor = previousActor;
  }
});

test("NPC generator runtime contains no copied Core NPC result arrays", () => {
  assert.doesNotMatch(generatorRuntime, /Balding|Gravedigger|Hiding a fugitive/);
  assert.doesNotMatch(sourceRuntime, /Balding|Gravedigger|Hiding a fugitive/);
  assert.match(sourceRuntime, /rollNpcProfileFromSource/);
  assert.match(generatorRuntime, /Create Blank NPC/);
});

test("NPC creation has no macro or module API surface", () => {
  assert.doesNotMatch(generatorRuntime, /module\.api\.npcGenerator|exposeNpcGeneratorApi|registerNpcGenerator/);
  assert.doesNotMatch(manifest.esmodules.join("\n"), /macros\/create-npc\.js/);
  assert.equal(fs.existsSync(new URL("../macros/create-npc.js", import.meta.url)), false);
});

test("source NPC creation controller is no longer loaded", () => {
  assert.equal(manifest.esmodules.indexOf("scripts/gm-screen/exploration-creation-controls.js"), -1);
  assert.equal(manifest.esmodules.indexOf("scripts/gm-screen/npc-creation-controls.js"), -1);
});
