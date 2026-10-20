import test from "node:test";
import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {
  on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
  once(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
};
const {
  handleGroupInventoryTransferDrop, handleGroupInventoryTransferRequest,
  isGroupInventoryTransferData, receiveGroupInventoryTransfer, transferGroupInventoryItemToActor,
} = await import("../scripts/libs/group-inventory-transfer.js");

const MODULE_ID = "mk-shadowdark";
const FLAG = "groupInventoryTransfer";
let sequence = 0;
class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
}

function fixture() {
  const gm = { id: "gm", isGM: true, active: true };
  const player = { id: "player", isGM: false, active: true };
  const stranger = { id: "stranger", isGM: false, active: true };
  const documents = new Map();
  const operations = [];
  const warnings = [];
  const messages = [];
  const f = { gm, player, stranger, documents, operations, warnings, messages, enabled: true };
  globalThis.game = {
    user: gm, users: new Collection([gm, player, stranger].map(user => [user.id, user])),
    settings: { settings: new Map([[`${MODULE_ID}.enableGroupActors`, {}]]), get: () => f.enabled },
  };
  globalThis.foundry = { utils: { randomID: () => `request-${++sequence}` } };
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? null;
  globalThis.ui = { notifications: { warn: value => warnings.push(value), error: value => warnings.push(value) } };
  function makeActor(id, { group = false, owner = player.id, observer = true } = {}) {
    const actor = {
      id, uuid: `Actor.${id}`, documentName: "Actor", type: "Player", group, owner, observer,
      items: new Collection(), flags: {},
      getFlag(scope, key) { return key === "isGroup" ? this.group : this.flags[scope]?.[key]; },
      testUserPermission(user, permission) {
        return user.isGM || this.owner === user.id || (permission === "OBSERVER" && this.observer && user.id === player.id);
      },
      get isOwner() { return this.testUserPermission(game.user, "OWNER"); },
      async createEmbeddedDocuments(type, entries) {
        assert.equal(type, "Item");
        assert.equal(game.user.id, gm.id, "only the primary GM mutates inventory documents");
        operations.push(`create:${id}`);
        if (this.failCreate) throw new Error("Item creation failed");
        if (this.cancelCreate) return [];
        return entries.map(data => {
          const itemId = `item-${++sequence}`;
          const item = {
            ...structuredClone(data), id: itemId, uuid: `${this.uuid}.Item.${itemId}`, parent: this,
            async update(changes) { this.changes = changes; },
          };
          this.items.set(itemId, item);
          documents.set(item.uuid, item);
          return item;
        });
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        assert.equal(game.user.id, gm.id);
        operations.push(`delete:${id}`);
        if (this.failDelete) throw new Error("Item removal failed");
        if (this.cancelDelete) return [];
        const removed = ids.map(itemId => {
          const item = this.items.get(itemId);
          this.items.delete(itemId);
          documents.delete(item?.uuid);
          return item;
        });
        if (this.failAfterDelete) throw new Error("A post-delete hook failed");
        return removed;
      },
      async update(changes) { this.changes = changes; },
    };
    documents.set(actor.uuid, actor);
    return actor;
  }
  f.source = makeActor("party", { group: true, owner: gm.id });
  f.target = makeActor("hero");
  f.makeActor = makeActor;
  f.itemData = {
    _id: "gear", name: "Rations", img: "rations.webp", type: "Basic", folder: "old-folder", sort: 20,
    system: { quantity: 4, equipped: false, stashed: false },
    effects: [{ name: "Test effect", transfer: true, changes: [{ key: "system.test", value: "1" }] }],
    flags: { [MODULE_ID]: { custom: true } },
  };
  f.item = {
    id: "gear", uuid: `${f.source.uuid}.Item.gear`, parent: f.source,
    toObject: () => structuredClone(f.itemData),
  };
  f.source.items.set(f.item.id, f.item);
  documents.set(f.item.uuid, f.item);
  f.drag = {
    type: "Item", uuid: f.item.uuid,
    [MODULE_ID]: { [FLAG]: { sourceActorUuid: f.source.uuid, sourceItemId: f.item.id } },
  };
  f.message = (changes = {}, author = player) => {
    const message = {
      id: `message-${++sequence}`, author, timestamp: Date.now(),
      flags: { [MODULE_ID]: { [FLAG]: {
        ...f.drag[MODULE_ID][FLAG], targetActorUuid: f.target.uuid,
        requestId: `request-${sequence}`, status: "pending", authorityId: gm.id, ...changes,
      } } },
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      async update(change) {
        this.flags[MODULE_ID][FLAG] = change[`flags.${MODULE_ID}.${FLAG}`];
        this.content = change.content;
        return this;
      },
    };
    return message;
  };
  globalThis.ChatMessage = {
    async create(data) {
      const message = f.message(data.flags[MODULE_ID][FLAG], game.user);
      message.whisper = data.whisper;
      messages.push(message);
      return message;
    },
  };
  return f;
}

test("shared gear moves as a full stack with effects and flags, creating before removing the source", async () => {
  const f = fixture();
  const moved = await transferGroupInventoryItemToActor(f.target, f.drag);
  assert.equal(f.source.items.size, 0);
  assert.equal(f.target.items.size, 1);
  assert.equal(moved.parent, f.target);
  assert.equal(moved.system.quantity, 4);
  assert.deepEqual(moved.effects, f.itemData.effects);
  assert.deepEqual(moved.flags, f.itemData.flags);
  assert.notEqual(moved.id, f.item.id);
  assert.equal(moved.folder, null);
  assert.deepEqual(f.operations, ["create:hero", "delete:party"]);
  assert.equal(f.itemData._id, "gear", "the source snapshot is not modified");
});

test("an observer requests a move, the primary GM applies it, and only the GM response completes it", async () => {
  const f = fixture();
  game.user = f.player;
  const pending = transferGroupInventoryItemToActor(f.target, f.drag);
  let completed = false;
  void pending.then(() => { completed = true; });
  const [message] = f.messages;
  assert.equal(message.author, f.player);
  assert.deepEqual(message.whisper, [f.gm.id, f.player.id]);
  assert.deepEqual(f.operations, []);
  game.user = f.gm;
  await handleGroupInventoryTransferRequest(message);
  assert.equal(message.getFlag(MODULE_ID, FLAG).status, "moved");
  game.user = f.player;
  receiveGroupInventoryTransfer(message, {}, {}, f.player.id);
  await Promise.resolve();
  assert.equal(completed, false, "a player-authored acknowledgement is ignored");
  receiveGroupInventoryTransfer(message, {}, {}, f.gm.id);
  const moved = await pending;
  assert.equal(moved.parent, f.target);
  assert.equal(f.source.items.size, 0);
  assert.equal(f.target.items.size, 1);
});

test("requests use the authenticated chat author rather than a claimed user id", async () => {
  const f = fixture();
  const message = f.message({ userId: f.gm.id }, f.stranger);
  await handleGroupInventoryTransferRequest(message);
  assert.equal(message.getFlag(MODULE_ID, FLAG).status, "failed");
  assert.deepEqual(f.operations, []);
});

test("the GM rechecks group visibility, receiving-character ownership, and actor types", async () => {
  const cases = [
    f => { f.source.observer = false; },
    f => { f.target.owner = f.stranger.id; },
    f => { f.target.type = "NPC"; },
    f => { f.target.group = true; },
    f => { f.source.group = false; },
    f => { f.source.inCompendium = true; },
    f => { f.enabled = false; },
  ];
  for (const prepare of cases) {
    const f = fixture();
    prepare(f);
    const message = f.message();
    await handleGroupInventoryTransferRequest(message);
    assert.equal(message.getFlag(MODULE_ID, FLAG).status, "failed");
    assert.equal(f.source.items.size, 1);
    assert.deepEqual(f.operations, []);
  }
});

test("only the designated primary GM processes a fresh active user's request", async () => {
  for (const scenario of ["secondary-gm", "expired", "inactive", "wrong-authority"]) {
    const f = fixture();
    const message = f.message();
    if (scenario === "secondary-gm") {
      game.user = { id: "secondary", isGM: true, active: true };
      game.users.set(game.user.id, game.user);
    }
    if (scenario === "expired") message.timestamp -= 30000;
    if (scenario === "inactive") f.player.active = false;
    if (scenario === "wrong-authority") message.getFlag(MODULE_ID, FLAG).authorityId = "other-gm";
    await handleGroupInventoryTransferRequest(message);
    assert.deepEqual(f.operations, []);
  }
});

test("simultaneous drops and repeat delivery transfer the shared stack only once", async () => {
  const f = fixture();
  const other = f.makeActor("other-hero");
  const first = f.message();
  const second = f.message({ targetActorUuid: other.uuid });
  await Promise.all([
    handleGroupInventoryTransferRequest(first), handleGroupInventoryTransferRequest(second),
    handleGroupInventoryTransferRequest(first),
  ]);
  assert.equal(first.getFlag(MODULE_ID, FLAG).status, "moved");
  assert.equal(second.getFlag(MODULE_ID, FLAG).status, "failed");
  assert.equal(f.target.items.size + other.items.size, 1);
  assert.equal(f.source.items.size, 0);
  assert.deepEqual(f.operations, ["create:hero", "delete:party"]);
});

test("creation failures and cancelled item creation preserve the shared stack", async () => {
  for (const cancellation of [false, true]) {
    const f = fixture();
    f.target.failCreate = !cancellation;
    f.target.cancelCreate = cancellation;
    if (cancellation) assert.equal(await transferGroupInventoryItemToActor(f.target, f.drag), null);
    else await assert.rejects(transferGroupInventoryItemToActor(f.target, f.drag), /creation failed/);
    assert.equal(f.source.items.size, 1);
    assert.equal(f.target.items.size, 0);
    assert.deepEqual(f.operations, ["create:hero"]);
  }
});

test("failed or cancelled source removal rolls back the destination copy", async () => {
  for (const cancellation of [false, true]) {
    const f = fixture();
    f.source.failDelete = !cancellation;
    f.source.cancelDelete = cancellation;
    await assert.rejects(transferGroupInventoryItemToActor(f.target, f.drag), /removal failed|not removed/);
    assert.equal(f.source.items.size, 1);
    assert.equal(f.target.items.size, 0);
    assert.deepEqual(f.operations, ["create:hero", "delete:party", "delete:hero"]);
  }
});

test("a post-delete failure keeps the destination when the source has already been removed", async () => {
  const f = fixture();
  f.source.failAfterDelete = true;
  const moved = await transferGroupInventoryItemToActor(f.target, f.drag);
  assert.equal(moved.parent, f.target);
  assert.equal(f.source.items.size, 0);
  assert.equal(f.target.items.size, 1);
  assert.deepEqual(f.operations, ["create:hero", "delete:party"]);
});

test("a rejected player request reports failure without creating an item", async () => {
  const f = fixture();
  game.user = f.player;
  const pending = transferGroupInventoryItemToActor(f.target, f.drag);
  const rejected = assert.rejects(pending, /could not be moved/);
  f.source.observer = false;
  const [message] = f.messages;
  game.user = f.gm;
  await handleGroupInventoryTransferRequest(message);
  game.user = f.player;
  receiveGroupInventoryTransfer(message, {}, {}, f.gm.id);
  await rejected;
  assert.deepEqual(f.operations, []);
});

test("players cannot copy shared gear while no GM is active or into an unowned character", async () => {
  const f = fixture();
  game.user = f.player;
  f.gm.active = false;
  assert.equal(await transferGroupInventoryItemToActor(f.target, f.drag), null);
  f.gm.active = true;
  f.target.owner = f.stranger.id;
  assert.equal(await transferGroupInventoryItemToActor(f.target, f.drag), null);
  assert.equal(f.messages.length, 0);
  assert.equal(f.warnings.length, 2);
  assert.deepEqual(f.operations, []);
});

test("ordinary item drops remain native and shared-item drops synchronously cancel native copying", async () => {
  const f = fixture();
  assert.equal(isGroupInventoryTransferData({ type: "Item", uuid: "Item.world" }), false);
  assert.equal(handleGroupInventoryTransferDrop(f.target, {}, { type: "Item", uuid: "Item.world" }), undefined);
  assert.equal(handleGroupInventoryTransferDrop(f.target, {}, f.drag), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.source.items.size, 0);
  assert.equal(f.target.items.size, 1);
  assert.equal(hooks.get("dropActorSheetData")[0], handleGroupInventoryTransferDrop);
});

test("self-drops and malformed transfer data cannot create an item", async () => {
  const f = fixture();
  assert.equal(await transferGroupInventoryItemToActor(f.source, f.drag), null);
  const invalid = { type: "Item", [MODULE_ID]: { [FLAG]: {} } };
  assert.equal(handleGroupInventoryTransferDrop(f.target, {}, invalid), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.operations, []);
});

test("a failed chat request leaves inventories unchanged and clears its pending timer", async () => {
  const f = fixture();
  game.user = f.player;
  ChatMessage.create = async () => { throw new Error("Chat unavailable"); };
  await assert.rejects(transferGroupInventoryItemToActor(f.target, f.drag), /Chat unavailable/);
  assert.deepEqual(f.operations, []);
});

test("Character Dashboard Quick Slots await a shared item move without falling back to a second import", async () => {
  const f = fixture();
  f.target.items.set("gear", { id: "gear", parent: f.target, name: "An unrelated item with the same id" });
  let Sheet;
  class NativeSheet {
    constructor(actor) { this.actor = actor; }
    static get defaultOptions() { return {}; }
    _onDrop() { assert.fail("A Quick Slot drop must not reach native copying"); }
    render() {}
  }
  game.system = { id: "shadowdark", sheets: { PlayerSheetSD: NativeSheet } };
  game.modules = new Map();
  game.i18n = { localize: key => key };
  foundry.utils.mergeObject = (base, options) => ({ ...base, ...options });
  foundry.documents = { collections: { Actors: { registerSheet: (_scope, cls) => { Sheet = cls; } } } };
  await import("../scripts/character-dashboard/character-dashboard.js");
  hooks.get("init")[0]();
  const slot = { dataset: { quickSlot: "quick1" }, matches: selector => selector.includes("quickslot") };
  const drop = {
    preventDefault() {}, stopPropagation() {}, target: { closest: () => slot },
    dataTransfer: { getData: () => JSON.stringify(f.drag) },
  };
  await new Sheet(f.target)._onDrop(drop);
  assert.equal(f.source.items.size, 0);
  assert.equal(f.target.items.size, 2);
  const item = [...f.target.items].find(item => item.id !== "gear");
  assert.deepEqual(f.target.changes, { "flags.mk-shadowdark.quickSlots": [item.id, null, null] });
});
