import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  RETIRED_SETTINGS,
  retireSetting
} from "../scripts/libs/retired-settings.js";

const manifestUrl = new URL("../module.json", import.meta.url);
const runtimeUrl = new URL("../scripts/auto-damage/auto-apply-damage.js", import.meta.url);

test("obsolete Auto Damage settings are explicitly retired", () => {
  assert.deepEqual(RETIRED_SETTINGS, [
    "autoDamageGMOnly",
    "autoDamageShowDice3D",
    "detailedWoundsSurvivalTrigger",
    "detailedWoundsSurvivalProfile",
    "enduringWoundsTableUuid",
    "deathTimerMinTurns",
    "deathTimerTooltip"
  ]);

  const registrations = new Map([
    ["mk-shadowdark.autoDamageGMOnly", { scope: "world" }],
    ["mk-shadowdark.autoDamageShowDice3D", { scope: "world" }],
    ["mk-shadowdark.autoDamageEnabled", { scope: "world" }]
  ]);

  const previousGame = globalThis.game;
  globalThis.game = { settings: { settings: registrations } };

  try {
    assert.equal(retireSetting("mk-shadowdark", "autoDamageGMOnly"), true);
    assert.equal(retireSetting("mk-shadowdark", "autoDamageShowDice3D"), true);
    assert.equal(registrations.has("mk-shadowdark.autoDamageGMOnly"), false);
    assert.equal(registrations.has("mk-shadowdark.autoDamageShowDice3D"), false);
    assert.equal(registrations.has("mk-shadowdark.autoDamageEnabled"), true);
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("retired settings cleanup loads after registration and before feature menus/runtime", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const modules = manifest.esmodules;

  const settingsIndex = modules.indexOf("scripts/libs/settings.js");
  const retiredIndex = modules.indexOf("scripts/libs/retired-settings.js");
  const featureIndex = modules.indexOf("scripts/libs/feature-settings.js");
  const autoDamageIndex = modules.indexOf("scripts/auto-damage/auto-apply-damage.js");

  assert.ok(settingsIndex >= 0);
  assert.ok(retiredIndex > settingsIndex);
  assert.ok(featureIndex > retiredIndex);
  assert.ok(autoDamageIndex > retiredIndex);
});

test("Auto Damage remains explicitly primary-active-GM authoritative", async () => {
  const runtime = await readFile(runtimeUrl, "utf8");

  assert.match(runtime, /function isPrimaryActiveGM\(\)/);
  assert.match(runtime, /if \(!isPrimaryActiveGM\(\)\) return;/);
  assert.doesNotMatch(runtime, /autoDamageGMOnly/);
});
