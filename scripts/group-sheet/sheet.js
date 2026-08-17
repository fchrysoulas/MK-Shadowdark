import {
  ABILITIES,
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
import { clampNumber, escapeHtml, getDialogFieldValue, numberOrZero } from "./utils.js";
import { getPrimaryActiveGm } from "./users.js";

const ActorSheetBase = globalThis.foundry?.appv1?.sheets?.ActorSheet;
const TextEditorImplementation = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;

async function createGroupActor({ name = "New Group", folder = null } = {}) {
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
          initial: "traveling",
        },
      ],
      dragDrop: [
        {
          dragSelector: null,
          dropSelector: ".mk-group-sheet",
        },
      ],
    });
  }

  get template() {
    return `modules/${MODULE_ID}/templates/group-sheet.hbs`;
  }

  _disableFields(form) {
    super._disableFields(form);
    this._enablePlayerCampingControls(form);
  }

  _enablePlayerCampingControls(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelectorAll) return;

    const selectors = [
      ".mk-travel-roll[data-has-assigned='true']",
      ".mk-camping-roster-member[data-can-assign='true']",
      ".mk-travel-member-toggle[data-can-assign='true']",
      ".mk-camping-assigned-chip",
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
    const hirelings = companions
      .filter(companion => companion.type === "hireling")
      .map(companion => ({ ...companion }));
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

    context.mk = {
      isGroup: true,
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

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._applyTabBackgrounds(html);
    this._normalizeCampingResetButton(html);
    this._enablePlayerCampingControls(html);

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

    html[0]?.querySelectorAll("[data-mount-rider-dropzone='true']").forEach(card => {
      card.addEventListener("dragenter", event => this._onMountRiderDragEnter(event), true);
      card.addEventListener("dragover", event => this._onMountRiderDragOver(event), true);
      card.addEventListener("dragleave", event => this._onMountRiderDragLeave(event), true);
      card.addEventListener("drop", event => this._onMountRiderDrop(event), true);
    });
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

    const dropTarget = event.target?.closest?.("[data-party-member-dropzone='true']");
    const travelCard = event.target.closest?.("[data-travel-activity-key]");
    const mountDropTarget = event.target?.closest?.("[data-mount-dropzone='true']");

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
          callback: html => getDialogFieldValue(html, "[name='ability']"),
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
    const kind = this._getActivityKindFromElement(card);
    const activityKey = card?.dataset?.travelActivityKey;
    const activity = getActivitiesForKind(kind).find(existing => existing.key === activityKey);

    if (!activity) return;

    const groupData = getGroupData(this.actor);
    const actorUuids = getActivityStore(groupData, kind)?.[activityKey]?.actorUuids ?? [];

    if (actorUuids.length === 0) {
      ui.notifications.warn(`Drop one or more characters on ${activity.name} first.`);
      return;
    }

    const ability = await this._pickTravelAbility(activity);
    if (!ability) return;

    let rolled = 0;

    for (const actorUuid of actorUuids) {
      const actor = await resolveActorFromUuid(actorUuid);
      if (!actor) continue;
      if (!canUserControlActor(actor)) continue;

      await rollActorAbility(actor, ability, {
        event,
        target: activity.dc,
        fastForward: event.shiftKey,
      });
      rolled += 1;
    }

    if (rolled === 0) {
      ui.notifications.warn(`You can only roll ${activity.name} for characters you control.`);
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
      "level", "hpValue", "hpMax", "movement", "flying",
    ].includes(field)) return;

    const groupData = getGroupData(this.actor);
    const companion = groupData.companions.find(entry => entry.id === id);
    if (!companion) return;

    if (field === "name") {
      companion.name = String(event.currentTarget.value ?? "").trim()
        || (companion.type === "mount" ? "Unnamed Mount" : "Unnamed Hireling");
    } else if (field === "flying") {
      companion.flying = Boolean(event.currentTarget.checked);
    } else if (["personality", "movement", "riderUuid"].includes(field)) {
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
