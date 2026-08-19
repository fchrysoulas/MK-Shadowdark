import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const sourceBrowser = fs.readFileSync(new URL("../scripts/gm-screen/source-table-browser.js", import.meta.url), "utf8");
const gmScreen = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");

test("GM Screen no longer loads presentation preference persistence", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-preferences.js"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-controls.js"));
  assert.ok(!manifest.styles.includes("styles/gm-screen-presentation.css"));
});

test("selected Group and workspace are not automatically persisted by GM Screen decorators", () => {
  assert.doesNotMatch(sourceBrowser, /patchGmScreenPresentationPreferences/);
  assert.doesNotMatch(sourceBrowser, /presentation-preferences/);
  assert.doesNotMatch(gmScreen, /gmScreenPresentationPreferences/);
});

test("GM Screen still keeps its selected Group and workspace as in-memory application state", () => {
  assert.match(gmScreen, /this\.groupActorUuid = String\(options\.groupActorUuid/);
  assert.match(gmScreen, /this\.workspace = normalizeWorkspace\(options\.workspace/);
  assert.match(gmScreen, /actionWorkspace/);
  assert.match(gmScreen, /actionSelectGroup/);
});