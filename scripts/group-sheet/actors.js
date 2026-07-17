import {
  GROUP_HP_DEFAULT,
  GROUP_HP_MAX_PATH,
  GROUP_HP_VALUE_PATH,
  MODULE_ID,
} from "./constants.js";
function canUserControlActor(actor, user = game.user) {
  if (!actor || !user) return false;
  if (user.isGM) return true;

  const character = typeof user.character === "string"
    ? game.actors?.get(user.character)
    : user.character;
  if (character && (actor.id === character.id || actor.uuid === character.uuid)) return true;

  if (user.id === game.user?.id && actor.isOwner) return true;

  return actor.testUserPermission?.(user, "OWNER") ?? false;
}

function getActorAbilityModifier(actor, ability) {
  if (!actor || !ability) return 0;

  let mod = 0;

  if (typeof actor.abilityModifier === "function") {
    mod = actor.abilityModifier(ability);
  } else {
    mod = actor.system?.abilities?.[ability]?.mod ?? 0;
  }

  const number = Number(mod);
  return Number.isFinite(number) ? number : 0;
}

function getBestActivityAbility(actor, activity) {
  const abilities = Array.isArray(activity?.abilities) ? activity.abilities : [];
  if (!abilities.length) return "";

  return abilities.reduce((best, ability) => {
    if (!best) return ability;
    return getActorAbilityModifier(actor, ability) > getActorAbilityModifier(actor, best)
      ? ability
      : best;
  }, "");
}

function getSafeFlag(actor, scope, key) {
  if (!actor?.getFlag || !scope || !key) return undefined;

  try {
    return actor.getFlag(scope, key);
  } catch (error) {
    const message = String(error?.message ?? error ?? "");

    if (message.includes("Flag scope")) {
      return undefined;
    }

    console.warn(`${MODULE_ID} | GroupSheet | Could not read flag ${scope}.${key}`, error);
    return undefined;
  }
}

function getModuleFlag(actor, key, fallback = undefined) {
  const current = getSafeFlag(actor, MODULE_ID, key);
  return current !== undefined ? current : fallback;
}

function isGroupActor(actor) {
  return Boolean(getModuleFlag(actor, "isGroup", false));
}

function numericProperty(document, path) {
  const number = Number(foundry.utils.getProperty(document, path));
  return Number.isFinite(number) ? number : null;
}

function buildGroupHpDefaultUpdate(actor) {
  const update = {};
  const hpValue = numericProperty(actor, GROUP_HP_VALUE_PATH);
  const hpMax = numericProperty(actor, GROUP_HP_MAX_PATH);

  if (hpValue !== GROUP_HP_DEFAULT) update[GROUP_HP_VALUE_PATH] = GROUP_HP_DEFAULT;
  if (hpMax !== GROUP_HP_DEFAULT) update[GROUP_HP_MAX_PATH] = GROUP_HP_DEFAULT;

  return update;
}

async function ensureGroupActorHpDefaults(actor) {
  if (!actor?.update || !isGroupActor(actor)) return false;

  const update = buildGroupHpDefaultUpdate(actor);
  if (!Object.keys(update).length) return false;

  await actor.update(update);
  return true;
}

function getGroupInventoryMaxSlots(actor) {
  return Number(getModuleFlag(actor, "groupInventoryMaxSlots", 10)) || 10;
}

function getFreeCoinCarry() {
  return globalThis.shadowdark?.defaults?.FREE_COIN_CARRY ?? 100;
}

function getGemsPerSlot() {
  return CONFIG.SHADOWDARK?.DEFAULTS?.GEMS_PER_SLOT ?? 10;
}

async function resolveActorFromUuid(uuid) {
  if (!uuid) return null;

  const doc = await fromUuid(uuid);
  if (!doc) return null;

  if (doc.documentName === "Actor") return doc;

  if (doc.documentName === "Token") {
    return doc.actor ?? null;
  }

  return null;
}

async function resolveItemFromDropData(data) {
  if (!data) return null;

  if (data.uuid) {
    const doc = await fromUuid(data.uuid);
    if (doc?.documentName === "Item") return doc;
  }

  if (data.id && data.type === "Item") {
    return game.items.get(data.id) ?? null;
  }

  return null;
}
export {
  canUserControlActor,
  getActorAbilityModifier,
  getBestActivityAbility,
  getSafeFlag,
  getModuleFlag,
  isGroupActor,
  ensureGroupActorHpDefaults,
  getGroupInventoryMaxSlots,
  getFreeCoinCarry,
  getGemsPerSlot,
  resolveActorFromUuid,
  resolveItemFromDropData,
};
