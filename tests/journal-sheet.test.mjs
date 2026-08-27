import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const runtime = fs.readFileSync(path.join(ROOT, "scripts", "journal-sheet", "journal-sheet.js"), "utf8");
const stylesheet = fs.readFileSync(path.join(ROOT, "styles", "journal-sheet.css"), "utf8");
const template = fs.readFileSync(path.join(ROOT, "templates", "journal-sheet.hbs"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));

test("the custom JournalEntry sheet is the default for all journal entries", () => {
  assert.match(runtime, /class MKJournalEntrySheet extends HandlebarsMixin\(BaseDocumentSheetV2\)/);
  assert.match(runtime, /template: `modules\/\$\{MODULE_ID\}\/templates\/journal-sheet\.hbs`/);
  assert.match(runtime, /registerSheet\(documentClass, MODULE_ID, MKJournalEntrySheet/);
  assert.match(runtime, /makeDefault:\s*true/);
  assert.match(runtime, /canBeDefault:\s*true/);
  assert.doesNotMatch(runtime, /types\s*:/);
  assert.ok(manifest.esmodules.includes("scripts/journal-sheet/journal-sheet.js"));
  assert.ok(manifest.styles.includes("styles/journal-sheet.css"));
  assert.match(template, /mk-journal-sheet-shell/);
  assert.match(template, /mk-journal-sheet-sidebar/);
  assert.match(template, /mk-journal-sheet-main/);
  assert.match(template, /data-mk-journal-page-panel/);
});

test("journal styling is scoped to the module-owned sheet class", () => {
  assert.match(stylesheet, /^\.mk-shadowdark-journal-sheet\s*\.window-content/m);
  assert.doesNotMatch(stylesheet, /(^|\n)(body|\.journal-entry|\.window-content)\s*\{/);
  assert.match(stylesheet, /grid-template-columns:\s*270px/);
  assert.match(stylesheet, /--mk-journal-sidebar/);
});
