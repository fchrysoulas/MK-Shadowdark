import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MORALE_MIGRATION_SETTING,
  MORALE_MIGRATION_VERSION,
  hasLegacyTokenMoraleImmunity,
  hasLegacyTokenMoraleImmunityField,
  needsMoraleMigration,
  withoutLegacyTokenMoraleImmunity
} from "../scripts/morale/morale-migration.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function functionBlock(text, name) {
  const marker = `  function ${name}`;
  const asyncMarker = `  async function ${name}`;
  const start = text.indexOf(marker) >= 0 ? text.indexOf(marker) : text.indexOf(asyncMarker);
  if (start < 0) return "";
  const next = text.indexOf("\n  function ", start + 1);
  const nextAsync = text.indexOf("\n  async function ", start + 1);
  const candidates = [next, nextAsync].filter(index => index >= 0);
  const end = candidates.length ? Math.min(...candidates) : text.length;
  return text.slice(start, end);
}

test("morale migration version is explicit and monotonic", () => {
  assert.equal(MORALE_MIGRATION_SETTING, "moraleMigrationVersion");
  assert.equal(MORALE_MIGRATION_VERSION, 1);
  assert.equal(needsMoraleMigration(0), true);
  assert.equal(needsMoraleMigration("0"), true);
  assert.equal(needsMoraleMigration(1), false);
  assert.equal(needsMoraleMigration(2), false);
});

test("legacy token immunity is removed without disturbing leader state", () => {
  const legacy = { leader: true, immune: true, note: "keep" };
  assert.equal(hasLegacyTokenMoraleImmunityField(legacy), true);
  assert.equal(hasLegacyTokenMoraleImmunity(legacy), true);
  assert.deepEqual(withoutLegacyTokenMoraleImmunity(legacy), {
    leader: true,
    note: "keep"
  });

  const explicitFalse = { leader: false, immune: false };
  assert.equal(hasLegacyTokenMoraleImmunityField(explicitFalse), true);
  assert.equal(hasLegacyTokenMoraleImmunity(explicitFalse), false);
  assert.deepEqual(withoutLegacyTokenMoraleImmunity(explicitFalse), { leader: false });
});

test("runtime morale immunity uses actor canonical state only", () => {
  const runtime = source("scripts/morale/morale.js");
  const reader = functionBlock(runtime, "isMoraleImmune");
  const setter = functionBlock(runtime, "setImmune");

  assert.match(reader, /PREDEFINED_EFFECT_KEYS\.MORALE_IMMUNE/);
  assert.doesNotMatch(reader, /tokenMoraleData|\.immune/);
  assert.match(setter, /setActorMoraleImmune/);
  assert.doesNotMatch(setter, /writeTokenMoraleData|TOKEN_FLAG/);
});

test("legacy token immunity migration is version-gated and scene-scoped", () => {
  const runtime = source("scripts/morale/morale.js");
  const migration = functionBlock(runtime, "migrateLegacyTokenMoraleImmunity");
  const settings = source("scripts/libs/feature-settings.js");

  assert.match(migration, /needsMoraleMigration\(getStoredMoraleMigrationVersion\(\)\)/);
  assert.match(migration, /collectionValues\(game\.scenes\)/);
  assert.match(migration, /hasLegacyTokenMoraleImmunityField/);
  assert.match(migration, /withoutLegacyTokenMoraleImmunity/);
  assert.match(migration, /game\.settings\.set\(MODULE_ID, MORALE_MIGRATION_SETTING, MORALE_MIGRATION_VERSION\)/);

  assert.match(settings, /registerSetting\(["']moraleMigrationVersion["']/);
  assert.match(settings, /name:\s*["']Morale Migration Version["']/);
});

test("intentional morale compatibility surfaces remain supported", () => {
  const runtime = source("scripts/morale/morale.js");
  const resolver = source("scripts/encounter-engine/resolver.js");

  assert.match(runtime, /reset:\s*combat\s*=>\s*resetCombat/);
  assert.match(runtime, /\bsetImmune\b/);
  assert.match(runtime, /\bsetLeader\b/);
  assert.match(resolver, /metadata\.moraleImmune\s*===\s*true/);
});
