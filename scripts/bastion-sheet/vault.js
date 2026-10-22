import { BASTION_VAULT_CAPACITY } from "./constants.js";
import { buildInventoryData } from "../libs/inventory-slots.js";

function buildVaultData(items, capacity = BASTION_VAULT_CAPACITY) {
  const number = Number(capacity);
  return buildInventoryData(items, Math.max(1, Number.isFinite(number) ? number : BASTION_VAULT_CAPACITY));
}

export { buildVaultData };
export {
  getInventoryItemSlots as getVaultItemSlots,
  getInventoryItemView as getVaultItemView,
} from "../libs/inventory-slots.js";
