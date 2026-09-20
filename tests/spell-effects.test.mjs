import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTargetEffectItemData,
  captureSpellEffectLink,
  extractSpellEffectUuids,
  hasTargetedSpellEffect,
  matchesTargetedSpellEffect,
  resolveSpellEffectItems,
  shouldApplySpellEffects,
  spellTargetUuids
} from "../scripts/spell-effects/spell-effects-logic.js";

test("spell descriptions resolve unique UUID links for Effect items", async () => {
  const spell = {
    system: {
      description: [
        "<p>@UUID[Compendium.shadowdark.spell-effects.Item.Fly]{Spell Effect: Fly}</p>",
        "<p>@UUID[Compendium.shadowdark.spell-effects.Item.Fly]{duplicate}</p>",
        "<p>@UUID[Compendium.world.Item.NotAnEffect]{other link}</p>"
      ].join("")
    }
  };
  const resolved = new Map([
    ["Compendium.shadowdark.spell-effects.Item.Fly", { type: "Effect", name: "Fly" }],
    ["Compendium.world.Item.NotAnEffect", { type: "Spell", name: "Other" }]
  ]);

  assert.deepEqual(
    extractSpellEffectUuids(spell.system.description),
    [
      "Compendium.shadowdark.spell-effects.Item.Fly",
      "Compendium.world.Item.NotAnEffect"
    ]
  );
  assert.deepEqual(
    (await resolveSpellEffectItems(spell, uuid => resolved.get(uuid))).map(item => item.name),
    ["Fly"]
  );
});

test("successful spell rolls apply effects, but Focus maintenance checks do not", () => {
  assert.equal(
    shouldApplySpellEffects(
      { type: "spell", cast: { spellUuid: "Item.spell" } },
      { success: true, criticalFailure: false },
      false
    ),
    true
  );
  assert.equal(
    shouldApplySpellEffects(
      { type: "spell", cast: { spellUuid: "Item.spell" }, mkShadowdarkFocusCheckId: "check-1" },
      { success: true, criticalFailure: false },
      true
    ),
    false
  );
  assert.equal(
    shouldApplySpellEffects(
      { type: "spell", cast: { spellUuid: "Item.spell" } },
      { success: false, criticalFailure: false },
      false
    ),
    false
  );
});

test("captured multi-target UUIDs take precedence over the primary target", () => {
  assert.deepEqual(
    spellTargetUuids({
      targetUuid: "Token.stale",
      targetUuids: ["Token.one", "Token.two", "Token.one"]
    }),
    ["Token.one", "Token.two"]
  );
  assert.deepEqual(spellTargetUuids({ targetUuid: "Token.only" }), ["Token.only"]);
  assert.deepEqual(spellTargetUuids({ targetUuids: [] }), []);
});

test("a successful cast captures its message ID and every selected target", () => {
  assert.deepEqual(
    captureSpellEffectLink(
      { id: "chat-1" },
      { targetUuid: "Token.primary", targetUuids: ["Token.primary", "Token.secondary"] }
    ),
    {
      castId: "chat-1",
      targetUuids: ["Token.primary", "Token.secondary"]
    }
  );
  assert.deepEqual(captureSpellEffectLink(null, { targetUuid: "Token.primary" }), {
    castId: null,
    targetUuids: []
  });
});

test("target effect item data is copied without source IDs and carries a cast marker", () => {
  const source = {
    _id: "source-item",
    uuid: "Compendium.shadowdark.spell-effects.Item.Fly",
    type: "Effect",
    name: "Fly",
    flags: { shadowdark: { start: { value: 123 } } },
    effects: [{ _id: "source-effect", changes: [{ key: "system.speed", value: 30 }] }]
  };

  const copy = buildTargetEffectItemData(source, {
    castId: "ChatMessage.cast-1",
    sourceSpellUuid: "Actor.caster.Item.fly",
    moduleId: "mk-shadowdark"
  });

  assert.equal(copy._id, undefined);
  assert.equal(copy.effects[0]._id, undefined);
  assert.equal(copy.flags.shadowdark.start, undefined);
  assert.deepEqual(copy.flags["mk-shadowdark"].targetedSpellEffect, {
    castId: "ChatMessage.cast-1",
    sourceSpellUuid: "Actor.caster.Item.fly",
    sourceEffectUuid: "Compendium.shadowdark.spell-effects.Item.Fly"
  });
  assert.equal(source._id, "source-item");
  assert.equal(source.effects[0]._id, "source-effect");
});

test("cast markers prevent duplicate effect items on chat update", () => {
  const items = [{
    flags: {
      "mk-shadowdark": {
        targetedSpellEffect: {
          castId: "ChatMessage.cast-1",
          sourceEffectUuid: "Compendium.shadowdark.spell-effects.Item.Fly"
        }
      }
    }
  }];

  assert.equal(hasTargetedSpellEffect(items, {
    castId: "ChatMessage.cast-1",
    sourceEffectUuid: "Compendium.shadowdark.spell-effects.Item.Fly"
  }), true);
  assert.equal(hasTargetedSpellEffect(items, {
    castId: "ChatMessage.cast-2",
    sourceEffectUuid: "Compendium.shadowdark.spell-effects.Item.Fly"
  }), false);
  assert.equal(matchesTargetedSpellEffect(items[0], { castId: "ChatMessage.cast-1" }), true);
  assert.equal(matchesTargetedSpellEffect(items[0], { castId: "ChatMessage.cast-2" }), false);
});
