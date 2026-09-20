import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

import { RETIRED_SETTINGS } from "../scripts/libs/retired-settings.js";

const manifestUrl = new URL("../module.json", import.meta.url);
const featureSettingsUrl = new URL("../scripts/libs/feature-settings.js", import.meta.url);

test("Survival Wound Profile runtime and settings are no longer loaded", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const featureSettings = await readFile(featureSettingsUrl, "utf8");
  const modules = manifest.esmodules ?? [];

  assert.equal(modules.includes("scripts/detailed-wounds/survival-profile-settings.js"), false);
  assert.equal(modules.includes("scripts/detailed-wounds/survival-trigger.js"), false);
  assert.doesNotMatch(featureSettings, /Survival Wound|survivalWound|detailedWoundsSurvivalTrigger/);
});

test("Survival Wound Profile settings are explicitly retired", () => {
  assert.ok(RETIRED_SETTINGS.includes("detailedWoundsSurvivalTrigger"));
  assert.ok(RETIRED_SETTINGS.includes("detailedWoundsSurvivalProfile"));
  assert.ok(RETIRED_SETTINGS.includes("enduringWoundsTableUuid"));
});

test("removed Survival Wound Profile assets are absent", async () => {
  for (const relativePath of [
    "scripts/detailed-wounds/enduring-wounds.js",
    "scripts/detailed-wounds/survival-profile-core.js",
    "scripts/detailed-wounds/survival-profile-settings.js",
    "scripts/detailed-wounds/survival-trigger.js",
    "templates/survival-wound-profile-settings.hbs"
  ]) {
    await assert.rejects(access(new URL(`../${relativePath}`, import.meta.url)));
  }
});
