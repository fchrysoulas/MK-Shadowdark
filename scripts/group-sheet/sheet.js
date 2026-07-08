// scripts/group-sheet/sheet.js

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
  MODULE_ID,
  SHEET_ID,
  SPEED_OPTIONS,
  TRAVEL_PROMPT_ELEMENT_ID,
  WEATHER_OPTIONS,
} from "./constants.js";
import { canUserControlActor, resolveActorFromUuid, resolveItemFromDropData } from "./actors.js";
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
  setActivityMember,
} from "./activities.js";
import { buildGroupSheetStyle, getTravelPrepDurationMs } from "./group-settings.js";
import {
  buildCampingResources,
  buildHeaderSummary,
  buildInventoryItemData,
  buildMemberData,
  calculateCoinSlots,
  calculateGroupInventorySlots,
} from "./inventory.js";
import { rollActorAbility } from "./rolls.js";
import {
  broadcastTravelPromptChat,
  clearTravelPromptTimer,
  removeTravelPromptElement,
  scheduleTravelPromptSequence,
  showTravelRollPrompt,
} from "./travel-prompt.js";
import { getDialogFieldValue, numberOrZero, optionLabel } from "./utils.js";
import { getPrimaryActiveGm } from "./users.js";
async function createGroupActor() {
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
          camping: {
            activities: {},
          },
        },
      },
    },
  });

  actor.sheet.render(true);
  return actor;
}

class SDXGroupSheet extends ActorSheet {
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

  _disableFields(form) {
    super._disableFields(form);
    this._enablePlayerCampingControls(form);
  }

  _enablePlayerCampingControls(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelectorAll) return;

    const selectors = [
      ".sdx-travel-roll[data-has-assigned='true']",
      ".sdx-camping-roster-member[data-can-assign='true']",
      ".sdx-travel-member-toggle[data-can-assign='true']",
      ".sdx-camping-assigned-chip",
    ];

    element.querySelectorAll(selectors.join(",")).forEach(control => {
      control.disabled = false;
      control.removeAttribute("disabled");
    });
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const groupData = getGroupData(this.actor);

    const members = [];
    const memberActors = [];

    for (const uuid of groupData.members) {
      const memberActor = await resolveActorFromUuid(uuid);
      if (!memberActor) continue;

      memberActors.push(memberActor);
      members.push(await buildMemberData(memberActor));
    }

    const inventoryItems = [...this.actor.items].map(buildInventoryItemData);
    const inventorySlots = calculateGroupInventorySlots(this.actor);
    const coins = this.actor.system?.coins ?? {};
    const campingActivities = await buildActivities(groupData, members, ACTIVITY_KIND_CAMPING);
    const travelActivities = await buildActivities(groupData, members, ACTIVITY_KIND_TRAVEL);
    const travelProgress = buildTravelProgress(groupData);
    const travelPromptActorCount = getTravelAssignmentKeys(groupData).length;

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
      sheetStyle: buildGroupSheetStyle(),
      summary: buildHeaderSummary(members),
      members,
      hasMembers: members.length > 0,
      canEditGroup: this.isEditable && game.user.isGM,
      campingResources: buildCampingResources(memberActors, this.actor),
      camping: {
        members: buildActivityMemberRoster(groupData, members, ACTIVITY_KIND_CAMPING),
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
        weatherLabel: optionLabel(WEATHER_OPTIONS, groupData.travel.weather),
        speed: groupData.travel.speed,
        speedOptions: SPEED_OPTIONS.map(option => ({
          ...option,
          selected: option.value === groupData.travel.speed,
        })),
        members: buildActivityMemberRoster(groupData, members, ACTIVITY_KIND_TRAVEL),
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

    html.find("[data-action='start-travel-rolls']").on("click", event => {
      this._onStartTravelRolls(event);
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

    html[0]?.querySelectorAll(".sdx-travel-card[data-travel-activity-key]").forEach(card => {
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
  }

  _normalizeCampingResetButton(root) {
    const element = root?.jquery ? root[0] : root?.[0] ?? root;
    if (!element?.querySelector) return;

    element.querySelectorAll("[data-action='reset-travel']").forEach(resetButton => {
      const activityKind = getActivityKind(resetButton.dataset.activityKind);
      const label = activityKind === ACTIVITY_KIND_TRAVEL
        ? "Reset Travel Assignments"
        : "Reset Camping Assignments";

      resetButton.classList.add("sdx-camping-reset");
      resetButton.setAttribute("data-tooltip", label);
      resetButton.removeAttribute("title");
      resetButton.setAttribute("aria-label", label);
      resetButton.innerHTML = '<i class="fas fa-undo"></i>';

      const roster = resetButton.closest(".sdx-camping-roster");
      if (roster && !roster.contains(resetButton)) {
        roster.appendChild(resetButton);
      }
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
          const activityKind = this._getActivityKindFromElement(travelCard);
          if (game.user.isGM || this.actor.isOwner) {
            await this._assignTravelActivity(activityKind, activityKey, droppedActor);
          } else {
            await this._requestTravelActivityMember(activityKind, activityKey, droppedActor.uuid, true);
          }
          return false;
        }

        if (!travelCard && !game.user.isGM) {
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

    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can remove members from a group.");
      return;
    }

    const row = event.currentTarget.closest("[data-member-uuid]");
    const uuid = row?.dataset?.memberUuid;

    if (!uuid) return;

    const groupData = getGroupData(this.actor);

    groupData.members = groupData.members.filter(existingUuid => existingUuid !== uuid);

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
      prepDurationMs: getTravelPrepDurationMs(),
      completedKeys: [],
      failedSteps: [],
      resolvedSteps: [],
      results: createEmptyTravelPromptResults(),
    };

    await this._saveGroupData(groupData);

    const payload = await buildTravelPromptPayload(this.actor, groupData);
    await showTravelRollPrompt(payload);
    scheduleTravelPromptSequence(payload);

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
    this.element?.find?.(".sdx-travel-card.is-drag-over")?.removeClass("is-drag-over");
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
export {
  createGroupActor,
  SDXGroupSheet,
};