import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENVIRONMENT_PROFILES,
  ENVIRONMENT_CHANGED_HOOK,
  ENVIRONMENT_SCENE_FLAG,
  determineEnvironmentPeriod,
  environmentFlagChanged,
  getSceneEnvironmentContext,
  normalizeEnvironmentProfiles,
  normalizeSceneEnvironmentContext,
  resolveEnvironmentContext,
  setSceneEnvironmentContext,
} from "../scripts/libs/environment-context.js";
import {
  getSceneEncounterContext,
  normalizeProfiles,
} from "../scripts/encounter-engine/helpers.js";

function withGame({ settings = {}, worldTime = 0 } = {}, callback) {
  const previousGame = globalThis.game;
  const entries = new Map(Object.entries(settings).map(([key, value]) => [`mk-shadowdark.${key}`, value]));

  globalThis.game = {
    time: { worldTime },
    user: { isGM: true },
    settings: {
      settings: new Map(Array.from(entries.keys(), key => [key, {}])),
      get: (_moduleId, key) => entries.get(`mk-shadowdark.${key}`),
    },
  };

  try {
    return callback();
  } finally {
    globalThis.game = previousGame;
  }
}

test("shared environment service owns Encounter profile normalization", () => {
  assert.equal(normalizeProfiles, normalizeEnvironmentProfiles);
  assert.equal(getSceneEncounterContext, getSceneEnvironmentContext);
});

test("default profile preserves current Shadowdark encounter behavior", () => {
  const profiles = normalizeEnvironmentProfiles({});
  const profile = profiles.default;

  assert.equal(profile.profileSchema, 2);
  assert.equal(profile.name, "Shadowdark Core");
  assert.equal(profile.defaultTerrain, "Default");
  assert.equal(profile.defaultDangerLevel, "unsafe");
  assert.equal(profile.dangerLevels.unsafe.interval, 3);
  assert.deepEqual(profile.dangerLevels.unsafe.encounterOn, [1]);
});

test("legacy default profile is upgraded without losing configured terrain tables", () => {
  const profiles = normalizeEnvironmentProfiles({
    default: {
      profileSchema: 1,
      name: "Default",
      dayStart: 7,
      nightStart: 20,
      terrains: {
        Desert: {
          day: "RollTable.day",
          night: "RollTable.night",
        },
      },
      defaultTerrain: "Desert",
      auxiliaryTables: {
        reaction: "RollTable.reaction",
        morale: "legacy-morale-table",
      },
    },
  });

  assert.equal(profiles.default.profileSchema, 2);
  assert.equal(profiles.default.name, "Shadowdark Core");
  assert.equal(profiles.default.dayStart, 7);
  assert.equal(profiles.default.nightStart, 20);
  assert.equal(profiles.default.defaultTerrain, "Desert");
  assert.equal(profiles.default.terrains.Desert.day, "RollTable.day");
  assert.equal(profiles.default.auxiliaryTables.reaction, "RollTable.reaction");
  assert.equal(profiles.default.auxiliaryTables.morale, undefined);
});

test("scene context keeps the existing encounterContext Scene flag shape", () => {
  withGame({
    settings: {
      encounterEngineProfiles: JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES),
      encounterEngineDefaultProfile: "default",
    },
  }, () => {
    const scene = {
      getFlag: (scope, key) => {
        assert.equal(scope, "mk-shadowdark");
        assert.equal(key, ENVIRONMENT_SCENE_FLAG);
        return {
          profileId: "default",
          terrain: "Ruins",
          dangerLevel: "deadly",
          period: "night",
          tableUuid: "RollTable.override",
        };
      },
    };

    assert.deepEqual(getSceneEnvironmentContext(scene), {
      profileId: "default",
      terrain: "Ruins",
      dangerLevel: "deadly",
      period: "night",
      tableUuid: "RollTable.override",
    });
  });
});

test("resolved context derives effective period, danger procedure, and terrain table", () => {
  const profiles = normalizeEnvironmentProfiles({
    wastes: {
      name: "Wastes",
      dayStart: 6,
      nightStart: 18,
      defaultTerrain: "Salt Flats",
      defaultDangerLevel: "risky",
      terrains: {
        "Salt Flats": {
          day: "RollTable.day",
          night: "RollTable.night",
        },
      },
      dangerLevels: {
        risky: {
          label: "Risky",
          interval: 2,
          formula: "1d6",
          encounterOn: [1],
        },
      },
    },
  });

  const resolved = withGame({}, () => resolveEnvironmentContext({
    profileId: "wastes",
    terrain: "Salt Flats",
    dangerLevel: "risky",
    period: "auto",
    tableUuid: "",
  }, {
    scene: { id: "scene-1", uuid: "Scene.scene-1", name: "The Flats" },
    profiles,
    worldTime: 22 * 3600,
  }));

  assert.equal(resolved.sceneId, "scene-1");
  assert.equal(resolved.sceneName, "The Flats");
  assert.equal(resolved.requestedPeriod, "auto");
  assert.equal(resolved.period, "night");
  assert.equal(resolved.tableUuid, "RollTable.night");
  assert.equal(resolved.danger.label, "Risky");
  assert.equal(resolved.encounter.interval, 2);
  assert.equal(resolved.encounter.formula, "1d6");
  assert.deepEqual(resolved.encounter.encounterOn, [1]);
});

test("explicit encounter table override wins over profile terrain mapping", () => {
  const profile = DEFAULT_ENVIRONMENT_PROFILES.default;
  const profiles = {
    default: {
      ...profile,
      terrains: {
        Default: {
          any: "RollTable.profile",
          day: "RollTable.day",
          night: "RollTable.night",
        },
      },
    },
  };

  const resolved = withGame({}, () => resolveEnvironmentContext({
    profileId: "default",
    terrain: "Default",
    dangerLevel: "unsafe",
    period: "day",
    tableUuid: "RollTable.override",
  }, { profiles }));

  assert.equal(resolved.explicitTableUuid, "RollTable.override");
  assert.equal(resolved.tableUuid, "RollTable.override");
});

test("period resolution supports automatic and explicit day/night", () => {
  const profile = { dayStart: 6, nightStart: 18 };

  assert.equal(determineEnvironmentPeriod(profile, "auto", 8 * 3600), "day");
  assert.equal(determineEnvironmentPeriod(profile, "auto", 22 * 3600), "night");
  assert.equal(determineEnvironmentPeriod(profile, "day", 22 * 3600), "day");
  assert.equal(determineEnvironmentPeriod(profile, "night", 8 * 3600), "night");
});

test("invalid Scene values normalize against the selected profile", () => {
  const profiles = normalizeEnvironmentProfiles({
    dungeon: {
      name: "Dungeon",
      defaultTerrain: "Crypt",
      defaultDangerLevel: "deadly",
      terrains: { Crypt: { any: "" } },
      dangerLevels: {
        deadly: { label: "Deadly", interval: 1, formula: "1d6", encounterOn: [1] },
      },
    },
  });

  const normalized = withGame({
    settings: { encounterEngineDefaultProfile: "dungeon" },
  }, () => normalizeSceneEnvironmentContext({
    profileId: "missing",
    dangerLevel: "missing",
    period: "invalid",
  }, profiles));

  assert.deepEqual(normalized, {
    profileId: "dungeon",
    terrain: "Crypt",
    dangerLevel: "deadly",
    period: "auto",
    tableUuid: "",
  });
});

test("GM setter writes the existing Scene flag instead of creating parallel Group state", async () => {
  const writes = [];
  const previousGame = globalThis.game;

  globalThis.game = {
    user: { isGM: true },
    settings: {
      settings: new Map([
        ["mk-shadowdark.encounterEngineProfiles", {}],
        ["mk-shadowdark.encounterEngineDefaultProfile", {}],
      ]),
      get: (_moduleId, key) => key === "encounterEngineProfiles"
        ? JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES)
        : "default",
    },
  };

  try {
    const scene = {
      setFlag: async (scope, key, value) => writes.push({ scope, key, value }),
    };

    const result = await setSceneEnvironmentContext({
      profileId: "default",
      terrain: "Default",
      dangerLevel: "risky",
      period: "day",
      tableUuid: "RollTable.special",
    }, scene);

    assert.equal(writes.length, 1);
    assert.equal(writes[0].scope, "mk-shadowdark");
    assert.equal(writes[0].key, "encounterContext");
    assert.deepEqual(writes[0].value, result);
  } finally {
    globalThis.game = previousGame;
  }
});

test("non-GM setter cannot mutate Scene environment context", async () => {
  let writes = 0;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  globalThis.game = { user: { isGM: false } };
  globalThis.ui = { notifications: { warn: () => {} } };

  try {
    const result = await setSceneEnvironmentContext({}, {
      setFlag: async () => { writes += 1; },
    });

    assert.equal(result, null);
    assert.equal(writes, 0);
  } finally {
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
  }
});

test("environment Scene update detection supports flattened and nested Foundry updates", () => {
  assert.equal(environmentFlagChanged({
    "flags.mk-shadowdark.encounterContext": { terrain: "Crypt" },
  }), true);

  assert.equal(environmentFlagChanged({
    flags: {
      "mk-shadowdark": {
        encounterContext: { terrain: "Crypt" },
      },
    },
  }), true);

  assert.equal(environmentFlagChanged({ name: "Different Scene Name" }), false);
  assert.equal(ENVIRONMENT_CHANGED_HOOK, "mkShadowdarkEnvironmentChanged");
});
