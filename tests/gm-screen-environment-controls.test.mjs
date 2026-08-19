import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEnvironmentEditorView,
  readEnvironmentForm,
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

test("Scene Context editor presents the four stored choices and resolved effective context", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Deep Cavern" },
    tables: [{ uuid: "RollTable.auto", name: "Cave Encounters", group: "World" }],
    stored: {
      terrain: "Caves",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "",
    },
    resolved: {
      profile: rules(),
      terrain: "Caves",
      dangerLevel: "risky",
      danger: { label: "Risky" },
      requestedPeriod: "auto",
      period: "night",
      explicitTableUuid: "",
      tableUuid: "RollTable.auto",
      encounter: { interval: 2, formula: "1d8", encounterOn: [1, 2] },
    },
  });

  assert.equal(view.sceneName, "Deep Cavern");
  assert.equal(view.stored.period, "auto");
  assert.equal(view.resolved.period, "night");
  assert.equal(view.resolved.tableName, "Cave Encounters");
  assert.equal(view.resolved.formula, "1d8");
  assert.equal(view.resolved.encounterOn, "1, 2");
  assert.equal(Object.hasOwn(view.stored, "profileId"), false);
  assert.equal(Object.hasOwn(view.resolved, "profileName"), false);
});

test("Scene Context editor clearly identifies a missing encounter table as blocking without consuming due checks", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Dry Cave" },
    tables: [],
    stored: {
      terrain: "Caves",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "",
    },
    resolved: {
      profile: rules(),
      terrain: "Caves",
      dangerLevel: "risky",
      danger: { label: "Risky" },
      period: "day",
      tableUuid: "",
      encounter: { interval: 2, formula: "1d8", encounterOn: [1, 2] },
    },
  });
  const html = renderEnvironmentEditor(view);

  assert.equal(view.resolved.tableConfigured, false);
  assert.match(html, /Encounter table not configured/);
  assert.match(html, /Due checks remain pending/);
  assert.match(html, /Save Scene Context/);
});

test("Scene Context editor exposes exactly Terrain, Danger, Period, and Encounter Table", () => {
  const view = buildEnvironmentEditorView({
    scene: { name: "Cave" },
    tables: [],
    stored: { terrain: "Caves", dangerLevel: "risky", period: "auto", tableUuid: "" },
    resolved: {
      profile: rules(),
      terrain: "Caves",
      dangerLevel: "risky",
      danger: { label: "Risky" },
      period: "day",
      tableUuid: "",
      encounter: { interval: 2, formula: "1d8", encounterOn: [1, 2] },
    },
  });
  const html = renderEnvironmentEditor(view);

  for (const name of ["terrain", "dangerLevel", "period", "tableUuid"]) {
    assert.match(html, new RegExp(`name="${name}"`));
  }
  assert.match(html, /<input type="text" name="terrain"/);
  assert.doesNotMatch(html, /name="profileId"/);
  assert.doesNotMatch(html, /Active Profile/);
  assert.match(html, /Effective Period/);
  assert.match(html, /Encounter Cadence/);
  assert.match(html, /Occurrence/);
  assert.match(html, /Effective Table/);
});

test("Scene Context form reader returns only the four persisted fields", () => {
  const values = {
    terrain: "Caves",
    dangerLevel: "risky",
    period: "night",
    tableUuid: "RollTable.caves",
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

test("Scene Context uses the canonical four-field setter and caches RollTable discovery", () => {
  assert.match(runtime, /setSceneEnvironmentContext\(value, scene\)/);
  assert.match(runtime, /cachedAvailableRollTables\(\)/);
  assert.match(runtime, /availableTableCache/);
  assert.match(runtime, /invalidateAvailableRollTableCache/);
  assert.match(runtime, /createRollTable/);
  assert.match(runtime, /_mkSceneContextRenderToken/);
  assert.doesNotMatch(runtime, /scene\.setFlag\(MODULE_ID, SCENE_CONTEXT_FLAG, value\)/);
  assert.doesNotMatch(runtime, /name="profileId"/);
  assert.doesNotMatch(runtime, /profileId:\s*read/);
});

test("Scene Context is native on Overview and obsolete Encounter/Environment panels are absent", () => {
  assert.match(template, /data-mk-gm-overview-scene-context/);
  assert.doesNotMatch(template, /data-workspace-panel="environment"/);
  assert.doesNotMatch(template, /data-workspace-panel="encounter"/);
  assert.doesNotMatch(template, /configureEnvironment/);
  assert.doesNotMatch(template, /profileName/);
  assert.doesNotMatch(bridge, /prepareAdditionalWorkspaces|prepareOverviewSceneContext|removeGroupTravelContextButton|removeEncounterProfilePresentation/);
});

test("compatibility bridge runs before GM Screen decorators but performs no GM Screen DOM surgery", () => {
  const bridgeIndex = manifest.esmodules.indexOf("scripts/gm-screen/workspace-refactor.js");
  const rulesIndex = manifest.esmodules.indexOf("scripts/gm-screen/quick-rules.js");
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  assert.ok(bridgeIndex >= 0);
  assert.ok(rulesIndex > bridgeIndex);
  assert.ok(environmentIndex > rulesIndex);
  assert.match(bridge, /compatibility-only/i);
});
