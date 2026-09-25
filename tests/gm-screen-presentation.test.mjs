import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const sourceBrowser = fs.readFileSync(new URL("../scripts/gm-screen/source-table-browser.js", import.meta.url), "utf8");
const gmScreen = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");

test("Hide Party Rail and Reset Presentation features are retired", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-controls.js"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-preferences.js"));
  assert.ok(!manifest.styles.includes("styles/gm-screen-presentation.css"));
});

test("selected Group and workspace are not automatically persisted by GM Screen decorators", () => {
  assert.doesNotMatch(sourceBrowser, /patchGmScreenPresentationPreferences/);
  assert.doesNotMatch(sourceBrowser, /presentation-preferences/);
  assert.doesNotMatch(gmScreen, /gmScreenPresentationPreferences/);
});

test("GM Screen keeps selected Group while the four-zone layout removes workspace state", () => {
  assert.match(gmScreen, /this\.groupActorUuid = String\(options\.groupActorUuid/);
  assert.match(gmScreen, /actionSelectGroup/);
  assert.match(gmScreen, /actionCreateGroup/);
  assert.doesNotMatch(gmScreen, /actionOpenGroup|openGroup:/);
  assert.doesNotMatch(gmScreen, /this\.workspace|actionWorkspace|normalizeWorkspace/);
  assert.doesNotMatch(gmScreen, /partyRailCollapsed|Reset GM Screen Presentation|toggle-rail/);
});
