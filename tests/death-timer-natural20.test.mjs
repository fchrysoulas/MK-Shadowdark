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

function createActor({ con = 10, reapplyDeadOnHpUpdate = false, deathTimer = { turns: 2 } } = {}) {
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
    flags: { "mk-shadowdark": deathTimer === null ? {} : { deathTimer } },
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

  const actorClass = globalThis.CONFIG?.Actor?.documentClass;
  if (actorClass?.prototype) Object.setPrototypeOf(actor, actorClass.prototype);

  return actor;
}

async function loadHarness({ nativeDice = false, nativeDeathDialog = false } = {}) {
  const handlers = new Map();
  const gm = { id: "gm", active: true, isGM: true };
  const nativeRollCalls = [];
  const deathDialogCalls = [];
  const chatRolls = [];
  const chatMessages = [];

  class TestActor {
    async applyDamage(damageAmount, multiplier = 1) {
      const amount = Math.floor(Number.parseInt(damageAmount, 10) * Number(multiplier));
      const current = this.system.attributes.hp.value;
      await this.update({ "system.attributes.hp.value": Math.max(0, current - amount) });
    }
  }

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
  globalThis.CONFIG = {
    statusEffects: [{ id: "dead", name: "Dead", img: "dead.svg" }],
    Actor: { documentClass: TestActor }
  };
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
        return null;
      }
    }
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    getWhisperRecipients: () => [],
    create: async data => {
      chatMessages.push(data);
      return {};
    }
  };
  globalThis.Roll = class {
    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
      this.total = 20;
    }
    async evaluate() {
      return this;
    }
    async toMessage(data, options) {
      chatRolls.push({ roll: this, data, options, native: false });
      return {};
    }
  };

  if (nativeDice) {
    globalThis.shadowdark = {
      dice: {
        async roll(config, data) {
          nativeRollCalls.push({ config, data });

          const roll = new globalThis.Roll(config.formula, data);
          roll.native = true;
          await roll.evaluate();
          roll.toMessage = async (messageData, options) => {
            chatRolls.push({ roll, data: messageData, options, native: true });
            return {};
          };
          return roll;
        }
      }
    };
    if (nativeDeathDialog) {
      globalThis.shadowdark.dice.rollDialog = async config => {
        deathDialogCalls.push(config);
        config.mainRoll.advantage = -1;
        return true;
      };
    }
  } else {
    delete globalThis.shadowdark;
  }

  delete globalThis.MKShadowdarkDeathTimer;
  await import(`../scripts/death-timer/death-timer.js?test=${Date.now()}-${Math.random()}`);
  await handlers.get("once:init")?.();

  return {
    api: globalThis.MKShadowdarkDeathTimer,
    updateActor: handlers.get("updateActor")?.[0],
    nativeRollCalls,
    deathDialogCalls,
    chatRolls,
    chatMessages,
    handlers
  };
}

test("Death Timer uses Shadowdark's native roll helper for chat results", async () => {
  const { api, nativeRollCalls, chatRolls } = await loadHarness({ nativeDice: true });
  const actor = createActor({ con: 10, deathTimer: null });

  await api.activate(actor);

  assert.deepEqual(nativeRollCalls, [
    { config: { formula: "1d4 + @con" }, data: { con: 0 } }
  ]);
  assert.equal(chatRolls.length, 1);
  assert.equal(chatRolls[0].native, true);
  assert.equal(chatRolls[0].roll.total, 20);
});

test("Death Timer death checks use Shadowdark's native roll prompt", async () => {
  const { api, nativeRollCalls, deathDialogCalls } = await loadHarness({
    nativeDice: true,
    nativeDeathDialog: true
  });
  const actor = createActor({ deathTimer: { turns: 2 } });

  await api.activate(actor);

  assert.equal(deathDialogCalls.length, 1);
  assert.equal(deathDialogCalls[0].mainRoll.formula, "1d20");
  assert.equal(deathDialogCalls[0].mainRoll.advantage, -1);
  assert.equal(nativeRollCalls.length, 1);
  assert.equal(nativeRollCalls[0].config.advantage, -1);
});

test("damage reduces the Death Timer by one and posts a chat message", async () => {
  const { api, chatMessages } = await loadHarness();
  const actor = createActor({ deathTimer: { turns: 3 } });

  await actor.applyDamage(4);

  assert.equal(api.getState(actor).turns, 2);
  assert.equal(chatMessages.length, 1);
  assert.match(chatMessages[0].content, /took damage/);
  assert.match(chatMessages[0].content, /reduced by <b>1<\/b>/);
  assert.match(chatMessages[0].content, /now <b>2<\/b> turn/);
});

test("critical damage reduces the Death Timer by two", async () => {
  const { api, chatMessages } = await loadHarness();
  const actor = createActor({ deathTimer: { turns: 4 } });

  await api.withDamageContext(actor, { critical: true }, () => actor.applyDamage(4));

  assert.equal(api.getState(actor).turns, 2);
  assert.equal(chatMessages.length, 1);
  assert.match(chatMessages[0].content, /critical hit/);
  assert.match(chatMessages[0].content, /reduced by <b>2<\/b>/);
});

test("damage context falls back when an Actor instance bypasses the prototype patch", async () => {
  const { api, chatMessages } = await loadHarness();
  const actor = createActor({ deathTimer: { turns: 3 } });
  actor.applyDamage = async () => {};

  await api.withDamageContext(actor, { critical: true }, () => actor.applyDamage(4));

  assert.equal(api.getState(actor).turns, 1);
  assert.match(chatMessages[0].content, /critical hit/);
});

test("recovered Auto Damage reduces a Death Timer only once per target", async () => {
  const { api, chatMessages } = await loadHarness();
  const actor = createActor({ deathTimer: { turns: 3 } });
  const context = {
    critical: false,
    sourceId: "message-1",
    deduplicate: true,
    dedupeKey: "message-1:target-1"
  };

  await api.recordDamage(actor, context);
  await api.recordDamage(actor, context);

  assert.equal(api.getState(actor).turns, 2);
  assert.equal(chatMessages.length, 1);
});

test("critical native chat damage carries its critical state into Actor.applyDamage", async () => {
  const { api, chatMessages, handlers } = await loadHarness();
  const actor = createActor({ deathTimer: { turns: 4 } });
  globalThis.canvas = { tokens: { controlled: [{ actor }] } };

  const listeners = [];
  const button = {
    dataset: { target: "selected" },
    addEventListener(_event, callback, options) {
      listeners.push({ callback, options });
    }
  };
  const message = {
    id: "critical-message",
    flags: { shadowdark: { rollConfig: { type: "attack" } } },
    getRoll: type => type === "main" ? { criticalSuccess: true } : null
  };

  handlers.get("renderChatMessage")[0](message, { querySelectorAll: () => [button] });
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].options.capture, true);

  listeners[0].callback({});
  await actor.applyDamage(4);

  delete globalThis.canvas;
  assert.equal(api.getState(actor).turns, 2);
  assert.match(chatMessages[0].content, /critical hit/);
});

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
