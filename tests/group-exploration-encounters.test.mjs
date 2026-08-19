import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_ENVIRONMENT_PROFILES } from "../scripts/libs/environment-context.js";
import {
  DEFAULT_EXPLORATION_TURN_SECONDS,
  calculateExplorationEncounterSchedule,
  getExplorationEncounterProgress,
  getExplorationEncounterState,
  getExplorationTurnSeconds,
  processDueExplorationEncounters,
  reconcileExplorationEncounterProgress,
  refreshAllGroupsForEnvironmentChange,
  renderExplorationEncounterToolbar,
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
  actors = [],
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
    actors,
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
    scene,
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("exploration turn is canonically six minutes and no hidden Profile can override it", () => {
  assert.equal(DEFAULT_EXPLORATION_TURN_SECONDS, 360);
  assert.equal(getExplorationTurnSeconds(), 360);
  assert.equal(getExplorationTurnSeconds({ profile: { explorationTurnSeconds: 600 } }), 360);
  assert.equal(getExplorationTurnSeconds({ profile: { turnSeconds: 480 } }), 360);
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
    encountersDisabled: false,
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

test("Group state derives turns from exploration elapsed seconds and Scene danger interval", () => {
  const actor = makeGroupActor({ elapsed: 6 * 360, consumedChecks: 1 });
  const runtime = installRuntime({
    sceneContext: {
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
    assert.equal(state.nextCheckTurn, 6);
    assert.equal(state.turnsUntilNextCheck, 0);
  } finally {
    runtime.restore();
  }
});

test("multiple elapsed intervals become multiple due checks", () => {
  const actor = makeGroupActor({ elapsed: 12 * 360, consumedChecks: 1 });
  const runtime = installRuntime({
    sceneContext: {
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    const state = getExplorationEncounterState(actor);
    assert.equal(state.completedTurns, 12);
    assert.equal(state.scheduledChecks, 4);
    assert.equal(state.dueChecks, 3);
  } finally {
    runtime.restore();
  }
});

test("ordinary Scene Context refresh does not consume a due exploration check", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 3 * 360, consumedChecks: 0, updates });
  const runtime = installRuntime({
    actors: [actor],
    sceneContext: {
      dangerLevel: "unsafe",
      period: "night",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    assert.equal(getExplorationEncounterState(actor).dueChecks, 1);
    refreshAllGroupsForEnvironmentChange();
    assert.equal(getExplorationEncounterState(actor).dueChecks, 1);
    assert.equal(updates.length, 0);
  } finally {
    runtime.restore();
  }
});

test("missing encounter table preserves a due check for later processing", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 3 * 360, consumedChecks: 0, updates });
  const runtime = installRuntime({
    sceneContext: {
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "",
    },
  });

  try {
    const result = await processDueExplorationEncounters(actor, { notify: false });
    assert.equal(result.processed, 0);
    assert.equal(result.reason, "missing-table");
    assert.equal(getExplorationEncounterState(actor).dueChecks, 1);
    assert.equal(getExplorationEncounterProgress(actor).consumedChecks, 0);
    assert.equal(updates.length, 0);
  } finally {
    runtime.restore();
  }
});

test("fixing the table later processes the retained due check exactly once", async () => {
  const actor = makeGroupActor({ elapsed: 3 * 360, consumedChecks: 0 });
  const table = {
    uuid: "RollTable.encounters",
    name: "Road Encounters",
    documentName: "RollTable",
    async draw() {
      return { results: [] };
    },
  };
  const sceneContext = {
    dangerLevel: "unsafe",
    period: "day",
    tableUuid: "",
  };
  const runtime = installRuntime({ sceneContext, table, rollTotals: [4] });

  try {
    assert.equal((await processDueExplorationEncounters(actor, { notify: false })).reason, "missing-table");
    sceneContext.tableUuid = table.uuid;

    const processed = await processDueExplorationEncounters(actor, { notify: false });
    assert.equal(processed.processed, 1);
    assert.equal(processed.dueBefore, 1);
    assert.equal(processed.dueAfter, 0);
    assert.equal(getExplorationEncounterProgress(actor).consumedChecks, 1);
  } finally {
    runtime.restore();
  }
});

test("manual processing of a due non-encounter consumes exactly one scheduled check", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 3 * 360, consumedChecks: 0, updates });
  const table = {
    uuid: "RollTable.encounters",
    name: "Road Encounters",
    documentName: "RollTable",
  };
  const runtime = installRuntime({
    sceneContext: {
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: table.uuid,
    },
    table,
    rollTotals: [4],
  });

  try {
    const result = await processDueExplorationEncounters(actor, { notify: false });
    assert.equal(result.processed, 1);
    assert.equal(result.dueBefore, 1);
    assert.equal(result.dueAfter, 0);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].isEncounter, false);
    assert.equal(getExplorationEncounterProgress(actor).consumedChecks, 1);
    assert.equal(updates.length, 1);
  } finally {
    runtime.restore();
  }
});

test("reset reconciliation explicitly consumes the current schedule", async () => {
  const updates = [];
  const actor = makeGroupActor({ elapsed: 9 * 360, consumedChecks: 1, updates });
  const runtime = installRuntime({
    sceneContext: {
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    assert.equal(getExplorationEncounterState(actor).dueChecks, 2);
    assert.equal(await reconcileExplorationEncounterProgress(actor, { consumeCurrentSchedule: true }), true);
    assert.equal(getExplorationEncounterProgress(actor).consumedChecks, 3);
    assert.equal(getExplorationEncounterState(actor).dueChecks, 0);
    assert.equal(updates.length, 1);
  } finally {
    runtime.restore();
  }
});

test("Group Traveling encounter toolbar is informational and uses the shared due-check action", () => {
  const html = renderExplorationEncounterToolbar({
    terrain: "Forest",
    period: "Day",
    completedTurns: 4,
    turnMinutes: 6,
    isGm: true,
    dangerLabel: "Risky",
    intervalTurns: 2,
    dueChecks: 1,
    tableName: "Forest Encounters",
    canCheck: true,
    latest: null,
  });

  assert.match(html, /Exploration turns <strong>4<\/strong>/);
  assert.match(html, /Check every <strong>2<\/strong> turns/);
  assert.match(html, /Due <strong>1<\/strong>/);
  assert.match(html, /Check Due/);
  assert.doesNotMatch(html, /Context|Profile|Configure/);
});

test("legacy Group time metadata is ignored by the encounter cadence", () => {
  const actor = makeGroupActor({ elapsed: 0, consumedChecks: 0 });
  actor.flags["mk-shadowdark"].group.time.encounter = {
    exploration: { elapsedSeconds: 99999 },
  };
  const runtime = installRuntime({
    sceneContext: {
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.encounters",
    },
  });

  try {
    assert.equal(getExplorationEncounterState(actor).completedTurns, 0);
    assert.equal(getExplorationEncounterState(actor).dueChecks, 0);
  } finally {
    runtime.restore();
  }
});
