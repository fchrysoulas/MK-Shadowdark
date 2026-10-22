function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function calculateItemSlots(item, quantityOverride) {
  const system = item.system ?? {};
  if (!system.isPhysical || !system.slots || system.stashed) return 0;

  const perSlot = Number(system.slots.per_slot ?? 1) || 1;
  const quantity = Number(quantityOverride ?? system.quantity ?? 1) || 1;
  const slotsUsed = Number(system.slots.slots_used ?? 0) || 0;
  const freeCarry = Number(system.slots.free_carry ?? 0) || 0;
  return Math.max(0, Math.ceil(quantity / perSlot) * slotsUsed - freeCarry * slotsUsed);
}

// Bastion Vault storage retains its existing minimum-one-slot accounting.
function getInventoryItemSlots(item) {
  const system = item?.system ?? {};
  const directSlots = getNumber(system.slotsUsed, NaN);
  if (directSlots > 0) return Math.max(1, Math.ceil(directSlots));
  const slots = system.slots;
  if (typeof slots === "number" && slots > 0 && Number.isFinite(slots)) return Math.max(1, Math.ceil(slots));
  if (!slots || typeof slots !== "object") return 1;
  const slotsPerItem = getNumber(slots.slots_used, 0);
  if (slotsPerItem <= 0) return 1;
  const perSlot = Math.max(1, getNumber(slots.per_slot, 1));
  const quantity = Math.max(1, getNumber(system.quantity, 1));
  const freeCarry = Math.max(0, getNumber(slots.free_carry, 0));
  return Math.max(1, Math.ceil(Math.max(0, Math.ceil(quantity / perSlot) - freeCarry) * slotsPerItem));
}

function buildInventoryItemView(item, slotCalculator) {
  return {
    id: String(item?.id ?? ""), uuid: String(item?.uuid ?? ""),
    name: String(item?.name ?? "Item"), img: item?.img || "icons/svg/item-bag.svg",
    type: String(item?.type ?? "Item"),
    quantity: Math.max(1, getNumber(item?.system?.quantity, 1)), slots: slotCalculator(item),
  };
}

function getInventoryItemView(item) {
  return buildInventoryItemView(item, getInventoryItemSlots);
}

function buildInventoryData(items, capacity, slotCalculator = getInventoryItemSlots) {
  const itemViews = Array.from(items ?? []).map(item => buildInventoryItemView(item, slotCalculator)).filter(item => item.id);
  const used = itemViews.reduce((total, item) => total + item.slots, 0);
  const numericCapacity = Math.max(0, getNumber(capacity));
  return {
    items: itemViews, used, capacity: numericCapacity,
    remaining: Math.max(0, numericCapacity - used), overCapacity: used > numericCapacity,
    percent: numericCapacity > 0 ? Math.min(100, Math.round(used / numericCapacity * 100)) : 0,
  };
}

function buildGearInventoryData(items, capacity) {
  return buildInventoryData(items, capacity, calculateItemSlots);
}

export { buildGearInventoryData, buildInventoryData, calculateItemSlots, getInventoryItemSlots, getInventoryItemView };
