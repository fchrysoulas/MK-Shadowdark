import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUP_TIME_ADVANCED_HOOK,
  GROUP_TIME_RESET_HOOK,
  advanceGroupTime,
  ensureGroupTimeState,
  getGroupElapsedTime,
  getGroupTimeState,
  normalizeGroupTime,
  resetGroupTime,
} from "../scripts/group-sheet/time.js";

function makeGroupActor({
  procedure = "exploration",
  time = undefined,
  updates = [],
} = {}) {
  const flags = {
    "mk-shadowdark": {
      isGroup: true,
      group: {
        procedure: { state: procedure },
        ...(time === undefined ? {} : { time }),
      },
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
      const value = change["flags.mk-shadowdark.group.time"];
      if (value !== undefined) flags["mk-shadowdark"].group.time = structuredClone(value);
    },
  };
}

function installRuntime({
  isGM = true,
  worldTime = 1000,
  advance = null,
  hookCalls = [],
} = {}) {
  const previousGame = globalThis.game;
  const previousHooks = globalThis.Hooks;
  const previousUi = globalThis.ui;

  const time = {
    worldTime,
    async advance(seconds, options) {
      if (advance) return advance.call(this, seconds, options);
      this.worldTime += seconds;
      return this.worldTime;
    },
  };

  globalThis.game = {
    user: { isGM },
    time,
  };
  globalThis.Hooks = {
    callAll: (...args) => hookCalls.push(args),
  };
  globalThis.ui = {
    notifications: { warn: () => {} },
  };

  return {
    time,
    restore() {
      globalThis.game = previousGame;
      globalThis.Hooks = previousHooks;
      globalThis.ui = previousUi;
    },
  };
}

test("normalization always returns non-negative elapsed seconds for every procedure", () => {
  assert.deepEqual(normalizeGroupTime({
    elapsed: {
      exploration: 90.9,
      resting: -20,
      combat: "12",
      downtime: "invalid",
      ignored: 999,
    },
  }), {
    elapsed: {
      exploration: 90,
      resting: 0,
      combat: 12,
      downtime: 0,
    },
  });

  assert.deepEqual(normalizeGroupTime(null), {
    elapsed: {
      exploration: 0,
      resting: 0,
      combat: 0,
      downtime: 0,
    },
  });
});

test("elapsed lookup defaults to the Group's current procedure", () => {
  const actor = makeGroupActor({
    procedure: "resting",
    time: {
      elapsed: {
        exploration: 60,
        resting: 120,
        combat: 30,
        downtime: 15,
      },
    },
  });

  assert.equal(getGroupElapsedTime(actor), 120);
  assert.equal(getGroupElapsedTime(actor, "exploration"), 60);
});

test("initialization writes normalized state only when required", async () => {
  const updates = [];
  const actor = makeGroupActor({ updates });
  const runtime = installRuntime();

  try {
    assert.equal(await ensureGroupTimeState(actor), true);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0]["flags.mk-shadowdark.group.time"], normalizeGroupTime({}));

    assert.equal(await ensureGroupTimeState(actor), false);
    assert.equal(updates.length, 1);
  } finally {
    runtime.restore();
  }
});

test("advance increments only the active procedure and advances canonical Foundry world time", async () => {
  const updates = [];
  const hooks = [];
  const actor = makeGroupActor({
    procedure: "exploration",
    time: {
      elapsed: {
        exploration: 120,
        resting: 20,
        combat: 0,
        downtime: 5,
      },
    },
    updates,
  });
  let advanceCall = null;
  const runtime = installRuntime({
    worldTime: 5000,
    hookCalls: hooks,
    advance(seconds, options) {
      advanceCall = { seconds, options };
      this.worldTime += seconds;
      return this.worldTime;
    },
  });

  try {
    const result = await advanceGroupTime(actor, 600, { reason: "explore room" });

    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0]["flags.mk-shadowdark.group.time"].elapsed, {
      exploration: 720,
      resting: 20,
      combat: 0,
      downtime: 5,
    });
    assert.equal(advanceCall.seconds, 600);
    assert.equal(advanceCall.options.mkShadowdark.groupActorUuid, "Actor.group-1");
    assert.equal(advanceCall.options.mkShadowdark.procedure, "exploration");
    assert.equal(advanceCall.options.mkShadowdark.reason, "explore room");
    assert.equal(runtime.time.worldTime, 5600);
    assert.deepEqual(result, {
      groupActorUuid: "Actor.group-1",
      procedure: "exploration",
      seconds: 600,
      previousElapsed: 120,
      elapsed: 720,
      worldTimeBefore: 5000,
      worldTimeAfter: 5600,
      worldTimeAdvanced: true,
      reason: "explore room",
    });
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0][0], GROUP_TIME_ADVANCED_HOOK);
    assert.equal(hooks[0][1], actor);
    assert.deepEqual(hooks[0][2], result);
  } finally {
    runtime.restore();
  }
});

test("explicit no-sync advancement changes Group elapsed time without moving world time", async () => {
  const updates = [];
  const actor = makeGroupActor({ procedure: "downtime", updates });
  let advanceCalls = 0;
  const runtime = installRuntime({
    worldTime: 900,
    advance() {
      advanceCalls += 1;
      throw new Error("should not run");
    },
  });

  try {
    const result = await advanceGroupTime(actor, 60, {
      syncWorldTime: false,
      procedure: "downtime",
    });

    assert.equal(advanceCalls, 0);
    assert.equal(runtime.time.worldTime, 900);
    assert.equal(result.worldTimeAdvanced, false);
    assert.equal(result.elapsed, 60);
    assert.equal(getGroupTimeState(actor).elapsed.downtime, 60);
    assert.equal(updates.length, 1);
  } finally {
    runtime.restore();
  }
});

test("non-GM users cannot advance Group time", async () => {
  const updates = [];
  const actor = makeGroupActor({ updates });
  let advanceCalls = 0;
  const runtime = installRuntime({
    isGM: false,
    advance() {
      advanceCalls += 1;
    },
  });

  try {
    const result = await advanceGroupTime(actor, 60);
    assert.equal(result, null);
    assert.equal(updates.length, 0);
    assert.equal(advanceCalls, 0);
  } finally {
    runtime.restore();
  }
});

test("invalid advancement amounts and procedures are rejected", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime();

  try {
    await assert.rejects(() => advanceGroupTime(actor, 0), RangeError);
    await assert.rejects(() => advanceGroupTime(actor, -1), RangeError);
    await assert.rejects(() => advanceGroupTime(actor, 1.5), RangeError);
    await assert.rejects(() => advanceGroupTime(actor, 60, { procedure: "invalid" }), RangeError);
  } finally {
    runtime.restore();
  }
});

test("world-time failure rolls persisted Group elapsed state back", async () => {
  const updates = [];
  const original = {
    elapsed: {
      exploration: 100,
      resting: 0,
      combat: 0,
      downtime: 0,
    },
  };
  const actor = makeGroupActor({ time: original, updates });
  const runtime = installRuntime({
    advance() {
      throw new Error("world time failed");
    },
  });

  try {
    await assert.rejects(
      () => advanceGroupTime(actor, 60),
      /world time failed/
    );

    assert.equal(updates.length, 2);
    assert.equal(updates[0]["flags.mk-shadowdark.group.time"].elapsed.exploration, 160);
    assert.deepEqual(updates[1]["flags.mk-shadowdark.group.time"], original);
    assert.deepEqual(getGroupTimeState(actor), original);
  } finally {
    runtime.restore();
  }
});

test("reset can clear one procedure without changing canonical world time", async () => {
  const hooks = [];
  const updates = [];
  const actor = makeGroupActor({
    time: {
      elapsed: {
        exploration: 120,
        resting: 240,
        combat: 60,
        downtime: 30,
      },
    },
    updates,
  });
  const runtime = installRuntime({ worldTime: 4000, hookCalls: hooks });

  try {
    const result = await resetGroupTime(actor, "resting", { reason: "new rest" });

    assert.deepEqual(getGroupTimeState(actor).elapsed, {
      exploration: 120,
      resting: 0,
      combat: 60,
      downtime: 30,
    });
    assert.equal(runtime.time.worldTime, 4000);
    assert.equal(result.procedure, "resting");
    assert.equal(result.reason, "new rest");
    assert.equal(hooks[0][0], GROUP_TIME_RESET_HOOK);
  } finally {
    runtime.restore();
  }
});

test("reset with no procedure clears every elapsed counter", async () => {
  const actor = makeGroupActor({
    time: {
      elapsed: {
        exploration: 1,
        resting: 2,
        combat: 3,
        downtime: 4,
      },
    },
  });
  const runtime = installRuntime();

  try {
    await resetGroupTime(actor);
    assert.deepEqual(getGroupTimeState(actor), normalizeGroupTime({}));
  } finally {
    runtime.restore();
  }
});
