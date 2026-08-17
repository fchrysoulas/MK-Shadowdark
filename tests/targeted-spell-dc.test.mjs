import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { selectHighestSpellDcCandidate } from "../scripts/targeted-spell-dc/targeted-spell-dc-logic.js";

const sourceUrl = new URL("../scripts/targeted-spell-dc/targeted-spell-dc.js", import.meta.url);

test("highest valid targeted spell DC wins", () => {
  const selected = selectHighestSpellDcCandidate([
    { dc: 12, source: "Ward A" },
    { dc: 15, source: "Ward B" },
    { dc: 13, source: "Ward C" }
  ]);

  assert.deepEqual(selected, { dc: 15, source: "Ward B" });
});

test("invalid targeted spell DC candidates are ignored", () => {
  assert.equal(selectHighestSpellDcCandidate([
    { dc: -1 },
    { dc: "not-a-number" },
    null
  ]), null);
});

test("Targeted Spell DC no longer wraps RollDialog private context methods", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.doesNotMatch(source, /_prepareContext/);
  assert.doesNotMatch(source, /wrappedPrepareContext/);
  assert.doesNotMatch(source, /prototype\._prepareContext/);
});

test("Targeted Spell DC uses public Shadowdark spell hooks and live MK targeting updates", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /Hooks\.on\("SD-Player-Spell"/);
  assert.match(source, /Hooks\.on\("SD-NPC-Spell-Cast"/);
  assert.match(source, /Hooks\.on\(TARGETS_CHANGED_HOOK/);
});
