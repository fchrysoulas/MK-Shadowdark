import test from "node:test";
import assert from "node:assert/strict";

import { planLegacyFocusMigration } from "../scripts/focus-spell-tracker/focus-migration.js";

test("legacy Focus state migrates when current state is absent", () => {
  const legacyState = { version: 1, sessions: [{ id: "focus-1" }] };
  const plan = planLegacyFocusMigration({ legacyState });

  assert.equal(plan.hasLegacy, true);
  assert.equal(plan.stateToWrite, legacyState);
  assert.equal(plan.removeLegacyState, true);
});

test("current Focus state wins over standalone legacy state", () => {
  const currentState = { version: 1, sessions: [{ id: "current" }] };
  const legacyState = { version: 1, sessions: [{ id: "legacy" }] };
  const plan = planLegacyFocusMigration({ currentState, legacyState });

  assert.equal(plan.stateToWrite, undefined);
  assert.equal(plan.removeLegacyState, true);
});

test("legacy capacity migrates without overwriting a current override", () => {
  assert.equal(planLegacyFocusMigration({ legacyCapacity: 2 }).capacityToWrite, 2);
  assert.equal(planLegacyFocusMigration({ currentCapacity: 3, legacyCapacity: 2 }).capacityToWrite, undefined);
});

test("actors without standalone flags require no migration", () => {
  assert.deepEqual(planLegacyFocusMigration({
    currentState: { version: 1, sessions: [] },
    currentCapacity: 1
  }), {
    hasLegacy: false,
    stateToWrite: undefined,
    capacityToWrite: undefined,
    removeLegacyState: false,
    removeLegacyCapacity: false
  });
});
