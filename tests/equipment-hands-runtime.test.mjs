import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Equipment Hands keeps transient state in WeakMaps", () => {
  const runtime = source("scripts/equipment-hands/equipment-hands.js");

  assert.match(runtime, /const\s+lastWarningSignatures\s*=\s*new\s+WeakMap\(\)/);
  assert.match(runtime, /const\s+actorCheckTimeouts\s*=\s*new\s+WeakMap\(\)/);
  assert.doesNotMatch(runtime, /__mkEquipmentHands/);
});

test("Equipment Hands no longer uses actor-level update fallbacks", () => {
  const runtime = source("scripts/equipment-hands/equipment-hands.js");

  assert.doesNotMatch(runtime, /Hooks\.on\(["']updateActor["']/);
  assert.match(runtime, /Hooks\.on\(["']preUpdateItem["']/);
  assert.match(runtime, /Hooks\.on\(["']updateItem["']/);
  assert.match(runtime, /onCharacterSheetRender\(["']Equipment Hands["']/);
});

test("shared equipment detection does not serialize arbitrary updates", () => {
  const shared = source("scripts/libs/equipment.js");

  assert.doesNotMatch(shared, /JSON\.stringify\s*\(\s*changes\s*\)/);
  assert.match(shared, /EQUIPMENT_CLASSIFICATION_PATHS/);
});
