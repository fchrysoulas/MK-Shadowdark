import { getGroupItemQuantity } from "./group-inventory-items.js";

let pending = Promise.resolve();

// Serialize local deposits and withdrawals so repeat drops recheck the current source inventory.
function queueStoredInventoryMutation(operation) {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

// Call inside the storage queue, after checking permissions, capacity, and the selected card.
async function moveStoredInventoryItem(target, item, selection, { canCommit = () => true } = {}) {
  const source = item.parent?.documentName === "Actor" ? item.parent : null;
  const data = item.toObject();
  if (!data || typeof data !== "object" || !data.type) return null;
  delete data._id;
  delete data.id;
  data.folder = null;
  data.system ??= {};
  data.system.quantity = selection.quantity;
  let created;
  let sourceCommitStarted = false;
  const sourceWasConsumed = () => selection.remaining === 0
    ? !source.items?.get?.(item.id)
    : source.items?.get?.(item.id) === item && getGroupItemQuantity(item) === selection.remaining;
  try {
    [created] = await target.createEmbeddedDocuments("Item", [data], { renderSheet: false });
    if (!created) return null;
    if (!source) return created;
    if (!canCommit() || source.items?.get?.(item.id) !== item || getGroupItemQuantity(item) !== selection.sourceQuantity) {
      throw new Error("The source inventory changed. Refresh it before trying again.");
    }
    sourceCommitStarted = true;
    if (selection.remaining > 0) await item.update({ "system.quantity": selection.remaining });
    else await source.deleteEmbeddedDocuments("Item", [item.id]);
    if (!sourceWasConsumed()) throw new Error("The source Item could not be removed or its quantity was not updated.");
    return created;
  } catch (error) {
    // A post-update/delete hook can fail after the move has committed successfully.
    if (created?.id && sourceCommitStarted && sourceWasConsumed()) return created;
    if (created?.id) {
      try {
        await target.deleteEmbeddedDocuments("Item", [created.id], { renderSheet: false });
        if (target.items?.get?.(created.id)) throw new Error("The destination copy was not removed.");
      } catch (rollbackError) {
        console.error("mk-shadowdark | Stored item transfer rollback failed", rollbackError);
        throw new Error("Check both inventories: the item transfer could not be rolled back.", { cause: error });
      }
    }
    throw error;
  }
}

export { moveStoredInventoryItem, queueStoredInventoryMutation };
