import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { sourceTablePanelContent } from "../scripts/gm-screen/source-table-browser.js";

const browserRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/source-table-browser.js", import.meta.url),
  "utf8",
);
const environmentRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/environment-controls.js", import.meta.url),
  "utf8",
);

test("Tables workspace owns Encounter Setup", () => {
  const setup = '<header><span>Encounter Setup</span></header><select name="zoneTableUuid"></select>';
  const html = sourceTablePanelContent([], setup);

  assert.match(html, /data-mk-gm-tables-encounter-setup/);
  assert.match(html, /Encounter Setup/);
  assert.match(html, /name="zoneTableUuid"/);
});

test("Tables hydrator builds Encounter Setup and binds explicit manual save", () => {
  assert.match(browserRuntime, /cachedAvailableRollTables\(\)/);
  assert.match(browserRuntime, /buildEncounterSetupView\(\{ tables \}\)/);
  assert.match(browserRuntime, /renderEncounterSetup\(encounterSetupView\)/);
  assert.match(browserRuntime, /bindEncounterSetupManualSave\(application, encounterSetup, encounterSetupView\.scene/);
  assert.doesNotMatch(browserRuntime, /bindEncounterSetupAutoSave/);
  assert.doesNotMatch(browserRuntime, /patchGmScreenPresentationPreferences/);
});

test("Overview decorator no longer owns or scans Encounter Setup", () => {
  assert.doesNotMatch(environmentRuntime, /data-mk-gm-exploration-encounter-setup/);
  assert.doesNotMatch(environmentRuntime, /const setup = root\.querySelector/);
  assert.match(environmentRuntime, /data-mk-gm-overview-scene-context/);
});

test("Encounter Setup changes only stage state until Save Encounter Setup is clicked", () => {
  assert.match(environmentRuntime, /data-mk-encounter-setup-save/);
  assert.match(environmentRuntime, /bindEncounterSetupManualSave/);
  assert.match(environmentRuntime, /saveButton\.addEventListener\("click"/);
  assert.match(environmentRuntime, /saveEncounterSetup\(application, setup, scene\)/);
  assert.doesNotMatch(environmentRuntime, /Auto-save/);
});