import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { installActiveEffectClassValues, registerActiveEffectClassValues } from "../scripts/compatibility/active-effect-class-values.js";
import { installItemPilesSheetPaths, registerItemPilesSheetPaths } from "../scripts/compatibility/item-piles-sheets.js";

function effectFixture() {
  const calls = [];
  const hooks = new Map();
  const applyNative = (actor, change) => {
    if (change.key === "system.spellcasting.classes") actor.system.spellcasting.classes.push(change.value);
    return actor;
  };
  class Effect {
    applyRules(actor, change, ...args) {
      calls.push({ effect: this, actor, change, args });
      if (change.value === "daemonsmith" || change.value === "1dInvalid") {
        throw new TypeError("Cannot read properties of undefined (reading 'name')");
      }
      if (change.value === "@abilities.int.mod + 2") change.value = 5;
      return "native-rules";
    }
    apply(actor, change) { this.applyRules(actor, change); return applyNative(actor, change); }
    static applyChange(actor, change) { change.effect.applyRules(actor, change); return applyNative(actor, change); }
  }
  const environment = {
    game: { system: { id: "shadowdark" } }, CONFIG: { ActiveEffect: { documentClass: Effect } },
    Hooks: { once: (name, callback) => hooks.set(name, callback) }
  };
  const actor = () => ({ system: { spellcasting: { classes: [] } } });
  return { environment, calls, hooks, Effect, actor };
}

test("literal class grants survive v13 and v14 effect application on world and unlinked token actors", () => {
  const { environment, Effect, actor, calls } = effectFixture();
  const effect = new Effect();
  const source = Object.freeze({ key: "system.spellcasting.classes", mode: 2, value: "daemonsmith" });
  assert.throws(() => effect.apply(actor(), { ...source }), /reading 'name'/);
  calls.length = 0;
  assert.equal(installActiveEffectClassValues(environment), true);
  for (const generation of [13, 14]) for (const synthetic of [false, true]) {
    const target = actor();
    target.isToken = synthetic;
    for (const value of ["daemonsmith", "sorcerer-of-hashut", "wizard", "priest", "d20"]) {
      const change = Object.freeze({ ...source, effect, value });
      const result = generation === 13 ? effect.apply(target, change) : Effect.applyChange(target, change);
      assert.equal(result, target);
      assert.equal(target.system.spellcasting.classes.at(-1), value);
      assert.equal(change.value, value);
    }
  }
  assert.deepEqual(source, { key: "system.spellcasting.classes", mode: 2, value: "daemonsmith" });
  assert.equal(calls.length, 0);
});

test("other Active Effect formulas, validation, return values and wrapper chains retain native handling", () => {
  const { environment, Effect, actor, calls } = effectFixture();
  const effect = new Effect();
  const target = actor();
  installActiveEffectClassValues(environment);
  const change = { key: "system.roll.spell.bonus", value: "@abilities.int.mod + 2" };
  const options = { generation: 14 };
  assert.equal(effect.applyRules(target, change, options), "native-rules");
  assert.equal(change.value, 5);
  assert.deepEqual(calls[0], { effect, actor: target, change, args: [options] });
  for (const value of ["2d6", "true", "Compendium.example.Item.spell", 1, false]) {
    assert.equal(effect.applyRules(target, { key: "system.other", value }), "native-rules");
  }
  assert.throws(() => effect.applyRules(target, { key: "system.roll.spell.bonus", value: "1dInvalid" }), /reading 'name'/);
  const compatible = Effect.prototype.applyRules;
  let thirdPartyCalls = 0;
  Effect.prototype.applyRules = function(...args) { thirdPartyCalls++; return compatible.apply(this, args); };
  const wrapper = Effect.prototype.applyRules;
  assert.equal(installActiveEffectClassValues(environment), true);
  assert.equal(Effect.prototype.applyRules, wrapper);
  effect.apply(target, { key: "system.spellcasting.classes", value: "daemonsmith" });
  assert.equal(thirdPartyCalls, 1);
  assert.deepEqual(target.system.spellcasting.classes, ["daemonsmith"]);
});

test("the class-value fix installs at init before document preparation and safely tolerates unavailable APIs", () => {
  const { environment, Effect, actor, hooks } = effectFixture();
  registerActiveEffectClassValues(environment);
  hooks.get("init")();
  const wrapper = Effect.prototype.applyRules;
  const target = actor();
  new Effect().apply(target, { key: "system.spellcasting.classes", value: "daemonsmith" });
  assert.deepEqual(target.system.spellcasting.classes, ["daemonsmith"]);
  hooks.get("setup")();
  assert.equal(Effect.prototype.applyRules, wrapper);
  assert.equal(installActiveEffectClassValues({}), false);
  environment.game.system.id = "other";
  assert.equal(installActiveEffectClassValues(environment), false);
  environment.game.system.id = "shadowdark";
  environment.CONFIG.ActiveEffect.documentClass = class {};
  assert.equal(installActiveEffectClassValues(environment), false);
});

function sheetFixture({ active = true } = {}) {
  class Boat { render() { return "boat"; } }
  class Bastion { render() { return "bastion"; } }
  class Player { render() { return "player"; } }
  const registry = {
    Player: { "shadowdark.Player": { cls: Player } },
    "mk-shadowdark.boat": { "mk-shadowdark.MKBoatSheet": { cls: Boat, default: true } },
    "mk-shadowdark.bastion": { "mk-shadowdark.MKBastionSheet": { cls: Bastion, default: true } }
  };
  const hooks = new Map();
  const environment = {
    CONFIG: { Actor: { sheetClasses: registry } },
    game: { modules: new Map([["item-piles", { active }]]) },
    Hooks: { once: (name, callback) => hooks.set(name, callback) }
  };
  return { environment, registry, Boat, Bastion, Player, hooks };
}

function itemPilesTargets(registry) {
  const targets = [];
  for (const type of Object.keys(registry)) for (const sheet of Object.keys(registry[type])) {
    targets.push(`CONFIG.Actor.sheetClasses.${type}.["${sheet}"].cls.prototype.render`);
  }
  return targets;
}

function resolveTarget(root, target) {
  const parts = target.match(/\["[^"\]]+"\]|[^.[\]]+/g);
  return parts.reduce((value, part) => value?.[part.startsWith('["') ? part.slice(2, -2) : part], root);
}

test("Item Piles resolves both reported sheet paths without enumerating extra actor types or duplicate sheets", () => {
  const { environment, registry, Boat, Bastion, Player } = sheetFixture();
  const types = Object.keys(registry);
  const targets = itemPilesTargets(registry);
  assert.equal(resolveTarget(environment, targets[1]), undefined);
  assert.equal(resolveTarget(environment, targets[2]), undefined);
  assert.equal(installItemPilesSheetPaths(environment), true);
  assert.equal(resolveTarget(environment, targets[0]), Player.prototype.render);
  assert.equal(resolveTarget(environment, targets[1]), Boat.prototype.render);
  assert.equal(resolveTarget(environment, targets[2]), Bastion.prototype.render);
  assert.equal(resolveTarget(environment, targets[1]).call(new Boat()), "boat");
  assert.equal(resolveTarget(environment, targets[2]).call(new Bastion()), "bastion");
  assert.deepEqual(Object.keys(registry), types);
  assert.deepEqual(itemPilesTargets(registry), targets);
  assert.equal(Object.getOwnPropertyDescriptor(registry, "mk-shadowdark").enumerable, false);
  assert.equal(Object.values(registry).flatMap(sheets => Object.values(sheets).map(sheet => sheet.cls)).length, 3);
  assert.equal(registry["mk-shadowdark.boat"]["mk-shadowdark.MKBoatSheet"].default, true);
});

test("sheet aliases stay live when registrations change and preserve other registered types", () => {
  const { environment, registry } = sheetFixture();
  installItemPilesSheetPaths(environment);
  const namespace = registry["mk-shadowdark"];
  class Replacement { render() { return "replacement"; } }
  registry["mk-shadowdark.boat"] = { "mk-shadowdark.MKBoatSheet": { cls: Replacement } };
  registry["other.type"] = { "other.Sheet": { cls: Replacement } };
  assert.equal(installItemPilesSheetPaths(environment), true);
  assert.equal(registry["mk-shadowdark"], namespace);
  assert.equal(namespace.boat, registry["mk-shadowdark.boat"]);
  assert.equal(resolveTarget(environment, itemPilesTargets(registry)[1]), Replacement.prototype.render);
  assert.ok(Object.keys(registry).includes("other.type"));
  assert.equal(namespace.other, undefined);
});

test("sheet compatibility installs after pending registrations finish, only when Item Piles is active", () => {
  const { environment, registry, hooks } = sheetFixture();
  const boat = registry["mk-shadowdark.boat"];
  delete registry["mk-shadowdark.boat"];
  delete registry["mk-shadowdark.bastion"];
  registerItemPilesSheetPaths(environment);
  assert.equal(hooks.has("init"), false);
  assert.equal(hooks.has("setup"), false);
  registry["mk-shadowdark.boat"] = boat;
  hooks.get("ready")();
  assert.equal(registry["mk-shadowdark"].boat, boat);
  assert.equal(registry["mk-shadowdark"].bastion, undefined);
  const inactive = sheetFixture({ active: false });
  assert.equal(installItemPilesSheetPaths(inactive.environment), false);
  assert.equal(Object.hasOwn(inactive.registry, "mk-shadowdark"), false);
  assert.equal(installItemPilesSheetPaths({}), false);
  const conflicting = sheetFixture();
  conflicting.registry["mk-shadowdark"] = { existingActorType: true };
  assert.equal(installItemPilesSheetPaths(conflicting.environment), false);
  assert.deepEqual(conflicting.registry["mk-shadowdark"], { existingActorType: true });
});

test("the module bootstrap loads compatibility helpers once before feature entry points", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  const entries = manifest.esmodules;
  const bootstrap = await readFile(new URL("../scripts/mk-shadowdark.js", import.meta.url), "utf8");
  assert.ok(entries.indexOf("scripts/mk-shadowdark.js") < entries.indexOf("scripts/boat-sheet/boat-sheet.js"));
  for (const file of ["active-effect-class-values", "item-piles-sheets"]) {
    const path = `scripts/compatibility/${file}.js`;
    assert.equal(entries.includes(path), false);
    assert.ok(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
    assert.ok(bootstrap.includes(`import "./compatibility/${file}.js";`));
  }
});
