import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const controls = fs.readFileSync(new URL("../scripts/gm-screen/morale-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen morale member view exposes leader, immunity, and Fleeing", () => {
  assert.match(controls, /leader: tokenMoraleData\(combatant\?\.token\)\.leader === true/);
  assert.match(controls, /immune: moraleImmune\(combatant\?\.actor\)/);
  assert.match(controls, /fleeing: fleeing\(combatant\?\.actor\)/);
  assert.match(controls, /FLEEING_STATUS_ID = "mk-shadowdark-fleeing"/);
  assert.match(controls, /PREDEFINED_EFFECT_KEYS\.MORALE_IMMUNE/);
  assert.doesNotMatch(controls, /["']encounter\.moraleImmune["']/);
});

test("GM Screen morale result summary covers leader and individual results", () => {
  assert.match(controls, /Leader \$\{entry\.name\}: \$\{entry\.total\} · \$\{entry\.success \? "held" : "failed"\}/);
  assert.match(controls, /\$\{entries\.length - failed\} held · \$\{failed\} failed/);
  assert.match(controls, /Resolved · no morale-eligible survivors/);
});

test("GM Screen morale controls use only supported Morale API commands", () => {
  assert.match(controls, /api\.setLeader/);
  assert.match(controls, /api\.evaluate\(combat\)/);
  assert.match(controls, /api\.reset\(combat\)/);
  assert.match(controls, /api\.getState\(combat\)/);
  assert.match(controls, /api\.isEnemyTurnStart\(combat\)/);
  assert.doesNotMatch(controls, /combat\.update\s*\(/);
  assert.doesNotMatch(controls, /combat\.setFlag\s*\(/);
});

test("GM Screen morale workspace exposes force, leader, immunity, Fleeing, and result state", () => {
  for (const label of ["Enemy Force", "Threshold", "Morale Leader", "Immune", "Fleeing", "Status", "Result"]) {
    assert.match(controls, new RegExp(label));
  }
  assert.match(controls, /Evaluate Morale Now/);
  assert.match(controls, /Set Leader/);
  assert.match(controls, /Clear Leader/);
  assert.match(controls, /Reset Morale/);
});

test("GM Screen morale reset requires confirmation", () => {
  assert.match(controls, /Reset Morale State/);
  assert.match(controls, /Re-snapshot the hostile force/);
  assert.match(controls, /no: \{ label: "Cancel", default: true \}/);
});

test("GM Screen morale controller refreshes on Combat token flag changes", () => {
  assert.match(controls, /"updateToken"/);
  assert.match(controls, /combatContainsToken\(tokenDocument\)/);
  assert.match(controls, /refreshGmScreen\(\)/);
});

test("GM Screen morale controls load after the Rest controller", () => {
  const restIndex = manifest.esmodules.indexOf("scripts/gm-screen/rest-controls.js");
  const moraleIndex = manifest.esmodules.indexOf("scripts/gm-screen/morale-controls.js");
  assert.ok(restIndex >= 0);
  assert.ok(moraleIndex > restIndex);
});
