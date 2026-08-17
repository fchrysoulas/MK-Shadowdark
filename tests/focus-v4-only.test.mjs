import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../scripts/focus-spell-tracker/focus-spell-tracker.js", import.meta.url);

async function focusSource() {
  return readFile(sourceUrl, "utf8");
}

test("Focus Tracker contains no Shadowdark v3 cast adapters", async () => {
  const source = await focusSource();

  assert.doesNotMatch(source, /buildV3CastContext/);
  assert.doesNotMatch(source, /digestV3Result/);
  assert.doesNotMatch(source, /installV3Wrapper/);
  assert.doesNotMatch(source, /castNPCSpell/);
  assert.doesNotMatch(source, /generation\s*===\s*3/);
});

test("Focus native cast wrappers are installed only from ready", async () => {
  const source = await focusSource();
  const calls = source.match(/installV4WrappersOnce\(\)/g) ?? [];

  // One function declaration plus one ready-time invocation.
  assert.equal(calls.length, 2);
  assert.doesNotMatch(source, /renderActorSheet[\s\S]{0,1200}installV4WrappersOnce\(\)/);
  assert.doesNotMatch(source, /canvasReady[\s\S]{0,400}installV4WrappersOnce\(\)/);
});
