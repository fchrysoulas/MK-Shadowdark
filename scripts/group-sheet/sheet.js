import {
  ACTIVITY_KIND_CAMPING,
  ACTIVITY_KIND_TRAVEL,
  ACTIVITY_KINDS,
  CAMPING_MEMBER_DRAG_TYPE,
  GROUP_HP_DEFAULT,
  GROUP_SHEET_SOCKET_ASSIGN_TRAVEL,
  GROUP_SHEET_SOCKET_FEATURE,
  GROUP_SHEET_SOCKET_PROMPT_TRAVEL,
  GROUP_TRAVEL_HEXES_DEFAULT,
  GROUP_TRAVEL_MILES_PER_HOUR_DEFAULT,
  MODULE_ID,
  SHEET_ID,
  SPEED_OPTIONS,
  TRAVEL_PROMPT_ELEMENT_ID,
} from "./constants.js";
import {
  canUserControlActor,
  getActorAbilityModifier,
  getModuleFlag,
  resolveActorFromUuid,
  resolveItemFromDropData,
} from "./actors.js";
import {
  buildActivities,
  buildActivityMemberRoster,
  buildTravelProgress,
  buildTravelPromptPayload,
  createEmptyTravelPromptResults,
  createTravelPromptId,
  getActivitiesForKind,
  getActivityKind,
  getActivityStore,
  getBoatCrewSlots,
  getGroupData,
  getTravelAssignmentKeys,
  normalizeTravelPrompt,
  normalizeCompanions,
  setActivityMember,
} from "./activities.js";
import { buildGroupSheetStyle, getGroupSheetTabBackgrounds } from "./group-settings.js";
import {
  getWeatherLabel,
  getWeatherSummaries,
  getWeatherTooltip,
  rollWeather,
  showWeatherRolls,
} from "./weather.js";
import {
  buildActiveTorches,
  buildCampingResources,
  buildHeaderSummary,
  buildInventoryItemData,
  calculateCompanionCarrySlots,
  buildMemberData,
  calculateCoinSlots,
  calculateGroupInventorySlots,
  consumePartyFoodRations,
  getPartyFoodTotal,
} from "./inventory.js";
import { rollActorAbility } from "./rolls.js";
import {
  broadcastTravelPromptChat,
  clearTravelPromptTimer,
  removeTravelPromptElement,
  showTravelRollPrompt,
} from "./travel-prompt.js";
import { getRestMode, reportRest, restActor } from "../libs/resting.js";
import { isGroupInventoryTransferData } from "../libs/group-inventory-transfer.js";
import { clampNumber, escapeHtml, getDialogFieldValue, numberOrZero } from "./utils.js";
import { getPrimaryActiveGm } from "./users.js";
import { getSettingValue } from "./group-settings.js";
import { BASTION_ACTOR_TYPE } from "../bastion-sheet/constants.js";
import { getSheetTheme, bindSheetThemeToggle } from "../libs/sheet-themes.js";

const GROUP_ACTOR_LINKS = Object.freeze({
  warbands: { type: "NPC", label: "warband", dropLabel: "an NPC actor representing a warband" },
  boats: { type: "NPC", label: "boat", dropLabel: "an NPC actor representing a boat" },
  bastions: { type: BASTION_ACTOR_TYPE, label: "Bastion", dropLabel: "a Bastion actor" },
});
const BOAT_ASSIGNMENT_KINDS = ["crew", "warbands"];
const GROUP_HELP_SECTIONS = new Set([
  "party", "summary", "traveling", "camping", "inventory", "shared-items", "treasure",
  "hirelings", "warbands", "mounts", "boats", "bastions", "active-torches",
]);

const ActorSheetBase = globalThis.foundry?.appv1?.sheets?.ActorSheet;
const TextEditorImplementation = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;

async function createGroupActor({ name = "New Group", folder = null } = {}) {
  if (getSettingValue("enableGroupActors", true) === false) return null;
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can create a MK-Shadowdark group.");
    return null;
  }

  const actorData = {
    name: String(name || "").trim() || "New Group",
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
        group: {
          members: [],
          companions: [],
          warbands: [],
          boats: [],
          boatAssignments: [],
          bastions: [],
          travel: {
            weather: "normal",
            speed: "normal",
            activities: {},
          },
          camping: {
            activities: {},
          },
        },
      },
    },
  };

  if (folder) actorData.folder = folder;

  const actor = await Actor.create(actorData);
  actor?.sheet?.render(true);
  return actor;
}

class MKGroupSheet extends ActorSheetBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shadowdark", "sheet", "actor", "mk-group-sheet-window"],
      template: `modules/${MODULE_ID}/templates/group-sheet.hbs`,
      width: 980,
      height: 720,
      resizable: true,
      scrollY: [".mk-group-tab-body"],
      tabs: [
        {
          navSelector: ".mk-group-nav",
          contentSelector: ".mk-group-content",
          initial: "summary",
        },
      ],
      dragDrop: [
        {
          dragSelector: ".mk-shared-item-row[data-item-id]",
          dropSelector: ".mk-group-sheet",
        },
      ],
    });
  }

  get template() {
    return `modules/${MODULE_ID}/templates/group-sheet.hbs`;
  }

  _canDragStart(selector) {
    if (selector === ".mk-shared-item-row[data-item-id]") {
      const user = globalThis.game?.user;
      // Players can request a GM-managed transfer with Observer access.
      return Boolean(user && (user.isGM || this.actor?.testUserPermission?.(user, "OBSERVER")));
    }
    return super._canDragStart(selector);
  }

  _onDragStart(event) {
    const item = this.actor.items?.get?.(event.currentTarget?.dataset?.itemId);
    if (!this._canDragStart(".mk-shared-item-row[data-item-id]") || !item || !event.dataTransfer) {
      event.preventDefault();
      return;
    }
    const data = item.toDragData();
    data[MODULE_ID] = {
      ...data[MODULE_ID],
      groupInventoryTransfer: { sourceActorUuid: this.actor.uuid, sourceItemId: item.id },
    };
    const payload = JSON.stringify(data);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", payload);
    event.dataTransfer.setData("application/json", payload);
  }

  _disableFields(form) {
    super._disableFields(form);
    this._enablePlayerCampingControls(form);
  }

  _enablePlayerCampingControls(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelectorAll) return;

    const selectors = [
      ".mk-camping-roster-member[data-can-assign='true']",
      ".mk-travel-member-toggle[data-can-assign='true']",
      ".mk-camping-assigned-chip",
      ".mk-group-actor-open[data-actor-available='true']",
      ".mk-boat-assignment-open[data-actor-available='true']",
      ".mk-shared-item-row [data-action='open-item']",
      "[data-action='section-help']",
    ];

    element.querySelectorAll(selectors.join(",")).forEach(control => {
      control.disabled = false;
      control.removeAttribute("disabled");
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const groupData = getGroupData(this.actor);

    const rosterMembers = [];
    const rosterActors = [];

    for (const uuid of groupData.members) {
      const memberActor = await resolveActorFromUuid(uuid);
      if (!memberActor) continue;

      rosterActors.push(memberActor);
      rosterMembers.push(await buildMemberData(memberActor));
    }

    const isActivePartyMember = member => groupData.activeMembers.includes(member.uuid);
    rosterMembers.sort((left, right) => {
      const activeDifference = Number(isActivePartyMember(right)) - Number(isActivePartyMember(left));
      if (activeDifference) return activeDifference;

      return String(left.name ?? "").localeCompare(String(right.name ?? ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
    const members = rosterMembers.filter(isActivePartyMember);
    const memberActors = rosterActors.filter(isActivePartyMember);

    const inventoryItems = [...this.actor.items].map(buildInventoryItemData);
    const companions = normalizeCompanions(groupData.companions);
    const inventorySlots = calculateGroupInventorySlots(this.actor, companions);
    const activeTorches = buildActiveTorches(memberActors, this.actor);
    const coins = this.actor.system?.coins ?? {};
    const campingActivities = await buildActivities(groupData, members, ACTIVITY_KIND_CAMPING);
    const travelActivities = await buildActivities(groupData, members, ACTIVITY_KIND_TRAVEL);
    const campingMembers = buildActivityMemberRoster(groupData, members, ACTIVITY_KIND_CAMPING);
    const travelMembers = buildActivityMemberRoster(groupData, members, ACTIVITY_KIND_TRAVEL);
    const campingAssignments = new Map(
      campingMembers
        .filter(member => member.assigned)
        .map(member => [member.uuid, member.assignedActivityName])
    );
    const travelAssignments = new Map(
      travelMembers
        .filter(member => member.assigned)
        .map(member => [member.uuid, member.assignedActivityName])
    );
    const memberData = rosterMembers.map(member => ({
      ...member,
      isActivePartyMember: isActivePartyMember(member),
      campingAssignment: campingAssignments.get(member.uuid) ?? "",
      travelAssignment: travelAssignments.get(member.uuid) ?? "",
    }));
    const travelProgress = buildTravelProgress(groupData);
    const travelPromptActorCount = getTravelAssignmentKeys(groupData).length;
    const membersByUuid = new Map(members.map(member => [member.uuid, member]));
    const hirelingOwners = rosterMembers.filter(member => member.isPlayer);
    const hirelings = companions
      .filter(companion => companion.type === "hireling")
      .map(companion => {
        const ownerOptions = [{ uuid: "", name: "Unassigned" }, ...hirelingOwners];
        if (companion.ownerUuid && !hirelingOwners.some(member => member.uuid === companion.ownerUuid)) {
          ownerOptions.push({ uuid: companion.ownerUuid, name: "Unavailable character", unavailable: true });
        }
        return {
          ...companion,
          ownerOptions: ownerOptions.map(option => ({
            uuid: option.uuid,
            name: option.name,
            selected: option.uuid === companion.ownerUuid,
            unavailable: Boolean(option.unavailable),
          })),
        };
      });
    const mounts = companions
      .filter(companion => companion.type === "mount")
      .map(companion => {
        const gearSlots = Math.max(0, companion.strengthBonus * 5);
        const riderSlots = companion.riderUuid ? 10 : 0;
        const rider = membersByUuid.get(companion.riderUuid);
        const hpValue = Math.max(0, Number(companion.hpValue) || 0);
        const hpMax = Math.max(0, Number(companion.hpMax) || 0);

        return {
          ...companion,
          gearSlots,
          riderSlots,
          availableCarrySlots: calculateCompanionCarrySlots(companion),
          riderName: rider?.name ?? "",
          riderImg: rider?.img ?? "",
          hasRider: Boolean(rider),
          hpValue,
          hpMax,
          hpPct: hpMax > 0 ? Math.min(100, Math.round((hpValue / hpMax) * 100)) : 0,
          rarityOptions: ["common", "uncommon", "rare", "legendary"].map(value => ({
            value,
            label: value[0].toUpperCase() + value.slice(1),
            selected: value === companion.rarity,
          })),
        };
      });

    const warbands = await this._buildGroupActorLinks(groupData, "warbands");
    const boats = await this._buildGroupActorLinks(groupData, "boats");
    const bastions = await this._buildGroupActorLinks(groupData, "bastions");
    const warbandDisplay = await this._buildWarbandDisplay(warbands, groupData, boats, bastions);

    context.mk = {
      isGroup: true,
      theme: getSheetTheme("group"),
      sheetStyle: buildGroupSheetStyle(),
      summary: buildHeaderSummary(members),
      members: memberData,
      hasMembers: rosterMembers.length > 0,
      rosterCount: rosterMembers.length,
      partyCount: members.length,
      canEditGroup: this.isEditable && game.user.isGM,
      activeTorches: {
        entries: activeTorches,
        hasEntries: activeTorches.length > 0,
        count: activeTorches.length,
      },
      hirelings: {
        entries: hirelings,
        hasEntries: hirelings.length > 0,
        totalCarrySlots: hirelings.reduce((total, hireling) => total + hireling.carrySlots, 0),
      },
      mounts: {
        entries: mounts,
        hasEntries: mounts.length > 0,
        totalGearSlots: mounts.reduce((total, mount) => total + mount.gearSlots, 0),
        totalCarrySlots: mounts.reduce((total, mount) => total + mount.availableCarrySlots, 0),
      },
      warbands: warbandDisplay,
      boats: { entries: boats, hasEntries: boats.length > 0 },
      bastions: { entries: bastions, hasEntries: bastions.length > 0 },
      campingResources: buildCampingResources(memberActors, this.actor),
      camping: {
        members: campingMembers,
        hasMembers: members.length > 0,
        activities: campingActivities,
      },
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
        weatherLabel: getWeatherLabel(groupData.travel),
        weatherSummaries: getWeatherSummaries(groupData.travel),
        weatherTooltip: getWeatherTooltip(groupData.travel),
        speed: groupData.travel.speed,
        milesPerHour: groupData.travel.milesPerHour,
        hexesToExplore: groupData.travel.hexesToExplore,
        speedOptions: SPEED_OPTIONS.map(option => ({
          ...option,
          selected: option.value === groupData.travel.speed,
        })),
        members: travelMembers,
        hasMembers: members.length > 0,
        activities: travelActivities,
        hasAssigned: travelPromptActorCount > 0,
        progress: travelProgress,
      },
    };

    context.mk.assets = await this._buildAssetSummary(context.mk);

    return context;
  }

  async _buildWarbandDisplay(warbands, groupData, boats, bastions) {
    const assignments = new Map(warbands.map(warband => [warband.uuid, []]));
    const addAssignment = (uuid, kind, location, quantity, hasGranary = false) => {
      const destinations = assignments.get(uuid);
      if (!destinations) return;
      const amount = Number(quantity);
      const count = Number.isFinite(amount) ? Math.max(1, Math.floor(amount)) : 1;
      const existing = destinations.find(entry => entry.kind === kind && entry.uuid === location.uuid);
      if (existing) existing.quantity += count;
      else destinations.push({ kind, uuid: location.uuid, name: location.name, quantity: count, hasGranary });
    };

    for (const boat of boats) {
      const assignment = groupData.boatAssignments.find(entry => entry.actorUuid === boat.uuid);
      for (const warband of assignment?.warbands ?? []) {
        addAssignment(warband.actorUuid, "boat", boat, warband.quantity);
      }
    }

    let hasUnavailableBastions = false;
    for (const bastion of bastions) {
      const actor = bastion.available ? await this._resolveLinkedActor(bastion.uuid, BASTION_ACTOR_TYPE) : null;
      if (!actor) {
        hasUnavailableBastions = true;
        continue;
      }
      // Bastion defenses own these assignments; the Group Sheet only reads them.
      const state = getModuleFlag(actor, "bastion", {});
      const hasGranary = Array.isArray(state?.upgrades) && state.upgrades.includes("granary");
      const stationed = state?.defenses?.warbands;
      for (const warband of Array.isArray(stationed) ? stationed : []) {
        const uuid = String(warband?.actorUuid ?? warband?.uuid ?? "").trim();
        addAssignment(uuid, "bastion", bastion, warband?.quantity, hasGranary);
      }
    }

    const entries = await Promise.all(warbands.map(async warband => {
      const actor = warband.available ? await this._resolveLinkedActor(warband.uuid, "NPC") : null;
      const rawLevel = actor?.system?.level?.value;
      const level = rawLevel === undefined || rawLevel === null || String(rawLevel).trim() === ""
        ? NaN : Number(rawLevel);
      const ac = actor?.system?.attributes?.ac?.value;
      const hp = actor?.system?.attributes?.hp ?? {};
      const value = Number(hp.value);
      const max = Number(hp.max ?? hp.value);
      const hasHp = hp.value != null && hp.max != null && Number.isFinite(value) && Number.isFinite(max);
      const deployments = assignments.get(warband.uuid).map(entry => ({
        ...entry,
        icon: entry.kind === "boat" ? "fa-ship" : "fa-chess-rook",
        label: `${entry.kind === "boat" ? "Boat" : "Bastion"}: ${entry.name}${entry.quantity > 1 ? ` × ${entry.quantity}` : ""}`,
      }));
      if (!deployments.length) {
        deployments.push(hasUnavailableBastions
          ? { kind: "unknown", icon: "fa-question-circle", label: "Assignment unavailable" }
          : { kind: "following", icon: "fa-person-walking", label: "Following the group" });
      }
      return {
        ...warband,
        levelLabel: Number.isInteger(level) && level >= 0 ? level : "—",
        acLabel: ac === undefined || ac === null || String(ac).trim() === "" ? "—" : ac,
        hp: {
          known: hasHp,
          value: hasHp ? value : 0,
          max: hasHp ? max : 0,
          percent: hasHp && max > 0 ? Math.min(100, Math.max(0, Math.round(100 * value / max))) : 0,
        },
        deployments,
      };
    }));
    const counts = Object.fromEntries(["following", "boat", "bastion", "unknown"].map(kind => [
      kind, entries.filter(entry => entry.deployments.some(deployment => deployment.kind === kind)).length,
    ]));
    return { entries, hasEntries: entries.length > 0, count: entries.length, counts, hasUnavailableBastions };
  }

  async _buildAssetSummary(data) {
    const hirelingWeeklySalary = 1;
    const warbands = await Promise.all(data.warbands.entries.map(async warband => {
      const actor = warband.available ? await this._resolveLinkedActor(warband.uuid, "NPC") : null;
      const rawLevel = actor?.system?.level?.value;
      const level = rawLevel === undefined || rawLevel === null || String(rawLevel).trim() === ""
        ? NaN
        : Number(rawLevel);
      const hasWages = Number.isInteger(level) && level >= 0
        && !warband.deployments.some(entry => entry.kind === "unknown");
      // Each destination can contain multiple units; only its own Granary discounts those units.
      const weeklyWages = hasWages ? warband.deployments.reduce((total, entry) => (
        total + Math.max(0, 3 * level - (entry.hasGranary ? 3 : 0)) * (entry.quantity ?? 1)
      ), 0) : null;
      return {
        ...warband,
        hasWages,
        level: hasWages ? level : null,
        weeklyWages,
        detail: hasWages ? `Level ${level} · ${weeklyWages} gp/week` : "Wages unavailable",
        assignments: [{ label: "Assignment", text: warband.deployments.map(entry => entry.label).join("; ") }],
      };
    }));
    const hirelingSalaries = data.hirelings.entries.length * hirelingWeeklySalary;
    const warbandWages = warbands.reduce((total, warband) => total + (warband.weeklyWages ?? 0), 0);
    const categories = [
      {
        label: "Hirelings", icon: "fa-user-shield", tab: "hirelings",
        entries: data.hirelings.entries.map(hireling => ({
          ...hireling,
          detail: [
            hireling.background,
            `Owner: ${hireling.ownerOptions.find(owner => owner.selected)?.name ?? "Unassigned"}`,
            `${hireling.carrySlots} carry slots`,
            `${hirelingWeeklySalary} gp/week`,
          ].filter(Boolean).join(" · "),
        })),
      },
      { label: "Warbands", icon: "fa-people-group", tab: "warbands", entries: warbands },
      {
        label: "Mounts", icon: "fa-horse", tab: "mounts",
        entries: data.mounts.entries.map(mount => ({
          ...mount,
          detail: `${mount.hasRider ? `Rider: ${mount.riderName}` : "No active rider"} · ${mount.availableCarrySlots} free slots · HP ${mount.hpValue}/${mount.hpMax}`,
        })),
      },
      {
        label: "Boats", icon: "fa-ship", tab: "boats",
        entries: data.boats.entries.map(boat => ({
          ...boat,
          detail: [
            boat.captainName ? `Captain: ${boat.captainName}` : "",
            boat.available ? `${boat.crewSlotsUsed}/${boat.crewSlotCapacity} crew slots` : "",
          ].filter(Boolean).join(" · "),
          assignments: boat.assignmentSections.filter(section => section.hasEntries).map(section => ({
            label: section.label,
            text: section.entries.map(entry => `${entry.name} × ${entry.quantity}`).join(", "),
          })),
        })),
      },
      { label: "Bastions", icon: "fa-chess-rook", tab: "bastions", entries: data.bastions.entries },
    ];
    return {
      wages: {
        hirelings: hirelingSalaries,
        warbands: warbandWages,
        total: hirelingSalaries + warbandWages,
        incomplete: warbands.some(warband => !warband.hasWages)
          || (data.warbands.hasUnavailableBastions && warbands.length > 0),
      },
      categories: categories.map(category => ({ ...category, count: category.entries.length })),
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    bindSheetThemeToggle(html, "group");
    this._applyTabBackgrounds(html);
    this._normalizeCampingResetButton(html);
    this._enablePlayerCampingControls(html);

    html.find("[data-action='section-help']").on("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this._showSectionHelp(event.currentTarget.dataset.helpSection);
    });

    html.find(".mk-group-nav .item").on("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.currentTarget.click();
    });

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

    html.find("[data-action='change-miles-per-hour']").on("change", event => {
      this._onChangeMilesPerHour(event);
    });

    html.find("[data-action='change-hexes-to-explore']").on("change", event => {
      this._onChangeHexesToExplore(event);
    });

    html.find("[data-action='start-travel-rolls']").on("click", event => {
      this._onStartTravelRolls(event);
    });

    html.find("[data-action='rest-party']").on("click", event => {
      this._onRestParty(event);
    });

    html.find("[data-action='reset-travel']").on("click", event => {
      this._onResetTravel(event);
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

    html[0]?.querySelectorAll(".mk-travel-card[data-travel-activity-key]").forEach(card => {
      card.addEventListener("dragenter", event => this._onCampingActivityDragEnter(event), true);
      card.addEventListener("dragover", event => this._onCampingActivityDragOver(event), true);
      card.addEventListener("dragleave", event => this._onCampingActivityDragLeave(event), true);
      card.addEventListener("drop", event => this._onCampingActivityDrop(event), true);
    });

    html.find("[data-action='open-item']").on("click", event => {
      this._onOpenItem(event);
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

    html.find("[data-action='add-companion']").on("click", event => {
      this._onAddCompanion(event);
    });

    html.find("[data-action='change-companion']").on("change", event => {
      this._onChangeCompanion(event);
    });

    html.find("[data-action='remove-companion']").on("click", event => {
      this._onRemoveCompanion(event);
    });

    html.find("[data-action='clear-mount-rider']").on("click", event => {
      this._onClearMountRider(event);
    });

    html.find("[data-action='open-group-actor']").on("click", event => this._onOpenGroupActor(event));
    html.find("[data-action='remove-group-actor']").on("click", event => this._onRemoveGroupActor(event));
    html.find("[data-action='change-boat']").on("change", event => this._onChangeBoat(event));
    html.find("[data-action='open-boat-assignment']").on("click", event => this._onOpenBoatAssignment(event));
    html.find("[data-action='remove-boat-assignment']").on("click", event => this._onRemoveBoatAssignment(event));

    html[0]?.querySelectorAll("[data-group-actor-kind], [data-boat-assignment-kind]").forEach(target => {
      target.addEventListener("dragover", event => {
        if (!this.isEditable || !game.user?.isGM) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        target.classList.add("is-actor-drag-over");
      });
      target.addEventListener("dragleave", event => {
        if (!target.contains(event.relatedTarget)) target.classList.remove("is-actor-drag-over");
      });
      target.addEventListener("drop", () => target.classList.remove("is-actor-drag-over"));
    });

    html[0]?.querySelectorAll("[data-mount-rider-dropzone='true']").forEach(card => {
      card.addEventListener("dragenter", event => this._onMountRiderDragEnter(event), true);
      card.addEventListener("dragover", event => this._onMountRiderDragOver(event), true);
      card.addEventListener("dragleave", event => this._onMountRiderDragLeave(event), true);
      card.addEventListener("drop", event => this._onMountRiderDrop(event), true);
    });
  }

  _showSectionHelp(section) {
    if (!GROUP_HELP_SECTIONS.has(section)) return null;
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    const i18n = globalThis.game?.i18n;
    if (typeof DialogV2 !== "function" || !i18n) return null;

    const prefix = "MK_SHADOWDARK.groupSheet.help";
    let content = i18n.localize(`${prefix}.${section}.body`);
    if (section === "traveling" || section === "camping") {
      const kind = section === "traveling" ? ACTIVITY_KIND_TRAVEL : ACTIVITY_KIND_CAMPING;
      const activities = getActivitiesForKind(kind).map(activity => `
        <dt>${escapeHtml(activity.name)} <span>${escapeHtml(activity.abilityLabel)} · DC ${activity.dc}</span></dt>
        <dd>${escapeHtml(activity.description)}</dd>
      `).join("");
      content += `<h3>${escapeHtml(i18n.localize(`${prefix}.activities`))}</h3><dl>${activities}</dl>`;
    }

    return new DialogV2({
      window: { title: i18n.localize(`${prefix}.${section}.title`) },
      position: { width: 560 },
      classes: ["mk-group-help-dialog", ...getSheetTheme("group").classes],
      content: `<article class="mk-group-section-help">${content}</article>`,
      buttons: [{ action: "close", label: i18n.localize(`${prefix}.close`), default: true }],
    }).render(true);
  }

  _normalizeCampingResetButton(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelector) return;

    element.querySelectorAll("[data-action='reset-travel']").forEach(resetButton => {
      const activityKind = getActivityKind(resetButton.dataset.activityKind);
      const label = activityKind === ACTIVITY_KIND_TRAVEL
        ? "Reset Travel Assignments"
        : "Reset Camping Assignments";

      resetButton.classList.add("mk-camping-reset");
      resetButton.setAttribute("data-tooltip", label);
      resetButton.removeAttribute("title");
      resetButton.setAttribute("aria-label", label);
      resetButton.innerHTML = '<i class="fas fa-undo"></i>';
    });
  }

  _getActivityKindFromElement(element) {
    return getActivityKind(
      element?.dataset?.activityKind
      ?? element?.closest?.("[data-activity-kind]")?.dataset?.activityKind
    );
  }

  async _saveGroupData(groupData) {
    await this.actor.setFlag(MODULE_ID, "group", groupData);
  }

  _applyTabBackgrounds(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelector) return;

    const backgrounds = getGroupSheetTabBackgrounds();
    for (const [tabName, imagePath] of Object.entries(backgrounds)) {
      const tab = element.querySelector(`.mk-group-tab[data-tab="${tabName}"]`);
      if (!tab) continue;

      if (imagePath) {
        tab.style.setProperty("background-image", `url(${JSON.stringify(imagePath)})`, "important");
      } else {
        tab.style.removeProperty("background-image");
      }
    }
  }

  async _setPartyMemberActive(actorUuid, active) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can change the active party.");
      return false;
    }

    const groupData = getGroupData(this.actor);
    if (!groupData.members.includes(actorUuid)) return false;

    if (active) {
      if (!groupData.activeMembers.includes(actorUuid)) {
        groupData.activeMembers.push(actorUuid);
      }
    } else {
      groupData.activeMembers = groupData.activeMembers.filter(uuid => uuid !== actorUuid);
      groupData.companions.forEach(companion => {
        if (companion.type === "mount" && companion.riderUuid === actorUuid) {
          companion.riderUuid = "";
        }
      });

      for (const kind of ACTIVITY_KINDS) {
        for (const activity of Object.values(getActivityStore(groupData, kind))) {
          activity.actorUuids = (activity.actorUuids ?? []).filter(uuid => uuid !== actorUuid);
        }
      }

      groupData.travel.prompt = normalizeTravelPrompt({});
    }

    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onDrop(event) {
    event.preventDefault();

    const mountRiderTarget = event.target?.closest?.("[data-mount-rider-dropzone='true']");
    const draggedMemberUuid = this._campingDragActorUuid;
    if (mountRiderTarget && draggedMemberUuid) {
      await this._assignMountRider(mountRiderTarget.dataset.companionId, draggedMemberUuid);
      return false;
    }

    const data = TextEditorImplementation.getDragEventData(event);
    if (!data) return false;
    if (isGroupInventoryTransferData(data)) return false;

    const dropTarget = event.target?.closest?.("[data-party-member-dropzone='true']");
    const travelCard = event.target.closest?.("[data-travel-activity-key]");
    const mountDropTarget = event.target?.closest?.("[data-mount-dropzone='true']");
    const groupActorTarget = event.target?.closest?.("[data-group-actor-kind]");
    const boatAssignmentTarget = event.target?.closest?.("[data-boat-assignment-kind]");

    if (boatAssignmentTarget) {
      const boatUuid = boatAssignmentTarget.closest("[data-group-actor-uuid]")?.dataset.groupActorUuid;
      const actor = data.type === "Item" ? null : await this._resolveDroppedActor(data);
      await this._addBoatAssignment(boatUuid, boatAssignmentTarget.dataset.boatAssignmentKind, actor);
      return false;
    }

    if (groupActorTarget) {
      const actor = data.type === "Item" ? null : await this._resolveDroppedActor(data);
      await this._addGroupActorLink(groupActorTarget.dataset.groupActorKind, actor);
      return false;
    }

    if (data.type === "Actor" || data.uuid) {
      const droppedActor = await this._resolveDroppedActor(data);

      if (droppedActor) {
        if (droppedActor.id === this.actor.id) {
          ui.notifications.warn("A group cannot contain itself.");
          return false;
        }

        if (travelCard) {
          const groupData = getGroupData(this.actor);
          if (!groupData.members.includes(droppedActor.uuid)) {
            ui.notifications.warn("Add player characters by dropping them on the Party bar first.");
            return false;
          }

          const activityKey = travelCard.dataset.travelActivityKey;
          const activityKind = this._getActivityKindFromElement(travelCard);
          if (game.user.isGM || this.actor.isOwner) {
            await this._assignTravelActivity(activityKind, activityKey, droppedActor);
          } else {
            await this._requestTravelActivityMember(activityKind, activityKey, droppedActor.uuid, true);
          }
          return false;
        }

        if (mountRiderTarget) {
          if (droppedActor.type !== "Player") {
            ui.notifications.warn("Drop an active party member onto a mount to assign its rider.");
            return false;
          }

          await this._assignMountRider(mountRiderTarget.dataset.companionId, droppedActor.uuid);
          return false;
        }

        if (mountDropTarget) {
          if (droppedActor.type !== "NPC") {
            ui.notifications.warn("Only NPC actors can be added as mounts. Drag active party members onto a mount to assign riders.");
            return false;
          }

          await this._addMountFromActor(droppedActor);
          return false;
        }

        if (!dropTarget) {
          ui.notifications.warn("Drop player characters onto the Party bar to add them to the group.");
          return false;
        }

        if (droppedActor.type !== "Player") {
          ui.notifications.warn("Only player characters can be added to a group.");
          return false;
        }

        if (!game.user.isGM) {
          ui.notifications.warn("Only the GM can add members to a group.");
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
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can add members to a group.");
      return;
    }

    const groupData = getGroupData(this.actor);
    const uuid = memberActor.uuid;

    if (groupData.members.includes(uuid)) {
      ui.notifications.info(`${memberActor.name} is already in this group.`);
      return;
    }

    groupData.members.push(uuid);
    groupData.activeMembers.push(uuid);
    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _assignTravelActivity(activityKind, activityKey, memberActor) {
    const kind = getActivityKind(activityKind);
    const activity = getActivitiesForKind(kind).find(existing => existing.key === activityKey);
    if (!activity) return;

    const groupData = getGroupData(this.actor);

    if (!groupData.members.includes(memberActor.uuid)) {
      if (!game.user.isGM) {
        ui.notifications.warn("Only the GM can add members to a group.");
        return;
      }

      groupData.members.push(memberActor.uuid);
      groupData.activeMembers.push(memberActor.uuid);
    }

    setActivityMember(groupData, kind, activityKey, memberActor.uuid, true);

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _requestTravelActivityMember(activityKind, activityKey, actorUuid, assigned) {
    const kind = getActivityKind(activityKind);
    const activity = getActivitiesForKind(kind).find(existing => existing.key === activityKey);
    const memberActor = await resolveActorFromUuid(actorUuid);

    if (!activity || !memberActor) return false;

    if (!canUserControlActor(memberActor)) {
      ui.notifications.warn(`You can only assign characters you control.`);
      return false;
    }

    const groupData = getGroupData(this.actor);
    if (!groupData.members.includes(actorUuid)) {
      ui.notifications.warn(`${memberActor.name} is not in this group.`);
      return false;
    }

    if (!groupData.activeMembers.includes(actorUuid)) {
      ui.notifications.warn(`${memberActor.name} is on the roster. Add them to the active party first.`);
      return false;
    }

    if (game.user.isGM || this.actor.isOwner) {
      setActivityMember(groupData, kind, activityKey, actorUuid, assigned);
      await this._saveGroupData(groupData);
      this.render(false);
      return true;
    }

    if (!game.socket || !getPrimaryActiveGm()) {
      ui.notifications.warn("A GM must be connected for players to assign group tasks.");
      return false;
    }

    game.socket.emit(`module.${MODULE_ID}`, {
      feature: GROUP_SHEET_SOCKET_FEATURE,
      action: GROUP_SHEET_SOCKET_ASSIGN_TRAVEL,
      groupActorUuid: this.actor.uuid,
      activityKind: kind,
      activityKey,
      actorUuid,
      assigned: Boolean(assigned),
      userId: game.user.id,
    });

    return true;
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
    return this._removeGroupMember(row?.dataset?.memberUuid);
  }

  async _addMountFromActor(mountActor) {
    if (!this._canEditCompanions()) return false;

    const groupData = getGroupData(this.actor);
    if (groupData.companions.some(companion => companion.actorUuid === mountActor.uuid)) {
      ui.notifications.info(`${mountActor.name} is already listed as a mount.`);
      return false;
    }

    const hp = mountActor.system?.attributes?.hp ?? {};
    groupData.companions.push({
      id: foundry.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18),
      type: "mount",
      actorUuid: mountActor.uuid,
      img: mountActor.img,
      name: mountActor.name,
      rarity: "common",
      personality: "",
      strengthBonus: getActorAbilityModifier(mountActor, "str"),
      riderUuid: "",
      level: Math.max(1, Math.floor(Number(mountActor.system?.level?.value) || 1)),
      hpValue: Math.max(0, Math.floor(Number(hp.value) || 0)),
      hpMax: Math.max(0, Math.floor(Number(hp.max ?? hp.value) || 0)),
      movement: "Near",
      flying: false,
    });

    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _buildGroupActorLinks(groupData, kind) {
    const definition = GROUP_ACTOR_LINKS[kind];
    const entries = [];
    for (const uuid of groupData[kind]) {
      const card = await this._buildLinkedActorCard(uuid, definition.type, definition.label);
      if (kind === "boats") {
        const assignment = groupData.boatAssignments.find(entry => entry.actorUuid === uuid);
        card.captainName = assignment.captainName;
        card.assignmentSections = [];
        for (const assignmentKind of BOAT_ASSIGNMENT_KINDS) {
          const assigned = [];
          for (const entry of assignment[assignmentKind]) {
            assigned.push({
              ...await this._buildLinkedActorCard(entry.actorUuid, "NPC", assignmentKind === "crew" ? "crew member" : "warband"),
              quantity: entry.quantity,
            });
          }
          card.assignmentSections.push({
            kind: assignmentKind,
            label: assignmentKind === "crew" ? "Crew" : "Warbands",
            slotRule: assignmentKind === "crew" ? "1 crew slot each" : "20 crew slots each",
            entries: assigned,
            hasEntries: assigned.length > 0,
          });
        }
        const boat = card.available ? await this._resolveLinkedActor(uuid, "NPC") : null;
        card.crewSlotsUsed = getBoatCrewSlots(assignment);
        card.crewSlotCapacity = this._getBoatCrewCapacity(boat);
        card.crewSlotsRemaining = Math.max(0, card.crewSlotCapacity - card.crewSlotsUsed);
        card.crewSlotsOver = Math.max(0, card.crewSlotsUsed - card.crewSlotCapacity);
        card.overCapacity = card.available && card.crewSlotsOver > 0;
      }
      entries.push(card);
    }
    return entries;
  }

  async _resolveLinkedActor(uuid, type) {
    try {
      const actor = await resolveActorFromUuid(uuid);
      return actor?.type === type && actor.visible !== false ? actor : null;
    } catch {
      // Deleted compendium documents must leave a removable link on the group.
      return null;
    }
  }

  async _buildLinkedActorCard(uuid, type, label) {
    const actor = await this._resolveLinkedActor(uuid, type);
    return {
      uuid,
      name: actor?.name ?? `Unavailable ${label}`,
      img: actor?.img ?? "icons/svg/mystery-man.svg",
      available: Boolean(actor),
    };
  }

  _getBoatCrewCapacity(actor) {
    const hp = Number(actor?.system?.attributes?.hp?.max);
    return Number.isFinite(hp) ? Math.max(0, Math.floor(hp)) : 0;
  }

  _getBoatAssignmentContext(element, groupData) {
    const boatUuid = element.closest("[data-group-actor-uuid]")?.dataset.groupActorUuid;
    const kind = element.closest("[data-boat-assignment-kind]")?.dataset.boatAssignmentKind;
    const uuid = element.closest("[data-boat-assignment-uuid]")?.dataset.boatAssignmentUuid;
    const boat = groupData.boatAssignments.find(entry => entry.actorUuid === boatUuid);
    const assignment = BOAT_ASSIGNMENT_KINDS.includes(kind)
      ? boat?.[kind].find(entry => entry.actorUuid === uuid)
      : null;
    return { boat, kind, assignment };
  }

  async _hasBoatCrewCapacity(boat, previousSlots) {
    const used = getBoatCrewSlots(boat);
    if (used <= previousSlots) return true;
    const actor = await this._resolveLinkedActor(boat.actorUuid, "NPC");
    const capacity = this._getBoatCrewCapacity(actor);
    if (actor?.type === "NPC" && used <= capacity) return true;
    ui.notifications.warn(`This boat has ${capacity} crew slots (equal to its maximum HP); that assignment would use ${used}.`);
    this.render(false);
    return false;
  }

  async _addBoatAssignment(boatUuid, kind, actor) {
    if (!this._canManageGroupActorLinks() || !BOAT_ASSIGNMENT_KINDS.includes(kind)) return false;
    const groupData = getGroupData(this.actor);
    const boat = groupData.boatAssignments.find(entry => entry.actorUuid === boatUuid);
    if (!boat) return false;
    if (!actor?.uuid || actor.type !== "NPC" || actor.uuid === boatUuid || actor.id === this.actor.id) {
      ui.notifications.warn("Drop an NPC actor into this boat's Crew or Warbands section.");
      return false;
    }
    if (boat[kind].some(entry => entry.actorUuid === actor.uuid)) {
      ui.notifications.info(`${actor.name} is already assigned here. Change its quantity to add more.`);
      return false;
    }
    const previousSlots = getBoatCrewSlots(boat);
    boat[kind].push({ actorUuid: actor.uuid, quantity: 1 });
    if (!await this._hasBoatCrewCapacity(boat, previousSlots)) return false;
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onChangeBoat(event) {
    event.preventDefault();
    if (!this._canManageGroupActorLinks()) return false;
    const groupData = getGroupData(this.actor);
    const { boat, assignment } = this._getBoatAssignmentContext(event.currentTarget, groupData);
    if (!boat) return false;
    const field = event.currentTarget.dataset.boatField;
    if (field === "captainName") {
      boat.captainName = String(event.currentTarget.value ?? "").trim();
    } else if (field === "quantity" && assignment) {
      const quantity = Number(event.currentTarget.value);
      if (!Number.isFinite(quantity) || quantity < 1 || !Number.isInteger(quantity)) {
        this.render(false);
        return false;
      }
      const previousSlots = getBoatCrewSlots(boat);
      assignment.quantity = quantity;
      if (!await this._hasBoatCrewCapacity(boat, previousSlots)) return false;
    } else return false;
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onOpenBoatAssignment(event) {
    event.preventDefault();
    const { assignment } = this._getBoatAssignmentContext(event.currentTarget, getGroupData(this.actor));
    if (!assignment) return;
    const actor = await this._resolveLinkedActor(assignment.actorUuid, "NPC");
    actor?.sheet?.render(true);
  }

  async _onRemoveBoatAssignment(event) {
    event.preventDefault();
    if (!this._canManageGroupActorLinks()) return false;
    const groupData = getGroupData(this.actor);
    const { boat, kind, assignment } = this._getBoatAssignmentContext(event.currentTarget, groupData);
    if (!assignment) return false;
    boat[kind] = boat[kind].filter(entry => entry !== assignment);
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  _canManageGroupActorLinks() {
    if (this.isEditable && game.user?.isGM) return true;
    ui.notifications.warn("Only the GM can manage group warbands, boats and bastions.");
    return false;
  }

  async _addGroupActorLink(kind, actor) {
    if (!this._canManageGroupActorLinks()) return false;
    if (!Object.hasOwn(GROUP_ACTOR_LINKS, kind)) return false;
    const definition = GROUP_ACTOR_LINKS[kind];
    if (!actor?.uuid || actor.type !== definition.type || actor.id === this.actor.id) {
      ui.notifications.warn(`Drop ${definition.dropLabel} into this tab.`);
      return false;
    }

    const groupData = getGroupData(this.actor);
    if (groupData[kind].includes(actor.uuid)) {
      ui.notifications.info(`${actor.name} is already listed in this tab.`);
      return false;
    }
    groupData[kind].push(actor.uuid);
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onOpenGroupActor(event) {
    event.preventDefault();
    const row = event.currentTarget.closest("[data-group-actor-uuid]");
    const kind = row?.closest("[data-group-actor-kind]")?.dataset.groupActorKind;
    const uuid = row?.dataset.groupActorUuid;
    if (!Object.hasOwn(GROUP_ACTOR_LINKS, kind) || !getGroupData(this.actor)[kind].includes(uuid)) return;
    const actor = await resolveActorFromUuid(uuid);
    if (actor?.visible !== false) actor?.sheet?.render(true);
  }

  async _onRemoveGroupActor(event) {
    event.preventDefault();
    if (!this._canManageGroupActorLinks()) return false;
    const row = event.currentTarget.closest("[data-group-actor-uuid]");
    const kind = row?.closest("[data-group-actor-kind]")?.dataset.groupActorKind;
    if (!Object.hasOwn(GROUP_ACTOR_LINKS, kind)) return false;
    const groupData = getGroupData(this.actor);
    groupData[kind] = groupData[kind].filter(uuid => uuid !== row.dataset.groupActorUuid);
    if (kind === "boats") {
      groupData.boatAssignments = groupData.boatAssignments.filter(entry => entry.actorUuid !== row.dataset.groupActorUuid);
    }
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _removeGroupMember(uuid, { confirm = false } = {}) {
    if (!uuid) return false;

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can remove members from a group.");
      return false;
    }

    if (confirm) {
      const member = await resolveActorFromUuid(uuid);
      const confirmed = await Dialog.confirm({
        title: "Remove Group Member",
        content: `<p>Remove <strong>${escapeHtml(member?.name ?? "this character")}</strong> from the group?</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });
      if (!confirmed) return false;
    }

    const groupData = getGroupData(this.actor);

    groupData.members = groupData.members.filter(existingUuid => existingUuid !== uuid);
    groupData.activeMembers = groupData.activeMembers.filter(existingUuid => existingUuid !== uuid);
    groupData.companions.forEach(companion => {
      if (companion.type === "mount" && companion.riderUuid === uuid) {
        companion.riderUuid = "";
      }
      if (companion.type === "hireling" && companion.ownerUuid === uuid) {
        companion.ownerUuid = "";
      }
    });

    for (const kind of ACTIVITY_KINDS) {
      for (const activity of Object.values(getActivityStore(groupData, kind))) {
        activity.actorUuids = (activity.actorUuids ?? []).filter(
          actorUuid => actorUuid !== uuid
        );
      }
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

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can adjust XP from the group sheet.");
      return;
    }

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

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can roll weather.");
      return;
    }

    let weather;
    try {
      weather = await rollWeather();
    } catch (error) {
      ui.notifications.warn(`Weather was not rolled: ${error.message}`);
      return;
    }

    const groupData = getGroupData(this.actor);
    groupData.travel.weatherTemperature = weather.temperature.text;
    groupData.travel.weatherWindSpeed = weather.windSpeed.text;
    groupData.travel.weatherTemperatureRoll = {
      formula: weather.temperature.formula,
      total: weather.temperature.total,
    };
    groupData.travel.weatherWindSpeedRoll = {
      formula: weather.windSpeed.formula,
      total: weather.windSpeed.total,
    };
    groupData.travel.weather = getWeatherLabel(groupData.travel);
    groupData.travel.weatherRolledAt = Date.now();
    groupData.travel.weatherTables = {
      temperature: weather.temperature.tableUuid,
      windSpeed: weather.windSpeed.tableUuid,
    };

    await this._saveGroupData(groupData);
    try {
      await showWeatherRolls(weather, this.actor);
    } catch (error) {
      console.error(`${MODULE_ID} | Group Sheet | Could not post weather rolls.`, error);
      ui.notifications.warn("Weather was rolled, but its chat message could not be created.");
    }
    this.render(false);
  }

  async _onChangeSpeed(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    groupData.travel.speed = event.currentTarget.value;

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onChangeMilesPerHour(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    groupData.travel.milesPerHour = clampNumber(
      event.currentTarget.value,
      GROUP_TRAVEL_MILES_PER_HOUR_DEFAULT,
      0,
      100
    );

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onChangeHexesToExplore(event) {
    event.preventDefault();

    const groupData = getGroupData(this.actor);
    groupData.travel.hexesToExplore = Math.round(clampNumber(
      event.currentTarget.value,
      GROUP_TRAVEL_HEXES_DEFAULT,
      0,
      999
    ));

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onStartTravelRolls(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can prompt travelling.");
      return;
    }

    const groupData = getGroupData(this.actor);
    const assignmentKeys = getTravelAssignmentKeys(groupData);

    if (!assignmentKeys.length) {
      ui.notifications.warn("Add at least one character to the group first.");
      return;
    }

    const startedAt = Date.now();

    removeTravelPromptElement(document.getElementById(TRAVEL_PROMPT_ELEMENT_ID));

    groupData.travel.prompt = {
      id: createTravelPromptId(),
      active: true,
      startedAt,
      progressStartedAt: 0,
      completedKeys: [],
      failedSteps: [],
      resolvedSteps: [],
      results: createEmptyTravelPromptResults(),
    };

    await this._saveGroupData(groupData);

    const payload = await buildTravelPromptPayload(this.actor, groupData);
    await showTravelRollPrompt(payload);

    game.socket?.emit(`module.${MODULE_ID}`, {
      feature: GROUP_SHEET_SOCKET_FEATURE,
      action: GROUP_SHEET_SOCKET_PROMPT_TRAVEL,
      payload,
    });
    await broadcastTravelPromptChat(GROUP_SHEET_SOCKET_PROMPT_TRAVEL, payload);

    this.render(false);
  }

  async _onResetTravel(event) {
    event.preventDefault();

    const kind = this._getActivityKindFromElement(event.currentTarget);
    const label = kind === ACTIVITY_KIND_TRAVEL ? "travel" : "camping";

    if (!game.user.isGM) {
      ui.notifications.warn(`Only the GM can reset ${label} assignments.`);
      return;
    }

    const groupData = getGroupData(this.actor);
    const activityStore = getActivityStore(groupData, kind);

    for (const key of Object.keys(activityStore)) {
      delete activityStore[key];
    }

    for (const activity of getActivitiesForKind(kind)) {
      activityStore[activity.key] = {
        actorUuids: [],
      };
    }

    if (kind === ACTIVITY_KIND_TRAVEL) {
      if (groupData.travel.prompt?.id) {
        clearTravelPromptTimer(this.actor.uuid, groupData.travel.prompt.id);
      }
      groupData.travel.prompt = normalizeTravelPrompt({});
    }

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onToggleTravelParticipant(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest("[data-travel-activity-key]");
    const kind = this._getActivityKindFromElement(card);
    const activityKey = card?.dataset?.travelActivityKey;
    const actorUuid = event.currentTarget.dataset.memberUuid;

    if (!activityKey || !actorUuid) return;

    const groupData = getGroupData(this.actor);
    const activityData = getActivityStore(groupData, kind)[activityKey] ?? {};
    const actorUuids = Array.isArray(activityData.actorUuids)
      ? activityData.actorUuids
      : [];
    const currentlyAssignedHere = actorUuids.includes(actorUuid);

    await this._requestTravelActivityMember(kind, activityKey, actorUuid, !currentlyAssignedHere);
  }

  _onToggleTravelPicker(event) {
    event.preventDefault();
    event.stopPropagation();

    const card = event.currentTarget.closest("[data-travel-activity-key]");
    if (!card) return;

    const tab = card.closest(".mk-group-tab");
    const wasOpen = card.classList.contains("is-picking");

    tab?.querySelectorAll(".mk-travel-card.is-picking").forEach(existing => {
      existing.classList.remove("is-picking");
    });

    if (!wasOpen) card.classList.add("is-picking");
  }

  _onCampingMemberDragStart(event) {
    const nativeEvent = event.originalEvent ?? event;
    const dataTransfer = nativeEvent.dataTransfer;
    const actorUuid = event.currentTarget?.dataset?.memberUuid;

    if (event.currentTarget?.classList?.contains("is-unavailable")) {
      event.preventDefault();
      return;
    }

    if (!dataTransfer || !actorUuid) return;

    dataTransfer.effectAllowed = "move";
    this._campingDragActorUuid = actorUuid;

    try {
      dataTransfer.setData(CAMPING_MEMBER_DRAG_TYPE, actorUuid);
    } catch (_error) {
      // Some browser shells only allow standard drag data types.
    }

    dataTransfer.setData("text/plain", actorUuid);

    event.currentTarget.classList.add("is-dragging");
  }

  _onCampingMemberDragEnd(event) {
    this._campingDragActorUuid = "";
    event.currentTarget?.classList.remove("is-dragging");
    this.element?.find?.(".mk-travel-card.is-drag-over")?.removeClass("is-drag-over");
  }

  _onCampingActivityDragEnter(event) {
    if (!this._hasCampingDragData(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList.add("is-drag-over");
  }

  _onCampingActivityDragOver(event) {
    const nativeEvent = event.originalEvent ?? event;
    if (!this._hasCampingDragData(event)) return;

    event.preventDefault();
    event.stopPropagation();
    if (nativeEvent.dataTransfer) nativeEvent.dataTransfer.dropEffect = "move";
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
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const actorUuid = this._getCampingDragActorUuid(event);
    const activityKind = this._getActivityKindFromElement(event.currentTarget);
    const activityKey = event.currentTarget?.dataset?.travelActivityKey;

    event.currentTarget?.classList.remove("is-drag-over");
    this._campingDragActorUuid = "";

    if (!actorUuid || !activityKey) return;

    const groupData = getGroupData(this.actor);
    if (!groupData.members.includes(actorUuid)) return;

    await this._requestTravelActivityMember(activityKind, activityKey, actorUuid, true);
  }

  _getCampingDragActorUuid(event) {
    const nativeEvent = event.originalEvent ?? event;
    const dataTransfer = nativeEvent.dataTransfer;
    if (!dataTransfer) return this._campingDragActorUuid || "";

    return dataTransfer.getData(CAMPING_MEMBER_DRAG_TYPE)
      || dataTransfer.getData("text/plain")
      || this._campingDragActorUuid
      || "";
  }

  _hasCampingDragData(event) {
    const nativeEvent = event.originalEvent ?? event;
    const types = Array.from(nativeEvent.dataTransfer?.types ?? []);
    return Boolean(this._campingDragActorUuid)
      || types.includes(CAMPING_MEMBER_DRAG_TYPE)
      || types.includes("text/plain");
  }

  async _addItemToGroup(item) {
    if (item.parent?.uuid === this.actor.uuid) return;

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

  _canEditCompanions() {
    if (this.isEditable && game.user.isGM) return true;

    ui.notifications.warn("Only the GM can manage hirelings and mounts.");
    return false;
  }

  async _onAddCompanion(event) {
    event.preventDefault();
    if (!this._canEditCompanions()) return;

    const type = event.currentTarget.dataset.companionType === "mount" ? "mount" : "hireling";
    const groupData = getGroupData(this.actor);
    groupData.companions.push({
      id: foundry.utils?.randomID?.(16) ?? Math.random().toString(36).slice(2, 18),
      type,
      name: type === "mount" ? "Unnamed Mount" : "Unnamed Hireling",
      carrySlots: 0,
      background: "",
      ownerUuid: "",
      rarity: "common",
      personality: "",
      strengthBonus: 0,
      riderUuid: "",
      level: 1,
      hpValue: 0,
      hpMax: 0,
      movement: "Near",
      flying: false,
    });

    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onChangeCompanion(event) {
    event.preventDefault();
    if (!this._canEditCompanions()) return;

    const row = event.currentTarget.closest("[data-companion-id]");
    const id = row?.dataset?.companionId;
    const field = event.currentTarget.dataset.companionField;
    if (!id || ![
      "name", "carrySlots", "rarity", "personality", "strengthBonus", "riderUuid",
      "level", "hpValue", "hpMax", "movement", "flying", "background", "ownerUuid",
    ].includes(field)) return;

    const groupData = getGroupData(this.actor);
    const companion = groupData.companions.find(entry => entry.id === id);
    if (!companion) return;
    if (["background", "ownerUuid"].includes(field) && companion.type !== "hireling") return;

    if (field === "name") {
      companion.name = String(event.currentTarget.value ?? "").trim()
        || (companion.type === "mount" ? "Unnamed Mount" : "Unnamed Hireling");
    } else if (field === "ownerUuid") {
      const ownerUuid = String(event.currentTarget.value ?? "").trim();
      const owner = ownerUuid && groupData.members.includes(ownerUuid)
        ? await resolveActorFromUuid(ownerUuid)
        : null;
      if (ownerUuid && owner?.type !== "Player") {
        ui.notifications.warn("Choose a player character from the group as the hireling's owner.");
        this.render(false);
        return;
      }
      companion.ownerUuid = ownerUuid;
    } else if (field === "flying") {
      companion.flying = Boolean(event.currentTarget.checked);
    } else if (["personality", "movement", "riderUuid", "background"].includes(field)) {
      companion[field] = String(event.currentTarget.value ?? "").trim();
    } else if (field === "rarity") {
      companion.rarity = ["common", "uncommon", "rare", "legendary"].includes(event.currentTarget.value)
        ? event.currentTarget.value
        : "common";
    } else if (field === "strengthBonus") {
      companion.strengthBonus = Math.trunc(Number(event.currentTarget.value) || 0);
    } else if (field === "level") {
      companion.level = Math.max(1, Math.floor(Number(event.currentTarget.value) || 1));
    } else {
      companion[field] = Math.max(0, Math.floor(Number(event.currentTarget.value) || 0));
    }

    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onRestParty(event) {
    event.preventDefault();

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can rest the active party.");
      return;
    }

    const button = event.currentTarget;
    if (button?.disabled) return;

    const groupData = getGroupData(this.actor);
    const members = [];
    for (const actorUuid of groupData.activeMembers) {
      const actor = await resolveActorFromUuid(actorUuid);
      if (actor?.update && canUserControlActor(actor)) members.push(actor);
    }

    if (!members.length) {
      ui.notifications.warn("Add at least one active party member before resting.");
      return;
    }

    const availableRations = getPartyFoodTotal(members);
    const rationInput = await Dialog.wait({
      title: "Rest Active Party",
      content: `
        <form>
          <p>The active party has <strong>${availableRations}</strong> tracked ration${availableRations === 1 ? "" : "s"}.</p>
          <div class="form-group">
            <label>Total rations to consume</label>
            <input type="number" name="rations" value="${Math.min(members.length, availableRations)}" min="0" max="${availableRations}" step="1" required>
          </div>
          <p>Rations are deducted from active party members as evenly as their supplies allow.</p>
        </form>
      `,
      buttons: {
        rest: {
          icon: "<i class='fas fa-bed'></i>",
          label: "Consume Rations and Rest",
          callback: html => getDialogFieldValue(html, "[name='rations']"),
        },
        cancel: {
          icon: "<i class='fas fa-times'></i>",
          label: "Cancel",
          callback: () => null,
        },
      },
      default: "rest",
      close: () => null,
    });
    if (rationInput === null) return;

    const rationCount = Number(rationInput);
    if (!Number.isInteger(rationCount) || rationCount < 0 || rationCount > availableRations) {
      ui.notifications.warn(`Enter a whole number from 0 to ${availableRations}.`);
      return;
    }

    const mode = getRestMode();
    if (button) button.disabled = true;

    const restedNames = [];
    const failedNames = [];
    try {
      try {
        await consumePartyFoodRations(members, rationCount);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not consume party rations.`, error);
        ui.notifications.error(`Could not consume rations. ${error?.message ?? ""}`.trim());
        return;
      }

      for (const actor of members) {
        try {
          const result = await restActor(actor, mode);
          if (!result) continue;

          await reportRest(actor, result);
          restedNames.push(actor.name);
        } catch (error) {
          console.error(`${MODULE_ID} | Could not rest ${actor.name}.`, error);
          failedNames.push(actor.name);
        }
      }
    } finally {
      if (button?.isConnected) button.disabled = false;
    }

    if (restedNames.length) {
      ui.notifications.info(
        `${restedNames.length} party member${restedNames.length === 1 ? "" : "s"} completed a ${mode} rest. `
        + `${rationCount} ration${rationCount === 1 ? "" : "s"} consumed.`
      );
    }
    if (failedNames.length) {
      ui.notifications.warn(`Could not rest: ${failedNames.join(", ")}.`);
    }

    this.render(false);
  }

  _getMountRiderDropTarget(event) {
    return event.currentTarget?.closest?.("[data-mount-rider-dropzone='true']")
      ?? event.target?.closest?.("[data-mount-rider-dropzone='true']");
  }

  _onMountRiderDragEnter(event) {
    if (!this._campingDragActorUuid) return;
    event.preventDefault();
    this._getMountRiderDropTarget(event)?.classList.add("is-rider-drag-over");
  }

  _onMountRiderDragOver(event) {
    if (!this._campingDragActorUuid) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    this._getMountRiderDropTarget(event)?.classList.add("is-rider-drag-over");
  }

  _onMountRiderDragLeave(event) {
    const target = this._getMountRiderDropTarget(event);
    if (!target || target.contains(event.relatedTarget)) return;
    target.classList.remove("is-rider-drag-over");
  }

  _onMountRiderDrop(event) {
    this._getMountRiderDropTarget(event)?.classList.remove("is-rider-drag-over");
  }

  async _assignMountRider(mountId, riderUuid) {
    if (!this._canEditCompanions() || !mountId || !riderUuid) return false;

    const groupData = getGroupData(this.actor);
    const mount = groupData.companions.find(companion => (
      companion.id === mountId && companion.type === "mount"
    ));

    if (!mount) return false;
    if (!groupData.activeMembers.includes(riderUuid)) {
      ui.notifications.warn("Only active party members can ride a mount.");
      return false;
    }

    mount.riderUuid = riderUuid;
    await this._saveGroupData(groupData);
    this.render(false);
    return true;
  }

  async _onClearMountRider(event) {
    event.preventDefault();
    if (!this._canEditCompanions()) return;

    const mountId = event.currentTarget.closest("[data-companion-id]")?.dataset?.companionId;
    if (!mountId) return;

    const groupData = getGroupData(this.actor);
    const mount = groupData.companions.find(companion => (
      companion.id === mountId && companion.type === "mount"
    ));
    if (!mount) return;

    mount.riderUuid = "";
    await this._saveGroupData(groupData);
    this.render(false);
  }

  async _onRemoveCompanion(event) {
    event.preventDefault();
    if (!this._canEditCompanions()) return;

    const row = event.currentTarget.closest("[data-companion-id]");
    const id = row?.dataset?.companionId;
    if (!id) return;

    const groupData = getGroupData(this.actor);
    const companion = groupData.companions.find(entry => entry.id === id);
    if (!companion) return;

    const confirmed = await Dialog.confirm({
      title: "Remove Companion",
      content: `<p>Remove <strong>${escapeHtml(companion.name)}</strong> from the group?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false,
    });
    if (!confirmed) return;

    groupData.companions = groupData.companions.filter(entry => entry.id !== id);
    await this._saveGroupData(groupData);
    this.render(false);
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

}
export {
  createGroupActor,
  MKGroupSheet,
};
