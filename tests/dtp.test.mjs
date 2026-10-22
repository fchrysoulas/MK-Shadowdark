import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildDowntimeMenu, changesDtp, getDtp, guardDtpUpdate,
  openDowntimeMenu, performDowntime, renderDtp, saveDtp, spendDtp
} from "../scripts/dtp/dtp.js";
import {
  DOWNTIME_ACTIVITIES, DOWNTIME_OPTIONS, getDowntimeGoldCost,
  getDowntimeOption, getDowntimeProfile, isDowntimeEligible
} from "../scripts/dtp/activities.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

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
  globalThis.game = {
    system: { id: "shadowdark" }, user: { isGM },
    i18n: {
      localize: key => translations[key] ?? key,
      format: (key, data) => (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => data[name])
    }
  };
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
    // Foundry adds the document subtype before calling preUpdateActor.
    if (guardDtpUpdate(actor, { _id: actor.id, type: actor.type, ...change }, options) === false) return undefined;
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

function installDowntimeDialog() {
  class DowntimeDialog {
    constructor(config) {
      this.options = config;
      this.closed = false;
      this.balance = { innerHTML: config.content.match(/class="mk-dtp-balance">(.*?)<\/p>/s)?.[1] };
      this.inputs = [...config.content.matchAll(/<input type="radio" name="activity" value="([^"]+)"([^>]*)>/g)].map(([, value, attributes]) => {
        const classes = new Set();
        const cost = { textContent: "" };
        const row = {
          classList: {
            toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
            contains: name => classes.has(name)
          },
          querySelector: () => cost
        };
        return { value, disabled: attributes.includes("disabled"), checked: false, closest: () => row };
      });
      const inputs = this.inputs;
      const elements = { activity: { get value() { return inputs.find(input => input.checked)?.value ?? ""; } } };
      if (config.content.includes('name="partyGroup"')) {
        elements.partyGroup = { value: "", listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; } };
      }
      const teacherOptions = config.content.match(/<select name="skillTeacher"[^>]*>([\s\S]*?)<\/select>/)?.[1];
      if (teacherOptions) {
        elements.skillTeacher = {
          value: "", listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback; },
          options: [...teacherOptions.matchAll(/<option value="([^"]*)"([^>]*)>(.*?)<\/option>/g)]
            .map(([, value, attributes, textContent]) => ({ value, disabled: attributes.includes("disabled"), textContent }))
        };
      }
      for (const activity of DOWNTIME_ACTIVITIES) {
        for (const group of activity.groups) {
          if (group.abilities.length > 1) elements[`ability-${activity.id}-${group.id}`] = { value: group.abilities[0] };
        }
      }
      this.form = {
        elements,
        querySelector: () => this.balance,
        querySelectorAll: () => this.inputs
      };
      this.element = { querySelector: () => this.form };
      this.listeners = {};
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    render() { this.listeners.render?.(); return this; }
    close() { this.closed = true; return this; }
    select(value) { for (const input of this.inputs) input.checked = input.value === value; }
    async press(action) {
      const button = this.options.buttons.find(button => button.action === action);
      await button.callback(null, { form: this.form }, this);
      if (this.options.form?.closeOnSubmit !== false) this.close();
    }
  }
  globalThis.foundry = { applications: { api: { DialogV2: DowntimeDialog } } };
  return DowntimeDialog;
}

test("the menu starts with every category collapsed and contains 32 checks plus Carousing", () => {
  assert.equal(DOWNTIME_ACTIVITIES.length, 5);
  assert.equal(DOWNTIME_OPTIONS.length, 32);
  assert.equal(new Set(DOWNTIME_OPTIONS.map(entry => entry.id)).size, 32);
  assert.deepEqual(DOWNTIME_ACTIVITIES.map(activity => activity.facility), ["Temple", "Tavern", "Barracks", "Library", "Trainer"]);
  assert.equal(DOWNTIME_OPTIONS.filter(entry => !entry.starred).length, 4);
  assert.deepEqual(DOWNTIME_OPTIONS.filter(entry => entry.activity.id === "spiritualism").map(entry => entry.dc), [9, 15, 20]);
  assert.deepEqual(DOWNTIME_OPTIONS.filter(entry => entry.activity.id === "martial").map(entry => entry.dc), [15, 18, 12, 15, 9, 12, 15]);
  assert.equal(getDowntimeOption("missing"), null);
  setUser(true);
  const html = buildDowntimeMenu(downtimeActor(), { hitDie: 6, casterAbility: "wis" });
  assert.equal((html.match(/type="radio"/g) ?? []).length, 33);
  assert.equal((html.match(/<details\b/g) ?? []).length, 6);
  assert.doesNotMatch(html, /<details\b[^>]*\bopen\b/);
  assert.match(html, /value="carousing" required/);
  assert.doesNotMatch(html, /type="checkbox"|name="requirements"/);
  assert.ok(html.includes("Test &lt;Cleric&gt;"));
  assert.ok(html.includes('value="research-wis-healing" required>'));
  assert.ok(html.includes('value="research-int-scroll" required disabled>'));
  assert.ok(html.includes('name="ability-martial-d6"'));
});

test("new Skulduggery rumors use CHA at their listed DCs and pay starred activity costs", async () => {
  setUser(false);
  for (const [id, dc, label] of [
    ["local-rumor", 12, "Gain a local rumor"],
    ["world-rumor", 20, "Gain a world rumor"],
    ["seed-rumor", 20, "Seed a rumor"]
  ]) {
    const actor = downtimeActor();
    const activityId = `skulduggery-cha-${id}`;
    const calls = nativeDowntime({ total: 21 });
    const entry = getDowntimeOption(activityId);
    assert.equal(entry.label, label);
    assert.equal(entry.starred, true);
    assert.equal(await performDowntime(actor, activityId, "cha"), true);
    assert.equal(calls.dialogs[0].check.stat, "cha");
    assert.equal(calls.rolls[0].dc, dc);
    assert.equal(calls.messages[0].data.flags["mk-shadowdark"].downtime.gold, 30);
    assert.ok(calls.messages[0].data.flavor.includes(label));
    assert.equal(getDtp(actor), 4);
    assert.equal(actor.system.coins.gp, 70);
    assert.equal(actor.writes.length, 1);
  }
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
  assert.notEqual(guardDtpUpdate(actor, { _id: actor.id, type: "Player", ...valid }, options), false);
  assert.notEqual(guardDtpUpdate(actor, { _id: actor.id, type: "Player", flags: { "mk-shadowdark": { dtp: 3 } }, system: { coins: { gp: 40 } } }, options), false);
  assert.equal(guardDtpUpdate(actor, { _id: "another-actor", ...valid }, options), false);
  assert.notEqual(guardDtpUpdate(actor, { flags: { "mk-shadowdark": { dtp: 3 } }, system: { coins: { gp: 40 } } }, options), false);
  for (const invalid of [
    { ...valid, "flags.mk-shadowdark.dtp": 5 },
    { ...valid, "flags.mk-shadowdark.dtp": 2 },
    { ...valid, "system.coins.gp": 70 },
    { ...valid, "system.level.xp": 99 },
    { ...valid, type: "NPC" },
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
  assert.equal(await performDowntime(actor, "skills-int-learn", "int"), false);
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
    assert.equal(await performDowntime(actor, "skills-int-learn", "int"), true);
    assert.equal(getDtp(actor), 4);
    assert.equal(actor.system.coins.gp, 70);
    assert.equal(actor.writes.length, 1);
    assert.equal(calls.dialogs[0].skipPrompt, false);
    assert.equal(calls.rolls[0].dc, 18);
    const message = calls.messages[0].data;
    assert.equal(message.flags["mk-shadowdark"].downtime.success, total >= 18);
    assert.equal(message.flags.shadowdark, undefined);
    assert.equal(message.flavor.includes('data-action="reroll"'), false);
    assert.doesNotMatch(message.flavor, /noLuck|luck tokens/i);
    assert.match(message.flavor, /mk-dtp-result-title">Learn a language or auxiliary skill/);
    assert.match(message.flavor, /INT · DC 18/);
    assert.ok(message.flavor.includes(total >= 18 ? "Success" : "Failure"));
    assert.match(message.flavor, /Spent 1 DTP and 30 gp · 4 DTP remaining/);
    assert.equal(message.flavor.includes("With a capable instructor"), total >= 18);
  }
});

test("unstarred chat results omit a zero-gold cost and escape activity text", async () => {
  setUser(false);
  const actor = downtimeActor({ gp: 0 });
  const entry = getDowntimeOption("skulduggery-cha-rumor");
  const label = entry.label;
  const calls = nativeDowntime();
  try {
    entry.label = "Rumor <test>";
    assert.equal(await performDowntime(actor, entry.id, "cha"), true);
    const { flavor } = calls.messages[0].data;
    assert.match(flavor, /Rumor &lt;test&gt;/);
    assert.match(flavor, /Spent 1 DTP · 4 DTP remaining/);
    assert.doesNotMatch(flavor, /\bgp\b|noLuck|luck tokens/i);
  } finally {
    entry.label = label;
  }
});

test("ownership, ability and class eligibility are checked before rolling", async () => {
  setUser(false);
  const calls = nativeDowntime();
  const actor = downtimeActor();
  assert.equal(await performDowntime(actor, "missing", "int"), false);
  assert.equal(await performDowntime(actor, "skills-int-learn", "wis"), false);
  assert.equal(await performDowntime(actor, "research-cha-scroll", "cha"), false);
  assert.equal(await performDowntime(actor, "martial-d8-bonus", "str"), false);
  assert.equal(await performDowntime(downtimeActor({ owner: false }), "skills-int-learn", "int"), false);
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
    assert.equal(await performDowntime(actor, "skills-int-learn", "int"), true);
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
  const first = performDowntime(actor, "skills-int-learn", "int");
  while (!submit) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(await performDowntime(actor, "skills-int-learn", "int"), false);
  actor.system.coins.gp = 1;
  submit(true);
  assert.equal(await first, false);
  assert.equal(getDtp(actor), 1);
  assert.equal(actor.writes.length, 0);
  assert.equal(calls.messages.length, 0);
});

test("the DTP button opens the option menu and cancel does not spend", async () => {
  setUser(true);
  installDowntimeDialog();
  const { grid, app, root } = nativeDetails();
  renderDtp(app, root);
  const button = grid.children[0].querySelector(".mk-dtp-open");
  assert.equal(button.tagName, "button");
  assert.equal(button.type, "button");
  assert.equal(button.title, "Downtime activities");
  assert.equal(button.attributes["aria-label"], "Downtime activities");
  assert.equal(button.querySelector(".fa-hourglass-half").attributes["aria-hidden"], "true");
  assert.equal(typeof button.listeners.click, "function");
  const dialog = await openDowntimeMenu(app.actor);
  const dialogConfig = dialog.options;
  assert.equal(dialogConfig.classes[0], "mk-dtp-dialog");
  assert.ok(dialogConfig.content.includes("Spiritualism"));
  assert.ok(dialogConfig.content.includes("Learning Skills"));
  await dialog.press("cancel");
  assert.equal(dialog.closed, true);
  assert.equal(app.actor.writes.length, 0);
  delete globalThis.foundry;
});

test("attempts keep the menu open, preserve choices and refresh gold and DTP for repeated native checks", async () => {
  setUser(false);
  const actor = downtimeActor();
  const calls = nativeDowntime();
  installDowntimeDialog();
  try {
    const dialog = await openDowntimeMenu(actor);
    const form = dialog.form;
    dialog.select("martial-d6-bonus");
    form.elements["ability-martial-d6"].value = "dex";
    for (const [dtp, gold] of [[4, 70], [3, 40]]) {
      await dialog.press("attempt");
      assert.equal(dialog.closed, false);
      assert.equal(dialog.form, form, "the existing form stays in place");
      assert.equal(form.elements.activity.value, "martial-d6-bonus");
      assert.equal(form.elements["ability-martial-d6"].value, "dex");
      assert.ok(dialog.balance.innerHTML.includes(`${dtp} DTP · ${gold} gp`));
      assert.ok(dialog.balance.innerHTML.includes("Test &lt;Cleric&gt;"));
    }
    assert.equal(calls.dialogs.length, 2);
    assert.equal(calls.dialogs[0].check.stat, "dex");
    assert.equal(calls.rolls.length, 2);
    assert.equal(calls.messages.length, 2);
    assert.equal(actor.writes.length, 2);
    assert.equal(getDtp(actor), 3);
    await dialog.press("cancel");
    assert.equal(dialog.closed, true);
  } finally {
    delete globalThis.foundry;
  }
});

test("the open menu disables unaffordable activities after gold or DTP is spent", async () => {
  setUser(false);
  installDowntimeDialog();
  nativeDowntime();
  try {
    for (const [points, expectedPoints, freeDisabled] of [[3, 2, false], [1, 0, true]]) {
      const actor = downtimeActor({ dtp: points, gp: 30 });
      const dialog = await openDowntimeMenu(actor);
      dialog.select("skills-int-learn");
      await dialog.press("attempt");
      const starred = dialog.inputs.find(input => input.value === "skills-int-learn");
      const free = dialog.inputs.find(input => input.value === "skulduggery-cha-rumor");
      assert.equal(dialog.closed, false);
      assert.equal(starred.disabled, true);
      assert.equal(starred.checked, false);
      assert.equal(starred.closest().classList.contains("is-unavailable"), true);
      assert.match(starred.closest().querySelector().textContent, /Not enough DTP or gold/);
      assert.equal(free.disabled, freeDisabled);
      assert.ok(dialog.balance.innerHTML.includes(`${expectedPoints} DTP · 0 gp`));
      await dialog.press("attempt");
      assert.equal(actor.writes.length, 1, "an empty selection never charges another attempt");
    }
  } finally { delete globalThis.foundry; }
});

test("cancelling the native check leaves the menu open with unchanged balances and selection", async () => {
  setUser(false);
  installDowntimeDialog();
  const actor = downtimeActor();
  const calls = nativeDowntime({ submitted: false });
  try {
    const dialog = await openDowntimeMenu(actor);
    dialog.select("skills-int-learn");
    await dialog.press("attempt");
    assert.equal(dialog.closed, false);
    assert.equal(dialog.form.elements.activity.value, "skills-int-learn");
    assert.ok(dialog.balance.innerHTML.includes("5 DTP · 100 gp"));
    assert.equal(actor.writes.length, 0);
    assert.equal(calls.rolls.length, 0);
  } finally { delete globalThis.foundry; }
});

test("party selection enables fallback attempts and the open menu refreshes character and treasury balances", async () => {
  setUser(true);
  game.user.id = "gm";
  game.user.active = true;
  game.users = [game.user];
  const actor = downtimeActor({ gp: 5 });
  const party = id => ({
    id, uuid: `Actor.${id}`, name: id, system: { coins: { gp: 60 } },
    getFlag: (_scope, key) => key === "isGroup" ? true : key === "group" ? { members: [actor.uuid] } : undefined,
    async update(change) { this.system.coins.gp = change["system.coins.gp"]; return this; }
  });
  const first = party("first");
  const second = party("second");
  game.actors = [actor, first, second];
  const calls = nativeDowntime();
  installDowntimeDialog();
  foundry.utils = { deepClone: structuredClone };
  try {
    const dialog = await openDowntimeMenu(actor);
    const input = dialog.inputs.find(input => input.value === "skills-int-learn");
    assert.equal(input.disabled, true, "several groups require a choice");
    dialog.form.elements.partyGroup.value = second.uuid;
    dialog.form.elements.partyGroup.listeners.change();
    assert.equal(input.disabled, false);
    assert.ok(dialog.balance.innerHTML.includes("Party Treasure — second: 60 gp"));
    dialog.select("skills-int-learn");
    await dialog.press("attempt");
    assert.equal(dialog.closed, false);
    assert.ok(dialog.balance.innerHTML.includes("4 DTP · 5 gp"));
    assert.ok(dialog.balance.innerHTML.includes("Party Treasure — second: 30 gp"));
    assert.equal(first.system.coins.gp, 60);
    assert.equal(second.system.coins.gp, 30);
    assert.equal(calls.messages[0].data.flags["mk-shadowdark"].downtime.groupUuid, second.uuid);
  } finally { delete globalThis.foundry; }
});

test("Learning Skills teacher selection waives gold, refreshes both DTP balances and disables an exhausted teacher", async () => {
  setUser(true);
  game.user.id = "gm";
  game.user.active = true;
  game.users = [game.user];
  const actor = downtimeActor({ gp: 100 });
  const teacher = downtimeActor({ dtp: 1, gp: 200 });
  teacher.id = "teacher";
  teacher.uuid = "Actor.teacher";
  teacher.name = "Teacher";
  game.actors = [actor, teacher];
  const calls = nativeDowntime();
  installDowntimeDialog();
  try {
    const dialog = await openDowntimeMenu(actor);
    const selector = dialog.form.elements.skillTeacher;
    selector.value = teacher.uuid;
    selector.listeners.change();
    const input = dialog.inputs.find(input => input.value === "skills-int-learn");
    assert.match(input.closest().querySelector().textContent, /1 DTP each for learner and teacher · 0 gp/);
    dialog.select("skills-int-learn");
    await dialog.press("attempt");
    assert.equal(dialog.closed, false);
    assert.ok(dialog.balance.innerHTML.includes("4 DTP · 100 gp"));
    assert.equal(getDtp(teacher), 0);
    assert.equal(actor.system.coins.gp, 100);
    assert.equal(teacher.system.coins.gp, 200);
    assert.equal(selector.value, teacher.uuid, "the teacher stays selected rather than switching to paid training");
    const option = selector.options.find(option => option.value === teacher.uuid);
    assert.equal(option.disabled, true);
    assert.equal(option.textContent, "Teacher · 0 DTP");
    assert.equal(input.disabled, true);
    assert.equal(calls.messages[0].data.flags["mk-shadowdark"].downtime.teacherUuid, teacher.uuid);
    selector.value = "";
    selector.listeners.change();
    assert.equal(input.disabled, false, "paid training remains an explicit option");
  } finally { delete globalThis.foundry; }
});

test("Carousing opens its separate event menu without charging the check activity fee", async () => {
  setUser(true);
  const actor = downtimeActor();
  globalThis.game.actors = [actor];
  let dialogs = 0;
  const DialogV2 = installDowntimeDialog();
  DialogV2.wait = async config => {
    dialogs++;
    assert.equal(config.window.title, "Carousing*");
    assert.match(config.content, /name="bonus"/);
    return null;
  };
  try {
    const dialog = await openDowntimeMenu(actor);
    dialog.select("carousing");
    await dialog.press("attempt");
    assert.equal(dialogs, 1);
    assert.equal(dialog.closed, false);
    assert.equal(dialog.form.elements.activity.value, "carousing");
    assert.ok(dialog.balance.innerHTML.includes("5 DTP · 100 gp"));
    assert.equal(actor.writes.length, 0);
    assert.equal(getDtp(actor), 5);
  } finally { delete globalThis.foundry; }
});
