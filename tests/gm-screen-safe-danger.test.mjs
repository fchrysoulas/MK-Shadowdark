import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_ENVIRONMENT_RULES,
  resolveEnvironmentContext,
} from "../scripts/libs/environment-context.js";
import { buildEncounterCheckDefinition } from "../scripts/encounter-engine/service.js";
import { calculateExplorationEncounterSchedule } from "../scripts/group-sheet/exploration-encounters.js";
import {
  calculateRestCheckTurns,
  restCadenceForContext,
} from "../scripts/group-sheet/rest-encounters.js";

test("Safe is a canonical danger option with encounters disabled", () => {
  const safe = CANONICAL_ENVIRONMENT_RULES.dangerLevels.safe;
  assert.equal(safe.label, "Safe");
  assert.equal(safe.interval, 0);
  assert.equal(safe.disabled, true);
  assert.equal(safe.formula, "");
  assert.deepEqual(safe.encounterOn, []);
});

test("Safe resolved Scene Context exposes no encounter roll", () => {
  const context = resolveEnvironmentContext({
    terrain: "Default",
    dangerLevel: "safe",
    period: "day",
    tableUuid: "",
  });
  assert.equal(context.dangerLevel, "safe");
  assert.equal(context.encounter.disabled, true);
  assert.equal(context.encounter.interval, 0);
  assert.equal(context.encounter.formula, "");
  assert.deepEqual(context.encounter.encounterOn, []);

  const check = buildEncounterCheckDefinition(context);
  assert.equal(check.disabled, true);
  assert.equal(check.interval, 0);
  assert.equal(check.formula, "");
  assert.deepEqual(check.encounterOn, []);
});

test("Safe Exploration accrues no scheduled or due encounter checks", () => {
  const schedule = calculateExplorationEncounterSchedule({
    elapsedSeconds: 24 * 60,
    turnSeconds: 360,
    intervalTurns: 0,
    consumedChecks: 0,
    encountersDisabled: true,
  });
  assert.equal(schedule.completedTurns, 4);
  assert.equal(schedule.intervalTurns, 0);
  assert.equal(schedule.scheduledChecks, 0);
  assert.equal(schedule.dueChecks, 0);
  assert.equal(schedule.nextCheckTurn, null);
  assert.equal(schedule.encountersDisabled, true);
});

test("Safe Rest has no scheduled encounter checks", () => {
  assert.deepEqual(calculateRestCheckTurns(0), []);
  const cadence = restCadenceForContext({
    dangerLevel: "safe",
    encounter: { disabled: true, interval: 0 },
  });
  assert.deepEqual(cadence, {
    disabled: true,
    intervalTurns: 0,
    checkTurns: [],
  });
});
