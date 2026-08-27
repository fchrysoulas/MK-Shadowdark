import assert from "node:assert/strict";
import test from "node:test";

import { parseSourceTables } from "../scripts/source-tables/parser.js";
import { parseSupportedSourceTables } from "../scripts/source-tables/source-parser.js";
import {
  splitCapitalPhrases,
  splitPossessiveProperNames,
  structureCoreDenseTable,
} from "../scripts/source-tables/core-structured-tables.js";
import {
  findCoreSettlementNameTable,
  findCoreSettlementTypeTable,
} from "../scripts/gm-screen/settlement-source-tables.js";

const SYNTHETIC_CORE = `
# Shadowdark RPG
<!-- PDF Page 137 -->
## Game Master
## Settlement Maps
#### SETTLEMENT NAME
d8 Village Town City/Metropolis
1 Alder's Rest Brookhaven Cindor
2 Stonefield Riverwatch King's Crown

<!-- PDF Page 138 -->
## Settlement Maps
#### TYPE
d6 Settlement Type Dice
1 Hamlet 2d4
2-6 Borough 3d6

<!-- PDF Page 129 -->
## NPCs
#### NPC QUALITIES
d20 Appearance Does Secret
1 Tall Whistles Owes someone
2 Scarred Hums Hides treasure
#### OCCUPATION
d4, d4 1 2 3 4
1 Baker Weaver Scribe Smith
2 Miner Sailor Cook Mason
3 Guard Brewer Potter Farmer
4 Hunter Carter Tanner Miller

<!-- PDF Page 132 -->
## NPC Names
#### NPC NAMES BY ANCESTRY
d20 Dwarf Elf Goblin Halfling Half-Orc Human
1 Ada Elen Grub Pip Rog Mira
2 Borin Fae Snip Dot Urk Jori
`;

function findByTitle(tables, title) {
  return tables.find(table => String(table.title).toLowerCase() === title.toLowerCase());
}

function asImportedRollTables(tables) {
  return tables.map(table => ({
    ...table,
    flags: {
      "mk-shadowdark": {
        sourceTable: {
          bookId: table.bookId,
          bookTitle: table.bookTitle,
          key: table.key,
          pages: [...(table.pages ?? [])],
          formulaRaw: table.formulaRaw,
          formula: table.formula,
          columns: [...(table.columns ?? [])],
          sourceKind: table.sourceKind,
          warnings: [...(table.warnings ?? [])],
        },
      },
    },
  }));
}

test("structured Core helper splits capital-led phrases without copying source values into code", () => {
  assert.deepEqual(splitCapitalPhrases("Tall Whistles Owes someone", 3), [
    "Tall",
    "Whistles",
    "Owes someone",
  ]);
  assert.equal(splitCapitalPhrases("ambiguous lowercase row", 3), null);
});

test("structured Core helper keeps possessive two-word proper names together", () => {
  assert.deepEqual(splitPossessiveProperNames("Alder's Rest Brookhaven Cindor", 3), [
    "Alder's Rest",
    "Brookhaven",
    "Cindor",
  ]);
  assert.deepEqual(splitPossessiveProperNames("Stonefield Riverwatch King's Crown", 3), [
    "Stonefield",
    "Riverwatch",
    "King's Crown",
  ]);
});

test("supported Core parser exposes separate Settlement Name and Type columns", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const names = findByTitle(parsed.tables, "SETTLEMENT NAME");
  const type = findByTitle(parsed.tables, "TYPE");

  assert.deepEqual(names.columns, ["d8", "Village", "Town", "City/Metropolis"]);
  assert.equal(names.results[0].text, "Village: Alder's Rest | Town: Brookhaven | City/Metropolis: Cindor");
  assert.equal(names.results[1].text, "Village: Stonefield | Town: Riverwatch | City/Metropolis: King's Crown");

  assert.deepEqual(type.columns, ["d6", "Settlement Type", "Dice"]);
  assert.equal(type.results[0].text, "Settlement Type: Hamlet | Dice: 2d4");
});

test("existing Settlement source resolver matches the actual imported RollTable flag shape", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const imported = asImportedRollTables(parsed.tables);
  assert.equal(findCoreSettlementNameTable(imported)?.title, "SETTLEMENT NAME");
  assert.equal(findCoreSettlementTypeTable(imported)?.title, "TYPE");
});

test("supported Core parser splits NPC Qualities into Appearance, Does, and Secret tables", () => {
  const parsed = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const appearance = findByTitle(parsed.tables, "APPEARANCE");
  const does = findByTitle(parsed.tables, "DOES");
  const secret = findByTitle(parsed.tables, "SECRET");
  const occupation = findByTitle(parsed.tables, "OCCUPATION");
  const names = findByTitle(parsed.tables, "NPC NAMES BY ANCESTRY");

  assert.deepEqual(appearance.columns, ["d20", "Appearance"]);
  assert.equal(appearance.results[0].text, "Tall");
  assert.deepEqual(does.columns, ["d20", "Does"]);
  assert.equal(does.results[0].text, "Whistles");
  assert.deepEqual(secret.columns, ["d20", "Secret"]);
  assert.equal(secret.results[0].text, "Owes someone");

  assert.deepEqual(occupation.columns, ["d4, d4", "1", "2", "3", "4"]);
  assert.equal(occupation.results[0].text, "1: Baker | 2: Weaver | 3: Scribe | 4: Smith");

  assert.deepEqual(names.columns, ["d20", "Dwarf", "Elf", "Goblin", "Halfling", "Half-Orc", "Human"]);
  assert.equal(names.results[0].text, "Dwarf: Ada | Elf: Elen | Goblin: Grub | Halfling: Pip | Half-Orc: Rog | Human: Mira");
});

test("structuring preserves stable source key assigned by the generic parser", () => {
  const raw = parseSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const structured = parseSupportedSourceTables(SYNTHETIC_CORE, { filename: "shadowdark-core-rules-v4-9.md" });
  const rawNames = findByTitle(raw.tables, "SETTLEMENT NAME");
  const structuredNames = findByTitle(structured.tables, "SETTLEMENT NAME");
  assert.equal(structuredNames.key, rawNames.key);
});

test("ambiguous rows are preserved and receive a warning instead of guessed field boundaries", () => {
  const table = {
    bookId: "shadowdark-core-v4.9",
    title: "NPC QUALITIES",
    formulaRaw: "d20",
    columns: ["d20", "Appearance Does Secret"],
    results: [{ raw: "1", low: 1, high: 1, text: "all lowercase words here" }],
    warnings: [],
  };
  const structured = structureCoreDenseTable(table);
  assert.equal(structured.results[0].text, "all lowercase words here");
  assert.ok(structured.warnings.some(warning => warning.includes("Could not split source row 1")));
});
