import test from "node:test";
import assert from "node:assert/strict";

import { advanceGroupTime } from "../scripts/group-sheet/time.js";

function makeGroupActor() {
  const group = {
    procedure: { state: "exploration" },
    time: {
      elapsed: {
        exploration: 0,
        resting: 0,
        combat: 0,
        downtime: 0,
      },
    },
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
      const time = change["flags.mk-shadowdark.group.time"];
      if (time !== undefined) group.time = structuredClone(time);
    },
  };
}

function installRuntime({ withPresentation = true } = {}) {
  const previous = {
    game: globalThis.game,
    Hooks: globalThis.Hooks,
    ui: globalThis.ui,
  };
  const presentationCalls = [];
  let worldAdvanceCalls = 0;

  const module = {
    api: withPresentation
      ? {
          timePasses: {
            async present(options) {
              presentationCalls.push({
                options,
                worldTimeAtPresentation: globalThis.game.time.worldTime,
              });
              return { presented: true, payload: options };
            },
          },
        }
      : {},
  };

  globalThis.game = {
    user: { isGM: true },
    time: {
      worldTime: 1000,
      async advance(seconds) {
        worldAdvanceCalls += 1;
        this.worldTime += seconds;
        return this.worldTime;
      },
    },
    modules: {
      get(id) {
        return id === "mk-shadowdark" ? module : null;
      },
    },
  };
  globalThis.Hooks = { callAll: () => {} };
  globalThis.ui = { notifications: { warn: () => {} } };

  return {
    presentationCalls,
    get worldAdvanceCalls() {
      return worldAdvanceCalls;
    },
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("Group time optionally presents Time Passes after one canonical time advancement", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime();

  try {
    const result = await advanceGroupTime(actor, 360, {
      procedure: "exploration",
      presentation: {
        title: "One exploration turn passes...",
        durationMs: 500,
      },
    });

    assert.equal(runtime.worldAdvanceCalls, 1);
    assert.equal(globalThis.game.time.worldTime, 1360);
    assert.equal(actor.flags["mk-shadowdark"].group.time.elapsed.exploration, 360);
    assert.equal(runtime.presentationCalls.length, 1);
    assert.equal(runtime.presentationCalls[0].worldTimeAtPresentation, 1360);
    assert.equal(runtime.presentationCalls[0].options.title, "One exploration turn passes...");
    assert.equal(runtime.presentationCalls[0].options.seconds, 360);
    assert.equal(runtime.presentationCalls[0].options.procedure, "exploration");
    assert.deepEqual(result.presentation, {
      requested: true,
      presented: true,
      reason: "",
    });
  } finally {
    runtime.restore();
  }
});

test("unavailable Time Passes presentation never creates another time mutation", async () => {
  const actor = makeGroupActor();
  const runtime = installRuntime({ withPresentation: false });

  try {
    const result = await advanceGroupTime(actor, 3600, {
      procedure: "resting",
      presentation: true,
    });

    assert.equal(runtime.worldAdvanceCalls, 1);
    assert.equal(globalThis.game.time.worldTime, 4600);
    assert.equal(actor.flags["mk-shadowdark"].group.time.elapsed.resting, 3600);
    assert.deepEqual(result.presentation, {
      requested: true,
      presented: false,
      reason: "time-passes-unavailable",
    });
  } finally {
    runtime.restore();
  }
});
