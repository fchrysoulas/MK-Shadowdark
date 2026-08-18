import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  WORKSPACE_ID,
  collectSourceTableEntries,
  filterSourceTableEntries,
  findWorldTable,
  openSourceTable,
  rollSourceTable,
  sourceBookOptions,
} from "../scripts/gm-screen/source-table-browser.js";
import {
  WORKSPACES,
  normalizeWorkspace,
} from "../scripts/gm-screen/presentation-preferences.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const runtime = fs.readFileSync(
  new URL("../scripts/gm-screen/source-table-browser.js", import.meta.url),
  "utf8",
);

function importedTable({
  id,
  name,
  formula,
  bookId,
  bookTitle,
  pages = [],
  warnings = [],
} = {}) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula,
    flags: {
      "mk-shadowdark": {
        sourceTable: {
          schema: 1,
          key: `${bookId}:${name}`,
          bookId,
          bookTitle,
          pages,
          formula,
          formulaRaw: formula,
          columns: [formula, "Result"],
          sourceKind: "test",
          warnings,
        },
      },
    },
  };
}

test("GM Screen presentation preferences accept the Tables workspace", () => {
  assert.equal(WORKSPACE_ID, "tables");
  assert.ok(WORKSPACES.includes("tables"));
  assert.equal(normalizeWorkspace("tables"), "tables");
});

test("source table browser includes only canonical imported RollTables", () => {
  const tables = [
    importedTable({
      id: "core-1",
      name: "Synthetic Core Table",
      formula: "1d20",
      bookId: "core",
      bookTitle: "Core Source",
      pages: [10],
    }),
    {
      id: "ordinary",
      name: "Ordinary World Table",
      formula: "1d6",
      flags: {},
    },
  ];

  const entries = collectSourceTableEntries(tables);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, "core-1");
  assert.equal(entries[0].name, "Synthetic Core Table");
  assert.equal(entries[0].bookTitle, "Core Source");
  assert.equal(entries[0].formula, "1d20");
  assert.equal(entries[0].pagesLabel, "10");
});

test("source table browser sorts by source then table name", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "b2", name: "Zulu", formula: "1d6", bookId: "western", bookTitle: "Western" }),
    importedTable({ id: "a2", name: "Beta", formula: "1d6", bookId: "core", bookTitle: "Core" }),
    importedTable({ id: "a1", name: "Alpha", formula: "1d6", bookId: "core", bookTitle: "Core" }),
  ]);

  assert.deepEqual(entries.map(entry => entry.id), ["a1", "a2", "b2"]);
});

test("search covers name, source, formula, and page metadata", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "a", name: "Synthetic Talents", formula: "2d6", bookId: "core", bookTitle: "Core Source", pages: [42] }),
    importedTable({ id: "b", name: "Synthetic Encounters", formula: "1d100", bookId: "western", bookTitle: "Western Source", pages: [77] }),
  ]);

  assert.deepEqual(filterSourceTableEntries(entries, { query: "talents" }).map(entry => entry.id), ["a"]);
  assert.deepEqual(filterSourceTableEntries(entries, { query: "western" }).map(entry => entry.id), ["b"]);
  assert.deepEqual(filterSourceTableEntries(entries, { query: "2d6" }).map(entry => entry.id), ["a"]);
  assert.deepEqual(filterSourceTableEntries(entries, { query: "77" }).map(entry => entry.id), ["b"]);
  assert.deepEqual(filterSourceTableEntries(entries, { bookId: "core" }).map(entry => entry.id), ["a"]);
});

test("source filter options are unique and alphabetized", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "w", name: "One", formula: "1d6", bookId: "western", bookTitle: "Western Source" }),
    importedTable({ id: "c1", name: "Two", formula: "1d6", bookId: "core", bookTitle: "Core Source" }),
    importedTable({ id: "c2", name: "Three", formula: "1d6", bookId: "core", bookTitle: "Core Source" }),
  ]);

  assert.deepEqual(sourceBookOptions(entries), [
    { id: "core", title: "Core Source" },
    { id: "western", title: "Western Source" },
  ]);
});

test("native Roll action posts the RollTable draw to chat", async () => {
  const calls = [];
  const table = {
    async draw(options) {
      calls.push(options);
      return { roll: {}, results: [] };
    },
  };

  const result = await rollSourceTable(table);
  assert.deepEqual(calls, [{ displayChat: true }]);
  assert.ok(result);
});

test("Open Table uses the native RollTable sheet", async () => {
  const calls = [];
  const table = {
    sheet: {
      async render(force) {
        calls.push(force);
      },
    },
  };

  const result = await openSourceTable(table);
  assert.equal(result, table);
  assert.deepEqual(calls, [true]);
});

test("world table resolution supports Foundry collections", () => {
  const expected = { id: "abc" };
  const tables = new Map([["abc", expected]]);
  assert.equal(findWorldTable("abc", tables), expected);
  assert.equal(findWorldTable("missing", tables), null);
});

test("manifest loads the browser after the source importer and loads its stylesheet", () => {
  const importerIndex = manifest.esmodules.indexOf("scripts/source-tables/source-table-importer.js");
  const browserIndex = manifest.esmodules.indexOf("scripts/gm-screen/source-table-browser.js");
  assert.ok(importerIndex >= 0);
  assert.ok(browserIndex > importerIndex);
  assert.ok(manifest.styles.includes("styles/gm-screen-source-tables.css"));
});

test("browser does not embed proprietary source table entries", () => {
  assert.doesNotMatch(runtime, /Shadowdark RPG Core Rulebook v4\.9/);
  assert.doesNotMatch(runtime, /Player's Guide to the Western Reaches V1/);
  assert.doesNotMatch(runtime, /DISTRICT_POINTS_OF_INTEREST/);
});