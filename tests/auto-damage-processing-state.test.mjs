import test from "node:test";
import assert from "node:assert/strict";

import {
  createProcessingState,
  hasLegacyProcessed,
  normalizeProcessingState,
  reconcilePlannedTarget,
  runProcessingState
} from "../scripts/auto-damage/auto-damage-processing-state.js";

function plan(uuid, beforeHp, afterHp) {
  return {
    uuid,
    state: "planned",
    hpPath: "system.hp.value",
    beforeHp,
    afterHp,
    appliedAmount: Math.abs(afterHp - beforeHp),
    operation: "damage",
    amount: Math.abs(afterHp - beforeHp)
  };
}

test("planned target reconciliation is idempotent across retries", () => {
  const target = plan("A", 12, 7);
  assert.equal(reconcilePlannedTarget(target, 12), "apply");
  assert.equal(reconcilePlannedTarget(target, 7), "promote");
  assert.equal(reconcilePlannedTarget(target, 9), "conflict");
});

test("processing state preserves the native amount after damage-trait adjustment", () => {
  const state = createProcessingState({
    operation: "damage",
    amount: 9,
    targets: [{
      ...plan("A", 12, 8),
      amount: 9,
      reduction: 4,
      effectiveAmount: 5
    }]
  });

  assert.equal(state.targets[0].effectiveAmount, 5);
  assert.equal(state.targets[0].reduction, 4);
});

test("legacy processing state derives a native amount when it has no effective amount", () => {
  const state = createProcessingState({
    operation: "damage",
    amount: 9,
    targets: [{
      ...plan("A", 12, 8),
      amount: 9,
      reduction: 4
    }]
  });

  assert.equal(state.targets[0].effectiveAmount, 5);
});

test("partial failure retries only unfinished targets", async () => {
  const hp = new Map([["A", 12], ["B", 10]]);
  const applications = [];
  let persisted = createProcessingState({
    operation: "damage",
    amount: 5,
    targets: [plan("A", 12, 7), plan("B", 10, 5)]
  });

  let failB = true;
  await assert.rejects(
    runProcessingState(persisted, {
      readCurrentHp: async target => hp.get(target.uuid),
      applyTarget: async target => {
        applications.push(target.uuid);
        if (target.uuid === "B" && failB) throw new Error("transient update failure");
        hp.set(target.uuid, target.afterHp);
      },
      persistState: async state => {
        persisted = normalizeProcessingState(state);
      }
    }),
    /transient update failure/
  );

  assert.equal(hp.get("A"), 7);
  assert.equal(hp.get("B"), 10);
  assert.equal(persisted.targets.find(target => target.uuid === "A").state, "applied");
  assert.equal(persisted.targets.find(target => target.uuid === "B").state, "planned");

  failB = false;
  persisted = await runProcessingState(persisted, {
    readCurrentHp: async target => hp.get(target.uuid),
    applyTarget: async target => {
      applications.push(target.uuid);
      hp.set(target.uuid, target.afterHp);
    },
    persistState: async state => {
      persisted = normalizeProcessingState(state);
    }
  });

  assert.deepEqual(applications, ["A", "B", "B"]);
  assert.equal(hp.get("A"), 7);
  assert.equal(hp.get("B"), 5);
  assert.equal(persisted.status, "complete");
});

test("crash-window recovery promotes an already-applied target without changing HP twice", async () => {
  const hp = new Map([["A", 7]]);
  let applyCount = 0;
  let persisted = createProcessingState({
    operation: "damage",
    amount: 5,
    targets: [plan("A", 12, 7)]
  });

  persisted = await runProcessingState(persisted, {
    readCurrentHp: async target => hp.get(target.uuid),
    applyTarget: async target => {
      applyCount += 1;
      hp.set(target.uuid, target.afterHp);
    },
    persistState: async state => {
      persisted = normalizeProcessingState(state);
    }
  });

  assert.equal(applyCount, 0);
  assert.equal(hp.get("A"), 7);
  assert.equal(persisted.targets[0].state, "applied");
  assert.equal(persisted.status, "complete");
});

test("crash-window promotion runs recovery side effects before completion", async () => {
  const hp = new Map([["A", 7]]);
  const promoted = [];
  let persisted = createProcessingState({
    operation: "damage",
    amount: 5,
    targets: [plan("A", 12, 7)]
  });

  persisted = await runProcessingState(persisted, {
    readCurrentHp: async target => hp.get(target.uuid),
    applyTarget: async () => {
      throw new Error("promoted targets must not apply damage again");
    },
    onPromoted: async target => {
      promoted.push(target.uuid);
    },
    persistState: async state => {
      persisted = normalizeProcessingState(state);
    }
  });

  assert.deepEqual(promoted, ["A"]);
  assert.equal(persisted.status, "complete");
});

test("diverged HP fails safe and records a conflict", async () => {
  const hp = new Map([["A", 9]]);
  let applyCount = 0;
  let persisted = createProcessingState({
    operation: "damage",
    amount: 5,
    targets: [plan("A", 12, 7)]
  });

  persisted = await runProcessingState(persisted, {
    readCurrentHp: async target => hp.get(target.uuid),
    applyTarget: async () => {
      applyCount += 1;
    },
    persistState: async state => {
      persisted = normalizeProcessingState(state);
    }
  });

  assert.equal(applyCount, 0);
  assert.equal(hp.get("A"), 9);
  assert.equal(persisted.targets[0].state, "conflict");
  assert.equal(persisted.targets[0].observedHp, 9);
  assert.equal(persisted.status, "conflict");
});

test("legacy processed messages remain complete and are never replayed", () => {
  assert.equal(hasLegacyProcessed({
    getFlag: (_moduleId, key) => key === "autoDamageProcessed" ? true : undefined
  }), true);

  assert.equal(hasLegacyProcessed({
    flags: { "mk-shadowdark": { autoDamageProcessed: true } }
  }), true);
});
