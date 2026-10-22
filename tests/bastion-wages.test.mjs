import test from "node:test";
import assert from "node:assert/strict";

class NativeSheet {
  constructor(actor) { this.actor = actor; this.isEditable = true; this.rendered = true; }
  async getData() { return {}; }
  render(force) { this.renders = [...(this.renders ?? []), force]; }
}
globalThis.foundry = { appv1: { sheets: { ActorSheet: NativeSheet } } };
const { MKBastionSheet, rerenderOpenBastionSheets } = await import("../scripts/bastion-sheet/sheet.js");

function fixture() {
  const actors = new Map();
  const state = { upgrades: [], defenses: { warbands: [], siegeWeapons: [] } };
  const actor = { items: [], system: {}, getFlag: () => state };
  const sheet = new MKBastionSheet(actor);
  globalThis.game = { user: { isGM: true } };
  globalThis.ui = { windows: { bastion: sheet } };
  globalThis.fromUuid = async uuid => actors.get(uuid) ?? null;
  const add = (id, level, quantity = 1, kind = "warbands") => {
    const npc = {
      documentName: "Actor", type: "NPC", uuid: `Actor.${id}`, name: id,
      system: { level: { value: level }, attributes: { hp: { value: 12, max: 18 } } },
    };
    actors.set(npc.uuid, npc);
    state.defenses[kind].push({ id, actorUuid: npc.uuid, quantity });
    return npc;
  };
  return { actors, state, actor, sheet, add, data: async () => (await sheet.getData()).mk.bastion };
}

test("an empty Bastion has zero weekly warband wages", async () => {
  const f = fixture();
  assert.deepEqual((await f.data()).warbandWages, { weeklyTotal: 0, incomplete: false });
});

test("warband wages use current NPC levels and quantity, excluding siege weapons", async () => {
  const f = fixture();
  f.add("guards", 2, 3);
  f.add("veterans", "5", 2);
  f.add("catapult", 10, 4, "siegeWeapons");
  const data = await f.data();
  assert.deepEqual(data.warbandWages, { weeklyTotal: 48, incomplete: false });
  assert.deepEqual(data.defenses.warbands.map(entry => entry.weeklyWages), [18, 30]);
  assert.deepEqual(data.defenses.warbands.map(entry => entry.level), [2, 5]);
  assert.equal(data.defenses.siegeWeapons[0].hasWages, false);
  assert.deepEqual(data.defenses.warbands[0].hp, { value: 12, max: 18, percent: 67 });
});

test("level changes, quantity edits, additions and removals recalculate wages without stored totals", async () => {
  const f = fixture();
  const npc = f.add("guards", 2);
  assert.equal((await f.data()).warbandWages.weeklyTotal, 6);
  npc.system.level.value = 4;
  assert.equal((await f.data()).warbandWages.weeklyTotal, 12);
  f.state.defenses.warbands[0].quantity = 3;
  assert.equal((await f.data()).warbandWages.weeklyTotal, 36);
  f.add("veterans", 5);
  assert.equal((await f.data()).warbandWages.weeklyTotal, 51);
  f.state.defenses.warbands.shift();
  assert.equal((await f.data()).warbandWages.weeklyTotal, 15);
  assert.equal(f.state.warbandWages, undefined);
});

test("a built Granary reduces weekly wages by 3 gp per warband including quantities", async () => {
  const f = fixture();
  f.add("guards", 2, 3);
  f.add("veterans", 5, 2);
  f.add("catapult", 10, 4, "siegeWeapons");
  f.state.upgrades = ["granary"];
  const data = await f.data();
  assert.equal(data.hasGranary, true);
  assert.deepEqual(data.defenses.warbands.map(entry => entry.weeklyWages), [9, 24]);
  assert.deepEqual(data.warbandWages, { weeklyTotal: 33, incomplete: false });
  assert.equal(data.defenses.siegeWeapons[0].hasWages, false);
});

test("Granary discounts cannot make wages negative or turn missing levels into payable entries", async () => {
  const f = fixture();
  f.state.upgrades = ["granary"];
  f.add("recruits", 0, 3);
  f.add("novices", 1, 2);
  f.add("guards", 2);
  f.add("unknown", undefined);
  const missing = f.add("missing", 4);
  f.actors.delete(missing.uuid);
  const data = await f.data();
  assert.deepEqual(data.defenses.warbands.map(entry => entry.weeklyWages), [0, 0, 3, null, null]);
  assert.deepEqual(data.warbandWages, { weeklyTotal: 3, incomplete: true });
});

test("Granary installation and removal recalculate wages alongside linked levels and quantities", async () => {
  const f = fixture();
  const npc = f.add("guards", 2, 2);
  assert.equal((await f.data()).hasGranary, false);
  assert.equal((await f.data()).warbandWages.weeklyTotal, 12);
  f.state.upgrades = ["granary"];
  assert.equal((await f.data()).warbandWages.weeklyTotal, 6);
  npc.system.level.value = 3;
  f.state.defenses.warbands[0].quantity = 4;
  assert.equal((await f.data()).warbandWages.weeklyTotal, 24);
  f.state.upgrades = [];
  assert.equal((await f.data()).hasGranary, false);
  assert.equal((await f.data()).warbandWages.weeklyTotal, 36);
  assert.equal(f.state.warbandWages, undefined);
});

test("level zero costs zero and normalized quantities cannot produce negative wages", async () => {
  const f = fixture();
  f.add("recruits", 0, 3);
  f.add("guards", 2, -4);
  f.add("veterans", 3, 2.8);
  const data = await f.data();
  assert.deepEqual(data.warbandWages, { weeklyTotal: 24, incomplete: false });
  assert.equal(data.defenses.warbands[0].hasWages, true);
  assert.deepEqual(data.defenses.warbands.map(entry => entry.weeklyWages), [0, 6, 18]);
});

test("missing actors and invalid levels produce an explicit subtotal rather than a false total", async () => {
  const f = fixture();
  f.add("guards", 3, 2);
  const missing = f.add("missing", 10);
  f.actors.delete(missing.uuid);
  for (const [index, level] of [undefined, null, "", " ", "unknown", -1, 2.5, Infinity].entries()) {
    f.add(`invalid-${index}`, level);
  }
  const data = await f.data();
  assert.deepEqual(data.warbandWages, { weeklyTotal: 18, incomplete: true });
  assert.ok(data.defenses.warbands.slice(1).every(entry => !entry.hasWages && entry.weeklyWages === null));
  assert.equal(data.defenses.warbands[1].actorExists, false);
});

test("NPC update and deletion refresh only open Bastions with a matching defense", async context => {
  const timers = [];
  context.mock.method(globalThis, "setTimeout", callback => { timers.push(callback); return timers.length; });
  const f = fixture();
  const npc = f.add("guards", 2);
  const unrelated = new MKBastionSheet({ getFlag: () => ({}) });
  const closed = new MKBastionSheet(f.actor);
  closed.rendered = false;
  ui.windows = { bastion: f.sheet, unrelated, closed, other: { rendered: true } };
  npc.system.level.value = 4;
  rerenderOpenBastionSheets(npc);
  assert.equal(f.sheet.renders, undefined);
  timers.shift()();
  assert.deepEqual(f.sheet.renders, [false]);
  assert.equal((await f.data()).warbandWages.weeklyTotal, 12);
  f.actors.delete(npc.uuid);
  rerenderOpenBastionSheets(npc);
  timers.shift()();
  assert.deepEqual(f.sheet.renders, [false, false]);
  assert.deepEqual((await f.data()).warbandWages, { weeklyTotal: 0, incomplete: true });
  rerenderOpenBastionSheets({ uuid: "Actor.unrelated" });
  rerenderOpenBastionSheets(null);
  assert.equal(unrelated.renders, undefined);
  assert.equal(closed.renders, undefined);
  assert.equal(f.sheet.renders.length, 2);
  delete globalThis.ui;
  assert.doesNotThrow(() => rerenderOpenBastionSheets(npc));
});
