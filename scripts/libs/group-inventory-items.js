import { calculateItemSlots } from "./inventory-slots.js";

function getGroupItemQuantity(item) {
  const value = Number(item?.system?.quantity ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function getGroupItemStackLimit(item) {
  const value = Number(item?.system?.slots?.per_slot ?? 1);
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function getGroupItemSelection(item, selection = {}, { allowWholeStack = false } = {}) {
  const sourceQuantity = getGroupItemQuantity(item);
  if (allowWholeStack && selection.quantity === undefined && selection.sourceQuantity === undefined) {
    return { quantity: sourceQuantity, sourceQuantity, remaining: 0 };
  }
  const quantity = Number(selection.quantity);
  const expected = Number(selection.sourceQuantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > getGroupItemStackLimit(item)
    || !Number.isSafeInteger(expected) || expected !== sourceQuantity || quantity > sourceQuantity) return null;
  return { quantity, sourceQuantity, remaining: sourceQuantity - quantity };
}

function buildInventoryItemData(item) {
  const system = item.system ?? {};
  return {
    id: item.id, uuid: item.uuid, name: item.name, img: item.img || "icons/svg/item-bag.svg", type: item.type,
    quantity: Number(system.quantity ?? 1) || 1,
    treasure: !!system.treasure, stashed: !!system.stashed, lost: !!system.lost,
    slots: calculateItemSlots(item),
  };
}

function buildInventoryItemCards(item) {
  const base = buildInventoryItemData(item);
  const sourceQuantity = getGroupItemQuantity(item);
  const stackLimit = getGroupItemStackLimit(item);
  const cards = [];
  let previousSlots = 0;
  for (let offset = 0; offset < sourceQuantity; offset += stackLimit) {
    const quantity = Math.min(stackLimit, sourceQuantity - offset);
    // Preserve inherited data-model getters and allocate free carry only once across the cards.
    const cumulativeSlots = calculateItemSlots(item, offset + quantity);
    cards.push({ ...base, quantity, sourceQuantity, stackLimit, stackable: stackLimit > 1, slots: cumulativeSlots - previousSlots });
    previousSlots = cumulativeSlots;
  }
  return cards;
}

export { buildInventoryItemData, buildInventoryItemCards, getGroupItemQuantity, getGroupItemStackLimit, getGroupItemSelection };
