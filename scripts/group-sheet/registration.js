import {
  ACTIVITY_KINDS,
  GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT,
  GROUP_SHEET_SOCKET_ASSIGN_TRAVEL,
  GROUP_SHEET_SOCKET_FEATURE,
  GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL,
  GROUP_SHEET_SOCKET_PROMPT_TRAVEL,
  GROUP_SHEET_SOCKET_UPDATE_TRAVEL,
  LEGACY_MODULE_ID,
  LEGACY_SHEET_ID,
  MODULE_ID,
  SHEET_ID,
} from "./constants.js";
import {
  canUserControlActor,
  ensureGroupActorHpDefaults,
  getGroupInventoryMaxSlots,
  getRawFlag,
  getSheetClassFlag,
  isGroupActor,
  resolveActorFromUuid,
} from "./actors.js";
import {
  getActivitiesForKind,
  getActivityKind,
  getActivityStore,
  getGroupData,
  setActivityMember,
} from "./activities.js";
import { getSettingValue } from "./group-settings.js";
import { handleTravelRollChatMessage } from "./rolls.js";
import { createGroupActor, SDXGroupSheet } from "./sheet.js";
import { travelPromptChatMessagesSeen } from "./state.js";
import { applyTravelPlayerRollResult, handleTravelPromptTransport } from "./travel-prompt.js";
import { sdxGroupLog } from "./utils.js";
import { getGameUserById, isPrimaryActiveGm } from "./users.js";

const GROUP_ACTOR_DIALOG_TYPE = "Group";
let actorCreateDialogPatched = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[character]));
}

function getActorDocumentTypes() {
  const documentTypes =
    game.system?.documentTypes?.Actor ??
    game.documentTypes?.Actor ??
    CONFIG.Actor?.documentClass?.metadata?.types ??
    [];

  return [...new Set(Array.from(documentTypes).filter(Boolean))];
}

function getActorTypeLabel(type) {
  if (type === GROUP_ACTOR_DIALOG_TYPE) return "Group";

  const label = CONFIG.Actor?.typeLabels?.[type];
  if (label) return game.i18n.localize(label);

  const typeKey = `TYPES.Actor.${type}`;
  const localized = game.i18n.localize(typeKey);
  return localized === typeKey ? type : localized;
}

function getActorCreationFormData(html) {
  const root = html?.[0] ?? html;
  const form = root?.querySelector?.("form");
  if (!form) return {};

  if (globalThis.FormDataExtended) {
    return new FormDataExtended(form).object;
  }

  return Object.fromEntries(new FormData(form).entries());
}

function getFolderId(folder) {
  if (!folder) return null;
  return typeof folder === "string" ? folder : folder.id ?? null;
}

function getActorFolderOptions(selectedFolder) {
  const selectedFolderId = getFolderId(selectedFolder);
  const folders = Array.from(game.folders ?? [])
    .filter(folder => folder.type === "Actor")
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  if (!folders.length) return "";

  const options = folders.map(folder => `
    <option value="${escapeHtml(folder.id)}" ${folder.id === selectedFolderId ? "selected" : ""}>
      ${escapeHtml(folder.name)}
    </option>
  `).join("");

  return `
    <div class="form-group">
      <label>Folder</label>
      <select name="folder">
        <option value=""></option>
        ${options}
      </select>
    </div>
  `;
}

function shouldOfferGroupActorType(data = {}) {
  return game.user?.isGM &&
    getSettingValue("enableGroupActors", true) &&
    (!data.type || data.type === GROUP_ACTOR_DIALOG_TYPE);
}

function buildActorCreateDialogContent(data = {}) {
  const selectedType = data.type || getActorDocumentTypes()[0] || "Player";
  const typeOptions = [...new Set([...getActorDocumentTypes(), GROUP_ACTOR_DIALOG_TYPE])]
    .map(type => `
      <option value="${escapeHtml(type)}" ${type === selectedType ? "selected" : ""}>
        ${escapeHtml(getActorTypeLabel(type))}
      </option>
    `)
    .join("");

  return `
    <form autocomplete="off">
      <div class="form-group">
        <label>Name</label>
        <input type="text" name="name" value="${escapeHtml(data.name ?? "")}" autofocus>
      </div>
      <div class="form-group">
        <label>Type</label>
        <select name="type">${typeOptions}</select>
      </div>
      ${getActorFolderOptions(data.folder)}
    </form>
  `;
}

async function handleActorCreateDialog(actorClass, data, html) {
  const formData = getActorCreationFormData(html);

  if (formData.type === GROUP_ACTOR_DIALOG_TYPE) {
    return createGroupActor({
      name: formData.name || data.name || "New Group",
      folder: formData.folder || getFolderId(data.folder),
    });
  }

  const createData = foundry.utils.mergeObject(foundry.utils.deepClone(data), formData);
  if (!createData.folder) delete createData.folder;

  return actorClass.create(createData, { renderSheet: true });
}

function patchActorCreateDialog() {
  if (actorCreateDialogPatched || !Actor?.createDialog) return;
  actorCreateDialogPatched = true;

  const originalCreateDialog = Actor.createDialog;

  Actor.createDialog = function patchedCreateDialog(data = {}, options = {}, ...args) {
    if (!shouldOfferGroupActorType(data)) {
      return originalCreateDialog.call(this, data, options, ...args);
    }

    const actorClass = this?.create ? this : Actor;
    const actorLabel = game.i18n.localize(actorClass.metadata?.label ?? "DOCUMENT.Actor");
    const title = game.i18n.format("DOCUMENT.Create", { type: actorLabel }) || "Create Actor";

    return Dialog.wait({
      title,
      content: buildActorCreateDialogContent(data),
      buttons: {
        create: {
          icon: "<i class='fas fa-plus'></i>",
          label: title,
          callback: html => handleActorCreateDialog(actorClass, data, html),
        },
        cancel: {
          icon: "<i class='fas fa-times'></i>",
          label: "Cancel",
          callback: () => null,
        },
      },
      default: "create",
      close: () => null,
    }, options);
  };
}

function rerenderOpenGroupSheets(updatedActor) {
  for (const app of Object.values(ui.windows)) {
    if (!(app instanceof SDXGroupSheet)) continue;

    const groupData = getGroupData(app.actor);

    const assignedActivityActors = ACTIVITY_KINDS.flatMap(kind => (
      Object.values(getActivityStore(groupData, kind) ?? {})
        .flatMap(activity => activity.actorUuids ?? [])
        .filter(Boolean)
    ));

    if (
      groupData.members.includes(updatedActor.uuid) ||
      assignedActivityActors.includes(updatedActor.uuid) ||
      app.actor.id === updatedActor.id
    ) {
      app.render(false);
    }
  }
}

async function handleTravelAssignmentSocketRequest(data) {
  if (!isPrimaryActiveGm()) return;

  const activityKind = getActivityKind(data?.activityKind);
  const activityKey = data?.activityKey;
  const actorUuid = data?.actorUuid;
  const groupActorUuid = data?.groupActorUuid;
  const requestingUser = getGameUserById(data?.userId);

  if (!requestingUser || !activityKey || !actorUuid || !groupActorUuid) return;
  if (!getActivitiesForKind(activityKind).some(activity => activity.key === activityKey)) return;

  const groupActor = await resolveActorFromUuid(groupActorUuid);
  const memberActor = await resolveActorFromUuid(actorUuid);

  if (!isGroupActor(groupActor) || !memberActor) return;
  if (!canUserControlActor(memberActor, requestingUser)) return;

  const groupData = getGroupData(groupActor);
  if (!groupData.members.includes(actorUuid)) return;

  setActivityMember(groupData, activityKind, activityKey, actorUuid, Boolean(data.assigned));
  await groupActor.setFlag(MODULE_ID, "group", groupData);
}

async function handleTravelPlayerRollSocketRequest(data) {
  if (!isPrimaryActiveGm()) return;

  const requestingUser = getGameUserById(data?.userId);
  const groupActor = await resolveActorFromUuid(data?.groupActorUuid);

  if (!requestingUser || !isGroupActor(groupActor)) return;
  await applyTravelPlayerRollResult(groupActor, data, requestingUser);
}

function registerGroupSheetSocket() {
  game.socket?.on(`module.${MODULE_ID}`, data => {
    if (data?.feature !== GROUP_SHEET_SOCKET_FEATURE) return;

    if (data.action === GROUP_SHEET_SOCKET_ASSIGN_TRAVEL) {
      handleTravelAssignmentSocketRequest(data).catch(error => {
        console.error(`${MODULE_ID} | GroupSheet | Travel assignment socket error`, error);
      });
    }

    if (data.action === GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL) {
      handleTravelPlayerRollSocketRequest(data).catch(error => {
        console.error(`${MODULE_ID} | GroupSheet | Travel player roll socket error`, error);
      });
    }

    if (data.action === GROUP_SHEET_SOCKET_PROMPT_TRAVEL) {
      handleTravelPromptTransport(data);
    }

    if (data.action === GROUP_SHEET_SOCKET_UPDATE_TRAVEL) {
      handleTravelPromptTransport({
        action: data.action,
        payload: data,
      });
    }
  });
}

function handleTravelPromptChatMessage(message) {
  try {
    handleTravelRollChatMessage(message);

    const data = message?.getFlag?.(MODULE_ID, GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT);
    if (!data?.action) return;

    if (message.id) {
      if (travelPromptChatMessagesSeen.has(message.id)) return;
      travelPromptChatMessagesSeen.add(message.id);
    }

    handleTravelPromptTransport(data);
  } catch (error) {
    console.error(`${MODULE_ID} | GroupSheet | Travel prompt chat flag error`, error);
  }
}

let groupSheetRegistered = false;


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

function registerGroupSheet() {
  if (groupSheetRegistered) return;
  groupSheetRegistered = true;
  registerGroupSheetSocket();

  Actors.registerSheet(MODULE_ID, SDXGroupSheet, {
    types: ["Player"],
    makeDefault: false,
    label: "MK-Shadowdark: Group Sheet",
  });

  // Do not register the sheet under LEGACY_MODULE_ID.
  // The ready migration below moves old sheetClass values from
  // shadowdark-extras.SDXGroupSheet to mk-shadowdark.SDXGroupSheet.
  // Keeping both registrations can confuse libWrapper-based modules such as Item Piles.

  patchActorCreateDialog();
  Hooks.on("updateActor", rerenderOpenGroupSheets);
  Hooks.on("createChatMessage", handleTravelPromptChatMessage);

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

export { registerGroupSheet };
