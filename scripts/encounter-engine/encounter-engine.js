import {
  DEFAULT_PROFILES,
  MODULE_ID,
} from "./constants.js";
import {
  deepClone,
  getProfiles,
  getSceneEncounterContext,
  log,
  setSceneEncounterContext,
} from "./helpers.js";
import { createEncounterServiceApi } from "./service.js";
import {
  bindEncounterCard,
  renderEncounterCard,
  rerollEncounterField,
  rerollEntireEncounter,
} from "./chat.js";

const GROUP_ENCOUNTER_SETTING_PRESENTATION = Object.freeze({
  encounterEngineEnabled: {
    name: "Group Encounters | Enabled",
    hint: "Enables Group Exploration and Resting encounter checks and resolution.",
  },
  encounterEngineAutoTimePasses: {
    name: "Legacy Encounter / Time Passes Integration",
    hint: "Deprecated compatibility setting. Time Passes no longer determines or resolves encounters.",
    config: false,
  },
  encounterEngineDefaultTableUuid: {
    name: "Group Encounters | Default Encounter Table UUID",
    hint: "Fallback encounter RollTable UUID used when the active Scene environment profile has no matching terrain/time table.",
  },
  encounterEngineDefaultProfile: {
    name: "Group Encounters | Default Environment Profile ID",
    hint: "Environment profile used by Scenes that do not have their own Group encounter context.",
  },
  encounterEngineWhisperToGm: {
    name: "Group Encounters | GM-only Encounter Cards",
    hint: "Whispers full Group encounter cards to active GMs until they are intentionally revealed.",
  },
  encounterEngineShowDice3d: {
    name: "Group Encounters | Show 3D Procedure Dice",
    hint: "Shows Group encounter procedure dice to GMs when Dice So Nice is active.",
  },
  encounterEngineProfiles: {
    name: "Group Encounter Environment Profiles",
    hint: "Internal JSON storage for Group encounter environment profiles. Configure the active Scene from Group Traveling.",
    config: false,
  },
});

function relabelLegacyEncounterSettings() {
  const registry = game.settings?.settings;
  if (!registry?.get) return 0;

  let changed = 0;
  for (const [key, presentation] of Object.entries(GROUP_ENCOUNTER_SETTING_PRESENTATION)) {
    const definition = registry.get(`${MODULE_ID}.${key}`);
    if (!definition) continue;
    Object.assign(definition, presentation);
    changed += 1;
  }

  return changed;
}

function exposeApi() {
  const module = game.modules?.get(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  const service = createEncounterServiceApi();

  module.api.encounterService = service;
  module.api.encounters = {
    version: 3,
    headless: true,
    service,
    getContext: service.getContext,
    check: service.check,
    resolve: service.resolve,
    checkAndResolve: service.checkAndResolve,
    getProfiles,
    getSceneContext: getSceneEncounterContext,
    setSceneContext: setSceneEncounterContext,
    rerollField: rerollEncounterField,
    rerollAll: rerollEntireEncounter,
    renderCard: renderEncounterCard,
    defaults: () => deepClone(DEFAULT_PROFILES),
  };

  game.mkShadowdark ??= {};
  game.mkShadowdark.encounterService = service;
  game.mkShadowdark.encounters = module.api.encounters;

  return module.api.encounters;
}

Hooks.once("init", relabelLegacyEncounterSettings);

// Encounter cards are still used by Group Exploration/Resting. Keep their
// interactive GM/reveal behavior, but remove every standalone encounter entry point.
Hooks.on("renderChatMessage", bindEncounterCard);

Hooks.once("ready", () => {
  exposeApi();
  log("Ready (internal Group encounter service only).");
});

export {
  GROUP_ENCOUNTER_SETTING_PRESENTATION,
  relabelLegacyEncounterSettings,
  exposeApi,
};
