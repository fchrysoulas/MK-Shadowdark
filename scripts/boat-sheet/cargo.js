import { buildGearInventoryData, calculateItemSlots } from "../libs/inventory-slots.js";
import { canManageActorItems } from "../libs/bastion-vault-transfer.js";
import { boatLabel } from "./constants.js";
import { moveStoredInventoryItem, queueStoredInventoryMutation } from "../libs/stored-inventory-queue.js";
import { getGroupItemSelection } from "../libs/group-inventory-items.js";

function storeBoatCargo(actor, item, card = null) {
  return queueStoredInventoryMutation(() => moveBoatCargo(actor, item, card));
}

async function moveBoatCargo(actor, item, card) {
  if (!canManageActorItems(actor) || !item?.type || !actor.createEmbeddedDocuments) return false;
  if (item.parent?.uuid === actor.uuid) return false;
  const source = item.parent?.documentName === "Actor" ? item.parent : null;
  if (source && (!canManageActorItems(source) || !source.items?.get?.(item.id))) {
    globalThis.ui?.notifications?.warn?.(boatLabel("sourceOwner"));
    return false;
  }
  const selection = getGroupItemSelection(item, card ?? {}, { allowWholeStack: card === null });
  if (!selection) {
    globalThis.ui?.notifications?.warn?.(boatLabel("cargoChanged"));
    return false;
  }
  const cargo = buildGearInventoryData(actor.items, actor.system?.cargoCapacity);
  if (cargo.used + calculateItemSlots(item, selection.quantity) > cargo.capacity) {
    globalThis.ui?.notifications?.warn?.(boatLabel("cargoFull", { remaining: cargo.remaining }));
    return false;
  }
  return (await moveStoredInventoryItem(actor, item, selection, {
    canCommit: () => canManageActorItems(actor) && canManageActorItems(source),
  })) ?? false;
}

export { storeBoatCargo };
