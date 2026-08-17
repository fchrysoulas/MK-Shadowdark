import test from "node:test";
import assert from "node:assert/strict";

import { isCorpseLifecycleActive } from "../scripts/corpse-token/corpse-token-state.js";

test("an applied corpse remains active", () => {
  assert.equal(isCorpseLifecycleActive({
    applied: true,
    hasStoredData: true,
    matchesCorpseAppearance: true
  }), true);
});

test("restored corpse data is inert on later HP changes", () => {
  assert.equal(isCorpseLifecycleActive({
    applied: false,
    hasStoredData: true,
    matchesCorpseAppearance: false
  }), false);
});

test("legacy corpse data falls back to the current corpse appearance", () => {
  assert.equal(isCorpseLifecycleActive({
    applied: undefined,
    hasStoredData: true,
    matchesCorpseAppearance: true
  }), true);

  assert.equal(isCorpseLifecycleActive({
    applied: undefined,
    hasStoredData: true,
    matchesCorpseAppearance: false
  }), false);
});

test("a corpse lifecycle cannot be active without stored original data", () => {
  assert.equal(isCorpseLifecycleActive({
    applied: true,
    hasStoredData: false,
    matchesCorpseAppearance: true
  }), false);
});
