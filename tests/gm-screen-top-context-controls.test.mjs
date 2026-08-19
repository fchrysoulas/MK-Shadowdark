import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
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

test("top context runtime loads after environment helpers", () => {
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  const topIndex = manifest.esmodules.indexOf("scripts/gm-screen/top-context-controls.js");
  assert.ok(environmentIndex >= 0);
  assert.ok(topIndex > environmentIndex);
});
