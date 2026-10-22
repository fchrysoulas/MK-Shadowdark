import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildInventoryItemCards, calculateGroupInventorySlots, calculateItemSlots } from "../scripts/group-sheet/inventory.js";
import { getGroupItemSelection } from "../scripts/libs/group-inventory-items.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; }
}
let confirm;
let context;
globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } },
  applications: {
    api: { DialogV2: { confirm: options => confirm(options) } },
    ux: { ContextMenu: class {
      constructor(root, selector, entries, options) { context = { root, selector, entries, options }; }
    } },
  },
};
globalThis.document = {
  createElement: () => ({
    set textContent(value) {
      this.innerHTML = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    },
  }),
};
const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");

function fixture(quantity = 3, perSlot = 1) {
  const prompts = [];
  const warnings = [];
  const changes = [];
  confirm = options => { prompts.push(options); return true; };
  context = null;
  globalThis.game = {
    user: { isGM: true },
    i18n: {
      localize: key => translations[key] ?? key,
      format: (key, data) => (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => data[name]),
    },
  };
  globalThis.ui = { notifications: { warn: value => warnings.push(value) } };
  const item = {
    id: "gear", uuid: "Actor.party.Item.gear", name: "Rations", img: "rations.webp", type: "Basic",
    system: { quantity, isPhysical: true, slots: { per_slot: perSlot, slots_used: 1, free_carry: 0 } },
    toDragData: () => ({ type: "Item", uuid: "Actor.party.Item.gear" }),
    async update(update) { changes.push(update); this.system.quantity = update["system.quantity"]; },
  };
  const actor = {
    uuid: "Actor.party", items: new Map([[item.id, item]]),
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Item");
      changes.push({ deleted: ids });
      ids.forEach(id => this.items.delete(id));
    },
  };
  const row = (count = Math.min(quantity, perSlot)) => ({
    dataset: { itemId: item.id, itemQuantity: String(count), sourceQuantity: String(quantity) },
  });
  return { item, actor, sheet: new MKGroupSheet(actor), row, changes, prompts, warnings };
}

test("ordinary quantities become individual cards without changing the stored Item", () => {
  const { item } = fixture();
  const original = structuredClone(item.system);
  const cards = buildInventoryItemCards(item);
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(card => [card.id, card.quantity, card.sourceQuantity, card.stackable, card.slots]), [
    ["gear", 1, 3, false, 1], ["gear", 1, 3, false, 1], ["gear", 1, 3, false, 1],
  ]);
  assert.deepEqual(item.system, original);
});

test("ammunition is grouped only up to its per-slot limit and retains a partially filled final card", () => {
  const { item } = fixture(45, 20);
  const cards = buildInventoryItemCards(item);
  assert.deepEqual(cards.map(card => card.quantity), [20, 20, 5]);
  assert.ok(cards.every(card => card.stackable && card.stackLimit === 20 && card.sourceQuantity === 45));
  assert.deepEqual(cards.map(card => card.slots), [1, 1, 1]);
});

test("card slot costs retain Shadowdark's inherited physical-item getter and match the inventory total", () => {
  class PhysicalItemSystem {
    constructor(quantity, perSlot, slotsUsed, freeCarry) {
      this.quantity = quantity;
      this.slots = { per_slot: perSlot, slots_used: slotsUsed, free_carry: freeCarry };
    }
    get isPhysical() { return true; }
  }
  for (const [quantity, perSlot, slotsUsed, freeCarry, expected] of [
    [1, 1, 1, 0, [1]], [3, 1, 2, 0, [2, 2, 2]],
    [45, 20, 1, 0, [1, 1, 1]], [45, 20, 1, 1, [0, 1, 1]],
  ]) {
    const { item } = fixture(quantity, perSlot);
    const system = item.system = new PhysicalItemSystem(quantity, perSlot, slotsUsed, freeCarry);
    assert.equal(Object.hasOwn(system, "isPhysical"), false);
    const cards = buildInventoryItemCards(item);
    assert.deepEqual(cards.map(card => card.slots), expected);
    assert.equal(cards.reduce((sum, card) => sum + card.slots, 0), calculateGroupInventorySlots({ items: [item] }).total);
    assert.equal(item.system, system);
    assert.equal(system.quantity, quantity, "Rendering must not change the stored stack");
  }
});

test("card slot costs preserve free carry, stashed items and nonphysical items", () => {
  const { item } = fixture(45, 20);
  item.system.slots.free_carry = 1;
  assert.deepEqual(buildInventoryItemCards(item).map(card => card.slots), [0, 1, 1]);
  assert.equal(buildInventoryItemCards(item).reduce((sum, card) => sum + card.slots, 0), calculateItemSlots(item));
  item.system.stashed = true;
  assert.ok(buildInventoryItemCards(item).every(card => card.slots === 0));
  item.system.stashed = false;
  item.system.isPhysical = false;
  assert.ok(buildInventoryItemCards(item).every(card => card.slots === 0));
});

test("card selection rejects stale quantities, overfilled cards and malformed counts", () => {
  const { item } = fixture(45, 20);
  assert.deepEqual(getGroupItemSelection(item, { quantity: "20", sourceQuantity: "45" }), {
    quantity: 20, sourceQuantity: 45, remaining: 25,
  });
  for (const selection of [
    { quantity: 21, sourceQuantity: 45 }, { quantity: 20, sourceQuantity: 44 },
    { quantity: 0, sourceQuantity: 45 }, { quantity: 1.5, sourceQuantity: 45 },
    { quantity: 1 }, {},
  ]) assert.equal(getGroupItemSelection(item, selection), null);
});

test("dragging a card carries only its contents and rejects a stale card", () => {
  for (const [quantity, perSlot, count] of [[3, 1, 1], [45, 20, 20], [45, 20, 5]]) {
    const f = fixture(quantity, perSlot);
    let payload;
    const event = {
      currentTarget: f.row(count),
      dataTransfer: { setData: (_type, value) => { payload = JSON.parse(value); } },
      preventDefault() { assert.fail("A current card must be draggable"); },
    };
    f.sheet._onDragStart(event);
    assert.deepEqual(payload["mk-shadowdark"].groupInventoryTransfer, {
      sourceActorUuid: f.actor.uuid, sourceItemId: f.item.id, quantity: count, sourceQuantity: quantity,
    });
    f.item.system.quantity--;
    event.preventDefault = () => { payload = null; };
    f.sheet._onDragStart(event);
    assert.equal(payload, null);
  }
});

test("trashing removes only the selected ordinary item or ammunition card", async () => {
  for (const [quantity, perSlot, count, remaining] of [[3, 1, 1, 2], [45, 20, 20, 25], [45, 20, 5, 40]]) {
    const f = fixture(quantity, perSlot);
    assert.equal(await f.sheet._onTrashInventoryCard(f.row(count)), true);
    assert.equal(f.item.system.quantity, remaining);
    assert.deepEqual(f.changes, [{ "system.quantity": remaining }]);
    assert.equal(f.actor.items.size, 1);
  }
});

test("trashing the last card deletes its Item document and escapes its name in confirmation", async () => {
  const f = fixture(1);
  f.item.name = '<img src=x onerror="bad()">';
  assert.equal(await f.sheet._onTrashInventoryCard(f.row()), true);
  assert.equal(f.actor.items.size, 0);
  assert.deepEqual(f.changes, [{ deleted: ["gear"] }]);
  assert.ok(f.prompts[0].content.includes("&lt;img"));
  assert.ok(!f.prompts[0].content.includes("<img"));
  assert.equal(f.prompts[0].no.default, true);
});

test("cancelling trash confirmation leaves every card untouched", async () => {
  const f = fixture();
  confirm = () => false;
  assert.equal(await f.sheet._onTrashInventoryCard(f.row()), false);
  assert.equal(f.item.system.quantity, 3);
  assert.deepEqual(f.changes, []);
});

test("inventory changes during trash confirmation prevent a second removal", async () => {
  const f = fixture();
  confirm = () => { f.item.system.quantity = 2; return true; };
  assert.equal(await f.sheet._onTrashInventoryCard(f.row()), false);
  assert.deepEqual(f.changes, []);
  assert.equal(f.warnings.length, 1);
});

test("only editable GM sheets offer the native right-click trash menu", async () => {
  const f = fixture();
  const root = { nodeType: 1 };
  f.sheet._activateInventoryContextMenu([root]);
  assert.equal(context.root, root);
  assert.equal(context.selector, ".mk-shared-item-row[data-item-id]");
  assert.deepEqual(context.options, { jQuery: false, fixed: true });
  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0].condition(f.row()), true);
  game.user.isGM = false;
  assert.equal(context.entries[0].condition(f.row()), false);
  context = null;
  f.sheet._activateInventoryContextMenu(root);
  assert.equal(context, null);
  assert.equal(await f.sheet._onTrashInventoryCard(f.row()), false);
  game.user.isGM = true;
  f.sheet.isEditable = false;
  f.sheet._activateInventoryContextMenu(root);
  assert.equal(context, null);
  assert.equal(await f.sheet._onTrashInventoryCard(f.row()), false);
  assert.equal(f.prompts.length, 0);
  assert.deepEqual(f.changes, []);
});
