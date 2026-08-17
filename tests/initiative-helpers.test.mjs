import test from "node:test";
import assert from "node:assert/strict";

import {
  advancePastGroupedCombatants,
  sameInitiative
} from "../scripts/initiative/initiative-helpers.js";

function makeCombat(turns, { round = 1, turn = 0 } = {}) {
  return {
    round,
    turn,
    turns,
    get combatant() {
      return this.turns[this.turn] ?? null;
    }
  };
}

function makeCoreAdvance(combat, calls) {
  return async () => {
    calls.count += 1;
    if (combat.turn + 1 >= combat.turns.length) {
      combat.round += 1;
      combat.turn = 0;
    } else {
      combat.turn += 1;
    }
    return combat;
  };
}

const isEnemy = combatant => combatant?.enemy === true;

test("sameInitiative accepts matching numeric values and rejects missing values", () => {
  assert.equal(sameInitiative({ initiative: 14 }, { initiative: "14" }), true);
  assert.equal(sameInitiative({ initiative: 14 }, { initiative: 13 }), false);
  assert.equal(sameInitiative({ initiative: null }, { initiative: 14 }), false);
  assert.equal(sameInitiative({ initiative: "" }, { initiative: 0 }), false);
});

test("grouped advancement delegates through core until the next non-enemy turn", async () => {
  const turns = [
    { id: "enemy-a", enemy: true, initiative: 15 },
    { id: "enemy-b", enemy: true, initiative: 15 },
    { id: "pc-a", enemy: false, initiative: 12 }
  ];
  const combat = makeCombat(turns);
  const calls = { count: 0 };

  await advancePastGroupedCombatants(combat, turns[0], {
    advanceTurn: makeCoreAdvance(combat, calls),
    isGroupedCombatant: isEnemy
  });

  assert.equal(calls.count, 2);
  assert.equal(combat.round, 1);
  assert.equal(combat.combatant.id, "pc-a");
});

test("grouped advancement stops when core reaches a hostile with a different initiative", async () => {
  const turns = [
    { id: "enemy-a", enemy: true, initiative: 15 },
    { id: "enemy-b", enemy: true, initiative: 14 },
    { id: "pc-a", enemy: false, initiative: 12 }
  ];
  const combat = makeCombat(turns);
  const calls = { count: 0 };

  await advancePastGroupedCombatants(combat, turns[0], {
    advanceTurn: makeCoreAdvance(combat, calls),
    isGroupedCombatant: isEnemy
  });

  assert.equal(calls.count, 1);
  assert.equal(combat.combatant.id, "enemy-b");
});

test("grouped advancement stops after crossing into the next round", async () => {
  const turns = [
    { id: "enemy-a", enemy: true, initiative: 15 },
    { id: "enemy-b", enemy: true, initiative: 15 }
  ];
  const combat = makeCombat(turns);
  const calls = { count: 0 };

  await advancePastGroupedCombatants(combat, turns[0], {
    advanceTurn: makeCoreAdvance(combat, calls),
    isGroupedCombatant: isEnemy
  });

  assert.equal(calls.count, 2);
  assert.equal(combat.round, 2);
  assert.equal(combat.combatant.id, "enemy-a");
});

test("grouped advancement aborts safely if core does not change combat position", async () => {
  const turns = [
    { id: "enemy-a", enemy: true, initiative: 15 },
    { id: "enemy-b", enemy: true, initiative: 15 }
  ];
  const combat = makeCombat(turns);
  const calls = { count: 0 };

  await advancePastGroupedCombatants(combat, turns[0], {
    advanceTurn: async () => {
      calls.count += 1;
      return combat;
    },
    isGroupedCombatant: isEnemy
  });

  assert.equal(calls.count, 1);
  assert.equal(combat.combatant.id, "enemy-a");
});
