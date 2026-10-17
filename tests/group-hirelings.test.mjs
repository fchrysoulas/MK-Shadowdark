import test from "node:test";
import assert from "node:assert/strict";
import { getGroupData, normalizeCompanions } from "../scripts/group-sheet/activities.js";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; }
  async getData() { return {}; }
  render() {}
}

globalThis.foundry = {
  appv1: { sheets: { ActorSheet: NativeSheet } },
  utils: { deepClone: structuredClone },
};
const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");

function setup(initial = {}) {
  const warnings = [];
  const documents = new Map();
  const saves = [];
  let group = structuredClone(initial);
  globalThis.game = { user: { isGM: true }, settings: { settings: new Map() } };
  globalThis.CONFIG = {};
  globalThis.ui = { notifications: { warn: message => warnings.push(message) } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
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
  function character(id, name = id, type = "Player") {
    const member = { id, uuid: `Actor.${id}`, name, type, documentName: "Actor", items: [], system: {} };
    documents.set(member.uuid, member);
    return member;
  }
  function change(field, value, id = "hireling") {
    return {
      preventDefault() {},
      currentTarget: {
        value,
        dataset: { companionField: field },
        closest: () => ({ dataset: { companionId: id } }),
      },
    };
  }
  return { actor, sheet: new MKGroupSheet(actor), character, change, documents, warnings, saves };
}

test("hireling details normalize with safe legacy defaults and preserve companion capacity", () => {
  const legacy = { id: "old", type: "hireling", name: "Porter", carrySlots: 8 };
  const detailed = { ...legacy, id: "new", background: "  Sailor  ", ownerUuid: " Actor.hero " };
  const mount = { id: "horse", type: "mount", strengthBonus: 3, riderUuid: "Actor.hero" };
  const normalized = normalizeCompanions([legacy, detailed, mount]);
  assert.equal(normalized[0].background, "");
  assert.equal(normalized[0].ownerUuid, "");
  assert.equal(normalized[0].carrySlots, 8);
  assert.equal(normalized[1].background, "Sailor");
  assert.equal(normalized[1].ownerUuid, "Actor.hero");
  assert.equal(normalized[2].strengthBonus, 3);
  assert.equal(normalized[2].riderUuid, "Actor.hero");
  assert.deepEqual(normalizeCompanions(normalized), normalized);
  assert.equal(detailed.background, "  Sailor  ", "normalization leaves stored data untouched");
});

test("hireling owner choices include inactive group PCs and reflect live character names", async () => {
  const f = setup({
    members: ["Actor.hero", "Actor.resting", "Actor.npc"],
    activeMembers: ["Actor.hero"],
    companions: [{ id: "hireling", background: "Smith", carrySlots: 8, ownerUuid: "Actor.resting" }],
  });
  f.character("hero", "Hero");
  const resting = f.character("resting", "Resting PC");
  f.character("npc", "NPC", "NPC");
  f.character("outsider", "Outside PC");
  let context = await f.sheet.getData();
  assert.deepEqual(context.mk.hirelings.entries[0].ownerOptions.map(option => option.uuid), [
    "", "Actor.hero", "Actor.resting",
  ]);
  assert.equal(context.mk.hirelings.entries[0].ownerOptions.find(option => option.selected).name, "Resting PC");
  assert.equal(context.mk.hirelings.entries[0].background, "Smith");
  assert.equal(context.mk.hirelings.totalCarrySlots, 8);
  resting.name = "Renamed PC";
  context = await f.sheet.getData();
  assert.equal(context.mk.hirelings.entries[0].ownerOptions.find(option => option.selected).name, "Renamed PC");
  assert.equal(f.saves.length, 0);
});

test("GMs can save and clear hireling details without changing other companions or actor permissions", async () => {
  const f = setup({
    members: ["Actor.hero"], activeMembers: [],
    companions: [{ id: "hireling", carrySlots: 8 }, { id: "second", background: "Cook", ownerUuid: "Actor.hero" }],
  });
  const hero = f.character("hero");
  const before = structuredClone(hero);
  await f.sheet._onChangeCompanion(f.change("background", "  Former sailor / navigator  "));
  await f.sheet._onChangeCompanion(f.change("ownerUuid", hero.uuid));
  let data = getGroupData(f.actor);
  assert.equal(data.companions[0].background, "Former sailor / navigator");
  assert.equal(data.companions[0].ownerUuid, hero.uuid);
  assert.equal(data.companions[0].carrySlots, 8);
  assert.equal(data.companions[1].background, "Cook");
  assert.deepEqual(hero, before);
  await f.sheet._onChangeCompanion(f.change("ownerUuid", ""));
  await f.sheet._onChangeCompanion(f.change("background", ""));
  data = getGroupData(f.actor);
  assert.equal(data.companions[0].ownerUuid, "");
  assert.equal(data.companions[0].background, "");
  assert.equal(data.companions[1].ownerUuid, hero.uuid);
});

test("owner edits reject outsiders, non-PCs, user accounts and missing actors", async () => {
  const f = setup({
    members: ["Actor.hero", "Actor.npc", "Actor.missing"],
    companions: [{ id: "hireling", ownerUuid: "Actor.hero" }],
  });
  f.character("hero");
  f.character("npc", "NPC", "NPC");
  f.character("outside");
  for (const uuid of ["Actor.outside", "Actor.npc", "User.player", "Actor.missing"]) {
    await f.sheet._onChangeCompanion(f.change("ownerUuid", uuid));
  }
  assert.equal(f.saves.length, 0);
  assert.equal(f.warnings.length, 4);
  assert.equal(getGroupData(f.actor).companions[0].ownerUuid, "Actor.hero");
});

test("hireling detail editing remains GM-only and does not change mount fields", async () => {
  const f = setup({ companions: [{ id: "hireling" }, { id: "horse", type: "mount" }] });
  game.user.isGM = false;
  await f.sheet._onChangeCompanion(f.change("background", "Smith"));
  await f.sheet._onChangeCompanion(f.change("ownerUuid", ""));
  game.user.isGM = true;
  f.sheet.isEditable = false;
  await f.sheet._onChangeCompanion(f.change("background", "Smith"));
  await f.sheet._onChangeCompanion(f.change("ownerUuid", ""));
  f.sheet.isEditable = true;
  await f.sheet._onChangeCompanion(f.change("background", "Smith", "horse"));
  await f.sheet._onChangeCompanion(f.change("ownerUuid", "", "horse"));
  assert.equal(f.saves.length, 0);
});

test("new hirelings start without an owner or profession", async () => {
  const f = setup();
  await f.sheet._onAddCompanion({ preventDefault() {}, currentTarget: { dataset: { companionType: "hireling" } } });
  const [hireling] = getGroupData(f.actor).companions;
  assert.equal(hireling.type, "hireling");
  assert.equal(hireling.background, "");
  assert.equal(hireling.ownerUuid, "");
  const { mk } = await f.sheet.getData();
  assert.deepEqual(mk.hirelings.entries[0].ownerOptions, [{ uuid: "", name: "Unassigned", selected: true, unavailable: false }]);
});

test("inactive party members keep ownership, while removing a member unassigns their hirelings", async () => {
  const f = setup({
    members: ["Actor.hero", "Actor.other"],
    companions: [
      { id: "hireling", ownerUuid: "Actor.hero", background: "Guide" },
      { id: "second", ownerUuid: "Actor.other" },
    ],
  });
  await f.sheet._setPartyMemberActive("Actor.hero", false);
  assert.equal(getGroupData(f.actor).companions[0].ownerUuid, "Actor.hero");
  await f.sheet._removeGroupMember("Actor.hero");
  const data = getGroupData(f.actor);
  assert.equal(data.companions[0].ownerUuid, "");
  assert.equal(data.companions[0].background, "Guide");
  assert.equal(data.companions[1].ownerUuid, "Actor.other");
});

test("a deleted owner stays visibly unavailable until the GM clears or replaces it", async () => {
  const f = setup({ members: ["Actor.deleted"], companions: [{ id: "hireling", ownerUuid: "Actor.deleted" }] });
  const { mk } = await f.sheet.getData();
  const selected = mk.hirelings.entries[0].ownerOptions.find(option => option.selected);
  assert.equal(selected.name, "Unavailable character");
  assert.equal(selected.unavailable, true);
  assert.equal(f.saves.length, 0);
  await f.sheet._onChangeCompanion(f.change("ownerUuid", ""));
  assert.equal(getGroupData(f.actor).companions[0].ownerUuid, "");
});
