import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const controls = fs.readFileSync(new URL("../scripts/gm-screen/presentation-controls.js", import.meta.url), "utf8");
const sourceBrowser = fs.readFileSync(new URL("../scripts/gm-screen/source-table-browser.js", import.meta.url), "utf8");
const gmScreen = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");

test("GM Screen no longer loads automatic presentation preference persistence", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-preferences.js"));
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/presentation-controls.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-presentation.css"));
});

test("presentation controls remain local to the currently open GM Screen", () => {
  assert.match(controls, /toggle-rail/);
  assert.match(controls, /application\.partyRailCollapsed = application\.partyRailCollapsed !== true/);
  assert.match(controls, /Reset GM Screen Presentation/);
  assert.doesNotMatch(controls, /patchGmScreenPresentationPreferences/);
  assert.doesNotMatch(controls, /getGmScreenPresentationPreferences/);
  assert.doesNotMatch(controls, /resetGmScreenPresentationPreferences/);
  assert.doesNotMatch(controls, /saveCurrentPresentation/);
  assert.doesNotMatch(controls, /restorePresentationOnce/);
  assert.doesNotMatch(controls, /bindSelectionPersistence/);
});

test("selected Group and workspace are not automatically persisted by other GM Screen decorators", () => {
  assert.doesNotMatch(sourceBrowser, /patchGmScreenPresentationPreferences/);
  assert.doesNotMatch(sourceBrowser, /presentation-preferences/);
  assert.doesNotMatch(gmScreen, /gmScreenPresentationPreferences/);
});

test("GM Screen still keeps selected Group and workspace as in-memory application state", () => {
  assert.match(gmScreen, /this\.groupActorUuid = String\(options\.groupActorUuid/);
  assert.match(gmScreen, /this\.workspace = normalizeWorkspace\(options\.workspace/);
  assert.match(gmScreen, /actionWorkspace/);
  assert.match(gmScreen, /actionSelectGroup/);
});