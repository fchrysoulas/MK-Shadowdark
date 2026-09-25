import {
  BASTION_ACTOR_TYPE,
  MODULE_ID,
} from "./constants.js";
import { registerBastionDataModel } from "./data-model.js";
import { createBastionActor, MKBastionSheet } from "./sheet.js";

let bastionSheetRegistered = false;

function registerBastionSheet() {
  if (bastionSheetRegistered) return true;

  if (!registerBastionDataModel()) {
    console.error(`${MODULE_ID} | Bastion Sheet | Actor data model registry is unavailable.`);
    return false;
  }

  const ActorsCollection = globalThis.foundry?.documents?.collections?.Actors;
  if (!ActorsCollection?.registerSheet) {
    throw new Error(`${MODULE_ID} | Bastion Sheet | Foundry Actor sheet registration API is unavailable.`);
  }

  CONFIG.Actor.typeLabels ??= {};
  CONFIG.Actor.typeLabels[BASTION_ACTOR_TYPE] ??= "Bastion";
  CONFIG.Actor.typeIcons ??= {};
  CONFIG.Actor.typeIcons[BASTION_ACTOR_TYPE] ??= "fa-solid fa-landmark";

  ActorsCollection.registerSheet(MODULE_ID, MKBastionSheet, {
    types: [BASTION_ACTOR_TYPE],
    makeDefault: true,
    label: "MK-Shadowdark: Bastion Sheet",
  });

  game.mkShadowdark ??= {};
  game.mkShadowdark.createBastionActor = createBastionActor;
  bastionSheetRegistered = true;
  return true;
}

export { registerBastionSheet };
