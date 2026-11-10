import test from "node:test";
import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {
  on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
  once(name, callback) { this.on(name, callback); },
};
const { PREDEFINED_EFFECT_KEYS } = await import("../scripts/libs/predefined-effects.js");
await import("../scripts/auto-damage/damage-traits.js");
await import("../scripts/auto-damage/auto-apply-damage.js");

let sequence = 0;
function fixture({ enabled = true, spell = false, immune = false, resistance = false } = {}) {
  const gm = { id: "gm", active: true, isGM: true };
  const mod = { api: {} };
  const property = { uuid: "Item.fire", type: "Property", name: "Fire" };
  const source = { type: spell ? "Spell" : "Weapon", system: { properties: [property.uuid] } };
  const actor = {
    name: "Target", uuid: "Actor.target",
    system: { attributes: { hp: { value: 12, max: 12 } } },
    effects: [],
    async applyDamage(amount) { this.system.attributes.hp.value -= amount; },
  };
  if (immune) actor.effects.push({ changes: [{ key: PREDEFINED_EFFECT_KEYS.ONLY_MAGICAL_DAMAGE_SOURCES, value: 1 }] });
  if (resistance) actor.effects.push({ changes: [{ key: "system.damage.resistance.property", value: property.uuid }] });
  const token = { uuid: "Scene.s.Token.t", id: "t", actor };
  globalThis.game = {
    user: gm, users: [gm], modules: new Map([["mk-shadowdark", mod]]),
    settings: { get: (_scope, key) => key === "autoDamageEnabled" || (key === "damageTraitsEnabled" && enabled) },
  };
  globalThis.CONFIG = { SHADOWDARK: { PREDEFINED_EFFECTS: {}, EFFECT_TRANSLATIONS: {} } };
  globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } };
  globalThis.fromUuid = async uuid => uuid === token.uuid ? token : uuid === property.uuid ? property : source;
  globalThis.document = { createElement: () => ({
    innerHTML: "", set textContent(value) { this.innerHTML = String(value); }, querySelector: () => null, appendChild() {},
  }) };
  globalThis.ui = {};
  for (const callback of hooks.get("init") ?? []) callback();
  async function attack() {
    const message = {
      id: `traits-${++sequence}`, author: gm, content: "", flags: {},
      rollConfig: { type: spell ? "spell" : "attack", itemUuid: "Item.source", targetUuids: [token.uuid], cast: { damageType: "damage" } },
      rolls: [{ options: { type: "main" }, success: true }, { options: { type: "damage" }, total: 8 }],
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = structuredClone(value); },
      async update(data) { Object.assign(this, data); },
    };
    for (const callback of hooks.get("createChatMessage") ?? []) callback(message, {}, gm.id);
    for (let attempt = 0; attempt < 100 && !message.getFlag("mk-shadowdark", "autoDamageProcessed"); attempt++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(message.getFlag("mk-shadowdark", "autoDamageProcessed"), true);
    return message;
  }
  return { actor, source, api: mod.api.damageTraits, attack };
}

test("disabling Property Damage Modifiers bypasses nonmagical immunity for spell damage", async () => {
  const f = fixture({ enabled: false, spell: true, immune: true });
  const message = await f.attack();
  assert.equal(f.actor.system.attributes.hp.value, 4);
  assert.equal(message.getFlag("mk-shadowdark", "autoDamageProcessing").targets[0].traitMode, null);
});

test("the damage trait setting consistently controls property resistance and magical immunity", async () => {
  for (const enabled of [false, true]) {
    const f = fixture({ enabled, resistance: true });
    await f.attack();
    assert.equal(f.actor.system.attributes.hp.value, enabled ? 8 : 4);
    const immune = fixture({ enabled, immune: true });
    await immune.attack();
    assert.equal(immune.actor.system.attributes.hp.value, enabled ? 12 : 4);
  }
});

test("Magical Attacks on an embedded item requires an enabled transferring effect", async () => {
  const f = fixture();
  const effect = { transfer: false, changes: [{ key: PREDEFINED_EFFECT_KEYS.MAGICAL_ATTACKS, value: 1 }] };
  f.source.actor = { items: [{ effects: [effect] }] };
  const context = () => f.api.getSourceContext({ rollConfig: { type: "attack", itemUuid: "Item.source" } });
  assert.equal((await context()).isMagicalSource, false);
  effect.transfer = true;
  assert.equal((await context()).isMagicalSource, true);
  effect.disabled = true;
  assert.equal((await context()).isMagicalSource, false);
  effect.disabled = false;
  effect.isSuppressed = true;
  assert.equal((await context()).isMagicalSource, false);
});

test("magical-source immunity requires item Transfer while actor-owned effects remain applicable", () => {
  const f = fixture();
  const effect = { transfer: false, changes: [{ key: PREDEFINED_EFFECT_KEYS.ONLY_MAGICAL_DAMAGE_SOURCES, value: 1 }] };
  const actor = { items: [{ effects: [effect] }] };
  assert.equal(f.api.calculateReduction(actor, [], 8).appliedDamage, 8);
  effect.transfer = true;
  assert.equal(f.api.calculateReduction(actor, [], 8).appliedDamage, 0);
  effect.disabled = true;
  assert.equal(f.api.calculateReduction(actor, [], 8).appliedDamage, 8);
  effect.disabled = false;
  effect.transfer = false;
  actor.items = [];
  actor.effects = [effect];
  assert.equal(f.api.calculateReduction(actor, [], 8).appliedDamage, 0);
});
