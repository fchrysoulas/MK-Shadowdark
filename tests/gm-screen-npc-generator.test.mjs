import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  findNpcAlignmentTable,
  findNpcAncestryTable,
  findNpcNamesTable,
  findNpcOccupationTable,
  findNpcQualitiesTable,
  nameFieldForAncestry,
  npcSourceStatus,
  rollNpcProfileFromSource,
} from "../scripts/gm-screen/npc-source-tables.js";
import {
  NPC_PROFILE_ITEM_TYPE,
  buildNpcActorData,
  buildNpcProfileItemData,
  createNpcActor,
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
  const qualities = table({
    id: "npc-qualities",
    name: "Game Master — NPCs — NPC QUALITIES",
    formula: "1d20",
    columns: ["d20", "Appearance", "Does", "Secret"],
    results: [{ range: [1, 20], text: "Appearance: Striking | Does: Hums | Secret: Owes a favor" }],
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
  return [ancestry, alignment, age, wealth, qualities, occupation, names];
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
  assert.equal(findNpcQualitiesTable(mixed)?.id, "npc-qualities");
  assert.equal(findNpcOccupationTable(mixed)?.id, "npc-occupation");
  assert.equal(findNpcNamesTable(mixed)?.id, "npc-names");
});

test("NPC source status requires all seven Core NPC/name tables", () => {
  const tables = syntheticNpcTables();
  assert.equal(npcSourceStatus(tables).available, true);
  const missingNames = tables.filter(entry => entry.id !== "npc-names");
  const status = npcSourceStatus(missingNames);
  assert.equal(status.available, false);
  assert.ok(status.missing.includes("NPC Names By Ancestry"));
});

test("ancestry selects the matching ancestry-specific name column", () => {
  assert.equal(nameFieldForAncestry("Dwarf"), "Dwarf");
  assert.equal(nameFieldForAncestry("Half-orc"), "Half-Orc");
  assert.equal(nameFieldForAncestry("Human"), "Human");
  assert.equal(nameFieldForAncestry("Unknown"), "");
});

test("Core NPC generation keeps qualities on one d20 row and resolves occupation with two independent d4s", async () => {
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
  assert.equal(profile.rolls.qualities, 13);
  assert.equal(profile.rolls.occupationRow, 3);
  assert.equal(profile.rolls.occupationColumn, 4);
  assert.equal(profile.occupation, "Job 3D");
  assert.equal(profile.rolls.name, 9);
});

test("generated profile uses native Shadowdark NPC Feature with native description/source fields", () => {
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
  const item = buildNpcProfileItemData(profile);
  assert.equal(NPC_PROFILE_ITEM_TYPE, "NPC Feature");
  assert.equal(item.type, "NPC Feature");
  assert.equal(item.name, "NPC Profile");
  assert.equal(item.system.source.title, CORE_BOOK_TITLE);
  assert.match(item.system.description, /Dwarf/);
  assert.match(item.system.description, /Job 3D/);
  assert.match(item.system.description, /PDF p\. 128, 129, 132/);
  assert.equal(buildNpcActorData("Daro").type, "NPC");
  assert.match(npcProfileDescription(profile), /Appearance/);
});

test("Actor creation embeds exactly one native NPC Profile feature before opening sheet", async () => {
  const previousActor = globalThis.Actor;
  let actorData = null;
  let embedded = null;
  let rendered = false;
  try {
    globalThis.Actor = {
      implementation: {
        async create(data) {
          actorData = data;
          return {
            async createEmbeddedDocuments(type, documents) { embedded = { type, documents }; },
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
    assert.deepEqual(actorData, { name: "Synthetic NPC", type: "NPC" });
    assert.equal(embedded.type, "Item");
    assert.equal(embedded.documents.length, 1);
    assert.equal(embedded.documents[0].type, "NPC Feature");
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

test("source NPC controller loads after original Exploration creation controller", () => {
  const base = manifest.esmodules.indexOf("scripts/gm-screen/exploration-creation-controls.js");
  const sourceNpc = manifest.esmodules.indexOf("scripts/gm-screen/npc-creation-controls.js");
  assert.ok(base >= 0);
  assert.ok(sourceNpc > base);
});
