import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildLightPressure,
  renderPressureCell,
} from "../scripts/gm-screen/light-pressure.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/light-pressure.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-light-pressure.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen aggregates active light across active party members", () => {
  const summary = buildLightPressure([
    {
      actorUuid: "Actor.a",
      name: "A",
      light: { total: 1, items: [{ id: "torch", name: "Torch" }] },
    },
    {
      actorUuid: "Actor.b",
      name: "B",
      light: { total: 2, items: [{ id: "lantern", name: "Lantern" }, { id: "spell", name: "Light Spell" }] },
    },
    {
      actorUuid: "Actor.c",
      name: "C",
      light: { total: 0, items: [] },
    },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.carrierCount, 2);
  assert.equal(summary.hasLight, true);
  assert.equal(summary.pressureLabel, "3 active");
  assert.deepEqual(summary.carriers.map(entry => entry.name), ["A", "B"]);
});

test("GM Screen presents a clear no-light warning in the top strip", () => {
  const summary = buildLightPressure([]);
  assert.equal(summary.hasLight, false);
  assert.equal(summary.pressureLabel, "NO LIGHT");
  assert.match(renderPressureCell(summary), /NO LIGHT/);
  assert.match(renderPressureCell(summary), /No active light source among active party members/);
});

test("Light Pressure only decorates the persistent top strip", () => {
  assert.match(runtime, /\.mk-gm-pressure-strip/);
  assert.match(runtime, /data-mk-gm-light-pressure/);
  assert.doesNotMatch(runtime, /data-workspace-panel=.?overview/);
  assert.doesNotMatch(runtime, /renderOverviewSummary/);
  assert.doesNotMatch(runtime, /data-mk-light-carrier/);
});

test("GM Screen light pressure derives from existing party view only", () => {
  assert.match(runtime, /context\?\.party/);
  assert.match(runtime, /member\?\.light\?\.items/);
  assert.match(runtime, /member\?\.light\?\.total/);
  assert.doesNotMatch(runtime, /setFlag\s*\(/);
  assert.doesNotMatch(runtime, /setInterval\s*\(/);
});

test("GM Screen pressure strip adapts to Light and optional Combat cells", () => {
  assert.match(stylesheet, /repeat\(auto-fit, minmax\(105px, 1fr\)\)/);
  assert.match(stylesheet, /\.mk-gm-light-pressure\.no-light/);
});

test("GM Screen light-pressure runtime and style are excluded while the feature is disabled", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/environment-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/top-context-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/light-pressure.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"), false);
  assert.equal(manifest.styles.includes("styles/gm-screen-light-pressure.css"), false);
  assert.equal(manifest.styles.includes("styles/gm-screen-overview.css"), false);
});
