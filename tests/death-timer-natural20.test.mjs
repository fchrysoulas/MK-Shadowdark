import assert from "node:assert/strict";
import test from "node:test";

function getProperty(object, path) {
  return String(path).split(".").reduce((value, key) => value?.[key], object);
}

function setProperty(object, path, value) {
  const keys = String(path).split(".");
  let cursor = object;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
  cursor[keys.at(-1)] = value;
}

function deadEffect() {
  return {
    id: "dead-effect",
    name: "Dead",
    statuses: new Set(["dead"]),
    flags: { core: { statusId: "dead" } },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    }
  };
}

function createActor({ con = 10, reapplyDeadOnHpUpdate = false } = {}) {
  const actor = {
    documentName: "Actor",
    type: "Player",
    isOwner: true,
    name: "Test Hero",
    system: {
      abilities: { con: { value: con } },
      attributes: { hp: { value: 0, max: 10 } }
    },
    effects: [],
    flags: { "mk-shadowdark": { deathTimer: { turns: 2 } } },
    getFlag(scope, key) {
      return this.flags?.[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      this.flags[scope] ??= {};
      this.flags[scope][key] = value;
    },
    async unsetFlag(scope, key) {
      if (this.flags?.[scope]) delete this.flags[scope][key];
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) setProperty(this, path, value);
      if (reapplyDeadOnHpUpdate && this.system.abilities.con.value <= 0) {
        this.effects = [deadEffect()];
      }
    },
    async toggleStatusEffect(statusId, { active }) {
      assert.equal(statusId, "dead");
      if (active) {
        if (!this.effects.some(effect => effect.statuses?.has?.("dead"))) this.effects.push(deadEffect());
      } else {
        this.effects = this.effects.filter(effect => !effect.statuses?.has?.("dead"));
      }
    },
    async createEmbeddedDocuments() {},
    async deleteEmbeddedDocuments(_type, ids) {
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
    },
    testUserPermission() {
      return true;
    }
  };

  return actor;
}

async function loadHarness() {
  const handlers = new Map();
  const gm = { id: "gm", active: true, isGM: true };

  globalThis.Hooks = {
    once(name, callback) {
      handlers.set(`once:${name}`, callback);
    },
    on(name, callback) {
      const list = handlers.get(name) ?? [];
      list.push(callback);
      handlers.set(name, list);
    }
  };
  globalThis.foundry = { utils: { getProperty } };
  globalThis.CONFIG = { statusEffects: [{ id: "dead", name: "Dead", img: "dead.svg" }] };
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.window = { setTimeout(callback) { callback(); } };
  globalThis.document = {
    createElement() {
      return {
        innerHTML: "",
        set textContent(value) {
          this.innerHTML = String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
        }
      };
    }
  };
  globalThis.ui = { notifications: { warn() {} } };
  globalThis.game = {
    system: { id: "shadowdark" },
    user: gm,
    users: [gm],
    actors: [],
    modules: new Map([["mk-shadowdark", { version: "test" }]]),
    settings: {
      get(scope, key) {
        if (scope === "core" && key === "rollMode") return "publicroll";
        if (scope === "mk-shadowdark" && key === "deathTimerMinTurns") return 1;
        return null;
      }
    }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    getWhisperRecipients: () => [],
    create: async () => ({})
  };
  globalThis.Roll = class {
    constructor() {
      this.total = 20;
    }
    async evaluate() {
      return this;
    }
    async toMessage() {
      return {};
    }
  };

  delete globalThis.MKShadowdarkDeathTimer;
  await import(`../scripts/death-timer/death-timer.js?test=${Date.now()}-${Math.random()}`);

  return {
    api: globalThis.MKShadowdarkDeathTimer,
    updateActor: handlers.get("updateActor")?.[0]
  };
}

test("natural 20 revives normally when effective CON is above 0", async () => {
  const { api } = await loadHarness();
  const actor = createActor({ con: 10 });

  await api.activate(actor);

  assert.equal(actor.system.attributes.hp.value, 1);
  assert.equal(actor.getFlag("mk-shadowdark", "deathTimer"), undefined);
  assert.equal(api.getState(actor).dead, false);
});

test("natural 20 cannot clear Dead when effective CON is 0", async () => {
  const { api } = await loadHarness();
  const actor = createActor({ con: 0, reapplyDeadOnHpUpdate: true });

  await api.activate(actor);

  assert.equal(actor.system.attributes.hp.value, 1);
  assert.equal(actor.getFlag("mk-shadowdark", "deathTimer"), undefined);
  assert.equal(api.getState(actor).dead, true);
});

test("restoring CON above 0 allows the normal HP cleanup path to clear Dead", async () => {
  const { api, updateActor } = await loadHarness();
  const actor = createActor({ con: 0, reapplyDeadOnHpUpdate: true });

  await api.activate(actor);
  assert.equal(api.getState(actor).dead, true);

  actor.system.abilities.con.value = 10;
  actor.system.attributes.hp.value = 2;
  await updateActor(actor, { system: { attributes: { hp: { value: 2 } } } }, { _mkPrevHp: 1 });

  assert.equal(api.getState(actor).dead, false);
});
