import {
  ACTIVITY_KINDS,
  GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT,
  GROUP_SHEET_SOCKET_ASSIGN_TRAVEL,
  GROUP_SHEET_SOCKET_FEATURE,
  GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL,
  GROUP_SHEET_SOCKET_PROMPT_TRAVEL,
  GROUP_SHEET_SOCKET_UPDATE_TRAVEL,
  MODULE_ID,
  SHEET_ID,
  SUBMODULE,
} from "./constants.js";
import {
  canUserControlActor,
  ensureGroupActorHpDefaults,
  getGroupInventoryMaxSlots,
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
import { mkGroupLog } from "./utils.js";
import { getGameUserById, isPrimaryActiveGm } from "./users.js";

const GROUP_ACTOR_DIALOG_TYPE = "Group";
const OBSOLETE_ACTOR_DIALOG_TYPES = new Set(["Base", "base"]);
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
  const typeSources = [
    CONFIG.Actor?.typeLabels,
    CONFIG.Actor?.dataModels,
    game.system?.documentTypes?.Actor,
    game.documentTypes?.Actor,
    CONFIG.Actor?.documentClass?.metadata?.types,
    game.system?.model?.Actor,
    game.system?.template?.Actor?.types,
  ];

  const types = [];
  for (const source of typeSources) {
    if (!source) continue;

    if (Array.isArray(source)) {
      types.push(...source);
    } else if (source instanceof Set) {
      types.push(...source);
    } else if (typeof source === "object") {
      types.push(...Object.keys(source));
    }
  }

  types.push("Player", "NPC");

  return [...new Set(types.filter(type => type && !OBSOLETE_ACTOR_DIALOG_TYPES.has(type)))];
}

function getActorTypeLabel(type) {
  if (type === GROUP_ACTOR_DIALOG_TYPE) return "Group";

  const label = CONFIG.Actor?.typeLabels?.[type];
  if (label) return game.i18n.localize(label);

  const typeKey = `TYPES.Actor.${type}`;
  const localized = game.i18n.localize(typeKey);
  return localized === typeKey ? type : localized;
}

function getDefaultActorName(type) {
  if (type === GROUP_ACTOR_DIALOG_TYPE) return "New Group";

  const typeLabel = getActorTypeLabel(type || "Actor") || "Actor";
  const localized = game.i18n.format("DOCUMENT.New", { type: typeLabel });
  return localized && localized !== "DOCUMENT.New"
    ? localized
    : `New ${typeLabel}`;
}

function getActorCreationFormData(html) {
  const root = html?.[0] ?? html;
  const form = root?.querySelector?.("form");
  if (!form) return {};

  const FormDataExtendedClass = typeof FormDataExtended === "function"
    ? FormDataExtended
    : globalThis.FormDataExtended;

  if (FormDataExtendedClass) {
    return new FormDataExtendedClass(form).object;
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

function shouldOfferGroupActorType() {
  return game.user?.isGM &&
    getSettingValue("enableGroupActors", true);
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
  const actorType = formData.type || data.type || "Actor";
  const actorName = String(formData.name ?? "").trim()
    || String(data.name ?? "").trim()
    || getDefaultActorName(actorType);

  if (actorType === GROUP_ACTOR_DIALOG_TYPE) {
    return createGroupActor({
      name: actorName,
      folder: formData.folder || getFolderId(data.folder),
    });
  }

  const createData = foundry.utils.mergeObject(foundry.utils.deepClone(data), formData);
  createData.name = actorName;
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
        console.error(`${MODULE_ID} | ${SUBMODULE} | Travel assignment socket error`, error);
      });
    }

    if (data.action === GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL) {
      handleTravelPlayerRollSocketRequest(data).catch(error => {
        console.error(`${MODULE_ID} | ${SUBMODULE} | Travel player roll socket error`, error);
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
    console.error(`${MODULE_ID} | ${SUBMODULE} | Travel prompt chat flag error`, error);
  }
}

let groupSheetRegistered = false;


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
      console.error(`${MODULE_ID} | ${SUBMODULE} | Failed to set HP defaults for group actor "${actor.name}".`, error);
    }
  }

  if (updated > 0) {
    mkGroupLog(`Set HP defaults on ${updated} group actor(s).`);
  }

  if (failed > 0) {
    ui.notifications.warn(`${MODULE_ID}: ${failed} group actor HP default update(s) failed. Check the console.`);
  }
}

async function onReadyGroupSheetMaintenance() {
  await ensureExistingGroupActorHpDefaults();
}

function registerGroupSheet() {
  if (groupSheetRegistered) return;
  groupSheetRegistered = true;
  registerGroupSheetSocket();

  const ActorsCollection =
    globalThis.foundry?.documents?.collections?.Actors
    // Foundry v12 exposes Actors as a legacy global binding which is not
    // guaranteed to also be a property of globalThis.
    ?? (typeof Actors === "function" ? Actors : globalThis.Actors);

  if (!ActorsCollection?.registerSheet) {
    throw new Error(`${MODULE_ID} | ${SUBMODULE} | Foundry Actor sheet registration API is unavailable.`);
  }

  ActorsCollection.registerSheet(MODULE_ID, SDXGroupSheet, {
    types: ["Player"],
    makeDefault: false,
    label: "MK-Shadowdark: Group Sheet",
  });

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

  mkGroupLog("Registered group sheet.");
}

export { registerGroupSheet };
