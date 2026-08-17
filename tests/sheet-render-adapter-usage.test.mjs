import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONSUMERS = [
  "scripts/quickdraw/quickdraw-icons.js",
  "scripts/summary-bar/summary-bar.js",
  "scripts/minimize-sheet/minimize-sheet.js",
  "scripts/detailed-wounds/detailed-wounds.js",
  "scripts/focus-spell-tracker/focus-spell-tracker.js",
  "scripts/sheet-style-editor/sheet-style-editor.js",
  "scripts/character-sheet-tweaks/character-sheet-tweaks.js",
  "scripts/equipment-hands/equipment-hands.js"
];

const DIRECT_ACTOR_RENDER_REGISTRATION = /Hooks\.on\(\s*["'](?:renderActorSheet|renderActorSheetSD|renderPlayerSheetSD|renderShadowdarkActorSheet|renderShadowdarkActorSheetV2|renderActorSheetShadowdark)["']/;

test("primary character-sheet injectors use the shared render adapter", async () => {
  for (const path of CONSUMERS) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /onCharacterSheetRender\(/, `${path} must register through the shared adapter`);
    assert.doesNotMatch(source, DIRECT_ACTOR_RENDER_REGISTRATION, `${path} must not register actor render hooks directly`);
  }
});

test("Quickdraw, Focus, and Detailed Wounds no longer own render retries", async () => {
  const quickdraw = await readFile(new URL("../scripts/quickdraw/quickdraw-icons.js", import.meta.url), "utf8");
  const focus = await readFile(new URL("../scripts/focus-spell-tracker/focus-spell-tracker.js", import.meta.url), "utf8");
  const wounds = await readFile(new URL("../scripts/detailed-wounds/detailed-wounds.js", import.meta.url), "utf8");

  assert.doesNotMatch(quickdraw, /renderRetryTimers|scheduleRenderRetries|\[50,\s*250\]/);
  assert.doesNotMatch(focus, /setTimeout\(\(\) => renderActorFocus/);
  assert.doesNotMatch(wounds, /queueMicrotask\(\(\) => injectWoundsTabSafely/);
});
