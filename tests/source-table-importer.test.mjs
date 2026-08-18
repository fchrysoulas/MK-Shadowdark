import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCoreDenseTables,
  parseRangeToken,
  parseSourceTables,
  parseWesternMarkdownTables,
} from "../scripts/source-tables/parser.js";
import {
  buildTableResultData,
  importParsedSources,
} from "../scripts/source-tables/source-table-importer.js";

test("d100 treats 00 as 100", () => {
  assert.deepEqual(parseRangeToken("99-00", { percentile: true, max: 100 }), {
    low: 99, high: 100, open: false, raw: "99-00",
  });
});

test("Western parser handles parallel dice columns and malformed continuation header", () => {
  const source = `
# Player's Guide to the Western Reaches V1
<!-- PDF page 20 -->
# Synthetic Ancestry
### SYNTHETIC TRINKET
| d100 | Details | d100 | Details |
| --- | --- | --- | --- |
| 1-2 | Alpha | 51-52 | Beta |
| 3-4 | Gamma | 53-54 | Delta |

| 5-6 | Epsilon | 55-56 | Zeta |
| --- | --- | --- | --- |
| 7-8 | Eta | 57-58 | Theta |
`;
  const tables = parseWesternMarkdownTables(source);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].results.length, 8);
  assert.deepEqual(tables[0].pages, [20]);
  assert.ok(tables[0].warnings.some(warning => warning.includes("malformed Markdown continuation")));
});

test("Western parser preserves overlap anomalies instead of correcting them", () => {
  const source = `
# Player's Guide to the Western Reaches V1
<!-- PDF page 30 -->
# Synthetic
### RESULT
| d20 | Details |
| --- | --- |
| 1-3 | Alpha |
| 3-5 | Beta |
| 6-20 | Gamma |
`;
  const [table] = parseWesternMarkdownTables(source);
  assert.deepEqual(table.results[0].low, 1);
  assert.deepEqual(table.results[1].low, 3);
  assert.ok(table.warnings.some(warning => warning.includes("Overlapping source ranges")));
});

test("Core parser merges dense table continuations and ignores quick-reference duplicates", () => {
  const source = `
# Shadowdark RPG
<!-- PDF Page 120 -->
## Synthetic Generator
d6 Details
#### SYNTHETIC EVENT
1-2 Alpha
3 Beta
<!-- PDF Page 121 -->
## Synthetic Generator
d6 Details
#### SYNTHETIC EVENT
4-5 Gamma
6 Delta
<!-- PDF Page 330 -->
## Quick Reference
d6 Details
#### SYNTHETIC EVENT
1-6 Duplicate
`;
  const tables = parseCoreDenseTables(source);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].pages, [120, 121]);
  assert.equal(tables[0].results.length, 4);
  assert.equal(tables[0].results.at(-1).high, 6);
});

test("Core compound matrices are retained as manual second-roll tables", () => {
  const source = `
# Shadowdark RPG
<!-- PDF Page 130 -->
## Synthetic
d4, d4 1 2 3 4
#### SYNTHETIC MATRIX
1 Alpha Beta Gamma Delta
2 Epsilon Zeta Eta Theta
3 Iota Kappa Lambda Mu
4 Nu Xi Omicron Pi
`;
  const [table] = parseCoreDenseTables(source);
  assert.equal(table.formula, "1d4");
  assert.equal(table.results.length, 4);
  assert.ok(table.warnings.some(warning => warning.includes("Compound source formula")));
});

test("Core interleaved carousing-style layout is recovered structurally", () => {
  const source = `
# Shadowdark RPG
<!-- PDF Page 97 -->
## Carousing
#### CAROUSING OUTCOME
d8 Outcome Benefit
1 Synthetic outcome one Gain 2 XP
Synthetic outcome two
3 Synthetic outcome three Gain 3 XP
4 Synthetic outcome four
5 Synthetic outcome five
6 Synthetic outcome six Gain 4 XP
7 Synthetic outcome seven
8 Synthetic outcome eight
9 Synthetic outcome nine
2
14+
Gain benefit two
Gain benefit four
Gain benefit five
Gain benefit seven
Gain benefit eight
Gain benefit nine
Gain benefit ten
Gain benefit eleven
Gain benefit twelve
Gain benefit thirteen
Gain benefit fourteen
10 Synthetic outcome ten
11 Synthetic outcome eleven
12 Synthetic outcome twelve
13 Synthetic outcome thirteen
Synthetic outcome fourteen
`;
  const [table] = parseCoreDenseTables(source);
  assert.equal(table.results.length, 14);
  assert.equal(table.results[1].raw, "2");
  assert.equal(table.results.at(-1).raw, "14+");
  assert.ok(table.warnings.some(warning => warning.includes("Recovered an interleaved")));
});

test("source detection selects the supported book parser", () => {
  const western = parseSourceTables("# Player's Guide to the Western Reaches V1\n", { filename: "western.md" });
  const core = parseSourceTables("# Shadowdark RPG\n", { filename: "core.md" });
  assert.equal(western.book.id, "western-reaches-player-guide-v1");
  assert.equal(core.book.id, "shadowdark-core-v4.9");
});

test("TableResult payload preserves weighted source ranges", () => {
  const data = buildTableResultData({
    results: [{ low: 2, high: 4, raw: "2-4", text: "Synthetic result" }],
  }, "text");
  assert.deepEqual(data[0].range, [2, 4]);
  assert.equal(data[0].weight, 3);
  assert.equal(data[0].flags["mk-shadowdark"].sourceRange, "2-4");
});

function mockRuntime() {
  let nextId = 1;
  const game = {
    user: { isGM: true },
    folders: [],
    tables: [],
  };

  const FolderClass = {
    create: async data => {
      const folder = { ...data, id: `F${nextId++}` };
      game.folders.push(folder);
      return folder;
    },
  };

  const RollTableClass = {
    create: async data => {
      const document = {
        ...data,
        id: `T${nextId++}`,
        results: [],
        flags: structuredClone(data.flags ?? {}),
        getFlag(moduleId, key) {
          return this.flags?.[moduleId]?.[key];
        },
        async update(changes) {
          for (const [key, value] of Object.entries(changes)) {
            if (key === "flags.mk-shadowdark.sourceTable") {
              this.flags["mk-shadowdark"] ??= {};
              this.flags["mk-shadowdark"].sourceTable = structuredClone(value);
            } else {
              this[key] = value;
            }
          }
          return this;
        },
        async deleteEmbeddedDocuments(_type, ids) {
          this.results = this.results.filter(result => !ids.includes(result.id));
        },
        async createEmbeddedDocuments(_type, results) {
          this.results.push(...results.map(result => ({ ...structuredClone(result), id: `R${nextId++}` })));
        },
      };
      game.tables.push(document);
      return document;
    },
  };
  return { game, FolderClass, RollTableClass, textResultType: "text" };
}

test("reimport updates the same RollTable ID instead of duplicating it", async () => {
  const runtime = mockRuntime();
  const sourceTable = {
    bookId: "shadowdark-core-v4.9",
    bookTitle: "Shadowdark RPG Core Rulebook v4.9",
    sourceKind: "dense",
    key: "shadowdark-core-v4.9:synthetic:1d6",
    pages: [120],
    name: "Synthetic",
    formulaRaw: "d6",
    formula: "1d6",
    columns: ["d6", "Details"],
    warnings: [],
    importable: true,
    results: [{ low: 1, high: 6, raw: "1-6", text: "First value" }],
  };
  const parsed = [{ book: { id: sourceTable.bookId }, tables: [sourceTable], warnings: [] }];

  const first = await importParsedSources(parsed, runtime);
  const originalId = first.documents[0].id;
  sourceTable.results = [{ low: 1, high: 6, raw: "1-6", text: "Updated value" }];
  const second = await importParsedSources(parsed, runtime);

  assert.equal(first.created, 1);
  assert.equal(second.updated, 1);
  assert.equal(runtime.game.tables.length, 1);
  assert.equal(second.documents[0].id, originalId);
  assert.equal(second.documents[0].results[0].text, "Updated value");
  assert.equal(runtime.game.folders.length, 2);
});
