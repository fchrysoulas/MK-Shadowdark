import test from "node:test";
import assert from "node:assert/strict";

const hooks = new Map();
globalThis.Hooks = {
  on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
  once() {},
};
await import("../scripts/auto-damage/auto-apply-damage.js");

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(predicate(), "native damage processing must finish");
}

function fixture() {
  const gm = { id: "gm", active: true, isGM: true };
  const calls = [];
  const documents = new Map();
  const actors = ["one", "two"].map(id => ({
    id, uuid: `Actor.${id}`, name: id,
    system: { attributes: { hp: { value: 12, max: 12 } } },
    async applyDamage(amount) {
      calls.push({ actor: id, amount });
      const after = Math.max(0, Math.min(12, this.system.attributes.hp.value - amount));
      if (this.deferUpdate) this.commit = () => { this.system.attributes.hp.value = after; };
      else this.system.attributes.hp.value = after;
    },
  }));
  const tokens = actors.map((actor, index) => ({ id: `t${index}`, uuid: `Scene.s.Token.t${index}`, actor }));
  // Two linked tokens must share the same actor lock.
  tokens.push({ id: "linked", uuid: "Scene.s.Token.linked", actor: actors[0] });
  for (const token of tokens) documents.set(token.uuid, token);
  globalThis.game = {
    user: gm, users: [gm], modules: new Map([["mk-shadowdark", { api: {} }]]),
    settings: { get: (_scope, key) => key === "autoDamageEnabled" },
  };
  globalThis.foundry = { utils: { getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) } };
  globalThis.fromUuid = async uuid => documents.get(uuid);
  globalThis.ui = {};
  const messages = [];
  function attack(token = tokens[0], { amount = 5, healing = false } = {}) {
    const message = {
      id: `message-${messages.length}`, author: gm, flags: {},
      rollConfig: { type: healing ? "spell" : "attack", cast: { damageType: healing ? "healing" : "damage" }, targetUuids: [token.uuid] },
      rolls: [{ options: { type: "main" }, success: true }, { options: { type: "damage" }, total: amount }],
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      async setFlag(scope, key, value) {
        (this.flags[scope] ??= {})[key] = structuredClone(value);
        for (const callback of hooks.get("updateChatMessage") ?? []) callback(this, {}, {}, gm.id);
      },
    };
    messages.push(message);
    for (const callback of hooks.get("createChatMessage") ?? []) callback(message, {}, gm.id);
    return message;
  }
  const complete = message => message.getFlag("mk-shadowdark", "autoDamageProcessed") === true;
  return { actors, tokens, calls, attack, complete };
}

test("overlapping hits plan and apply against the latest HP exactly once", async () => {
  const f = fixture();
  const first = f.attack();
  const second = f.attack();
  await until(() => f.complete(first) && f.complete(second));
  assert.equal(f.actors[0].system.attributes.hp.value, 2);
  assert.deepEqual(f.calls.map(call => call.amount), [5, 5]);
  assert.equal(second.getFlag("mk-shadowdark", "autoDamageProcessing").targets[0].beforeHp, 7);
});

test("linked tokens wait for native HP updates while unrelated actors keep processing", async () => {
  const f = fixture();
  f.actors[0].deferUpdate = true;
  const first = f.attack();
  await until(() => f.actors[0].commit);
  const linked = f.attack(f.tokens[2]);
  const unrelated = f.attack(f.tokens[1]);
  try {
    await until(() => f.complete(unrelated));
    assert.equal(linked.getFlag("mk-shadowdark", "autoDamageProcessing"), undefined);
    assert.equal(f.calls.filter(call => call.actor === "one").length, 1);
  } finally {
    f.actors[0].deferUpdate = false;
    f.actors[0].commit();
  }
  await until(() => f.complete(first) && f.complete(linked));
  assert.equal(f.actors[0].system.attributes.hp.value, 2);
});

test("overlapping damage and healing preserve both native HP changes", async () => {
  const f = fixture();
  const damage = f.attack();
  const healing = f.attack(f.tokens[0], { amount: 3, healing: true });
  await until(() => f.complete(damage) && f.complete(healing));
  assert.equal(f.actors[0].system.attributes.hp.value, 10);
  assert.deepEqual(f.calls.map(call => call.amount), [5, -3]);
});
