import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const gmScreen = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");

test("GM Screen no longer loads the live-refresh service", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/live-refresh.js"));
});

test("GM Screen does not subscribe to Actor, Scene, Combat, or workflow changes for rerendering", () => {
  for (const hook of [
    "updateActor",
    "updateScene",
    "canvasReady",
    "combatStart",
    "updateCombat",
    "createCombatant",
    "updateCombatant",
    "deleteCombatant",
    "mkShadowdarkGroupProcedureChanged",
    "mkShadowdarkGroupTimeAdvanced",
    "mkShadowdarkGroupTimeReset",
    "mkShadowdarkGroupAssignmentsChanged",
    "mkShadowdarkEnvironmentChanged",
    "mkShadowdarkGroupExplorationEncounter",
    "mkShadowdarkGroupRestWorkflow",
  ]) {
    assert.doesNotMatch(gmScreen, new RegExp(`"${hook}"`));
  }
});

test("GM Screen runtime exposes no general refresh entry point", () => {
  assert.doesNotMatch(gmScreen, /refreshGmScreen/);
  assert.doesNotMatch(gmScreen, /registerRefreshHooks/);
  assert.doesNotMatch(gmScreen, /module\.api\.gmScreen[\s\S]*refresh:/);
});