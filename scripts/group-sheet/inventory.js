import {
  ABILITIES,
  GROUP_CAMPING_FOOD_KEYWORDS_DEFAULT,
  GROUP_CAMPING_TORCH_KEYWORDS_DEFAULT,
  GROUP_CAMPING_WATER_KEYWORDS_DEFAULT,
  GROUP_SETTING_CAMPING_FOOD_KEYWORDS,
  GROUP_SETTING_CAMPING_TORCH_KEYWORDS,
  GROUP_SETTING_CAMPING_WATER_KEYWORDS,
} from "./constants.js";
import {
  canUserControlActor,
  getActorAbilityModifier,
  getFreeCoinCarry,
  getGemsPerSlot,
  getGroupInventoryMaxSlots,
} from "./actors.js";
import { getSettingValue } from "./group-settings.js";
import { clampPercent, hasOwn, numberOrZero, signed } from "./utils.js";
function quantityOrOne(item) {
  const raw = item?.system?.quantity?.value ?? item?.system?.quantity;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 1;
}

function normalizeItemName(item) {
  return String(item?.name ?? "").trim().toLowerCase();
}

function isLostItem(item) {
  return Boolean(item?.system?.lost);
}

function splitCampingKeywords(value) {
  return String(value ?? "")
    .split(",")
    .map(keyword => keyword.trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function itemNameMatchesKeyword(itemName, keyword) {
  if (!keyword) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}s?\\b`, "i");
  return pattern.test(itemName);
}

function itemMatchesAnyKeyword(item, keywords = []) {
  const name = normalizeItemName(item);
  return keywords.some(keyword => itemNameMatchesKeyword(name, keyword));
}

function getCampingResourceKeywords() {
  return {
    food: splitCampingKeywords(
      getSettingValue(GROUP_SETTING_CAMPING_FOOD_KEYWORDS, GROUP_CAMPING_FOOD_KEYWORDS_DEFAULT),
    ),
    torches: splitCampingKeywords(
      getSettingValue(GROUP_SETTING_CAMPING_TORCH_KEYWORDS, GROUP_CAMPING_TORCH_KEYWORDS_DEFAULT),
    ),
    water: splitCampingKeywords(
      getSettingValue(GROUP_SETTING_CAMPING_WATER_KEYWORDS, GROUP_CAMPING_WATER_KEYWORDS_DEFAULT),
    ),
  };
}

function countCampingResourceItems(items = [], keywords = getCampingResourceKeywords()) {
  const totals = {
    food: 0,
    torches: 0,
    water: 0,
  };

  for (const item of items ?? []) {
    if (!item || isLostItem(item)) continue;

    const quantity = quantityOrOne(item);
    if (itemMatchesAnyKeyword(item, keywords.food)) totals.food += quantity;
    if (itemMatchesAnyKeyword(item, keywords.torches)) totals.torches += quantity;
    if (itemMatchesAnyKeyword(item, keywords.water)) totals.water += quantity;
  }

  return totals;
}

function buildCampingResources(memberActors = [], groupActor) {
  const keywords = getCampingResourceKeywords();
  const memberTotals = {
    food: 0,
    torches: 0,
    water: 0,
  };

  for (const actor of memberActors) {
    const actorTotals = countCampingResourceItems(actor?.items, keywords);
    memberTotals.food += actorTotals.food;
    memberTotals.torches += actorTotals.torches;
    memberTotals.water += actorTotals.water;
  }

  const sharedTotals = countCampingResourceItems(groupActor?.items, keywords);

  return {
    food: {
      members: memberTotals.food,
      shared: sharedTotals.food,
      total: memberTotals.food + sharedTotals.food,
    },
    torches: {
      members: memberTotals.torches,
      shared: sharedTotals.torches,
      total: memberTotals.torches + sharedTotals.torches,
    },
    water: {
      members: memberTotals.water,
      shared: sharedTotals.water,
      total: memberTotals.water + sharedTotals.water,
    },
  };
}

function calculateActorGearSlots(actor) {
  if (!actor || actor.type !== "Player") {
    return {
      total: "-",
      max: "-",
      over: false,
    };
  }

  const slots = {
    total: 0,
    gear: 0,
    treasure: 0,
    coins: 0,
    gems: 0,
  };

  const freeCarrySeen = {};
  let totalGems = 0;

  for (const item of actor.items ?? []) {
    if (item.type === "Gem") {
      totalGems += Number(item.system?.quantity ?? 1) || 1;
      continue;
    }

    const system = item.system ?? {};

    if (!system.isPhysical || !system.slots) continue;
    if (system.stashed) continue;

    let freeCarry = Number(system.slots.free_carry ?? 0);

    if (hasOwn(freeCarrySeen, item.name)) {
      freeCarry = Math.max(0, freeCarry - freeCarrySeen[item.name]);
      freeCarrySeen[item.name] += freeCarry;
    } else {
      freeCarrySeen[item.name] = freeCarry;
    }

    const perSlot = Number(system.slots.per_slot ?? 1) || 1;
    const quantity = Number(system.quantity ?? 1) || 1;
    const slotsUsed = Number(system.slots.slots_used ?? 0) || 0;

    let totalSlotsUsed = Math.ceil(quantity / perSlot) * slotsUsed;
    totalSlotsUsed -= freeCarry * slotsUsed;
    totalSlotsUsed = Math.max(0, totalSlotsUsed);

    if (system.treasure) {
      slots.treasure += totalSlotsUsed;
    } else {
      slots.gear += totalSlotsUsed;
    }
  }

  const coins = actor.system?.coins ?? {};
  const totalCoins =
    numberOrZero(coins.gp) +
    numberOrZero(coins.sp) +
    numberOrZero(coins.cp);

  const freeCoins = getFreeCoinCarry();

  if (totalCoins > freeCoins) {
    slots.coins = Math.ceil((totalCoins - freeCoins) / freeCoins);
  }

  const gemsPerSlot = getGemsPerSlot();

  if (totalGems > 0) {
    slots.gems = Math.ceil(totalGems / gemsPerSlot);
  }

  slots.total = slots.gear + slots.treasure + slots.coins + slots.gems;

  const max = actor.numGearSlots?.() ?? actor.system?.slots ?? 10;

  return {
    total: slots.total,
    max,
    over: slots.total > max,
  };
}

function calculateItemSlots(item) {
  const system = item.system ?? {};

  if (!system.isPhysical || !system.slots) return 0;
  if (system.stashed) return 0;

  const perSlot = Number(system.slots.per_slot ?? 1) || 1;
  const quantity = Number(system.quantity ?? 1) || 1;
  const slotsUsed = Number(system.slots.slots_used ?? 0) || 0;
  const freeCarry = Number(system.slots.free_carry ?? 0) || 0;

  const used = Math.ceil(quantity / perSlot) * slotsUsed - freeCarry * slotsUsed;

  return Math.max(0, used);
}

function calculateGroupInventorySlots(actor) {
  const total = [...actor.items].reduce((sum, item) => {
    return sum + calculateItemSlots(item);
  }, 0);

  const max = getGroupInventoryMaxSlots(actor);

  return {
    total,
    max,
    over: total > max,
  };
}

function calculateCoinSlots(actor) {
  const coins = actor.system?.coins ?? {};

  const totalCoins =
    numberOrZero(coins.gp) +
    numberOrZero(coins.sp) +
    numberOrZero(coins.cp);

  const freeCoins = getFreeCoinCarry();

  if (totalCoins <= freeCoins) return 0;

  return Math.ceil((totalCoins - freeCoins) / freeCoins);
}

async function getActorClassName(actor) {
  if (!actor) return "";

  if (actor.type === "NPC") return "NPC";

  if (actor.type === "Player") {
    const cls = await actor.getClass?.();
    if (cls?.name) return cls.name;

    const title = await actor.getTitle?.();
    if (title) return title;

    return "Player";
  }

  return actor.type;
}

async function buildMemberData(actor) {
  const hp = actor.system?.attributes?.hp ?? {};
  const hpValue = Number(hp.value ?? 0);
  const hpMax = Number(hp.max ?? hpValue ?? 0);
  const hpPct = hpMax > 0 ? clampPercent((hpValue / hpMax) * 100) : 0;

  const level = Number(actor.system?.level?.value ?? 0);
  const xp = Number(actor.system?.level?.xp ?? 0);
  const xpNext = level > 0 ? level * 10 : 0;

  const abilities = ABILITIES.map(([key, label]) => {
    const mod = getActorAbilityModifier(actor, key);

    return {
      key,
      label,
      mod: signed(mod),
    };
  });

  const slots = calculateActorGearSlots(actor);

  return {
    uuid: actor.uuid,
    id: actor.id,
    name: actor.name,
    img: actor.img,
    type: actor.type,
    className: await getActorClassName(actor),
    isPlayer: actor.type === "Player",
    canAssign: canUserControlActor(actor),
    canRoll: canUserControlActor(actor),
    hp: {
      value: hpValue,
      max: hpMax,
      pct: hpPct,
    },
    ac: actor.system?.attributes?.ac?.value ?? "-",
    level,
    xp: {
      value: xp,
      next: xpNext,
    },
    slots,
    abilities,
  };
}

function buildHeaderSummary(members) {
  const hpValue = members.reduce((total, member) => total + Number(member.hp.value ?? 0), 0);
  const hpMax = members.reduce((total, member) => total + Number(member.hp.max ?? 0), 0);

  const acValues = members
    .map(member => Number(member.ac))
    .filter(value => Number.isFinite(value));

  const levelValues = members
    .map(member => Number(member.level))
    .filter(value => Number.isFinite(value));

  const acAverage = acValues.length
    ? Math.round(acValues.reduce((total, value) => total + value, 0) / acValues.length)
    : "-";

  const levelAverage = levelValues.length
    ? Math.round(levelValues.reduce((total, value) => total + value, 0) / levelValues.length)
    : "-";

  return {
    count: members.length,
    hp: {
      value: hpValue,
      max: hpMax,
    },
    ac: acAverage,
    level: levelAverage,
  };
}

function buildInventoryItemData(item) {
  const system = item.system ?? {};
  const slots = calculateItemSlots(item);

  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img,
    type: item.type,
    quantity: Number(system.quantity ?? 1) || 1,
    treasure: !!system.treasure,
    stashed: !!system.stashed,
    lost: !!system.lost,
    slots,
  };
}
export {
  buildCampingResources,
  calculateActorGearSlots,
  calculateItemSlots,
  calculateGroupInventorySlots,
  calculateCoinSlots,
  getActorClassName,
  buildMemberData,
  buildHeaderSummary,
  buildInventoryItemData,
};
