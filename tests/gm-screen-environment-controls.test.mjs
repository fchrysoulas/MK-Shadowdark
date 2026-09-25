import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEnvironmentEditorView,
  encounterZoneTerrainNames,
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

test("Encounter Zone view data keeps terrains grouped by zone", () => {
  const view = buildEnvironmentEditorView({
    scene: {
      name: "Split Road",
      getFlag(_moduleId, key) {
        if (key !== "encounterZoneGrids") return null;
        return [
          {
            id: "zone-ruins",
            title: "Ruins",
            rowHeader: "d8",
            columns: [{ id: "column-forest", label: "Forest" }],
            rows: [{ label: "1", cells: [null] }],
          },
          {
            id: "zone-coast",
            title: "Coast",
            rowHeader: "d8",
            columns: [{ id: "column-sea", label: "Sea" }],
            rows: [{ label: "1", cells: [null] }],
          },
        ];
      },
    },
    stored: { terrain: "Forest", dangerLevel: "risky", period: "auto", tableUuid: "" },
    resolved: resolvedContext(),
  });

  assert.deepEqual(view.encounterZones.map(zone => zone.terrains), [["Forest"], ["Sea"]]);
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
  assert.match(topRuntime, /No Encounter Zone is configured for this scene/);
  assert.match(topRuntime, /disabled: view\.terrains\.length === 0/);
});

test("visible Scene Context editing is owned by the top strip rather than Overview", () => {
  assert.match(topRuntime, /pressureCell\(root, "Terrain"\)/);
  assert.match(topRuntime, /pressureCell\(root, "Danger"\)/);
  assert.match(topRuntime, /pressureCell\(root, "Period"\)/);
  assert.match(topRuntime, /encounterZoneTerrains/);
  assert.match(topRuntime, /Scene terrain available in the selected Encounter Zone/);
  assert.doesNotMatch(topRuntime, /Save Context|data-mk-context-save/);
  assert.match(overviewRuntime, /pinnedDocuments\.innerHTML = overviewShellHtml\(\)/);
  assert.doesNotMatch(overviewRuntime, /mk-gm-overview-summary|buildOverviewSummary|overviewSummaryHtml/);
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

test("Scene Context no longer exposes a legacy encounter-check table setup", () => {
  assert.doesNotMatch(environmentRuntime, /buildEncounterSetupView|renderEncounterSetup|data-mk-encounter-setup-form/);
  assert.doesNotMatch(environmentRuntime, /Encounter Table|encounter check triggers/);
});

test("GM Screen context and overview controllers are loaded for the production surface", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/environment-controls.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/top-context-controls.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/source-table-browser.js"), true);
  assert.doesNotMatch(environmentRuntime, /bindEncounterSetupManualSave/);
});
