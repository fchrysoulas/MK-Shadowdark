import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateHpChange,
  getShadowdarkRollConfig,
  normalizeSpellDamageType,
  resolveAutoDamageOperation
} from "../scripts/auto-damage/auto-damage-operation.js";

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
