import { BOAT_ACTOR_TYPE, BOAT_SHEET_ID } from "./constants.js";
import { getBoatCrew } from "./crew.js";
import { registerBoatSheet } from "./registration.js";
import { MKBoatSheet } from "./sheet.js";

Hooks.once("init", registerBoatSheet);
for (const hook of ["updateActor", "deleteActor"]) {
  Hooks.on(hook, actor => {
    if (!actor?.uuid) return;
    for (const sheet of Object.values(globalThis.ui?.windows ?? {})) {
      if (sheet instanceof MKBoatSheet && sheet.rendered
        && getBoatCrew(sheet.actor).some(entry => entry.actorUuid === actor.uuid)) sheet.render(false);
    }
  });
}

// Native creation also needs a hull bar when the Group Sheet creation dialog is disabled.
Hooks.on("preCreateActor", (actor, data) => {
  if (actor.type !== BOAT_ACTOR_TYPE) return;
  actor.updateSource({
    "prototypeToken.actorLink": true,
    "prototypeToken.bar1.attribute": "attributes.hp",
    "flags.core.sheetClass": BOAT_SHEET_ID,
    ...(!data?.img ? { img: "icons/svg/anchor.svg", "prototypeToken.texture.src": "icons/svg/anchor.svg" } : {}),
  });
});
