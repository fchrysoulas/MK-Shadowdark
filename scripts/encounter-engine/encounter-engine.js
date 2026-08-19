import { MODULE_ID } from "./constants.js";
import {
  getSceneEncounterContext,
  log,
  setSceneEncounterContext,
} from "./helpers.js";
import { createEncounterServiceApi } from "./service.js";
import {
  buildEncounterStagingPreview,
  deployEncounterStaging,
  openEncounterStagingDialog,
} from "./staging.js";
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
    hint: "Fallback encounter RollTable UUID used when Scene Context does not specify a table.",
  },
  encounterEngineDefaultProfile: {
    name: "Legacy Encounter Rules ID",
    hint: "Deprecated internal compatibility storage. Current Scene Context does not use Profiles.",
    config: false,
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
    name: "Legacy Encounter Rules Storage",
    hint: "Deprecated internal compatibility storage for rerolling older encounter records.",
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
  const staging = Object.freeze({
    preview: buildEncounterStagingPreview,
    deploy: deployEncounterStaging,
    openDialog: openEncounterStagingDialog,
  });

  module.api.encounterService = service;
  module.api.encounterStaging = staging;
  module.api.encounters = {
    version: 4,
    headless: true,
    service,
    staging,
    getContext: service.getContext,
    check: service.check,
    resolve: service.resolve,
    checkAndResolve: service.checkAndResolve,
    getSceneContext: getSceneEncounterContext,
    setSceneContext: setSceneEncounterContext,
    rerollField: rerollEncounterField,
    rerollAll: rerollEntireEncounter,
    renderCard: renderEncounterCard,
  };

  game.mkShadowdark ??= {};
  game.mkShadowdark.encounterService = service;
  game.mkShadowdark.encounterStaging = staging;
  game.mkShadowdark.encounters = module.api.encounters;

  return module.api.encounters;
}

Hooks.once("init", relabelLegacyEncounterSettings);

// Encounter cards are still used by Group Exploration/Resting. Keep their
// interactive GM/reveal/staging behavior without reintroducing standalone entry points.
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
