import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  activeRestRetainsChecks,
  periodOptions,
  readTopContext,
} from "../scripts/gm-screen/top-context-controls.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("Terrain, Danger, and Period are the three top-bar context selectors", () => {
  for (const name of ["terrain", "dangerLevel", "period"]) {
    assert.match(runtime, new RegExp(`name: "${name}"`));
  }
  assert.match(runtime, /pressureCell\(root, "Terrain"\)/);
  assert.match(runtime, /pressureCell\(root, "Danger"\)/);
  assert.match(runtime, /pressureCell\(root, "Period"\)/);
  assert.match(runtime, /terrainOptions\(view\.terrains, view\.stored\.terrain\)/);
  assert.match(runtime, /dangerOptions\(view\.rules, view\.stored\.dangerLevel\)/);
});

test("Period selector keeps Auto, Day, and Night choices", () => {
  const html = periodOptions("day");
  assert.match(html, /value="auto"/);
  assert.match(html, /value="day" selected/);
  assert.match(html, /value="night"/);
});

test("top-bar form reader returns only Terrain, Danger, and Period", () => {
  const values = {
    terrain: "Forest",
    dangerLevel: "risky",
    period: "day",
  };
  const strip = {
    matches(selector) {
      return selector === ".mk-gm-pressure-strip";
    },
    querySelector(selector) {
      const name = selector.match(/name="([^"]+)"/)?.[1];
      return name ? { value: values[name] ?? "" } : null;
    },
  };
  assert.deepEqual(readTopContext(strip), values);
});

test("top context auto-saves on selector changes and has no Save Context button", () => {
  assert.match(runtime, /bindTopContextAutosave/);
  assert.match(runtime, /select\.addEventListener\?\.\("change"/);
  assert.match(runtime, /setSceneEnvironmentContext/);
  assert.match(runtime, /tableUuid: current\.tableUuid/);
  assert.match(runtime, /application\?\.render\?\.\(\{ force: true \}\)/);
  assert.doesNotMatch(runtime, /Save Context|data-mk-context-save/);
  assert.doesNotMatch(runtime, /updateActor|updateScene|updateCombat|updateToken/);
  assert.doesNotMatch(runtime, /setInterval|setTimeout/);
});

test("Safe warns only when an active rest retains snapshotted encounter checks", () => {
  const retained = {
    workflow: { status: "checking" },
    cadenceSnapshotted: true,
    checkTurns: [2, 4, 6, 8],
  };
  assert.equal(activeRestRetainsChecks(retained, "safe"), true);
  assert.equal(activeRestRetainsChecks(retained, "risky"), false);
  assert.equal(activeRestRetainsChecks({ ...retained, checkTurns: [] }, "safe"), false);
  assert.equal(activeRestRetainsChecks({ ...retained, workflow: { status: "completed" } }, "safe"), false);
  assert.equal(activeRestRetainsChecks({ ...retained, workflow: { status: "interrupted" } }, "safe"), true);
});

test("Safe/rest mismatch is rendered as a compact persistent warning without a modal", () => {
  assert.match(runtime, /Active rest keeps its original encounter schedule/);
  assert.match(runtime, /data-mk-rest-snapshot-warning/);
  assert.match(runtime, /getGroupRestState/);
  assert.match(runtime, /resolveGmScreenGroup/);
  assert.doesNotMatch(runtime, /confirmGmDialog|waitForGmDialog/);
});

test("top context runtime is excluded while the GM Screen is disabled", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/environment-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/top-context-controls.js"), false);
});
