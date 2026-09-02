import test from "node:test";
import assert from "node:assert/strict";

import {
  getConScore,
  isPlayerAtZeroCon
} from "../scripts/death-timer/con-death.js";

function player(con) {
  return {
    documentName: "Actor",
    type: "Player",
    system: { abilities: { con: { value: con } } }
  };
}

test("effective CON is read from the Shadowdark Player ability", () => {
  assert.equal(getConScore(player(12)), 12);
  assert.equal(getConScore(player(0)), 0);
});

test("Player characters at zero or lower CON satisfy the death rule", () => {
  assert.equal(isPlayerAtZeroCon(player(1)), false);
  assert.equal(isPlayerAtZeroCon(player(0)), true);
  assert.equal(isPlayerAtZeroCon(player(-1)), true);
});

test("the CON death rule excludes non-Player actors and missing scores", () => {
  assert.equal(isPlayerAtZeroCon({ ...player(0), type: "NPC" }), false);
  assert.equal(isPlayerAtZeroCon({ documentName: "Actor", type: "Player", system: {} }), false);
});
