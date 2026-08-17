import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PATH = "scripts/libs/predefined-effects.js";

function walkJavaScript(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(fullPath);
    return entry.isFile() && entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

test("predefined effect IDs and keys are exported from the shared registry", async () => {
  const originalHooks = globalThis.Hooks;
  globalThis.Hooks = { on() {}, once() {} };

  try {
    const moduleUrl = `${pathToFileURL(path.join(ROOT, REGISTRY_PATH)).href}?registry-test=${Date.now()}`;
    const { PREDEFINED_EFFECT_IDS, PREDEFINED_EFFECT_KEYS } = await import(moduleUrl);

    assert.deepEqual(PREDEFINED_EFFECT_IDS, {
      ONLY_MAGICAL_DAMAGE_SOURCES: "onlyMagicalDamageSources",
      MAGICAL_ATTACKS: "magicalAttacks",
      TARGETED_SPELL_DC: "targetedSpellDc",
      MORALE_IMMUNE: "moraleImmune"
    });

    assert.deepEqual(PREDEFINED_EFFECT_KEYS, {
      ONLY_MAGICAL_DAMAGE_SOURCES: "system.damage.immunity.nonmagical",
      MAGICAL_ATTACKS: "system.damage.source.magical",
      TARGETED_SPELL_DC: "system.roll.spell.dc",
      MORALE_IMMUNE: "flags.mk-shadowdark.encounter.moraleImmune"
    });
  } finally {
    if (originalHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = originalHooks;
  }
});

test("predefined effect key paths are declared only by the shared registry", () => {
  const needles = [
    "system.damage.immunity.nonmagical",
    "system.damage.source.magical",
    "system.roll.spell.dc",
    "encounter.moraleImmune"
  ];
  const offenders = [];

  for (const file of walkJavaScript(path.join(ROOT, "scripts"))) {
    const relativePath = path.relative(ROOT, file).replaceAll("\\", "/");
    if (relativePath === REGISTRY_PATH) continue;

    const source = fs.readFileSync(file, "utf8");
    for (const needle of needles) {
      if (source.includes(needle)) offenders.push(`${relativePath}: ${needle}`);
    }
  }

  assert.deepEqual(offenders, []);
});

test("effect consumers import the shared registry", () => {
  for (const relativePath of [
    "scripts/auto-damage/damage-traits.js",
    "scripts/targeted-spell-dc/targeted-spell-dc.js",
    "scripts/morale/morale.js"
  ]) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
    assert.match(source, /PREDEFINED_EFFECT_KEYS/);
    assert.match(source, /from\s+["']\.\.\/libs\/predefined-effects\.js["']/);
  }
});
