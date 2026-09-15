import { deriveWoundFunctionalState } from "./functional-consequences-core.js";

const MODULE_ID = "mk-shadowdark";
const FLAG_KEY = "detailedWounds";

function isPlayerActor(actor) {
  return actor?.documentName === "Actor" && actor.type === "Player";
}

function getFunctionalState(actor, options = {}) {
  if (!isPlayerActor(actor)) return null;
  return deriveWoundFunctionalState(actor.getFlag?.(MODULE_ID, FLAG_KEY), options);
}

Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;

  mod.api = mod.api ?? {};
  mod.api.wounds = mod.api.wounds ?? {};
  mod.api.wounds.getFunctionalState = getFunctionalState;
});

export {
  getFunctionalState
};
