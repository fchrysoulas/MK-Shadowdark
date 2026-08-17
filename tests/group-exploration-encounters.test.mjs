import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_ENVIRONMENT_PROFILES } from "../scripts/libs/environment-context.js";
import {
  DEFAULT_EXPLORATION_TURN_SECONDS,
  calculateExplorationEncounterSchedule,
  getExplorationEncounterState,
  getExplorationTurnSeconds,
  processDueExplorationEncounters,
  reconcileExplorationEncounterProgress,
} from "../scripts/group-sheet/exploration-encounters.js";

function makeGroupActor({ elapsed = 0, consumedChecks = 0, updates = [] } = {}) {
  const group = {
    members: [],
    activeMembers: [],
    time: {
      elapsed: {
        exploration: elapsed,
        resting: 0,
        combat: 0,
        downtime: 0,
      },
    },
    encounters: {
      exploration: { consumedChecks },
    },
  };
  const flags = {
    "mk-shadowdark": {
      isGroup: true,
      group,
    },
  };

  return {
    id: "group-1",
    uuid: "Actor.group-1",
    flags,
    sheet: { render: () => {} },
    getFlag(scope, key) {
      return flags?.[scope]?.[key];
    },
    async update(change) {
      updates.push(change);
      const progress = change["flags.mk-shadowdark.group.encounters.exploration"];
      if (progress !== undefined) {
        group.encounters.exploration = structuredClone(progress);
      }
    },
  };
}

function installRuntime({
  sceneContext = {},
  rollTotals = [],
  table = null,
  enabled = true,
} = {}) {
  const previous = {
    game: globalThis.game,
    canvas: globalThis.canvas,
    foundry: globalThis.foundry,
    Roll: globalThis.Roll,
    fromUuid: globalThis.fromUuid,
    Hooks: globalThis.Hooks,
    ui: globalThis.ui,
    ChatMessage: globalThis.ChatMessage,
  };

  const scene = {
    id: "scene-1",
    uuid: "Scene.scene-1",
    name: "Ruined Road",
    getFlag(scope, key) {
      if (scope === "mk-shadowdark" && key === "encounterContext") return sceneContext;
      return undefined;
    },
  };
  const settings = new Map([
    ["mk-shadowdark.encounterEngineEnabled", enabled],
    ["mk-shadowdark.encounterEngineProfiles", JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES)],
    ["mk-shadowdark.encounterEngineDefaultProfile", "default"],
    ["mk-shadowdark.encounterEngineDefaultTableUuid", ""],
    ["mk-shadowdark.encounterEngineShowDice3d", false],
    ["mk-shadowdark.encounterEngineWhisperToGm", true],
  ]);
  const totals = [...rollTotals];

  globalThis.foundry = {
    utils: {
      deepClone: value => structuredClone(value),
      mergeObject: (original, other) => ({ ...structuredClone(original), ...structuredClone(other) }),
    },
  };
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: [{ id: "gm", isGM: true, active: true }],
    time: { worldTime: 8 * 3600 },
    scenes: { current: scene },
    settings: {
      settings: new Map(Array.from(settings.keys(), key => [key, {}])),
      get: (_moduleId, key) => settings.get(`mk-shadowdark.${key}`),
    },
    dice3d: null,
    actors: [],
    packs: new Map(),
  };
  globalThis.canvas = { scene };
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = String(formula);
      this.total = null;
    }

    async evaluate() {
      this.total = totals.length ? totals.shift() : 4;
      return this;
    }
  };
  globalThis.fromUuid = async uuid => {
    if (table && uuid === table.uuid) return table;
    return null;
  };
  globalThis.Hooks = { callAll: () => {} };
  globalThis.ui = {
    notifications: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
  globalThis.ChatMessage = {
    create: async () => {
      throw new Error("No encounter chat card should be created in these non-triggering tests.");
    },
  };

  return {
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("default exploration turn is six minutes", () => {
  assert.equal(DEFAULT_EXPLORATION_TURN_SECONDS, 360);
  assert.equal(getExplorationTurnSeconds({ profile: {} }), 360);
});

test("environment profiles can override exploration turn duration without changing interval units", () => {
  assert.equal(getExplorationTurnSeconds({
    profile: { explorationTurnSeconds: 600 },
  }), 600);

  assert.equal(getExplorationTurnSeconds({
    profile: { turnSeconds: 480 },
  }), 480);
});

test("interval values are counts of completed exploration turns", () => {
  assert.deepEqual(calculateExplorationEncounterSchedule({
    elapsedSeconds: 6 * 360,
    turnSeconds: 360,
    intervalTurns: 3,
    consumedChecks: 0,
  }), {
    elapsedSeconds: 2160,
    turnSeconds: 360,
    completedTurns: 6,
    intervalTurns: 3,
    scheduledChecks: 2,
    consumedChecks: 0,
    dueChecks: 2,
    nextCheckTurn: 3,
    turnsUntilNextCheck: 0,
  });
});

test("partial turns do not create encounter checks", () => {
  const schedule = calculateExplorationEncounterSchedule({
    elapsedSeconds: (3 * 360) - 1,
    turnSeconds: 360,
    intervalTurns: 3,
  });

  assert.equal(schedule.completedTurns, 2);
  assert.equal(schedule.scheduledChecks, 0);
  assert.equal(schedule.dueChecks, 0);
  assert.equal(schedule.turnsUntilNextCheck, 1);
});

test("consumed checks reduce due count without creating a second time clock", () => {
  const schedule = calculateExplorationEncounterSchedule({
    elapsedSeconds: 9 * 360,
    turnSeconds: 360,
    intervalTurns: 3,
    consumedChecks: 2,
  });

  assert.equal(schedule.completedTurns, 9);
  assert.equal(schedule.scheduledChecks, 3);
  assert.equal(schedule.consumedChecks, 2);
  assert.equal(schedule.dueChecks, 1);
  assert.equal(schedule.nextCheckTurn, 9);
});

test("Group state derives turns from #45 exploration elapsed seconds and Scene danger interval", () => {
  const actor = makeGroupActor({ elapsed: 6 * 360, consumedChecks: 1 });
  const runtime = installRuntime({
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    const state = getExplorationEncounterState(actor);
    assert.equal(state.completedTurns, 6);
    assert.equal(state.intervalTurns, 3);
    assert.equal(state.scheduledChecks, 2);
    assert.equal(state.dueChecks, 1);
  } finally {
    runtime.restore();
  }
});

test("backward/reset exploration time reconciles consumed checks down to the current schedule", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 360, consumedChecks: 3, updates });
  const runtime = installRuntime({
    sceneContext: {
      profileId: "default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    assert.equal(await reconcileExplorationEncounterProgress(actor), true);
    assert.equal(updates.length, 1);
    assert.equal(updates[0]["flags.mk-shadowdark.group.encounters.exploration"].consumedChecks, 0);
  } finally {
    runtime.restore();
  }
});

test("environment changes can consume the current schedule so the new cadence starts from now", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 6 * 360, consumedChecks: 0, updates });
  const runtime = installRuntime({
    sceneContext: {
      profileId: "default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    assert.equal(await reconcileExplorationEncounterProgress(actor, {
      consumeCurrentSchedule: true,
    }), true);
    assert.equal(updates[0]["flags.mk-shadowdark.group.encounters.exploration"].consumedChecks, 2);
  } finally {
    runtime.restore();
  }
});

test("processing multiple due checks calls the headless encounter service and consumes each check", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 6 * 360, consumedChecks: 0, updates });
  const table = {
    uuid: "RollTable.encounters",
    name: "Road Encounters",
    documentName: "RollTable",
  };
  const runtime = installRuntime({
    table,
    rollTotals: [4, 5],
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: table.uuid,
    },
  });

  try {
    const result = await processDueExplorationEncounters(actor, { notify: false });
    assert.equal(result.dueBefore, 2);
    assert.equal(result.processed, 2);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].isEncounter, false);
    assert.equal(result.results[1].isEncounter, false);
    assert.equal(result.dueAfter, 0);
    assert.equal(
      actor.flags["mk-shadowdark"].group.encounters.exploration.consumedChecks,
      2
    );
  } finally {
    runtime.restore();
  }
});

test("missing encounter table blocks due processing before an occurrence roll is consumed", async () => {
  const actor = makeGroupActor({ elapsed: 3 * 360, consumedChecks: 0 });
  const runtime = installRuntime({
    rollTotals: [1],
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "",
    },
  });

  try {
    const result = await processDueExplorationEncounters(actor, { notify: false });
    assert.equal(result.reason, "missing-table");
    assert.equal(result.processed, 0);
    assert.equal(
      actor.flags["mk-shadowdark"].group.encounters.exploration.consumedChecks,
      0
    );
  } finally {
    runtime.restore();
  }
});
