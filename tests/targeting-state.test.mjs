import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTargetsToRollConfig,
  collectValidTargets,
  findSelfTarget,
  isFocusCheckRoll,
  isAttackOrSpellRoll,
  isSelfRangeSpell
} from "../scripts/targeting-assistant/targeting-state.js";

test("only attack and spell dialogs require targets", () => {
  assert.equal(isAttackOrSpellRoll({ type: "attack" }), true);
  assert.equal(isAttackOrSpellRoll({ type: "spell" }), true);
  assert.equal(isAttackOrSpellRoll({ type: "ability" }), false);
});

test("Focus checks do not require targets while initial Focus spells still do", () => {
  assert.equal(isFocusCheckRoll({ type: "spell", cast: { focus: true }, mkShadowdarkFocusCheckId: "check-1" }), true);
  assert.equal(isAttackOrSpellRoll({ type: "spell", cast: { focus: true }, mkShadowdarkFocusCheckId: "check-1" }), false);
  assert.equal(isAttackOrSpellRoll({ type: "spell", cast: { focus: true } }), true);
  assert.equal(isAttackOrSpellRoll({ type: "spell", isFocusRoll: true }), false);
});

test("self-range spells are identified from the native cast range", () => {
  assert.equal(isSelfRangeSpell({ type: "spell", cast: { range: "self" } }), true);
  assert.equal(isSelfRangeSpell({ type: "spell", cast: { range: "Self" } }), true);
  assert.equal(isSelfRangeSpell({ type: "spell", cast: { range: "close" } }), false);
  assert.equal(isSelfRangeSpell({ type: "spell" }), false);
});

test("valid targets retain selection order and remove duplicates", () => {
  const actor = name => ({ name, system: { attributes: { ac: { value: 12 } } } });
  const first = { document: { uuid: "Scene.s.Token.a", name: "Goblin", actor: actor("Goblin") } };
  first.actor = first.document.actor;
  const duplicate = { document: first.document, actor: first.actor };
  const second = { document: { uuid: "Scene.s.Token.b", name: "Orc", actor: actor("Orc") } };
  second.actor = second.document.actor;

  assert.deepEqual(
    collectValidTargets([first, duplicate, {}, second]).map(target => target.uuid),
    ["Scene.s.Token.a", "Scene.s.Token.b"]
  );
});

test("self target resolution finds the caster token without using selected targets", () => {
  const actor = {
    id: "hero",
    uuid: "Actor.hero",
    name: "Hero",
    system: { attributes: { ac: { value: 13 } } }
  };
  const caster = {
    document: {
      uuid: "Scene.s.Token.caster",
      name: "Hero",
      actor,
      actorId: "hero"
    },
    actor
  };
  const other = {
    document: {
      uuid: "Scene.s.Token.other",
      name: "Other",
      actor: { id: "other", name: "Other" },
      actorId: "other"
    },
    actor: { id: "other", name: "Other" }
  };

  const selfTarget = findSelfTarget([other, caster], "Actor.hero", "hero");
  assert.equal(selfTarget?.uuid, "Scene.s.Token.caster");

  const config = { type: "spell", targetUuid: "Scene.s.Token.other" };
  applyTargetsToRollConfig(config, [selfTarget]);
  assert.equal(config.targetUuid, "Scene.s.Token.caster");
  assert.deepEqual(config.targetUuids, ["Scene.s.Token.caster"]);
  assert.equal(findSelfTarget([other], "Actor.hero", "hero"), null);
});

test("all target UUIDs are stored and the first target sets attack AC", () => {
  const config = { type: "attack", mainRoll: { dc: 9 } };
  applyTargetsToRollConfig(config, [
    { uuid: "Token.primary", ac: 15 },
    { uuid: "Token.secondary", ac: 11 }
  ]);

  assert.equal(config.targetUuid, "Token.primary");
  assert.deepEqual(config.targetUuids, ["Token.primary", "Token.secondary"]);
  assert.equal(config.mainRoll.dc, 15);
});

test("clearing targets removes a stale primary target", () => {
  const config = {
    type: "spell",
    targetUuid: "Token.stale",
    targetUuids: ["Token.stale"]
  };

  applyTargetsToRollConfig(config, []);

  assert.equal("targetUuid" in config, false);
  assert.deepEqual(config.targetUuids, []);
});
