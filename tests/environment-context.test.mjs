import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CANONICAL_ENVIRONMENT_RULES,
  DEFAULT_ENVIRONMENT_PROFILES,
  ENVIRONMENT_CHANGED_HOOK,
  ENVIRONMENT_SCENE_FLAG,
  determineEnvironmentPeriod,
  environmentFlagChanged,
  getSceneEnvironmentContext,
  migrateLegacySceneContexts,
  normalizeEnvironmentProfiles,
  normalizeSceneEnvironmentContext,
  publicResolvedContext,
  resolveEnvironmentContext,
  setSceneEnvironmentContext,
} from "../scripts/libs/environment-context.js";
import {
  getSceneEncounterContext,
  normalizeProfiles,
} from "../scripts/encounter-engine/helpers.js";

const runtime = fs.readFileSync(new URL("../scripts/libs/environment-context.js", import.meta.url), "utf8");

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

test("shared environment service remains the canonical Encounter context implementation", () => {
  assert.equal(normalizeProfiles, normalizeEnvironmentProfiles);
  assert.equal(getSceneEncounterContext, getSceneEnvironmentContext);
});

test("canonical Shadowdark rules preserve current encounter cadence", () => {
  assert.equal(CANONICAL_ENVIRONMENT_RULES.name, "Shadowdark Core");
  assert.equal(CANONICAL_ENVIRONMENT_RULES.defaultTerrain, "Default");
  assert.equal(CANONICAL_ENVIRONMENT_RULES.defaultDangerLevel, "unsafe");
  assert.equal(CANONICAL_ENVIRONMENT_RULES.dangerLevels.unsafe.interval, 3);
  assert.equal(CANONICAL_ENVIRONMENT_RULES.dangerLevels.risky.interval, 2);
  assert.equal(CANONICAL_ENVIRONMENT_RULES.dangerLevels.deadly.interval, 1);
  assert.deepEqual(CANONICAL_ENVIRONMENT_RULES.dangerLevels.unsafe.encounterOn, [1]);
});

test("legacy profile JSON remains readable for old encounter rerolls", () => {
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

test("Scene Context strips legacy profileId and exposes exactly four fields", () => {
  const scene = {
    getFlag: (scope, key) => {
      assert.equal(scope, "mk-shadowdark");
      assert.equal(key, ENVIRONMENT_SCENE_FLAG);
      return {
        profileId: "wastes",
        terrain: "Ruins",
        dangerLevel: "deadly",
        period: "night",
        tableUuid: "RollTable.override",
      };
    },
  };

  assert.deepEqual(withGame({}, () => getSceneEnvironmentContext(scene)), {
    terrain: "Ruins",
    dangerLevel: "deadly",
    period: "night",
    tableUuid: "RollTable.override",
  });
});

test("hidden default Profile and Scene profileId cannot change current runtime rules", () => {
  const resolved = withGame({
    settings: {
      encounterEngineProfiles: JSON.stringify({
        custom: {
          name: "Custom",
          defaultTerrain: "Salt Flats",
          defaultDangerLevel: "unsafe",
          terrains: { "Salt Flats": { any: "RollTable.custom" } },
          dangerLevels: {
            unsafe: { label: "Custom Unsafe", interval: 9, formula: "1d20", encounterOn: [20] },
          },
        },
      }),
      encounterEngineDefaultProfile: "custom",
      encounterEngineDefaultTableUuid: "RollTable.default",
    },
    worldTime: 22 * 3600,
  }, () => resolveEnvironmentContext({
    profileId: "custom",
    terrain: "Salt Flats",
    dangerLevel: "unsafe",
    period: "auto",
    tableUuid: "",
  }, {
    scene: { id: "scene-1", uuid: "Scene.scene-1", name: "The Flats" },
  }));

  assert.equal(resolved.sceneId, "scene-1");
  assert.equal(resolved.sceneName, "The Flats");
  assert.equal(resolved.requestedPeriod, "auto");
  assert.equal(resolved.period, "night");
  assert.equal(resolved.tableUuid, "RollTable.default");
  assert.equal(resolved.danger.label, "Unsafe");
  assert.equal(resolved.encounter.interval, 3);
  assert.equal(resolved.encounter.formula, "1d6");
  assert.deepEqual(resolved.encounter.encounterOn, [1]);
  assert.equal(resolved.profile, CANONICAL_ENVIRONMENT_RULES);
});

test("explicit encounter table override wins over the world fallback", () => {
  const resolved = withGame({
    settings: { encounterEngineDefaultTableUuid: "RollTable.default" },
  }, () => resolveEnvironmentContext({
    terrain: "Any Terrain",
    dangerLevel: "unsafe",
    period: "day",
    tableUuid: "RollTable.override",
  }));

  assert.equal(resolved.explicitTableUuid, "RollTable.override");
  assert.equal(resolved.tableUuid, "RollTable.override");
});

test("period resolution supports automatic and explicit day/night", () => {
  const rules = { dayStart: 6, nightStart: 18 };

  assert.equal(determineEnvironmentPeriod(rules, "auto", 8 * 3600), "day");
  assert.equal(determineEnvironmentPeriod(rules, "auto", 22 * 3600), "night");
  assert.equal(determineEnvironmentPeriod(rules, "day", 22 * 3600), "day");
  assert.equal(determineEnvironmentPeriod(rules, "night", 8 * 3600), "night");
});

test("invalid Scene values normalize against canonical Shadowdark rules", () => {
  const normalized = withGame({}, () => normalizeSceneEnvironmentContext({
    profileId: "custom",
    terrain: "Crypt",
    dangerLevel: "missing",
    period: "invalid",
  }));

  assert.deepEqual(normalized, {
    terrain: "Crypt",
    dangerLevel: "unsafe",
    period: "auto",
    tableUuid: "",
  });
});

test("GM setter writes only four fields and avoids no-op writes", async () => {
  const writes = [];
  const previousGame = globalThis.game;

  globalThis.game = {
    user: { isGM: true },
    settings: { settings: new Map(), get: () => undefined },
  };

  try {
    const current = {
      terrain: "Default",
      dangerLevel: "risky",
      period: "day",
      tableUuid: "RollTable.special",
    };
    const scene = {
      getFlag: () => current,
      setFlag: async (scope, key, value) => writes.push({ scope, key, value }),
    };

    const result = await setSceneEnvironmentContext({
      profileId: "legacy",
      ...current,
    }, scene);

    assert.deepEqual(result, current);
    assert.equal(writes.length, 0);

    await setSceneEnvironmentContext({ ...current, terrain: "Caves" }, scene);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].value, {
      terrain: "Caves",
      dangerLevel: "risky",
      period: "day",
      tableUuid: "RollTable.special",
    });
    assert.equal(Object.hasOwn(writes[0].value, "profileId"), false);
  } finally {
    globalThis.game = previousGame;
  }
});

test("legacy Scene migration removes profileId without losing four-field choices", async () => {
  const writes = [];
  const raw = {
    profileId: "custom",
    terrain: "Desert",
    dangerLevel: "deadly",
    period: "night",
    tableUuid: "RollTable.desert",
  };
  const scene = {
    getFlag: () => raw,
    setFlag: async (_scope, _key, value) => writes.push(value),
  };

  const migrated = await withGame({}, () => migrateLegacySceneContexts({
    user: { isGM: true },
    scenes: [scene],
  }));
  assert.equal(await migrated, 1);
  assert.deepEqual(writes[0], {
    terrain: "Desert",
    dangerLevel: "deadly",
    period: "night",
    tableUuid: "RollTable.desert",
  });
});

test("public resolved context never exposes internal Profile fields", () => {
  const publicContext = publicResolvedContext({
    profileId: "default",
    profile: CANONICAL_ENVIRONMENT_RULES,
    terrain: "Default",
    dangerLevel: "unsafe",
  });
  assert.equal(Object.hasOwn(publicContext, "profileId"), false);
  assert.equal(Object.hasOwn(publicContext, "profile"), false);
  assert.equal(publicContext.terrain, "Default");
});

test("non-GM setter cannot mutate Scene Context", async () => {
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

test("external Foundry world-time changes refresh automatic Scene Context", () => {
  assert.match(runtime, /Hooks\?\.on\?\.\("updateWorldTime"/);
  assert.match(runtime, /emitEnvironmentChanged\(currentScene\(\)\)/);
});
