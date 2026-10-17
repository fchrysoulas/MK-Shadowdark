import test from "node:test";
import assert from "node:assert/strict";
import { getGroupData } from "../scripts/group-sheet/activities.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; this.renders = 0; }
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
  globalThis.game = { user: { isGM: true }, actors: new Map() };
  globalThis.ui = { notifications: { warn: message => warnings.push(message), info() {} } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
  let group = structuredClone(initial);
  const saves = [];
  const actor = {
    id: "group", uuid: "Actor.group",
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
  return { sheet, actor, documents, warnings, saves, linkedActor, event, cardEvent };
}

test("group boat and bastion links normalize safely without changing legacy group data", () => {
  const initial = {
    members: ["Actor.hero"],
    companions: [{ id: "horse", type: "mount", actorUuid: "Actor.horse" }],
    boats: [" Actor.boat ", "Actor.boat", null, 7, "", "Actor.second"],
    bastions: "Actor.keep",
    assignments: { marker: "preserved" },
  };
  const f = setup(initial);
  const data = getGroupData(f.actor);
  assert.deepEqual(data.boats, ["Actor.boat", "Actor.second"]);
  assert.deepEqual(data.bastions, []);
  assert.deepEqual(data.members, ["Actor.hero"]);
  assert.deepEqual(data.activeMembers, ["Actor.hero"]);
  assert.equal(data.companions[0].actorUuid, "Actor.horse");
  assert.deepEqual(data.assignments, initial.assignments);
  assert.deepEqual(f.actor.getFlag(), initial, "reading does not mutate persisted flags");
  assert.deepEqual(getGroupData({ getFlag: () => data }), data);
  assert.deepEqual(getGroupData({ getFlag: () => ({}) }).boats, []);
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
