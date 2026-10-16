import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDowntimeMenu, changesDtp, getDtp, guardDtpUpdate,
  openDowntimeMenu, performDowntime, renderDtp, saveDtp, spendDtp
} from "../scripts/dtp/dtp.js";
import {
  DOWNTIME_ACTIVITIES, DOWNTIME_OPTIONS, getDowntimeGoldCost,
  getDowntimeOption, getDowntimeProfile, isDowntimeEligible
} from "../scripts/dtp/activities.js";

function actorWithDtp(value, type = "Player") {
  return {
    type,
    flags: { "mk-shadowdark": { dtp: value } },
    writes: [],
    async setFlag(scope, key, value) {
      this.writes.push({ scope, key, value });
      this.flags[scope][key] = value;
    }
  };
}

function setUser(isGM) {
  globalThis.game = { system: { id: "shadowdark" }, user: { isGM } };
}

class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.attributes = {};
    this.validity = { valid: true };
  }
  append(...children) { this.children.push(...children); }
  insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector === "input" && child.tagName === "input") return child;
      if (selector.startsWith(".") && child.className?.split(" ").includes(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

function nativeDetails({ patron = false, observer = false } = {}) {
  const document = { createElement: tag => new Element(tag, document) };
  const grid = new Element("div", document);
  const languages = new Element("div", document);
  languages.style.gridColumn = `span ${patron ? 2 : 3}`;
  languages.querySelector = selector => selector.includes(".tags") ? {} : null;
  grid.append(languages);
  if (patron) grid.append(new Element("div", document));
  return {
    grid, languages,
    app: { actor: actorWithDtp(7), isEditable: !observer },
    root: { querySelector: selector => selector === ".tab-details .background-grid-a" ? grid : null }
  };
}

test("DTP defaults to zero and reads the actor's module flag", () => {
  assert.equal(getDtp(actorWithDtp(undefined)), 0);
  assert.equal(getDtp(actorWithDtp(12)), 12);
  assert.equal(getDtp({ getFlag: () => 8 }), 8);
  for (const value of [-5, "invalid", Infinity]) assert.equal(getDtp(actorWithDtp(value)), 0);
});

test("only GMs can save nonnegative whole DTP values on Player actors", async () => {
  const actor = actorWithDtp(0);
  setUser(false);
  assert.equal(await saveDtp(actor, 20), false);
  assert.equal(actor.writes.length, 0);
  setUser(true);
  for (const value of [-1, 2.5, Infinity, "invalid"]) assert.equal(await saveDtp(actor, value), false);
  assert.equal(await saveDtp(actorWithDtp(0, "NPC"), 5), false);
  assert.equal(await saveDtp(actor, "20"), true);
  assert.deepEqual(actor.writes, [{ scope: "mk-shadowdark", key: "dtp", value: 20 }]);
  assert.equal(getDtp(actor), 20);
});

test("player DTP writes and removals are blocked while ordinary actor updates remain allowed", () => {
  const actor = actorWithDtp(10);
  setUser(false);
  const changes = [
    { "flags.mk-shadowdark.dtp": 100 },
    { flags: { "mk-shadowdark": { dtp: 100 } } },
    { "flags.mk-shadowdark": { dtp: 100 } },
    { "flags.mk-shadowdark.-=dtp": null },
    { flags: { "mk-shadowdark": { "-=dtp": null } } },
    { flags: { "-=mk-shadowdark": null } },
    { "-=flags": null }
  ];
  for (const change of changes) {
    assert.equal(guardDtpUpdate(actor, change), false);
    setUser(true);
    assert.notEqual(guardDtpUpdate(actor, change), false);
    setUser(false);
  }
  assert.equal(guardDtpUpdate(actor, { flags: { "mk-shadowdark": { quickSlots: [] } } }), undefined);
  assert.equal(guardDtpUpdate(actor, { "system.attributes.hp.value": 3 }), undefined);
  assert.equal(changesDtp({ flags: { "mk-shadowdark": {} } }, { recursive: false }), true);
  assert.equal(guardDtpUpdate(actorWithDtp(0, "NPC"), changes[0]), undefined);
});

test("DTP appears once before Languages and saves GM edits independently of the native form", async () => {
  setUser(true);
  const { grid, languages, app, root } = nativeDetails();
  renderDtp(app, root);
  renderDtp(app, [root]);
  assert.equal(grid.children.length, 2);
  assert.equal(grid.children[1], languages);
  assert.equal(languages.style.gridColumn, "span 2");
  const input = grid.children[0].querySelector("input");
  assert.equal(input.value, "7");
  assert.equal(input.readOnly, false);
  assert.equal(input.name, undefined);
  assert.equal(input.attributes["aria-label"], "DTP");
  input.value = "12";
  let stopped = false;
  await input.listeners.change({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(getDtp(app.actor), 12);
  input.value = "-3";
  input.validity.valid = false;
  await input.listeners.change({ stopPropagation() {} });
  assert.equal(input.value, "12");
  assert.equal(app.actor.writes.length, 1);
});

test("players and observers see locked DTP while Patron stays on the Languages row", async () => {
  setUser(false);
  const { grid, languages, app, root } = nativeDetails({ patron: true, observer: true });
  renderDtp(app, root);
  renderDtp(app, root);
  assert.equal(grid.children.length, 3);
  assert.equal(languages.style.gridColumn, "span 1");
  const input = grid.children[0].querySelector("input");
  assert.equal(input.value, "7");
  assert.equal(input.readOnly, true);
  input.value = "99";
  await input.listeners.change({ stopPropagation() {} });
  assert.equal(input.value, "7");
  assert.equal(app.actor.writes.length, 0);
});

test("DTP is omitted from NPC sheets and sheets without native Details", () => {
  setUser(true);
  const { grid, app, root } = nativeDetails();
  app.actor.type = "NPC";
  renderDtp(app, root);
  assert.equal(grid.children.length, 1);
  app.actor.type = "Player";
  renderDtp(app, { querySelector: () => null });
  assert.equal(grid.children.length, 1);
});

function downtimeActor({ dtp = 5, gp = 100, level = 3, hitPoints = "d6", casterAbility = "wis", owner = true } = {}) {
  const actor = actorWithDtp(dtp);
  actor.id = "dtp";
  actor.uuid = "Actor.dtp";
  actor.name = "Test <Cleric>";
  actor.isOwner = owner;
  actor.system = {
    level: { value: level }, coins: { gp },
    getClass: async () => ({ system: { hitPoints, spellcasting: { ability: casterAbility } } }),
    rollConfigGenerators: {
      check(config) {
        config.type = "check";
        Object.assign(config.mainRoll, { formula: "1d20+2", advantage: 0 });
      }
    }
  };
  actor.update = async (change, options) => {
    if (guardDtpUpdate(actor, change, options) === false) return undefined;
    actor.writes.push({ change, options });
    actor.flags["mk-shadowdark"].dtp = change["flags.mk-shadowdark.dtp"];
    if ("system.coins.gp" in change) actor.system.coins.gp = change["system.coins.gp"];
    return actor;
  };
  return actor;
}

function nativeDowntime({ submitted = true, total = 18 } = {}) {
  const calls = { dialogs: [], rolls: [], messages: [] };
  globalThis.shadowdark = { dice: {
    async rollDialog(config) { calls.dialogs.push(config); return submitted; },
    async roll(config) {
      calls.rolls.push(config);
      return { total, async toMessage(data, options) { calls.messages.push({ data, options }); } };
    }
  } };
  return calls;
}

test("the menu contains all 29 supplied options, facilities, DCs, and asterisks", () => {
  assert.equal(DOWNTIME_ACTIVITIES.length, 5);
  assert.equal(DOWNTIME_OPTIONS.length, 29);
  assert.equal(new Set(DOWNTIME_OPTIONS.map(entry => entry.id)).size, 29);
  assert.deepEqual(DOWNTIME_ACTIVITIES.map(activity => activity.facility), ["Temple", "Tavern", "Barracks", "Library", "Trainer"]);
  assert.equal(DOWNTIME_OPTIONS.filter(entry => !entry.starred).length, 4);
  assert.deepEqual(DOWNTIME_OPTIONS.filter(entry => entry.activity.id === "spiritualism").map(entry => entry.dc), [9, 15, 20]);
  assert.deepEqual(DOWNTIME_OPTIONS.filter(entry => entry.activity.id === "martial").map(entry => entry.dc), [15, 18, 12, 15, 9, 12, 15]);
  assert.equal(getDowntimeOption("missing"), null);
  setUser(true);
  const html = buildDowntimeMenu(downtimeActor(), { hitDie: 6, casterAbility: "wis" });
  assert.equal((html.match(/type="radio"/g) ?? []).length, 29);
  assert.ok(html.includes("name=\"requirements\" required"));
  assert.ok(html.includes("Test &lt;Cleric&gt;"));
  assert.ok(html.includes('value="research-wis-healing" required>'));
  assert.ok(html.includes('value="research-int-scroll" required disabled>'));
  assert.ok(html.includes('name="ability-martial-d6"'));
});

test("starred costs use 10 gp per PC level, while unstarred activities cost no gold", () => {
  const starred = getDowntimeOption("spiritualism-wis-favor");
  const free = getDowntimeOption("skulduggery-cha-rumor");
  for (const level of [0, 1, 3, 10]) assert.equal(getDowntimeGoldCost(downtimeActor({ level }), starred), 10 * level);
  for (const level of [undefined, -1, 1.5, Infinity, "invalid"]) {
    const actor = downtimeActor();
    actor.system.level.value = level;
    assert.equal(getDowntimeGoldCost(actor, starred), null);
    assert.equal(getDowntimeGoldCost(actor, free), 0);
  }
});

test("class hit dice and spellcasting ability select the correct options", async () => {
  for (const hitDie of [4, 6, 8, 10, 12]) {
    const profile = await getDowntimeProfile(downtimeActor({ hitPoints: `1d${hitDie}`, casterAbility: "cha" }));
    assert.equal(profile.hitDie, hitDie);
    for (const tier of [4, 6, 8]) {
      const entry = getDowntimeOption(`martial-d${tier}-bonus`);
      assert.equal(isDowntimeEligible(entry, profile), tier === 8 ? hitDie >= 8 : hitDie === tier);
    }
    assert.equal(isDowntimeEligible(getDowntimeOption("research-cha-healing"), profile), true);
    assert.equal(isDowntimeEligible(getDowntimeOption("research-wis-trade"), profile), false);
  }
  const missing = await getDowntimeProfile({});
  assert.equal(isDowntimeEligible(getDowntimeOption("martial-d8-proficiency"), missing), false);
  assert.equal(isDowntimeEligible(getDowntimeOption("research-int-scroll"), missing), false);
  assert.equal(isDowntimeEligible(getDowntimeOption("skills-int-learn"), missing), true);
});

test("owners can spend exactly one DTP with its fixed gold cost, but cannot forge balance edits", async () => {
  setUser(false);
  const actor = downtimeActor();
  const entry = getDowntimeOption("spiritualism-wis-strengthening");
  assert.equal(await spendDtp(actor, entry), true);
  assert.equal(getDtp(actor), 4);
  assert.equal(actor.system.coins.gp, 70);
  const options = { mkShadowdarkDtp: { activityId: entry.id } };
  const valid = { "flags.mk-shadowdark.dtp": 3, "system.coins.gp": 40 };
  assert.notEqual(guardDtpUpdate(actor, valid, options), false);
  assert.notEqual(guardDtpUpdate(actor, { _id: actor.id, ...valid }, options), false);
  assert.equal(guardDtpUpdate(actor, { _id: "another-actor", ...valid }, options), false);
  assert.notEqual(guardDtpUpdate(actor, { flags: { "mk-shadowdark": { dtp: 3 } }, system: { coins: { gp: 40 } } }, options), false);
  for (const invalid of [
    { ...valid, "flags.mk-shadowdark.dtp": 5 },
    { ...valid, "flags.mk-shadowdark.dtp": 2 },
    { ...valid, "system.coins.gp": 70 },
    { ...valid, "system.level.xp": 99 },
    { "flags.mk-shadowdark.dtp": 3 }
  ]) assert.equal(guardDtpUpdate(actor, invalid, options), false);
  assert.equal(guardDtpUpdate(actor, valid, { mkShadowdarkDtp: { activityId: "made-up" } }), false);
  assert.equal(guardDtpUpdate(actor, valid, { ...options, recursive: false }), false);
  assert.equal(await spendDtp(downtimeActor({ owner: false }), entry), false);
  assert.equal(await saveDtp(actor, 100), false);
});

test("insufficient points or gold never make a partial payment", async () => {
  setUser(false);
  const starred = getDowntimeOption("skills-int-learn");
  for (const actor of [downtimeActor({ dtp: 0 }), downtimeActor({ gp: 29 })]) {
    assert.equal(await spendDtp(actor, starred), false);
    assert.deepEqual(actor.writes, []);
  }
  const actor = downtimeActor({ gp: 0 });
  assert.equal(await spendDtp(actor, getDowntimeOption("skulduggery-cha-rumor")), true);
  assert.equal(getDtp(actor), 4);
  assert.equal(actor.system.coins.gp, 0);
});

test("closing the native check spends nothing and produces no roll", async () => {
  setUser(false);
  const actor = downtimeActor();
  const calls = nativeDowntime({ submitted: false });
  assert.equal(await performDowntime(actor, "skills-int-learn", "int", { requirementsMet: true }), false);
  assert.equal(calls.dialogs.length, 1);
  assert.equal(calls.rolls.length, 0);
  assert.equal(actor.writes.length, 0);
  assert.equal(getDtp(actor), 5);
  assert.equal(actor.system.coins.gp, 100);
});

test("successes and failures both pay once and post native rolls without a luck reroll card", async () => {
  setUser(false);
  for (const total of [3, 19]) {
    const actor = downtimeActor();
    const calls = nativeDowntime({ total });
    assert.equal(await performDowntime(actor, "skills-int-learn", "int", { requirementsMet: true }), true);
    assert.equal(getDtp(actor), 4);
    assert.equal(actor.system.coins.gp, 70);
    assert.equal(actor.writes.length, 1);
    assert.equal(calls.dialogs[0].skipPrompt, false);
    assert.equal(calls.rolls[0].dc, 18);
    const message = calls.messages[0].data;
    assert.equal(message.flags["mk-shadowdark"].downtime.success, total >= 18);
    assert.equal(message.flags.shadowdark, undefined);
    assert.equal(message.flavor.includes('data-action="reroll"'), false);
  }
});

test("requirements, ownership, ability and class eligibility are checked before rolling", async () => {
  setUser(false);
  const calls = nativeDowntime();
  const actor = downtimeActor();
  assert.equal(await performDowntime(actor, "skills-int-learn", "int"), false);
  assert.equal(await performDowntime(actor, "skills-int-learn", "wis", { requirementsMet: true }), false);
  assert.equal(await performDowntime(actor, "research-cha-scroll", "cha", { requirementsMet: true }), false);
  assert.equal(await performDowntime(actor, "martial-d8-bonus", "str", { requirementsMet: true }), false);
  assert.equal(await performDowntime(downtimeActor({ owner: false }), "skills-int-learn", "int", { requirementsMet: true }), false);
  assert.equal(calls.dialogs.length, 0);
  assert.equal(actor.writes.length, 0);
});

test("downtime outcomes match native critical successes and failures", async () => {
  setUser(false);
  for (const success of [true, false]) {
    const actor = downtimeActor();
    let message;
    nativeDowntime();
    globalThis.shadowdark.dice.roll = async () => ({
      total: success ? 17 : 19,
      criticalSuccess: success, criticalFailure: !success,
      toMessage: async data => { message = data; }
    });
    assert.equal(await performDowntime(actor, "skills-int-learn", "int", { requirementsMet: true }), true);
    assert.equal(message.flags["mk-shadowdark"].downtime.success, success);
    assert.equal(getDtp(actor), 4);
  }
});

test("resources are rechecked after the prompt and duplicate clicks cannot open parallel attempts", async () => {
  setUser(false);
  const actor = downtimeActor({ dtp: 1 });
  const calls = nativeDowntime();
  let submit;
  globalThis.shadowdark.dice.rollDialog = () => new Promise(resolve => { submit = resolve; });
  const first = performDowntime(actor, "skills-int-learn", "int", { requirementsMet: true });
  while (!submit) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await performDowntime(actor, "skills-int-learn", "int", { requirementsMet: true }), false);
  actor.system.coins.gp = 1;
  submit(true);
  assert.equal(await first, false);
  assert.equal(getDtp(actor), 1);
  assert.equal(actor.writes.length, 0);
  assert.equal(calls.messages.length, 0);
});

test("the DTP button opens the option menu and cancel does not spend", async () => {
  setUser(true);
  let dialogConfig;
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async config => { dialogConfig = config; return null; } } } } };
  const { grid, app, root } = nativeDetails();
  renderDtp(app, root);
  const button = grid.children[0].querySelector(".mk-dtp-open");
  assert.equal(button.tagName, "button");
  assert.equal(button.type, "button");
  assert.equal(typeof button.listeners.click, "function");
  await openDowntimeMenu(app.actor);
  assert.equal(dialogConfig.classes[0], "mk-dtp-dialog");
  assert.ok(dialogConfig.content.includes("Spiritualism"));
  assert.ok(dialogConfig.content.includes("Learning Skills"));
  assert.equal(app.actor.writes.length, 0);
  delete globalThis.foundry;
});
