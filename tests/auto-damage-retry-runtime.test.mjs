import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../scripts/auto-damage/auto-apply-damage.js", import.meta.url);
const traitsUrl = new URL("../scripts/auto-damage/damage-traits.js", import.meta.url);
const settingsUrl = new URL("../scripts/libs/settings.js", import.meta.url);

test("Auto Damage persists a complete target plan before applying HP changes", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /createProcessingState/);
  assert.match(source, /autoDamageProcessing/);

  const persistIndex = source.indexOf("await persistProcessingState(message, processingState);");
  const applyIndex = source.indexOf(
    "processingState = await applyProcessingPlan(message, processingState, { critical });",
    persistIndex
  );
  assert.ok(persistIndex >= 0, "processing plan must be persisted");
  assert.ok(applyIndex > persistIndex, "processing plan must be persisted before Actor HP application");
});

test("legacy processed flag is only written after the retry state is complete", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  const completionBlock = source.match(/if \(finalState\.status === "complete"\) \{([\s\S]*?)\n    \}/);

  assert.ok(completionBlock, "complete-state block must exist");
  assert.match(completionBlock[1], /setFlag\(MODULE_ID, "autoDamageProcessed", true\)/);

  const firstLegacyWrite = source.indexOf('setFlag(MODULE_ID, "autoDamageProcessed", true)');
  const processingRunner = source.indexOf("runProcessingState(state");
  assert.ok(firstLegacyWrite > processingRunner, "legacy completion flag must not be written before retry-state execution");
});

test("Auto Damage uses Shadowdark native rolls and Actor.applyDamage", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /extractNativeDamage/);
  assert.match(source, /actor\.applyDamage\(nativeAmount\)/);
  assert.match(source, /setFlag\("shadowdark", "damageApplied", true\)/);
  assert.doesNotMatch(source, /htmlToText/);
  assert.doesNotMatch(source, /extractDamageAndOutcome/);
  assert.doesNotMatch(source, /rollDamageFromDealXdX/);
  assert.doesNotMatch(source, /rollDamageFromInlineDamage/);
});

test("Auto Damage verbose logging is gated by its debug setting", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  const settings = await readFile(settingsUrl, "utf8");

  assert.match(source, /game\.settings\.get\(MODULE_ID, "autoDamageDebug"\)/);
  assert.match(source, /function adLog\(\.\.\.args\) \{\n    if \(!isDebugEnabled\(\)\) return;/);
  assert.match(settings, /autoDamageDelayMs", "autoDamageDebug"/);
  assert.match(settings, /registerSetting\("autoDamageDebug",/);
  assert.doesNotMatch(settings, /autoDamageShowDice3D/);
});

test("Damage Traits migration logging follows Auto Damage debug mode", async () => {
  const source = await readFile(traitsUrl, "utf8");

  assert.match(source, /function debug\(\.\.\.args\)/);
  assert.match(source, /game\.settings\.get\(MODULE_ID, "autoDamageDebug"\)/);
  assert.equal((source.match(/console\.log\(/g) ?? []).length, 1);
  assert.ok(source.indexOf("console.log(") > source.indexOf("function debug("));
});

test("ready hook resumes persisted pending Auto Damage transactions", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /async function resumePendingProcessing\(\)/);
  assert.match(source, /state\?\.status !== "pending"/);
  assert.match(source, /void resumePendingProcessing\(\)/);
});

test("pending-state promotion recovers Death Timer damage", async () => {
  const source = await readFile(runtimeUrl, "utf8");
  const processingState = await readFile(
    new URL("../scripts/auto-damage/auto-damage-processing-state.js", import.meta.url),
    "utf8"
  );

  assert.match(source, /recoverPromotedDeathTimerDamage/);
  assert.match(source, /deathTimerApi\.recordDamage/);
  assert.match(source, /dedupeKey: `\$\{message\.id\}:\$\{target\.uuid\}`/);
  assert.match(processingState, /onPromoted = null/);
  assert.match(processingState, /await onPromoted\?\.\(target\)/);
});
