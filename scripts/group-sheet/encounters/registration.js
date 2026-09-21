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

  const groupEncounters = Object.freeze({
    version: 4,
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
  });

  module.api.groupEncounters = groupEncounters;
  game.mkShadowdark ??= {};
  game.mkShadowdark.groupEncounters = groupEncounters;

  return groupEncounters;
}

// Group Exploration and Resting own encounter initiation. This registration
// only keeps their shared chat-card behavior and public Group API available.
Hooks.on("renderChatMessage", bindEncounterCard);

Hooks.once("ready", () => {
  exposeApi();
  log("Ready (Group encounter services).");
});

export {
  exposeApi,
};
