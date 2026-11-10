import test from "node:test";
import assert from "node:assert/strict";
import { transferStoredInventoryItem, discardStoredInventoryItem, handleStoredInventoryRequest } from "../scripts/libs/stored-inventory-service.js";
import { queueStoredInventoryMutation } from "../scripts/libs/stored-inventory-queue.js";
import { installStoredInventoryTransport } from "./helpers/stored-inventory-transport.mjs";

function fixture() {
  const owner = { id: "owner", isGM: false, active: true };
  const second = { id: "second", isGM: false, active: true };
  globalThis.game = { user: owner };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  const warnings = [];
  globalThis.ui = { notifications: { warn: value => warnings.push(value) } };
  const transport = installStoredInventoryTransport();
  transport.users.push(second);
  const documents = new Map();
  globalThis.fromUuid = async uuid => documents.get(uuid);
  let sequence = 0;
  function actor(id, type = "Player", owners = [owner.id, second.id]) {
    const items = new Map();
    items[Symbol.iterator] = items.values;
    const result = {
      id, uuid: `Actor.${id}`, documentName: "Actor", type, items, owners,
      system: { cargoCapacity: 1 }, upgrades: ["vault"],
      testUserPermission(user) { return this.owners.includes(user.id); },
      getFlag: (_scope, key) => key === "bastion" ? { upgrades: result.upgrades } : false,
      async createEmbeddedDocuments(_type, entries) {
        assert.equal(game.user.id, transport.gm.id, "only the authoritative GM creates items");
        await new Promise(resolve => setImmediate(resolve));
        return entries.map(data => item(result, `created-${++sequence}`, data.system.quantity));
      },
      async deleteEmbeddedDocuments(_type, ids) {
        assert.equal(game.user.id, transport.gm.id, "only the authoritative GM deletes items");
        await new Promise(resolve => setImmediate(resolve));
        for (const id of ids) { documents.delete(items.get(id)?.uuid); items.delete(id); }
      },
    };
    documents.set(result.uuid, result);
    return result;
  }
  function item(parent, id = "gear", quantity = 1) {
    const result = {
      id, uuid: `${parent.uuid}.Item.${id}`, type: "Basic", parent,
      system: { quantity, isPhysical: true, slots: { per_slot: 1, slots_used: 1 } },
      toObject() { return { type: this.type, system: structuredClone(this.system) }; },
      async update(changes) {
        assert.equal(game.user.id, transport.gm.id, "only the authoritative GM changes stacks");
        await new Promise(resolve => setImmediate(resolve));
        this.system.quantity = changes["system.quantity"];
      },
    };
    parent.items.set(id, result);
    documents.set(result.uuid, result);
    return result;
  }
  return { ...transport, owner, second, actor, item, warnings };
}

test("two clients withdrawing the same Vault item create exactly one destination copy", async () => {
  const f = fixture();
  const source = f.actor("vault", "mk-shadowdark.bastion");
  const item = f.item(source);
  const destinations = [f.actor("first", "Player", [f.owner.id]), f.actor("second", "Player", [f.second.id])];
  const selection = { quantity: 1, sourceQuantity: 1 };
  await Promise.all([
    transferStoredInventoryItem(destinations[0], item, selection),
    f.runAs(f.second, () => transferStoredInventoryItem(destinations[1], item, selection)),
  ]);
  assert.equal(source.items.size, 0);
  assert.equal(destinations.reduce((sum, actor) => sum + actor.items.size, 0), 1);
});

test("two clients cannot consume the same partial Boat stack or discard it during a withdrawal", async () => {
  const f = fixture();
  const source = f.actor("boat", "mk-shadowdark.boat");
  const item = f.item(source, "gear", 4);
  const destination = f.actor("hero");
  const selection = { quantity: 1, sourceQuantity: 4 };
  await Promise.all([
    transferStoredInventoryItem(destination, item, selection),
    f.runAs(f.second, () => discardStoredInventoryItem(item, selection)),
  ]);
  assert.equal(item.system.quantity, 3);
  assert.equal(destination.items.size, 1);
});

test("simultaneous deposits recheck the Boat's remaining capacity on the GM", async () => {
  const f = fixture();
  const boat = f.actor("boat", "mk-shadowdark.boat");
  const sources = [f.actor("one"), f.actor("two")];
  const items = sources.map(actor => f.item(actor));
  await Promise.all(items.map(item => transferStoredInventoryItem(boat, item, { quantity: 1, sourceQuantity: 1 })));
  assert.equal(boat.items.size, 1);
  assert.equal(sources.reduce((sum, actor) => sum + actor.items.size, 0), 1);
});

test("queued requests recheck ownership and Vault installation before mutation", async () => {
  const f = fixture();
  const source = f.actor("hero");
  const item = f.item(source);
  const vault = f.actor("vault", "mk-shadowdark.bastion");
  let release;
  const held = queueStoredInventoryMutation(() => new Promise(resolve => { release = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  const move = transferStoredInventoryItem(vault, item, { quantity: 1, sourceQuantity: 1 });
  source.owners = [];
  release();
  await held;
  assert.equal(await move, null);
  assert.equal(source.items.size, 1);
  source.owners = [f.owner.id];
  vault.upgrades = [];
  assert.equal(await transferStoredInventoryItem(vault, item, { quantity: 1, sourceQuantity: 1 }), null);
  assert.equal(vault.items.size, 0);
});

test("a claimed GM identity cannot bypass the authenticated request author's permissions", async () => {
  const f = fixture();
  const source = f.actor("vault", "mk-shadowdark.bastion", [f.owner.id]);
  const item = f.item(source);
  const destination = f.actor("target", "Player", [f.second.id]);
  const result = await f.runAs(f.second, () => transferStoredInventoryItem(destination, item, { quantity: 1, sourceQuantity: 1 }));
  assert.equal(result, null);
  assert.equal(source.items.size, 1);
  assert.equal(destination.items.size, 0);
});

test("expired requests and sessions without a GM cannot mutate stored inventories", async () => {
  const f = fixture();
  const source = f.actor("vault", "mk-shadowdark.bastion");
  const item = f.item(source);
  const request = { action: "discard", sourceItemUuid: item.uuid, quantity: 1, sourceQuantity: 1,
    authorityId: f.gm.id, requestId: "expired", status: "pending" };
  let status;
  await f.runAs(f.gm, () => handleStoredInventoryRequest({
    id: "expired-storage", author: f.owner, timestamp: Date.now() - 30000,
    getFlag: () => request,
    async update(change) { status = change["flags.mk-shadowdark.storedInventoryTransfer"].status; },
  }));
  assert.equal(status, "rejected");
  f.gm.active = false;
  assert.equal(await discardStoredInventoryItem(item, request), null);
  assert.equal(source.items.size, 1);
  assert.match(f.warnings[0], /active GM/);
});
