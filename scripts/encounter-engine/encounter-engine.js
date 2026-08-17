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

// Encounter cards are still used by Group Exploration/Resting. Keep their
// interactive GM/reveal behavior, but remove every standalone encounter entry point.
Hooks.on("renderChatMessage", bindEncounterCard);

Hooks.once("ready", () => {
  exposeApi();
  log("Ready (internal Group encounter service only).");
});

export {
  exposeApi,
};
