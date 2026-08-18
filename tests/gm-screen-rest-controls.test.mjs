import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  checkDisplay,
  restActionForState,
} from "../scripts/gm-screen/rest-controls.js";

const controls = fs.readFileSync(new URL("../scripts/gm-screen/rest-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function state(status, { required = 3, remaining = 3 } = {}) {
  return {
    requiredChecks: required,
    remainingChecks: remaining,
    workflow: {
      status,
      mode: "normal",
      consumedChecks: Math.max(0, required - remaining),
      participantUuids: [],
      plannedRations: 0,
      rationsConsumed: false,
    },
  };
}

test("Ready rest uses prospective Required Checks semantics", () => {
  assert.deepEqual(checkDisplay(state("ready")), {
    label: "Required Checks",
    value: 3,
  });
  assert.deepEqual(restActionForState(state("ready")), {
    id: "begin",
    label: "Begin Rest",
    icon: "fa-bed",
  });
});

test("active and interrupted rest use remaining-work semantics", () => {
  assert.deepEqual(checkDisplay(state("checking", { required: 3, remaining: 2 })), {
    label: "Checks Left",
    value: 2,
  });
  assert.equal(restActionForState(state("checking")).label, "Continue Rest");
  assert.equal(restActionForState(state("interrupted")).label, "Resume Rest");
});

test("completed rest offers a new workflow without pretending checks remain", () => {
  assert.deepEqual(checkDisplay(state("completed", { required: 3, remaining: 0 })), {
    label: "Checks",
    value: "3/3",
  });
  assert.equal(restActionForState(state("completed")).label, "Begin New Rest");
});

test("GM Screen begins and continues rest through canonical Group Rest services", () => {
  assert.match(controls, /startGroupRest\(group/);
  assert.match(controls, /continueGroupRest\(group\)/);
  assert.match(controls, /getGroupRestState\(group\)/);
  assert.match(controls, /getPartyFoodTotal\(participants\)/);
  assert.match(controls, /getRestMode\(\)/);
  assert.match(controls, /getGroupAssignments\(group\)/);
  assert.match(controls, /Rations and rest benefits are applied only after all required encounter checks/);
});

test("interrupted rest requires explicit GM confirmation", () => {
  assert.match(controls, /Resume Interrupted Rest/);
  assert.match(controls, /Confirm that the interruption has been resolved/);
  assert.match(controls, /no: \{ label: "Cancel", default: true \}/);
});

test("GM Screen rest controls load after encounter and assignment controllers", () => {
  const assignmentIndex = manifest.esmodules.indexOf("scripts/gm-screen/assignment-controls.js");
  const encounterIndex = manifest.esmodules.indexOf("scripts/gm-screen/encounter-controls.js");
  const restIndex = manifest.esmodules.indexOf("scripts/gm-screen/rest-controls.js");

  assert.ok(assignmentIndex >= 0);
  assert.ok(encounterIndex > assignmentIndex);
  assert.ok(restIndex > encounterIndex);
});
