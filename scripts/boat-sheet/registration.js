import { BOAT_ACTOR_TYPE, MODULE_ID, boatLabel } from "./constants.js";
import { registerBoatDataModel } from "./data-model.js";
import { createBoatActor, MKBoatSheet } from "./sheet.js";

let registered = false;

function registerBoatSheet() {
  if (registered) return true;
  if (!registerBoatDataModel()) return false;
  const actors = globalThis.foundry?.documents?.collections?.Actors;
  if (!actors?.registerSheet) return false;
  CONFIG.Actor.typeLabels ??= {};
  CONFIG.Actor.typeLabels[BOAT_ACTOR_TYPE] = "TYPES.Actor.mk-shadowdark.boat";
  CONFIG.Actor.typeIcons ??= {};
  CONFIG.Actor.typeIcons[BOAT_ACTOR_TYPE] = "fa-solid fa-ship";
  actors.registerSheet(MODULE_ID, MKBoatSheet, {
    types: [BOAT_ACTOR_TYPE], makeDefault: true, label: boatLabel("sheetName"),
  });
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (module) {
    module.api ??= {};
    module.api.createBoatActor = createBoatActor;
  }
  registered = true;
  return true;
}

export { registerBoatSheet };
