import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { getSpellTemplate, inferSpellTemplate, normalizeTemplate, spellRangeCells } from "../scripts/spell-templates/config.js";
import { aimDirection, createCoordinateFrame, createSceneCoordinateFrame, footprintIntersects, templateCells, validPath } from "../scripts/spell-templates/geometry.js";
import { areaTileGeometry, createSpellAreaTile, reconcileFocusAreaTiles,
  removeSpellAreaTilesForFocus } from "../scripts/spell-templates/area-tiles.js";
import { captureSpellEffectLink, spellTargetUuids } from "../scripts/spell-effects/spell-effects-logic.js";
import { snapshotTargetUuids } from "../scripts/auto-damage/auto-damage-targets.js";
import { resolveAutoDamageOperation } from "../scripts/auto-damage/auto-damage-operation.js";
import { canEditTemplate, renderSpellTemplateSettings, updateSpellTemplate } from "../scripts/spell-templates/settings.js";
import { findCasterToken, getSpellTemplateTargets, registerSpellTemplates, setSceneTargets,
  SpellTemplatePlacement, spellTemplateCanCast, syncSpellTemplateTargets, visibleSceneToken } from "../scripts/spell-templates/spell-templates.js";
import { createLayout, project, unproject, tokenFootprint, tokenPosition } from "../scripts/isometric-board/geometry.js";

const MODULE_ID = "mk-shadowdark";
const spell = (name = "Fireball", options = {}) => ({ name, type: "Spell", uuid: `Item.${name}`, isOwner: true,
  system: { range: "far", description: "", ...options }, flags: {} });
const bounds = { columns: 40, rows: 40 };
const caster = { column: 15, row: 15, size: 1 };

class Element {
  constructor(tagName = "div") { this.tagName = tagName; this.children = []; this.listeners = new Map(); this.attributes = {}; this.dataset = {}; }
  append(...elements) { for (const element of elements) { element.parentElement = this; this.children.push(element); } }
  replaceChildren(...elements) { this.children = []; this.append(...elements); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  removeEventListener(name) { this.listeners.delete(name); }
  remove() { this.removed = true; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  replaceWith(element) { const parent = this.parentElement; const index = parent.children.indexOf(this); parent.children[index] = element; element.parentElement = parent; }
  querySelector(selector) {
    return this.children.find(child => selector.startsWith(".") ? child.className?.split(" ").includes(selector.slice(1))
      : selector === 'button[type="submit"]' ? child.tagName === "button" && child.type === "submit" : child.tagName === selector)
      ?? this.children.map(child => child.querySelector(selector)).find(Boolean) ?? null;
  }
  set innerHTML(value) { this.html = value; this.firstElementChild = new Element("section"); this.firstElementChild.className = "mk-targeting-assistant"; this.firstElementChild.html = value; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 10, top: 20, width: 1000, height: 800 }; }
}

function fixture({ gm = false, isometric = true, rotation = 0, tilt = 30, cast } = {}) {
  const calls = { native: 0, targetChanges: 0, warnings: [], polygons: 0, clears: 0 };
  const hooks = new Map();
  const scene = { id: "scene", width: 4000, height: 3000, grid: { size: 100, distance: 5 },
    getFlag: () => ({ enabled: isometric, boardSize: 18, rotation, tilt, scaleX: 1.3, scaleY: 0.8 }) };
  const layout = createLayout(scene);
  const actor = { id: "hero", uuid: "Actor.hero", isOwner: true, system: { attributes: { ac: { value: 12 } } } };
  const items = new Map();
  const frames = new Map();
  let frameId = 0;
  const document = new Element();
  document.body = new Element();
  document.createElement = tag => new Element(tag);
  class Graphics {
    clear() { calls.clears++; }
    lineStyle() {}
    beginFill() {}
    drawPolygon() { calls.polygons++; }
    endFill() {}
    destroy() { this.destroyed = true; }
  }
  class NativeModel {
    constructor() { this.parent = actor; }
    async castSpell(uuid, config) {
      calls.native++;
      if (cast) return cast.call(this, uuid, config, environment);
      config.actorUuid = actor.uuid;
      config.type = "spell";
      config.cast = { spellUuid: uuid, range: items.get(uuid)?.system.range };
      for (const callback of hooks.get("SD-Player-Spell") ?? []) if (callback(config) === false) return false;
      return true;
    }
  }
  const environment = {
    document, PIXI: { Graphics }, CONFIG: { Actor: { dataModels: { Player: NativeModel } } },
    game: { system: { id: "shadowdark" }, user: { id: "local", isGM: gm, targets: new Set() }, actors: [actor],
      modules: new Map([[MODULE_ID, { api: {} }]]), settings: { get: () => true },
      i18n: { localize: key => key.split(".").at(-1), format: (key, values) => `${key.split(".").at(-1)}:${Object.values(values).join("|")}` } },
    canvas: { ready: true, scene, dimensions: { size: 100, sceneRect: { x: 0, y: 0, width: 4000, height: 3000 } },
      app: { canvas: new Element("canvas"), screen: { width: 1000, height: 800 } }, stage: { toLocal: point => point },
      primary: { children: [], addChild(child) { this.children.push(child); child.parent = this; },
        removeChild(child) { this.children = this.children.filter(element => element !== child); child.parent = null; } },
      tokens: { placeables: [] } },
    Hooks: {
      on(name, handler) { hooks.set(name, [...(hooks.get(name) ?? []), handler]); },
      once(name, handler) { this.on(name, handler); },
      callAll(name, ...args) { for (const handler of hooks.get(name) ?? []) handler(...args); }
    },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    fromUuid: async uuid => items.get(uuid),
    ui: { notifications: { warn: text => calls.warnings.push(text) } }
  };
  const api = environment.game.modules.get(MODULE_ID).api;
  environment.game.user.active = true;
  environment.game.users = [environment.game.user, ...(!gm ? [{ id: "gm", isGM: true, active: true }] : [])];
  environment.game.scenes = new Map([[scene.id, scene]]);
  api.isometricBoard = { enabled: isometric, boardSize: 18, layout,
    project: (column, row) => project(layout, column, row), coordinates: point => unproject(layout, point),
    tokenFootprint: doc => tokenFootprint(doc, layout, doc._source, environment), stopInteraction() {} };
  const addToken = (id, cell, options = {}) => {
    const owner = options.actor ?? { id, uuid: `Actor.${id}`, system: { attributes: { ac: { value: 11 } } } };
    const doc = { id, uuid: `Scene.scene.Token.${id}`, actor: owner, parent: scene, width: options.width ?? 1,
      height: options.height ?? 1, isOwner: owner === actor, name: id, ...options,
      getSize(data = {}) { return { width: (data.width ?? this.width) * 100, height: (data.height ?? this.height) * 100 }; } };
    const position = isometric ? tokenPosition(doc, layout, cell, {}, environment) : { x: cell.column * 100, y: cell.row * 100 };
    Object.assign(doc, position); doc._source = { ...position, width: doc.width, height: doc.height };
    const token = { id, document: doc, actor: owner, visible: true, isVisible: true, controlled: owner === actor,
      setTarget(targeted, { releaseOthers }) {
        assert.equal(releaseOthers, false);
        calls.targetChanges++;
        if (targeted) environment.game.user.targets.add(this); else environment.game.user.targets.delete(this);
      } };
    doc.object = token; environment.canvas.tokens.placeables.push(token); return token;
  };
  const hero = addToken("hero", { column: 5, row: 5 }, { actor });
  const addSpell = item => { items.set(item.uuid, item); return item; };
  const model = new NativeModel();
  actor.system = model;
  actor.system.attributes = { ac: { value: 12 } };
  registerSpellTemplates(environment);
  for (const callback of hooks.get("ready")) callback();
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
  return { environment, calls, actor, hero, scene, layout, api, model, hooks, addToken, addSpell, frames, flush, document };
}

function pointer(context, column, row) {
  const p = context.api.isometricBoard.enabled ? project(context.layout, column, row) : { x: column * 100, y: row * 100 };
  return { target: context.environment.canvas.app.canvas, button: 0, key: "", clientX: p.x + 10, clientY: p.y + 20,
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
}

async function placementReady(f, config = {}) {
  const item = f.addSpell(spell());
  const casting = f.model.castSpell(item.uuid, config);
  for (let i = 0; i < 10 && !f.document.listeners.has("pointerdown"); i++) await Promise.resolve();
  assert.ok(f.document.listeners.has("pointerdown"));
  return { casting, item };
}

test("core cubes use six cells, Lightning Bolt uses twelve by one, and Burning Hands uses a caster circle", () => {
  for (const name of ["Fireball", "Sleep", "Silence", "Web", "Cloudkill"]) {
    const template = getSpellTemplate(spell(name));
    assert.equal(template.shape, "cube"); assert.equal(template.length, 6); assert.equal(template.width, 6);
  }
  assert.deepEqual([getSpellTemplate(spell("Lightning Bolt")).length, getSpellTemplate(spell("Lightning Bolt")).width], [12, 1]);
  assert.equal(getSpellTemplate(spell("Burning Hands")).excludeCaster, true);
  assert.equal(getSpellTemplate(spell("Burning Hands")).origin, "caster");
  assert.equal(getSpellTemplate(spell("Sleep")).origin, "caster");
  assert.equal(getSpellTemplate(spell("Magic Missile")), null);
  assert.equal(inferSpellTemplate({ name: "Fireball", type: "Weapon" }), null);
  assert.equal(getSpellTemplate(spell("Translated spell", { description: "Creates a near-sized cube." })).length, 6);
  const manual = spell(); manual.flags[MODULE_ID] = { spellTemplate: { mode: "none" } };
  assert.equal(getSpellTemplate(manual), null);
});

test("custom spell data normalizes dimensions, origin, color and native range units", () => {
  const template = normalizeTemplate({ mode: "cube", length: "7.6", width: 2, color: "javascript:bad", origin: "unsafe" });
  assert.equal(template.length, 8); assert.equal(template.width, 8); assert.equal(template.color, "#d5a65c");
  assert.equal(template.origin, "point");
  assert.equal(normalizeTemplate({ mode: "line", length: Infinity }).length, 12);
  assert.equal(normalizeTemplate({ mode: "line", width: 10000 }).width, 60);
  for (const [range, cells] of [["Close", 1], ["Near", 6], ["Far", 12], ["Self", 0], ["Unlimited", Infinity]]) {
    assert.equal(spellRangeCells(spell("X", { range })), cells);
  }
});

test("cubes contain exactly 36 cells and twelve-cell lines rotate through all eight board directions", () => {
  const cube = getSpellTemplate(spell());
  const cells = templateCells(cube, { column: 15, row: 15 }, 0, caster, bounds);
  assert.equal(cells.length, 36);
  assert.deepEqual(new Set(cells.map(cell => cell.column)), new Set([13, 14, 15, 16, 17, 18]));
  const line = getSpellTemplate(spell("Lightning Bolt"));
  for (let direction = 0; direction < 8; direction++) {
    const cells = templateCells(line, { column: 15, row: 15 }, direction, caster, bounds);
    assert.equal(cells.length, 12);
    assert.equal(footprintIntersects(cells, caster), false);
  }
  assert.equal(aimDirection({ column: 5, row: 5 }, { column: 9, row: 9 }), 1);
  assert.equal(aimDirection({ column: 5, row: 5 }, { column: 9, row: 8 }, true), 0);
});

test("caster cubes extend from every creature base edge, and templates clip at the board boundary", () => {
  for (const size of [1, 2, 3, 4]) for (const direction of [0, 2, 4, 6]) {
    const base = { column: 15, row: 15, size };
    const cells = templateCells(getSpellTemplate(spell("Sleep")), { column: 15, row: 15 }, direction, base, bounds);
    assert.equal(cells.length, 36);
    assert.equal(footprintIntersects(cells, base), false);
  }
  const cells = templateCells(getSpellTemplate(spell()), { column: 0, row: 0 }, 0, caster, { columns: 18, rows: 18 });
  assert.ok(cells.every(cell => cell.column >= 0 && cell.row >= 0 && cell.column < 18 && cell.row < 18));
});

test("Close circles extend around sized bases and whole-base intersections exclude edge-only contact", () => {
  const circle = getSpellTemplate(spell("Burning Hands"));
  const small = templateCells(circle, { column: 15, row: 15 }, 0, caster, bounds);
  assert.equal(small.length, 9);
  const large = templateCells(circle, { column: 15, row: 15 }, 0, { ...caster, size: 2 }, bounds);
  assert.equal(large.length, 16);
  assert.equal(footprintIntersects(small, { column: 16, row: 16, size: 4 }), true);
  assert.equal(footprintIntersects(small, { column: 17, row: 16, size: 2 }), false);
});

test("coordinate frames follow isometric tilt, rotation, stretching and sized token base anchors", () => {
  for (const rotation of [-140, 0, 50]) for (const width of [1, 2, 3, 4]) {
    const f = fixture({ rotation });
    const token = f.addToken("large", { column: 8, row: 8 }, { width, height: width + 2 });
    const frame = createCoordinateFrame(f.environment);
    assert.deepEqual(frame.footprint(token.document), { column: 8, row: 8, size: width });
    const p = frame.project(9.25, 7.75);
    const local = frame.coordinates(p);
    assert.ok(Math.abs(local.column - 9.25) < 1e-8 && Math.abs(local.row - 7.75) < 1e-8);
  }
  const f = fixture({ isometric: false });
  f.scene.grid.distance = 10;
  const frame = createCoordinateFrame(f.environment);
  assert.deepEqual(frame.project(6, 6), { x: 300, y: 300 });
  assert.equal(frame.footprint(f.hero.document).width, 2);
});

test("placement includes allies and partially covered large bases while hiding secret, invisible and off-Scene tokens", async () => {
  const f = fixture();
  const enemy = f.addToken("enemy", { column: 8, row: 8 }, { disposition: -1 });
  const ally = f.addToken("ally", { column: 9, row: 8 }, { disposition: 1 });
  const large = f.addToken("large", { column: 11, row: 10 }, { width: 3 });
  f.addToken("hidden", { column: 8, row: 9 }, { hidden: true });
  f.addToken("secret", { column: 8, row: 9 }, { isSecret: true });
  const invisible = f.addToken("invisible", { column: 8, row: 9 }); invisible.isVisible = false;
  const preview = f.addToken("preview", { column: 8, row: 9 }); preview.isPreview = true;
  f.addToken("offscene", { column: 8, row: 9 }, { parent: { id: "other" } });
  const context = new SpellTemplatePlacement(spell(), f.actor, {}, f.environment);
  const placing = context.start();
  context.pointerMove(pointer(f, 8.5, 8.5)); f.flush();
  assert.deepEqual(context.targets().map(target => target.uuid), [enemy, ally, large].map(token => token.document.uuid));
  context.cancel(); assert.equal(await placing, false);
  assert.equal(f.environment.canvas.primary.children.length, 0);
});

test("confirmed templates replace previous manual targets and keep every affected UUID for native fast casts", async () => {
  const f = fixture();
  const outside = f.addToken("outside", { column: 0, row: 0 });
  const first = f.addToken("enemy", { column: 8, row: 8 });
  const second = f.addToken("ally", { column: 9, row: 8 });
  setSceneTargets([outside.id], f.environment);
  const config = { skipPrompt: true };
  const { casting } = await placementReady(f, config);
  assert.equal(f.calls.native, 0);
  f.environment.canvas.app.canvas.listeners.get("pointermove")(pointer(f, 8.5, 8.5)); f.flush();
  f.document.listeners.get("pointerdown")(pointer(f, 8.5, 8.5));
  assert.equal(await casting, true);
  assert.deepEqual(config.targetUuids, [first.document.uuid, second.document.uuid]);
  assert.equal(config.targetUuid, first.document.uuid);
  assert.equal(config[MODULE_ID].spellTemplate.confirmed, true);
  assert.equal(f.calls.native, 1);
  assert.deepEqual([...f.environment.game.user.targets], [first, second]);
  assert.equal(f.document.listeners.size, 0);
  assert.equal(f.environment.canvas.primary.children.length, 0);
});

test("cancelling a preview restores earlier targets and never opens the native roll or consumes a spell", async () => {
  for (const ending of ["escape", "button", "scene", "teardown"]) {
    const f = fixture();
    const old = f.addToken("old", { column: 0, row: 0 });
    f.addToken("enemy", { column: 8, row: 8 });
    setSceneTargets([old.id], f.environment);
    const { casting } = await placementReady(f);
    f.environment.canvas.app.canvas.listeners.get("pointermove")(pointer(f, 8.5, 8.5)); f.flush();
    if (ending === "escape") f.document.listeners.get("keydown")({ ...pointer(f, 0, 0), key: "Escape" });
    if (ending === "button") f.api.spellTemplates.cancel();
    if (ending === "scene") f.environment.Hooks.callAll("updateScene", f.scene);
    if (ending === "teardown") f.environment.Hooks.callAll("canvasTearDown");
    assert.equal(await casting, false, ending);
    assert.deepEqual([...f.environment.game.user.targets], [old], ending);
    assert.equal(f.calls.native, 0, ending);
    assert.equal(f.document.listeners.size, 0, ending);
    assert.equal(f.environment.canvas.primary.children.length, 0, ending);
  }
});

test("targets refresh before the cast even without an animation frame, and manual outsiders cannot enter the area list", async () => {
  let continueCast;
  let config;
  const f = fixture({ cast: async function(_uuid, value, environment) {
    config = value;
    await new Promise(resolve => { continueCast = resolve; });
    for (const handler of environment.HooksHandlers ?? []) handler();
    for (const handler of f.hooks.get("SD-Player-Spell")) if (handler(value) === false) return false;
    return true;
  } });
  const inside = f.addToken("inside", { column: 8, row: 8 });
  const moved = f.addToken("moved", { column: 0, row: 0 });
  const outside = f.addToken("outside", { column: 1, row: 1 });
  const current = await placementReady(f);
  f.environment.canvas.app.canvas.listeners.get("pointermove")(pointer(f, 8.5, 8.5)); f.flush();
  f.document.listeners.get("pointerdown")(pointer(f, 8.5, 8.5));
  for (let i = 0; i < 10 && !continueCast; i++) await Promise.resolve();
  Object.assign(inside.document._source, tokenPosition(inside.document, f.layout, { column: 0, row: 0 }));
  Object.assign(moved.document._source, tokenPosition(moved.document, f.layout, { column: 9, row: 8 }));
  setSceneTargets([outside.id], f.environment);
  assert.deepEqual(getSpellTemplateTargets(config).map(target => target.uuid), [moved.document.uuid]);
  syncSpellTemplateTargets(config);
  assert.deepEqual([...f.environment.game.user.targets], [moved]);
  continueCast(); assert.equal(await current.casting, true);
  assert.deepEqual(config.targetUuids, [moved.document.uuid]);
});

test("manual spells, explicit opt-outs and Focus maintenance retain their native targeting paths", async () => {
  const f = fixture();
  for (const [item, config] of [[spell("Magic Missile"), {}], [spell(), { isFocusRoll: true }]]) {
    f.addSpell(item);
    assert.equal(await f.model.castSpell(item.uuid, config), true);
    assert.equal(f.document.body.children.length, 0);
    assert.equal(f.document.listeners.size, 0);
    assert.equal(config[MODULE_ID], undefined);
  }
  const item = f.addSpell(spell()); item.flags[MODULE_ID] = { spellTemplate: { mode: "none" } };
  assert.equal(await f.model.castSpell(item.uuid, {}), true);
});

test("empty areas, out-of-range points and ambiguous caster tokens block placement safely", async () => {
  const f = fixture();
  const context = new SpellTemplatePlacement(spell("Custom", { range: "near" }), f.actor, {}, f.environment);
  context.template = normalizeTemplate({ mode: "cube" });
  const placing = context.start();
  context.pointerMove(pointer(f, 17.5, 17.5)); f.flush();
  assert.equal(context.inRange, false);
  assert.equal(context.accept(), false);
  context.pointerMove(pointer(f, 10.5, 10.5)); f.flush();
  assert.equal(context.inRange, true);
  assert.equal(context.targets().length, 0);
  assert.equal(context.accept(), false);
  context.cancel(); assert.equal(await placing, false);
  f.addToken("hero-copy", { column: 8, row: 8 }, { actor: f.actor });
  assert.equal(findCasterToken(f.actor, f.environment), null);
  f.hero.controlled = false;
  assert.equal(findCasterToken(f.actor, f.environment).id, "hero-copy");
});

test("simultaneous casts create one placement and a rejected native cast still removes preview resources", async () => {
  const f = fixture();
  const item = f.addSpell(spell());
  const first = f.model.castSpell(item.uuid, {});
  const second = f.model.castSpell(item.uuid, {});
  for (let i = 0; i < 10 && !f.document.listeners.has("pointerdown"); i++) await Promise.resolve();
  assert.equal(await second, false);
  assert.equal(f.document.body.children.length, 1);
  f.api.spellTemplates.cancel(); assert.equal(await first, false);
  const rejected = fixture({ cast: async () => { throw new Error("native failure"); } });
  rejected.addToken("enemy", { column: 8, row: 8 });
  const next = await placementReady(rejected);
  const result = assert.rejects(next.casting, /native failure/);
  rejected.document.listeners.get("pointerdown")(pointer(rejected, 8.5, 8.5));
  await result;
  assert.equal(rejected.environment.canvas.primary.children.length, 0);
  assert.equal(rejected.document.listeners.size, 0);
});

test("preview geometry and native targeting skip redundant work while hovering inside one cell", async () => {
  const f = fixture(); f.addToken("enemy", { column: 8, row: 8 });
  const context = new SpellTemplatePlacement(spell(), f.actor, {}, f.environment);
  const placing = context.start();
  context.pointerMove(pointer(f, 8.25, 8.25)); f.flush();
  const before = { ...f.calls };
  for (let i = 0; i < 100; i++) context.pointerMove(pointer(f, 8.25 + i / 1000, 8.25));
  assert.equal(f.frames.size, 0);
  context.redraw();
  assert.equal(f.calls.polygons, before.polygons);
  assert.equal(f.calls.targetChanges, before.targetChanges);
  context.cancel(); await placing;
});

test("template settings edits are ownership-safe, serialized and preserve unrelated item state", async () => {
  globalThis.game = { user: { isGM: false }, system: { id: "shadowdark" } };
  const item = spell();
  item.setFlag = async (scope, key, value) => { await Promise.resolve(); item.flags[scope] ??= {}; item.flags[scope][key] = value; };
  const original = structuredClone(item.system);
  await Promise.all([updateSpellTemplate(item, "mode", "line"), updateSpellTemplate(item, "length", "12"), updateSpellTemplate(item, "width", "2")]);
  assert.equal(getSpellTemplate(item).shape, "line"); assert.equal(getSpellTemplate(item).width, 2);
  assert.deepEqual(item.system, original);
  item.isOwner = false;
  assert.equal(canEditTemplate(item), false);
  assert.equal(await updateSpellTemplate(item, "length", 4), false);
  item.isOwner = true;
  assert.equal(await updateSpellTemplate(item, "length", 4, false), false);
});

test("manifest packages spell templates with localized UI and current board coordinate APIs", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  const language = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.ok(manifest.esmodules.includes("scripts/spell-templates/spell-templates.js"));
  assert.ok(manifest.styles.includes("styles/spell-templates.css"));
  assert.ok(language["MK_SHADOWDARK.spellTemplates.areaTargets"]);
  assert.ok(language["MK_SHADOWDARK.spellTemplates.selectCaster"]);
  assert.equal(visibleSceneToken({ actor: {}, document: { parent: { id: "other" } } }, { canvas: { scene: { id: "scene" } } }), false);
});

test("rotation keys retain their direction offset when a caster-origin line is confirmed by clicking", async () => {
  const f = fixture();
  f.addToken("diagonal", { column: 8, row: 8 });
  const context = new SpellTemplatePlacement(spell("Lightning Bolt"), f.actor, {}, f.environment);
  const placing = context.start();
  context.pointerMove(pointer(f, 10.5, 5.5)); f.flush();
  assert.equal(context.direction, 0);
  context.onKey({ ...pointer(f, 10.5, 5.5), key: "r" }); f.flush();
  assert.equal(context.direction, 1);
  context.onDown(pointer(f, 10.5, 5.5));
  assert.equal(await placing, true);
  assert.equal(context.config[MODULE_ID].spellTemplate.direction, 1);
  context.cleanup();
});

test("area target exclusions apply to the chosen cast and cannot add outsiders", async () => {
  const f = fixture();
  const first = f.addToken("first", { column: 8, row: 8 });
  const second = f.addToken("second", { column: 9, row: 8 });
  const context = new SpellTemplatePlacement(spell(), f.actor, {}, f.environment);
  const placing = context.start();
  context.pointerMove(pointer(f, 8.5, 8.5)); f.flush();
  assert.equal(context.targetList.children.length, 2);
  const checkbox = context.targetList.children[0].children[0];
  checkbox.checked = false; checkbox.listeners.get("change")();
  assert.deepEqual(context.targets().map(target => target.uuid), [second.document.uuid]);
  assert.equal(context.excluded.has(first.document.uuid), true);
  assert.equal(context.accept(), true); assert.equal(await placing, true);
  assert.deepEqual(context.config.targetUuids, [second.document.uuid]);
  context.cleanup();
});

test("settings appear once on native or dashboard spell sheets and remain read-only without edit permission", () => {
  globalThis.game = { system: { id: "shadowdark" }, user: { isGM: false }, i18n: { localize: key => key } };
  const item = spell(); item.flags[MODULE_ID] = { spellTemplate: { mode: "cube", length: 6 } };
  const grid = new Element();
  grid.ownerDocument = { createElement: name => new Element(name) };
  const root = { querySelector: () => grid };
  for (const editable of [true, false]) {
    const app = { item, isEditable: editable };
    renderSpellTemplateSettings(app, root);
    renderSpellTemplateSettings(app, root);
    assert.equal(grid.children.length, 1);
    const controls = grid.children[0].children[1].children.map(label => label.children[1]);
    assert.ok(controls.length >= 4);
    assert.ok(controls.every(input => input.disabled === !editable));
    assert.equal(controls.find(input => input.dataset.spellTemplateField === "length").value, "6");
  }
});

test("the live targeting dialog uses template targets for Self area spells and blocks stale empty casts", async context => {
  context.mock.method(console, "log", () => {});
  const timers = [];
  context.mock.method(globalThis, "setTimeout", callback => { timers.push(callback); return timers.length; });
  let continueCast;
  let dialog;
  class RollDialog {
    constructor(config) {
      this.config = config; this.events = new Map(); this.submissions = 0;
      this.element = new Element("form"); this.element.isConnected = true;
      const submit = new Element("button"); submit.type = "submit";
      const heading = new Element("h2");
      this.element.append(heading, submit);
    }
    _onRender() {}
    _onSubmit() { this.submissions++; }
    addEventListener(name, callback) { this.events.set(name, callback); }
  }
  const f = fixture({ cast: async function(_uuid, config, environment) {
    config.type = "spell"; config.cast = { range: "Self" }; config.mainRoll = { advantage: 1, bonus: "+2" };
    dialog = new RollDialog(config); dialog._onRender();
    await new Promise(resolve => { continueCast = resolve; });
    for (const callback of f.hooks.get("SD-Player-Spell")) if (callback(config) === false) return false;
    dialog.events.get("close")();
    return true;
  } });
  const previous = new Map(["game", "canvas", "document", "Hooks", "shadowdark"].map(key => [key, globalThis[key]]));
  context.after(() => { for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  Object.assign(globalThis, { game: f.environment.game, canvas: f.environment.canvas, document: f.document,
    Hooks: f.environment.Hooks, shadowdark: { apps: { RollDialogSD: RollDialog } } });
  await import(`../scripts/targeting-assistant/targeting-assistant.js?area-dialog=${Date.now()}`);
  // The final ready callback belongs to the targeting assistant; model wrappers are already installed.
  f.hooks.get("ready").at(-1)();
  const item = f.addSpell(spell("Custom aura", { range: "Self" }));
  item.flags[MODULE_ID] = { spellTemplate: { mode: "circle", origin: "caster", length: 1, excludeCaster: true } };
  const inside = f.addToken("inside", { column: 6, row: 5 });
  const outsider = f.addToken("outside", { column: 12, row: 12 });
  const config = {};
  const casting = f.model.castSpell(item.uuid, config);
  for (let i = 0; i < 10 && !f.document.listeners.has("pointerdown"); i++) await Promise.resolve();
  const confirm = f.document.body.children[0].children.at(-1).children.at(-1);
  confirm.listeners.get("click")();
  for (let i = 0; i < 10 && !dialog; i++) await Promise.resolve();
  assert.deepEqual(config.targetUuids, [inside.document.uuid]);
  assert.notEqual(config.targetUuid, f.hero.document.uuid);
  assert.match(dialog.element.querySelector(".mk-targeting-assistant").html, /areaTargets \(1\)/);
  assert.equal(dialog.element.querySelector('button[type="submit"]').disabled, false);
  setSceneTargets([outsider.id], f.environment);
  f.environment.Hooks.callAll("targetToken", f.environment.game.user);
  for (const callback of timers.splice(0)) callback();
  assert.deepEqual([...f.environment.game.user.targets], [inside]);
  inside.isVisible = false;
  const event = { prevented: false, preventDefault() { this.prevented = true; } };
  dialog._onSubmit(event);
  assert.equal(event.prevented, true);
  assert.equal(dialog.submissions, 0);
  assert.equal(dialog.element.querySelector('button[type="submit"]').disabled, true);
  inside.isVisible = true;
  dialog._onSubmit(event);
  assert.equal(dialog.submissions, 1);
  assert.deepEqual(config.mainRoll, { advantage: 1, bonus: "+2" });
  continueCast(); assert.equal(await casting, true);
});

test("casting temporarily minimizes the caster sheet and restores it before the roll or after cancellation", async () => {
  for (const cancel of [false, true]) {
    const order = [];
    const f = fixture({ cast: async () => { order.push("native"); return true; } });
    f.actor.sheet = { rendered: true, minimized: false,
      async minimize() { this.minimized = true; order.push("minimize"); },
      async maximize() { this.minimized = false; order.push("maximize"); } };
    f.addToken("enemy", { column: 8, row: 8 });
    const current = await placementReady(f);
    assert.equal(f.actor.sheet.minimized, true);
    if (cancel) f.api.spellTemplates.cancel();
    else f.document.listeners.get("pointerdown")(pointer(f, 8.5, 8.5));
    assert.equal(await current.casting, !cancel);
    assert.equal(f.actor.sheet.minimized, false);
    assert.deepEqual(order, cancel ? ["minimize", "maximize"] : ["minimize", "maximize", "native"]);
  }
});

test("the final native spell hook rejects an area emptied after confirmation and restores the prior selection", async () => {
  let release;
  const f = fixture({ cast: async (_uuid, config) => {
    await new Promise(resolve => { release = resolve; });
    return f.hooks.get("SD-Player-Spell").every(callback => callback(config) !== false);
  } });
  const enemy = f.addToken("enemy", { column: 8, row: 8 });
  const old = f.addToken("old", { column: 0, row: 0 });
  setSceneTargets([old.id], f.environment);
  const current = await placementReady(f);
  f.document.listeners.get("pointerdown")(pointer(f, 8.5, 8.5));
  for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
  enemy.document.hidden = true;
  release(); assert.equal(await current.casting, false);
  assert.deepEqual([...f.environment.game.user.targets], [old]);
  assert.equal(f.environment.canvas.primary.children.length, 0);
});

const fireWallPath = [{ column: 7, row: 7 }, { column: 8, row: 7 }, { column: 9, row: 7 },
  { column: 9, row: 8 }, { column: 9, row: 9 }, { column: 10, row: 9 }];

test("Fire Wall infers a six-cell area-only path, including translated contiguous-line descriptions", () => {
  for (const item of [spell("Fire Wall"), spell("Wall of Fire"), spell("Translated", {
    description: "Creates a contiguous near-sized line within range." })]) {
    const template = getSpellTemplate(item);
    assert.equal(template.shape, "path"); assert.equal(template.length, 6);
    assert.equal(template.width, 1); assert.equal(template.areaOnly, true); assert.equal(template.origin, "point");
  }
  assert.equal(getSpellTemplate(spell("Lightning Bolt")).areaOnly, false);
  assert.equal(validPath(fireWallPath, 6, bounds), true);
  assert.equal(validPath([{ column: 7, row: 7 }, { column: 8, row: 8 }], 2, bounds), false);
  assert.equal(validPath([...fireWallPath.slice(0, 5), fireWallPath[0]], 6, bounds), false);
  assert.equal(validPath(fireWallPath, 5, bounds), false);
});

async function fireWallReady(f, config = {}) {
  const item = f.addSpell(spell("Fire Wall", { range: "Near", duration: { type: "focus" } }));
  const casting = f.model.castSpell(item.uuid, config);
  for (let i = 0; i < 10 && !f.document.listeners.has("pointerdown"); i++) await Promise.resolve();
  assert.ok(f.document.listeners.has("pointerdown"));
  for (const cell of fireWallPath) f.document.listeners.get("pointerdown")(pointer(f, cell.column + 0.5, cell.row + 0.5));
  return { item, casting, config };
}

function confirmFireWall(f) {
  const actions = f.document.body.children[0].children.at(-1);
  actions.children.at(-1).listeners.get("click")();
}

test("Fire Wall permits a bent empty area, clears creature targets, and preserves its chosen cells through a fast cast", async () => {
  const f = fixture();
  const enemy = f.addToken("enemy", fireWallPath[0]);
  setSceneTargets([enemy.id], f.environment);
  const current = await fireWallReady(f, { skipPrompt: true });
  assert.equal(f.calls.native, 0);
  assert.deepEqual([...f.environment.game.user.targets], []);
  assert.equal(f.document.body.children[0].children.at(-1).children.at(-1).disabled, false);
  confirmFireWall(f);
  assert.equal(await current.casting, true);
  assert.deepEqual(current.config.targetUuids, []);
  assert.equal(current.config.targetUuid, undefined);
  const area = current.config[MODULE_ID].spellTemplate;
  assert.equal(area.areaOnly, true); assert.deepEqual(area.cells, fireWallPath);
  assert.equal(area.casterTokenUuid, f.hero.document.uuid);
  assert.equal(area.frameSignature, JSON.stringify(f.layout));
  assert.equal(f.environment.canvas.primary.children.length, 0);
});

test("wall drawing rejects gaps, diagonal-only contact, duplicates, excess length and out-of-range cells, with undo and clear", async () => {
  const f = fixture();
  const context = new SpellTemplatePlacement(spell("Fire Wall", { range: "Near" }), f.actor, {}, f.environment);
  const placing = context.start();
  assert.equal(context.accept(), false);
  assert.equal(context.choosePathCell({ column: 18, row: 7 }), false);
  assert.equal(context.choosePathCell({ column: 12, row: 5 }), false);
  assert.equal(context.choosePathCell(fireWallPath[0]), true);
  assert.equal(context.choosePathCell({ column: 9, row: 7 }), false);
  assert.equal(context.choosePathCell({ column: 8, row: 8 }), false);
  assert.equal(context.accept(), false);
  for (const cell of fireWallPath.slice(1)) assert.equal(context.choosePathCell(cell), true);
  assert.equal(context.choosePathCell({ column: 11, row: 9 }), false);
  assert.equal(context.choosePathCell(fireWallPath[2]), true);
  assert.equal(context.path.length, 3);
  const actions = context.hud.children.at(-1);
  actions.children[0].listeners.get("click")(); assert.equal(context.path.length, 2);
  actions.children[1].listeners.get("click")(); assert.equal(context.path.length, 0);
  context.cancel(); assert.equal(await placing, false);
});

test("cancelling Fire Wall restores selection, and casting requires an online GM for tile creation", async () => {
  const f = fixture(); const old = f.addToken("old", { column: 0, row: 0 });
  setSceneTargets([old.id], f.environment);
  const current = await fireWallReady(f);
  f.api.spellTemplates.cancel();
  assert.equal(await current.casting, false); assert.equal(f.calls.native, 0);
  assert.deepEqual([...f.environment.game.user.targets], [old]);
  f.environment.game.users = [f.environment.game.user];
  assert.equal(await f.model.castSpell(current.item.uuid, {}), false);
  assert.equal(f.calls.native, 0); assert.match(f.calls.warnings.at(-1), /gmRequired/);
});

test("the native casting dialog enables an empty confirmed Fire Wall and rejects a stale area without permitting manual targets", async context => {
  context.mock.method(console, "log", () => {});
  const timers = [];
  context.mock.method(globalThis, "setTimeout", callback => { timers.push(callback); return timers.length; });
  let dialog, release;
  class RollDialog {
    constructor(config) {
      this.config = config; this.submissions = 0; this.events = new Map();
      this.element = new Element("form"); this.element.isConnected = true;
      const submit = new Element("button"); submit.type = "submit"; this.element.append(submit);
    }
    _onRender() {}
    _onSubmit() { this.submissions++; }
    addEventListener(name, fn) { this.events.set(name, fn); }
  }
  const f = fixture({ cast: async (_uuid, config) => {
    config.type = "spell"; config.cast = { range: "Near" };
    dialog = new RollDialog(config); dialog._onRender();
    await new Promise(resolve => { release = resolve; });
    const allowed = f.hooks.get("SD-Player-Spell").every(callback => callback(config) !== false);
    dialog.events.get("close")(); return allowed;
  } });
  const previous = new Map(["game", "canvas", "document", "Hooks", "shadowdark"].map(key => [key, globalThis[key]]));
  context.after(() => { for (const [key, value] of previous) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  } });
  Object.assign(globalThis, { game: f.environment.game, canvas: f.environment.canvas, document: f.document,
    Hooks: f.environment.Hooks, shadowdark: { apps: { RollDialogSD: RollDialog } } });
  await import(`../scripts/targeting-assistant/targeting-assistant.js?fire-wall=${Date.now()}`);
  f.hooks.get("ready").at(-1)();
  const current = await fireWallReady(f);
  confirmFireWall(f);
  for (let i = 0; i < 10 && !dialog; i++) await Promise.resolve();
  assert.equal(spellTemplateCanCast(current.config), true);
  assert.equal(dialog.element.querySelector('button[type="submit"]').disabled, false);
  assert.match(dialog.element.querySelector(".mk-targeting-assistant").html, /areaSelected/);
  const outsider = f.addToken("outsider", { column: 0, row: 0 });
  setSceneTargets([outsider.id], f.environment);
  f.environment.Hooks.callAll("targetToken", f.environment.game.user);
  for (const callback of timers.splice(0)) callback();
  assert.equal(f.environment.game.user.targets.size, 0);
  const event = { preventDefault() { this.prevented = true; } };
  dialog._onSubmit(event); assert.equal(dialog.submissions, 1);
  f.scene.getFlag = () => ({ enabled: true, boardSize: 12 });
  f.api.isometricBoard.layout = createLayout(f.scene);
  dialog._onSubmit(event);
  assert.equal(event.prevented, true); assert.equal(dialog.submissions, 1);
  assert.equal(dialog.element.querySelector('button[type="submit"]').disabled, true);
  release(); assert.equal(await current.casting, false);
});

async function tileFixture(options = {}) {
  const f = fixture({ gm: true, ...options });
  const current = await fireWallReady(f); confirmFireWall(f); await current.casting;
  const calls = { creates: 0, flags: 0, polygons: [], textures: 0, deletions: [] };
  const context = { scale() {}, translate() {}, createLinearGradient() { return { addColorStop() {} }; },
    beginPath() { calls.polygons.push([]); }, moveTo(x, y) { calls.polygons.at(-1).push({ x, y }); },
    lineTo(x, y) { calls.polygons.at(-1).push({ x, y }); }, closePath() {}, fill() {}, stroke() {} };
  const originalCreate = f.document.createElement;
  f.document.createElement = tag => tag === "canvas" ? { getContext: () => context,
    toDataURL(type) { assert.equal(type, "image/png"); calls.textures++; return "data:image/png;base64,dGVzdA=="; } } : originalCreate(tag);
  f.environment.game.release = { generation: 13 };
  const player = { id: "player", isGM: false };
  f.actor.testUserPermission = user => user.id === player.id;
  f.environment.fromUuid = async uuid => uuid === current.item.uuid ? current.item
    : uuid === f.hero.document.uuid ? f.hero.document : uuid === f.actor.uuid ? f.actor : null;
  f.scene.tiles = [];
  f.scene.createEmbeddedDocuments = async (type, data) => {
    assert.equal(type, "Tile"); calls.creates++;
    const tile = { id: "tile", ...data[0] }; f.scene.tiles.push(tile); return [tile];
  };
  f.scene.deleteEmbeddedDocuments = async (type, ids) => {
    assert.equal(type, "Tile"); calls.deletions.push([...ids]);
    f.scene.tiles = f.scene.tiles.filter(tile => !ids.includes(tile.id));
  };
  const message = { id: "cast", uuid: "ChatMessage.cast", author: player, flags: { shadowdark: { rollConfig: current.config } },
    rolls: [{ options: { type: "main" }, success: true }],
    async setFlag(scope, key, value) { calls.flags++; this.flags[scope] ??= {}; this.flags[scope][key] = value; } };
  f.environment.game.messages = new Map([[message.id, message]]);
  Object.defineProperty(f.environment.game.messages, "contents", { get() { return [...this.values()]; } });
  return { ...f, current, tileCalls: calls, message };
}

test("the primary GM creates one transparent tile matching a successful player Fire Wall's exact isometric polygons", async () => {
  const f = await tileFixture({ rotation: 25, tilt: 38 });
  const [tile] = await Promise.all([createSpellAreaTile(f.message, f.environment), createSpellAreaTile(f.message, f.environment)]);
  assert.ok(tile); assert.equal(f.tileCalls.creates, 1); assert.equal(f.tileCalls.flags, 1);
  assert.equal(tile.alpha, 0.7); assert.equal(tile.hidden, false); assert.equal(tile.locked, false);
  assert.equal(tile.anchorX, undefined);
  assert.equal(f.tileCalls.polygons.length, 6);
  assert.deepEqual(f.tileCalls.polygons[0], [[0, 0], [1, 0], [1, 1], [0, 1]]
    .map(([column, row]) => project(f.layout, 7 + column, 7 + row)));
  assert.deepEqual(tile.flags[MODULE_ID].spellAreaTile.cells, fireWallPath);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.castId, f.message.uuid);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.animation, "fire");
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.color, "#f47726");
  assert.equal(f.message.flags[MODULE_ID].spellAreaTile.tileId, tile.id);
  await createSpellAreaTile(f.message, f.environment); assert.equal(f.tileCalls.creates, 1);
  f.scene.tiles = [];
  await createSpellAreaTile(f.message, f.environment); assert.equal(f.tileCalls.creates, 1, "deleting a tile does not recreate it on chat updates");
});

test("v14 area tiles use an explicit top-left anchor and render while the GM views another Scene", async () => {
  for (const isometric of [true, false]) {
    const f = await tileFixture({ isometric, rotation: 22 });
    f.environment.game.release.generation = 14;
    f.scene.getDimensions = () => ({ sceneRect: { x: 0, y: 0, width: 4000, height: 3000 } });
    f.environment.canvas.scene = { id: "other" };
    const tile = await createSpellAreaTile(f.message, f.environment);
    assert.ok(tile); assert.equal(tile.anchorX, 0); assert.equal(tile.anchorY, 0);
    const frame = createSceneCoordinateFrame(f.scene, f.environment);
    const geometry = areaTileGeometry(fireWallPath, frame);
    assert.equal(tile.x, geometry.x); assert.equal(tile.y, geometry.y);
    assert.equal(tile.width, geometry.width); assert.equal(tile.height, geometry.height);
  }
});

test("failed, cancelled, Focus and unconfirmed casts never create wall tiles", async () => {
  for (const failure of ["failed", "critical", "cancelled", "unconfirmed", "focus"]) {
    const f = await tileFixture();
    if (failure === "failed") f.message.rolls[0].success = false;
    if (failure === "critical") f.message.rolls[0].criticalFailure = true;
    if (failure === "cancelled") f.message.rolls = [];
    if (failure === "unconfirmed") f.current.config[MODULE_ID].spellTemplate.confirmed = false;
    if (failure === "focus") f.current.config.isFocusRoll = true;
    assert.equal(await createSpellAreaTile(f.message, f.environment), null, failure);
    assert.equal(f.tileCalls.creates, 0, failure);
  }
});

test("tile creation rejects non-authoritative clients, unauthorized casters, malformed shapes and changed Scene geometry", async () => {
  for (const failure of ["player", "second-gm", "owner", "caster", "gap", "duplicate", "length", "range", "layout", "spell"]) {
    const f = await tileFixture();
    const area = f.current.config[MODULE_ID].spellTemplate;
    if (failure === "player") f.environment.game.user.isGM = false;
    if (failure === "second-gm") f.environment.game.users.push({ id: "aaa", active: true, isGM: true });
    if (failure === "owner") f.actor.testUserPermission = () => false;
    if (failure === "caster") f.current.config.actorUuid = "Actor.other";
    if (failure === "gap") area.cells[3] = { column: 11, row: 7 };
    if (failure === "duplicate") area.cells[3] = { ...area.cells[0] };
    if (failure === "length") area.cells.pop();
    if (failure === "range") area.cells = Array.from({ length: 6 }, (_, i) => ({ column: 12, row: i + 5 }));
    if (failure === "layout") area.frameSignature = "outdated";
    if (failure === "spell") f.current.item.name = "Magic Missile";
    assert.equal(await createSpellAreaTile(f.message, f.environment), null, failure);
    assert.equal(f.tileCalls.creates, 0, failure);
  }
});

test("a tile creation failure can retry, and a missed completion flag is recovered without duplicating the tile", async () => {
  const f = await tileFixture();
  const create = f.scene.createEmbeddedDocuments;
  f.scene.createEmbeddedDocuments = async () => { throw new Error("temporary failure"); };
  await assert.rejects(createSpellAreaTile(f.message, f.environment), /temporary failure/);
  f.scene.createEmbeddedDocuments = create;
  const save = f.message.setFlag;
  f.message.setFlag = async () => { throw new Error("flag failure"); };
  await assert.rejects(createSpellAreaTile(f.message, f.environment), /flag failure/);
  f.message.setFlag = save;
  const existing = await createSpellAreaTile(f.message, f.environment);
  assert.equal(existing.id, "tile"); assert.equal(f.tileCalls.creates, 1); assert.equal(f.tileCalls.flags, 1);
});

test("area-only walls never capture stale manual targets or apply immediate Auto Damage", async () => {
  const f = await tileFixture();
  const old = f.addToken("previous-target", fireWallPath[0]);
  setSceneTargets([old.id], f.environment);
  f.current.config.cast.damageType = "damage";
  assert.deepEqual(snapshotTargetUuids(f.message, f.environment.game.user), []);
  assert.equal(await resolveAutoDamageOperation(f.message), null);
  assert.equal(f.environment.game.user.targets.has(old), true);
});

test("a spell's Animated fire opt-out is recorded on the area tile without changing Focus cleanup", async () => {
  const f = await tileFixture();
  f.current.item.flags[MODULE_ID] = { spellTemplate: { mode: "path", animate: false } };
  const tile = await createSpellAreaTile(f.message, f.environment);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.animation, null);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.focusManaged, true);
});

async function focusLifecycleFixture() {
  const f = await tileFixture();
  f.actor.name = "Caster";
  f.actor.effects = [];
  f.actor.flags = { [MODULE_ID]: { focusTracker: { sessions: [{ id: "wall-focus", name: "Fire Wall",
    spellUuid: f.current.item.uuid, sourceItemUuid: f.current.item.uuid,
    effectCastId: f.message.uuid, effectTargetUuids: [], pendingChecks: [{ id: "check", reason: "damage" }] }] } } };
  f.actor.getFlag = (scope, key) => f.actor.flags?.[scope]?.[key];
  f.actor.setFlag = async (scope, key, value) => { f.actor.flags[scope] ??= {}; f.actor.flags[scope][key] = value; };
  f.actor.unsetFlag = async (scope, key) => { delete f.actor.flags?.[scope]?.[key]; };
  f.environment.ui.notifications.error = () => {};
  f.environment.game.settings.get = (_module, key) => key === "focusTrackerEnabled";
  const messages = [];
  const source = (await readFile(new URL("../scripts/focus-spell-tracker/focus-spell-tracker.js", import.meta.url), "utf8"))
    .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm, "")
    .replace(/\}\)\(\);\s*$/, "globalThis.focusLifecycleHarness = { handleCastResult };})();");
  const sandbox = { ...f.environment, console, onCharacterSheetRender() {}, captureSpellEffectLink, spellTargetUuids,
    window: { setTimeout: callback => callback() },
    ChatMessage: { getSpeaker: ({ actor }) => ({ actor: actor.id }), async create(data) { messages.push(data); return data; } } };
  vm.runInNewContext(source, sandbox);
  f.hooks.get("init").at(-1)();
  return { ...f, focus: f.api.focus, harness: sandbox.focusLifecycleHarness, lifecycleMessages: messages };
}

test("ending an untargeted Fire Wall removes its linked tile even with Spell Effects disabled and silent announcements", async () => {
  const f = await focusLifecycleFixture();
  const tile = await createSpellAreaTile(f.message, f.environment);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.focusManaged, true);
  assert.equal(tile.flags[MODULE_ID].spellAreaTile.actorUuid, f.actor.uuid);
  assert.equal(f.environment.game.settings.get(MODULE_ID, "spellEffectsEnabled"), false);
  assert.equal(await f.focus.endFocus(f.actor, "wall-focus", { announce: false }), true);
  assert.equal(f.focus.getSessions(f.actor).length, 0);
  assert.equal(f.scene.tiles.length, 0);
  assert.deepEqual(f.tileCalls.deletions, [[tile.id]]);
  assert.equal(f.message.flags[MODULE_ID].spellAreaTile.ended, true);
  assert.equal(f.lifecycleMessages.length, 0);
  await createSpellAreaTile(f.message, f.environment);
  assert.equal(f.tileCalls.creates, 1, "chat updates cannot recreate a wall after Focus ends");
});

test("failed and critical Focus checks remove Fire Wall, while successful Focus checks preserve it", async () => {
  for (const outcome of ["success", "failure", "criticalFailure"]) {
    const f = await focusLifecycleFixture();
    await createSpellAreaTile(f.message, f.environment);
    f.current.item.update = async update => { if (update["system.lost"]) f.current.item.system.lost = true; };
    f.environment.game.messages.set("check", { id: "check", speaker: { actor: f.actor.id },
      flags: { shadowdark: { success: outcome === "success", critical: outcome === "criticalFailure" ? "failure" : null } },
      rolls: [{ options: { type: "main" }, success: outcome === "success" }] });
    const context = { actor: f.actor, spell: f.current.item, sourceItem: f.current.item,
      isFocusSpell: true, isFocusCheck: true, checkId: "check", messageIdsBefore: new Set([f.message.id]) };
    await f.harness.handleCastResult(context, outcome === "success");
    assert.equal(f.scene.tiles.length, outcome === "success" ? 1 : 0, outcome);
    assert.equal(f.focus.getSessions(f.actor).length, outcome === "success" ? 1 : 0, outcome);
    assert.equal(f.current.item.system.lost === true, outcome === "criticalFailure", outcome);
    assert.equal(f.lifecycleMessages.length, outcome === "success" ? 0 : 1, outcome);
  }
});

test("Focus cleanup preserves other casts and casters and finds its own tiles on other Scenes", async () => {
  const f = await focusLifecycleFixture();
  const tile = await createSpellAreaTile(f.message, f.environment);
  const owned = tile.flags[MODULE_ID].spellAreaTile;
  f.scene.tiles.push({ id: "different-cast", flags: { [MODULE_ID]: { spellAreaTile: { ...owned, castId: "ChatMessage.other" } } } },
    { id: "different-caster", flags: { [MODULE_ID]: { spellAreaTile: { ...owned, actorUuid: "Actor.other" } } } },
    { id: "normal-tile", flags: {} });
  const distant = { id: "distant", tiles: [{ id: "distant-wall", flags: structuredClone(tile.flags) }],
    async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "Tile"); this.tiles = this.tiles.filter(entry => !ids.includes(entry.id)); } };
  f.environment.game.scenes.set(distant.id, distant);
  f.environment.canvas.scene = { id: "viewing-another-scene" };
  await f.focus.endFocus(f.actor, "wall-focus", { announce: false });
  assert.deepEqual(f.scene.tiles.map(entry => entry.id), ["different-cast", "different-caster", "normal-tile"]);
  assert.equal(distant.tiles.length, 0);
});

test("player Focus cleanup is delivered to the authoritative GM, and an active Focus cast cannot be removed", async () => {
  const f = await focusLifecycleFixture();
  await createSpellAreaTile(f.message, f.environment);
  const listeners = new Map(), sent = [];
  f.environment.game.socket = { on: (name, callback) => listeners.set(name, callback),
    emit: (name, payload) => sent.push({ name, payload }) };
  f.hooks.get("ready")[0]();
  f.environment.game.user.isGM = false;
  assert.deepEqual(await removeSpellAreaTilesForFocus({ actorUuid: f.actor.uuid, castId: f.message.uuid }, f.environment),
    { removed: 0, queued: true });
  assert.equal(f.scene.tiles.length, 1); assert.equal(sent[0].name, `module.${MODULE_ID}`);
  f.environment.game.user.isGM = true;
  assert.deepEqual(await removeSpellAreaTilesForFocus(sent[0].payload, f.environment), { removed: 0, queued: false });
  assert.equal(f.scene.tiles.length, 1);
  await f.actor.unsetFlag(MODULE_ID, "focusTracker");
  listeners.get(`module.${MODULE_ID}`)(sent[0].payload);
  for (let i = 0; i < 30 && f.scene.tiles.length; i++) await Promise.resolve();
  assert.equal(f.scene.tiles.length, 0);
});

test("ending Focus during a slow tile creation deletes the late tile and prevents its recreation", async () => {
  const f = await focusLifecycleFixture();
  let finishCreate;
  const create = f.scene.createEmbeddedDocuments;
  f.scene.createEmbeddedDocuments = async (...args) => {
    await new Promise(resolve => { finishCreate = resolve; }); return create(...args);
  };
  const creation = createSpellAreaTile(f.message, f.environment);
  for (let i = 0; i < 20 && !finishCreate; i++) await Promise.resolve();
  assert.ok(finishCreate);
  await f.focus.endFocus(f.actor, "wall-focus", { announce: false });
  assert.equal(f.message.flags[MODULE_ID].spellAreaTile.ended, true);
  finishCreate(); assert.equal(await creation, null);
  assert.equal(f.scene.tiles.length, 0); assert.equal(f.tileCalls.deletions.length, 1);
  await createSpellAreaTile(f.message, f.environment); assert.equal(f.tileCalls.creates, 1);
});

test("ready reconciliation removes Focus walls ended while the GM was offline, preserving active sessions", async () => {
  const f = await focusLifecycleFixture();
  await createSpellAreaTile(f.message, f.environment);
  await reconcileFocusAreaTiles(f.environment);
  assert.equal(f.scene.tiles.length, 1);
  await f.actor.unsetFlag(MODULE_ID, "focusTracker");
  f.environment.game.messages.clear();
  await reconcileFocusAreaTiles(f.environment);
  assert.equal(f.scene.tiles.length, 0, "persisted tile linkage survives deleting the casting chat message");
});

test("legacy wall tiles are removed through their casting message and repeated cleanup is safe", async () => {
  const f = await focusLifecycleFixture();
  const tile = await createSpellAreaTile(f.message, f.environment);
  delete tile.flags[MODULE_ID].spellAreaTile.actorUuid;
  delete tile.flags[MODULE_ID].spellAreaTile.focusManaged;
  await f.actor.unsetFlag(MODULE_ID, "focusTracker");
  const results = await Promise.all(Array.from({ length: 3 }, () =>
    removeSpellAreaTilesForFocus({ actorUuid: f.actor.uuid, castId: f.message.uuid }, f.environment)));
  assert.ok(results.every(result => result.removed === 1));
  assert.equal(f.tileCalls.deletions.length, 1);
  assert.deepEqual(await removeSpellAreaTilesForFocus({ actorUuid: f.actor.uuid, castId: f.message.uuid }, f.environment),
    { removed: 0, queued: false });
});

test("Focus state write failures retain the wall, while a failed tile deletion can be reconciled later", async context => {
  context.mock.method(console, "error", () => {}); context.mock.method(console, "warn", () => {});
  const f = await focusLifecycleFixture();
  await createSpellAreaTile(f.message, f.environment);
  const unset = f.actor.unsetFlag;
  f.actor.unsetFlag = async () => { throw new Error("state write failed"); };
  assert.equal(await f.focus.endFocus(f.actor, "wall-focus", { announce: false }), false);
  assert.equal(f.scene.tiles.length, 1);
  f.actor.unsetFlag = unset;
  const remove = f.scene.deleteEmbeddedDocuments;
  f.scene.deleteEmbeddedDocuments = async () => { throw new Error("tile delete failed"); };
  assert.equal(await f.focus.endFocus(f.actor, "wall-focus", { announce: false }), true);
  assert.equal(f.scene.tiles.length, 1);
  f.scene.deleteEmbeddedDocuments = remove;
  await reconcileFocusAreaTiles(f.environment);
  assert.equal(f.scene.tiles.length, 0);
});
