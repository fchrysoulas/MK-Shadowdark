import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTargetsToRollConfig,
  collectValidTargets,
  isAttackOrSpellRoll
} from "../scripts/targeting-assistant/targeting-state.js";

test("only attack and spell dialogs require targets", () => {
  assert.equal(isAttackOrSpellRoll({ type: "attack" }), true);
  assert.equal(isAttackOrSpellRoll({ type: "spell" }), true);
  assert.equal(isAttackOrSpellRoll({ type: "ability" }), false);
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
