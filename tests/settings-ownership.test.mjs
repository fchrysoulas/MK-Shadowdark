import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPTS_ROOT = path.join(ROOT, "scripts");
const ALLOWED_REGISTRATION_FILES = new Set([
  "scripts/libs/settings.js",
  "scripts/libs/feature-settings.js"
]);

function walkJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScriptFiles(absolute);
    return entry.isFile() && entry.name.endsWith(".js") ? [absolute] : [];
  });
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

test("normal module settings are registered only by the shared settings subsystem", () => {
  const offenders = [];

  for (const file of walkJavaScriptFiles(SCRIPTS_ROOT)) {
    const name = relative(file);
    if (ALLOWED_REGISTRATION_FILES.has(name)) continue;

    const source = fs.readFileSync(file, "utf8");
    if (source.includes("game.settings.register(") || source.includes("game.settings.registerMenu(")) {
      offenders.push(name);
    }
  }

  assert.deepEqual(offenders, []);
});

test("shared feature settings load before their runtime consumers", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
  const modules = manifest.esmodules ?? [];
  const registryIndex = modules.indexOf("scripts/libs/feature-settings.js");
  assert.ok(registryIndex >= 0, "feature-settings.js must be loaded by module.json");

  for (const consumer of [
    "scripts/detailed-wounds/detailed-wounds.js",
    "scripts/corpse-token/corpse-token.js",
    "scripts/initiative/initiative.js",
    "scripts/morale/morale.js",
    "scripts/encounter-engine/encounter-engine.js"
  ]) {
    const consumerIndex = modules.indexOf(consumer);
    assert.ok(consumerIndex >= 0, `${consumer} must be loaded by module.json`);
    assert.ok(registryIndex < consumerIndex, `shared settings must load before ${consumer}`);
  }
});

test("shared feature registry owns all migrated setting keys", () => {
  const source = fs.readFileSync(path.join(ROOT, "scripts/libs/feature-settings.js"), "utf8");
  for (const key of [
    "detailedWoundsEnabled",
    "detailedWoundsMigrationVersion",
    "initiativeGroupEnemies",
    "initiativeDebug",
    "moraleEnabled",
    "moraleVisibility",
    "moraleTokenHudControls",
    "moraleDebug",
    "moraleMigrationVersion",
    "corpseTokenEnabled",
    "corpseTokenImage",
    "corpseTokenMigrationVersion",
    "encounterEngineEnabled",
    "encounterEngineProfiles"
  ]) {
    assert.match(source, new RegExp(`\\"${key}\\"`));
  }
});
