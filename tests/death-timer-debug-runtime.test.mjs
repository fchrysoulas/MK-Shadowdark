import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const runtimeUrl = new URL("../scripts/death-timer/death-timer.js", import.meta.url);
const summaryBarUrl = new URL("../scripts/summary-bar/summary-bar.js", import.meta.url);
const settingsUrl = new URL("../scripts/libs/settings.js", import.meta.url);
const retiredSettingsUrl = new URL("../scripts/libs/retired-settings.js", import.meta.url);

test("Death Timer verbose logging is gated by its debug setting", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const settings = await readFile(settingsUrl, "utf8");

  assert.match(runtime, /game\.settings\.get\(MODULE_ID, "deathTimerDebug"\)/);
  assert.match(runtime, /function dtLog\(\.\.\.args\) \{\n    if \(!isDebugEnabled\(\)\) return;/);
  assert.match(settings, /"deathTimerDebug"/);
  assert.match(settings, /registerSetting\("deathTimerDebug",/);
  assert.match(settings, /name: "Death Timer \| Debug Mode"/);
});

test("Death Timer keeps minimum turns and tooltip text fixed", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");
  const summaryBar = await readFile(summaryBarUrl, "utf8");
  const settings = await readFile(settingsUrl, "utf8");
  const retiredSettings = await readFile(retiredSettingsUrl, "utf8");

  assert.doesNotMatch(runtime, /deathTimerMinTurns/);
  assert.doesNotMatch(summaryBar, /deathTimerTooltip/);
  assert.doesNotMatch(settings, /registerSetting\("deathTimerMinTurns"/);
  assert.doesNotMatch(settings, /registerSetting\("deathTimerTooltip"/);
  assert.match(retiredSettings, /"deathTimerMinTurns"/);
  assert.match(retiredSettings, /"deathTimerTooltip"/);
});

test("Death Timer d20 checks use the native Shadowdark roll prompt", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /async function evaluateDeathCheckRoll\(actor\)/);
  assert.match(runtime, /nativeDice\.rollDialog\(config\)/);
  assert.match(runtime, /return await nativeDice\.roll\(config\.mainRoll, rollData\)/);
  assert.match(runtime, /mainRoll: \{[\s\S]*formula: "1d20"/);
});
