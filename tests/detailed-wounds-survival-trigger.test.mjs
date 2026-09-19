import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  SURVIVAL_TRIGGER_MODES,
  SURVIVAL_WOUND_DC,
  normalizeSurvivalTriggerMode,
  survivalTriggerAction
} from "../scripts/detailed-wounds/survival-trigger-core.js";

const runtimeUrl = new URL("../scripts/detailed-wounds/survival-trigger.js", import.meta.url);
const settingsUrl = new URL("../scripts/libs/feature-settings.js", import.meta.url);
const manifestUrl = new URL("../module.json", import.meta.url);

test("survival wound trigger modes resolve deterministically", () => {
  const base = {
    enabled: true,
    wasDying: true,
    zeroCon: false,
    hp: 1,
    isGm: true
  };

  assert.equal(survivalTriggerAction({ ...base, mode: SURVIVAL_TRIGGER_MODES.OFF }), "none");
  assert.equal(survivalTriggerAction({ ...base, mode: SURVIVAL_TRIGGER_MODES.PROMPT }), "prompt");
  assert.equal(survivalTriggerAction({ ...base, mode: SURVIVAL_TRIGGER_MODES.AUTOMATIC }), "automatic");
  assert.equal(normalizeSurvivalTriggerMode("unknown"), SURVIVAL_TRIGGER_MODES.PROMPT);
  assert.equal(SURVIVAL_WOUND_DC, 12);
});

test("survival wound trigger rejects non-survival states", () => {
  const base = {
    enabled: true,
    mode: SURVIVAL_TRIGGER_MODES.AUTOMATIC,
    wasDying: true,
    zeroCon: false,
    hp: 1,
    isGm: true
  };

  assert.equal(survivalTriggerAction({ ...base, enabled: false }), "none");
  assert.equal(survivalTriggerAction({ ...base, wasDying: false }), "none");
  assert.equal(survivalTriggerAction({ ...base, zeroCon: true }), "none");
  assert.equal(survivalTriggerAction({ ...base, hp: 0 }), "none");
  assert.equal(survivalTriggerAction({ ...base, isGm: false }), "none");
});

test("shared Detailed Wounds settings expose Off, GM Prompt, and Automatic with GM Prompt default", async () => {
  const source = await readFile(settingsUrl, "utf8");

  assert.match(source, /settings: \["detailedWoundsEnabled", "detailedWoundsSurvivalTrigger"\]/);
  assert.match(source, /registerSetting\("detailedWoundsSurvivalTrigger"/);
  assert.match(source, /Detailed Wounds \| Surviving 0 HP Trigger/);
  assert.match(source, /default: "prompt"/);
  assert.match(source, /off: "Off"/);
  assert.match(source, /prompt: "GM Prompt"/);
  assert.match(source, /automatic: "Automatic"/);
});

test("runtime consumes the shared trigger setting without registering settings itself", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /SETTING_TRIGGER = "detailedWoundsSurvivalTrigger"/);
  assert.match(source, /getSetting\(SETTING_TRIGGER, SURVIVAL_TRIGGER_MODES\.PROMPT\)/);
  assert.doesNotMatch(source, /game\.settings\.register\(/);
});

test("failed survival CON check delegates through the selected wound profile", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /const resolution = check\.success/);
  assert.match(source, /resolveFailedSurvival\(actor, profile\)/);
  assert.match(source, /api\?\.wounds\?\.rollRandom\?\.\(actor\)/);
  assert.match(source, /drawEnduringWound\(getSetting\(SETTING_ENDURING_TABLE, ""\)\)/);
  assert.match(source, /waitForResolvedSurvival\(actor\)/);
  assert.match(source, /!hasDeathTimerState\(actor\)/);
  assert.match(source, /!isPlayerAtZeroCon\(actor\)/);
});

test("survival watcher loads before Death Timer so it snapshots the dying state first", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const survivalIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/survival-trigger.js");
  const deathTimerIndex = manifest.esmodules.indexOf("scripts/death-timer/death-timer.js");

  assert.ok(survivalIndex >= 0, "survival trigger must be loaded");
  assert.ok(deathTimerIndex >= 0, "Death Timer must be loaded");
  assert.ok(survivalIndex < deathTimerIndex, "survival trigger must register its update hook before Death Timer");
});
