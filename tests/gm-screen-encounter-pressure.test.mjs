import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { calculateExplorationEncounterSchedule } from "../scripts/group-sheet/exploration-encounters.js";
import { formatExplorationNextCheck } from "../scripts/gm-screen/view-model.js";

const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");

test("GM Screen next check follows the absolute unsafe encounter boundary", () => {
  const state = calculateExplorationEncounterSchedule({
    elapsedSeconds: 5 * 360,
    turnSeconds: 360,
    intervalTurns: 3,
    consumedChecks: 1,
  });

  assert.equal(state.completedTurns, 5);
  assert.equal(state.nextCheckTurn, 6);
  assert.equal(state.dueChecks, 0);
  assert.equal(formatExplorationNextCheck(state), "Turn 6");
});

test("GM Screen next check follows risky cadence", () => {
  const state = calculateExplorationEncounterSchedule({
    elapsedSeconds: 3 * 360,
    turnSeconds: 360,
    intervalTurns: 2,
    consumedChecks: 1,
  });

  assert.equal(state.nextCheckTurn, 4);
  assert.equal(formatExplorationNextCheck(state), "Turn 4");
});

test("GM Screen reports due checks instead of pretending the next boundary is future", () => {
  const oneDue = calculateExplorationEncounterSchedule({
    elapsedSeconds: 2 * 360,
    turnSeconds: 360,
    intervalTurns: 1,
    consumedChecks: 1,
  });
  assert.equal(oneDue.dueChecks, 1);
  assert.equal(formatExplorationNextCheck(oneDue), "Due now");

  const multipleDue = calculateExplorationEncounterSchedule({
    elapsedSeconds: 6 * 360,
    turnSeconds: 360,
    intervalTurns: 3,
    consumedChecks: 0,
  });
  assert.equal(multipleDue.dueChecks, 2);
  assert.equal(formatExplorationNextCheck(multipleDue), "Due now (2)");
});

test("persistent strip owns cadence while Exploration uses only prepared next-check pressure", () => {
  assert.match(template, /\{\{exploration\.nextCheckLabel\}\}/);
  assert.match(template, /Every \{\{environment\.intervalTurns\}\} \{\{environment\.intervalUnit\}\}/);
  assert.doesNotMatch(template, /\{\{exploration\.intervalTurns\}\} \{\{exploration\.intervalUnit\}\}/);
  assert.doesNotMatch(template, /Turn \{\{exploration\.intervalTurns\}\}/);
  assert.doesNotMatch(template, /turn\{\{#unless environment\.intervalTurns\}\}/);
});
