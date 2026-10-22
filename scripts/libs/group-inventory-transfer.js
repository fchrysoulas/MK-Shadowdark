import { isGroupActor } from "../group-sheet/actors.js";
import { getSettingValue } from "../group-sheet/group-settings.js";
import { getGameUserById, getPrimaryActiveGm, isPrimaryActiveGm } from "../group-sheet/users.js";
import { getGroupItemQuantity, getGroupItemSelection } from "./group-inventory-items.js";
import { queueStoredInventoryMutation } from "./stored-inventory-queue.js";

const MODULE_ID = "mk-shadowdark";
const TRANSFER_FLAG = "groupInventoryTransfer";
const REQUEST_LIFETIME_MS = 25000;
const pendingTransfers = new Map();
const handledRequests = new Set();

function isGroupInventoryTransferData(data) {
  return Boolean(data?.[MODULE_ID]?.[TRANSFER_FLAG]);
}

function canUseActor(actor, user, permission) {
  if (!actor || !user || actor.inCompendium || actor.pack) return false;
  return user.isGM || actor.testUserPermission?.(user, permission) === true;
}

function queueTransfer(callback) {
  return queueStoredInventoryMutation(callback);
}

async function moveSharedItem(transfer, user, expiresAt = Infinity) {
  if (!isPrimaryActiveGm() || getSettingValue("enableGroupActors", true) === false) return null;
  if (![transfer.sourceActorUuid, transfer.sourceItemId, transfer.targetActorUuid]
    .every(value => typeof value === "string" && value.trim())) return null;
  const source = await globalThis.fromUuid?.(transfer.sourceActorUuid);
  const target = await globalThis.fromUuid?.(transfer.targetActorUuid);
  if (!isGroupActor(source) || !canUseActor(source, user, "OBSERVER")
    || target?.type !== "Player" || isGroupActor(target) || !canUseActor(target, user, "OWNER")) return null;
  const item = source.items?.get?.(transfer.sourceItemId);
  if (!item || item.parent?.uuid !== source.uuid || typeof item.toObject !== "function") return null;
  // Resolve and read the source inside the GM queue, so two players cannot take the same stack.
  if (!isPrimaryActiveGm() || Date.now() >= expiresAt) return null;
  const itemData = item.toObject();
  const selection = getGroupItemSelection(itemData, transfer, { allowWholeStack: true });
  if (!selection) return null;
  itemData.system ??= {};
  itemData.system.quantity = selection.quantity;
  delete itemData._id;
  delete itemData.id;
  itemData.folder = null;
  itemData.sort = 0;

  let created;
  let sourceCommitStarted = false;
  const sourceWasConsumed = () => selection.remaining === 0
    ? !source.items.has(item.id)
    : source.items.has(item.id) && getGroupItemQuantity(item.toObject()) === selection.remaining;
  try {
    [created] = await target.createEmbeddedDocuments("Item", [itemData], { renderSheet: false });
    if (!created) return null;
    if (!isPrimaryActiveGm()) throw new Error("The authoritative GM changed during the transfer.");
    if (source.items.get(item.id) !== item || getGroupItemQuantity(item.toObject()) !== selection.sourceQuantity) {
      throw new Error("The shared inventory changed. Refresh it before trying again.");
    }
    sourceCommitStarted = true;
    if (selection.remaining > 0) await item.update({ "system.quantity": selection.remaining });
    else await source.deleteEmbeddedDocuments("Item", [item.id]);
    if (!sourceWasConsumed()) throw new Error("The shared Item was not removed or its quantity was not updated.");
    return created;
  } catch (error) {
    // Post-update/delete hooks can throw after committing the source change; retain its destination.
    if (created?.id && sourceCommitStarted && sourceWasConsumed()) return created;
    if (created?.id) {
      try {
        await target.deleteEmbeddedDocuments("Item", [created.id], { renderSheet: false });
        if (target.items.has(created.id)) throw new Error("The destination copy was not removed.");
      } catch (rollbackError) {
        console.error(`${MODULE_ID} | Group inventory transfer rollback failed`, rollbackError);
        throw new Error("Check both inventories: the shared item transfer could not be rolled back.", { cause: error });
      }
    }
    throw error;
  }
}

function transferMessageData(message) {
  return message?.getFlag?.(MODULE_ID, TRANSFER_FLAG) ?? message?.flags?.[MODULE_ID]?.[TRANSFER_FLAG];
}

async function handleGroupInventoryTransferRequest(message) {
  const data = transferMessageData(message);
  if (!isPrimaryActiveGm() || !message?.id || data?.status !== "pending"
    || !data.requestId || handledRequests.has(message.id)) return;
  handledRequests.add(message.id);
  const request = { ...data };
  return queueTransfer(async () => {
    if (!isPrimaryActiveGm() || request.authorityId !== game.user.id) return;
    const user = getGameUserById(message.author?.id);
    const expiresAt = Number(message.timestamp) + REQUEST_LIFETIME_MS;
    let created = null;
    let errorMessage = "The shared item could not be moved. It may have already been taken.";
    try {
      if (user?.active && Number.isFinite(expiresAt) && Date.now() < expiresAt) {
        created = await moveSharedItem(request, user, expiresAt);
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Group inventory transfer failed`, error);
      errorMessage = error.message;
    }
    await message.update({
      content: created ? "<p>Shared gear moved to the character inventory.</p>"
        : "<p>The shared gear transfer failed. Check the inventories before trying again.</p>",
      [`flags.${MODULE_ID}.${TRANSFER_FLAG}`]: {
        ...request, status: created ? "moved" : "failed", itemUuid: created?.uuid ?? null,
        error: created ? null : errorMessage, authorityId: game.user.id,
      },
    });
  });
}

function receiveGroupInventoryTransfer(message, _changes, _options, userId) {
  const data = transferMessageData(message);
  const pending = pendingTransfers.get(data?.requestId);
  if (!pending || userId !== pending.authorityId || !getGameUserById(userId)?.isGM
    || data.authorityId !== pending.authorityId || message.author?.id !== game.user?.id
    || data.sourceActorUuid !== pending.transfer.sourceActorUuid
    || data.sourceItemId !== pending.transfer.sourceItemId
    || data.targetActorUuid !== pending.transfer.targetActorUuid
    || data.quantity !== pending.transfer.quantity
    || data.sourceQuantity !== pending.transfer.sourceQuantity
    || !["moved", "failed"].includes(data.status)) return;
  clearTimeout(pending.timer);
  pendingTransfers.delete(data.requestId);
  if (data.status === "moved") pending.resolve(data.itemUuid);
  else pending.reject(new Error(data.error || "The shared item could not be moved."));
}

async function transferGroupInventoryItemToActor(actor, data) {
  if (!isGroupInventoryTransferData(data) || getSettingValue("enableGroupActors", true) === false) return null;
  const transfer = data[MODULE_ID][TRANSFER_FLAG];
  if (!transfer.sourceActorUuid || !transfer.sourceItemId || !actor?.uuid) return null;
  if (actor.uuid === transfer.sourceActorUuid) return null;
  if (actor.type !== "Player" || isGroupActor(actor) || !canUseActor(actor, game.user, "OWNER")) {
    globalThis.ui?.notifications?.warn?.("Move shared gear onto a character sheet you own.");
    return null;
  }
  const request = {
    sourceActorUuid: transfer.sourceActorUuid, sourceItemId: transfer.sourceItemId, targetActorUuid: actor.uuid,
    ...(transfer.quantity !== undefined || transfer.sourceQuantity !== undefined
      ? { quantity: transfer.quantity, sourceQuantity: transfer.sourceQuantity } : {}),
  };
  if (isPrimaryActiveGm()) return queueTransfer(() => moveSharedItem(request, game.user));
  const authority = getPrimaryActiveGm();
  if (!authority || !globalThis.ChatMessage?.create) {
    globalThis.ui?.notifications?.warn?.("An active GM is required to move shared gear.");
    return null;
  }
  const requestId = globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.();
  if (!requestId) return null;
  const itemUuid = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTransfers.delete(requestId);
      reject(new Error("The transfer could not be confirmed. Check both inventories before trying again."));
    }, 30000);
    pendingTransfers.set(requestId, { resolve, reject, timer, transfer: request, authorityId: authority.id });
    void ChatMessage.create({
      content: "<p>Moving shared gear to the character inventory...</p>",
      whisper: [...new Set([authority.id, game.user.id])],
      flags: { [MODULE_ID]: { [TRANSFER_FLAG]: { ...request, requestId, status: "pending", authorityId: authority.id } } },
    }).then(message => {
      if (!message) throw new Error("The shared item transfer request could not be saved.");
    }).catch(error => {
      clearTimeout(timer);
      pendingTransfers.delete(requestId);
      reject(error);
    });
  });
  return itemUuid ? globalThis.fromUuid?.(itemUuid) : null;
}

function handleGroupInventoryTransferDrop(actor, _sheet, data) {
  if (!isGroupInventoryTransferData(data)) return undefined;
  void transferGroupInventoryItemToActor(actor, data).catch(error => {
    console.error(`${MODULE_ID} | Could not move shared gear`, error);
    globalThis.ui?.notifications?.error?.(error.message);
  });
  // Foundry's drop hook is synchronous; cancel native copying while the GM performs the move.
  return false;
}

globalThis.Hooks?.on?.("dropActorSheetData", handleGroupInventoryTransferDrop);
globalThis.Hooks?.on?.("createChatMessage", message => {
  void handleGroupInventoryTransferRequest(message).catch(error => {
    console.error(`${MODULE_ID} | Group inventory request failed`, error);
  });
});
globalThis.Hooks?.on?.("updateChatMessage", receiveGroupInventoryTransfer);

export {
  handleGroupInventoryTransferDrop,
  handleGroupInventoryTransferRequest,
  isGroupInventoryTransferData,
  receiveGroupInventoryTransfer,
  transferGroupInventoryItemToActor,
  queueTransfer as queueGroupInventoryMutation,
};
