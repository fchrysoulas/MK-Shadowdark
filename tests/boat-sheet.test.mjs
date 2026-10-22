import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOAT_ACTOR_TYPE } from "../scripts/boat-sheet/constants.js";
import { getBoatCrew, buildBoatCrewData } from "../scripts/boat-sheet/crew.js";
import { storeBoatCargo } from "../scripts/boat-sheet/cargo.js";
import { transferVaultItemToActor, handleVaultTransferDrop } from "../scripts/libs/bastion-vault-transfer.js";
import { calculateGroupInventorySlots } from "../scripts/group-sheet/inventory.js";
import { queueStoredInventoryMutation } from "../scripts/libs/stored-inventory-queue.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = actor.isOwner; this.renders = 0; }
  async getData() { return {}; }
  async _updateObject(_event, data) { return this.actor.update(data); }
  render() { this.renders++; }
  _disableFields(form) { for (const control of form.controls) control.disabled = true; }
}
class Field { constructor(...args) { this.args = args; } }
let confirmCargo;
let cargoMenu;
globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } }, abstract: { TypeDataModel: class {} },
  data: { fields: Object.fromEntries(["NumberField", "SchemaField", "StringField", "ArrayField", "HTMLField"].map(name => [name, Field])) },
  applications: { api: { DialogV2: { confirm: options => confirmCargo(options) } }, ux: { ContextMenu: class {
    constructor(root, selector, entries, options) { cargoMenu = { root, selector, entries, options, instance: this }; }
    _setPosition() {}
  }, TextEditor: { implementation: {
    getDragEventData: event => event.data,
    enrichHTML: async html => `<enriched>${html}</enriched>`,
  } } } },
};
globalThis.document = { createElement: () => ({
  set textContent(value) {
    this.innerHTML = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  },
}) };
const { MKBoatSheet, createBoatActor } = await import("../scripts/boat-sheet/sheet.js");
const { BoatDataModel, registerBoatDataModel } = await import("../scripts/boat-sheet/data-model.js");
const { registerBoatSheet } = await import("../scripts/boat-sheet/registration.js");
const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");
const { MKBastionSheet } = await import("../scripts/bastion-sheet/sheet.js");
const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

function fixture() {
  const documents = new Map();
  const warnings = [];
  const prompts = [];
  confirmCargo = options => { prompts.push(options); return true; };
  cargoMenu = null;
  globalThis.game = {
    user: { id: "owner", isGM: false }, actors: new Map(),
    settings: { get: () => "dark" },
    i18n: { localize: key => translations[key] ?? key, format: (key, data) => Object.entries(data).reduce((s, [k, v]) => s.replace(`{${k}}`, v), translations[key] ?? key) },
  };
  globalThis.ui = { notifications: { warn: value => warnings.push(value), error: value => warnings.push(value) } };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.fromUuid = async uuid => {
    const document = documents.get(uuid);
    if (document instanceof Error) throw document;
    return document;
  };
  globalThis.Item = { implementation: { fromDropData: async data => documents.get(data.uuid) } };
  let nextId = 0;

  function actor(id, type = BOAT_ACTOR_TYPE, owned = true) {
    const items = [];
    items.get = id => items.find(item => item.id === id);
    const value = {
      id, uuid: `Actor.${id}`, name: id, img: `${id}.webp`, documentName: "Actor", type, items,
      system: { attributes: { hp: { value: 20, max: 30 }, ac: { value: 14 } }, crew: [], crewCapacity: 5, cargoCapacity: 10, notes: "<p>Voyage</p>" },
      isOwner: owned, visible: true, updates: [],
      testUserPermission: () => owned,
      getFlag: () => false,
      sheet: { opens: 0, render() { this.opens++; } },
      async update(data) {
        this.updates.push(structuredClone(data));
        for (const [path, field] of Object.entries(data)) {
          const keys = path.split(".");
          let target = this;
          for (const key of keys.slice(0, -1)) target = target[key] ??= {};
          target[keys.at(-1)] = structuredClone(field);
        }
      },
      async createEmbeddedDocuments(type, data) {
        assert.equal(type, "Item");
        return data.map(raw => item(this, `loaded-${++nextId}`, raw.system.quantity, raw.system.slots?.slots_used, raw.name, {
          type: raw.type, system: raw.system,
        }));
      },
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        for (const id of ids) {
          const index = items.findIndex(item => item.id === id);
          if (index >= 0) { documents.delete(items[index].uuid); items.splice(index, 1); }
        }
      },
    };
    documents.set(value.uuid, value);
    game.actors.set(id, value);
    return value;
  }
  function item(parent = null, id = "supplies", quantity = 1, slots = 1, name = id, { type = "Basic", system = {} } = {}) {
    const model = Object.assign(new class {
      get isPhysical() { return type !== "Spell"; }
      get slotsUsed() { return Math.ceil(this.quantity / (this.slots?.per_slot || 1)) * (this.slots?.slots_used ?? 0); }
    }(), { quantity, slots: { per_slot: 1, slots_used: slots } }, structuredClone(system));
    const value = {
      id, uuid: parent ? `${parent.uuid}.Item.${id}` : `Item.${id}`, parent,
      name, documentName: "Item", type, img: "supply.webp", system: model,
      sheet: { opens: 0, render() { this.opens++; } },
      toObject() { return { _id: this.id, name: this.name, type: this.type, system: structuredClone(this.system) }; },
      toDragData() { return { type: "Item", uuid: this.uuid }; },
      async update(data) { this.system.quantity = data["system.quantity"]; },
    };
    parent?.items.push(value);
    documents.set(value.uuid, value);
    return value;
  }
  function event({ uuid, itemId, value, data, quantity, sourceQuantity } = {}) {
    const item = Array.from(documents.values()).find(doc => doc.documentName === "Item" && doc.id === itemId);
    const card = { dataset: { cargoItemId: itemId,
      itemQuantity: quantity ?? Math.min(item?.system.quantity ?? 1, item?.system.slots?.per_slot ?? 1),
      sourceQuantity: sourceQuantity ?? item?.system.quantity,
    } };
    return {
      preventDefault() {}, data,
      currentTarget: { value, closest: selector => selector === "[data-crew-uuid]"
        ? { dataset: { crewUuid: uuid } } : card },
    };
  }
  const payload = (source, item, quantity = Math.min(item.system.quantity, item.system.slots?.per_slot ?? 1), sourceQuantity = item.system.quantity) => ({ type: "Item", uuid: item.uuid, "mk-shadowdark": { cargoTransfer: {
    sourceActorUuid: source.uuid, sourceItemId: item.id, sourceItemUuid: item.uuid,
    quantity, sourceQuantity,
  } } });
  return { actor, item, event, documents, warnings, payload, prompts,
    row: options => event(options).currentTarget.closest("[data-cargo-item-id]"),
  };
}

test("Boat schema provides independent hull stats, capacities, crew links and rich-text notes", () => {
  globalThis.CONFIG = { Actor: { dataModels: {} } };
  assert.equal(registerBoatDataModel(), true);
  assert.equal(CONFIG.Actor.dataModels[BOAT_ACTOR_TYPE], BoatDataModel);
  const schema = BoatDataModel.defineSchema();
  for (const key of ["attributes", "vesselType", "speed", "crewCapacity", "passengerCapacity", "cargoCapacity", "crew", "notes"]) assert.ok(schema[key]);
  assert.equal(schema.crewCapacity.args[0].min, 0);
  assert.equal(schema.crew.args[0].args[0].actorUuid.args[0].blank, false);
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.documentTypes.Actor.boat.htmlFields, ["notes"]);
});

test("Boat creation requires a GM and creates a linked hull token without hard-coded vessel stats", async () => {
  const f = fixture();
  let created;
  globalThis.Actor = { create: async data => { created = data; return f.actor("boat"); } };
  assert.equal(await createBoatActor(), null);
  assert.equal(created, undefined);
  game.user.isGM = true;
  const boat = await createBoatActor({ name: "  Sea Sprite  ", folder: "ships" });
  assert.equal(created.type, BOAT_ACTOR_TYPE);
  assert.equal(created.name, "Sea Sprite");
  assert.equal(created.folder, "ships");
  assert.equal(created.prototypeToken.bar1.attribute, "attributes.hp");
  assert.equal(created.prototypeToken.actorLink, true);
  assert.equal(boat.sheet.opens, 1);
  assert.equal(created.system, undefined);
});

test("Boat registration publishes the sheet, type label and module API once", () => {
  fixture();
  const module = { api: { existing: true } };
  const registrations = [];
  globalThis.CONFIG = { Actor: { dataModels: {} } };
  game.modules = { get: id => { assert.equal(id, "mk-shadowdark"); return module; } };
  foundry.documents = { collections: { Actors: { registerSheet: (...args) => registrations.push(args) } } };
  assert.equal(registerBoatSheet(), true);
  assert.equal(registerBoatSheet(), true);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0][1], MKBoatSheet);
  assert.deepEqual(registrations[0][2].types, [BOAT_ACTOR_TYPE]);
  assert.equal(CONFIG.Actor.typeLabels[BOAT_ACTOR_TYPE], "TYPES.Actor.mk-shadowdark.boat");
  assert.equal(module.api.createBoatActor, createBoatActor);
  assert.equal(module.api.existing, true);
});

test("native Boat creation gets hull token defaults independently of Group Sheet availability", async () => {
  const hooks = new Map();
  globalThis.Hooks = { once: (name, callback) => hooks.set(name, callback), on: (name, callback) => hooks.set(name, callback) };
  await import("../scripts/boat-sheet/boat-sheet.js");
  let source;
  hooks.get("preCreateActor")({ type: BOAT_ACTOR_TYPE, updateSource: data => { source = data; } }, {});
  assert.equal(source["prototypeToken.actorLink"], true);
  assert.equal(source["prototypeToken.bar1.attribute"], "attributes.hp");
  assert.equal(source.img, "icons/svg/anchor.svg");
  source = null;
  hooks.get("preCreateActor")({ type: "NPC", updateSource: () => assert.fail() }, {});
  assert.equal(source, null);
});

test("crew links accept original Player/NPC actors and token drops, deduplicate, and exclude groups and boats", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const sheet = new MKBoatSheet(boat);
  const hero = f.actor("captain", "Player");
  const sailor = f.actor("sailor", "NPC");
  for (const linked of [hero, sailor, hero]) await sheet._onDrop(f.event({ data: { type: "Actor", uuid: linked.uuid } }));
  f.documents.set("Scene.harbor.Token.sailor", { documentName: "Token", actor: sailor });
  await sheet._onDrop(f.event({ data: { type: "Token", uuid: "Scene.harbor.Token.sailor" } }));
  assert.deepEqual(getBoatCrew(boat).map(entry => entry.actorUuid), [hero.uuid, sailor.uuid]);
  const group = f.actor("group", "Player");
  group.getFlag = () => true;
  for (const linked of [boat, group, f.actor("otherBoat")]) assert.equal(await sheet._addCrew({ uuid: linked.uuid }), false);
  assert.equal(hero.updates.length, 0);
  assert.equal(sailor.updates.length, 0);
});

test("crew roles and removals affect only the Boat; live names refresh and missing links stay removable", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const captain = f.actor("captain", "Player");
  const sheet = new MKBoatSheet(boat);
  await sheet._addCrew({ uuid: captain.uuid });
  await sheet._onCrewRole(f.event({ uuid: captain.uuid, value: "Captain" }));
  captain.name = "New name";
  const before = structuredClone(boat.system.crew);
  assert.equal((await buildBoatCrewData(boat))[0].name, "New name");
  assert.deepEqual(boat.system.crew, before);
  await sheet._onOpenCrew(f.event({ uuid: captain.uuid }));
  assert.equal(captain.sheet.opens, 1);
  captain.visible = false;
  assert.equal((await buildBoatCrewData(boat))[0].available, false);
  f.documents.set(captain.uuid, new Error("deleted compendium"));
  await sheet._onRemoveCrew(f.event({ uuid: captain.uuid }));
  assert.equal(boat.system.crew.length, 0);
  assert.equal(captain.updates.length, 0);
});

test("read-only viewers cannot change stats, crew or cargo and can still open available linked sheets", async () => {
  const f = fixture();
  const boat = f.actor("boat", BOAT_ACTOR_TYPE, false);
  const hero = f.actor("hero", "Player");
  const cargo = f.item(boat);
  boat.system.crew = [{ actorUuid: hero.uuid, name: hero.name, role: "Captain" }];
  const sheet = new MKBoatSheet(boat);
  await sheet._onDrop(f.event({ data: { type: "Actor", uuid: hero.uuid } }));
  await sheet._onRemoveCrew(f.event({ uuid: hero.uuid }));
  await sheet._onCrewRole(f.event({ uuid: hero.uuid, value: "Other" }));
  await sheet._onTrashCargoCard(f.row({ itemId: cargo.id }));
  await sheet._updateObject({}, { "system.attributes.ac.value": 20 });
  assert.equal(boat.updates.length, 0);
  assert.equal(boat.items.length, 1);
  await sheet._onOpenCrew(f.event({ uuid: hero.uuid }));
  assert.equal(hero.sheet.opens, 1);
  assert.equal((await sheet.getData()).mk.canEdit, false);
  assert.equal((await sheet.getData()).mk.notesHTML, "<enriched><p>Voyage</p></enriched>");
});

test("editable hull stats validate integers, clamp HP after a maximum reduction, and preserve independent capacities", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const sheet = new MKBoatSheet(boat);
  await sheet._updateObject({}, { "system.attributes.hp.max": "8", "system.speed": "Near (sailing)", "system.crewCapacity": "7" });
  assert.equal(boat.system.attributes.hp.value, 8);
  assert.equal(boat.system.crewCapacity, 7);
  assert.equal(boat.system.cargoCapacity, 10);
  assert.equal(boat.system.speed, "Near (sailing)");
  for (const value of [-1, "bad", 1.5]) await sheet._updateObject({}, { "system.attributes.ac.value": value });
  assert.equal(boat.updates.length, 1);
});

test("cargo deposits move owned actor stacks, copy world items, reject duplicate drops and honor gear-slot limits", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const hero = f.actor("hero", "Player");
  const supplies = f.item(hero, "supplies", 3, 2);
  const loaded = await storeBoatCargo(boat, supplies);
  assert.ok(loaded);
  assert.equal(hero.items.length, 0);
  assert.equal(boat.items[0].system.quantity, 3);
  assert.equal(await storeBoatCargo(boat, supplies), false);
  const world = f.item(null, "crate", 1, 2);
  assert.ok(await storeBoatCargo(boat, world));
  assert.ok(f.documents.has(world.uuid));
  const tooLarge = f.item(null, "anchor", 1, 3);
  assert.equal(await storeBoatCargo(boat, tooLarge), false);
  assert.equal(boat.items.length, 2);
});

test("Boat cargo card costs and totals match Group Inventory rules on live item models", async () => {
  const cases = [
    { quantity: 3, slots: 2, expected: 6 },
    { quantity: 45, system: { slots: { per_slot: 20, slots_used: 2, free_carry: 1 } }, expected: 4 },
    { quantity: 20, system: { slots: { per_slot: 20, slots_used: 1, free_carry: 1 } }, expected: 0 },
    { slots: 0, expected: 0 },
    { quantity: 3, system: { stashed: true }, expected: 0 },
    { type: "Spell", expected: 0 },
  ];
  for (const [index, { quantity = 1, slots = 1, type, system, expected }] of cases.entries()) {
    const f = fixture();
    const boat = f.actor(`boat-${index}`);
    const item = f.item(boat, "gear", quantity, slots, "Cargo", { type, system });
    const cargo = (await new MKBoatSheet(boat).getData()).mk.cargo;
    assert.equal(cargo.used, expected);
    assert.equal(cargo.items.reduce((sum, card) => sum + card.slots, 0), expected);
    assert.equal(cargo.used, calculateGroupInventorySlots(boat).total);
    assert.equal(item.system.quantity, quantity);
    assert.equal(Object.hasOwn(item.system, "isPhysical"), false);
  }
});

test("stack-aware Boat drops load ordinary stacks and unload only the selected card", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  boat.system.cargoCapacity = 2;
  const hero = f.actor("hero", "Player");
  const arrows = f.item(hero, "arrows", 45, 1, "Arrows", {
    system: { slots: { per_slot: 20, slots_used: 1, free_carry: 1 } },
  });
  const sheet = new MKBoatSheet(boat);
  assert.ok(await sheet._onDrop(f.event({ data: arrows.toDragData() })));
  assert.equal(hero.items.length, 0);
  const cargo = boat.items[0];
  assert.equal(cargo.system.quantity, 45);
  assert.equal((await sheet.getData()).mk.cargo.used, 2);
  assert.deepEqual((await sheet.getData()).mk.cargo.items.map(card => card.quantity), [20, 20, 5]);
  const received = await transferVaultItemToActor(hero, f.payload(boat, cargo));
  assert.equal(received.system.quantity, 20);
  assert.deepEqual(received.system.slots, { per_slot: 20, slots_used: 1, free_carry: 1 });
  assert.equal(cargo.system.quantity, 25);
  assert.equal((await sheet.getData()).mk.cargo.used, 1);
});

test("zero-slot cargo loads and unloads by card at zero capacity without bypassing ownership", async () => {
  for (const options of [{ system: { stashed: true } }, { type: "Spell" }, { system: { slots: { slots_used: 0 } } }]) {
    const f = fixture();
    const boat = f.actor("boat");
    boat.system.cargoCapacity = 0;
    const hero = f.actor("hero", "Player");
    const item = f.item(hero, "gear", 3, 1, "Cargo", options);
    const sheet = new MKBoatSheet(boat);
    assert.ok(await sheet._onDrop(f.event({ data: item.toDragData() })));
    assert.equal(hero.items.length, 0);
    const cargo = boat.items[0];
    assert.equal(cargo.system.quantity, 3);
    assert.equal((await sheet.getData()).mk.cargo.used, 0);
    const unowned = f.actor("other", "Player", false);
    assert.equal(await transferVaultItemToActor(unowned, f.payload(boat, cargo)), null);
    assert.equal(boat.items.length, 1);
    const received = await transferVaultItemToActor(hero, f.payload(boat, cargo));
    assert.equal(received.system.quantity, 1);
    assert.equal(cargo.system.quantity, 2);
    assert.equal(boat.items.length, 1);
  }
});

test("cargo refuses unowned sources and rolls back destination cargo when source removal fails", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const hidden = f.actor("other", "Player", false);
  assert.equal(await storeBoatCargo(boat, f.item(hidden)), false);
  const hero = f.actor("hero", "Player");
  const supplies = f.item(hero);
  hero.deleteEmbeddedDocuments = async () => { throw new Error("delete failed"); };
  await assert.rejects(storeBoatCargo(boat, supplies), /delete failed/);
  assert.equal(boat.items.length, 0);
  assert.equal(hero.items.length, 1);
});

test("discarding cargo removes only the selected card, including from an overloaded hold", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const cargo = f.item(boat, "supply", 3, 2);
  const sheet = new MKBoatSheet(boat);
  boat.system.cargoCapacity = 2;
  assert.equal((await sheet.getData()).mk.cargo.overCapacity, true);
  const oldCard = f.row({ itemId: cargo.id });
  assert.equal(await sheet._onTrashCargoCard(oldCard), true);
  assert.equal(cargo.system.quantity, 2);
  assert.equal(await sheet._onTrashCargoCard(oldCard), false, "A stale card must not discard another item");
  assert.equal(boat.items.length, 1);
  await sheet._onTrashCargoCard(f.row({ itemId: cargo.id }));
  assert.equal((await sheet.getData()).mk.cargo.overCapacity, false);
  await sheet._onTrashCargoCard(f.row({ itemId: cargo.id }));
  assert.equal(boat.items.length, 0);
  assert.equal(f.prompts.length, 3);
});

test("confirmed Boat trash removes only an ordinary, full ammunition, or final partial card", async () => {
  for (const [quantity, perSlot, count] of [[3, 1, 1], [45, 20, 20], [45, 20, 5], [5, 20, 5]]) {
    const f = fixture();
    const boat = f.actor("boat");
    const item = f.item(boat, "cargo", quantity, 1, '<img src=x onerror="bad()">', {
      system: { slots: { per_slot: perSlot, slots_used: 1 } },
    });
    const sheet = new MKBoatSheet(boat);
    assert.equal(await sheet._onTrashCargoCard(f.row({ itemId: item.id, quantity: count })), true);
    if (quantity === count) assert.equal(boat.items.length, 0);
    else assert.equal(item.system.quantity, quantity - count);
    assert.equal(f.prompts.length, 1);
    assert.ok(f.prompts[0].content.includes("&lt;img"));
    assert.ok(f.prompts[0].content.includes(`× ${count}`));
    assert.doesNotMatch(f.prompts[0].content, /<img/);
    assert.equal(f.prompts[0].no.default, true);
    assert.equal(f.prompts[0].yes.label, "Trash Item");
  }
});

test("cancelling Boat trash confirmation leaves all cargo untouched", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "cargo", 3);
  confirmCargo = () => false;
  assert.equal(await new MKBoatSheet(boat)._onTrashCargoCard(f.row({ itemId: item.id })), false);
  assert.equal(item.system.quantity, 3);
  assert.equal(boat.items.length, 1);
});

test("Boat trash rechecks inventory and permissions after confirmation", async () => {
  for (const change of ["quantity", "owner", "editable"]) {
    const f = fixture();
    const boat = f.actor("boat");
    const item = f.item(boat, "cargo", 3);
    const sheet = new MKBoatSheet(boat);
    confirmCargo = () => {
      if (change === "quantity") item.system.quantity = 2;
      if (change === "owner") boat.testUserPermission = () => false;
      if (change === "editable") sheet.isEditable = false;
      return true;
    };
    assert.equal(await sheet._onTrashCargoCard(f.row({ itemId: item.id })), false);
    assert.equal(item.system.quantity, change === "quantity" ? 2 : 3);
    assert.equal(boat.items.length, 1);
    assert.equal(f.warnings.length, 1);
  }
});

test("a card transferred while its trash confirmation is open cannot be removed again", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "cargo", 3);
  const hero = f.actor("hero", "Player");
  let answer;
  confirmCargo = () => new Promise(resolve => { answer = resolve; });
  const trash = new MKBoatSheet(boat)._onTrashCargoCard(f.row({ itemId: item.id }));
  assert.ok(await transferVaultItemToActor(hero, f.payload(boat, item)));
  answer(true);
  assert.equal(await trash, false);
  assert.equal(item.system.quantity, 2);
  assert.equal(hero.items[0].system.quantity, 1);
});

test("editable Boat owners receive the themed native right-click menu while observers cannot trash", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "cargo", 3);
  const sheet = new MKBoatSheet(boat);
  const root = { nodeType: 1 };
  sheet._activateCargoContextMenu([root]);
  assert.equal(cargoMenu.root, root);
  assert.equal(cargoMenu.selector, ".mk-boat-cargo-item[data-cargo-item-id]");
  assert.deepEqual(cargoMenu.options, { jQuery: false, fixed: true });
  assert.equal(cargoMenu.entries.length, 1);
  assert.equal(cargoMenu.entries[0].name, "MK_SHADOWDARK.boat.trashCargo");
  const row = f.row({ itemId: item.id });
  assert.equal(cargoMenu.entries[0].condition(row), true);
  game.settings.get = () => "light";
  const classes = [];
  cargoMenu.instance._setPosition({ classList: { add: (...values) => classes.push(...values) } });
  assert.deepEqual(classes, ["mk-boat-item-context-menu", "mk-themed-sheet", "mk-sheet-theme-light"]);
  sheet.isEditable = false;
  assert.equal(cargoMenu.entries[0].condition(row), false);
  cargoMenu = null;
  sheet._activateCargoContextMenu(root);
  assert.equal(cargoMenu, null);
  assert.equal(await sheet._onTrashCargoCard(row), false);
  assert.equal(f.prompts.length, 0);
  const observer = new MKBoatSheet(f.actor("observer", BOAT_ACTOR_TYPE, false));
  observer._activateCargoContextMenu(root);
  assert.equal(cargoMenu, null);
});

test("cargo drags unload only one card through the existing native and Dashboard transfer path", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const cargo = f.item(boat, "supply", 4, 1);
  const hero = f.actor("hero", "Player");
  const writes = new Map();
  const event = { target: { closest: () => ({ dataset: { cargoItemId: cargo.id, itemQuantity: "1", sourceQuantity: "4" } }) }, dataTransfer: { setData: (key, value) => writes.set(key, value) } };
  new MKBoatSheet(boat)._onDragStart(event);
  assert.equal(event.dataTransfer.effectAllowed, "move");
  const data = JSON.parse(writes.get("text/plain"));
  assert.deepEqual(data["mk-shadowdark"], f.payload(boat, cargo)["mk-shadowdark"]);
  const created = await transferVaultItemToActor(hero, data);
  assert.ok(created);
  assert.equal(boat.items.length, 1);
  assert.equal(cargo.system.quantity, 3);
  assert.equal(hero.items[0].system.quantity, 1);
  assert.equal(await transferVaultItemToActor(hero, data), null);
  assert.equal(handleVaultTransferDrop(boat, {}, data), undefined, "Boat sheet must enforce its cargo capacity itself");
});

test("Boat cards split ordinary quantities and capped ammunition without changing stored items", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const swords = f.item(boat, "swords", 3, 2);
  const arrows = f.item(boat, "arrows", 45, 1, "Arrows", {
    system: { slots: { per_slot: 20, slots_used: 1, free_carry: 1 } },
  });
  const cargo = (await new MKBoatSheet(boat).getData()).mk.cargo;
  assert.deepEqual(cargo.items.filter(card => card.id === swords.id).map(card => [card.quantity, card.slots, card.stackable]),
    [[1, 2, false], [1, 2, false], [1, 2, false]]);
  assert.deepEqual(cargo.items.filter(card => card.id === arrows.id).map(card => [card.quantity, card.stackLimit, card.slots]),
    [[20, 20, 0], [20, 20, 1], [5, 20, 1]]);
  assert.equal(cargo.used, 8);
  assert.equal(swords.system.quantity, 3);
  assert.equal(arrows.system.quantity, 45);
});

test("Boat transfers move one ordinary card, a full ammunition card, or its final partial card", async () => {
  for (const [quantity, perSlot, count] of [[4, 1, 1], [45, 20, 20], [45, 20, 5], [5, 20, 5]]) {
    const f = fixture();
    const boat = f.actor("boat");
    const item = f.item(boat, "cargo", quantity, 1, "Cargo", { system: { slots: { per_slot: perSlot, slots_used: 1 } } });
    const hero = f.actor("hero", "Player");
    const moved = await transferVaultItemToActor(hero, f.payload(boat, item, count));
    assert.equal(moved.system.quantity, count);
    if (quantity === count) assert.equal(boat.items.length, 0);
    else assert.equal(item.system.quantity, quantity - count);
  }
});

test("missing, stale, oversized or malformed Boat card selections never fall back to a full-stack move", async () => {
  for (const selection of [{}, { quantity: 1 }, { quantity: 1, sourceQuantity: 3 },
    { quantity: 2, sourceQuantity: 4 }, { quantity: 0, sourceQuantity: 4 }, { quantity: 1.5, sourceQuantity: 4 }]) {
    const f = fixture();
    const boat = f.actor("boat");
    const cargo = f.item(boat, "cargo", 4);
    const hero = f.actor("hero", "Player");
    const data = f.payload(boat, cargo);
    delete data["mk-shadowdark"].cargoTransfer.quantity;
    delete data["mk-shadowdark"].cargoTransfer.sourceQuantity;
    Object.assign(data["mk-shadowdark"].cargoTransfer, selection);
    assert.equal(await transferVaultItemToActor(hero, data), null);
    assert.equal(handleVaultTransferDrop(hero, {}, data), false, "Cancel native copying even for an invalid selection");
    await queueStoredInventoryMutation(() => {});
    assert.equal(hero.items.length, 0);
    assert.equal(cargo.system.quantity, 4);
  }
});

test("stale Boat cards cannot start a drag", () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "cargo", 3);
  let prevented = false;
  const event = {
    target: { closest: () => ({ dataset: { cargoItemId: item.id, itemQuantity: "1", sourceQuantity: "4" } }) },
    preventDefault() { prevented = true; },
    dataTransfer: { setData() { assert.fail("Stale cards must not produce a draggable item UUID"); } },
  };
  new MKBoatSheet(boat)._onDragStart(event);
  assert.equal(prevented, true);
});

test("Boat-to-Boat and owned Group-to-Boat drops honor the selected amount and destination capacity", async () => {
  for (const sourceType of [BOAT_ACTOR_TYPE, "Player"]) {
    const f = fixture();
    const source = f.actor("source", sourceType);
    const arrows = f.item(source, "arrows", 45, 1, "Arrows", { system: { slots: { per_slot: 20, slots_used: 1 } } });
    const target = f.actor("target");
    target.system.cargoCapacity = 1;
    const payload = sourceType === BOAT_ACTOR_TYPE ? f.payload(source, arrows, 20) : {
      type: "Item", uuid: arrows.uuid, "mk-shadowdark": { groupInventoryTransfer: {
        sourceActorUuid: source.uuid, sourceItemId: arrows.id, quantity: 20, sourceQuantity: 45,
      } },
    };
    assert.ok(await new MKBoatSheet(target)._onDrop(f.event({ data: payload })));
    assert.equal(arrows.system.quantity, 25);
    assert.equal(target.items[0].system.quantity, 20);
    const full = f.actor("full");
    full.system.cargoCapacity = 0;
    assert.equal(await new MKBoatSheet(full)._onDrop(f.event({ data: f.payload(source, arrows, 5) })), false);
    assert.equal(arrows.system.quantity, 25);
    assert.equal(full.items.length, 0);
  }
});

test("Boat card drops into Group Inventory and the Bastion Vault move only the selected contents", async () => {
  for (const kind of ["group", "bastion"]) {
    const f = fixture();
    game.user.isGM = true;
    const boat = f.actor("boat");
    const item = f.item(boat, "arrows", 45, 1, "Arrows", { system: { slots: { per_slot: 20, slots_used: 1 } } });
    const target = f.actor(kind, kind === "group" ? "Player" : "mk-shadowdark.bastion");
    target.getFlag = (_scope, key) => key === "bastion" ? { upgrades: ["vault"] } : key === "isGroup";
    const event = { ...f.event(), stopPropagation() {}, target: { closest: () => null } };
    const data = f.payload(boat, item, 20);
    if (kind === "group") {
      event.data = data;
      await new MKGroupSheet(target)._onDrop(event);
    } else await new MKBastionSheet(target)._onVaultDrop(event, data, { classList: { remove() {} } });
    assert.equal(target.items.length, 1);
    assert.equal(target.items[0].system.quantity, 20);
    assert.equal(item.system.quantity, 25);
  }
});

test("simultaneous drops of one Boat card consume it only once", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "arrows", 45, 1, "Arrows", { system: { slots: { per_slot: 20, slots_used: 1 } } });
  const data = f.payload(boat, item, 20);
  const targets = [f.actor("one", "Player"), f.actor("two", "Player")];
  await Promise.all(targets.map(target => transferVaultItemToActor(target, data)));
  assert.equal(targets.reduce((sum, target) => sum + target.items.length, 0), 1);
  assert.equal(item.system.quantity, 25);
});

test("failed or cancelled partial source updates roll back both unloading and Boat-to-Boat loading", async () => {
  for (const cancel of [false, true]) for (const destination of ["Player", BOAT_ACTOR_TYPE]) {
    const f = fixture();
    const boat = f.actor("boat");
    const item = f.item(boat, "cargo", 4);
    item.update = async () => { if (!cancel) throw new Error("update failed"); };
    const target = f.actor("target", destination);
    const move = destination === "Player" ? transferVaultItemToActor(target, f.payload(boat, item))
      : storeBoatCargo(target, item, { quantity: 1, sourceQuantity: 4 });
    await assert.rejects(move, /update failed|not updated/);
    assert.equal(item.system.quantity, 4);
    assert.equal(target.items.length, 0);
  }
});

test("post-update failures keep a completed card move but source changes during creation roll it back", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const item = f.item(boat, "cargo", 4);
  const target = f.actor("hero", "Player");
  const update = item.update.bind(item);
  item.update = async changes => { await update(changes); throw new Error("post-update hook failed"); };
  assert.ok(await transferVaultItemToActor(target, f.payload(boat, item)));
  assert.equal(item.system.quantity, 3);
  assert.equal(target.items[0].system.quantity, 1);
  const other = f.actor("other", "Player");
  const create = other.createEmbeddedDocuments.bind(other);
  other.createEmbeddedDocuments = async (...args) => {
    const created = await create(...args);
    item.system.quantity = 2;
    return created;
  };
  await assert.rejects(transferVaultItemToActor(other, f.payload(boat, item)), /inventory changed/);
  assert.equal(other.items.length, 0);
  assert.equal(item.system.quantity, 2);
});

test("Boat templates have localized controls and runtime files are covered by release directories", () => {
  const template = readFileSync(new URL("../templates/boat-sheet.hbs", import.meta.url), "utf8");
  for (const [, key] of template.matchAll(/localize ["']([^"']+)["']/g)) assert.ok(translations[key], key);
  for (const tab of ["overview", "crew", "cargo", "notes"]) assert.ok(template.includes(`data-tab="${tab}"`));
  const namedInputs = [...template.matchAll(/<input\b[^>]*\bname="([^"]+)"/g)].map(match => match[1]);
  for (const field of ["name", "system.vesselType", "system.speed", "system.attributes.ac.value",
    "system.attributes.hp.value", "system.attributes.hp.max", "system.crewCapacity", "system.cargoCapacity", "system.passengerCapacity"]) {
    assert.equal(namedInputs.filter(name => name === field).length, 1, `${field} must submit exactly once`);
  }
  assert.ok(template.includes('target="system.notes"'));
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.ok(manifest.esmodules.includes("scripts/boat-sheet/boat-sheet.js"));
  assert.ok(manifest.styles.includes("styles/boat-sheet.css"));
});

test("Command Deck edits save every stored stat and notes without changing crew or cargo", async () => {
  const f = fixture();
  const boat = f.actor("boat");
  const captain = f.actor("captain", "Player");
  boat.system.crew = [{ actorUuid: captain.uuid, name: captain.name, role: "Captain" }];
  f.item(boat, "supplies", 2);
  const crewBefore = structuredClone(boat.system.crew);
  const itemsBefore = boat.items.map(item => item.toObject());
  const fields = {
    name: "Sea Wren", "system.vesselType": "Sloop", "system.speed": "Near (sailing)",
    "system.attributes.ac.value": "14", "system.attributes.hp.value": "28", "system.attributes.hp.max": "40",
    "system.crewCapacity": "10", "system.cargoCapacity": "24", "system.passengerCapacity": "6",
    "system.notes": "<p>Ship's log</p>",
  };
  const sheet = new MKBoatSheet(boat);
  await sheet._updateObject({}, fields);
  assert.equal(boat.name, "Sea Wren");
  assert.equal(boat.system.vesselType, "Sloop");
  assert.equal(boat.system.speed, "Near (sailing)");
  assert.deepEqual(boat.system.attributes, { ac: { value: 14 }, hp: { value: 28, max: 40 } });
  assert.equal(boat.system.crewCapacity, 10);
  assert.equal(boat.system.cargoCapacity, 24);
  assert.equal(boat.system.passengerCapacity, 6);
  assert.equal(boat.system.notes, "<p>Ship's log</p>");
  assert.deepEqual(boat.system.crew, crewBefore);
  assert.deepEqual(boat.items.map(item => item.toObject()), itemsBefore);
  const data = await sheet.getData();
  assert.equal(data.mk.hpPercent, 70);
  assert.equal(data.mk.crew[0].role, "Captain");
  assert.equal(data.mk.cargo.used, 2);
});

test("read-only Command Deck views keep available overview crew and cargo links openable", () => {
  const f = fixture();
  const sheet = new MKBoatSheet(f.actor("boat", BOAT_ACTOR_TYPE, false));
  const openCrew = { dataset: { action: "open-crew" }, closest: () => null };
  const missingCrew = { dataset: { action: "open-crew" }, closest: () => ({}) };
  const openCargo = { dataset: { action: "open-cargo" } };
  const cargoHelp = { dataset: { action: "cargo-help" } };
  const stat = { disabled: false };
  sheet._disableFields({
    controls: [openCrew, missingCrew, openCargo, cargoHelp, stat],
    querySelectorAll: () => [openCrew, missingCrew, openCargo, cargoHelp],
  });
  assert.equal(openCrew.disabled, false);
  assert.equal(openCargo.disabled, false);
  assert.equal(cargoHelp.disabled, false);
  assert.equal(missingCrew.disabled, true);
  assert.equal(stat.disabled, true);
});

test("cargo instructions open in a themed read-only dialog without changing the Boat", async t => {
  const previousApi = foundry.applications.api;
  t.after(() => { foundry.applications.api = previousApi; });
  foundry.applications.api = { DialogV2: class {
    constructor(options) { this.options = options; }
    render(force) { assert.equal(force, true); return this; }
  } };
  const f = fixture();
  const boat = f.actor("boat", BOAT_ACTOR_TYPE, false);
  const sheet = new MKBoatSheet(boat);
  for (const theme of ["dark", "light"]) {
    game.settings.get = () => theme;
    const dialog = await sheet._onCargoHelp(f.event());
    assert.equal(dialog.options.window.title, translations["MK_SHADOWDARK.boat.cargoHelpTitle"]);
    assert.ok(dialog.options.content.includes(translations["MK_SHADOWDARK.boat.cargoHint"]));
    assert.ok(dialog.options.classes.includes(`mk-sheet-theme-${theme}`));
    assert.deepEqual(dialog.options.buttons, [{ action: "close", label: "Close", default: true }]);
  }
  assert.equal(boat.updates.length, 0);
  assert.equal(boat.items.length, 0);
  delete foundry.applications.api;
  assert.equal(await sheet._onCargoHelp(f.event()), null);
});

test("simultaneous local cargo drops transfer a source stack only once", async () => {
  const f = fixture();
  const source = f.actor("hero", "Player");
  const item = f.item(source);
  const boats = [f.actor("first"), f.actor("second")];
  await Promise.all(boats.map(boat => storeBoatCargo(boat, item)));
  assert.equal(boats.reduce((sum, boat) => sum + boat.items.length, 0), 1);
  const sourceBoat = boats.find(boat => boat.items.length);
  const cargo = sourceBoat.items[0];
  const targets = [f.actor("one", "Player"), f.actor("two", "Player")];
  await Promise.all(targets.map(target => transferVaultItemToActor(target, f.payload(sourceBoat, cargo))));
  assert.equal(targets.reduce((sum, target) => sum + target.items.length, 0), 1);
});

test("cancelled source deletion rolls back cargo while post-delete hook errors preserve a completed move", async () => {
  const f = fixture();
  const source = f.actor("hero", "Player");
  const item = f.item(source);
  const boat = f.actor("boat");
  const remove = source.deleteEmbeddedDocuments.bind(source);
  source.deleteEmbeddedDocuments = async () => [];
  await assert.rejects(storeBoatCargo(boat, item), /source Item could not be removed/);
  assert.equal(source.items.length, 1);
  assert.equal(boat.items.length, 0);
  source.deleteEmbeddedDocuments = async (...args) => { await remove(...args); throw new Error("hook failed"); };
  assert.ok(await storeBoatCargo(boat, item));
  assert.equal(source.items.length, 0);
  assert.equal(boat.items.length, 1);
});
