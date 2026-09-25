import { BASTION_VAULT_CAPACITY } from "./constants.js";

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getVaultItemSlots(item) {
  const system = item?.system ?? {};
  const directSlots = getNumber(system.slotsUsed, NaN);
  if (Number.isFinite(directSlots) && directSlots > 0) return Math.max(1, Math.ceil(directSlots));

  const slots = system.slots;
  if (typeof slots === "number" && Number.isFinite(slots) && slots > 0) {
    return Math.max(1, Math.ceil(slots));
  }

  if (!slots || typeof slots !== "object") return 1;

  const slotsPerItem = getNumber(slots.slots_used, 0);
  const perSlot = Math.max(1, getNumber(slots.per_slot, 1));
  const quantity = Math.max(1, getNumber(system.quantity, 1));
  const freeCarry = Math.max(0, getNumber(slots.free_carry, 0));
  if (slotsPerItem <= 0) return 1;

  const slotGroups = Math.ceil(quantity / perSlot);
  return Math.max(1, Math.ceil(Math.max(0, slotGroups - freeCarry) * slotsPerItem));
}

function getVaultItemView(item) {
  const quantity = Math.max(1, getNumber(item?.system?.quantity, 1));
  const slots = getVaultItemSlots(item);

  return {
    id: String(item?.id ?? ""),
    uuid: String(item?.uuid ?? ""),
    name: String(item?.name ?? "Item"),
    img: item?.img || "icons/svg/item-bag.svg",
    type: String(item?.type ?? "Item"),
    quantity,
    slots,
  };
}

function buildVaultData(items, capacity = BASTION_VAULT_CAPACITY) {
  const itemViews = Array.from(items ?? [])
    .map(getVaultItemView)
    .filter(item => item.id);
  const used = itemViews.reduce((total, item) => total + item.slots, 0);
  const numericCapacity = Math.max(1, getNumber(capacity, BASTION_VAULT_CAPACITY));

  return {
    items: itemViews,
    used,
    capacity: numericCapacity,
    remaining: Math.max(0, numericCapacity - used),
    percent: Math.min(100, Math.round((used / numericCapacity) * 100)),
  };
}

export {
  buildVaultData,
  getVaultItemSlots,
  getVaultItemView,
};
