import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../scripts/auto-damage/auto-apply-damage.js", import.meta.url);

test("Auto Damage persists a complete target plan before applying HP changes", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /createProcessingState/);
  assert.match(source, /autoDamageProcessing/);

  const persistIndex = source.indexOf("await persistProcessingState(message, processingState);");
  const applyIndex = source.indexOf(
    "processingState = await applyProcessingPlan(message, processingState);",
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

test("ready hook resumes persisted pending Auto Damage transactions", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /async function resumePendingProcessing\(\)/);
  assert.match(source, /state\?\.status !== "pending"/);
  assert.match(source, /void resumePendingProcessing\(\)/);
});
