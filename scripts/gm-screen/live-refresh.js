import { getGroupData } from "../group-sheet/activities.js";
import { CHAT_FLAG, MODULE_ID } from "../encounter-engine/constants.js";
import {
  getGmScreen,
  refreshGmScreen,
} from "./gm-screen.js";
import { resolveGmScreenGroup } from "./view-model.js";

const LIVE_REFRESH_DELAY_MS = 40;
let refreshTimer = null;

function documentActor(document) {
  if (!document) return null;

  const parent = document.parent ?? null;
  if (parent?.documentName === "Actor") return parent;
  if (document.actor?.documentName === "Actor") return document.actor;
  if (parent?.actor?.documentName === "Actor") return parent.actor;

  return null;
}

function activeMemberUuidSet(groupActor) {
  if (!groupActor) return new Set();
  const group = getGroupData(groupActor);
  return new Set((group.activeMembers ?? []).map(String).filter(Boolean));
}

function encounterMessageData(message) {
  if (!message) return null;

  try {
    const value = message.getFlag?.(MODULE_ID, CHAT_FLAG);
    if (value) return value;
  } catch (_error) {
    // Fall through to raw flag data for deleted/partial documents and tests.
  }

  return message.flags?.[MODULE_ID]?.[CHAT_FLAG]
    ?? message._source?.flags?.[MODULE_ID]?.[CHAT_FLAG]
    ?? null;
}

function encounterMessageBelongsToGroup(message, groupActor) {
  if (!groupActor) return false;
  const data = encounterMessageData(message);
  return String(data?.groupContext?.groupActorUuid ?? "") === String(groupActor.uuid ?? "");
}

function scheduleGmScreenRefresh() {
  const app = getGmScreen();
  if (!app?.rendered) return false;

  if (refreshTimer) globalThis.clearTimeout?.(refreshTimer);
  refreshTimer = globalThis.setTimeout?.(() => {
    refreshTimer = null;
    refreshGmScreen();
  }, LIVE_REFRESH_DELAY_MS) ?? null;

  if (!refreshTimer) {
    refreshGmScreen();
  }

  return true;
}

async function selectedGroupActor() {
  const app = getGmScreen();
  if (!app?.rendered) return null;
  return resolveGmScreenGroup(app.groupActorUuid ?? "");
}

async function refreshForOwnedDocument(document) {
  const actor = documentActor(document);
  if (!actor) return false;

  const group = await selectedGroupActor();
  if (!group) return false;

  const activeMembers = activeMemberUuidSet(group);
  if (!activeMembers.has(String(actor.uuid ?? ""))) return false;

  return scheduleGmScreenRefresh();
}

async function refreshForEncounterMessage(message) {
  const group = await selectedGroupActor();
  if (!group || !encounterMessageBelongsToGroup(message, group)) return false;
  return scheduleGmScreenRefresh();
}

function registerGmScreenLiveRefresh() {
  const ownedDocumentHooks = [
    "createItem",
    "updateItem",
    "deleteItem",
    "createActiveEffect",
    "updateActiveEffect",
    "deleteActiveEffect",
  ];

  for (const hook of ownedDocumentHooks) {
    globalThis.Hooks?.on?.(hook, document => {
      void refreshForOwnedDocument(document);
    });
  }

  const encounterMessageHooks = [
    "createChatMessage",
    "updateChatMessage",
    "deleteChatMessage",
  ];

  for (const hook of encounterMessageHooks) {
    globalThis.Hooks?.on?.(hook, message => {
      void refreshForEncounterMessage(message);
    });
  }
}

registerGmScreenLiveRefresh();

export {
  LIVE_REFRESH_DELAY_MS,
  documentActor,
  activeMemberUuidSet,
  encounterMessageData,
  encounterMessageBelongsToGroup,
  scheduleGmScreenRefresh,
  refreshForOwnedDocument,
  refreshForEncounterMessage,
  registerGmScreenLiveRefresh,
};
