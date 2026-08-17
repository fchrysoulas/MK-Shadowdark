import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildLightPressure,
  renderOverviewSummary,
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

test("GM Screen presents a clear no-light warning", () => {
  const summary = buildLightPressure([]);
  assert.equal(summary.hasLight, false);
  assert.equal(summary.pressureLabel, "NO LIGHT");
  assert.match(renderPressureCell(summary), /NO LIGHT/);
  assert.match(renderPressureCell(summary), /No active light source among active party members/);
  assert.match(renderOverviewSummary(summary), /No active light/);
  assert.match(renderOverviewSummary(summary), /None of the active party members currently has an active Shadowdark light source/);
});

test("GM Screen light overview exposes carriers and source names", () => {
  const summary = buildLightPressure([
    {
      actorUuid: "Actor.a",
      name: "A",
      light: { total: 1, items: [{ id: "torch", name: "Torch" }] },
    },
  ]);
  const html = renderOverviewSummary(summary);
  assert.match(html, /data-mk-light-carrier="Actor\.a"/);
  assert.match(html, />A</);
  assert.match(html, /Torch/);
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

test("GM Screen light-pressure runtime and style are loaded", () => {
  const environmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/environment-controls.js");
  const lightIndex = manifest.esmodules.indexOf("scripts/gm-screen/light-pressure.js");
  assert.ok(environmentIndex >= 0);
  assert.ok(lightIndex > environmentIndex);
  assert.ok(manifest.styles.includes("styles/gm-screen-light-pressure.css"));
});
