import { advanceWoundRecovery } from "./recovery-core.js";

const MODULE_ID = "mk-shadowdark";
const FLAG_KEY = "detailedWounds";
const EFFECT_FLAG = "woundPenalties";
const combatRounds = new Map();

function isEnabled() {
  try {
    return game.settings.get(MODULE_ID, "detailedWoundsEnabled") !== false;
  } catch (_error) {
    return true;
  }
}

function isPlayerActor(actor) {
  return actor?.documentName === "Actor" && actor.type === "Player";
}

function isPrimaryActiveGM() {
  const activeGms = (game.users ?? [])
    .filter(user => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const authority = activeGms[0];
  return authority ? game.user?.id === authority.id : game.user?.isGM === true;
}

function currentRound(combat) {
  const round = Math.floor(Number(combat?.round));
  return Number.isFinite(round) && round > 0 ? round : 0;
}

function activeEffectForWoundPenalties(actor) {
  return actor?.effects?.find(effect => (
    effect.getFlag?.(MODULE_ID, EFFECT_FLAG)
    ?? effect.flags?.[MODULE_ID]?.[EFFECT_FLAG]
  ));
}

async function syncWoundPenaltyEffect(actor) {
  const woundsApi = game.modules.get(MODULE_ID)?.api?.wounds;
  if (typeof woundsApi?.getPenaltyChanges !== "function") return;

  const existing = activeEffectForWoundPenalties(actor);
  const changes = woundsApi.getPenaltyChanges(actor) ?? [];

  if (!changes.length) {
    if (existing) await existing.delete();
    return;
  }

  const effectData = {
    name: "Wound Penalties",
    img: "icons/svg/blood.svg",
    changes,
    disabled: false,
    origin: actor.uuid,
    flags: { [MODULE_ID]: { [EFFECT_FLAG]: true } }
  };

  if (existing) await existing.update(effectData);
  else await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
}

async function advanceActorRecovery(actor, {
  rounds = 0,
  restDays = 0,
  source = "manual"
} = {}) {
  if (!isEnabled() || !isPlayerActor(actor) || typeof actor?.setFlag !== "function") {
    return { changed: false, transitions: [], source };
  }

  const rawData = actor.getFlag(MODULE_ID, FLAG_KEY);
  if (!rawData) return { changed: false, transitions: [], source };

  const result = advanceWoundRecovery(rawData, { rounds, restDays });
  if (!result.changed) return { ...result, source };

  await actor.setFlag(MODULE_ID, FLAG_KEY, result.data);
  await syncWoundPenaltyEffect(actor);
  actor.sheet?.render?.(false);

  return { ...result, source };
}

function uniqueCombatActors(combat) {
  const actors = new Map();
  for (const combatant of combat?.combatants ?? []) {
    const actor = combatant?.actor;
    if (!isPlayerActor(actor)) continue;
    const key = actor.uuid ?? actor.id;
    if (key && !actors.has(key)) actors.set(key, actor);
  }
  return [...actors.values()];
}

async function advanceCombatRecovery(combat, rounds) {
  const step = Math.max(0, Math.floor(Number(rounds)) || 0);
  if (!step) return [];

  const results = [];
  for (const actor of uniqueCombatActors(combat)) {
    try {
      const result = await advanceActorRecovery(actor, {
        rounds: step,
        source: "combat-round"
      });
      results.push({ actorUuid: actor.uuid ?? actor.id, ...result });
    } catch (error) {
      console.error(`${MODULE_ID} | Detailed Wounds Recovery | Could not advance ${actor.name}.`, error);
    }
  }
  return results;
}

function initializeCombatRound(combat) {
  if (!combat?.id) return;
  combatRounds.set(combat.id, currentRound(combat));
}

function handleCombatUpdate(combat, changes) {
  if (!isEnabled() || !isPrimaryActiveGM()) return;
  if (!changes || !Object.prototype.hasOwnProperty.call(changes, "round")) return;

  const nextRound = currentRound(combat);
  const previousRound = combatRounds.get(combat.id);
  combatRounds.set(combat.id, nextRound);

  if (!Number.isFinite(previousRound)) return;
  const elapsedRounds = nextRound - previousRound;
  if (elapsedRounds <= 0) return;

  void advanceCombatRecovery(combat, elapsedRounds);
}

function registerRecoveryApi() {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;

  mod.api = mod.api ?? {};
  mod.api.woundRecovery = {
    advanceActor: advanceActorRecovery,
    advanceCombat: advanceCombatRecovery
  };
}

Hooks.once("init", registerRecoveryApi);
Hooks.once("ready", () => {
  for (const combat of game.combats ?? []) initializeCombatRound(combat);
});
Hooks.on("createCombat", initializeCombatRound);
Hooks.on("updateCombat", handleCombatUpdate);
Hooks.on("deleteCombat", combat => {
  if (combat?.id) combatRounds.delete(combat.id);
});

export {
  advanceActorRecovery,
  advanceCombatRecovery,
  currentRound,
  handleCombatUpdate,
  initializeCombatRound,
  isPrimaryActiveGM,
  uniqueCombatActors
};
