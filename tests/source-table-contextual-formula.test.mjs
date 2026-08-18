import assert from "node:assert/strict";
import test from "node:test";

import {
  collectSourceTableEntries,
  isContextualSourceFormula,
  rollSourceTable,
  sourceTableRowHtml,
} from "../scripts/gm-screen/source-table-browser.js";

function sourceTable({ formula = "1d12", formulaRaw = "d*", draw = async () => null } = {}) {
  const metadata = {
    key: "synthetic:dynamic",
    bookId: "shadowdark-core-v4.9",
    bookTitle: "Synthetic Core Source",
    formula,
    formulaRaw,
    pages: [10],
    warnings: [],
  };
  return {
    id: "dynamic-table",
    uuid: "RollTable.dynamic-table",
    name: "Synthetic Dynamic Table",
    formula,
    draw,
    flags: { "mk-shadowdark": { sourceTable: metadata } },
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
  };
}

function saveGlobal(key) {
  return globalThis[key];
}

function restoreGlobal(key, value) {
  if (value === undefined) delete globalThis[key];
  else globalThis[key] = value;
}

test("contextual source formulas are identified by the source formula, not the native fallback", () => {
  assert.equal(isContextualSourceFormula("d*"), true);
  assert.equal(isContextualSourceFormula("1d12"), false);

  const [entry] = collectSourceTableEntries([sourceTable()]);
  assert.equal(entry.formula, "d*");
  assert.equal(entry.contextualFormula, true);
});

test("contextual source table rows show source d* and disable generic Roll", () => {
  const [entry] = collectSourceTableEntries([sourceTable()]);
  const html = sourceTableRowHtml(entry);
  assert.match(html, /> d\*</);
  assert.match(html, /Contextual/);
  assert.match(html, /disabled/);
  assert.doesNotMatch(html, /data-mk-source-table-action="roll"/);
});

test("generic Roll refuses contextual tables and leaves the technical native formula unused", async () => {
  const previousUi = saveGlobal("ui");
  let warnings = 0;
  let draws = 0;
  try {
    globalThis.ui = { notifications: { warn() { warnings += 1; } } };
    const table = sourceTable({ draw: async () => { draws += 1; } });
    const result = await rollSourceTable(table);
    assert.equal(result, null);
    assert.equal(warnings, 1);
    assert.equal(draws, 0);
  } finally {
    restoreGlobal("ui", previousUi);
  }
});

test("ordinary imported source tables retain native chat rolling", async () => {
  const previousUi = saveGlobal("ui");
  let draws = 0;
  try {
    globalThis.ui = { notifications: { warn() {} } };
    const table = sourceTable({
      formula: "1d20",
      formulaRaw: "d20",
      draw: async options => {
        draws += 1;
        assert.deepEqual(options, { displayChat: true });
        return { synthetic: true };
      },
    });
    const [entry] = collectSourceTableEntries([table]);
    assert.equal(entry.formula, "d20");
    assert.equal(entry.contextualFormula, false);
    assert.match(sourceTableRowHtml(entry), /data-mk-source-table-action="roll"/);
    assert.deepEqual(await rollSourceTable(table), { synthetic: true });
    assert.equal(draws, 1);
  } finally {
    restoreGlobal("ui", previousUi);
  }
});