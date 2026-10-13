import test from "node:test";
import assert from "node:assert/strict";
import { createOffer, isMeleeWeaponAttack, resolvePlan } from "../scripts/sundering/sundering.js";

const hooks = new Map();
globalThis.Hooks = {
  on(name, callback) {
    const callbacks = hooks.get(name) ?? [];
    callbacks.push(callback);
    hooks.set(name, callbacks);
  },
  once() {}
};
await import("../scripts/auto-damage/auto-apply-damage.js");

function escape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function element() {
  return {
    innerHTML: "",
    set textContent(value) { this.innerHTML = escape(value); },
    querySelector: () => null,
    appendChild(child) { this.innerHTML += child.innerHTML; }
  };
}

let nextMessageId = 0;
async function attack({ accept = true, ranged = false, spell = false, success = true, hp = 12, secondTarget = false, ownerOnline = true } = {}) {
  const gm = { id: "gm", active: true, isGM: true };
  const player = { id: "player", active: ownerOnline, isGM: false };
  const users = [gm, player];
  users.get = id => users.find(user => user.id === id);
  const calls = { damage: [], deletion: [], deathTimer: [], shake: [], decisions: [], persisted: [] };
  const actors = [0, ...(secondTarget ? [1] : [])].map(index => {
    const items = index === 0 ? [{ id: "shield", name: "Shield", type: "Armor",
      system: { equipped: true, stashed: false, propertyNames: ["Sundering"] } }] : [];
    items.get = id => items.find(item => item.id === id);
    return {
      id: `actor${index}`, name: `Hero ${index}`, type: "Player", items,
      system: { attributes: { hp: { value: hp, max: 12 } } },
      testUserPermission: user => user.id === player.id,
      async deleteEmbeddedDocuments(type, ids) {
        assert.equal(type, "Item");
        calls.deletion.push({ actor: this.id, ids });
        const saved = calls.persisted.at(-1).targets.find(target => target.actorName === this.name);
        assert.equal(saved.sundering.status, "destroying");
        items.splice(items.findIndex(item => item.id === ids[0]), 1);
      },
      async applyDamage(amount) {
        calls.damage.push({ actor: this.id, amount });
        this.system.attributes.hp.value = Math.max(0, this.system.attributes.hp.value - amount);
      }
    };
  });
  const tokens = actors.map((actor, index) => ({ uuid: `Scene.scene.Token.hero${index}`, id: `hero${index}`, actor }));
  const source = { type: spell ? "Spell" : "Weapon", system: { type: ranged ? "ranged" : "melee" } };
  const mod = { version: "1.9.19", api: {
    sundering: {
      createOffer, isMeleeWeaponAttack,
      resolvePlan: (message, state, options) => resolvePlan(message, state, {
        ...options,
        ask: async (_message, target) => {
          calls.decisions.push(target.sundering.userId);
          return { itemId: accept ? "shield" : null };
        }
      })
    },
    deathTimer: {
      withDamageContext: async (_actor, context, apply) => { calls.deathTimer.push(context); await apply(); },
      recordDamage: async (_actor, context) => { calls.deathTimer.push(context); }
    }
  } };
  globalThis.game = {
    user: gm, users, modules: new Map([["mk-shadowdark", mod]]), messages: [],
    settings: { get: (_module, key) => ["autoDamageEnabled", "autoDamageShakeTokens"].includes(key) },
    socket: { emit: (_channel, data) => calls.shake.push(data) },
    i18n: { localize: key => key, format: (key, data) => key + JSON.stringify(data) }
  };
  globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } };
  globalThis.document = { createElement: element };
  globalThis.ui = {};
  globalThis.fromUuid = async uuid => uuid === "Item.attack" ? source : tokens.find(token => token.uuid === uuid);
  const message = {
    id: `attack-${++nextMessageId}`, author: gm, content: "Native attack",
    rollConfig: {
      type: spell ? "spell" : "attack", itemUuid: "Item.attack", targetUuids: tokens.map(token => token.uuid),
      ...(spell ? { cast: { damageType: "damage" } } : { attack: { type: ranged ? "ranged" : "melee" } })
    },
    rolls: [
      { options: { type: "main" }, success, criticalSuccess: true },
      { options: { type: "damage" }, total: 5 }
    ],
    flags: {},
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope][key] = JSON.parse(JSON.stringify(value));
      if (key === "autoDamageProcessing") calls.persisted.push(JSON.parse(JSON.stringify(value)));
      for (const hook of hooks.get("updateChatMessage") ?? []) hook(this, {}, {}, gm.id);
    },
    async update(data) { Object.assign(this, data); }
  };
  for (const hook of hooks.get("createChatMessage") ?? []) hook(message, {}, gm.id);
  // Flush the asynchronous native hook chain; HP updates in this harness resolve immediately.
  await new Promise(resolve => setImmediate(resolve));
  return { actors, calls, message };
}

test("native melee Auto Damage cancels a sundered hit before HP, Death Timer, and token shake", async () => {
  const { actors, calls, message } = await attack();
  assert.deepEqual(calls.decisions, ["player"]);
  assert.deepEqual(calls.deletion, [{ actor: "actor0", ids: ["shield"] }]);
  assert.deepEqual(calls.damage, []);
  assert.deepEqual(calls.deathTimer, []);
  assert.deepEqual(calls.shake, []);
  assert.equal(actors[0].system.attributes.hp.value, 12);
  assert.equal(message.getFlag("shadowdark", "damageApplied"), true);
  assert.equal(message.getFlag("mk-shadowdark", "autoDamageProcessed"), true);
  assert.match(message.content, /sundering.cancelled/);
});

test("declining in the native damage flow keeps the item and applies critical damage normally", async () => {
  const { actors, calls } = await attack({ accept: false });
  assert.equal(actors[0].system.attributes.hp.value, 7);
  assert.equal(actors[0].items.length, 1);
  assert.deepEqual(calls.damage, [{ actor: "actor0", amount: 5 }]);
  assert.equal(calls.deathTimer[0].critical, true);
  assert.equal(calls.shake.length, 1);
});

test("native ranged attacks and damaging spells apply damage without offering Sundering", async () => {
  for (const options of [{ ranged: true }, { spell: true }]) {
    const { actors, calls } = await attack(options);
    assert.deepEqual(calls.decisions, []);
    assert.deepEqual(calls.deletion, []);
    assert.equal(actors[0].system.attributes.hp.value, 7);
  }
});

test("misses do not prompt, destroy items, or apply damage", async () => {
  const { actors, calls, message } = await attack({ success: false });
  assert.deepEqual(calls.decisions, []);
  assert.deepEqual(calls.damage, []);
  assert.deepEqual(calls.deletion, []);
  assert.equal(actors[0].system.attributes.hp.value, 12);
  assert.equal(message.getFlag("mk-shadowdark", "autoDamageProcessing"), undefined);
});

test("Sundering at zero HP cancels the critical hit without reducing a Death Timer", async () => {
  const { actors, calls } = await attack({ hp: 0 });
  assert.equal(actors[0].system.attributes.hp.value, 0);
  assert.deepEqual(calls.decisions, ["player"]);
  assert.equal(calls.deletion.length, 1);
  assert.deepEqual(calls.deathTimer, []);
});

test("Sundering cancels only its selected target's damage in a multi-target attack", async () => {
  const { actors, calls, message } = await attack({ secondTarget: true });
  assert.deepEqual(actors.map(actor => actor.system.attributes.hp.value), [12, 7]);
  assert.deepEqual(calls.damage, [{ actor: "actor1", amount: 5 }]);
  assert.equal(message.getFlag("mk-shadowdark", "autoDamageProcessing").status, "complete");
});

test("offline owners route the native Sundering offer to the GM", async () => {
  const { calls } = await attack({ ownerOnline: false });
  assert.deepEqual(calls.decisions, ["gm"]);
  assert.equal(calls.deletion.length, 1);
});
