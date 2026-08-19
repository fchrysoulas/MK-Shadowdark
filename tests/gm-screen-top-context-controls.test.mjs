import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  periodOptions,
  readTopContext,
  sameTopContext,
} from "../scripts/gm-screen/top-context-controls.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-overview.css", import.meta.url), "utf8");
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

test("top context compares staged values before explicit save", () => {
  const baseline = { terrain: "Forest", dangerLevel: "risky", period: "day" };
  assert.equal(sameTopContext(baseline, { ...baseline }), true);
  assert.equal(sameTopContext(baseline, { ...baseline, terrain: "Mountain" }), false);
  assert.equal(sameTopContext(baseline, { ...baseline, dangerLevel: "deadly" }), false);
  assert.equal(sameTopContext(baseline, { ...baseline, period: "night" }), false);
});

test("top context is manual-save and one explicit save refreshes the GM Screen", () => {
  assert.match(runtime, /data-mk-context-save/);
  assert.match(runtime, /Save Context/);
  assert.match(runtime, /setSceneEnvironmentContext/);
  assert.match(runtime, /tableUuid: current\.tableUuid/);
  assert.match(runtime, /application\?\.render\?\.\(\{ force: true \}\)/);
  assert.doesNotMatch(runtime, /updateActor|updateScene|updateCombat|updateToken/);
  assert.doesNotMatch(runtime, /setInterval|setTimeout/);
});

test("top context styling and runtime are loaded after environment helpers", () => {
  assert.match(stylesheet, /\.mk-gm-pressure-strip select/);
  assert.match(stylesheet, /\.mk-gm-context-save-cell/);
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  const topIndex = manifest.esmodules.indexOf("scripts/gm-screen/top-context-controls.js");
  assert.ok(environmentIndex >= 0);
  assert.ok(topIndex > environmentIndex);
});