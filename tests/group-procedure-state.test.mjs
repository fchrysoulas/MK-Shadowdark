import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUP_PROCEDURE,
  GROUP_PROCEDURE_DEFAULT_STATE,
  GROUP_PROCEDURE_HOOK,
  ensureGroupProcedureState,
  getGroupProcedureState,
  normalizeGroupProcedure,
  parseGroupProcedureState,
  setGroupProcedureState,
} from "../scripts/group-sheet/procedure.js";

const MODULE_ID = "mk-shadowdark";
const PROCEDURE_PATH = `flags.${MODULE_ID}.group.procedure`;

function createMockGroupActor(initialProcedure = undefined) {
  const flags = {
    [MODULE_ID]: {
      isGroup: true,
      group: {},
    },
  };

  if (initialProcedure !== undefined) {
    flags[MODULE_ID].group.procedure = initialProcedure;
  }

  const updates = [];
  const actor = {
    id: "group-1",
    name: "Test Group",
    flags,
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async update(update) {
      updates.push(update);
      if (Object.hasOwn(update, PROCEDURE_PATH)) {
        this.flags[MODULE_ID].group.procedure = update[PROCEDURE_PATH];
      }
      return this;
    },
  };

  return { actor, updates };
}

test("procedure states normalize to the canonical values", () => {
  assert.equal(parseGroupProcedureState(" Exploration "), GROUP_PROCEDURE.EXPLORATION);
  assert.equal(parseGroupProcedureState("RESTING"), GROUP_PROCEDURE.RESTING);
  assert.equal(parseGroupProcedureState("unknown"), null);

  assert.deepEqual(normalizeGroupProcedure(undefined), {
    state: GROUP_PROCEDURE_DEFAULT_STATE,
  });
  assert.deepEqual(normalizeGroupProcedure({ state: "combat" }), {
    state: GROUP_PROCEDURE.COMBAT,
  });
  assert.deepEqual(normalizeGroupProcedure({ state: "invalid" }), {
    state: GROUP_PROCEDURE_DEFAULT_STATE,
  });
});

test("missing procedure state reads as Downtime without requiring UI state", () => {
  const { actor } = createMockGroupActor();
  assert.equal(getGroupProcedureState(actor), GROUP_PROCEDURE.DOWNTIME);
});

test("GM state changes persist only the procedure field and emit one transition hook", async () => {
  const { actor, updates } = createMockGroupActor({ state: GROUP_PROCEDURE.DOWNTIME });
  const hookCalls = [];
  const previousHooks = globalThis.Hooks;

  globalThis.Hooks = {
    callAll(name, ...args) {
      hookCalls.push([name, ...args]);
    },
  };

  try {
    const transition = await setGroupProcedureState(actor, GROUP_PROCEDURE.EXPLORATION, {
      user: { isGM: true },
      reason: "test-transition",
      notify: false,
    });

    assert.deepEqual(transition, {
      changed: true,
      previousState: GROUP_PROCEDURE.DOWNTIME,
      state: GROUP_PROCEDURE.EXPLORATION,
      reason: "test-transition",
    });
    assert.deepEqual(updates, [{
      [PROCEDURE_PATH]: {
        state: GROUP_PROCEDURE.EXPLORATION,
      },
    }]);
    assert.equal(getGroupProcedureState(actor), GROUP_PROCEDURE.EXPLORATION);
    assert.equal(hookCalls.length, 1);
    assert.equal(hookCalls[0][0], GROUP_PROCEDURE_HOOK);
    assert.equal(hookCalls[0][1], actor);
    assert.deepEqual(hookCalls[0][2], transition);
  } finally {
    globalThis.Hooks = previousHooks;
  }
});

test("setting the current state is idempotent", async () => {
  const { actor, updates } = createMockGroupActor({ state: GROUP_PROCEDURE.RESTING });

  const transition = await setGroupProcedureState(actor, GROUP_PROCEDURE.RESTING, {
    user: { isGM: true },
    notify: false,
  });

  assert.equal(transition.changed, false);
  assert.equal(transition.previousState, GROUP_PROCEDURE.RESTING);
  assert.equal(transition.state, GROUP_PROCEDURE.RESTING);
  assert.deepEqual(updates, []);
});

test("non-GMs cannot change procedure state", async () => {
  const { actor, updates } = createMockGroupActor({ state: GROUP_PROCEDURE.DOWNTIME });

  const transition = await setGroupProcedureState(actor, GROUP_PROCEDURE.COMBAT, {
    user: { isGM: false },
    notify: false,
  });

  assert.equal(transition.denied, true);
  assert.equal(transition.changed, false);
  assert.equal(getGroupProcedureState(actor), GROUP_PROCEDURE.DOWNTIME);
  assert.deepEqual(updates, []);
});

test("invalid explicit procedure states are rejected", async () => {
  const { actor, updates } = createMockGroupActor({ state: GROUP_PROCEDURE.DOWNTIME });

  await assert.rejects(
    setGroupProcedureState(actor, "adventuring", {
      user: { isGM: true },
      notify: false,
    }),
    RangeError
  );

  assert.deepEqual(updates, []);
});

test("Group actors receive a persisted default state once", async () => {
  const { actor, updates } = createMockGroupActor();

  assert.equal(await ensureGroupProcedureState(actor, {
    user: { isGM: true },
  }), true);
  assert.equal(getGroupProcedureState(actor), GROUP_PROCEDURE.DOWNTIME);
  assert.deepEqual(updates, [{
    [PROCEDURE_PATH]: {
      state: GROUP_PROCEDURE.DOWNTIME,
    },
  }]);

  assert.equal(await ensureGroupProcedureState(actor, {
    user: { isGM: true },
  }), false);
  assert.equal(updates.length, 1);
});
