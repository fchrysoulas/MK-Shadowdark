import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildUpgradeChanges, getWeaponUpgrades, renderWeaponUpgrades, setWeaponUpgrade
} from "../scripts/weapon-upgrades/weapon-upgrades.js";

const MODULE_ID = "mk-shadowdark";
const FLAG = "downtimeWeaponUpgrades";
const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

function setup({ isGM = true, type = "Weapon", effects = [] } = {}) {
  globalThis.game = {
    user: { isGM }, system: { id: "shadowdark" },
    i18n: { localize: key => translations[key] ?? key }
  };
  const notifications = [];
  globalThis.ui = { notifications: {
    warn: message => notifications.push(message), error: message => notifications.push(message)
  } };
  globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
  let nextId = 0;
  const item = {
    type, uuid: "Actor.hero.Item.sword", img: "sword.webp", effects: structuredClone(effects),
    system: { damage: { oneHanded: "d6", twoHanded: "d8" }, magicItem: false },
    writes: [],
    async createEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      await Promise.resolve();
      const created = data.map(effect => ({ ...structuredClone(effect), id: `upgrade-${++nextId}` }));
      this.effects.push(...created);
      this.writes.push({ operation: "create", data });
      return created;
    },
    async updateEmbeddedDocuments(type, data) {
      assert.equal(type, "ActiveEffect");
      if (this.failNextUpdate) {
        this.failNextUpdate = false;
        throw new Error("Update failed");
      }
      const updated = data.map(({ _id, ...effect }) => {
        const existing = this.effects.find(entry => entry.id === _id);
        assert.ok(existing);
        Object.assign(existing, structuredClone(effect));
        return existing;
      });
      this.writes.push({ operation: "update", data });
      return updated;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      const deleted = this.effects.filter(effect => ids.includes(effect.id));
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
      this.writes.push({ operation: "delete", ids });
      return deleted;
    }
  };
  return { item, notifications };
}

function managedEffect(id, changes, extra = {}) {
  return { id, flags: { [MODULE_ID]: { [FLAG]: true } }, changes, ...extra };
}

test("weapon upgrades default to none and read only the module's managed effect", () => {
  const { item } = setup({ effects: [
    { id: "magic", changes: [{ key: "system.roll.attack.bonus.this", value: "5" }] }
  ] });
  assert.deepEqual(getWeaponUpgrades(item), { attackBonus: false, damageBonus: false, damageDieSteps: 0 });
  item.effects.push(managedEffect("training", [
    { key: "system.roll.attack.bonus.this", value: "1" },
    { key: "system.roll.attack.damage.this", value: "1" },
    { key: "system.roll.attack.upgrade-damage-die.this", value: "99" }
  ], { isSuppressed: true }));
  assert.deepEqual(getWeaponUpgrades(item), { attackBonus: true, damageBonus: true, damageDieSteps: 2 });
});

test("training uses native weapon-specific ADD keys rather than magical-item data or actor-wide bonuses", () => {
  setup();
  assert.deepEqual(buildUpgradeChanges({ attackBonus: true, damageBonus: true, damageDieSteps: 2 }), [
    { key: "system.roll.attack.bonus.this", mode: 2, value: "1" },
    { key: "system.roll.attack.damage.this", mode: 2, value: "1" },
    { key: "system.roll.attack.upgrade-damage-die.this", mode: 2, value: "2" }
  ]);
});

test("GMs can apply and remove upgrades without stacking bonuses or modifying other effects and base damage", async () => {
  const unrelated = { id: "magic", changes: [{ key: "system.roll.attack.damage.this", value: "3", mode: 2 }] };
  const { item } = setup({ effects: [unrelated] });
  const originalSystem = structuredClone(item.system);
  assert.equal(await setWeaponUpgrade(item, "attackBonus", true), true);
  assert.equal(await setWeaponUpgrade(item, "attackBonus", true), true);
  assert.equal(await setWeaponUpgrade(item, "damageBonus", true), true);
  assert.equal(await setWeaponUpgrade(item, "damageDieSteps", "2"), true);
  assert.equal(item.effects.length, 2);
  const effect = item.effects[1];
  assert.equal(effect.transfer, true);
  assert.equal(effect.disabled, false);
  assert.equal(effect.origin, item.uuid);
  assert.equal(effect.name, "Downtime Upgrades");
  assert.equal(effect.changes.length, 3);
  assert.equal(effect.changes[0].value, "1");
  assert.deepEqual(item.effects[0], unrelated);
  assert.deepEqual(item.system, originalSystem);
  await setWeaponUpgrade(item, "attackBonus", false);
  assert.equal(item.effects[1].changes.length, 2);
  await setWeaponUpgrade(item, "damageBonus", false);
  await setWeaponUpgrade(item, "damageDieSteps", 0);
  assert.deepEqual(item.effects, [unrelated]);
  assert.deepEqual(item.system, originalSystem);
});

test("rapid edits retain all selected upgrades in one effect and clear them without races", async () => {
  const { item } = setup();
  assert.deepEqual(await Promise.all([
    setWeaponUpgrade(item, "attackBonus", true),
    setWeaponUpgrade(item, "damageBonus", true),
    setWeaponUpgrade(item, "damageDieSteps", 2)
  ]), [true, true, true]);
  assert.equal(item.effects.length, 1);
  assert.deepEqual(getWeaponUpgrades(item), { attackBonus: true, damageBonus: true, damageDieSteps: 2 });
  await Promise.all([
    setWeaponUpgrade(item, "attackBonus", false),
    setWeaponUpgrade(item, "damageBonus", false),
    setWeaponUpgrade(item, "damageDieSteps", 0)
  ]);
  assert.equal(item.effects.length, 0);
});

test("editing a disabled training effect enables it and cleans up only duplicate managed effects", async () => {
  const changes = [{ key: "system.roll.attack.bonus.this", value: "1" }];
  const { item } = setup({ effects: [
    managedEffect("first", changes, { disabled: true }),
    managedEffect("duplicate", changes),
    { id: "other", changes }
  ] });
  await setWeaponUpgrade(item, "damageBonus", true);
  assert.deepEqual(item.effects.map(effect => effect.id), ["first", "other"]);
  assert.equal(item.effects[0].disabled, false);
  assert.deepEqual(getWeaponUpgrades(item), { attackBonus: true, damageBonus: true, damageDieSteps: 0 });
});

test("players, read-only sheets and non-weapons cannot award training, and invalid steps are rejected", async () => {
  const { item } = setup({ isGM: false });
  assert.equal(await setWeaponUpgrade(item, "attackBonus", true), false);
  game.user.isGM = true;
  assert.equal(await setWeaponUpgrade(item, "attackBonus", true, { editable: false }), false);
  for (const type of ["Armor", "NPC Attack", "Spell"]) {
    item.type = type;
    assert.equal(await setWeaponUpgrade(item, "attackBonus", true), false);
  }
  item.type = "Weapon";
  for (const value of [-1, 3, 1.5, "invalid", Infinity]) {
    assert.equal(await setWeaponUpgrade(item, "damageDieSteps", value), false);
  }
  assert.equal(await setWeaponUpgrade(item, "attackBonus", "true"), false);
  assert.equal(await setWeaponUpgrade(item, "unknown", true), false);
  assert.equal(item.writes.length, 0);
});

test("failed saves preserve the previous upgrades and do not block later edits", async () => {
  const { item } = setup();
  await setWeaponUpgrade(item, "attackBonus", true);
  item.failNextUpdate = true;
  await assert.rejects(setWeaponUpgrade(item, "damageBonus", true), /Update failed/);
  assert.equal(await setWeaponUpgrade(item, "damageDieSteps", 1), true);
  assert.deepEqual(getWeaponUpgrades(item), { attackBonus: true, damageBonus: false, damageDieSteps: 1 });
});

test("a cancelled effect deletion is reported as unsaved and leaves the existing upgrade selected", async () => {
  const { item } = setup();
  await setWeaponUpgrade(item, "attackBonus", true);
  item.deleteEmbeddedDocuments = async () => [];
  assert.equal(await setWeaponUpgrade(item, "attackBonus", false), false);
  assert.equal(getWeaponUpgrades(item).attackBonus, true);
});

class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.listeners = {};
    this.attributes = {};
  }
  append(...elements) { this.children.push(...elements); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => {
      const matches = selector === "[data-weapon-upgrade]"
        ? Boolean(child.dataset.weaponUpgrade)
        : selector.startsWith(".") && child.className?.split(" ").includes(selector.slice(1));
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    });
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function nativeSheet(item) {
  const document = { createElement: tag => new Element(tag, document) };
  const grid = new Element("div", document);
  const root = { querySelector: selector => selector === '.tab[data-tab="tab-details"] .grid-3-columns' ? grid : null };
  const app = { item, isEditable: true, renders: 0, render() { this.renders += 1; } };
  return { app, root, grid };
}

test("native and dashboard weapon sheets show one upgrade panel, preserve selections and save outside native form data", async () => {
  const { item } = setup();
  const { app, root, grid } = nativeSheet(item);
  renderWeaponUpgrades(app, root);
  renderWeaponUpgrades(app, [root]);
  assert.equal(grid.children.length, 1);
  const controls = grid.querySelectorAll("[data-weapon-upgrade]");
  assert.equal(controls.length, 3);
  assert.ok(controls.every(control => !control.disabled && control.name === undefined));
  assert.equal(controls[2].children.length, 3);
  controls[0].checked = true;
  let stopped = false;
  await controls[0].listeners.change({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(app.renders, 1);
  renderWeaponUpgrades(app, root);
  assert.equal(controls[0].checked, true);
  game.user.isGM = false;
  renderWeaponUpgrades(app, root);
  assert.ok(controls.every(control => control.disabled));
  game.user.isGM = true;
  app.isEditable = false;
  renderWeaponUpgrades(app, root);
  assert.ok(controls.every(control => control.disabled));
  const other = nativeSheet({ type: "Armor" });
  renderWeaponUpgrades(other.app, other.root);
  assert.equal(other.grid.children.length, 0);
});

test("weapon upgrades support the native and established alternate item render hooks without duplicate panels", async () => {
  const hooks = new Map();
  globalThis.Hooks = { on: (name, callback) => hooks.set(name, callback) };
  const { item } = setup();
  const { app, root, grid } = nativeSheet(item);
  await import("../scripts/weapon-upgrades/weapon-upgrades.js?hooks");
  for (const hook of [
    "renderItemSheet", "renderItemSheetSD", "renderMKDashboardItemSheet",
    "renderShadowdarkItemSheet", "renderShadowdarkItemSheetV2", "renderItemSheetShadowdark"
  ]) {
    assert.equal(typeof hooks.get(hook), "function");
    hooks.get(hook)(app, root);
  }
  assert.equal(grid.children.length, 1);
  delete globalThis.Hooks;
});
