import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEncounterSetupView,
  buildEnvironmentEditorView,
  encounterZoneTerrainNames,
  readEncounterSetupForm,
  renderEncounterSetup,
  sameEncounterSetupValue,
} from "../scripts/gm-screen/environment-controls.js";

const environmentRuntime = fs.readFileSync(new URL("../scripts/gm-screen/environment-controls.js", import.meta.url), "utf8");
const topRuntime = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const overviewRuntime = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function rules() {
  return {
    defaultTerrain: "Default",
    defaultDangerLevel: "risky",
    dangerLevels: {
      safe: { label: "Safe", interval: 0, formula: "", encounterOn: [], disabled: true },
      risky: { label: "Risky", interval: 2, formula: "1d8", encounterOn: [1, 2] },
    },
  };
}

function encounterZoneTable() {
  return {
    uuid: "RollTable.zone",
    name: "Encounter Zone",
    flags: {
      "mk-shadowdark": {
        sourceTable: {
          key: "test:encounter-zone",
          bookTitle: "Test Source",
          columns: ["d8", "Desert", "Canyon", "Mountain", "Salt Flat"],
        },
      },
    },
  };
}

function resolvedContext() {
  return {
    profile: rules(),
    terrain: "Canyon",
    dangerLevel: "risky",
    danger: { label: "Risky" },
    requestedPeriod: "auto",
    period: "night",
    encounter: { interval: 2, formula: "1d8", encounterOn: [1, 2] },
  };
}

test("Encounter Zone source columns become the Terrain choices", () => {
  assert.deepEqual(encounterZoneTerrainNames(encounterZoneTable()), [
    "Desert",
    "Canyon",
    "Mountain",
    "Salt Flat",
  ]);
});

test("top-bar context view derives Terrain, Danger, and Period from canonical Scene Context", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Salt Road" },
    zoneTableUuid: "RollTable.zone",
    zoneTable: encounterZoneTable(),
    stored: {
      terrain: "Canyon",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "RollTable.encounters",
    },
    resolved: resolvedContext(),
  });

  assert.equal(view.sceneName, "Salt Road");
  assert.deepEqual(view.terrains, ["Desert", "Canyon", "Mountain", "Salt Flat"]);
  assert.equal(view.stored.terrain, "Canyon");
  assert.equal(view.stored.dangerLevel, "risky");
  assert.equal(view.stored.period, "auto");
});

test("Terrain remains unavailable until an Encounter Zone supplies terrain columns", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Unknown Waste" },
    zoneTableUuid: "",
    zoneTable: null,
    stored: { terrain: "Default", dangerLevel: "risky", period: "auto", tableUuid: "" },
    resolved: resolvedContext(),
  });

  assert.deepEqual(view.terrains, []);
  assert.match(topRuntime, /No imported Encounter Zone source is configured for this scene/);
  assert.match(topRuntime, /disabled: view\.terrains\.length === 0/);
});

test("visible Scene Context editing is owned by the top strip rather than Overview", () => {
  assert.match(topRuntime, /pressureCell\(root, "Terrain"\)/);
  assert.match(topRuntime, /pressureCell\(root, "Danger"\)/);
  assert.match(topRuntime, /pressureCell\(root, "Period"\)/);
  assert.doesNotMatch(topRuntime, /Save Context|data-mk-context-save/);
  assert.match(overviewRuntime, /const summary = await buildOverviewSummary\(application\)/);
  assert.match(overviewRuntime, /overview\.innerHTML = overviewShellHtml\(summary\)/);
  assert.doesNotMatch(overviewRuntime, /Scene Context/);
  assert.doesNotMatch(overviewRuntime, /Encounter Pressure/);
  assert.doesNotMatch(overviewRuntime, /Combat \/ Morale/);
  assert.doesNotMatch(overviewRuntime, /Resting/);
});

test("top context auto-saves changed dropdowns and preserves the encounter-table field", () => {
  assert.match(topRuntime, /bindTopContextAutosave/);
  assert.match(topRuntime, /addEventListener\?\.\("change"/);
  assert.match(topRuntime, /setSceneEnvironmentContext/);
  assert.match(topRuntime, /tableUuid: current\.tableUuid/);
  assert.match(topRuntime, /application\?\.render\?\.\(\{ force: true \}\)/);
  assert.doesNotMatch(topRuntime, /updateScene|updateActor|updateCombat/);
});

test("Danger choices include Safe through canonical rules", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Salt Road" },
    zoneTableUuid: "RollTable.zone",
    zoneTable: encounterZoneTable(),
    stored: { terrain: "Desert", dangerLevel: "safe", period: "day", tableUuid: "" },
    resolved: {
      ...resolvedContext(),
      profile: rules(),
      dangerLevel: "safe",
      danger: { label: "Safe", disabled: true },
      encounter: { disabled: true, interval: 0, formula: "", encounterOn: [] },
    },
  });
  assert.equal(view.stored.dangerLevel, "safe");
  assert.equal(view.rules.dangerLevels.safe.label, "Safe");
});

test("Encounter Setup contains explicit Encounter Zone and Encounter Table save controls", () => {
  const zone = encounterZoneTable();
  const view = buildEncounterSetupView({
    scene: { name: "Salt Road" },
    tables: [
      { uuid: zone.uuid, name: zone.name, group: "World" },
      { uuid: "RollTable.encounters", name: "Wastes Encounters", group: "World" },
    ],
    stored: { terrain: "Desert", dangerLevel: "risky", period: "day", tableUuid: "RollTable.encounters" },
    zoneTableUuid: zone.uuid,
    zoneTables: [{ uuid: zone.uuid, name: zone.name, group: "Test Source", document: zone }],
  });
  const html = renderEncounterSetup(view);

  assert.match(html, /name="zoneTableUuid"/);
  assert.match(html, /name="tableUuid"/);
  assert.match(html, /Desert, Canyon, Mountain, Salt Flat/);
  assert.match(html, /data-mk-encounter-setup-save hidden disabled/);
  assert.match(html, /Save Encounter Setup/);
  assert.doesNotMatch(html, /save automatically/i);
  assert.equal(sameEncounterSetupValue(
    { zoneTableUuid: zone.uuid, tableUuid: "RollTable.encounters" },
    { zoneTableUuid: zone.uuid, tableUuid: "RollTable.encounters" },
  ), true);
});

test("Encounter Setup form reader stages both selectors without persisting them", () => {
  const values = {
    zoneTableUuid: "RollTable.zone",
    tableUuid: "RollTable.encounters",
  };
  const form = {
    querySelector(selector) {
      const name = selector.match(/name="([^"]+)"/)?.[1];
      return name ? { value: values[name] ?? "" } : null;
    },
  };
  const root = {
    querySelector(selector) {
      return selector === "[data-mk-encounter-setup-form]" ? form : null;
    },
  };

  assert.deepEqual(readEncounterSetupForm(root), values);
});

test("GM Screen loads top context before Overview shortcuts and keeps Encounter Setup helpers", () => {
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  const topIndex = manifest.esmodules.indexOf("scripts/gm-screen/top-context-controls.js");
  const overviewIndex = manifest.esmodules.indexOf("scripts/gm-screen/overview-links.js");
  const browserIndex = manifest.esmodules.indexOf("scripts/gm-screen/source-table-browser.js");
  assert.ok(environmentIndex >= 0);
  assert.ok(topIndex > environmentIndex);
  assert.ok(overviewIndex > topIndex);
  assert.ok(browserIndex > environmentIndex);
  assert.match(environmentRuntime, /bindEncounterSetupManualSave/);
});
