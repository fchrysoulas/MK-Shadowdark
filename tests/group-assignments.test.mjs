import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUP_ASSIGNMENTS_CHANGED_HOOK,
  ensureGroupAssignments,
  getGroupAssignments,
  membershipChanged,
  normalizeGroupAssignments,
  setCampWatches,
  setExplorationRole,
  setMarchingOrder,
  setPositionMembers,
} from "../scripts/group-sheet/assignments.js";

function makeGroupActor({
  members = ["Actor.a", "Actor.b", "Actor.c"],
  activeMembers = ["Actor.a", "Actor.b", "Actor.c"],
  assignments = undefined,
  updates = [],
} = {}) {
  const group = {
    members: [...members],
    activeMembers: [...activeMembers],
    ...(assignments === undefined ? {} : { assignments: structuredClone(assignments) }),
  };
  const flags = {
    "mk-shadowdark": {
      isGroup: true,
      group,
    },
  };

  return {
    uuid: "Actor.group-1",
    flags,
    getFlag(scope, key) {
      return flags?.[scope]?.[key];
    },
    async update(change) {
      updates.push(change);
      const value = change["flags.mk-shadowdark.group.assignments"];
      if (value !== undefined) group.assignments = structuredClone(value);
    },
  };
}

function installRuntime({ isGM = true, hookCalls = [] } = {}) {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  const previousUi = globalThis.ui;

  globalThis.game = { user: { isGM } };
  globalThis.Hooks = {
    callAll: (...args) => hookCalls.push(args),
  };
  globalThis.ui = {
    notifications: { warn: () => {} },
  };

  return {
    restore() {
      globalThis.game = previousGame;
      globalThis.Hooks = previousHooks;
      globalThis.ui = previousUi;
    },
  };
}

test("normalization keeps every active member once in marching order", () => {
  const state = normalizeGroupAssignments({
    exploration: {
      order: ["Actor.c", "Actor.c", "Actor.stale", "Actor.a"],
    },
  }, ["Actor.a", "Actor.b", "Actor.c"]);

  assert.deepEqual(state.exploration.order, ["Actor.c", "Actor.a", "Actor.b"]);
});

test("positions are active-only and mutually exclusive", () => {
  const state = normalizeGroupAssignments({
    exploration: {
      positions: {
        front: ["Actor.a", "Actor.b", "Actor.stale"],
        middle: ["Actor.a", "Actor.c"],
        rear: ["Actor.b", "Actor.c"],
      },
    },
  }, ["Actor.a", "Actor.b", "Actor.c"]);

  assert.deepEqual(state.exploration.positions, {
    front: ["Actor.a", "Actor.b"],
    middle: ["Actor.c"],
    rear: [],
  });
});

test("single exploration roles drop inactive members", () => {
  const state = normalizeGroupAssignments({
    exploration: {
      roles: {
        scout: "Actor.b",
        lightBearer: "Actor.stale",
      },
    },
  }, ["Actor.a", "Actor.b"]);

  assert.equal(state.exploration.roles.scout, "Actor.b");
  assert.equal(state.exploration.roles.lightBearer, "");
});

test("watch slots retain order but filter stale and duplicate members within each slot", () => {
  const state = normalizeGroupAssignments({
    camping: {
      watches: [
        {
          id: "first",
          label: "First Watch",
          actorUuids: ["Actor.a", "Actor.a", "Actor.stale", "Actor.b"],
        },
        {
          id: "first",
          actorUuids: ["Actor.b", "Actor.c"],
        },
      ],
    },
  }, ["Actor.a", "Actor.b", "Actor.c"]);

  assert.deepEqual(state.camping.watches, [
    {
      id: "first",
      label: "First Watch",
      actorUuids: ["Actor.a", "Actor.b"],
    },
    {
      id: "watch-2",
      label: "Watch 2",
      actorUuids: ["Actor.b", "Actor.c"],
    },
  ]);
});

test("marching-order setter filters inactive values and appends omitted active members", async () => {
  const updates = [];
  const hooks = [];
  const actor = makeGroupActor({ updates });
  const runtime = installRuntime({ hookCalls: hooks });

  try {
    const result = await setMarchingOrder(actor, ["Actor.c", "Actor.stale", "Actor.a"]);

    assert.equal(result.changed, true);
    assert.deepEqual(getGroupAssignments(actor).exploration.order, ["Actor.c", "Actor.a", "Actor.b"]);
    assert.equal(updates.length, 1);
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0][0], GROUP_ASSIGNMENTS_CHANGED_HOOK);
  } finally {
    runtime.restore();
  }
});

test("setting a position moves requested members out of other position buckets", async () => {
  const actor = makeGroupActor({
    assignments: {
      exploration: {
        positions: {
          front: ["Actor.a", "Actor.b"],
          middle: ["Actor.c"],
          rear: [],
        },
      },
    },
  });
  const runtime = installRuntime();

  try {
    await setPositionMembers(actor, "rear", ["Actor.b", "Actor.c"]);
    assert.deepEqual(getGroupAssignments(actor).exploration.positions, {
      front: ["Actor.a"],
      middle: [],
      rear: ["Actor.b", "Actor.c"],
    });
  } finally {
    runtime.restore();
  }
});

test("Scout and Light Bearer can overlap with position state but must be active", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime();

  try {
    await setPositionMembers(actor, "front", ["Actor.a"]);
    await setExplorationRole(actor, "scout", "Actor.a");
    await setExplorationRole(actor, "lightBearer", "Actor.a");

    const state = getGroupAssignments(actor);
    assert.deepEqual(state.exploration.positions.front, ["Actor.a"]);
    assert.equal(state.exploration.roles.scout, "Actor.a");
    assert.equal(state.exploration.roles.lightBearer, "Actor.a");

    await setExplorationRole(actor, "scout", "Actor.stale");
    assert.equal(getGroupAssignments(actor).exploration.roles.scout, "");
  } finally {
    runtime.restore();
  }
});

test("camp-watch setter accepts generic ordered slots for later rest procedures", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime();

  try {
    await setCampWatches(actor, [
      { id: "watch-a", label: "Dusk", actorUuids: ["Actor.a"] },
      { id: "watch-b", label: "Dawn", actorUuids: ["Actor.b", "Actor.stale"] },
    ]);

    assert.deepEqual(getGroupAssignments(actor).camping.watches, [
      { id: "watch-a", label: "Dusk", actorUuids: ["Actor.a"] },
      { id: "watch-b", label: "Dawn", actorUuids: ["Actor.b"] },
    ]);
  } finally {
    runtime.restore();
  }
});

test("non-GM users cannot mutate Group assignments", async () => {
  const updates = [];
  const actor = makeGroupActor({ updates });
  const runtime = installRuntime({ isGM: false });

  try {
    const result = await setExplorationRole(actor, "scout", "Actor.a");
    assert.equal(result, null);
    assert.equal(updates.length, 0);
  } finally {
    runtime.restore();
  }
});

test("initialization and cleanup persist normalized active-party assignments", async () => {
  const updates = [];
  const actor = makeGroupActor({
    activeMembers: ["Actor.a", "Actor.b"],
    assignments: {
      exploration: {
        order: ["Actor.c", "Actor.b", "Actor.a"],
        positions: {
          front: ["Actor.c", "Actor.a"],
          middle: ["Actor.b"],
          rear: [],
        },
        roles: {
          scout: "Actor.c",
          lightBearer: "Actor.b",
        },
      },
      camping: {
        watches: [
          { id: "one", actorUuids: ["Actor.c", "Actor.a"] },
        ],
      },
    },
    updates,
  });
  const runtime = installRuntime();

  try {
    assert.equal(await ensureGroupAssignments(actor), true);
    assert.equal(updates.length, 1);

    const state = getGroupAssignments(actor);
    assert.deepEqual(state.exploration.order, ["Actor.b", "Actor.a"]);
    assert.deepEqual(state.exploration.positions, {
      front: ["Actor.a"],
      middle: ["Actor.b"],
      rear: [],
    });
    assert.equal(state.exploration.roles.scout, "");
    assert.equal(state.exploration.roles.lightBearer, "Actor.b");
    assert.deepEqual(state.camping.watches[0].actorUuids, ["Actor.a"]);

    assert.equal(await ensureGroupAssignments(actor), false);
  } finally {
    runtime.restore();
  }
});

test("membership update detection recognizes full, flattened, and nested Group changes", () => {
  assert.equal(membershipChanged({
    "flags.mk-shadowdark.group.activeMembers": ["Actor.a"],
  }), true);
  assert.equal(membershipChanged({
    "flags.mk-shadowdark.group": { activeMembers: ["Actor.a"] },
  }), true);
  assert.equal(membershipChanged({
    flags: {
      "mk-shadowdark": {
        group: { members: ["Actor.a"] },
      },
    },
  }), true);
  assert.equal(membershipChanged({
    "flags.mk-shadowdark.group.assignments": {},
  }), false);
});

test("invalid position and role identifiers are rejected", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime();

  try {
    await assert.rejects(() => setPositionMembers(actor, "side", ["Actor.a"]), RangeError);
    await assert.rejects(() => setExplorationRole(actor, "navigator", "Actor.a"), RangeError);
  } finally {
    runtime.restore();
  }
});
