import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CAROUSING_OUTCOMES, getCarousingOutcome, getCarousingDtpRequirement, normalizeCarousingBonus
} from "../scripts/carousing/outcomes.js";
import {
  buildCarousingMenu, buildCarousingTable, getCarousingLocation,
  getCarousingUpdate, openCarousingMenu, performCarousing, readCarousingForm, validateCarousingEvent
} from "../scripts/carousing/carousing.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const MODULE_ID = "mk-shadowdark";

function character(id, { dtp = 10, gp = 100, xp = 2 } = {}) {
  return {
    id, uuid: `Actor.${id}`, type: "Player", name: `<${id}>`,
    flags: { [MODULE_ID]: { dtp } },
    system: { coins: { gp }, level: { xp }, luck: { available: false, remaining: 0 } },
    getFlag(scope, key) { return this.flags[scope]?.[key]; }
  };
}

function setup({ gm = true, totals = [8, 10], pulp = false } = {}) {
  const actors = [character("a"), character("b"), {
    id: "keep", type: "mk-shadowdark.bastion", name: "Keep",
    flags: { [MODULE_ID]: { bastion: { upgrades: ["tavern", "brewery"] } } },
    getFlag(scope, key) { return this.flags[scope]?.[key]; }
  }];
  actors.get = id => actors.find(actor => actor.id === id);
  const calls = { rolls: [], updates: [], messages: [], time: [], warnings: [], errors: [] };
  globalThis.game = {
    system: { id: "shadowdark" }, user: { isGM: gm }, actors,
    settings: { get: () => pulp }, time: { advance: async seconds => { calls.time.push(seconds); } },
    i18n: { format: (key, data) => (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => data[name]) }
  };
  globalThis.ui = { notifications: {
    warn: value => calls.warnings.push(value), error: value => calls.errors.push(value)
  } };
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() { this.total = totals[calls.rolls.length]; calls.rolls.push(this); return this; }
  };
  globalThis.Actor = { updateDocuments: async updates => {
    calls.updates.push(updates);
    return updates.map(update => {
      const actor = actors.get(update._id);
      actor.flags[MODULE_ID].dtp = update[`flags.${MODULE_ID}.dtp`];
      actor.system.coins.gp = update["system.coins.gp"];
      actor.system.level.xp = update["system.level.xp"];
      for (const key of ["available", "remaining"]) {
        if (`system.luck.${key}` in update) actor.system.luck[key] = update[`system.luck.${key}`];
      }
      return actor;
    });
  } };
  globalThis.ChatMessage = {
    getSpeaker: ({ actor }) => ({ actor: actor.id }),
    create: async data => {
      const message = {
        ...data, writes: [],
        async update(change) {
          this.writes.push(change);
          if (change.content) this.content = change.content;
          const status = change[`flags.${MODULE_ID}.carousing.status`];
          if (status) this.flags[MODULE_ID].carousing.status = status;
          return this;
        }
      };
      calls.messages.push(message);
      return message;
    }
  };
  return { actors, calls };
}

function event(overrides = {}) {
  return {
    sanctuary: "Sanctuary Tavern", bastionId: "", cost: 100, bonus: "1d6", days: 2,
    mode: "individual", rollerId: "a",
    participants: [{ actorId: "a", contribution: 40 }, { actorId: "b", contribution: 60 }],
    ...overrides
  };
}

test("all fourteen campaign outcomes preserve XP, DTP costs and item ranges", () => {
  assert.deepEqual(CAROUSING_OUTCOMES.map(row => row.xp), [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6]);
  assert.deepEqual(CAROUSING_OUTCOMES.map(row => row.dtp), [3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 8, 8]);
  assert.deepEqual(getCarousingOutcome(13).itemRange, [80, 100]);
  assert.deepEqual(getCarousingOutcome(99).itemRange, [90, 100]);
  assert.match(getCarousingOutcome(3).description, /DC 15 CON/);
  assert.equal(getCarousingOutcome(5).benefit, "Barred from tavern");
  assert.equal(getCarousingOutcome(12).benefit, "Debt by Noble");
  for (const total of [null, 0, -1, 3.5, NaN, Infinity]) assert.equal(getCarousingOutcome(total), null);
  setup();
  assert.match(buildCarousingTable(), /14\+/);
  assert.match(buildCarousingTable(), /DTP cost/);
});

test("open bonus field accepts fixed bonuses or an extra d6 and calculates the maximum payable cost", () => {
  for (const [input, expected] of [[0, "0"], ["+3", "3"], [" 1D6 ", "1d6"]]) {
    assert.equal(normalizeCarousingBonus(input), expected);
  }
  for (const bonus of ["", undefined, "2d6", "1d6+5", "@bonus", "1d6;script", -1, 2.5]) {
    assert.equal(normalizeCarousingBonus(bonus), null);
  }
  assert.equal(getCarousingDtpRequirement("0"), 5);
  assert.equal(getCarousingDtpRequirement("0", 1), 6);
  assert.equal(getCarousingDtpRequirement("4"), 6);
  assert.equal(getCarousingDtpRequirement("5"), 8);
  assert.equal(getCarousingDtpRequirement("1d6"), 8);
});

test("built Bastion Tavern limits total cost and Brewery applies only inside that Bastion", () => {
  const { actors } = setup();
  assert.equal(validateCarousingEvent(event({ bastionId: "keep" })).location.brewery, 1);
  assert.equal(validateCarousingEvent(event({ bastionId: "keep", cost: 101 })).error, "tavernLimit");
  assert.equal(getCarousingLocation({ sanctuary: "Other Tavern" }).brewery, 0);
  actors.get("keep").flags[MODULE_ID].bastion.upgrades = ["brewery"];
  assert.equal(getCarousingLocation({ bastionId: "keep" }), null);
  assert.equal(getCarousingLocation({ bastionId: "missing" }), null);
  assert.equal(getCarousingLocation({ bastionId: "a" }), null);
});

test("validation rejects unfunded events, duplicate/non-PC participants and invalid shared rollers", () => {
  const { actors } = setup();
  assert.equal(validateCarousingEvent(event()).error, undefined);
  assert.equal(validateCarousingEvent(null).error, "invalid");
  assert.equal(validateCarousingEvent(event({ participants: [] })).error, "participantsRequired");
  assert.equal(validateCarousingEvent(event({ cost: 101 })).error, "contributions");
  for (const actorId of ["a", "keep", "missing"]) {
    assert.equal(validateCarousingEvent(event({ participants: [
      { actorId: "a", contribution: 50 }, { actorId, contribution: 50 }
    ] })).error, "invalid");
  }
  assert.equal(validateCarousingEvent(event({ mode: "group", rollerId: "missing" })).error, "rollerRequired");
  for (const days of [0, -1, "", Infinity]) assert.equal(validateCarousingEvent(event({ days })).error, "invalid");
  actors.get("a").flags[MODULE_ID].dtp = 7;
  assert.equal(validateCarousingEvent(event()).error, "resources");
  assert.equal(validateCarousingEvent(event({ bonus: "0" })).error, undefined);
  actors.get("a").system.coins.gp = 39;
  assert.equal(validateCarousingEvent(event({ bonus: "0" })).error, "resources");
  actors.get("a").flags[MODULE_ID].isGroup = true;
  assert.equal(validateCarousingEvent(event()).error, "invalid");
  assert.doesNotMatch(buildCarousingMenu(actors.get("b")), /name="participant-a"/);
});

test("individual rolls charge exact outcome DTP, grant XP/luck, and spend campaign time once", async () => {
  const { actors, calls } = setup({ totals: [2, 13] });
  assert.equal(await performCarousing(event(), { confirmed: true }), true);
  assert.equal(calls.rolls.length, 2);
  assert.equal(calls.rolls[0].formula, "1d8 + 1d6 + 0");
  assert.equal(actors.get("a").flags[MODULE_ID].dtp, 7);
  assert.equal(actors.get("b").flags[MODULE_ID].dtp, 2);
  assert.equal(actors.get("a").system.level.xp, 4);
  assert.equal(actors.get("b").system.level.xp, 8);
  assert.equal(actors.get("a").system.coins.gp, 60);
  assert.equal(actors.get("b").system.coins.gp, 40);
  assert.deepEqual(calls.time, [172800]);
  const message = calls.messages[0];
  assert.equal(message.flags[MODULE_ID].carousing.status, "complete");
  assert.deepEqual(message.flags[MODULE_ID].carousing.results[1].itemRange, [80, 100]);
  assert.match(message.content, /&lt;a&gt;/);
  assert.match(message.content, /3 DTP and 40 gp/);
  assert.doesNotMatch(message.content, /data-action="reroll"/);
  assert.match(message.content, /confirmed campaign time advanced/);
});

test("one selected group roll applies the same outcome and separate contributions to everyone", async () => {
  const { actors, calls } = setup({ totals: [10] });
  assert.equal(await performCarousing(event({ bastionId: "keep", mode: "group", rollerId: "b" }), { confirmed: true }), true);
  assert.equal(calls.rolls.length, 1);
  assert.equal(calls.rolls[0].formula, "1d8 + 1d6 + 1");
  assert.equal(calls.messages[0].speaker.actor, "b");
  assert.equal(calls.messages[0].flags[MODULE_ID].carousing.rollerId, "b");
  for (const actor of actors.filter(actor => actor.type === "Player")) {
    assert.equal(actor.flags[MODULE_ID].dtp, 4);
    assert.equal(actor.system.level.xp, 7);
    assert.equal(actor.system.luck.available, true);
    assert.equal(actor.system.luck.remaining, 1);
  }
  assert.deepEqual(calls.time, [172800]);
});

test("luck rewards respect Shadowdark standard and pulp luck balances", () => {
  const { actors } = setup({ pulp: true });
  const actor = actors.get("a");
  actor.system.luck.remaining = 2;
  const result = { actor, contribution: 40, outcome: getCarousingOutcome(8) };
  assert.equal(getCarousingUpdate(result)["system.luck.remaining"], 3);
  globalThis.game.settings.get = () => false;
  assert.equal(getCarousingUpdate(result)["system.luck.remaining"], 1);
  assert.equal(getCarousingUpdate({ ...result, outcome: getCarousingOutcome(7) })["system.luck.available"], undefined);
});

test("players, unconfirmed events and unavailable resources never roll or mutate documents", async () => {
  const { calls } = setup({ gm: false });
  assert.equal(await performCarousing(event(), { confirmed: true }), false);
  assert.match(buildCarousingMenu(character("a")), /name="cost"[^>]*disabled/);
  globalThis.game.user.isGM = true;
  assert.equal(await performCarousing(event()), false);
  assert.equal(await performCarousing(event({ cost: 101 }), { confirmed: true }), false);
  assert.equal(calls.rolls.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.time.length, 0);
});

test("failed actor updates preserve the rolled chat report and do not advance time", async () => {
  const { calls } = setup();
  globalThis.Actor.updateDocuments = async () => [];
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(await performCarousing(event(), { confirmed: true }), false);
    assert.equal(calls.messages[0].flags[MODULE_ID].carousing.status, "needsReview");
    assert.match(calls.messages[0].content, /Do not reroll/);
    assert.equal(calls.time.length, 0);
    assert.equal(calls.errors.length, 1);
  } finally { console.error = originalError; }
});

test("duplicate clicks are locked and resources are rechecked after dice evaluation", async () => {
  const { actors, calls } = setup();
  let finishRoll;
  globalThis.Roll.prototype.evaluate = function () {
    calls.rolls.push(this);
    return new Promise(resolve => { finishRoll = () => { this.total = 8; resolve(this); }; });
  };
  const first = performCarousing(event({ mode: "group" }), { confirmed: true });
  assert.equal(await performCarousing(event(), { confirmed: true }), false);
  actors.get("a").system.coins.gp = 1;
  finishRoll();
  assert.equal(await first, false);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.time.length, 0);
});

test("event form reads only selected participants, and cancelling review changes nothing", async () => {
  const { actors, calls } = setup();
  const values = { sanctuary: "Sanctuary", cost: "100", days: "1", bonus: "1d6", mode: "group", rollerId: "a" };
  const elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
  elements["participant-a"] = { checked: true };
  elements["contribution-a"] = { value: "100" };
  const parsed = readCarousingForm({ elements });
  assert.deepEqual(parsed.participants, [{ actorId: "a", contribution: "100" }]);
  let dialogs = 0;
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async config => {
    dialogs++;
    if (dialogs === 1) return config.buttons[0].callback(null, { form: { elements } });
    assert.match(config.content, /world time once/);
    assert.match(config.content, /100 gp/);
    return false;
  } } } } };
  try {
    await openCarousingMenu(actors.get("a"));
    assert.equal(dialogs, 2);
    assert.equal(calls.rolls.length, 0);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.time.length, 0);
  } finally { delete globalThis.foundry; }
});
