import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEnvironmentEditorView,
  renderEnvironmentEditor,
} from "../scripts/gm-screen/environment-controls.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/environment-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function profile() {
  return {
    name: "Cavern Profile",
    defaultTerrain: "Caves",
    defaultDangerLevel: "risky",
    terrains: { Caves: { any: "RollTable.auto" } },
    dangerLevels: {
      risky: { label: "Risky", interval: 2, formula: "1d8", encounterOn: [1, 2] },
    },
  };
}

test("Environment editor presents stored choices and resolved effective context", () => {
  const profiles = { cave: profile() };
  const view = buildEnvironmentEditorView({
    scene: { name: "Deep Cavern" },
    profiles,
    tables: [{ uuid: "RollTable.auto", name: "Cave Encounters", group: "World" }],
    stored: {
      profileId: "cave",
      terrain: "Caves",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "",
    },
    resolved: {
      profileId: "cave",
      profile: profiles.cave,
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
  assert.equal(view.resolved.profileName, "Cavern Profile");
  assert.equal(view.resolved.tableName, "Cave Encounters");
  assert.equal(view.resolved.formula, "1d8");
  assert.equal(view.resolved.encounterOn, "1, 2");
});

test("Environment editor clearly identifies a missing encounter table as blocking", () => {
  const profiles = { cave: profile() };
  const view = buildEnvironmentEditorView({
    scene: { name: "Dry Cave" },
    profiles,
    tables: [],
    stored: {
      profileId: "cave",
      terrain: "Caves",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "",
    },
    resolved: {
      profileId: "cave",
      profile: profiles.cave,
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
  assert.match(html, /Encounter checks are blocked/);
  assert.match(html, /Save Scene Context/);
});

test("Environment edits use the canonical Scene environment service and do not require a Group", () => {
  assert.match(runtime, /setSceneEnvironmentContext\(value, scene\)/);
  assert.match(runtime, /getEnvironmentProfiles\(\)/);
  assert.match(runtime, /getSceneEnvironmentContext\(scene\)/);
  assert.match(runtime, /resolveSceneEnvironmentContext\(scene\)/);
  assert.match(runtime, /availableRollTables\(\)/);
  assert.doesNotMatch(runtime, /resolveGmScreenGroup/);
  assert.doesNotMatch(runtime, /groupActorUuid/);
});

test("Environment workspace exposes profile, terrain, danger, period, and table override controls", () => {
  for (const name of ["profileId", "terrain", "dangerLevel", "period", "tableUuid"]) {
    assert.match(runtime, new RegExp(`name="${name}"`));
  }
  assert.match(runtime, /Active Profile/);
  assert.match(runtime, /Effective Terrain/);
  assert.match(runtime, /Effective Period/);
  assert.match(runtime, /Occurrence/);
  assert.match(runtime, /Effective Table/);
});

test("Environment controller adds an Overview warning and direct Configure path when blocked", () => {
  assert.match(runtime, /data-mk-overview-environment-warning/);
  assert.match(runtime, /Encounter checks are blocked/);
  assert.match(runtime, /application\.workspace = "environment"/);
});

test("GM Screen environment controller loads after dynamic Quick Rules", () => {
  const rulesIndex = manifest.esmodules.indexOf("scripts/gm-screen/quick-rules.js");
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  assert.ok(rulesIndex >= 0);
  assert.ok(environmentIndex > rulesIndex);
});
