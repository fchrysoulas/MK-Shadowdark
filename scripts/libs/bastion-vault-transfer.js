import { moveStoredInventoryItem, queueStoredInventoryMutation } from "./stored-inventory-queue.js";
import { getGroupItemSelection } from "./group-inventory-items.js";

const MODULE_ID = "mk-shadowdark";
const BASTION_ACTOR_TYPE = `${MODULE_ID}.bastion`;
const BOAT_ACTOR_TYPE = `${MODULE_ID}.boat`;

function canManageActorItems(actor) {
  const user = globalThis.game?.user;
  if (!actor || !user) return false;
  if (user.isGM) return true;
  if (typeof actor.testUserPermission === "function") {
    return actor.testUserPermission(user, globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3) === true;
  }
  return actor.isOwner === true;
}

function vaultPermissionMessage(key) {
  const fallback = {
    ownerOnly: "Only a GM or owner of this Bastion can manage Vault items.",
    transferOwnership: "You must own both the Bastion and the receiving actor to move Vault items.",
    sourceOwnership: "You must own the source actor to move its items into the Vault."
  };
  return globalThis.game?.i18n?.localize?.(`MK_SHADOWDARK.bastionVault.${key}`) ?? fallback[key];
}

function getVaultTransferData(data) {
  const transfer = data?.[MODULE_ID]?.vaultTransfer ?? data?.[MODULE_ID]?.cargoTransfer;
  if (!transfer || typeof transfer !== "object") return null;

  const sourceActorUuid = String(transfer.sourceActorUuid ?? "").trim();
  const sourceItemUuid = String(transfer.sourceItemUuid ?? "").trim();
  const sourceItemId = String(transfer.sourceItemId ?? "").trim();
  if (!sourceActorUuid || (!sourceItemUuid && !sourceItemId)) return null;

  return {
    sourceActorUuid, sourceItemUuid, sourceItemId,
    ...(data?.[MODULE_ID]?.cargoTransfer ? { quantity: transfer.quantity, sourceQuantity: transfer.sourceQuantity } : {}),
  };
}

function isVaultTransferData(data) {
  return Boolean(getVaultTransferData(data));
}

async function resolveVaultSource(data) {
  const transfer = getVaultTransferData(data);
  if (!transfer || typeof globalThis.fromUuid !== "function") return null;

  let sourceActor;
  try {
    sourceActor = await globalThis.fromUuid(transfer.sourceActorUuid);
  } catch (_error) {
    return null;
  }
  const expectedType = data?.[MODULE_ID]?.vaultTransfer ? BASTION_ACTOR_TYPE : BOAT_ACTOR_TYPE;
  if (sourceActor?.type !== expectedType) return null;

  let sourceItem = null;
  if (transfer.sourceItemUuid) {
    try {
      sourceItem = await globalThis.fromUuid(transfer.sourceItemUuid);
    } catch (_error) {
      // Use the embedded-item fallback below.
    }
  }
  sourceItem ??= sourceActor.items?.get?.(transfer.sourceItemId)
    ?? Array.from(sourceActor.items ?? []).find(item => item.id === transfer.sourceItemId);

  if (!sourceItem || sourceItem.parent?.uuid !== sourceActor.uuid
    || !sourceActor.items?.get?.(sourceItem.id)) return null;
  return { sourceActor, sourceItem };
}

function transferVaultItemToActor(actor, data, options = {}) {
  return queueStoredInventoryMutation(() => moveStoredItemToActor(actor, data, options));
}

async function moveStoredItemToActor(actor, data, { allowStorage = false, canReceive } = {}) {
  if (!actor || (!allowStorage && [BASTION_ACTOR_TYPE, BOAT_ACTOR_TYPE].includes(actor.type)) || !isVaultTransferData(data)) return null;
  if (!actor.createEmbeddedDocuments || !canManageActorItems(actor)) return null;

  const source = await resolveVaultSource(data);
  if (!source || source.sourceActor.uuid === actor.uuid) return null;
  if (!canManageActorItems(source.sourceActor)) {
    globalThis.ui?.notifications?.warn?.(data?.[MODULE_ID]?.cargoTransfer
      ? globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.boat.transferOwnership")
      : vaultPermissionMessage("transferOwnership"));
    return null;
  }

  const selection = data?.[MODULE_ID]?.cargoTransfer
    ? getGroupItemSelection(source.sourceItem, getVaultTransferData(data))
    : getGroupItemSelection(source.sourceItem, {}, { allowWholeStack: true });
  if (!selection) {
    if (data?.[MODULE_ID]?.cargoTransfer) globalThis.ui?.notifications?.warn?.(
      globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.boat.cargoChanged")
    );
    return null;
  }
  if (typeof source.sourceItem.toObject !== "function" || (canReceive && !canReceive(source.sourceItem, selection))) return null;
  return moveStoredInventoryItem(actor, source.sourceItem, selection, {
    canCommit: () => canManageActorItems(actor) && canManageActorItems(source.sourceActor),
  });
}

function handleVaultTransferDrop(actor, _sheet, data) {
  if (!isVaultTransferData(data)) return undefined;

  if ([BASTION_ACTOR_TYPE, BOAT_ACTOR_TYPE].includes(actor?.type)) return undefined;
  if (!canManageActorItems(actor)) {
    globalThis.ui?.notifications?.warn?.(vaultPermissionMessage("transferOwnership"));
    return false;
  }

  void transferVaultItemToActor(actor, data).catch(error => {
    console.error(`${MODULE_ID} | Could not move item out of bastion vault`, error);
    globalThis.ui?.notifications?.error?.("The Item could not be moved out of the Vault.");
  });
  return false;
}

export {
  canManageActorItems,
  getVaultTransferData,
  handleVaultTransferDrop,
  isVaultTransferData,
  resolveVaultSource,
  transferVaultItemToActor,
  vaultPermissionMessage,
};
