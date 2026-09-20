import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHpChange,
  extractNativeDamage,
  getShadowdarkRollConfig,
  hasShadowdarkDamageApplied,
  normalizeSpellDamageType,
  resolveAutoDamageOperation
} from "../scripts/auto-damage/auto-damage-operation.js";

test("native Shadowdark rolls provide damage and outcome without reading chat content", () => {
  const result = extractNativeDamage({
    content: "Damage 1d8 + 1 = 9",
    rolls: [
      { options: { type: "main" }, success: true, total: 17 },
      { options: { type: "damage" }, total: 9 }
    ]
  });

  assert.equal(result.damage, 9);
  assert.equal(result.outcome, "success");
  assert.equal(result.debug.damageSource, "shadowdark-native-damage-roll");
  assert.equal(result.debug.hasMainRoll, true);
  assert.equal(result.debug.hasDamageRoll, true);
});

test("native critical-success state is preserved for Death Timer damage handling", () => {
  const result = extractNativeDamage({
    rolls: [
      { options: { type: "main" }, success: true, criticalSuccess: true, total: 20 },
      { options: { type: "damage" }, total: 9 }
    ]
  });

  assert.equal(result.critical, true);
  assert.equal(result.debug.critical, true);
});

test("native ChatMessage getRoll is used when the document exposes it", () => {
  const result = extractNativeDamage({
    getRoll: type => type === "damage"
      ? { total: 4 }
      : type === "main"
        ? { success: true }
        : null,
    rolls: [{ options: { type: "damage" }, total: 99 }]
  });

  assert.equal(result.damage, 4);
  assert.equal(result.outcome, "success");
});

test("native failed attack outcome is preserved separately from its damage roll", () => {
  const result = extractNativeDamage({
    rolls: [
      { options: { type: "main" }, success: false, total: 3 },
      { options: { type: "damage" }, total: 6 }
    ]
  });

  assert.equal(result.damage, 6);
  assert.equal(result.outcome, "failure");
});

test("missing native damage rolls do not fall back to message text", () => {
  const result = extractNativeDamage({
    content: "Damage 1d8 + 1 = 9",
    rolls: [{ options: { type: "main" }, success: true, total: 17 }]
  });

  assert.equal(result.damage, null);
  assert.equal(result.debug.hasDamageRoll, false);
});

test("native Shadowdark damage-applied flag is recognized on document and source data", () => {
  assert.equal(
    hasShadowdarkDamageApplied({
      getFlag: (_scope, key) => key === "damageApplied" ? true : undefined
    }),
    true
  );
  assert.equal(
    hasShadowdarkDamageApplied({
      _source: { flags: { shadowdark: { damageApplied: true } } }
    }),
    true
  );
});

test("Shadowdark spell damage type selects healing", async () => {
  const message = {
    flags: {
      shadowdark: {
        rollConfig: {
          type: "spell",
          cast: { damageType: "healing" }
        }
      }
    }
  };

  assert.equal(await resolveAutoDamageOperation(message), "healing");
});

test("Shadowdark spell damage type selects damage", async () => {
  const message = {
    getFlag: () => ({
      type: "spell",
      cast: { damageType: "damage" }
    })
  };

  assert.equal(await resolveAutoDamageOperation(message), "damage");
});

test("spells with no damage type do not change HP", async () => {
  const message = {
    rollConfig: {
      type: "spell",
      cast: { damageType: "none" }
    }
  };

  assert.equal(await resolveAutoDamageOperation(message), null);
});

test("spell item data is used when the chat flag lacks damage type", async () => {
  const message = {
    rollConfig: {
      type: "spell",
      cast: { spellUuid: "Item.healing-spell" }
    }
  };

  const operation = await resolveAutoDamageOperation(
    message,
    async uuid => ({ uuid, system: { damageType: "healing" } })
  );

  assert.equal(operation, "healing");
});

test("non-spell rolls preserve damage behavior", async () => {
  assert.equal(await resolveAutoDamageOperation({ rollConfig: { type: "attack" } }), "damage");
});

test("healing is capped at maximum HP", () => {
  assert.deepEqual(calculateHpChange(7, 10, 8, "healing"), {
    newHP: 10,
    appliedAmount: 3
  });
});

test("damage is capped at zero HP", () => {
  assert.deepEqual(calculateHpChange(4, 10, 9, "damage"), {
    newHP: 0,
    appliedAmount: 4
  });
});

test("roll config reads source flags during message creation", () => {
  const rollConfig = { cast: { damageType: "healing" } };
  assert.equal(
    getShadowdarkRollConfig({ _source: { flags: { shadowdark: { rollConfig } } } }),
    rollConfig
  );
  assert.equal(normalizeSpellDamageType(" Healing "), "healing");
});
