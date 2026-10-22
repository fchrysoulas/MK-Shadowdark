import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { queueLinkedSheetRefresh } from "../scripts/libs/linked-sheet-refresh.js";

const shadowSource = await readFile(new URL("../scripts/token-shadows/token-shadows.js", import.meta.url), "utf8");

function shadowFixture(source = shadowSource, count = 1) {
  const calls = { ellipses: 0, clears: 0, filters: 0, filterWrites: 0, destroyed: 0 };
  class Graphics {
    clear() { calls.clears++; }
    beginFill() {}
    drawEllipse() { calls.ellipses++; }
    endFill() {}
    destroy() { this.destroyed = true; }
  }
  class BlurFilter {
    constructor() {
      calls.filters++;
      for (const key of ["blur", "blurX", "blurY", "quality", "padding"]) {
        Object.defineProperty(this, key, { set() { calls.filterWrites++; } });
      }
    }
    destroy() { calls.destroyed++; }
  }
  const settings = new Map(Object.entries({ tokenShadowsEnabled: true, tokenShadowWidthFactor: 0.75,
    tokenShadowHeightGridFactor: 0.12, tokenShadowOffsetYFactor: 1.1, tokenShadowAlpha: 0.55,
    tokenShadowBlur: 5, tokenShadowBlurQuality: 2 }));
  const tokens = Array.from({ length: count }, () => ({
    w: 100, h: 200, children: [],
    addChildAt(child) { this.children.push(child); child.parent = this; },
    addChild(child) { this.addChildAt(child); },
    removeChild(child) { this.children = this.children.filter(entry => entry !== child); child.parent = null; }
  }));
  const hooks = new Map();
  const module = { version: "1.9.33" };
  const context = vm.createContext({
    Hooks: { on(name, callback) { hooks.set(name, callback); }, once(name, callback) { hooks.set(name, callback); } },
    game: { modules: new Map([["mk-shadowdark", module]]), settings: {
      settings: new Map([...settings].map(([key]) => [`mk-shadowdark.${key}`, {}])),
      get: (_scope, key) => settings.get(key)
    } },
    canvas: { ready: true, grid: { size: 100 }, tokens: { placeables: tokens } },
    PIXI: { Graphics, filters: { BlurFilter } }, window: { setTimeout }, console: { log() {}, warn() {} }
  });
  vm.runInContext(source, context);
  hooks.get("ready")();
  return { calls, settings, tokens, hooks, module, context };
}

let lightingFixtureId = 0;
async function lightingFixture() {
  const calls = { fetches: 0, updates: 0, resolves: 0 };
  const gm = { id: "a", isGM: true, active: true };
  const lightItem = { system: { light: { isSource: true, active: true, template: "torch" } } };
  const member = { id: "hero", uuid: "Actor.hero", documentName: "Actor", items: [lightItem] };
  const state = { members: [member.uuid], activeMembers: [member.uuid] };
  const group = { id: "group", uuid: "Actor.group", items: [],
    getFlag: (_scope, key) => key === "isGroup" ? true : state };
  const token = { actorId: group.id, _source: { light: { dim: 0, bright: 0, angle: 360 } },
    async update(data) { calls.updates++; this._source.light = { ...this._source.light, ...structuredClone(data.light) }; } };
  const scene = { tokens: [token] };
  const mappings = { torch: { light: { dim: 40, bright: 20, animation: { type: "torch", speed: 2 } } } };
  globalThis.game = { user: gm, users: [gm], actors: [group], settings: { settings: new Map() } };
  globalThis.canvas = { ready: true, scene };
  globalThis.fromUuid = async uuid => { calls.resolves++; return uuid === member.uuid ? member : null; };
  globalThis.foundry = { utils: {
    deepClone: structuredClone,
    async fetchJsonWithTimeout(path) {
      assert.equal(path, "systems/shadowdark/assets/mappings/map-light-sources.json");
      calls.fetches++;
      return mappings;
    }
  } };
  const api = await import(`../scripts/group-sheet/lighting.js?test=${lightingFixtureId++}`);
  return { api, calls, gm, group, member, lightItem, state, token, scene, mappings };
}

test("token shadows reuse geometry and blur state across 20,000 unchanged token refreshes", () => {
  const f = shadowFixture(shadowSource, 200);
  assert.equal(f.calls.ellipses, 200);
  assert.equal(f.calls.filters, 200);
  const before = { ...f.calls };
  for (let i = 0; i < 100; i++) for (const token of f.tokens) f.hooks.get("refreshToken")(token);
  assert.deepEqual(f.calls, before);
});

test("shadow dimensions, blur, opacity and enable settings still invalidate and clean up cached graphics", () => {
  const f = shadowFixture();
  const token = f.tokens[0];
  token.w = 200;
  f.hooks.get("refreshToken")(token);
  assert.equal(f.calls.ellipses, 2);
  f.settings.set("tokenShadowBlurQuality", 4);
  f.module.api.refreshTokenShadows();
  assert.equal(f.calls.ellipses, 3);
  assert.equal(f.calls.filters, 1);
  f.settings.set("tokenShadowAlpha", 0);
  f.module.api.refreshTokenShadows();
  assert.equal(token.children[0].visible, false);
  assert.equal(token.children[0].filters, null);
  f.settings.set("tokenShadowAlpha", 0.8);
  f.module.api.refreshTokenShadows();
  assert.equal(token.children[0].visible, true);
  assert.equal(f.calls.ellipses, 4);
  f.settings.set("tokenShadowBlur", 0);
  f.module.api.refreshTokenShadows();
  assert.equal(token.children[0].filters, null);
  f.settings.set("tokenShadowsEnabled", false);
  f.module.api.refreshTokenShadows();
  assert.equal(token.children.length, 0);
  assert.equal(f.calls.destroyed, 1);
  f.settings.set("tokenShadowsEnabled", true);
  f.module.api.refreshTokenShadows();
  assert.equal(token.children.length, 1);
  f.hooks.get("deleteToken")({ object: token });
  assert.equal(token.children.length, 0);
});

test("linked sheets batch notification bursts, skip closed sheets and recover after render errors", async () => {
  const originalTimeout = globalThis.setTimeout;
  const originalError = console.error;
  const timers = [];
  const errors = [];
  globalThis.setTimeout = callback => { timers.push(callback); return timers.length; };
  console.error = (...args) => errors.push(args);
  try {
    const sheet = { rendered: true, renders: 0, render(force) { assert.equal(force, false); this.renders++; } };
    for (let i = 0; i < 100; i++) queueLinkedSheetRefresh(sheet);
    assert.equal(timers.length, 1);
    assert.equal(sheet.renders, 0);
    timers.shift()();
    assert.equal(sheet.renders, 1);
    queueLinkedSheetRefresh(sheet);
    sheet.rendered = false;
    timers.shift()();
    assert.equal(sheet.renders, 1);
    assert.equal(queueLinkedSheetRefresh(sheet), false);
    sheet.rendered = true;
    sheet.render = () => { throw new Error("render failed"); };
    queueLinkedSheetRefresh(sheet);
    timers.shift()();
    assert.equal(errors.length, 1);
    sheet.render = async () => { throw new Error("async render failed"); };
    assert.equal(queueLinkedSheetRefresh(sheet), true);
    timers.shift()();
    await Promise.resolve();
    assert.equal(errors.length, 2);
  } finally {
    globalThis.setTimeout = originalTimeout;
    console.error = originalError;
  }
});

test("group light change filters handle nested, flattened and deleted data without reacting to HP or inventory quantity", async () => {
  const { api, lightItem } = await lightingFixture();
  for (const changes of [{ "system.light.active": false }, { system: { light: { template: "lantern" } } },
    { system: { "-=light": null } }, { "system.-=light": null }, { system: null }]) {
    assert.equal(api.itemChangesAffectGroupLight(changes), true);
  }
  for (const changes of [{ "system.quantity": 4 }, { system: { quantity: 4, equipped: true } }, { img: "item.png" }]) {
    assert.equal(api.itemChangesAffectGroupLight(changes), false);
  }
  for (const changes of [{ "flags.mk-shadowdark.group.activeMembers": [] }, { items: [] },
    { flags: { "mk-shadowdark": { group: { members: [] } } } }, { "flags.mk-shadowdark.-=group": null }]) {
    assert.equal(api.actorChangesAffectGroupLight(changes), true);
  }
  for (const changes of [{ system: { attributes: { hp: { value: 2 } } } },
    { "flags.mk-shadowdark.group.travel.progress": 4 }, { name: "New name" }]) {
    assert.equal(api.actorChangesAffectGroupLight(changes), false);
  }
  assert.equal(api.itemChangesAffectGroupLight({ sort: 10 }, lightItem), true);
  assert.equal(api.itemChangesAffectGroupLight({ sort: 10 }, { system: {} }), false);
});

test("group light sync shares mappings and skips identical writes and off-Scene groups", async () => {
  const f = await lightingFixture();
  for (let i = 0; i < 100; i++) await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.calls.fetches, 1);
  assert.equal(f.calls.updates, 1);
  assert.equal(f.token._source.light.angle, 360);
  assert.deepEqual(f.token._source.light.animation, { type: "torch", speed: 2 });
  const before = { ...f.calls };
  f.scene.tokens = [];
  await f.api.syncGroupTokenLightsForActor(f.member);
  await f.api.syncGroupTokenLight(f.group);
  assert.deepEqual(f.calls, before);
});

test("concurrent group light notifications collapse and an in-flight light change is applied afterward", async () => {
  const f = await lightingFixture();
  await Promise.all(Array.from({ length: 100 }, () => f.api.syncGroupTokenLight(f.group)));
  assert.deepEqual(f.calls, { fetches: 1, updates: 1, resolves: 1 });
  let release;
  const originalUpdate = f.token.update;
  f.token.update = async function(data) {
    await new Promise(resolve => { release = resolve; });
    await originalUpdate.call(this, data);
    this.update = originalUpdate;
  };
  f.lightItem.system.light.active = false;
  const active = f.api.syncGroupTokenLight(f.group);
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  assert.equal(typeof release, "function");
  f.lightItem.system.light.active = true;
  const queued = f.api.syncGroupTokenLight(f.group);
  release();
  await Promise.all([active, queued]);
  assert.equal(f.token._source.light.dim, 40);
  assert.equal(f.token._source.light.bright, 20);
  assert.equal(f.calls.updates, 3);
});

test("group light stops on extinguishing the source and falls back to the Group's own light", async () => {
  const f = await lightingFixture();
  await f.api.syncGroupTokenLight(f.group);
  f.lightItem.system.light.active = false;
  await f.api.syncGroupTokenLightsForActor(f.member);
  assert.equal(f.token._source.light.dim, 0);
  assert.equal(f.token._source.light.bright, 0);
  f.group.items.push({ system: { light: { isSource: true, active: true, template: "torch" } } });
  await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.token._source.light.dim, 40);
  f.state.activeMembers = [];
  await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.calls.fetches, 1);
});

test("group lighting retries a failed mapping fetch and rechecks authority and Scene after awaits", async () => {
  const f = await lightingFixture();
  const fetch = foundry.utils.fetchJsonWithTimeout;
  let failed = false;
  foundry.utils.fetchJsonWithTimeout = async path => {
    if (!failed) { failed = true; throw new Error("offline"); }
    return fetch(path);
  };
  await assert.rejects(f.api.syncGroupTokenLight(f.group), /offline/);
  await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.calls.updates, 1);
  f.lightItem.system.light.active = false;
  globalThis.fromUuid = async () => { f.gm.active = false; return f.member; };
  await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.calls.updates, 1);
  f.gm.active = true;
  globalThis.fromUuid = async () => { globalThis.canvas.scene = { tokens: [] }; return f.member; };
  await f.api.syncGroupTokenLight(f.group);
  assert.equal(f.calls.updates, 1);
  globalThis.canvas.scene = f.scene;
  f.gm.isGM = false;
  const before = { ...f.calls };
  await f.api.syncGroupTokenLight(f.group);
  await f.api.syncGroupTokenLightsForActor(f.member);
  assert.deepEqual(f.calls, before);
});

test("live Group, Boat and Bastion refresh paths batch HP/item notifications without running lighting for unrelated edits", async () => {
  const f = await lightingFixture();
  class NativeSheet {
    constructor(actor) { this.actor = actor; this.rendered = true; this.renders = 0; }
    render() { this.renders++; }
  }
  foundry.appv1 = { sheets: { ActorSheet: NativeSheet } };
  foundry.abstract = { TypeDataModel: class {} };
  foundry.documents = { collections: { Actors: { registerSheet() {} } } };
  globalThis.CONFIG = { Actor: { dataModels: {} } };
  globalThis.Actor = {};
  const hooks = new Map();
  globalThis.Hooks = {
    on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
    once() {}
  };
  const { registerGroupSheet } = await import("../scripts/group-sheet/registration.js");
  const { MKGroupSheet } = await import("../scripts/group-sheet/sheet.js");
  const { MKBastionSheet, rerenderOpenBastionSheets } = await import("../scripts/bastion-sheet/sheet.js");
  const { MKBoatSheet } = await import("../scripts/boat-sheet/sheet.js");
  await import("../scripts/boat-sheet/boat-sheet.js");
  registerGroupSheet();
  const groupSheet = new MKGroupSheet(f.group);
  const bastionSheet = new MKBastionSheet({ getFlag: () => ({ defenses: { warbands: [{ actorUuid: f.member.uuid }] } }) });
  const boatSheet = new MKBoatSheet({ system: { crew: [{ actorUuid: f.member.uuid, quantity: 1 }] } });
  globalThis.ui = { windows: { groupSheet, bastionSheet, boatSheet } };
  const originalTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = callback => { timers.push(callback); return timers.length; };
  try {
    for (let i = 0; i < 100; i++) {
      for (const handler of hooks.get("updateActor")) handler(f.member, { "system.attributes.hp.value": i });
      for (const handler of hooks.get("updateItem")) handler({ actor: f.member, system: {} }, { "system.quantity": i });
      rerenderOpenBastionSheets(f.member);
    }
    assert.equal(timers.length, 3);
    assert.deepEqual(f.calls, { fetches: 0, updates: 0, resolves: 0 });
    for (const timer of timers.splice(0)) timer();
    assert.deepEqual([groupSheet.renders, boatSheet.renders, bastionSheet.renders], [1, 1, 1]);
    for (const handler of hooks.get("updateItem")) handler({ ...f.lightItem, actor: f.member }, { "system.light.remaining": 30 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.fetches, 1);
    assert.equal(f.calls.updates, 1);
  } finally {
    globalThis.setTimeout = originalTimeout;
  }
});
