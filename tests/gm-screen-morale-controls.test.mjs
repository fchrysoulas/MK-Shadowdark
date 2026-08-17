import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  combatantMoraleView,
  resultSummary,
} from "../scripts/gm-screen/morale-controls.js";

const controls = fs.readFileSync(new URL("../scripts/gm-screen/morale-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen morale member view exposes leader, immunity, and Fleeing", () => {
  const combatant = {
    id: "enemy-1",
    name: "Raider",
    actor: {
      type: "npc",
      system: { attributes: { hp: { value: 4 } } },
      getFlag: (_scope, key) => key === "encounter.moraleImmune" ? true : undefined,
      effects: [{ disabled: false, statuses: new Set(["mk-shadowdark-fleeing"]) }],
    },
    token: {
      disposition: -1,
      getFlag: () => ({ leader: true }),
    },
  };

  assert.deepEqual(combatantMoraleView(combatant), {
    id: "enemy-1",
    name: "Raider",
    token: combatant.token,
    leader: true,
    immune: true,
    fleeing: true,
    defeated: false,
  });
});

test("GM Screen morale result summary covers leader and individual results", () => {
  assert.equal(resultSummary(null), "Not resolved");
  assert.equal(resultSummary({
    mode: "leader",
    entries: [{ name: "Chief", total: 9, success: false }],
  }), "Leader Chief: 9 · failed");
  assert.equal(resultSummary({
    mode: "individual",
    entries: [
      { success: true },
      { success: false },
      { success: false },
    ],
  }), "1 held · 2 failed");
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

test("GM Screen morale reset requires confirmation", () => {
  assert.match(controls, /Reset Morale State/);
  assert.match(controls, /Re-snapshot the hostile force/);
  assert.match(controls, /defaultYes: false/);
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
