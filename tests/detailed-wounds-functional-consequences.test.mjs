import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { deriveWoundFunctionalState } from "../scripts/detailed-wounds/functional-consequences-core.js";

const equipmentUrl = new URL("../scripts/equipment-hands/equipment-hands.js", import.meta.url);
const runtimeUrl = new URL("../scripts/detailed-wounds/functional-consequences-runtime.js", import.meta.url);
const manifestUrl = new URL("../module.json", import.meta.url);

function wound(status, severityRoll, resultKey) {
  return { status, hits: 1, severityRoll, resultKey };
}

function woundData(locations = {}) {
  return { version: 3, locations };
}

test("lost hand and lost arm each remove one usable hand while lesser arm wounds do not", () => {
  const broken = deriveWoundFunctionalState(woundData({
    rightArm: wound("wounded", 8, "brokenArm")
  }));
  assert.equal(broken.usableHands, 2);
  assert.equal(broken.unavailableHands, 0);

  const lostHand = deriveWoundFunctionalState(woundData({
    rightArm: wound("critical", 9, "lostHand")
  }));
  assert.equal(lostHand.usableHands, 1);
  assert.equal(lostHand.unavailableHands, 1);
  assert.deepEqual(lostHand.upperLimbLosses.map(loss => loss.outcomeKey), ["lostHand"]);

  const lostArm = deriveWoundFunctionalState(woundData({
    leftArm: wound("destroyed", 10, "lostArm")
  }));
  assert.equal(lostArm.usableHands, 1);
  assert.equal(lostArm.unavailableHands, 1);
  assert.deepEqual(lostArm.upperLimbLosses.map(loss => loss.outcomeKey), ["lostArm"]);
});

test("bilateral upper-limb loss can reduce effective hand capacity to zero", () => {
  const state = deriveWoundFunctionalState(woundData({
    rightArm: wound("critical", 9, "lostHand"),
    leftArm: wound("destroyed", 10, "lostArm")
  }));

  assert.equal(state.baseHands, 2);
  assert.equal(state.usableHands, 0);
  assert.equal(state.unavailableHands, 2);
  assert.equal(state.upperLimbLosses.length, 2);
});

test("configured hand capacity is reduced rather than replaced by wound state", () => {
  const state = deriveWoundFunctionalState(woundData({
    rightArm: wound("critical", 9, "lostHand")
  }), { baseHands: 4 });

  assert.equal(state.baseHands, 4);
  assert.equal(state.usableHands, 3);
  assert.equal(state.unavailableHands, 1);
});

test("lower-limb loss exposes persistent mobility restrictions without inventing a speed value", () => {
  const lostFoot = deriveWoundFunctionalState(woundData({
    rightLeg: wound("critical", 9, "lostFoot")
  }));
  assert.equal(lostFoot.mobility.restricted, true);
  assert.equal(lostFoot.mobility.cannotRun, true);
  assert.equal(lostFoot.mobility.severity, "restricted");
  assert.deepEqual(lostFoot.mobility.lowerLimbLosses.map(loss => loss.outcomeKey), ["lostFoot"]);
  assert.equal(Object.hasOwn(lostFoot.mobility, "speed"), false);

  const lostLeg = deriveWoundFunctionalState(woundData({
    leftLeg: wound("destroyed", 10, "lostLeg")
  }));
  assert.equal(lostLeg.mobility.restricted, true);
  assert.equal(lostLeg.mobility.cannotRun, true);
  assert.equal(lostLeg.mobility.severity, "severe");
  assert.deepEqual(lostLeg.mobility.lowerLimbLosses.map(loss => loss.outcomeKey), ["lostLeg"]);

  const brokenLeg = deriveWoundFunctionalState(woundData({
    leftLeg: wound("wounded", 8, "brokenLeg")
  }));
  assert.equal(brokenLeg.mobility.restricted, false);
  assert.equal(brokenLeg.mobility.cannotRun, false);
});

test("current v3 records without a stored result key remain derivable from severity", () => {
  const state = deriveWoundFunctionalState(woundData({
    rightArm: wound("critical", 9, null),
    leftLeg: wound("destroyed", 10, null)
  }));

  assert.equal(state.usableHands, 1);
  assert.deepEqual(state.upperLimbLosses.map(loss => loss.outcomeKey), ["lostHand"]);
  assert.deepEqual(state.mobility.lowerLimbLosses.map(loss => loss.outcomeKey), ["lostLeg"]);
});

test("Equipment Hands derives effective capacity from Detailed Wounds without mutating either subsystem", async () => {
  const source = await readFile(equipmentUrl, "utf8");

  assert.match(source, /deriveWoundFunctionalState/);
  assert.match(source, /const maxHands = woundFunctionalState\.usableHands/);
  assert.match(source, /baseMaxHands/);
  assert.match(source, /actorUpdateTouchesDetailedWounds/);
  assert.doesNotMatch(source, /setFlag\([^\n]*detailedWounds/);
  assert.doesNotMatch(source, /updateEmbeddedDocuments\([^\n]*Item/);
});

test("Detailed Wounds exposes functional state through its public API", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /mod\.api\.wounds\.getFunctionalState = getFunctionalState/);
  assert.match(source, /deriveWoundFunctionalState\(actor\.getFlag/);
  assert.doesNotMatch(source, /actor\.setFlag/);
});

test("functional consequence runtime loads after Detailed Wounds and before Equipment Hands", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const modules = manifest.esmodules ?? [];
  const woundsIndex = modules.indexOf("scripts/detailed-wounds/detailed-wounds.js");
  const functionalIndex = modules.indexOf("scripts/detailed-wounds/functional-consequences-runtime.js");
  const equipmentIndex = modules.indexOf("scripts/equipment-hands/equipment-hands.js");

  assert.ok(woundsIndex >= 0);
  assert.ok(functionalIndex > woundsIndex);
  assert.ok(equipmentIndex > functionalIndex);
});
