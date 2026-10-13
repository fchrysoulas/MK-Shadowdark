import test from "node:test";
import assert from "node:assert/strict";
import {
  canManageActorItems, handleVaultTransferDrop, transferVaultItemToActor
} from "../scripts/libs/bastion-vault-transfer.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = actor.isOwner; }
  async getData() { return {}; }
}
globalThis.foundry = { appv1: { sheets: { ActorSheet: NativeSheet } } };
const { MKBastionSheet } = await import("../scripts/bastion-sheet/sheet.js");

function setup() {
  const warnings = [];
  const errors = [];
  const documents = new Map();
  globalThis.game = { user: { id: "player", isGM: false }, items: new Map() };
  globalThis.ui = { notifications: { warn: text => warnings.push(text), error: text => errors.push(text), info() {} } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
  let nextId = 0;

  function item(actor = null, id = "sword", slots = 1) {
    const value = {
      id, uuid: actor ? `${actor.uuid}.Item.${id}` : `Item.${id}`, documentName: "Item",
      name: id, type: "Weapon", parent: actor,
      system: { quantity: 1, slots: { slots_used: slots, per_slot: 1 } },
      toObject() { return { _id: this.id, name: this.name, type: this.type, system: structuredClone(this.system) }; },
      toDragData() { return { type: "Item", uuid: this.uuid }; }
    };
    actor?.items.push(value);
    documents.set(value.uuid, value);
    return value;
  }

  function actor(id, { bastion = false, owned = true, upgrades = ["vault"] } = {}) {
    const items = [];
    items.get = id => items.find(item => item.id === id);
    const value = {
      id, uuid: `Actor.${id}`, documentName: "Actor", name: id,
      type: bastion ? "mk-shadowdark.bastion" : "Player", items, system: {},
      permission: owned ? 3 : 2, creates: [], deletes: [],
      get isOwner() { return game.user.isGM || this.permission >= 3; },
      testUserPermission: (_user, level) => value.permission >= level,
      getFlag: () => ({ type: "castle", upgrades }),
      async createEmbeddedDocuments(type, data) {
        assert.equal(type, "Item");
        this.creates.push(structuredClone(data));
        return data.map(raw => {
          const created = item(this, `created-${++nextId}`);
          created.name = raw.name;
          created.system = structuredClone(raw.system);
          return created;
        });
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        this.deletes.push([...ids]);
        for (const id of ids) {
          const index = items.findIndex(item => item.id === id);
          if (index >= 0) { documents.delete(items[index].uuid); items.splice(index, 1); }
        }
      }
    };
    documents.set(value.uuid, value);
    return value;
  }

  const event = { preventDefault() {}, stopPropagation() {} };
  const dropzone = { classList: { remove() {} } };
  const transfer = (actor, item) => ({ type: "Item", uuid: item.uuid, "mk-shadowdark": { vaultTransfer: {
    sourceActorUuid: actor.uuid, sourceItemUuid: item.uuid, sourceItemId: item.id
  } } });
  return { actor, item, event, dropzone, transfer, warnings, errors, documents };
}

test("Vault access requires OWNER permission and preserves GM access", () => {
  const f = setup();
  assert.equal(canManageActorItems(f.actor("owner")), true);
  assert.equal(canManageActorItems(f.actor("observer", { owned: false })), false);
  assert.equal(canManageActorItems({ isOwner: true }), true);
  assert.equal(canManageActorItems(null), false);
  game.user.isGM = true;
  assert.equal(canManageActorItems(f.actor("gm-target", { owned: false })), true);
});

test("Bastion owners receive Vault access while upgrade editing stays GM-only", async () => {
  const f = setup();
  const sheet = new MKBastionSheet(f.actor("bastion", { bastion: true }));
  const data = await sheet.getData();
  assert.equal(data.mk.canManageVault, true);
  assert.equal(data.mk.canEditBastion, false);
  assert.ok(data.mk.bastion.upgrades.every(upgrade => !upgrade.canInstall));
  sheet.isEditable = false;
  assert.equal((await sheet.getData()).mk.canManageVault, false);
});

test("an owner can deposit an item from an owned character into the Vault", async () => {
  const f = setup();
  const character = f.actor("hero");
  const sourceItem = f.item(character);
  const bastion = f.actor("bastion", { bastion: true });
  await new MKBastionSheet(bastion)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(character.items.length, 0);
  assert.equal(bastion.items.length, 1);
  assert.equal(bastion.items[0].name, "sword");
  assert.equal(bastion.creates[0][0]._id, undefined);
  assert.deepEqual(character.deletes, [["sword"]]);
});

test("an owner can withdraw an item to an owned character through the shared transfer helper", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  const character = f.actor("hero");
  const created = await transferVaultItemToActor(character, f.transfer(bastion, sourceItem));
  assert.equal(created.name, "sword");
  assert.equal(character.items.length, 1);
  assert.equal(bastion.items.length, 0);
});

test("the native character-sheet drop hook handles an owner's move without making a duplicate native copy", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  const character = f.actor("hero");
  assert.equal(handleVaultTransferDrop(character, {}, f.transfer(bastion, sourceItem)), false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(character.items.length, 1);
  assert.equal(character.creates.length, 1);
  assert.equal(bastion.items.length, 0);
});

test("ownership of the Bastion does not permit taking another character's item", async () => {
  const f = setup();
  const character = f.actor("foreign-hero", { owned: false });
  const sourceItem = f.item(character);
  const bastion = f.actor("bastion", { bastion: true });
  await new MKBastionSheet(bastion)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(bastion.creates.length, 0);
  assert.equal(character.deletes.length, 0);
  assert.equal(character.items.length, 1);
  assert.match(f.warnings[0], /own the source actor/);
});

test("an observer cannot deposit into or withdraw from an unowned Bastion", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true, owned: false });
  const vaultItem = f.item(bastion, "stored");
  const character = f.actor("hero");
  const sourceItem = f.item(character);
  await new MKBastionSheet(bastion)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(await transferVaultItemToActor(character, f.transfer(bastion, vaultItem)), null);
  assert.equal(bastion.creates.length, 0);
  assert.equal(character.creates.length, 0);
  assert.equal(bastion.deletes.length, 0);
  assert.equal(character.deletes.length, 0);
});

test("withdrawal requires ownership of the receiving actor as well as the Bastion", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  const character = f.actor("foreign-hero", { owned: false });
  const data = f.transfer(bastion, sourceItem);
  assert.equal(await transferVaultItemToActor(character, data), null);
  assert.equal(handleVaultTransferDrop(character, {}, data), false);
  assert.equal(character.creates.length, 0);
  assert.equal(bastion.deletes.length, 0);
});

test("owners can copy world and compendium items without deleting their source", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sheet = new MKBastionSheet(bastion);
  for (const id of ["world", "compendium"]) {
    const source = f.item(null, id);
    await sheet._onVaultDrop(f.event, { type: "Item", uuid: source.uuid }, f.dropzone);
    assert.equal(f.documents.get(source.uuid), source);
  }
  assert.equal(bastion.items.length, 2);
});

test("owner deposits still require the Vault upgrade and respect the 100-slot capacity", async () => {
  const f = setup();
  const character = f.actor("hero");
  const sourceItem = f.item(character);
  const missingVault = f.actor("missing-vault", { bastion: true, upgrades: [] });
  await new MKBastionSheet(missingVault)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(missingVault.creates.length, 0);
  const fullVault = f.actor("full-vault", { bastion: true });
  f.item(fullVault, "full", 100);
  await new MKBastionSheet(fullVault)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(fullVault.creates.length, 0);
  assert.equal(character.items.length, 1);
});

test("Vault owners can discard their stored items while observers cannot", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  const sheet = new MKBastionSheet(bastion);
  bastion.permission = 2;
  await sheet._onVaultTrashDrop(f.event, f.transfer(bastion, sourceItem), f.dropzone);
  assert.equal(bastion.items.length, 1);
  bastion.permission = 3;
  await sheet._onVaultTrashDrop(f.event, f.transfer(bastion, sourceItem), f.dropzone);
  assert.equal(bastion.items.length, 0);
});

test("dragging from the Vault is enabled for owners and denied for observers", () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  const sheet = new MKBastionSheet(bastion);
  const payloads = [];
  let prevented = false;
  const event = {
    currentTarget: { dataset: { vaultItemId: sourceItem.id } },
    dataTransfer: { setData: (type, value) => payloads.push({ type, data: JSON.parse(value) }) },
    preventDefault() { prevented = true; }
  };
  sheet._onVaultItemDragStart(event);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].data["mk-shadowdark"].vaultTransfer.sourceActorUuid, bastion.uuid);
  assert.equal(event.dataTransfer.effectAllowed, "move");
  bastion.permission = 2;
  sheet._onVaultItemDragStart(event);
  assert.equal(prevented, true);
  assert.equal(payloads.length, 2);
});

test("a failed withdrawal deletion rolls back the destination copy and keeps the Vault item", async () => {
  const f = setup();
  const bastion = f.actor("bastion", { bastion: true });
  const sourceItem = f.item(bastion);
  bastion.deleteEmbeddedDocuments = async () => { throw new Error("source deletion denied"); };
  const character = f.actor("hero");
  await assert.rejects(transferVaultItemToActor(character, f.transfer(bastion, sourceItem)), /source deletion denied/);
  assert.equal(bastion.items.length, 1);
  assert.equal(character.items.length, 0);
  assert.equal(character.deletes.length, 1);
});

test("a cancelled Vault item creation never removes the player's source item", async () => {
  const f = setup();
  const character = f.actor("hero");
  const sourceItem = f.item(character);
  const bastion = f.actor("bastion", { bastion: true });
  bastion.createEmbeddedDocuments = async () => [];
  await new MKBastionSheet(bastion)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(character.items.length, 1);
  assert.equal(character.deletes.length, 0);
});

test("GMs can transfer items even when neither actor is explicitly owned", async () => {
  const f = setup();
  game.user.isGM = true;
  const bastion = f.actor("bastion", { bastion: true, owned: false });
  const character = f.actor("hero", { owned: false });
  const sourceItem = f.item(character);
  await new MKBastionSheet(bastion)._onVaultDrop(f.event, { type: "Item", uuid: sourceItem.uuid }, f.dropzone);
  assert.equal(character.items.length, 0);
  assert.equal(bastion.items.length, 1);
});
