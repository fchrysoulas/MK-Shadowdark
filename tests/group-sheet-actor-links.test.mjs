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

test("Summary lists group companions, linked assets and boat assignments without saving flags", async () => {
  const f = setup({
    members: ["Actor.hero", "Actor.resting"], activeMembers: ["Actor.hero"],
    companions: [
      { id: "porter", type: "hireling", name: "Porter", background: "Sailor", ownerUuid: "Actor.resting", carrySlots: 8 },
      { id: "horse", type: "mount", name: "Horse", riderUuid: "Actor.hero", strengthBonus: 3, hpValue: 9, hpMax: 12 },
    ],
    warbands: ["Actor.warband"], boats: ["Actor.boat"], bastions: ["Actor.keep"],
    boatAssignments: [{ actorUuid: "Actor.boat", captainName: "Ash", crew: [{ actorUuid: "Actor.sailor", quantity: 4 }], warbands: [{ actorUuid: "Actor.warband", quantity: 2 }] }],
  });
  f.linkedActor("hero", "Player");
  f.linkedActor("resting", "Player");
  const warband = f.linkedActor("warband");
  f.linkedActor("boat");
  f.linkedActor("keep", "mk-shadowdark.bastion");
  f.linkedActor("sailor");
  f.actor.items.push({ id: "rope", name: "Rope", type: "Basic", system: { quantity: 2, slots: 1 } });
  f.actor.system.coins = { gp: 12, sp: 3, cp: 1 };
  const before = structuredClone(f.actor.getFlag());
  const { mk } = await f.sheet.getData();
  const categories = new Map(mk.assets.categories.map(category => [category.label, category]));
  assert.deepEqual([...categories.keys()], ["Hirelings", "Warbands", "Mounts", "Boats", "Bastions"]);
  assert.match(categories.get("Hirelings").entries[0].detail, /Sailor · Owner: resting · 8 carry slots/);
  assert.match(categories.get("Mounts").entries[0].detail, /Rider: hero · 5 free slots · HP 9\/12/);
  assert.match(categories.get("Boats").entries[0].detail, /Captain: Ash · 44\/80 crew slots/);
  assert.deepEqual(categories.get("Boats").entries[0].assignments, [
    { label: "Crew", text: "sailor × 4" }, { label: "Warbands", text: "warband × 2" },
  ]);
  for (const label of ["Hirelings", "Warbands", "Mounts", "Boats", "Bastions"]) {
    assert.equal(categories.get(label).count, 1);
    assert.ok(categories.get(label).tab);
  }
  assert.deepEqual(mk.inventory.coins, { gp: 12, sp: 3, cp: 1 });
  warband.name = "New warband name";
  const refreshed = new Map((await f.sheet.getData()).mk.assets.categories.map(category => [category.label, category]));
  assert.equal(refreshed.get("Warbands").entries[0].name, "New warband name");
  assert.match(refreshed.get("Boats").entries[0].assignments[1].text, /New warband name × 2/);
  assert.equal(f.saves.length, 0);
  assert.deepEqual(f.actor.getFlag(), before);
});

test("Summary handles empty groups and unavailable asset links for observers", async () => {
  const empty = setup();
  assert.ok((await empty.sheet.getData()).mk.assets.categories.every(category => category.count === 0));
  const f = setup({ warbands: ["Actor.hidden"], boats: ["Actor.missing"], bastions: ["Actor.keep"] });
  f.linkedActor("hidden").visible = false;
  f.linkedActor("keep", "mk-shadowdark.bastion").visible = false;
  game.user.isGM = false;
  f.sheet.isEditable = false;
  const { mk } = await f.sheet.getData();
  assert.equal(mk.canEditGroup, false);
  for (const category of mk.assets.categories.filter(entry => ["warbands", "boats", "bastions"].includes(entry.tab))) {
    assert.equal(category.count, 1);
    assert.equal(category.entries[0].available, false);
    assert.match(category.entries[0].name, /^Unavailable/);
    assert.equal(category.entries[0].img, "icons/svg/mystery-man.svg");
  }
  assert.equal(f.saves.length, 0);
});

test("Summary payroll charges each hireling 1 gp and each group-linked warband 3 gp per level weekly", async () => {
  const f = setup({
    companions: [
      { id: "porter", name: "Porter", carrySlots: 8 },
      { id: "cook", name: "Cook", ownerUuid: "Actor.absent" },
      { id: "horse", type: "mount", strengthBonus: 3 },
    ],
    warbands: ["Actor.first", "Actor.second", "Actor.first"],
    boats: ["Actor.boat"],
    boatAssignments: [{ actorUuid: "Actor.boat", warbands: [
      { actorUuid: "Actor.first", quantity: 2 },
      { actorUuid: "Actor.shipOnly", quantity: 3 },
    ] }],
  });
  f.linkedActor("first").system.level = { value: 1 };
  const second = f.linkedActor("second");
  second.system.level = { value: "3" };
  f.linkedActor("shipOnly").system.level = { value: 5 };
  f.linkedActor("outside").system.level = { value: 10 };
  f.linkedActor("boat");
  f.actor.system.coins = { gp: 100, sp: 0, cp: 0 };
  const before = structuredClone(f.actor.getFlag());
  const { mk } = await f.sheet.getData();
  assert.deepEqual(mk.assets.wages, { hirelings: 2, warbands: 12, total: 14, incomplete: false });
  const hirelings = mk.assets.categories.find(category => category.tab === "hirelings");
  assert.ok(hirelings.entries.every(entry => entry.detail.includes("1 gp/week")));
  const warbands = mk.assets.categories.find(category => category.tab === "warbands");
  assert.deepEqual(warbands.entries.map(entry => entry.weeklyWages), [3, 9]);
  assert.equal(warbands.entries[1].detail, "Level 3 · 9 gp/week");
  second.system.level.value = 4;
  assert.equal((await f.sheet.getData()).mk.assets.wages.total, 17);
  assert.deepEqual(f.actor.system.coins, { gp: 100, sp: 0, cp: 0 }, "displaying payroll never deducts money");
  assert.deepEqual(f.actor.getFlag(), before);
  assert.equal(f.saves.length, 0);
  await f.sheet._onRemoveGroupActor(f.cardEvent("warbands", second.uuid));
  assert.equal((await f.sheet.getData()).mk.assets.wages.total, 5);
});

test("Summary payroll marks missing actors and invalid levels as incomplete while allowing level zero", async () => {
  const invalidLevels = [undefined, null, "", " ", "unknown", -1, 1.5, Infinity];
  const f = setup({
    warbands: ["Actor.zero", "Actor.valid", "Actor.missing", "Actor.hidden", ...invalidLevels.map((_, index) => `Actor.invalid${index}`)],
  });
  f.linkedActor("zero").system.level = { value: 0 };
  f.linkedActor("valid").system.level = { value: 2 };
  const hidden = f.linkedActor("hidden");
  hidden.system.level = { value: 9 };
  hidden.visible = false;
  invalidLevels.forEach((value, index) => { f.linkedActor(`invalid${index}`).system.level = { value }; });
  const { mk } = await f.sheet.getData();
  assert.deepEqual(mk.assets.wages, { hirelings: 0, warbands: 6, total: 6, incomplete: true });
  const warbands = mk.assets.categories.find(category => category.tab === "warbands");
  assert.equal(warbands.entries[0].weeklyWages, 0);
  assert.equal(warbands.entries[0].hasWages, true);
  assert.ok(warbands.entries.slice(2).every(entry => entry.weeklyWages === null && entry.detail === "Wages unavailable"));
  assert.equal(f.saves.length, 0);
});

test("an empty group's Summary has zero weekly payroll", async () => {
  const f = setup();
  assert.deepEqual((await f.sheet.getData()).mk.assets.wages, { hirelings: 0, warbands: 0, total: 0, incomplete: false });
});

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
  const { uuid, name, img, available } = mk.warbands.entries[0];
  assert.deepEqual({ uuid, name, img, available }, {
    uuid: warband.uuid, name: "Iron Company", img: "company.webp", available: true,
  });
  assert.ok(mk.warbands.entries.slice(1).every(card => !card.available && card.name === "Unavailable warband"));
  await f.sheet._onRemoveGroupActor(f.cardEvent("warbands", "Actor.missing"));
  assert.deepEqual(getGroupData(f.actor).warbands, ["Actor.warband", "Actor.hidden"]);
});

test("unassigned warbands follow the group and their cards reflect live level, AC and HP", async () => {
  const f = setup({ warbands: ["Actor.guards"] });
  const guards = f.linkedActor("guards");
  guards.system.level = { value: 0 };
  guards.system.attributes.ac = { value: 14 };
  guards.system.attributes.hp = { value: 18, max: 24 };
  let data = (await f.sheet.getData()).mk.warbands;
  assert.deepEqual(data.counts, { following: 1, boat: 0, bastion: 0, unknown: 0 });
  assert.equal(data.entries[0].deployments[0].label, "Following the group");
  assert.equal(data.entries[0].levelLabel, 0);
  assert.equal(data.entries[0].acLabel, 14);
  assert.deepEqual(data.entries[0].hp, { known: true, value: 18, max: 24, percent: 75 });
  guards.system.level.value = 2;
  guards.system.attributes.hp.value = -5;
  data = (await f.sheet.getData()).mk.warbands;
  assert.equal(data.entries[0].levelLabel, 2);
  assert.equal(data.entries[0].hp.percent, 0);
  guards.system.attributes.hp.value = 30;
  assert.equal((await f.sheet.getData()).mk.warbands.entries[0].hp.percent, 100);
  assert.equal(f.saves.length, 0);
});

test("warband cards read boat and bastion assignments, keep one card per owned warband and show every destination", async () => {
  const f = setup({
    warbands: ["Actor.following", "Actor.sailors", "Actor.guards", "Actor.split"],
    boats: ["Actor.boat"], bastions: ["Actor.keep"],
    boatAssignments: [{ actorUuid: "Actor.boat", warbands: [
      { actorUuid: "Actor.sailors", quantity: 2 }, { actorUuid: "Actor.split", quantity: 1 },
      { actorUuid: "Actor.outside", quantity: 8 },
    ] }],
  });
  for (const id of ["following", "sailors", "guards", "split", "outside"]) f.linkedActor(id);
  const boat = f.linkedActor("boat");
  const keep = f.linkedActor("keep", "mk-shadowdark.bastion");
  const state = { defenses: { warbands: [
    { uuid: "Actor.guards", quantity: 3, notes: "Legacy link" },
    { actorUuid: "Actor.guards", quantity: 1 },
    { actorUuid: "Actor.split", quantity: 2 },
    { actorUuid: "Actor.outside", quantity: 5 },
  ] } };
  keep.getFlag = (scope, key) => { assert.equal(scope, "mk-shadowdark"); assert.equal(key, "bastion"); return state; };
  const groupBefore = structuredClone(f.actor.getFlag());
  const bastionBefore = structuredClone(state);
  const { mk } = await f.sheet.getData();
  const entries = new Map(mk.warbands.entries.map(entry => [entry.uuid, entry]));
  assert.equal(mk.warbands.count, 4);
  assert.equal(entries.size, 4);
  assert.equal(entries.has("Actor.outside"), false, "assignment records do not create group ownership");
  assert.deepEqual(mk.warbands.counts, { following: 1, boat: 2, bastion: 2, unknown: 0 });
  assert.equal(entries.get("Actor.sailors").deployments[0].label, "Boat: boat × 2");
  assert.equal(entries.get("Actor.guards").deployments[0].label, "Bastion: keep × 4");
  assert.deepEqual(entries.get("Actor.split").deployments.map(entry => entry.kind), ["boat", "bastion"]);
  const summary = mk.assets.categories.find(category => category.tab === "warbands");
  assert.equal(summary.entries.find(entry => entry.uuid === "Actor.guards").assignments[0].text, "Bastion: keep × 4");
  assert.deepEqual(f.actor.getFlag(), groupBefore);
  assert.deepEqual(state, bastionBefore);
  assert.equal(f.saves.length, 0);
  state.defenses.warbands = [];
  boat.name = "New Boat Name";
  const refreshed = (await f.sheet.getData()).mk.warbands;
  assert.deepEqual(refreshed.counts, { following: 2, boat: 2, bastion: 0, unknown: 0 });
  assert.equal(refreshed.entries.find(entry => entry.uuid === "Actor.sailors").deployments[0].label, "Boat: New Boat Name × 2");
});

test("unavailable bastions do not falsely mark warbands as following or expose hidden actor data", async () => {
  const f = setup({
    warbands: ["Actor.free", "Actor.sailors", "Actor.hidden"],
    boats: ["Actor.boat"], bastions: ["Actor.keep", "Compendium.deleted.bastion"],
    boatAssignments: [{ actorUuid: "Actor.boat", warbands: [{ actorUuid: "Actor.sailors", quantity: 1 }] }],
  });
  f.linkedActor("free");
  f.linkedActor("sailors");
  f.linkedActor("hidden").visible = false;
  const keep = f.linkedActor("keep", "mk-shadowdark.bastion");
  keep.visible = false;
  keep.getFlag = () => { throw new Error("Hidden bastion flags must not be read"); };
  game.user.isGM = false;
  f.sheet.isEditable = false;
  const { mk } = await f.sheet.getData();
  assert.equal(mk.warbands.hasUnavailableBastions, true);
  assert.deepEqual(mk.warbands.counts, { following: 0, boat: 1, bastion: 0, unknown: 2 });
  assert.equal(mk.warbands.entries[1].deployments[0].label, "Boat: Unavailable boat");
  assert.equal(mk.warbands.entries[2].levelLabel, "—");
  assert.equal(mk.warbands.entries[2].acLabel, "—");
  assert.equal(mk.warbands.entries[2].hp.known, false);
  assert.ok(mk.warbands.entries.filter(entry => entry.uuid !== "Actor.sailors").every(entry => entry.deployments[0].kind === "unknown"));
  assert.equal(f.saves.length, 0);
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
