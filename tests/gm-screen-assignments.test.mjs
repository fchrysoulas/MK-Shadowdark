import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const groupAssignments = fs.readFileSync(new URL("../scripts/group-sheet/assignments.js", import.meta.url), "utf8");

test("GM Screen no longer loads marching-order, exploration-role, or camp-watch controls", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/assignment-controls.js"));
  assert.doesNotMatch(template, /Marching Order/i);
  assert.doesNotMatch(template, /Exploration Roles/i);
  assert.doesNotMatch(template, /Edit Marching Order/i);
  assert.doesNotMatch(template, /Edit Watches/i);
  assert.doesNotMatch(template, /Camp Watches/i);
});

test("removing GM Screen assignment UI does not delete the canonical Group assignment service", () => {
  assert.match(groupAssignments, /setMarchingOrder/);
  assert.match(groupAssignments, /setExplorationRole/);
  assert.match(groupAssignments, /setCampWatches/);
});