import test from "node:test";
import assert from "node:assert/strict";

const previousHooks = globalThis.Hooks;
const registeredOnHooks = [];
const registeredOnceHooks = [];

globalThis.Hooks = {
  on(name) {
    registeredOnHooks.push(name);
  },
  once(name) {
    registeredOnceHooks.push(name);
  },
};

const encounterModule = await import("../scripts/encounter-engine/encounter-engine.js");
const encounterConstants = await import("../scripts/encounter-engine/constants.js");

globalThis.Hooks = previousHooks;

test("Encounter Engine registers no standalone Scene Control or RollTable context hooks", () => {
  assert.deepEqual(registeredOnHooks, ["renderChatMessage"]);
  assert.equal(registeredOnHooks.includes("getSceneControlButtons"), false);
  assert.equal(registeredOnHooks.includes("getRollTableDirectoryEntryContext"), false);
  assert.deepEqual(registeredOnceHooks.sort(), ["init", "ready"]);
});

test("standalone dialog/configuration exports are retired", () => {
  assert.equal("openEncounterDialog" in encounterModule, false);
  assert.equal("configureProfiles" in encounterModule, false);
  assert.equal("checkEncounter" in encounterModule, false);
  assert.equal("resolveEncounter" in encounterModule, false);
});

test("legacy Time Passes bridge constants are removed", () => {
  assert.equal(encounterConstants.WRAPPED_TIME_PASSES, undefined);
  assert.equal(encounterConstants.SETTINGS.autoTimePasses, undefined);
});

test("legacy Profile settings are explicitly deprecated and hidden", () => {
  const previousGame = globalThis.game;
  const settings = new Map([
    ["mk-shadowdark.encounterEngineEnabled", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineAutoTimePasses", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineDefaultTableUuid", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineDefaultProfile", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineWhisperToGm", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineShowDice3d", { name: "old", hint: "old", config: true }],
    ["mk-shadowdark.encounterEngineProfiles", { name: "old", hint: "old", config: true }],
  ]);

  globalThis.game = {
    settings: { settings },
  };

  try {
    const changed = encounterModule.relabelLegacyEncounterSettings();
    assert.equal(changed, 7);
    assert.match(settings.get("mk-shadowdark.encounterEngineEnabled").name, /^Group Encounters/);
    assert.equal(settings.get("mk-shadowdark.encounterEngineAutoTimePasses").config, false);
    assert.match(
      settings.get("mk-shadowdark.encounterEngineAutoTimePasses").hint,
      /no longer determines or resolves encounters/i
    );
    assert.equal(settings.get("mk-shadowdark.encounterEngineDefaultProfile").config, false);
    assert.match(settings.get("mk-shadowdark.encounterEngineDefaultProfile").name, /^Legacy Encounter Rules/);
    assert.match(settings.get("mk-shadowdark.encounterEngineDefaultProfile").hint, /does not use Profiles/i);
    assert.match(settings.get("mk-shadowdark.encounterEngineProfiles").name, /^Legacy Encounter Rules Storage/);
    assert.equal(settings.get("mk-shadowdark.encounterEngineProfiles").config, false);
    assert.match(settings.get("mk-shadowdark.encounterEngineProfiles").hint, /older encounter records/i);
  } finally {
    globalThis.game = previousGame;
  }
});

test("public encounter API remains headless and Profile-free while keeping internal reroll/card support", () => {
  const previousGame = globalThis.game;
  const moduleRecord = { api: {} };

  globalThis.game = {
    modules: {
      get(id) {
        return id === "mk-shadowdark" ? moduleRecord : null;
      },
    },
    mkShadowdark: {},
  };

  try {
    const api = encounterModule.exposeApi();
    assert.equal(api.headless, true);
    assert.equal(api.version, 4);
    assert.equal(typeof api.check, "function");
    assert.equal(typeof api.resolve, "function");
    assert.equal(typeof api.checkAndResolve, "function");
    assert.equal(typeof api.rerollField, "function");
    assert.equal(typeof api.renderCard, "function");
    assert.equal(typeof api.getSceneContext, "function");
    assert.equal(typeof api.setSceneContext, "function");
    assert.equal("getProfiles" in api, false);
    assert.equal("defaults" in api, false);
    assert.equal("openDialog" in api, false);
    assert.equal("configureProfiles" in api, false);
    assert.equal(moduleRecord.api.encounterService, api.service);
    assert.equal(globalThis.game.mkShadowdark.encounters, api);
  } finally {
    globalThis.game = previousGame;
  }
});
