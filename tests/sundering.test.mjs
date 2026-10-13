import test from "node:test";
import assert from "node:assert/strict";
import {
  createOffer, decisionUser, handleChat, isMeleeWeaponAttack, promptForItem,
  resolvePlan, responseChoice, showOffer, sunderingItems
} from "../scripts/sundering/sundering.js";
import { calculateHpChange } from "../scripts/auto-damage/auto-damage-operation.js";
import { createProcessingState, normalizeProcessingState, runProcessingState } from "../scripts/auto-damage/auto-damage-processing-state.js";

function equippedItem(id = "shield", properties = ["Sundering"]) {
  return { id, name: id, type: "Armor", system: { equipped: true, stashed: false, propertyNames: properties } };
}

function fixture(items = [equippedItem()]) {
  const gm = { id: "gm", isGM: true, active: true };
  const player = { id: "player", isGM: false, active: true, character: { id: "hero" } };
  const other = { id: "other", isGM: false, active: true };
  const users = [gm, player, other];
  users.get = id => users.find(user => user.id === id);
  items.get = id => items.find(item => item.id === id);
  const actor = {
    id: "hero", type: "Player", name: "Hero", hp: 12, items, deletions: [],
    testUserPermission: user => user.id === "player",
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "Item");
      this.deletions.push(...ids);
      for (const id of ids) this.items.splice(this.items.findIndex(item => item.id === id), 1);
    }
  };
  globalThis.game = { user: gm, users, messages: [], i18n: { format: (key, data) => key + JSON.stringify(data) } };
  globalThis.foundry = {};
  const message = { id: "attack" };
  const target = {
    uuid: "Scene.scene.Token.hero", state: "planned", hpPath: "system.hp.value",
    actorName: "Hero", operation: "damage", amount: 5, effectiveAmount: 5,
    beforeHp: 12, afterHp: 7, appliedAmount: 5
  };
  let persisted;
  const options = {
    persistState: async state => { persisted = normalizeProcessingState(state); },
    resolveTarget: async () => ({ actor }),
    refreshTarget: async target => {
      target.beforeHp = actor.hp;
      const change = calculateHpChange(actor.hp, 12, target.effectiveAmount, target.operation);
      target.afterHp = change.newHP;
      target.appliedAmount = change.appliedAmount;
    }
  };
  return {
    actor, gm, player, other, target, message, options,
    get persisted() { return persisted; },
    async plan() {
      target.sundering = await createOffer(message, target, actor);
      return createProcessingState({ operation: "damage", amount: 5, targets: [target] });
    }
  };
}

test("Sundering recognizes native melee Weapon and NPC Attack rolls, never ranged attacks or spells", async () => {
  fixture();
  const weapon = { type: "Weapon", system: { type: "melee" } };
  const message = type => ({ rollConfig: { type: "attack", itemUuid: "Item.sword", attack: { type } } });
  assert.equal(await isMeleeWeaponAttack(message("melee"), async () => weapon), true);
  assert.equal(await isMeleeWeaponAttack(message("ranged"), async () => weapon), false);
  assert.equal(await isMeleeWeaponAttack(message("melee"), async () => ({ type: "NPC Attack" })), true);
  assert.equal(await isMeleeWeaponAttack({ rollConfig: { type: "spell", itemUuid: "Item.spell" } }, async () => weapon), false);
  assert.equal(await isMeleeWeaponAttack(message("melee"), async () => ({ type: "Spell" })), false);
  assert.equal(await isMeleeWeaponAttack(message("melee"), async () => null), false);
  assert.equal(await isMeleeWeaponAttack({ flags: { shadowdark: { rollConfig: {
    type: "attack", itemUuid: "Item.sword"
  } } } }, async () => weapon), true);
});

test("Sundering uses equipped and stashed rules and resolves linked Property UUIDs", async () => {
  const stashed = equippedItem("stashed");
  stashed.system.stashed = true;
  const unequipped = equippedItem("unequipped");
  unequipped.system.equipped = false;
  const linked = equippedItem("linked", []);
  linked.system.properties = ["Compendium.props.Item.sundering"];
  const f = fixture([equippedItem(), stashed, unequipped, equippedItem("ordinary", []), linked]);
  const eligible = await sunderingItems(f.actor, async () => ({ type: "Property", name: "Sundering" }));
  assert.deepEqual(eligible.map(item => item.id), ["shield", "linked"]);
  f.actor.type = "NPC";
  assert.deepEqual(await sunderingItems(f.actor), []);
});

test("offers go to an active owner, with GM fallback, and exclude healing and zero damage", async () => {
  const f = fixture();
  assert.equal(decisionUser(f.actor), f.player);
  assert.equal((await createOffer(f.message, f.target, f.actor)).userId, "player");
  f.player.active = false;
  assert.equal(decisionUser(f.actor), f.gm);
  assert.equal((await createOffer(f.message, f.target, f.actor)).userId, "gm");
  assert.equal(await createOffer(f.message, { ...f.target, operation: "healing" }, f.actor), null);
  assert.equal(await createOffer(f.message, { ...f.target, effectiveAmount: 0 }, f.actor), null);
});

test("accepting destroys only the selected item and preserves HP through native damage processing", async () => {
  const f = fixture([equippedItem("first"), equippedItem("second")]);
  const state = await f.plan();
  const prepared = await resolvePlan(f.message, state, { ...f.options, ask: async () => ({ itemId: "second" }) });
  assert.deepEqual(f.actor.deletions, ["second"]);
  assert.equal(f.actor.items.get("first").id, "first");
  assert.equal(prepared.targets[0].effectiveAmount, 0);
  assert.equal(prepared.targets[0].afterHp, 12);
  assert.equal(prepared.targets[0].sundering.status, "destroyed");
  assert.equal(normalizeProcessingState(prepared).targets[0].sundering.itemName, "second");
  const complete = await runProcessingState(prepared, {
    readCurrentHp: async () => f.actor.hp,
    applyTarget: async () => { throw new Error("A sundered attack must not change HP"); },
    persistState: f.options.persistState
  });
  assert.equal(complete.status, "complete");
  assert.equal(f.actor.hp, 12);
});

test("declining applies normal damage once, even after another hit while the prompt was open", async () => {
  const f = fixture();
  const prepared = await resolvePlan(f.message, await f.plan(), {
    ...f.options, ask: async () => { f.actor.hp = 9; return { itemId: null }; }
  });
  assert.equal(prepared.targets[0].beforeHp, 9);
  assert.equal(prepared.targets[0].afterHp, 4);
  let applications = 0;
  const options = {
    readCurrentHp: async () => f.actor.hp,
    applyTarget: async target => { applications++; f.actor.hp = target.afterHp; },
    persistState: f.options.persistState
  };
  const complete = await runProcessingState(prepared, options);
  await runProcessingState(complete, options);
  assert.equal(applications, 1);
  assert.equal(f.actor.hp, 4);
  assert.equal(f.actor.items.length, 1);
});

test("an item unequipped while choosing is preserved and does not cancel damage", async () => {
  const f = fixture();
  const prepared = await resolvePlan(f.message, await f.plan(), {
    ...f.options, ask: async () => { f.actor.items[0].system.equipped = false; return { itemId: "shield" }; }
  });
  assert.equal(prepared.targets[0].sundering.status, "declined");
  assert.equal(prepared.targets[0].effectiveAmount, 5);
  assert.deepEqual(f.actor.deletions, []);
});

test("destruction intent is persisted before deletion and recovers a crash without another prompt or deletion", async () => {
  const f = fixture();
  let writes = 0;
  const state = await f.plan();
  await assert.rejects(resolvePlan(f.message, state, {
    ...f.options, ask: async () => ({ itemId: "shield" }),
    persistState: async state => {
      if (++writes === 2) throw new Error("save interrupted after deletion");
      assert.equal(f.actor.items.length, 1);
      assert.equal(state.targets[0].sundering.status, "destroying");
      await f.options.persistState(state);
    }
  }), /save interrupted/);
  assert.equal(f.persisted.targets[0].sundering.status, "destroying");
  assert.deepEqual(f.actor.deletions, ["shield"]);
  const resumed = await resolvePlan(f.message, f.persisted, {
    ...f.options, ask: async () => { throw new Error("Must not prompt twice"); }
  });
  assert.equal(resumed.targets[0].sundering.status, "destroyed");
  assert.equal(resumed.targets[0].effectiveAmount, 0);
  assert.deepEqual(f.actor.deletions, ["shield"]);
});

test("a failed deletion leaves the attack pending and retries the same decision", async () => {
  const f = fixture();
  const deleteItems = f.actor.deleteEmbeddedDocuments.bind(f.actor);
  f.actor.deleteEmbeddedDocuments = async () => { throw new Error("delete unavailable"); };
  await assert.rejects(resolvePlan(f.message, await f.plan(), {
    ...f.options, ask: async () => ({ itemId: "shield" })
  }), /delete unavailable/);
  assert.equal(f.persisted.targets[0].sundering.status, "destroying");
  assert.equal(f.actor.hp, 12);
  f.actor.deleteEmbeddedDocuments = deleteItems;
  const prepared = await resolvePlan(f.message, f.persisted, {
    ...f.options, ask: async () => { throw new Error("Must not prompt twice"); }
  });
  assert.equal(prepared.targets[0].effectiveAmount, 0);
  assert.deepEqual(f.actor.deletions, ["shield"]);
});

test("player replies are validated against their actual ChatMessage author, target, and offered items", async () => {
  const f = fixture();
  await f.plan();
  const data = {
    messageId: f.message.id, targetUuid: f.target.uuid,
    requestId: f.target.sundering.requestId, itemId: "shield", userId: f.player.id
  };
  const reply = { author: f.player, flags: { "mk-shadowdark": { sunderingResponse: data } } };
  assert.equal(responseChoice(reply, f.message, f.target, f.actor), "shield");
  reply.author = f.other;
  assert.equal(responseChoice(reply, f.message, f.target, f.actor), undefined);
  reply.author = f.player;
  data.itemId = "not-offered";
  assert.equal(responseChoice(reply, f.message, f.target, f.actor), undefined);
  data.itemId = null;
  assert.equal(responseChoice(reply, f.message, f.target, f.actor), null);
  data.targetUuid = "another-token";
  assert.equal(responseChoice(reply, f.message, f.target, f.actor), undefined);
});

test("the chat-flag transport reaches the authoritative GM without a custom socket", async () => {
  const f = fixture();
  const state = await f.plan();
  globalThis.ChatMessage = { create: async data => {
    const request = {
      author: f.gm, flags: data.flags,
      getFlag: (scope, key) => data.flags[scope]?.[key],
      setFlag: async (scope, key, value) => { data.flags[scope][key] = value; }
    };
    game.messages.push(request);
    const offer = data.flags["mk-shadowdark"].sunderingOffer;
    queueMicrotask(() => handleChat({
      author: f.player, flags: { "mk-shadowdark": { sunderingResponse: {
        messageId: offer.messageId, targetUuid: offer.target.uuid,
        requestId: offer.target.sundering.requestId, itemId: "shield"
      } } }
    }));
    return request;
  } };
  const prepared = await resolvePlan(f.message, state, f.options);
  assert.equal(prepared.targets[0].effectiveAmount, 0);
  assert.equal(game.messages[0].getFlag("mk-shadowdark", "sunderingOffer").resolved, true);
});

test("a saved player response resumes after GM reload without recreating a prompt", async () => {
  const f = fixture();
  const state = await f.plan();
  game.messages.push({ author: f.player, flags: { "mk-shadowdark": { sunderingResponse: {
    messageId: f.message.id, targetUuid: f.target.uuid,
    requestId: f.target.sundering.requestId, itemId: "shield"
  } } } });
  globalThis.ChatMessage = { create: async () => { throw new Error("Must reuse the saved decision"); } };
  const prepared = await resolvePlan(f.message, state, f.options);
  assert.equal(prepared.targets[0].effectiveAmount, 0);
});

test("the prompt defaults to damage on close and escapes item and actor names", async () => {
  const f = fixture([equippedItem('<img src=x onerror="bad()">')]);
  await f.plan();
  f.target.actorName = "<script>bad()</script>";
  foundry.applications = { api: { DialogV2: { wait: async config => {
    assert.ok(config.buttons.find(button => button.action === "damage").default);
    assert.equal(config.close(), null);
    assert.equal(config.rejectClose, false);
    assert.doesNotMatch(config.content, /<script>|<img src=x/);
    assert.match(config.content, /&lt;script&gt;/);
    return null;
  } } } };
  assert.equal(await promptForItem(f.target), null);
});

test("duplicate chat hooks open one owner prompt and closing records one decline", async () => {
  const f = fixture();
  await f.plan();
  game.user = f.player;
  let closePrompt;
  let prompts = 0;
  let replies = 0;
  foundry.applications = { api: { DialogV2: { wait: () => {
    prompts++;
    return new Promise(resolve => { closePrompt = resolve; });
  } } } };
  globalThis.ChatMessage = { create: async data => {
    replies++;
    assert.equal(data.user, "player");
    assert.equal(data.flags["mk-shadowdark"].sunderingResponse.itemId, null);
  } };
  const data = { messageId: f.message.id, target: f.target, resolved: false };
  const message = { author: f.gm, getFlag: () => data };
  const first = showOffer(message);
  await showOffer(message);
  assert.equal(prompts, 1);
  closePrompt(null);
  await first;
  assert.equal(replies, 1);
});

test("non-authoritative clients cannot destroy items or prepare cancellation", async () => {
  const f = fixture();
  const state = await f.plan();
  game.user = f.player;
  await assert.rejects(resolvePlan(f.message, state, f.options), /primary active GM/);
  assert.deepEqual(f.actor.deletions, []);
});
