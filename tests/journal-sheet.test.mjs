import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const runtime = fs.readFileSync(path.join(ROOT, "scripts", "journal-sheet", "journal-sheet.js"), "utf8");
const settings = fs.readFileSync(path.join(ROOT, "scripts", "libs", "settings.js"), "utf8");
const stylesheet = fs.readFileSync(path.join(ROOT, "styles", "journal-sheet.css"), "utf8");
const template = fs.readFileSync(path.join(ROOT, "templates", "journal-sheet.hbs"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));

test("the custom JournalEntry sheet can be enabled as the default for all journal entries", () => {
  assert.match(runtime, /class MKJournalEntrySheet extends HandlebarsMixin\(BaseDocumentSheetV2\)/);
  assert.match(runtime, /template: `modules\/\$\{MODULE_ID\}\/templates\/journal-sheet\.hbs`/);
  assert.match(runtime, /registerSheet\(documentClass, MODULE_ID, MKJournalEntrySheet/);
  assert.match(runtime, /JOURNAL_SHEET_DEFAULT_SETTING = "journalSheetDefault"/);
  assert.match(runtime, /makeDefault:\s*useAsDefault/);
  assert.match(runtime, /updateDefaultSheets/);
  assert.match(runtime, /setDefault: value => registerJournalSheet/);
  assert.match(runtime, /canBeDefault:\s*true/);
  assert.doesNotMatch(runtime, /types\s*:/);
  const settingStart = settings.indexOf('registerSetting("journalSheetDefault"');
  assert.notEqual(settingStart, -1);
  const settingBlock = settings.slice(settingStart, settingStart + 500);
  assert.match(settingBlock, /type: Boolean/);
  assert.match(settingBlock, /default: true/);
  assert.match(settingBlock, /onChange: value => globalThis\.MKShadowdarkJournalSheet/);
  assert.ok(manifest.esmodules.includes("scripts/journal-sheet/journal-sheet.js"));
  assert.ok(manifest.styles.includes("styles/journal-sheet.css"));
  assert.match(template, /mk-journal-sheet-shell/);
  assert.match(template, /mk-journal-sheet-sidebar/);
  assert.match(template, /mk-journal-sheet-main/);
  assert.match(template, /navigationGroups/);
  assert.match(template, /mk-journal-sheet-category/);
  assert.match(template, /data-mk-journal-page-panel/);
});

test("journal styling is scoped to the module-owned sheet class", () => {
  assert.match(stylesheet, /^\.mk-shadowdark-journal-sheet\s*\.window-content/m);
  assert.doesNotMatch(stylesheet, /(^|\n)(body|\.journal-entry|\.window-content)\s*\{/);
  assert.match(stylesheet, /grid-template-columns:\s*270px/);
  assert.match(stylesheet, /--mk-journal-sidebar/);
  assert.match(stylesheet, /\.mk-journal-sheet-category\s*\{/);
  assert.match(stylesheet, /\.mk-journal-sheet-title\s*\{[\s\S]*?text-align:\s*left/);
  assert.match(stylesheet, /\.mk-journal-sheet-tab\s*\{[\s\S]*?justify-content:\s*flex-start\s*!important/);
  assert.match(stylesheet, /\.mk-journal-sheet-page-body :is\(h1, h2, h3\)\s*\{[\s\S]*?color:\s*#292724/);
});
