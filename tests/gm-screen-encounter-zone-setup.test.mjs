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
const topContextRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url),
  "utf8",
);
const template = fs.readFileSync(
  new URL("../templates/gm-screen.hbs", import.meta.url),
  "utf8",
);

test("Tables workspace contains only RollTables", () => {
  const setup = '<header><span>Encounter Setup</span></header><select name="zoneTableUuid"></select>';
  const html = sourceTablePanelContent([], setup);

  assert.match(html, /data-mk-gm-source-tables-panel/);
  assert.doesNotMatch(html, /data-mk-gm-tables-encounter-setup/);
  assert.doesNotMatch(html, /Encounter Setup/);
  assert.doesNotMatch(html, /name="zoneTableUuid"/);
});

test("Tables hydrator does not build or bind Encounter Setup", () => {
  assert.doesNotMatch(browserRuntime, /cachedAvailableRollTables\(\)/);
  assert.doesNotMatch(browserRuntime, /buildEncounterSetupView/);
  assert.doesNotMatch(browserRuntime, /renderEncounterSetup/);
  assert.doesNotMatch(browserRuntime, /bindEncounterSetupManualSave/);
  assert.doesNotMatch(browserRuntime, /data-mk-gm-tables-encounter-setup/);
});

test("Overview decorator no longer owns or scans Encounter Setup", () => {
  assert.doesNotMatch(environmentRuntime, /data-mk-gm-exploration-encounter-setup/);
  assert.doesNotMatch(environmentRuntime, /const setup = root\.querySelector/);
  assert.match(environmentRuntime, /data-mk-gm-overview-scene-context/);
});

test("Encounter Zone controls use top-context autosave and explicit manual rolls", () => {
  assert.match(topContextRuntime, /data-mk-gm-encounter-zone-selector/);
  assert.match(topContextRuntime, /bindTopContextAutosave/);
  assert.match(topContextRuntime, /saveTopContext\(application, strip, scene\)/);
  assert.match(topContextRuntime, /data-mk-gm-roll-encounter-zone/);
  assert.match(template, /<div><span>Encounter Zone<\/span>/);
  assert.match(template, /data-mk-gm-roll-encounter-zone/);
  assert.doesNotMatch(environmentRuntime, /data-mk-encounter-setup-save/);
  assert.doesNotMatch(environmentRuntime, /Save Encounter Setup/);
  assert.doesNotMatch(environmentRuntime, /bindEncounterSetupManualSave/);
  assert.doesNotMatch(topContextRuntime, /actionProcessDueEncounters|pendingDue/);
});
