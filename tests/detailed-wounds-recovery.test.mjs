import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  RECOVERY_KIND,
  advanceWoundRecovery,
  classifyWoundRecovery
} from "../scripts/detailed-wounds/recovery-core.js";

const runtimeUrl = new URL("../scripts/detailed-wounds/recovery-runtime.js", import.meta.url);
const restingUrl = new URL("../scripts/libs/resting.js", import.meta.url);
const manifestUrl = new URL("../module.json", import.meta.url);

function wound(status, severityRoll, resultKey, durationValue = null, extra = {}) {
  const record = { status, hits: 1, severityRoll, resultKey, ...extra };
  if (durationValue !== null) record.durationValue = durationValue;
  return record;
}

function data(locations = {}) {
  return { version: 3, locations };
}

test("concussion counts down by combat rounds and clears when its duration expires", () => {
  const original = data({
    head: wound("wounded", 3, "concussion", 2, { history: [{ note: "keep me" }] })
  });

  const first = advanceWoundRecovery(original, { rounds: 1 });
  assert.equal(first.changed, true);
  assert.equal(first.data.locations.head.durationValue, 1);
  assert.equal(first.transitions[0].kind, RECOVERY_KIND.TEMPORARY_ROUNDS);
  assert.equal(first.transitions[0].recovered, false);

  const second = advanceWoundRecovery(first.data, { rounds: 1 });
  assert.equal(second.data.locations.head.status, "ok");
  assert.equal(second.data.locations.head.hits, 0);
  assert.equal(second.data.locations.head.severityRoll, 0);
  assert.equal(second.data.locations.head.resultKey, null);
  assert.equal(Object.hasOwn(second.data.locations.head, "durationValue"), false);
  assert.deepEqual(second.data.locations.head.history, [{ note: "keep me" }]);
  assert.equal(second.transitions[0].recovered, true);
});

test("rest-based wounds consume completed rest-days but ignore combat rounds", () => {
  const original = data({
    rightArm: wound("wounded", 7, "brokenArm", 2),
    leftLeg: wound("wounded", 8, "brokenLeg", 1),
    head: wound("wounded", 7, "brokenJaw", 3)
  });

  const rounds = advanceWoundRecovery(original, { rounds: 5 });
  assert.equal(rounds.changed, false);

  const rested = advanceWoundRecovery(original, { restDays: 1 });
  assert.equal(rested.data.locations.rightArm.durationValue, 1);
  assert.equal(rested.data.locations.head.durationValue, 2);
  assert.equal(rested.data.locations.leftLeg.status, "ok");
  assert.deepEqual(
    rested.transitions.map(transition => transition.kind),
    [RECOVERY_KIND.REST_DAYS, RECOVERY_KIND.REST_DAYS, RECOVERY_KIND.REST_DAYS]
  );
});

test("permanent and catastrophic outcomes never recover from normal rest or rounds", () => {
  const original = data({
    head: wound("critical", 8, "lostTeeth", 5),
    rightArm: wound("critical", 9, "lostHand", 5),
    leftArm: wound("destroyed", 10, "lostArm", 5),
    rightLeg: wound("critical", 9, "lostFoot", 5),
    leftLeg: wound("destroyed", 10, "lostLeg", 5),
    body: wound("destroyed", 10, "heart", 5)
  });

  assert.equal(classifyWoundRecovery("head", original.locations.head).kind, RECOVERY_KIND.PERMANENT);
  assert.equal(classifyWoundRecovery("rightArm", original.locations.rightArm).kind, RECOVERY_KIND.CATASTROPHIC);
  assert.equal(classifyWoundRecovery("body", original.locations.body).kind, RECOVERY_KIND.CATASTROPHIC);

  const result = advanceWoundRecovery(original, { rounds: 20, restDays: 20 });
  assert.equal(result.changed, false);
  assert.deepEqual(result.data, original);
});

test("ambiguous wounds without explicit recovery metadata stay under GM control", () => {
  const original = data({
    body: wound("wounded", 3, "cripplingPain", 3),
    rightArm: wound("wounded", 4, "cripplingPain", 3),
    leftLeg: wound("wounded", 6, "cripplingPain", 3)
  });

  assert.equal(classifyWoundRecovery("body", original.locations.body).kind, RECOVERY_KIND.MANUAL);
  const result = advanceWoundRecovery(original, { rounds: 10, restDays: 10 });
  assert.equal(result.changed, false);
  assert.deepEqual(result.data, original);
});

test("duration outcomes missing a stored roll are not rerolled or guessed", () => {
  const original = data({
    head: wound("wounded", 3, "concussion"),
    leftArm: wound("wounded", 7, "brokenArm")
  });

  const result = advanceWoundRecovery(original, { rounds: 5, restDays: 5 });
  assert.equal(result.changed, false);
  assert.deepEqual(result.data, original);
});

test("runtime uses combat round changes rather than actor HP updates", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /Hooks\.on\("updateCombat", handleCombatUpdate\)/);
  assert.match(source, /isPrimaryActiveGM\(\)/);
  assert.match(source, /elapsedRounds = nextRound - previousRound/);
  assert.doesNotMatch(source, /Hooks\.on\("updateActor"/);
  assert.doesNotMatch(source, /attributes\.hp/);
});

test("MK rest integration explicitly advances one rest-day without coupling to HP amount", async () => {
  const source = await readFile(restingUrl, "utf8");

  assert.match(source, /woundRecovery/);
  assert.match(source, /restDays:\s*1/);
  assert.doesNotMatch(source, /restDays:\s*hp/);
});

test("recovery runtime loads immediately after Detailed Wounds", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const modules = manifest.esmodules ?? [];
  const woundsIndex = modules.indexOf("scripts/detailed-wounds/detailed-wounds.js");
  const recoveryIndex = modules.indexOf("scripts/detailed-wounds/recovery-runtime.js");
  const functionalIndex = modules.indexOf("scripts/detailed-wounds/functional-consequences-runtime.js");

  assert.ok(woundsIndex >= 0);
  assert.equal(recoveryIndex, woundsIndex + 1);
  assert.ok(functionalIndex > recoveryIndex);
});
