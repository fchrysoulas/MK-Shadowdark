import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const groupRest = fs.readFileSync(new URL("../scripts/group-sheet/rest-encounters.js", import.meta.url), "utf8");

test("GM Screen no longer loads its rest workflow controller", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/rest-controls.js"));
});

test("GM Screen workspaces no longer expose rest-start, camping, or watch-edit controls", () => {
  assert.doesNotMatch(template, /Begin Rest/);
  assert.doesNotMatch(template, /Begin New Rest/);
  assert.doesNotMatch(template, /Continue Rest/);
  assert.doesNotMatch(template, /Resume Rest/);
  assert.doesNotMatch(template, /Group Camping/);
  assert.doesNotMatch(template, /Camp Watches/);
  assert.doesNotMatch(template, /Edit Watches/);
});

test("Settlement workspace contains no resting status surface", () => {
  assert.doesNotMatch(template, /data-workspace-panel="resting"/);
  assert.match(template, /data-workspace-panel="downtime"/);
  assert.match(template, />Settlement</);
  assert.doesNotMatch(template, /data-mk-gm-rest-panel/);
  assert.doesNotMatch(template, /resting\.status/);
  assert.doesNotMatch(template, /resting\.completedTurns/);
  assert.doesNotMatch(template, /resting\.remainingChecks/);
  assert.doesNotMatch(template, /Stage Latest Encounter/);
});

test("GM Screen Tools workspace is retired", () => {
  assert.doesNotMatch(template, /data-workspace-panel="tools"/);
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/tools-controls.js"));
});

test("removing GM Screen rest controls does not remove the canonical Group Rest service", () => {
  assert.match(groupRest, /startGroupRest/);
  assert.match(groupRest, /continueGroupRest/);
  assert.match(groupRest, /getGroupRestState/);
});
