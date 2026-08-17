import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildTorchWeaponData,
  isTorchLightSource,
  normalizeTorchKeywords
} from "../scripts/torch-attack/torch-attack-data.js";

const torchSourceUrl = new URL("../scripts/torch-attack/torch-attack.js", import.meta.url);
const groupSourceUrl = new URL("../scripts/group-sheet/group-sheet.js", import.meta.url);

test("torch keyword matching only accepts configured light sources", () => {
  assert.deepEqual(normalizeTorchKeywords(" torch, Torches , brand "), ["torch", "torches", "brand"]);
  assert.equal(isTorchLightSource({ name: "Torch", system: { light: { isSource: true } } }), true);
  assert.equal(isTorchLightSource({ name: "Lantern", system: { light: { isSource: true } } }), false);
  assert.equal(isTorchLightSource({ name: "Torch", system: { light: { isSource: false } } }), false);
});

test("temporary torch weapon is a native one-handed melee d4 Weapon", () => {
  const data = buildTorchWeaponData({
    name: "Iron Torch",
    img: "torch.webp",
    uuid: "Actor.a.Item.b",
    system: { description: "Burning torch" }
  });

  assert.equal(data.type, "Weapon");
  assert.equal(data.name, "Iron Torch");
  assert.equal(data.img, "torch.webp");
  assert.equal(data.system.type, "melee");
  assert.equal(data.system.range, "close");
  assert.equal(data.system.handedness, "1h");
  assert.equal(data.system.damage.oneHanded, "d4");
  assert.equal(data.system.damage.twoHanded, "");
  assert.equal(data.system.equipped, true);
  assert.equal(data.system.stashed, false);
  assert.equal(data.flags["mk-shadowdark"].sourceItemUuid, "Actor.a.Item.b");
});

test("torch runtime uses Shadowdark public rollAttack and no private calc methods", async () => {
  const source = await readFile(torchSourceUrl, "utf8");

  assert.match(source, /actor\.system\.rollAttack\(temporaryWeapon\.uuid/);
  assert.doesNotMatch(source, /_calcAttackMainConfig/);
  assert.doesNotMatch(source, /_calcDamageConfig/);
  assert.doesNotMatch(source, /_calcAttackExtraConfig/);
});

test("Group entry no longer owns torch attack behavior", async () => {
  const source = await readFile(groupSourceUrl, "utf8");

  assert.doesNotMatch(source, /Torch/);
  assert.doesNotMatch(source, /preUpdateItem/);
  assert.doesNotMatch(source, /renderPlayerSheetSD/);
});
