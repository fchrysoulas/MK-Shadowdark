const MODULE_ID = "mk-shadowdark";
const BASTION_ACTOR_TYPE = `${MODULE_ID}.bastion`;

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
  const transfer = data?.[MODULE_ID]?.vaultTransfer;
  if (!transfer || typeof transfer !== "object") return null;

  const sourceActorUuid = String(transfer.sourceActorUuid ?? "").trim();
  const sourceItemUuid = String(transfer.sourceItemUuid ?? "").trim();
  const sourceItemId = String(transfer.sourceItemId ?? "").trim();
  if (!sourceActorUuid || (!sourceItemUuid && !sourceItemId)) return null;

  return { sourceActorUuid, sourceItemUuid, sourceItemId };
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
  if (sourceActor?.type !== BASTION_ACTOR_TYPE) return null;

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

  if (!sourceItem || sourceItem.parent?.uuid !== sourceActor.uuid) return null;
  return { sourceActor, sourceItem };
}

async function transferVaultItemToActor(actor, data) {
  if (!actor || actor.type === BASTION_ACTOR_TYPE || !isVaultTransferData(data)) return null;
  if (!actor.createEmbeddedDocuments || !canManageActorItems(actor)) return null;

  const source = await resolveVaultSource(data);
  if (!source || source.sourceActor.uuid === actor.uuid) return null;
  if (!canManageActorItems(source.sourceActor)) {
    globalThis.ui?.notifications?.warn?.(vaultPermissionMessage("transferOwnership"));
    return null;
  }

  const itemData = typeof source.sourceItem.toObject === "function"
    ? source.sourceItem.toObject()
    : (globalThis.foundry?.utils?.deepClone
      ? foundry.utils.deepClone(source.sourceItem)
      : JSON.parse(JSON.stringify(source.sourceItem)));
  if (!itemData || typeof itemData !== "object" || !itemData.type) return null;

  delete itemData._id;
  delete itemData.id;

  let createdItem;
  try {
    [createdItem] = await actor.createEmbeddedDocuments("Item", [itemData], { renderSheet: false });
    if (!createdItem) return null;
    await source.sourceActor.deleteEmbeddedDocuments("Item", [source.sourceItem.id]);
    return createdItem;
  } catch (error) {
    if (createdItem?.id && actor.deleteEmbeddedDocuments) {
      try {
        await actor.deleteEmbeddedDocuments("Item", [createdItem.id], { renderSheet: false });
      } catch (_rollbackError) {
        // Preserve the original error while avoiding a second user-facing failure.
      }
    }
    throw error;
  }
}

function handleVaultTransferDrop(actor, _sheet, data) {
  if (!isVaultTransferData(data)) return undefined;

  if (actor?.type === BASTION_ACTOR_TYPE) return undefined;
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
