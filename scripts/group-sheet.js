// scripts/group-sheet.js

const MODULE_ID = "mk-shadowdark";
const LEGACY_MODULE_ID = "shadowdark-extras";
const SHEET_ID = `${MODULE_ID}.SDXGroupSheet`;
const LEGACY_SHEET_ID = `${LEGACY_MODULE_ID}.SDXGroupSheet`;
const GROUP_HP_DEFAULT = 1;
const GROUP_HP_VALUE_PATH = "system.attributes.hp.value";
const GROUP_HP_MAX_PATH = "system.attributes.hp.max";
const CAMPING_MEMBER_DRAG_TYPE = "application/x-mk-shadowdark-camping-member";

const ABILITIES = [
  ["str", "STR"],
  ["dex", "DEX"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "WIS"],
  ["cha", "CHA"],
];

const SPEED_OPTIONS = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

const WEATHER_OPTIONS = [
  { value: "clear", label: "Clear" },
  { value: "normal", label: "Normal" },
  { value: "rain", label: "Rain" },
  { value: "storm", label: "Storm" },
  { value: "heat", label: "Heat" },
  { value: "cold", label: "Cold" },
];

const campingIcon = fileName => `modules/${MODULE_ID}/assets/icons/camping/${fileName}.svg`;

const TRAVEL_ACTIVITIES = [
  {
    key: "battenDown",
    name: "Bed Down",
    dc: 12,
    abilities: ["wis", "con"],
    abilityLabel: "WIS / CON",
    icon: campingIcon("bed-down"),
    description: "You do not need to make checks to benefit from rest if your sleep is interrupted during this rest.",
  },
  {
    key: "cook",
    name: "Cook",
    dc: 12,
    abilities: ["int", "wis"],
    abilityLabel: "INT / WIS",
    icon: campingIcon("cook"),
    description: "Each PC who consumes a ration gains +2 temporary HP that lasts 1 day.",
  },
  {
    key: "craft",
    name: "Craft",
    dc: 12,
    abilities: ["dex"],
    abilityLabel: "DEX",
    icon: campingIcon("craft"),
    description: "Create an item or repair a broken piece of mundane gear.",
  },
  {
    key: "entertain",
    name: "Entertain",
    dc: 12,
    abilities: ["cha"],
    abilityLabel: "CHA",
    icon: campingIcon("entertain"),
    description: "Grant 1 luck token to another PC.",
  },
  {
    key: "firewood",
    name: "Scavenge",
    dc: 12,
    abilities: ["str", "con"],
    abilityLabel: "STR / CON",
    icon: campingIcon("scavenge"),
    description: "Make one free campfire this rest without expending torches.",
  },
  {
    key: "hunt",
    name: "Hunt",
    dc: 12,
    abilities: ["str", "dex"],
    abilityLabel: "STR / DEX",
    icon: campingIcon("hunt"),
    description: "Find 1d4 rations. You cannot hunt if you pushed during today's travel.",
  },
  {
    key: "keepWatch",
    name: "Keep Watch",
    dc: 12,
    abilities: ["wis"],
    abilityLabel: "WIS",
    icon: campingIcon("keep-watch"),
    description: "You cannot be surprised during one half of the rest (you choose which).",
  },
  {
    key: "predict",
    name: "Predict",
    dc: 12,
    abilities: ["int", "wis"],
    abilityLabel: "INT / WIS",
    icon: campingIcon("predict"),
    description: "You may force a re-roll of tomorrow's weather after learning the result.",
  },
];

function sdxGroupLog(...args) {
  console.log(`${MODULE_ID} | GroupSheet |`, ...args);
}

function signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function optionLabel(options, value) {
  return options.find(option => option.value === value)?.label ?? value;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getRawFlag(actor, scope, key) {
  if (!actor || !scope || !key) return undefined;
  return actor._source?.flags?.[scope]?.[key];
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

function getFlagWithLegacy(actor, key, fallback = undefined) {
  const current = getSafeFlag(actor, MODULE_ID, key);
  if (current !== undefined) return current;

  // Important: never call actor.getFlag() with LEGACY_MODULE_ID.
  // Foundry v12 throws when the old module scope is not active.
  const legacy = getRawFlag(actor, LEGACY_MODULE_ID, key);
  if (legacy !== undefined) return legacy;

  return fallback;
}

function getSheetClassFlag(actor) {
  const current = getSafeFlag(actor, "core", "sheetClass");
  if (current !== undefined) return current;

  return getRawFlag(actor, "core", "sheetClass");
}

function isGroupActor(actor) {
  return Boolean(getFlagWithLegacy(actor, "isGroup", false));
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
  return Number(getFlagWithLegacy(actor, "groupInventoryMaxSlots", 10)) || 10;
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

function getGroupData(actor) {
  const existing = foundry.utils.deepClone(
    getFlagWithLegacy(actor, "group", {}) ?? {}
  );

  existing.members ??= [];
  existing.travel ??= {};
  existing.travel.weather ??= "normal";
  existing.travel.speed ??= "normal";
  existing.travel.activities ??= {};

  const assignedMembers = new Set();

  for (const activity of TRAVEL_ACTIVITIES) {
    const current = existing.travel.activities[activity.key] ?? {};

    if (!Array.isArray(current.actorUuids)) {
      const migrated = [];

      if (current.actorUuid) {
        migrated.push(current.actorUuid);
      }

      current.actorUuids = migrated;
      delete current.actorUuid;
    }

    current.actorUuids = current.actorUuids.filter(uuid => {
      if (!uuid) return false;
      if (assignedMembers.has(uuid)) return false;
      assignedMembers.add(uuid);
      return true;
    });

    existing.travel.activities[activity.key] = current;
  }

  return existing;
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
    let mod = 0;

    if (typeof actor.abilityModifier === "function") {
      mod = actor.abilityModifier(key);
    } else {
      mod = actor.system?.abilities?.[key]?.mod ?? 0;
    }

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

function getTravelActivityName(key) {
  return TRAVEL_ACTIVITIES.find(activity => activity.key === key)?.name ?? "";
}

function getAssignedTravelActivityByMember(groupData) {
  const assignedByMember = new Map();

  for (const activity of TRAVEL_ACTIVITIES) {
    const activityData = groupData.travel.activities?.[activity.key] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];

    for (const uuid of actorUuids) {
      if (!assignedByMember.has(uuid)) assignedByMember.set(uuid, activity.key);
    }
  }

  return assignedByMember;
}

function buildTravelMemberRoster(groupData, members = []) {
  const assignedByMember = getAssignedTravelActivityByMember(groupData);

  return members.map(member => {
    const assignedActivityKey = assignedByMember.get(member.uuid) ?? "";
    const assignedActivityName = assignedActivityKey ? getTravelActivityName(assignedActivityKey) : "";

    return {
      uuid: member.uuid,
      name: member.name,
      img: member.img,
      className: member.className,
      assigned: Boolean(assignedActivityKey),
      assignedActivityKey,
      assignedActivityName
    };
  });
}

async function buildTravelActivities(groupData, members = []) {
  const result = [];
  const assignedByMember = getAssignedTravelActivityByMember(groupData);

  for (const activity of TRAVEL_ACTIVITIES) {
    const activityData = groupData.travel.activities?.[activity.key] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];

    const assigned = [];

    for (const uuid of actorUuids) {
      const assignedActor = await resolveActorFromUuid(uuid);
      if (!assignedActor) continue;

      assigned.push({
        uuid: assignedActor.uuid,
        name: assignedActor.name,
        img: assignedActor.img,
        className: await getActorClassName(assignedActor),
      });
    }

    const memberOptions = members.map(member => {
      const assignedActivityKey = assignedByMember.get(member.uuid) ?? "";
      const assigned = assignedActivityKey === activity.key;
      const assignedElsewhere = Boolean(assignedActivityKey && assignedActivityKey !== activity.key);
      const assignedActivityName = assignedElsewhere ? getTravelActivityName(assignedActivityKey) : "";

      return {
        uuid: member.uuid,
        name: member.name,
        img: member.img,
        className: member.className,
        assigned,
        assignedElsewhere,
        assignedActivityName,
        title: assigned
          ? `Remove ${member.name} from ${activity.name}`
          : assignedElsewhere
            ? `Move ${member.name} from ${assignedActivityName} to ${activity.name}`
            : `Assign ${member.name} to ${activity.name}`
      };
    });

    result.push({
      ...activity,
      assigned,
      hasAssigned: assigned.length > 0,
      memberOptions,
      hasMemberOptions: memberOptions.length > 0,
      assignmentLabel: assigned.length
        ? assigned.map(actor => actor.name).join(", ")
        : "Unassigned",
    });
  }

  return result;
}

async function rollActorAbility(actor, ability, options = {}) {
  if (!actor || !ability) return;

  if (typeof actor.rollAbility === "function") {
    return actor.rollAbility(ability, options);
  }

  const label = ABILITIES.find(([key]) => key === ability)?.[1] ?? ability.toUpperCase();
  const mod = Number(actor.system?.abilities?.[ability]?.mod ?? 0) || 0;

  const roll = await new Roll(`1d20 + ${mod}`).evaluate({ async: true });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${actor.name} rolls ${label}${options.target ? ` vs DC ${options.target}` : ""}`,
  });

  return roll;
}

export async function createGroupActor() {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can create a MK-Shadowdark group.");
    return null;
  }

  const actor = await Actor.create({
    name: "New Group",
    type: "Player",
    img: "icons/svg/cowled.svg",
    system: {
      attributes: {
        hp: {
          value: GROUP_HP_DEFAULT,
          max: GROUP_HP_DEFAULT,
        },
      },
    },
    flags: {
      core: {
        sheetClass: SHEET_ID,
      },
      [MODULE_ID]: {
        isGroup: true,
        groupInventoryMaxSlots: 10,
        group: {
          members: [],
          travel: {
            weather: "normal",
            speed: "normal",
            activities: {},
          },
        },
      },
    },
  });

  actor.sheet.render(true);
  return actor;
}

export class SDXGroupSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shadowdark", "sheet", "actor", "sdx-group-sheet-window"],
      template: `modules/${MODULE_ID}/templates/group-sheet.hbs`,
      width: 980,
      height: 720,
      resizable: true,
      scrollY: [".sdx-group-tab-body"],
      tabs: [
        {
          navSelector: ".sdx-group-nav",
          contentSelector: ".sdx-group-content",
          initial: "members",
        },
      ],
      dragDrop: [
        {
          dragSelector: null,
          dropSelector: ".sdx-group-sheet",
        },
      ],
    });
  }

  get template() {
    return `modules/${MODULE_ID}/templates/group-sheet.hbs`;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const groupData = getGroupData(this.actor);

    const members = [];

    for (const uuid of groupData.members) {
      const memberActor = await resolveActorFromUuid(uuid);
      if (!memberActor) continue;

      members.push(await buildMemberData(memberActor));
    }

    const inventoryItems = [...this.actor.items].map(buildInventoryItemData);
    const inventorySlots = calculateGroupInventorySlots(this.actor);
    const coins = this.actor.system?.coins ?? {};

    context.notesHTML = await TextEditor.enrichHTML(
      this.actor.system?.notes ?? "",
      {
        secrets: this.actor.isOwner,
        async: true,
        relativeTo: this.actor,
      }
    );

    context.sdx = {
      isGroup: true,
      summary: buildHeaderSummary(members),
      members,
      hasMembers: members.length > 0,
      canEditGroup: this.isEditable && game.user.isGM,
      inventory: {
        items: inventoryItems,
        hasItems: inventoryItems.length > 0,
        slots: inventorySlots,
        coinSlots: calculateCoinSlots(this.actor),
        coins: {
          gp: numberOrZero(coins.gp),
          sp: numberOrZero(coins.sp),
          cp: numberOrZero(coins.cp),
        },
      },
      travel: {
        weather: groupData.travel.weather,
        weatherLabel: optionLabel(WEATHER_OPTIONS, groupData.travel.weather),
        speed: groupData.travel.speed,
        speedOptions: SPEED_OPTIONS.map(option => ({
          ...option,
          selected: option.value === groupData.travel.speed,
        })),
        members: buildTravelMemberRoster(groupData, members),
        hasMembers: members.length > 0,
        activities: await buildTravelActivities(groupData, members),
      },
    };

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='open-member']").on("click", event => {
      this._onOpenMember(event);
    });

    html.find("[data-action='remove-member']").on("click", event => {
      this._onRemoveMember(event);
    });

    html.find("[data-action='roll-ability']").on("click", event => {
      this._onRollAbility(event);
    });

    html.find("[data-action='xp-increment']").on("click", event => {
      this._onChangeXp(event, 1);
    });

    html.find("[data-action='xp-decrement']").on("click", event => {
      this._onChangeXp(event, -1);
    });

    html.find("[data-action='cycle-weather']").on("click", event => {
      this._onCycleWeather(event);
    });

    html.find("[data-action='change-speed']").on("change", event => {
      this._onChangeSpeed(event);
    });

    html.find("[data-action='reset-travel']").on("click", event => {
      this._onResetTravel(event);
    });

    html.find("[data-action='roll-travel-activity']").on("click", event => {
      this._onRollTravelActivity(event);
    });

    html.find("[data-action='toggle-travel-participant']").on("click", event => {
      this._onToggleTravelParticipant(event);
    });

    html.find("[data-action='toggle-travel-picker']").on("click", event => {
      this._onToggleTravelPicker(event);
    });

    html.find("[data-camping-member-drag='true']").on("dragstart", event => {
      this._onCampingMemberDragStart(event);
    });

    html.find("[data-camping-member-drag='true']").on("dragend", event => {
      this._onCampingMemberDragEnd(event);
    });

    html.find(".sdx-travel-card[data-travel-activity-key]").on("dragenter", event => {
      this._onCampingActivityDragEnter(event);
    });

    html.find(".sdx-travel-card[data-travel-activity-key]").on("dragover", event => {
      this._onCampingActivityDragOver(event);
    });

    html.find(".sdx-travel-card[data-travel-activity-key]").on("dragleave", event => {
      this._onCampingActivityDragLeave(event);
    });

    html.find(".sdx-travel-card[data-travel-activity-key]").on("drop", event => {
      this._onCampingActivityDrop(event);
    });

    html.find("[data-action='open-item']").on("click", event => {
      this._onOpenItem(event);
    });

    html.find("[data-action='delete-item']").on("click", event => {
      this._onDeleteItem(event);
    });

    html.find("[data-action='item-increment']").on("click", event => {
      this._onChangeItemQuantity(event, 1);
    });

    html.find("[data-action='item-decrement']").on("click", event => {
      this._onChangeItemQuantity(event, -1);
    });

    html.find("[data-action='create-group-item']").on("click", event => {
      this._onCreateGroupItem(event);
    });

    html.find("[data-action='change-group-coin']").on("change", event => {
      this._onChangeGroupCoin(event);
    });

    html.find("[data-action='divide-coins']").on("click", event => {
      this._onDivideCoins(event);
    });
  }

  async _saveGroupData(groupData) {
    await this.actor.setFlag(MODULE_ID, "group", groupData);
  }

  async _onDrop(event) {
    event.preventDefault();

    const data = TextEditor.getDragEventData(event);
    if (!data) return false;

    const travelCard = event.target.closest?.("[data-travel-activity-key]");

    if (data.type === "Actor" || data.uuid) {
      const droppedActor = await this._resolveDroppedActor(data);

      if (droppedActor) {
        if (droppedActor.id === this.actor.id) {
          ui.notifications.warn("A group cannot contain itself.");
          return false;
        }

        if (travelCard) {
          const activityKey = travelCard.dataset.travelActivityKey;
          await this._assignTravelActivity(activityKey, droppedActor);
          return false;
        }

        await this._addMember(droppedActor);
        return false;
      }
    }

    if (data.type === "Item" || data.uuid) {
      const droppedItem = await resolveItemFromDropData(data);
      if (droppedItem) {
        await this._addItemToGroup(droppedItem);
        return false;
      }
    }

    return super._onDrop(event);
  }

  async _resolveDroppedActor(data) {
    if (data.uuid) {
      const actor = await resolveActorFromUuid(data.uuid);
      if (actor) return actor;
    }

    if (data.id) {
      return game.actors.get(data.id) ?? null;
    }

    return null;
  }

  async _addMember(memberActor) {
    const groupData = getGroupData(this.actor);
    const uuid = memberActor.uuid;

    if (groupData.members.includes(uuid)) {
      ui.notifications.info(`${memberActor.name} is already in this group.`);
      return;
    }

    groupData.members.push(uuid);
    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _assignTravelActivity(activityKey, memberActor) {
    const activity = TRAVEL_ACTIVITIES.find(existing => existing.key === activityKey);
    if (!activity) return;

    const groupData = getGroupData(this.actor);

    if (!groupData.members.includes(memberActor.uuid)) {
      groupData.members.push(memberActor.uuid);
    }

    this._setTravelActivityMember(groupData, activityKey, memberActor.uuid, true);

    await this._saveGroupData(groupData);
    this.render(false);
  }

  _setTravelActivityMember(groupData, activityKey, actorUuid, assigned) {
    if (!activityKey || !actorUuid) return;

    for (const activity of TRAVEL_ACTIVITIES) {
      const activityData = groupData.travel.activities[activity.key] ?? {
        actorUuids: [],
      };

      const existing = Array.isArray(activityData.actorUuids)
        ? activityData.actorUuids
        : [];

      activityData.actorUuids = existing.filter(uuid => uuid !== actorUuid);
      groupData.travel.activities[activity.key] = activityData;
    }

    if (!assigned) return;

    const activityData = groupData.travel.activities[activityKey] ?? {
      actorUuids: [],
    };

    activityData.actorUuids ??= [];
    activityData.actorUuids.push(actorUuid);
    groupData.travel.activities[activityKey] = activityData;
  }

  async _onOpenMember(event) {
    event.preventDefault();
    event.stopPropagation();

    const container = event.currentTarget.closest(
      "[data-member-uuid], [data-assigned-actor-uuid]"
    );

    const uuid =
      container?.dataset?.memberUuid ??
      container?.dataset?.assignedActorUuid;

    const memberActor = await resolveActorFromUuid(uuid);
    memberActor?.sheet?.render(true);
  }

  async _onRemoveMember(event) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-member-uuid]");
    const uuid = row?.dataset?.memberUuid;

    if (!uuid) return;

    const groupData = getGroupData(this.actor);

    groupData.members = groupData.members.filter(existingUuid => existingUuid !== uuid);

    for (const activity of Object.values(groupData.travel.activities)) {
      activity.actorUuids = (activity.actorUuids ?? []).filter(
        actorUuid => actorUuid !== uuid
      );
    }

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onRollAbility(event) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-member-uuid]");
    const uuid = row?.dataset?.memberUuid;
    const ability = event.currentTarget.dataset.ability;

    const memberActor = await resolveActorFromUuid(uuid);

    if (!memberActor || !ability) return;

    await rollActorAbility(memberActor, ability, {
      event,
      fastForward: event.shiftKey,
    });
  }

  async _onChangeXp(event, delta) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-member-uuid]");
    const uuid = row?.dataset?.memberUuid;

    const memberActor = await resolveActorFromUuid(uuid);

    if (!memberActor || memberActor.type !== "Player") return;

    const currentXp = Number(memberActor.system?.level?.xp ?? 0);
    const newXp = Math.max(0, currentXp + delta);

    await memberActor.update({
      "system.level.xp": newXp,
    });
  }

  async _onCycleWeather(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    const currentIndex = WEATHER_OPTIONS.findIndex(
      option => option.value === groupData.travel.weather
    );
    const nextIndex = (currentIndex + 1) % WEATHER_OPTIONS.length;

    groupData.travel.weather = WEATHER_OPTIONS[nextIndex].value;

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onChangeSpeed(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    groupData.travel.speed = event.currentTarget.value;

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onResetTravel(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);

    groupData.travel.weather = "normal";
    groupData.travel.speed = "normal";
    groupData.travel.activities = {};

    for (const activity of TRAVEL_ACTIVITIES) {
      groupData.travel.activities[activity.key] = {
        actorUuids: [],
      };
    }

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onToggleTravelParticipant(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest("[data-travel-activity-key]");
    const activityKey = card?.dataset?.travelActivityKey;
    const actorUuid = event.currentTarget.dataset.memberUuid;

    if (!activityKey || !actorUuid) return;

    const groupData = getGroupData(this.actor);
    const activityData = groupData.travel.activities[activityKey] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];
    const currentlyAssignedHere = actorUuids.includes(actorUuid);

    this._setTravelActivityMember(groupData, activityKey, actorUuid, !currentlyAssignedHere);

    await this._saveGroupData(groupData);
    this.render(false);
  }

  _onToggleTravelPicker(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest("[data-travel-activity-key]");
    if (!card) return;

    const tab = card.closest(".sdx-group-tab");
    const wasOpen = card.classList.contains("is-picking");

    tab?.querySelectorAll(".sdx-travel-card.is-picking").forEach(existing => {
      existing.classList.remove("is-picking");
    });

    if (!wasOpen) card.classList.add("is-picking");
  }

  _onCampingMemberDragStart(event) {
    const nativeEvent = event.originalEvent ?? event;
    const dataTransfer = nativeEvent.dataTransfer;
    const actorUuid = event.currentTarget?.dataset?.memberUuid;

    if (!dataTransfer || !actorUuid) return;

    dataTransfer.effectAllowed = "move";
    dataTransfer.setData(CAMPING_MEMBER_DRAG_TYPE, actorUuid);
    dataTransfer.setData("text/plain", actorUuid);

    event.currentTarget.classList.add("is-dragging");
  }

  _onCampingMemberDragEnd(event) {
    event.currentTarget?.classList.remove("is-dragging");
    this.element?.find?.(".sdx-travel-card.is-drag-over")?.removeClass("is-drag-over");
  }

  _onCampingActivityDragEnter(event) {
    if (!this._hasCampingDragData(event)) return;

    event.preventDefault();
    event.currentTarget?.classList.add("is-drag-over");
  }

  _onCampingActivityDragOver(event) {
    const nativeEvent = event.originalEvent ?? event;
    if (!this._hasCampingDragData(event)) return;

    event.preventDefault();
    nativeEvent.dataTransfer.dropEffect = "move";
    event.currentTarget?.classList.add("is-drag-over");
  }

  _onCampingActivityDragLeave(event) {
    const nativeEvent = event.originalEvent ?? event;
    const card = event.currentTarget;
    const relatedTarget = nativeEvent.relatedTarget;

    if (relatedTarget && card?.contains?.(relatedTarget)) return;
    card?.classList.remove("is-drag-over");
  }

  async _onCampingActivityDrop(event) {
    const actorUuid = this._getCampingDragActorUuid(event);
    const activityKey = event.currentTarget?.dataset?.travelActivityKey;

    if (!actorUuid || !activityKey) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList.remove("is-drag-over");

    const groupData = getGroupData(this.actor);
    if (!groupData.members.includes(actorUuid)) return;

    this._setTravelActivityMember(groupData, activityKey, actorUuid, true);

    await this._saveGroupData(groupData);
    this.render(false);
  }

  _getCampingDragActorUuid(event) {
    const nativeEvent = event.originalEvent ?? event;
    const dataTransfer = nativeEvent.dataTransfer;
    if (!dataTransfer) return "";

    return dataTransfer.getData(CAMPING_MEMBER_DRAG_TYPE) || dataTransfer.getData("text/plain") || "";
  }

  _hasCampingDragData(event) {
    const nativeEvent = event.originalEvent ?? event;
    const types = Array.from(nativeEvent.dataTransfer?.types ?? []);
    return types.includes(CAMPING_MEMBER_DRAG_TYPE);
  }

  async _pickTravelAbility(activity) {
    if (activity.abilities.length === 1) return activity.abilities[0];

    const options = activity.abilities
      .map(ability => {
        const label = ABILITIES.find(([key]) => key === ability)?.[1] ?? ability.toUpperCase();
        return `<option value="${ability}">${label}</option>`;
      })
      .join("");

    return Dialog.wait({
      title: `Roll ${activity.name}`,
      content: `
        <form>
          <div class="form-group">
            <label>Ability</label>
            <select name="ability">${options}</select>
          </div>
        </form>
      `,
      buttons: {
        roll: {
          icon: "<i class='fas fa-dice-d20'></i>",
          label: "Roll",
          callback: html => html.find("[name='ability']").val(),
        },
        cancel: {
          icon: "<i class='fas fa-times'></i>",
          label: "Cancel",
          callback: () => null,
        },
      },
      default: "roll",
      close: () => null,
    });
  }

  async _onRollTravelActivity(event) {
    event.preventDefault();

    const card = event.currentTarget.closest("[data-travel-activity-key]");
    const activityKey = card?.dataset?.travelActivityKey;
    const activity = TRAVEL_ACTIVITIES.find(existing => existing.key === activityKey);

    if (!activity) return;

    const groupData = getGroupData(this.actor);
    const actorUuids = groupData.travel.activities?.[activityKey]?.actorUuids ?? [];

    if (actorUuids.length === 0) {
      ui.notifications.warn(`Drop one or more characters on ${activity.name} first.`);
      return;
    }

    const ability = await this._pickTravelAbility(activity);
    if (!ability) return;

    for (const actorUuid of actorUuids) {
      const actor = await resolveActorFromUuid(actorUuid);
      if (!actor) continue;

      await rollActorAbility(actor, ability, {
        event,
        target: activity.dc,
        fastForward: event.shiftKey,
      });
    }
  }

  async _addItemToGroup(item) {
    const itemData = item.toObject();
    delete itemData._id;
    itemData.folder = null;
    itemData.sort = 0;

    await this.actor.createEmbeddedDocuments("Item", [itemData]);
    this.render(false);
  }

  async _onOpenItem(event) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-item-id]");
    const itemId = row?.dataset?.itemId;
    const item = this.actor.items.get(itemId);

    item?.sheet?.render(true);
  }

  async _onDeleteItem(event) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-item-id]");
    const itemId = row?.dataset?.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

    const confirmed = await Dialog.confirm({
      title: "Delete Item",
      content: `<p>Delete <strong>${item.name}</strong> from the group inventory?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });

    if (!confirmed) return;

    await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
    this.render(false);
  }

  async _onChangeItemQuantity(event, delta) {
    event.preventDefault();

    const row = event.currentTarget.closest("[data-item-id]");
    const itemId = row?.dataset?.itemId;
    const item = this.actor.items.get(itemId);

    if (!item) return;

    const current = Number(item.system?.quantity ?? 1) || 1;
    const next = Math.max(0, current + delta);

    if (next <= 0) {
      const confirmed = await Dialog.confirm({
        title: "Delete Item",
        content: `<p>Quantity reached 0. Delete <strong>${item.name}</strong>?</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });

      if (confirmed) {
        await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      }

      this.render(false);
      return;
    }

    await item.update({
      "system.quantity": next,
    });
  }

  async _onCreateGroupItem(event) {
    event.preventDefault();

    const treasure = event.currentTarget.dataset.treasure === "true";

    const itemData = {
      name: treasure ? "New Treasure" : "New Gear",
      type: "Basic",
      system: {
        quantity: 1,
        treasure,
        isPhysical: true,
        slots: {
          slots_used: 1,
          per_slot: 1,
          free_carry: 0,
        },
      },
    };

    const [item] = await this.actor.createEmbeddedDocuments("Item", [itemData]);
    item.sheet.render(true);
  }

  async _onChangeGroupCoin(event) {
    event.preventDefault();

    const coin = event.currentTarget.dataset.coin;
    if (!["gp", "sp", "cp"].includes(coin)) return;

    const value = Math.max(0, Math.floor(Number(event.currentTarget.value) || 0));

    await this.actor.update({
      [`system.coins.${coin}`]: value,
    });
  }

  async _onDivideCoins(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    const memberActors = [];

    for (const uuid of groupData.members) {
      const actor = await resolveActorFromUuid(uuid);
      if (actor?.type === "Player") {
        memberActors.push(actor);
      }
    }

    if (memberActors.length === 0) {
      ui.notifications.warn("There are no player characters in this group.");
      return;
    }

    const coins = this.actor.system?.coins ?? {};
    const gp = numberOrZero(coins.gp);
    const sp = numberOrZero(coins.sp);
    const cp = numberOrZero(coins.cp);

    if (gp + sp + cp <= 0) {
      ui.notifications.warn("There is no party treasure to divide.");
      return;
    }

    const confirmed = await Dialog.confirm({
      title: "Divide Party Treasure",
      content: `
        <p>Divide party treasure between <strong>${memberActors.length}</strong> PCs?</p>
        <p>Remainders stay in the party treasury.</p>
      `,
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });

    if (!confirmed) return;

    const shares = {
      gp: Math.floor(gp / memberActors.length),
      sp: Math.floor(sp / memberActors.length),
      cp: Math.floor(cp / memberActors.length),
    };

    const remainders = {
      gp: gp % memberActors.length,
      sp: sp % memberActors.length,
      cp: cp % memberActors.length,
    };

    for (const actor of memberActors) {
      const actorCoins = actor.system?.coins ?? {};

      await actor.update({
        "system.coins.gp": numberOrZero(actorCoins.gp) + shares.gp,
        "system.coins.sp": numberOrZero(actorCoins.sp) + shares.sp,
        "system.coins.cp": numberOrZero(actorCoins.cp) + shares.cp,
      });
    }

    await this.actor.update({
      "system.coins.gp": remainders.gp,
      "system.coins.sp": remainders.sp,
      "system.coins.cp": remainders.cp,
    });

    ui.notifications.info("Party treasure divided.");
  }

  async _addControlledTokens() {
    if (!canvas?.ready) return;

    const actors = canvas.tokens.controlled
      .map(token => token.actor)
      .filter(actor => actor && actor.id !== this.actor.id);

    if (actors.length === 0) {
      ui.notifications.info("Select one or more tokens first.");
      return;
    }

    for (const actor of actors) {
      await this._addMember(actor);
    }
  }

  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();

    if (game.user.isGM) {
      buttons.unshift({
        label: "Add Tokens",
        class: "sdx-add-controlled-tokens",
        icon: "fas fa-user-plus",
        onclick: () => this._addControlledTokens(),
      });
    }

    return buttons;
  }
}

function addActorDirectoryButton(app, html) {
  if (!game.user.isGM) return;

  const enabled = game.settings.get(MODULE_ID, "enableGroupActors");
  if (!enabled) return;

  const root = html?.[0] ?? html;
  if (!root) return;

  if (root.querySelector(".sdx-create-group-actor")) return;

  const header =
    root.querySelector(".directory-header .header-actions") ??
    root.querySelector(".directory-header") ??
    root;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("sdx-create-group-actor");
  button.innerHTML = `<i class="fas fa-users"></i> Group`;
  button.title = "Create MK-Shadowdark Group";

  button.addEventListener("click", event => {
    event.preventDefault();
    createGroupActor();
  });

  header.appendChild(button);
}

function rerenderOpenGroupSheets(updatedActor) {
  for (const app of Object.values(ui.windows)) {
    if (!(app instanceof SDXGroupSheet)) continue;

    const groupData = getGroupData(app.actor);

    const assignedTravelActors = Object.values(groupData.travel.activities ?? {})
      .flatMap(activity => activity.actorUuids ?? [])
      .filter(Boolean);

    if (
      groupData.members.includes(updatedActor.uuid) ||
      assignedTravelActors.includes(updatedActor.uuid) ||
      app.actor.id === updatedActor.id
    ) {
      app.render(false);
    }
  }
}

let groupSheetRegistered = false;

function settingExists(key) {
  return game.settings?.settings?.has(`${MODULE_ID}.${key}`);
}

async function migrateLegacyGroupActors() {
  if (!game.user?.isGM) return;

  let migrated = 0;
  let failed = 0;

  for (const actor of game.actors ?? []) {
    const hasLegacyGroup = Boolean(getRawFlag(actor, LEGACY_MODULE_ID, "isGroup"));
    const oldSheetClass = getSheetClassFlag(actor) === LEGACY_SHEET_ID;

    if (!hasLegacyGroup && !oldSheetClass) continue;

    const update = {
      "flags.core.sheetClass": SHEET_ID,
      [`flags.${MODULE_ID}.isGroup`]: true,
      [`flags.${MODULE_ID}.groupInventoryMaxSlots`]: getGroupInventoryMaxSlots(actor),
      [`flags.${MODULE_ID}.group`]: getGroupData(actor),
    };

    if (actor._source?.flags?.[LEGACY_MODULE_ID]) {
      update[`flags.-=${LEGACY_MODULE_ID}`] = null;
    }

    try {
      await actor.update(update);
      migrated += 1;
    } catch (error) {
      // Some worlds/modules are strict about deleting old flag scopes.
      // If deletion fails, still copy the data into the new scope.
      if (update[`flags.-=${LEGACY_MODULE_ID}`] === null) {
        delete update[`flags.-=${LEGACY_MODULE_ID}`];

        try {
          await actor.update(update);
          migrated += 1;
          console.warn(
            `${MODULE_ID} | GroupSheet | Migrated legacy group actor "${actor.name}", but could not remove old ${LEGACY_MODULE_ID} flags.`,
            error
          );
          continue;
        } catch (retryError) {
          failed += 1;
          console.error(
            `${MODULE_ID} | GroupSheet | Failed to migrate legacy group actor "${actor.name}".`,
            retryError
          );
          continue;
        }
      }

      failed += 1;
      console.error(
        `${MODULE_ID} | GroupSheet | Failed to migrate legacy group actor "${actor.name}".`,
        error
      );
    }
  }

  if (migrated > 0) {
    sdxGroupLog(`Migrated ${migrated} legacy group actor(s).`);
  }

  if (failed > 0) {
    ui.notifications.warn(`${MODULE_ID}: ${failed} legacy group actor migration(s) failed. Check the console.`);
  }
}

async function ensureExistingGroupActorHpDefaults() {
  if (!game.user?.isGM) return;

  let updated = 0;
  let failed = 0;

  for (const actor of game.actors ?? []) {
    if (!isGroupActor(actor)) continue;

    try {
      if (await ensureGroupActorHpDefaults(actor)) updated += 1;
    } catch (error) {
      failed += 1;
      console.error(`${MODULE_ID} | GroupSheet | Failed to set HP defaults for group actor "${actor.name}".`, error);
    }
  }

  if (updated > 0) {
    sdxGroupLog(`Set HP defaults on ${updated} group actor(s).`);
  }

  if (failed > 0) {
    ui.notifications.warn(`${MODULE_ID}: ${failed} group actor HP default update(s) failed. Check the console.`);
  }
}

async function onReadyGroupSheetMaintenance() {
  await migrateLegacyGroupActors();
  await ensureExistingGroupActorHpDefaults();
}

export function registerGroupSheet() {
  if (groupSheetRegistered) return;
  groupSheetRegistered = true;

  if (!settingExists("enableGroupActors")) {
    game.settings.register(MODULE_ID, "enableGroupActors", {
      name: "Enable Group Actors",
      hint: "Adds a MK-Shadowdark group actor sheet for party members, group inventory, camping task assignments, and group notes.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });
  }

  Actors.registerSheet(MODULE_ID, SDXGroupSheet, {
    types: ["Player"],
    makeDefault: false,
    label: "MK-Shadowdark: Group Sheet",
  });

  // Do not register the sheet under LEGACY_MODULE_ID.
  // The ready migration below moves old sheetClass values from
  // shadowdark-extras.SDXGroupSheet to mk-shadowdark.SDXGroupSheet.
  // Keeping both registrations can confuse libWrapper-based modules such as Item Piles.

  Hooks.on("renderActorDirectory", addActorDirectoryButton);
  Hooks.on("updateActor", rerenderOpenGroupSheets);

  Hooks.on("createItem", item => {
    if (isGroupActor(item.actor)) {
      item.actor.sheet?.render(false);
    }
  });

  Hooks.on("updateItem", item => {
    if (isGroupActor(item.actor)) {
      item.actor.sheet?.render(false);
    }
  });

  Hooks.on("deleteItem", item => {
    if (isGroupActor(item.actor)) {
      item.actor.sheet?.render(false);
    }
  });

  Hooks.once("ready", onReadyGroupSheetMaintenance);

  game.mkShadowdark ??= {};
  game.mkShadowdark.createGroupActor = createGroupActor;

  // Compatibility alias for worlds/macros that used the old global API name.
  game.shadowdarkExtras ??= game.mkShadowdark;

  sdxGroupLog("Registered group sheet.");
}

Hooks.once("init", registerGroupSheet);
