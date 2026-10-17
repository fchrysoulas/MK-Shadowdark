import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getPartyGroups, getDowntimePayment, payDowntime, handlePartyPaymentRequest, receivePartyPayment
} from "../scripts/dtp/payments.js";
import { buildDowntimeMenu, performDowntime, guardDtpUpdate } from "../scripts/dtp/dtp.js";
import { getDowntimeOption } from "../scripts/dtp/activities.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const entry = getDowntimeOption("skills-int-learn");
let messageId = 0;

function fixture({ gp = 5, dtp = 3, partyGold = 100, asPlayer = false } = {}) {
  const gm = { id: "gm", active: true, isGM: true };
  const player = { id: "player", active: true, isGM: false };
  const stranger = { id: "stranger", active: true, isGM: false };
  globalThis.foundry = { utils: { deepClone: structuredClone } };
  globalThis.game = {
    user: asPlayer ? player : gm, users: [gm, player, stranger], actors: [], system: { id: "shadowdark" },
    i18n: { format: (key, data) => (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => data[name]) }
  };
  const warnings = [];
  globalThis.ui = { notifications: { warn: value => warnings.push(value), error: value => warnings.push(value) } };
  const makeActor = (id, gold = gp) => {
    const actor = {
      id, uuid: `Actor.${id}`, documentName: "Actor", type: "Player", name: id, writes: [], owner: player.id,
      flags: { "mk-shadowdark": { dtp } },
      system: {
        coins: { gp: gold, sp: 10, cp: 20 }, level: { value: 3 },
        getClass: async () => ({ system: { hitPoints: "d6", spellcasting: { ability: "wis" } } }),
        rollConfigGenerators: { check: config => { config.mainRoll.formula = "1d20"; } }
      },
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      testUserPermission(user) { return user.isGM || user.id === this.owner; },
      get isOwner() { return this.testUserPermission(game.user); },
      async update(change, options) {
        if (guardDtpUpdate(this, change, options) === false) return undefined;
        this.writes.push(change);
        if ("flags.mk-shadowdark.dtp" in change) this.flags["mk-shadowdark"].dtp = change["flags.mk-shadowdark.dtp"];
        if ("system.coins.gp" in change) this.system.coins.gp = change["system.coins.gp"];
        return this;
      }
    };
    game.actors.push(actor);
    return actor;
  };
  const actor = makeActor("hero");
  const addGroup = (id, { members = [actor.uuid], accessible = true, gold = partyGold } = {}) => {
    const group = {
      id, uuid: `Actor.${id}`, documentName: "Actor", type: "Player", name: id, writes: [], accessible,
      flags: { "mk-shadowdark": { isGroup: true, group: { members } } },
      system: { coins: { gp: gold, sp: 11, cp: 22 } },
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      testUserPermission(user, permission) { return user.isGM || (this.accessible && permission === "OBSERVER"); },
      get isOwner() { return game.user.isGM; },
      async update(change) {
        assert.equal(game.user.id, gm.id, "only the authoritative GM writes Party Treasure");
        this.writes.push(change);
        this.system.coins.gp = change["system.coins.gp"];
        return this;
      }
    };
    game.actors.push(group);
    return group;
  };
  const group = addGroup("party");
  const messages = [];
  globalThis.shadowdark = { dice: {
    rollDialog: async () => true,
    roll: async () => ({ total: 20, toMessage: async data => { messages.push(data); } })
  } };
  return { gm, player, stranger, actor, group, addGroup, makeActor, messages, warnings };
}

function paymentMessage(f, changes = {}) {
  const message = {
    id: `payment-${++messageId}`, timestamp: Date.now(), author: f.player,
    flags: { "mk-shadowdark": { dtpPartyPayment: {
      requestId: `request-${messageId}`, status: "pending", actorUuid: f.actor.uuid,
      activityId: entry.id, groupUuid: f.group.uuid, ...changes
    } } },
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async update(change) {
      if ("flags.mk-shadowdark.dtpPartyPayment.status" in change) this.flags["mk-shadowdark"].dtpPartyPayment.status = change["flags.mk-shadowdark.dtpPartyPayment.status"];
      if ("flags.mk-shadowdark.dtpPartyPayment" in change) this.flags["mk-shadowdark"].dtpPartyPayment = change["flags.mk-shadowdark.dtpPartyPayment"];
      this.content = change.content ?? this.content;
      receivePartyPayment(this);
      return this;
    }
  };
  return message;
}

test("personal gold pays first and the full fee falls back to Party Treasure without combining balances", async () => {
  const f = fixture({ gp: 30 });
  assert.equal(getDowntimePayment(f.actor, entry).group, null);
  assert.equal((await payDowntime(f.actor, entry)).groupUuid, null);
  assert.equal(f.actor.system.coins.gp, 0);
  assert.equal(f.group.system.coins.gp, 100);
  f.actor.system.coins.gp = 5;
  const receipt = await payDowntime(f.actor, entry);
  assert.equal(receipt.groupUuid, f.group.uuid);
  assert.equal(receipt.gold, 30);
  assert.equal(f.actor.system.coins.gp, 5);
  assert.equal(f.group.system.coins.gp, 70);
  assert.equal(f.actor.flags["mk-shadowdark"].dtp, 1);
  assert.equal(f.group.system.coins.sp, 11);
  assert.equal(f.group.system.coins.cp, 22);
});

test("only accessible groups containing the trying character qualify", () => {
  const f = fixture({ asPlayer: true });
  f.addGroup("unassigned", { members: [] });
  f.addGroup("inaccessible", { accessible: false });
  f.group.flags["mk-shadowdark"].group.activeMembers = [];
  assert.deepEqual(getPartyGroups(f.actor).map(group => group.uuid), [f.group.uuid]);
  assert.equal(getDowntimePayment(f.actor, entry).group, f.group);
  f.actor.owner = f.stranger.id;
  assert.deepEqual(getPartyGroups(f.actor), []);
  assert.equal(getDowntimePayment(f.actor, entry), null);
});

test("several assigned groups require an explicit eligible choice", () => {
  const f = fixture({ asPlayer: true });
  const second = f.addGroup("second");
  assert.equal(getDowntimePayment(f.actor, entry), null);
  assert.equal(getDowntimePayment(f.actor, entry, { groupUuid: second.uuid }).group, second);
  assert.equal(getDowntimePayment(f.actor, entry, { groupUuid: "Actor.other" }), null);
  const html = buildDowntimeMenu(f.actor, { hitDie: 6, casterAbility: "wis" });
  assert.match(html, /name="partyGroup"/);
  assert.ok(html.includes(`value="${f.group.uuid}"`));
  assert.ok(html.includes(`value="${second.uuid}"`));
});

test("the menu shows available Party Treasure and enables affordable starred checks", () => {
  const f = fixture({ asPlayer: true });
  f.group.name = "Party <One>";
  const html = buildDowntimeMenu(f.actor, { hitDie: 6, casterAbility: "wis" });
  assert.match(html, /Party Treasure — Party &lt;One&gt;: 100 gp/);
  assert.match(html, /value="skills-int-learn" required>/);
  assert.match(html, /Party Treasure — Party &lt;One&gt;/);
  assert.doesNotMatch(html, /name="partyGroup"/);
});

test("insufficient shared gold, no DTP, missing GM and unrelated groups never produce a payment", async () => {
  for (const setup of [
    f => { f.group.system.coins.gp = 29; },
    f => { f.actor.flags["mk-shadowdark"].dtp = 0; },
    () => { game.users = []; },
    f => { f.group.flags["mk-shadowdark"].group.members = []; }
  ]) {
    const f = fixture();
    setup(f);
    assert.equal(await payDowntime(f.actor, entry), null);
    assert.equal(f.actor.writes.length, 0);
    assert.equal(f.group.writes.length, 0);
  }
});

test("concurrent attempts on one treasury are serialized and cannot overspend", async () => {
  const f = fixture({ partyGold: 40 });
  const second = f.makeActor("second");
  f.group.flags["mk-shadowdark"].group.members.push(second.uuid);
  const receipts = await Promise.all([payDowntime(f.actor, entry), payDowntime(second, entry)]);
  assert.equal(receipts.filter(Boolean).length, 1);
  assert.equal(f.group.system.coins.gp, 10);
  assert.equal(f.actor.flags["mk-shadowdark"].dtp + second.flags["mk-shadowdark"].dtp, 5);
});

test("rejected DTP updates refund the party fee and a rejected treasury update never spends DTP", async () => {
  const f = fixture();
  f.actor.update = async () => undefined;
  await assert.rejects(payDowntime(f.actor, entry), /DTP payment was rejected/);
  assert.equal(f.group.system.coins.gp, 100);
  assert.equal(f.actor.flags["mk-shadowdark"].dtp, 3);
  f.group.update = async () => undefined;
  assert.equal(await payDowntime(f.actor, entry), null);
  assert.equal(f.actor.writes.length, 0);
});

test("the primary GM checks the request author, assignment and access and ignores duplicate delivery", async () => {
  const f = fixture();
  const message = paymentMessage(f);
  await Promise.all([handlePartyPaymentRequest(message), handlePartyPaymentRequest(message)]);
  assert.equal(message.flags["mk-shadowdark"].dtpPartyPayment.status, "paid");
  assert.equal(f.group.system.coins.gp, 70);
  assert.equal(f.actor.flags["mk-shadowdark"].dtp, 2);
  const stranger = paymentMessage(f);
  stranger.author = f.stranger;
  await handlePartyPaymentRequest(stranger);
  assert.equal(stranger.flags["mk-shadowdark"].dtpPartyPayment.status, "failed");
  f.group.accessible = false;
  const inaccessible = paymentMessage(f);
  await handlePartyPaymentRequest(inaccessible);
  assert.equal(inaccessible.flags["mk-shadowdark"].dtpPartyPayment.status, "failed");
  f.group.accessible = true;
  f.group.flags["mk-shadowdark"].group.members = [];
  const unassigned = paymentMessage(f);
  await handlePartyPaymentRequest(unassigned);
  assert.equal(unassigned.flags["mk-shadowdark"].dtpPartyPayment.status, "failed");
  assert.equal(f.group.system.coins.gp, 70);
});

test("stale requests and non-authoritative clients cannot spend shared funds", async () => {
  const f = fixture();
  const expired = paymentMessage(f);
  expired.timestamp -= 30000;
  await handlePartyPaymentRequest(expired);
  assert.equal(expired.flags["mk-shadowdark"].dtpPartyPayment.status, "failed");
  const pending = paymentMessage(f);
  game.user = f.player;
  await handlePartyPaymentRequest(pending);
  assert.equal(pending.flags["mk-shadowdark"].dtpPartyPayment.status, "pending");
  assert.equal(f.group.writes.length, 0);
  assert.equal(f.actor.writes.length, 0);
});

test("observer players request a GM payment and wait for its receipt before completing", async () => {
  const f = fixture({ asPlayer: true });
  let processing;
  let request;
  globalThis.ChatMessage = { create: async data => {
    request = data;
    const message = paymentMessage(f, data.flags["mk-shadowdark"].dtpPartyPayment);
    processing = Promise.resolve().then(async () => {
      game.user = f.gm;
      try { await handlePartyPaymentRequest(message); }
      finally { game.user = f.player; }
    });
    return message;
  } };
  try {
    const receipt = await payDowntime(f.actor, entry);
    await processing;
    assert.equal(receipt.groupUuid, f.group.uuid);
    assert.deepEqual(request.whisper, [f.gm.id, f.player.id]);
    assert.equal(f.actor.system.coins.gp, 5);
    assert.equal(f.group.system.coins.gp, 70);
    assert.equal(f.actor.flags["mk-shadowdark"].dtp, 2);
  } finally { delete globalThis.ChatMessage; }
});

test("native downtime cancellation never requests a party payment and completed rolls identify the source", async () => {
  const f = fixture();
  shadowdark.dice.rollDialog = async () => false;
  assert.equal(await performDowntime(f.actor, entry.id, "int"), false);
  assert.equal(f.group.writes.length, 0);
  assert.equal(f.actor.writes.length, 0);
  shadowdark.dice.rollDialog = async () => true;
  assert.equal(await performDowntime(f.actor, entry.id, "int"), true);
  assert.equal(f.group.system.coins.gp, 70);
  assert.equal(f.actor.system.coins.gp, 5);
  assert.match(f.messages[0].flavor, /30 gp from party&#39;s Party Treasure/);
  assert.equal(f.messages[0].flags["mk-shadowdark"].downtime.groupUuid, f.group.uuid);
});

test("party resources and membership are rechecked after the native roll prompt", async () => {
  for (const revoke of [
    f => { f.group.system.coins.gp = 0; },
    f => { f.group.flags["mk-shadowdark"].group.members = []; }
  ]) {
    const f = fixture();
    shadowdark.dice.rollDialog = async () => { revoke(f); return true; };
    assert.equal(await performDowntime(f.actor, entry.id, "int"), false);
    assert.equal(f.actor.writes.length, 0);
    assert.equal(f.group.writes.length, 0);
    assert.equal(f.messages.length, 0);
  }
});
