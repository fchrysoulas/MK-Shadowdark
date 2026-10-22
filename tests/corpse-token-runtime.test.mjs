import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const runtimeUrl = new URL("../scripts/corpse-token/corpse-token.js", import.meta.url);
const settingsUrl = new URL("../scripts/libs/settings.js", import.meta.url);
const featureSettingsUrl = new URL("../scripts/libs/feature-settings.js", import.meta.url);

test("Corpse Token defaults auto-restore on and gates verbose logs behind debug mode", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const settings = await readFile(settingsUrl, "utf8");
  const featureSettings = await readFile(featureSettingsUrl, "utf8");

  assert.match(runtime, /\[SETTINGS\.autoRestoreWhenHealed\]: true/);
  assert.match(runtime, /debug: "corpseTokenDebug"/);
  assert.match(runtime, /function log\(\.\.\.args\) \{\n  if \(!getSetting\(SETTINGS\.debug\)\) return;/);
  assert.match(settings, /corpseTokenAutoRestoreWhenHealed", "corpseTokenDebug"/);
  assert.match(featureSettings, /registerSetting\("corpseTokenAutoRestoreWhenHealed",/);
  assert.match(featureSettings, /registerSetting\("corpseTokenDebug",/);
  assert.match(featureSettings, /name: "Corpse Token: Debug Mode"/);
});

test("Boat hull damage never triggers corpse-token automation even with NPC-only filtering disabled", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const [functionSource] = runtime.match(/function shouldProcessActor\(actor\) \{[\s\S]*?\n\}/);
  const shouldProcess = vm.runInNewContext(`(${functionSource})`, {
    getSetting: () => false, SETTINGS: { onlyNpcs: "onlyNpcs" }, isNpc: actor => actor.type === "NPC",
  });
  assert.equal(shouldProcess({ type: "mk-shadowdark.boat" }), false);
  assert.equal(shouldProcess({ type: "NPC" }), true);
  assert.equal(shouldProcess({ type: "Player" }), true);
});

