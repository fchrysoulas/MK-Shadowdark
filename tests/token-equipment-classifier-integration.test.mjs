import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(ROOT, "scripts/token-equipment-display/token-equipment-display.js"),
  "utf8"
);

test("Token Equipment consumes the shared classifier without a local fallback", () => {
  assert.match(source, /from\s+["']\.\.\/libs\/equipment\.js["']/);
  assert.match(source, /getItemHandUse/);
  assert.doesNotMatch(source, /fallbackHandEntry/);
  assert.doesNotMatch(source, /getEquipmentHandsApi/);
});

test("Token Equipment filters token and item refresh hooks", () => {
  assert.match(source, /Hooks\.on\(["']updateToken["'],\s*\(tokenDocument, changes\)/);
  assert.match(source, /if \(!tokenChangesMayAffectOverlay\(changes\)\) return;/);
  assert.match(source, /Hooks\.on\(["']updateItem["'],\s*\(item, changes\)/);
  assert.match(source, /if \(itemChangesMayAffectOverlay\(changes\)\)/);
});
