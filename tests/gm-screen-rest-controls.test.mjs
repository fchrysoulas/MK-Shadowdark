import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const groupRest = fs.readFileSync(new URL("../scripts/group-sheet/rest-encounters.js", import.meta.url), "utf8");

test("GM Screen no longer loads its rest workflow controller", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/rest-controls.js"));
});

test("Resting workspace no longer exposes rest-start, camping, or watch controls", () => {
  assert.doesNotMatch(template, /Begin Rest/);
  assert.doesNotMatch(template, /Begin New Rest/);
  assert.doesNotMatch(template, /Continue Rest/);
  assert.doesNotMatch(template, /Resume Rest/);
  assert.doesNotMatch(template, /Group Camping/);
  assert.doesNotMatch(template, /Camp Watches/);
  assert.doesNotMatch(template, /Edit Watches/);
});

test("Resting workspace remains a status surface with encounter staging", () => {
  assert.match(template, /data-workspace-panel="resting"/);
  assert.match(template, /resting\.status/);
  assert.match(template, /resting\.completedTurns/);
  assert.match(template, /resting\.remainingChecks/);
  assert.match(template, /Stage Latest Encounter/);
});

test("removing GM Screen rest controls does not remove the canonical Group Rest service", () => {
  assert.match(groupRest, /startGroupRest/);
  assert.match(groupRest, /continueGroupRest/);
  assert.match(groupRest, /getGroupRestState/);
});