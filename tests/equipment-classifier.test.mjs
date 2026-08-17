import test from "node:test";
import assert from "node:assert/strict";

import {
  equipmentChangeTouchesClassification,
  getItemHandUse,
  isShield,
  isTwoHandedWeapon,
  occupiesOneHand
} from "../scripts/libs/equipment.js";

function item({
  id = "item-1",
  name = "Item",
  type = "Basic",
  equipped = true,
  stashed = false,
  handedness = "",
  properties = [],
  propertyNames = [],
  oneHanded = "",
  twoHanded = "",
  isAShield = false
} = {}) {
  return {
    id,
    name,
    type,
    system: {
      equipped,
      stashed,
      handedness,
      properties,
      propertyNames,
      isAShield,
      damage: { oneHanded, twoHanded }
    }
  };
}

test("classifies one-handed and two-handed weapons consistently", () => {
  const sword = item({ type: "Weapon", name: "Sword", oneHanded: "1d8" });
  const greatsword = item({ type: "Weapon", name: "Greatsword", properties: [{ name: "Two-Handed" }] });
  const bow = item({ type: "Weapon", name: "Bow", twoHanded: "1d6" });

  assert.equal(getItemHandUse(sword)?.hands, 1);
  assert.equal(isTwoHandedWeapon(greatsword), true);
  assert.equal(getItemHandUse(greatsword)?.hands, 2);
  assert.equal(isTwoHandedWeapon(bow), true);
});

test("recognizes shields and property-based hand items", () => {
  const shield = item({ type: "Armor", name: "Guard", propertyNames: ["Shield"] });
  const torch = item({ type: "Basic", name: "Torch", properties: [{ name: "Occupies One Hand" }] });

  assert.equal(isShield(shield), true);
  assert.equal(getItemHandUse(shield)?.category, "shield");
  assert.equal(occupiesOneHand(torch), true);
  assert.equal(getItemHandUse(torch)?.category, "hand item");
});

test("stashed policy is supplied by the consumer", () => {
  const sword = item({ type: "Weapon", name: "Sword", stashed: true, oneHanded: "1d8" });

  assert.equal(getItemHandUse(sword), null);
  assert.equal(getItemHandUse(sword, null, { ignoreStashed: false })?.hands, 1);
});

test("proposed updates classify the pending item state", () => {
  const sword = item({ type: "Weapon", name: "Sword", equipped: false, oneHanded: "1d8" });
  const proposed = { item: sword, changes: { "system.equipped": true } };

  assert.equal(getItemHandUse(sword), null);
  assert.equal(getItemHandUse(sword, proposed)?.hands, 1);
});

test("classification change detection ignores unrelated updates", () => {
  assert.equal(equipmentChangeTouchesClassification({ "system.equipped": true }), true);
  assert.equal(equipmentChangeTouchesClassification({ system: { damage: { twoHanded: "1d8" } } }), true);
  assert.equal(equipmentChangeTouchesClassification({ img: "icons/example.webp" }), false);
  assert.equal(equipmentChangeTouchesClassification({ system: { quantity: 2 } }), false);
});
