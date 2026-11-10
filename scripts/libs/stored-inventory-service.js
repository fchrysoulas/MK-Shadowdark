import { getGameUserById, getPrimaryActiveGm, isPrimaryActiveGm } from "../group-sheet/users.js";
import { BASTION_ACTOR_TYPE, BASTION_VAULT_CAPACITY } from "../bastion-sheet/constants.js";
import { BOAT_ACTOR_TYPE } from "../boat-sheet/constants.js";
import { getGroupItemQuantity, getGroupItemSelection } from "./group-inventory-items.js";
import { buildGearInventoryData, buildInventoryData, calculateItemSlots, getInventoryItemSlots } from "./inventory-slots.js";
import { moveStoredInventoryItem, queueStoredInventoryMutation } from "./stored-inventory-queue.js";

const MODULE_ID = "mk-shadowdark";
const FLAG = "storedInventoryTransfer";
const pending = new Map();
const handled = new Set();
const REQUEST_LIFETIME_MS = 25000;

function isGroup(actor) { return actor?.getFlag?.(MODULE_ID, "isGroup") === true; }
function isStorage(actor) { return [BASTION_ACTOR_TYPE, BOAT_ACTOR_TYPE].includes(actor?.type) || isGroup(actor); }
function owns(actor, user) {
  return Boolean(actor && user && !actor.pack && !actor.inCompendium
    && (user.isGM || actor.testUserPermission?.(user, globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3) === true));
}

function selectedQuantity(item, request) {
  const current = getGroupItemQuantity(item);
  if (request.sourceQuantity !== current) return null;
  if (request.wholeStack === true && request.quantity === current) {
    return getGroupItemSelection(item, {}, { allowWholeStack: true });
  }
  return getGroupItemSelection(item, request);
}

function canReceive(target, item, selection) {
  const incoming = item.toObject();
  incoming.system ??= {};
  incoming.system.quantity = selection.quantity;
  if (target.type === BASTION_ACTOR_TYPE) {
    if (!target.getFlag?.(MODULE_ID, "bastion")?.upgrades?.includes("vault")) return false;
    const vault = buildInventoryData(target.items, BASTION_VAULT_CAPACITY);
    return vault.used + getInventoryItemSlots(incoming) <= vault.capacity;
  }
  if (target.type === BOAT_ACTOR_TYPE) {
    const cargo = buildGearInventoryData(target.items, target.system?.cargoCapacity);
    // Use the live model's physical-item getters when counting the incoming card.
    const used = calculateItemSlots(item, selection.quantity);
    return cargo.used + used <= cargo.capacity;
  }
  return true;
}

async function executeRequest(request, user, expiresAt = Infinity) {
  if (!isPrimaryActiveGm() || !user?.active || Date.now() >= expiresAt) return null;
  const item = await globalThis.fromUuid?.(request.sourceItemUuid);
  if (!item?.type || typeof item.toObject !== "function") return null;
  const source = item.parent?.documentName === "Actor" ? item.parent : null;
  if (source && (!owns(source, user) || source.items?.get?.(item.id) !== item)) return null;
  const selection = selectedQuantity(item, request);
  if (!selection) return null;
  if (request.action === "discard") {
    if (!isStorage(source) || (isGroup(source) && !user.isGM)) return null;
    if (!isPrimaryActiveGm() || Date.now() >= expiresAt) return null;
    if (selection.remaining > 0) await item.update({ "system.quantity": selection.remaining });
    else await source.deleteEmbeddedDocuments("Item", [item.id]);
    return true;
  }
  if (request.action !== "move") return null;
  const target = await globalThis.fromUuid?.(request.targetActorUuid);
  if (target?.documentName !== "Actor" || !owns(target, user)
    || source?.uuid === target.uuid || (!isStorage(source) && !isStorage(target))) return null;
  if (isGroup(target) && !user.isGM) return null;
  if (!source && item.testUserPermission?.(user, "OBSERVER") === false) return null;
  if (!canReceive(target, item, selection) || !isPrimaryActiveGm() || Date.now() >= expiresAt) return null;
  return moveStoredInventoryItem(target, item, selection, {
    canCommit: () => isPrimaryActiveGm() && owns(target, user) && owns(source, user),
  });
}

function messageRequest(message) {
  return message?.getFlag?.(MODULE_ID, FLAG) ?? message?.flags?.[MODULE_ID]?.[FLAG];
}

async function handleStoredInventoryRequest(message) {
  const data = messageRequest(message);
  if (!isPrimaryActiveGm() || !message?.id || data?.status !== "pending"
    || !data.requestId || handled.has(message.id)) return;
  handled.add(message.id);
  const request = structuredClone(data);
  return queueStoredInventoryMutation(async () => {
    if (!isPrimaryActiveGm() || request.authorityId !== game.user.id) return;
    const user = getGameUserById(message.author?.id);
    const expiresAt = Number(message.timestamp) + REQUEST_LIFETIME_MS;
    let result = null;
    let error = null;
    try {
      if (Number.isFinite(expiresAt)) result = await executeRequest(request, user, expiresAt);
    } catch (cause) {
      console.error(`${MODULE_ID} | Stored inventory transfer failed`, cause);
      error = cause.message;
    }
    await message.update({
      content: result ? "<p>Stored inventory updated.</p>" : "<p>Stored inventory could not be updated. Refresh it before trying again.</p>",
      [`flags.${MODULE_ID}.${FLAG}`]: {
        ...request, status: error ? "failed" : result ? "complete" : "rejected",
        itemUuid: result?.uuid ?? null, error,
      },
    });
  });
}

function receiveStoredInventoryResult(message, _changes, _options, userId) {
  const data = messageRequest(message);
  const entry = pending.get(data?.requestId);
  if (!entry || userId !== entry.request.authorityId || !getGameUserById(userId)?.isGM
    || message.author?.id !== game.user?.id || !["complete", "rejected", "failed"].includes(data.status)
    || Object.entries(entry.request).some(([key, value]) => data[key] !== value)) return;
  clearTimeout(entry.timer);
  pending.delete(data.requestId);
  if (data.status === "failed") entry.reject(new Error(data.error || "The stored item could not be moved."));
  else entry.resolve(data.status === "complete" ? data.itemUuid ?? true : null);
}

async function dispatch(request) {
  if (isPrimaryActiveGm()) return queueStoredInventoryMutation(() => executeRequest(request, game.user));
  const authority = getPrimaryActiveGm();
  if (!authority || !globalThis.ChatMessage?.create) {
    globalThis.ui?.notifications?.warn?.("An active GM is required to move or discard stored gear.");
    return null;
  }
  request = { ...request, authorityId: authority.id, requestId: globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.() };
  if (!request.requestId) return null;
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request.requestId);
      reject(new Error("The inventory update could not be confirmed. Check both inventories before trying again."));
    }, 30000);
    pending.set(request.requestId, { request, resolve, reject, timer });
    void ChatMessage.create({
      content: "<p>Updating stored inventory...</p>", whisper: [...new Set([authority.id, game.user.id])],
      flags: { [MODULE_ID]: { [FLAG]: { ...request, status: "pending" } } },
    }).then(message => {
      if (!message) throw new Error("The inventory request could not be saved.");
    }).catch(error => {
      clearTimeout(timer);
      pending.delete(request.requestId);
      reject(error);
    });
  });
  return typeof result === "string" ? globalThis.fromUuid?.(result) : result;
}

function transferStoredInventoryItem(target, item, selection, { wholeStack = false } = {}) {
  return dispatch({ action: "move", sourceItemUuid: item.uuid, targetActorUuid: target.uuid,
    quantity: selection.quantity, sourceQuantity: selection.sourceQuantity, wholeStack });
}

function discardStoredInventoryItem(item, selection, { wholeStack = false } = {}) {
  return dispatch({ action: "discard", sourceItemUuid: item.uuid,
    quantity: selection.quantity, sourceQuantity: selection.sourceQuantity, wholeStack });
}

globalThis.Hooks?.on?.("createChatMessage", message => {
  void handleStoredInventoryRequest(message).catch(error => console.error(`${MODULE_ID} | Stored inventory request failed`, error));
});
globalThis.Hooks?.on?.("updateChatMessage", receiveStoredInventoryResult);

export { transferStoredInventoryItem, discardStoredInventoryItem, handleStoredInventoryRequest, receiveStoredInventoryResult };
