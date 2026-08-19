import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEncounterSetupView,
  buildEnvironmentEditorView,
  encounterZoneTerrainNames,
  readEnvironmentForm,
  renderEncounterSetup,
  renderEnvironmentEditor,
} from "../scripts/gm-screen/environment-controls.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/environment-controls.js", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../scripts/gm-screen/workspace-refactor.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function rules() {
  return {
    defaultTerrain: "Default",
    defaultDangerLevel: "risky",
    dangerLevels: {
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

test("Overview Scene Context exposes only Terrain, Danger, and Period", () => {
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
  const html = renderEnvironmentEditor(view);

  assert.equal(view.sceneName, "Salt Road");
  assert.deepEqual(view.terrains, ["Desert", "Canyon", "Mountain", "Salt Flat"]);
  assert.equal(view.stored.terrain, "Canyon");
  for (const name of ["terrain", "dangerLevel", "period"]) {
    assert.match(html, new RegExp(`<select name="${name}"`));
  }
  assert.doesNotMatch(html, /name="tableUuid"/);
  assert.doesNotMatch(html, /Save Scene Context/);
  assert.doesNotMatch(html, /<input type="text" name="terrain"/);
  assert.match(html, /Changes save automatically/);
});

test("Overview Terrain is disabled until an Encounter Zone is configured in Tables", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Unknown Waste" },
    zoneTableUuid: "",
    zoneTable: null,
    stored: { terrain: "Default", dangerLevel: "risky", period: "auto", tableUuid: "" },
    resolved: resolvedContext(),
  });
  const html = renderEnvironmentEditor(view);

  assert.deepEqual(view.terrains, []);
  assert.match(html, /No Encounter Zone selected/);
  assert.match(html, /Choose one in Tables/);
  assert.match(html, /<select name="terrain" disabled>/);
});

test("Scene Context form reader returns only the three Overview controls", () => {
  const values = {
    terrain: "Mountain",
    dangerLevel: "risky",
    period: "night",
  };
  const form = {
    querySelector(selector) {
      const name = selector.match(/name="([^"]+)"/)?.[1];
      return name ? { value: values[name] ?? "" } : null;
    },
  };
  const root = {
    querySelector(selector) {
      return selector === "[data-mk-environment-form]" ? form : null;
    },
  };

  assert.deepEqual(readEnvironmentForm(root), values);
});

test("Overview auto-saves changes without forcing a GM Screen rerender", () => {
  assert.match(runtime, /\[data-mk-environment-form\] select/);
  assert.match(runtime, /addEventListener\("change"/);
  assert.match(runtime, /setSceneEnvironmentContext\(next, scene\)/);
  assert.match(runtime, /tableUuid: current\.tableUuid/);
  assert.match(runtime, /_mkSceneContextDraft/);
  assert.doesNotMatch(runtime, /application\.render\(\{ force: true \}\)/);
  assert.doesNotMatch(runtime, /const tables = await cachedAvailableRollTables\(\)/);
});

test("Encounter Setup contains Encounter Zone and Encounter Table controls outside Overview", () => {
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
  assert.match(html, /Changes save automatically/);
  assert.doesNotMatch(html, /Save/);
});

test("Scene Context remains native on Overview and compatibility bridge does no workspace surgery", () => {
  assert.match(template, /data-mk-gm-overview-scene-context/);
  assert.doesNotMatch(template, /data-workspace-panel="environment"/);
  assert.doesNotMatch(template, /data-workspace-panel="encounter"/);
  assert.doesNotMatch(template, /configureEnvironment/);
  assert.doesNotMatch(template, /profileName/);
  assert.doesNotMatch(bridge, /prepareAdditionalWorkspaces|prepareOverviewSceneContext|removeGroupTravelContextButton|removeEncounterProfilePresentation/);

  const bridgeIndex = manifest.esmodules.indexOf("scripts/gm-screen/workspace-refactor.js");
  const rulesIndex = manifest.esmodules.indexOf("scripts/gm-screen/quick-rules.js");
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  assert.ok(bridgeIndex >= 0);
  assert.ok(rulesIndex > bridgeIndex);
  assert.ok(environmentIndex > rulesIndex);
});