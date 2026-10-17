import test from "node:test";
import assert from "node:assert/strict";
import { getBoatCrewSlots, getGroupData } from "../scripts/group-sheet/activities.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; this.renders = 0; }
  async getData() { return {}; }
  render() { this.renders += 1; }
}

globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } },
  applications: { ux: { TextEditor: { implementation: {
    getDragEventData: event => event.data,
  } } } },
  utils: { deepClone: structuredClone },
};
const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");

function setup(initial = {}) {
  const warnings = [];
  const documents = new Map();
  globalThis.game = { user: { isGM: true }, actors: new Map(), settings: { settings: new Map() } };
  globalThis.CONFIG = {};
  globalThis.ui = { notifications: { warn: message => warnings.push(message), info() {} } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
  let group = structuredClone(initial);
  const saves = [];
  const actor = {
    id: "group", uuid: "Actor.group", items: [], system: {},
    getFlag: () => group,
    async setFlag(scope, key, value) {
      assert.equal(scope, "mk-shadowdark");
      assert.equal(key, "group");
      group = structuredClone(value);
      saves.push(group);
    },
  };
  const sheet = new MKGroupSheet(actor);
  sheet._addItemToGroup = () => { throw new Error("Tab drops must not enter group inventory"); };
  function linkedActor(id, type = "NPC") {
    const doc = {
      id, uuid: `Actor.${id}`, type, documentName: "Actor", name: id, img: `${id}.png`,
      system: { attributes: { hp: { value: 60, max: 80 } } },
      sheet: { opens: 0, render() { this.opens += 1; } },
    };
    documents.set(doc.uuid, doc);
    game.actors.set(id, doc);
    return doc;
  }
  function event(kind, data, selector = "[data-group-actor-kind]") {
    const target = { dataset: { groupActorKind: kind } };
    return {
      preventDefault() {}, data,
      target: { closest: value => value === selector ? target : null },
    };
  }
  function cardEvent(kind, uuid) {
    const row = {
      dataset: { groupActorUuid: uuid },
      closest: () => ({ dataset: { groupActorKind: kind } }),
    };
    return { preventDefault() {}, currentTarget: { closest: () => row } };
  }
  function boatEvent({ boatUuid = "Actor.boat", kind = "crew", uuid = "Actor.sailor", field, value } = {}) {
    const boat = { dataset: { groupActorUuid: boatUuid } };
    const section = { dataset: { boatAssignmentKind: kind }, closest: () => boat };
    const row = { dataset: { boatAssignmentUuid: uuid } };
    const closest = selector => ({
      "[data-group-actor-uuid]": boat,
      "[data-boat-assignment-kind]": section,
      "[data-boat-assignment-uuid]": row,
      "[data-group-actor-kind]": { dataset: { groupActorKind: "boats" } },
    })[selector] ?? null;
    return {
      preventDefault() {},
      data: { type: "Actor", uuid },
      target: { closest },
      currentTarget: { dataset: { boatField: field }, value, closest },
    };
  }
  return { sheet, actor, documents, warnings, saves, linkedActor, event, cardEvent, boatEvent };
}

test("group warband, boat and bastion links normalize safely without changing legacy group data", () => {
  const initial = {
    members: ["Actor.hero"],
    companions: [{ id: "horse", type: "mount", actorUuid: "Actor.horse" }],
    warbands: [null, " Actor.warband ", "Actor.warband", "", 7, "Actor.secondWarband"],
    boats: [" Actor.boat ", "Actor.boat", null, 7, "", "Actor.second"],
    bastions: "Actor.keep",
    assignments: { marker: "preserved" },
  };
  const f = setup(initial);
  const data = getGroupData(f.actor);
  assert.deepEqual(data.boats, ["Actor.boat", "Actor.second"]);
  assert.deepEqual(data.warbands, ["Actor.warband", "Actor.secondWarband"]);
  assert.deepEqual(data.bastions, []);
  assert.deepEqual(data.members, ["Actor.hero"]);
  assert.deepEqual(data.activeMembers, ["Actor.hero"]);
  assert.equal(data.companions[0].actorUuid, "Actor.horse");
  assert.deepEqual(data.assignments, initial.assignments);
  assert.deepEqual(f.actor.getFlag(), initial, "reading does not mutate persisted flags");
  assert.deepEqual(getGroupData({ getFlag: () => data }), data);
  assert.deepEqual(getGroupData({ getFlag: () => ({}) }).boats, []);
  assert.deepEqual(getGroupData({ getFlag: () => ({}) }).warbands, []);
  assert.deepEqual(getGroupData({ getFlag: () => ({ warbands: "Actor.warband" }) }).warbands, []);
});

test("actor drops link boats and bastions, keeping their original documents", async () => {
  const f = setup({ members: ["Actor.hero"] });
  const boat = f.linkedActor("boat");
  const bastion = f.linkedActor("keep", "mk-shadowdark.bastion");
  await f.sheet._onDrop(f.event("boats", { type: "Actor", uuid: boat.uuid }));
  await f.sheet._onDrop(f.event("bastions", { type: "Actor", id: bastion.id }));
  const data = getGroupData(f.actor);
  assert.deepEqual(data.boats, [boat.uuid]);
  assert.deepEqual(data.bastions, [bastion.uuid]);
  assert.deepEqual(data.members, ["Actor.hero"]);
  assert.equal(data.companions.length, 0);
  assert.equal(f.documents.get(boat.uuid), boat);
  assert.equal(f.documents.get(bastion.uuid), bastion);
  assert.equal(f.sheet.renders, 2);
});

test("repeat actor and token drops share one boat link", async () => {
  const f = setup();
  const boat = f.linkedActor("boat");
  const tokenUuid = "Scene.harbor.Token.boat";
  f.documents.set(tokenUuid, { documentName: "Token", actor: boat });
  await f.sheet._onDrop(f.event("boats", { type: "Actor", uuid: boat.uuid }));
  await f.sheet._onDrop(f.event("boats", { type: "Token", uuid: tokenUuid }));
  assert.deepEqual(getGroupData(f.actor).boats, [boat.uuid]);
  assert.equal(f.saves.length, 1);
});

test("boat and bastion tabs reject wrong actor types and item drops", async () => {
  const f = setup();
  const hero = f.linkedActor("hero", "Player");
  const boat = f.linkedActor("boat");
  const bastion = f.linkedActor("keep", "mk-shadowdark.bastion");
  await f.sheet._onDrop(f.event("boats", { type: "Actor", uuid: hero.uuid }));
  await f.sheet._onDrop(f.event("boats", { type: "Actor", uuid: bastion.uuid }));
  await f.sheet._onDrop(f.event("bastions", { type: "Actor", uuid: boat.uuid }));
  await f.sheet._onDrop(f.event("boats", { type: "Item", uuid: "Item.boat" }));
  await f.sheet._onDrop(f.event("bastions", { type: "Item", uuid: "Item.keep" }));
  assert.equal(f.saves.length, 0);
  assert.equal(f.warnings.length, 5);
});

test("only an editable GM group can add or remove actor links", async () => {
  const f = setup({ boats: ["Actor.boat"] });
  const boat = f.linkedActor("boat");
  game.user.isGM = false;
  assert.equal(await f.sheet._addGroupActorLink("boats", boat), false);
  assert.equal(await f.sheet._onRemoveGroupActor(f.cardEvent("boats", boat.uuid)), false);
  game.user.isGM = true;
  f.sheet.isEditable = false;
  assert.equal(await f.sheet._addGroupActorLink("boats", boat), false);
  assert.equal(await f.sheet._onRemoveGroupActor(f.cardEvent("boats", boat.uuid)), false);
  assert.deepEqual(getGroupData(f.actor).boats, [boat.uuid]);
  assert.equal(f.saves.length, 0);
});

test("linked cards use live actor data and keep missing links removable", async () => {
  const f = setup({ boats: ["Actor.boat", "Actor.missing", "Actor.hidden", "Compendium.deleted.boat"] });
  const boat = f.linkedActor("boat");
  boat.name = "The New Name";
  boat.img = "new-boat.webp";
  f.linkedActor("hidden").visible = false;
  globalThis.fromUuid = async uuid => {
    if (uuid.startsWith("Compendium.")) throw new Error("Pack deleted");
    return f.documents.get(uuid);
  };
  const cards = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(cards[0].name, "The New Name");
  assert.equal(cards[0].img, "new-boat.webp");
  assert.equal(cards[0].available, true);
  assert.ok(cards.slice(1).every(card => !card.available && card.name === "Unavailable boat"));
  await f.sheet._onRemoveGroupActor(f.cardEvent("boats", "Compendium.deleted.boat"));
  assert.ok(!getGroupData(f.actor).boats.includes("Compendium.deleted.boat"));
});

test("opening and unlinking cards preserves actors and other group links", async () => {
  const f = setup({ boats: ["Actor.boat"], bastions: ["Actor.keep"] });
  const boat = f.linkedActor("boat");
  const bastion = f.linkedActor("keep", "mk-shadowdark.bastion");
  await f.sheet._onOpenGroupActor(f.cardEvent("boats", boat.uuid));
  await f.sheet._onOpenGroupActor(f.cardEvent("bastions", bastion.uuid));
  assert.equal(boat.sheet.opens, 1);
  assert.equal(bastion.sheet.opens, 1);
  await f.sheet._onRemoveGroupActor(f.cardEvent("bastions", bastion.uuid));
  assert.deepEqual(getGroupData(f.actor).bastions, []);
  assert.deepEqual(getGroupData(f.actor).boats, [boat.uuid]);
  assert.equal(f.documents.get(bastion.uuid), bastion);
});

test("warband actor and token drops share one link, open the NPC sheet and unlink without changing boat assignments", async () => {
  const f = setup({ boats: ["Actor.boat"], boatAssignments: [
    { actorUuid: "Actor.boat", warbands: [{ actorUuid: "Actor.warband", quantity: 2 }] },
  ] });
  const warband = f.linkedActor("warband");
  const tokenUuid = "Scene.field.Token.warband";
  f.documents.set(tokenUuid, { documentName: "Token", actor: warband });
  await f.sheet._onDrop(f.event("warbands", { type: "Actor", uuid: warband.uuid }));
  await f.sheet._onDrop(f.event("warbands", { type: "Token", uuid: tokenUuid }));
  assert.deepEqual(getGroupData(f.actor).warbands, [warband.uuid]);
  assert.equal(f.saves.length, 1);
  await f.sheet._onOpenGroupActor(f.cardEvent("warbands", warband.uuid));
  assert.equal(warband.sheet.opens, 1);
  await f.sheet._onRemoveGroupActor(f.cardEvent("warbands", warband.uuid));
  const data = getGroupData(f.actor);
  assert.deepEqual(data.warbands, []);
  assert.deepEqual(data.boats, ["Actor.boat"]);
  assert.deepEqual(data.boatAssignments[0].warbands, [{ actorUuid: warband.uuid, quantity: 2 }]);
  assert.equal(f.documents.get(warband.uuid), warband);
});

test("the Warbands tab rejects player characters, Bastions and items, and remains editable only by the GM", async () => {
  const f = setup();
  const warband = f.linkedActor("warband");
  const hero = f.linkedActor("hero", "Player");
  const bastion = f.linkedActor("keep", "mk-shadowdark.bastion");
  for (const actor of [hero, bastion]) {
    await f.sheet._onDrop(f.event("warbands", { type: "Actor", uuid: actor.uuid }));
  }
  await f.sheet._onDrop(f.event("warbands", { type: "Item", uuid: "Item.warband" }));
  for (const [isGM, isEditable] of [[false, true], [true, false]]) {
    game.user.isGM = isGM;
    f.sheet.isEditable = isEditable;
    assert.equal(await f.sheet._addGroupActorLink("warbands", warband), false);
    assert.equal(await f.sheet._onRemoveGroupActor(f.cardEvent("warbands", warband.uuid)), false);
  }
  assert.deepEqual(getGroupData(f.actor).warbands, []);
  assert.equal(f.saves.length, 0);
});

test("the Warbands tab receives live cards and keeps missing NPC links removable", async () => {
  const f = setup({ warbands: ["Actor.warband", "Actor.hidden", "Actor.missing"] });
  const warband = f.linkedActor("warband");
  warband.name = "Iron Company";
  warband.img = "company.webp";
  f.linkedActor("hidden").visible = false;
  const { mk } = await f.sheet.getData();
  assert.equal(mk.warbands.hasEntries, true);
  assert.deepEqual(mk.warbands.entries[0], {
    uuid: warband.uuid, name: "Iron Company", img: "company.webp", available: true,
  });
  assert.ok(mk.warbands.entries.slice(1).every(card => !card.available && card.name === "Unavailable warband"));
  await f.sheet._onRemoveGroupActor(f.cardEvent("warbands", "Actor.missing"));
  assert.deepEqual(getGroupData(f.actor).warbands, ["Actor.warband", "Actor.hidden"]);
});

test("boat assignments normalize old flags, quantities and missing boats without changing stored data", () => {
  const initial = {
    boats: ["Actor.boat", "Actor.second"],
    boatAssignments: [
      null,
      { actorUuid: "Actor.removed", captainName: "Old captain" },
      {
        actorUuid: "Actor.boat", captainName: "  Captain Ash  ",
        crew: [null, { actorUuid: 7 }, { actorUuid: "Actor.boat" }, { actorUuid: " Actor.sailor ", quantity: 2.9 }, { actorUuid: "Actor.sailor", quantity: 9 }],
        warbands: [{ actorUuid: "Actor.warband", quantity: -2 }, { actorUuid: "Actor.other", quantity: "Infinity" }],
      },
    ],
  };
  const f = setup(initial);
  const data = getGroupData(f.actor);
  assert.deepEqual(data.boatAssignments, [
    {
      actorUuid: "Actor.boat", captainName: "Captain Ash",
      crew: [{ actorUuid: "Actor.sailor", quantity: 2 }],
      warbands: [{ actorUuid: "Actor.warband", quantity: 1 }, { actorUuid: "Actor.other", quantity: 1 }],
    },
    { actorUuid: "Actor.second", captainName: "", crew: [], warbands: [] },
  ]);
  assert.equal(getBoatCrewSlots(data.boatAssignments[0]), 42);
  assert.deepEqual(getGroupData({ getFlag: () => data }), data);
  assert.deepEqual(f.actor.getFlag(), initial);
  assert.deepEqual(getGroupData({ getFlag: () => ({ boats: ["Actor.legacy"], boatAssignments: "bad" }) }).boatAssignments, [
    { actorUuid: "Actor.legacy", captainName: "", crew: [], warbands: [] },
  ]);
});

test("NPC and token drops assign crew and warbands to the boat instead of linking more boats", async () => {
  const f = setup({ boats: ["Actor.boat"], members: ["Actor.hero"] });
  f.linkedActor("boat");
  const sailor = f.linkedActor("sailor");
  const warband = f.linkedActor("warband");
  await f.sheet._onDrop(f.boatEvent());
  const tokenEvent = f.boatEvent({ kind: "warbands", uuid: "Scene.harbor.Token.warband" });
  tokenEvent.data.type = "Token";
  f.documents.set(tokenEvent.data.uuid, { documentName: "Token", actor: warband });
  await f.sheet._onDrop(tokenEvent);
  await f.sheet._onDrop(f.boatEvent());
  const data = getGroupData(f.actor);
  assert.deepEqual(data.boats, ["Actor.boat"]);
  assert.deepEqual(data.members, ["Actor.hero"]);
  assert.deepEqual(data.boatAssignments[0].crew, [{ actorUuid: sailor.uuid, quantity: 1 }]);
  assert.deepEqual(data.boatAssignments[0].warbands, [{ actorUuid: warband.uuid, quantity: 1 }]);
  assert.equal(getBoatCrewSlots(data.boatAssignments[0]), 21);
  assert.equal(f.saves.length, 2);
});

test("captain and assignment quantities persist per boat and opening or unassigning preserves the NPC", async () => {
  const f = setup({ boats: ["Actor.boat", "Actor.second"], bastions: ["Actor.keep"] });
  f.linkedActor("boat");
  const sailor = f.linkedActor("sailor");
  const warband = f.linkedActor("warband");
  await f.sheet._addBoatAssignment("Actor.boat", "crew", sailor);
  await f.sheet._addBoatAssignment("Actor.boat", "warbands", warband);
  await f.sheet._onChangeBoat(f.boatEvent({ field: "captainName", value: "  Captain Ash  " }));
  await f.sheet._onChangeBoat(f.boatEvent({ field: "quantity", value: "7" }));
  await f.sheet._onChangeBoat(f.boatEvent({ kind: "warbands", uuid: warband.uuid, field: "quantity", value: "2" }));
  let data = getGroupData(f.actor);
  assert.equal(data.boatAssignments[0].captainName, "Captain Ash");
  assert.equal(getBoatCrewSlots(data.boatAssignments[0]), 47);
  assert.deepEqual(data.boatAssignments[1], { actorUuid: "Actor.second", captainName: "", crew: [], warbands: [] });
  assert.deepEqual(data.bastions, ["Actor.keep"]);
  await f.sheet._onOpenBoatAssignment(f.boatEvent());
  assert.equal(sailor.sheet.opens, 1);
  await f.sheet._onRemoveBoatAssignment(f.boatEvent());
  assert.equal(getGroupData(f.actor).boatAssignments[0].crew.length, 0);
  assert.equal(f.documents.get(sailor.uuid), sailor);
  await f.sheet._onChangeBoat(f.boatEvent({ field: "captainName", value: "" }));
  assert.equal(getGroupData(f.actor).boatAssignments[0].captainName, "");
  await f.sheet._onRemoveGroupActor(f.cardEvent("boats", "Actor.boat"));
  data = getGroupData(f.actor);
  assert.deepEqual(data.boats, ["Actor.second"]);
  assert.equal(data.boatAssignments.length, 1);
  assert.equal(data.boatAssignments[0].actorUuid, "Actor.second");
  assert.equal(f.documents.get(warband.uuid), warband);
});

test("crew capacity uses maximum ship HP, ignores damage and counts 20 slots per warband", async () => {
  const f = setup({ boats: ["Actor.boat"] });
  const boat = f.linkedActor("boat");
  const warband = f.linkedActor("warband");
  await f.sheet._addBoatAssignment(boat.uuid, "warbands", warband);
  const quantityEvent = value => f.boatEvent({ kind: "warbands", uuid: warband.uuid, field: "quantity", value });
  assert.equal(await f.sheet._onChangeBoat(quantityEvent("4")), true);
  assert.equal(await f.sheet._onChangeBoat(quantityEvent("5")), false);
  const sailor = f.linkedActor("sailor");
  assert.equal(await f.sheet._addBoatAssignment(boat.uuid, "crew", sailor), false);
  let [card] = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(card.crewSlotsUsed, 80);
  assert.equal(card.crewSlotCapacity, 80);
  assert.equal(card.crewSlotsRemaining, 0);
  boat.system.attributes.hp.value = 0;
  [card] = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(card.crewSlotCapacity, 80, "damage does not reduce crew capacity");
  assert.equal(card.overCapacity, false);
  boat.system.attributes.hp.max = 10;
  [card] = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(card.overCapacity, true);
  assert.equal(card.crewSlotsOver, 70);
  assert.equal(card.assignmentSections[1].entries[0].quantity, 4, "maximum HP changes do not delete assigned actors");
  assert.equal(await f.sheet._onChangeBoat(quantityEvent("2")), true, "decreases can resolve excess in steps");
  assert.equal(await f.sheet._onChangeBoat(quantityEvent("3")), false);
  boat.system.attributes.hp.max = 40;
  [card] = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(card.overCapacity, false);
  assert.equal(card.crewSlotCapacity, 40);
  assert.equal(f.warnings.length, 3);
});

test("boat assignment mutations reject non-NPCs, items, self links, unknown boats and invalid quantities", async () => {
  const f = setup({ boats: ["Actor.boat"] });
  const boat = f.linkedActor("boat");
  const hero = f.linkedActor("hero", "Player");
  const sailor = f.linkedActor("sailor");
  const bastion = f.linkedActor("keep", "mk-shadowdark.bastion");
  for (const actor of [boat, hero, bastion, null]) {
    assert.equal(await f.sheet._addBoatAssignment(boat.uuid, "crew", actor), false);
  }
  const itemEvent = f.boatEvent();
  itemEvent.data = { type: "Item", uuid: "Item.crew" };
  await f.sheet._onDrop(itemEvent);
  assert.equal(await f.sheet._addBoatAssignment("Actor.missing", "crew", sailor), false);
  assert.equal(await f.sheet._addBoatAssignment(boat.uuid, "bastions", sailor), false);
  assert.equal(f.saves.length, 0);
  await f.sheet._addBoatAssignment(boat.uuid, "crew", sailor);
  for (const value of ["", "-2", "0", "1.5", "NaN", "Infinity"]) {
    assert.equal(await f.sheet._onChangeBoat(f.boatEvent({ field: "quantity", value })), false);
  }
  assert.equal(f.saves.length, 1);
  assert.equal(getGroupData(f.actor).boatAssignments[0].crew[0].quantity, 1);
});

test("only an editable GM can manage crew, warbands and captain names", async () => {
  const f = setup({ boats: ["Actor.boat"], boatAssignments: [
    { actorUuid: "Actor.boat", captainName: "Ash", crew: [{ actorUuid: "Actor.sailor", quantity: 1 }] },
  ] });
  f.linkedActor("boat");
  const warband = f.linkedActor("warband");
  for (const [isGM, isEditable] of [[false, true], [true, false]]) {
    game.user.isGM = isGM;
    f.sheet.isEditable = isEditable;
    assert.equal(await f.sheet._addBoatAssignment("Actor.boat", "warbands", warband), false);
    assert.equal(await f.sheet._onChangeBoat(f.boatEvent({ field: "captainName", value: "Other" })), false);
    assert.equal(await f.sheet._onChangeBoat(f.boatEvent({ field: "quantity", value: "2" })), false);
    assert.equal(await f.sheet._onRemoveBoatAssignment(f.boatEvent()), false);
  }
  assert.equal(f.saves.length, 0);
  assert.equal(getGroupData(f.actor).boatAssignments[0].captainName, "Ash");
});

test("zero maximum HP or unavailable boats reject more crew while existing assignments can be reduced or removed", async () => {
  const f = setup({ boats: ["Actor.boat", "Compendium.deleted.boat"], boatAssignments: [
    { actorUuid: "Compendium.deleted.boat", crew: [{ actorUuid: "Actor.sailor", quantity: 2 }] },
  ] });
  const boat = f.linkedActor("boat");
  boat.system.attributes.hp.max = 0;
  const sailor = f.linkedActor("sailor");
  const warband = f.linkedActor("warband");
  globalThis.fromUuid = async uuid => {
    if (uuid.startsWith("Compendium.")) throw new Error("Pack deleted");
    return f.documents.get(uuid);
  };
  assert.equal(await f.sheet._addBoatAssignment(boat.uuid, "crew", sailor), false);
  assert.equal(await f.sheet._addBoatAssignment("Compendium.deleted.boat", "warbands", warband), false);
  assert.equal(await f.sheet._onChangeBoat(f.boatEvent({ boatUuid: "Compendium.deleted.boat", field: "quantity", value: "3" })), false);
  assert.equal(await f.sheet._onChangeBoat(f.boatEvent({ boatUuid: "Compendium.deleted.boat", field: "quantity", value: "1" })), true);
  assert.equal(await f.sheet._onRemoveBoatAssignment(f.boatEvent({ boatUuid: "Compendium.deleted.boat" })), true);
  assert.equal(getGroupData(f.actor).boatAssignments[1].crew.length, 0);
});

test("boat cards use live assignment names and leave missing or hidden NPCs removable and counted", async () => {
  const f = setup({ boats: ["Actor.boat"], boatAssignments: [
    { actorUuid: "Actor.boat", crew: [{ actorUuid: "Actor.sailor", quantity: 2 }, { actorUuid: "Actor.hidden", quantity: 1 }],
      warbands: [{ actorUuid: "Compendium.deleted.warband", quantity: 1 }] },
  ] });
  f.linkedActor("boat");
  const sailor = f.linkedActor("sailor");
  sailor.name = "New sailor name";
  f.linkedActor("hidden").visible = false;
  globalThis.fromUuid = async uuid => {
    if (uuid.startsWith("Compendium.")) throw new Error("Pack deleted");
    return f.documents.get(uuid);
  };
  const [card] = await f.sheet._buildGroupActorLinks(getGroupData(f.actor), "boats");
  assert.equal(card.assignmentSections[0].entries[0].name, "New sailor name");
  assert.equal(card.assignmentSections[0].entries[1].available, false);
  assert.equal(card.assignmentSections[1].entries[0].available, false);
  assert.equal(card.crewSlotsUsed, 23);
  await f.sheet._onOpenBoatAssignment(f.boatEvent({ uuid: "Actor.hidden" }));
  assert.equal(f.documents.get("Actor.hidden").sheet.opens, 0);
  await f.sheet._onRemoveBoatAssignment(f.boatEvent({ kind: "warbands", uuid: "Compendium.deleted.warband" }));
  assert.equal(getBoatCrewSlots(getGroupData(f.actor).boatAssignments[0]), 3);
});
