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
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function rules() {
  return {
    defaultTerrain: "Caves",
    defaultDangerLevel: "risky",
    terrains: { Caves: { any: "RollTable.auto" } },
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

test("Scene Context editor clearly identifies a missing encounter table as blocking", () => {
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
  assert.match(html, /Encounter checks remain blocked/);
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

test("Scene Context saves directly to Scene state without persisting profileId", () => {
  assert.match(runtime, /scene\.setFlag\(MODULE_ID, SCENE_CONTEXT_FLAG, value\)/);
  assert.match(runtime, /getSceneEnvironmentContext\(scene\)/);
  assert.match(runtime, /resolveSceneEnvironmentContext\(scene\)/);
  assert.match(runtime, /availableRollTables\(\)/);
  assert.doesNotMatch(runtime, /name="profileId"/);
  assert.doesNotMatch(runtime, /profileId:\s*read/);
  assert.doesNotMatch(runtime, /resolveGmScreenGroup/);
  assert.doesNotMatch(runtime, /groupActorUuid/);
});

test("Scene Context is inline on Overview and the legacy Environment workspace path is removed", () => {
  assert.match(runtime, /data-mk-gm-overview-scene-context/);
  assert.doesNotMatch(runtime, /data-workspace-panel=\\?"environment\\?"/);
  assert.match(bridge, /data-workspace-panel=\\?"environment\\?"/);
  assert.match(bridge, /\.remove\?\.\(\)/);
  assert.doesNotMatch(runtime, /application\.workspace = "environment"/);
});

test("GM Screen Scene Context controller loads after the workspace bridge and Quick Rules", () => {
  const bridgeIndex = manifest.esmodules.indexOf("scripts/gm-screen/workspace-refactor.js");
  const rulesIndex = manifest.esmodules.indexOf("scripts/gm-screen/quick-rules.js");
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  assert.ok(bridgeIndex >= 0);
  assert.ok(rulesIndex > bridgeIndex);
  assert.ok(environmentIndex > rulesIndex);
});
