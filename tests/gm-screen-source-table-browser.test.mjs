import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  WORKSPACE_ID,
  collectSourceTableEntries,
  filterSourceTableEntries,
  findTablesNavButton,
  findWorldTable,
  groupSourceTableEntries,
  openSourceTable,
  rollSourceTable,
  sourceTableRowHtml,
  sourceTablePanelContent,
} from "../scripts/gm-screen/source-table-browser.js";
import {
  WORKSPACES,
  normalizeWorkspace as normalizePresentationWorkspace,
} from "../scripts/gm-screen/presentation-preferences.js";
import {
  GM_SCREEN_WORKSPACES,
  normalizeWorkspace as normalizeGmScreenWorkspace,
} from "../scripts/gm-screen/view-model.js";

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
  img = "",
  folder = null,
} = {}) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula,
    img,
    folder,
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

test("Tables is canonical in both GM Screen and presentation workspace normalization", () => {
  assert.equal(WORKSPACE_ID, "tables");
  assert.ok(WORKSPACES.includes("tables"));
  assert.ok(GM_SCREEN_WORKSPACES.includes("tables"));
  assert.equal(normalizePresentationWorkspace("tables"), "tables");
  assert.equal(normalizeGmScreenWorkspace("tables"), "tables");
});

test("source table browser reuses the canonical Tables nav entry and removes a legacy duplicate", () => {
  let removed = 0;
  const canonical = { dataset: { action: "workspace", workspace: "tables" } };
  const legacy = { remove() { removed += 1; } };
  const nav = {
    querySelector(selector) {
      if (selector.includes('data-action="workspace"')) return canonical;
      if (selector.includes("data-mk-source-tables-nav")) return legacy;
      return null;
    },
  };

  assert.equal(findTablesNavButton(nav), canonical);
  assert.equal(removed, 1);
});

test("RollTable browser includes existing imported and ordinary RollTables", () => {
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
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map(entry => entry.id), ["ordinary", "core-1"]);
  assert.equal(entries[1].name, "Synthetic Core Table");
  assert.equal(entries[1].formula, "1d20");
});

test("RollTable browser sorts alphabetically by table name", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "b2", name: "Zulu", formula: "1d6", bookId: "western", bookTitle: "Western" }),
    importedTable({ id: "a2", name: "Beta", formula: "1d6", bookId: "core", bookTitle: "Core" }),
    importedTable({ id: "a1", name: "Alpha", formula: "1d6", bookId: "core", bookTitle: "Core" }),
  ]);

  assert.deepEqual(entries.map(entry => entry.id), ["a1", "a2", "b2"]);
});

test("RollTable browser preserves native folder paths and groups", () => {
  const folders = [
    { id: "encounters", name: "Encounters", type: "RollTable", folder: null },
    { id: "npc", name: "NPC", type: "RollTable", folder: "encounters" },
  ];
  const tables = [
    importedTable({ id: "unfiled", name: "Unfiled", formula: "1d6" }),
    importedTable({ id: "npc-name", name: "Name", formula: "1d20", folder: "npc", img: "icons/svg/d20.svg" }),
  ];

  const entries = collectSourceTableEntries(tables, folders);
  assert.deepEqual(entries.find(entry => entry.id === "unfiled").folderPath, []);
  assert.deepEqual(entries.find(entry => entry.id === "npc-name").folderPath, ["Encounters", "NPC"]);
  assert.deepEqual(groupSourceTableEntries(entries).map(group => group.label), ["Unfiled", "Encounters / NPC"]);
  assert.match(sourceTableRowHtml(entries.find(entry => entry.id === "npc-name")), /icons\/svg\/d20\.svg/);
});

test("RollTable search covers name and formula", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "a", name: "Synthetic Talents", formula: "2d6", bookId: "core", bookTitle: "Core Source", pages: [42] }),
    importedTable({ id: "b", name: "Synthetic Encounters", formula: "1d100", bookId: "western", bookTitle: "Western Source", pages: [77] }),
  ]);

  assert.deepEqual(filterSourceTableEntries(entries, { query: "talents" }).map(entry => entry.id), ["a"]);
  assert.deepEqual(filterSourceTableEntries(entries, { query: "2d6" }).map(entry => entry.id), ["a"]);
  assert.deepEqual(filterSourceTableEntries(entries, { query: "western" }).map(entry => entry.id), []);
});

test("RollTable browser ignores source metadata when collecting entries", () => {
  const entries = collectSourceTableEntries([
    importedTable({ id: "w", name: "One", formula: "1d6", bookId: "western", bookTitle: "Western Source" }),
    importedTable({ id: "c1", name: "Two", formula: "1d6", bookId: "core", bookTitle: "Core Source" }),
    importedTable({ id: "c2", name: "Three", formula: "1d6", bookId: "core", bookTitle: "Core Source" }),
  ]);

  assert.deepEqual(entries.map(entry => entry.id), ["w", "c2", "c1"]);
  assert.equal("bookId" in entries[0], false);
  assert.equal("bookTitle" in entries[0], false);
  assert.equal("pages" in entries[0], false);
});

test("Tables tab has no Import / Update control", () => {
  const html = sourceTablePanelContent([]);
  assert.doesNotMatch(html, /<header>.*RollTables/is);
  assert.doesNotMatch(html, /Import \/ Update|data-mk-source-table-book|openImporter/);
});

test("RollTable folder groups are collapsible", () => {
  assert.match(runtime, /<details class="mk-gm-source-table-group"/);
  assert.match(runtime, /<summary class="mk-gm-source-table-group-header"/);
  assert.doesNotMatch(runtime, /data-folder-path="\$\{escapeHtml\(group\.label\)\}" open/);
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

test("manifest retains existing source importer data and loads the RollTable browser", () => {
  assert.ok(manifest.esmodules.includes("scripts/source-tables/source-table-importer.js"));
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/source-table-browser.js"), true);
  assert.doesNotMatch(runtime, /sourceTableFlag|openImporter|Import \/ Update/);
});

test("browser does not embed proprietary source table entries", () => {
  assert.doesNotMatch(runtime, /Shadowdark RPG Core Rulebook v4\.9/);
  assert.doesNotMatch(runtime, /Player's Guide to the Western Reaches V1/);
  assert.doesNotMatch(runtime, /DISTRICT_POINTS_OF_INTEREST/);
});
