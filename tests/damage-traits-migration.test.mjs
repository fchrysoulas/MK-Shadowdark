import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DAMAGE_TRAITS_MIGRATION_SETTING,
  DAMAGE_TRAITS_MIGRATION_VERSION,
  needsDamageTraitsMigration,
  normalizeDamageTraitRecords
} from "../scripts/auto-damage/damage-traits-migration.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Damage Traits migration version is explicit and monotonic", () => {
  assert.equal(DAMAGE_TRAITS_MIGRATION_SETTING, "damageTraitsMigrationVersion");
  assert.equal(DAMAGE_TRAITS_MIGRATION_VERSION, 1);
  assert.equal(needsDamageTraitsMigration(0), true);
  assert.equal(needsDamageTraitsMigration("0"), true);
  assert.equal(needsDamageTraitsMigration(1), false);
  assert.equal(needsDamageTraitsMigration(2), false);
});

test("legacy Damage Traits records normalize into current trait modes", () => {
  assert.deepEqual(normalizeDamageTraitRecords([
    { uuid: "Property.fire", mode: "resistance" },
    { uuid: "Property.cold", reduction: "%" },
    { uuid: "Property.acid", mode: "nonmagical-immunity" },
    { uuid: "Property.fire", mode: "vulnerability" },
    { uuid: "Property.old", reduction: 2 },
    null
  ]), [
    { uuid: "Property.fire", mode: "resistance" },
    { uuid: "Property.cold", mode: "resistance" },
    { uuid: "Property.acid", mode: "immunity" },
    { uuid: "Property.fire", mode: "vulnerability" }
  ]);
});

test("normal Damage Traits runtime reads Active Effects only", () => {
  const runtime = source("scripts/auto-damage/damage-traits.js");

  const featureReader = runtime.match(/function getFeatureTraits[\s\S]*?\n  \}/u)?.[0] ?? "";
  const actorReader = runtime.match(/function getActorTraits[\s\S]*?\n  \}/u)?.[0] ?? "";

  assert.match(featureReader, /effectTraitRecords/);
  assert.doesNotMatch(featureReader, /getLegacyFeatureTraits|FEATURE_TRAITS_FLAG|includeLegacy/);
  assert.match(actorReader, /effectTraitRecords/);
  assert.doesNotMatch(actorReader, /getLegacyFeatureTraits|ACTOR_TRAITS_FLAG|normalizeDamageTraitRecords/);
});

test("Damage Traits migration is version-gated and centrally registered", () => {
  const runtime = source("scripts/auto-damage/damage-traits.js");
  const settings = source("scripts/libs/feature-settings.js");

  assert.match(runtime, /needsDamageTraitsMigration\(getStoredMigrationVersion\(\)\)/);
  assert.match(runtime, /game\.settings\.set\(MODULE_ID, DAMAGE_TRAITS_MIGRATION_SETTING, DAMAGE_TRAITS_MIGRATION_VERSION\)/);
  assert.match(runtime, /getLegacyFeatureTraitFlag/);
  assert.match(runtime, /unsetFlag\(MODULE_ID, ACTOR_TRAITS_FLAG\)/);
  assert.match(runtime, /unsetFlag\(MODULE_ID, FEATURE_TRAITS_FLAG\)/);

  assert.match(settings, /registerSetting\(["']damageTraitsMigrationVersion["']/);
  assert.match(settings, /name:\s*["']Damage Traits Migration Version["']/);
  assert.match(settings, /config:\s*false/);
});
