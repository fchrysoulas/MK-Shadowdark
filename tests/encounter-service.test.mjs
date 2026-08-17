import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENVIRONMENT_PROFILES,
} from "../scripts/libs/environment-context.js";
import {
  ENCOUNTER_FAILURE,
  buildEncounterCheckDefinition,
  checkAndResolveEncounterService,
  checkEncounterService,
  encounterOccurs,
  getEncounterServiceContext,
  resolveEncounterService,
} from "../scripts/encounter-engine/service.js";

function makeScene(context = {}) {
  return {
    id: "scene-1",
    uuid: "Scene.scene-1",
    name: "Test Scene",
    getFlag(scope, key) {
      if (scope === "mk-shadowdark" && key === "encounterContext") return context;
      return undefined;
    },
  };
}

function installRuntime({
  sceneContext = {},
  worldTime = 8 * 3600,
  rollTotals = [],
  tableResolver = async () => null,
  enabled = true,
} = {}) {
  const previousGame = globalThis.game;
  const previousCanvas = globalThis.canvas;
  const previousRoll = globalThis.Roll;
  const previousFromUuid = globalThis.fromUuid;
  const previousChatMessage = globalThis.ChatMessage;
  const previousDialog = globalThis.Dialog;
  const previousUi = globalThis.ui;

  const settings = new Map([
    ["mk-shadowdark.encounterEngineEnabled", enabled],
    ["mk-shadowdark.encounterEngineProfiles", JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES)],
    ["mk-shadowdark.encounterEngineDefaultProfile", "default"],
    ["mk-shadowdark.encounterEngineDefaultTableUuid", ""],
    ["mk-shadowdark.encounterEngineShowDice3d", false],
  ]);

  const scene = makeScene(sceneContext);
  const queue = [...rollTotals];

  globalThis.game = {
    user: { isGM: true },
    time: { worldTime },
    dice3d: null,
    settings: {
      settings: new Map(Array.from(settings.keys(), key => [key, {}])),
      get: (_moduleId, key) => settings.get(`mk-shadowdark.${key}`),
    },
    scenes: { current: scene },
    packs: new Map(),
    actors: [],
  };
  globalThis.canvas = { scene };
  globalThis.Roll = class MockRoll {
    constructor(formula) {
      this.formula = String(formula);
      this.total = null;
    }

    async evaluate() {
      this.total = queue.length ? queue.shift() : 0;
      return this;
    }
  };
  globalThis.fromUuid = tableResolver;
  globalThis.ChatMessage = new Proxy({}, {
    get() {
      throw new Error("Encounter service must not touch ChatMessage presentation.");
    },
  });
  globalThis.Dialog = new Proxy({}, {
    get() {
      throw new Error("Encounter service must not touch Dialog presentation.");
    },
  });
  globalThis.ui = {
    notifications: {
      warn: () => {},
      error: () => {},
    },
  };

  return {
    scene,
    restore() {
      globalThis.game = previousGame;
      globalThis.canvas = previousCanvas;
      globalThis.Roll = previousRoll;
      globalThis.fromUuid = previousFromUuid;
      globalThis.ChatMessage = previousChatMessage;
      globalThis.Dialog = previousDialog;
      globalThis.ui = previousUi;
    },
  };
}

test("check definition comes from normalized environment danger context", () => {
  const definition = buildEncounterCheckDefinition({
    dangerLevel: "risky",
    danger: { label: "Risky" },
    encounter: {
      interval: 2,
      formula: "1d8",
      encounterOn: [1, 2, 2, "3", "bad"],
    },
  });

  assert.deepEqual(definition, {
    dangerLevel: "risky",
    label: "Risky",
    interval: 2,
    formula: "1d8",
    encounterOn: [1, 2, 3],
  });
});

test("encounter occurrence helper is deterministic", () => {
  assert.equal(encounterOccurs(1, [1]), true);
  assert.equal(encounterOccurs("2", [1, 2]), true);
  assert.equal(encounterOccurs(5, [1, 2]), false);
  assert.equal(encounterOccurs("bad", [1]), false);
});

test("service context resolves Scene profile, terrain, danger, period, and table without UI", () => {
  const runtime = installRuntime({
    worldTime: 22 * 3600,
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "risky",
      period: "auto",
      tableUuid: "RollTable.explicit",
    },
  });

  try {
    const context = getEncounterServiceContext();
    assert.equal(context.sceneId, "scene-1");
    assert.equal(context.sceneUuid, "Scene.scene-1");
    assert.equal(context.profileId, "default");
    assert.equal(context.terrain, "Default");
    assert.equal(context.dangerLevel, "risky");
    assert.equal(context.requestedPeriod, "auto");
    assert.equal(context.period, "night");
    assert.equal(context.tableUuid, "RollTable.explicit");
    assert.equal(context.encounter.interval, 2);
  } finally {
    runtime.restore();
  }
});

test("occurrence check returns structured data without ChatMessage or Dialog", async () => {
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
    const result = await checkEncounterService();
    assert.equal(result.reason, "");
    assert.equal(result.isEncounter, true);
    assert.equal(result.check.dangerLevel, "unsafe");
    assert.equal(result.check.interval, 3);
    assert.equal(result.check.formula, "1d6");
    assert.equal(result.check.total, 1);
    assert.deepEqual(result.check.encounterOn, [1]);
    assert.equal(result.encounter, null);
    assert.equal(result.context.sceneId, "scene-1");
  } finally {
    runtime.restore();
  }
});

test("non-triggering occurrence check stops before encounter resolution", async () => {
  let resolvedUuids = 0;
  const runtime = installRuntime({
    rollTotals: [4],
    tableResolver: async () => {
      resolvedUuids += 1;
      return null;
    },
    sceneContext: {
      profileId: "default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.never-needed",
    },
  });

  try {
    const result = await checkAndResolveEncounterService();
    assert.equal(result.reason, "");
    assert.equal(result.isEncounter, false);
    assert.equal(result.check.total, 4);
    assert.equal(result.encounter, null);
    assert.equal(resolvedUuids, 0);
  } finally {
    runtime.restore();
  }
});

test("resolve reports missing table as a deterministic service failure", async () => {
  const runtime = installRuntime({
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "",
    },
  });

  try {
    const result = await resolveEncounterService();
    assert.equal(result.reason, ENCOUNTER_FAILURE.MISSING_TABLE);
    assert.equal(result.isEncounter, true);
    assert.equal(result.encounter, null);
    assert.equal(result.context.tableUuid, "");
  } finally {
    runtime.restore();
  }
});

test("resolve reports invalid RollTable UUID without opening presentation", async () => {
  let resolvedUuid = "";
  const runtime = installRuntime({
    tableResolver: async uuid => {
      resolvedUuid = uuid;
      return null;
    },
    sceneContext: {
      profileId: "default",
      terrain: "Default",
      dangerLevel: "unsafe",
      period: "day",
      tableUuid: "RollTable.missing",
    },
  });

  try {
    const result = await resolveEncounterService();
    assert.equal(resolvedUuid, "RollTable.missing");
    assert.equal(result.reason, ENCOUNTER_FAILURE.INVALID_TABLE);
    assert.equal(result.isEncounter, true);
    assert.equal(result.encounter, null);
  } finally {
    runtime.restore();
  }
});

test("combined check preserves the occurrence result when resolution cannot find a table", async () => {
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
    const result = await checkAndResolveEncounterService();
    assert.equal(result.isEncounter, true);
    assert.equal(result.check.total, 1);
    assert.equal(result.reason, ENCOUNTER_FAILURE.MISSING_TABLE);
    assert.equal(result.encounter, null);
  } finally {
    runtime.restore();
  }
});

test("GM and enabled guards return structured reasons instead of notifications", async () => {
  const runtime = installRuntime({ enabled: false });

  try {
    const disabled = await checkEncounterService();
    assert.equal(disabled.reason, ENCOUNTER_FAILURE.DISABLED);
    assert.equal(disabled.check, null);

    const nonGm = await checkEncounterService({
      user: { isGM: false },
      respectEnabled: false,
    });
    assert.equal(nonGm.reason, ENCOUNTER_FAILURE.NOT_GM);
    assert.equal(nonGm.check, null);
  } finally {
    runtime.restore();
  }
});
