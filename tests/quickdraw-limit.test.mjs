import test from "node:test";
import assert from "node:assert/strict";

import {
  countCarriedGear,
  evaluateQuickdrawLimit,
  evaluateQuickdrawLimitDetails,
  resolveActorReference
} from "../scripts/quickdraw/quickdraw-limit.js";

function makeActor({ dex = 0, items = [], level = 1 } = {}) {
  return {
    system: {
      level: { value: level },
      abilities: { dex: { mod: dex } }
    },
    items,
    getRollData() {
      return {
        level: { value: level },
        abilities: { dex: { mod: dex } }
      };
    }
  };
}

test("fixed limits preserve whole-number and unlimited semantics", () => {
  const actor = makeActor();
  assert.equal(evaluateQuickdrawLimit("3", actor), 3);
  assert.equal(evaluateQuickdrawLimit("3.9", actor), 3);
  assert.equal(evaluateQuickdrawLimit("0", actor), 0);
});

test("actor references support short ability aliases and system paths", () => {
  const actor = makeActor({ dex: 3, level: 5 });
  assert.equal(resolveActorReference(actor, "dex.mod"), 3);
  assert.equal(resolveActorReference(actor, "system.level.value"), 5);
  assert.equal(evaluateQuickdrawLimit("max(1, @dex.mod)", actor), 3);
});

test("gear() counts carried quantities and ignores stashed items", () => {
  const actor = makeActor({
    items: [
      { id: "a", name: "Leather Bandolier", system: { quantity: 2, stashed: false } },
      { id: "b", name: "Bandolier of Vials", system: { quantity: 1, stashed: true } },
      { id: "c", name: "Potion Belt", system: { quantity: 1, stashed: false } }
    ]
  });

  assert.equal(countCarriedGear(actor, "bandolier"), 2);
  assert.equal(evaluateQuickdrawLimit('3 + gear("bandolier")', actor), 5);
  assert.equal(evaluateQuickdrawLimit('gear("bandolier", 2) + gear("potion belt", 3)', actor), 7);
});

test("supported arithmetic and numeric functions evaluate deterministically", () => {
  const actor = makeActor({ dex: 2 });
  assert.equal(evaluateQuickdrawLimit("2 ^ 3", actor), 8);
  assert.equal(evaluateQuickdrawLimit("clamp(@dex.mod * 3, 1, 5)", actor), 5);
  assert.equal(evaluateQuickdrawLimit("floor(5 / 2) + abs(-1)", actor), 3);
});

test("detail evaluation reports actor and gear sources", () => {
  const actor = makeActor({
    dex: 2,
    items: [
      { id: "a", name: "Bandolier", system: { quantity: 1, stashed: false } }
    ]
  });

  const result = evaluateQuickdrawLimitDetails('max(1, @dex.mod + gear("bandolier", 2))', actor);
  assert.equal(result.total, 4);
  assert.ok(result.sources.some(source => source.type === "reference" && source.value === 2));
  assert.ok(result.sources.some(source => source.type === "gear" && source.value === 2));
});

test("invalid expressions fail instead of executing arbitrary JavaScript", () => {
  const actor = makeActor();
  assert.throws(() => evaluateQuickdrawLimit("process.exit()", actor), /Unsupported Quickdraw function|Unexpected token/);
  assert.throws(() => evaluateQuickdrawLimit("1; globalThis.hacked = true", actor), /Unsupported character/);
  assert.throws(() => evaluateQuickdrawLimit('gear("missing", -1)', actor), /cannot be negative/);
});
