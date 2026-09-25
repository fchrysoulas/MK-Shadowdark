import { MODULE_ID } from "./constants.js";
import {
  getSceneEncounterContext,
  isGroupEncountersEnabled,
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

// Keep legacy Group encounter chat-card behavior and the headless API available
// for existing records and integrations. New encounter rolls are initiated
// manually from the GM Screen Encounter Zone workspace.
Hooks.on("renderChatMessage", (app, html) => {
  if (isGroupEncountersEnabled()) bindEncounterCard(app, html);
});

Hooks.once("ready", () => {
  exposeApi();
  log(isGroupEncountersEnabled()
    ? "Ready (Group encounter services)."
    : "Ready (Group encounter services disabled).");
});

export {
  isGroupEncountersEnabled,
  exposeApi,
};
