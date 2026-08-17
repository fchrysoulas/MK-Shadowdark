import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUP_DIR = path.join(ROOT, "scripts/group-sheet");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Group Sheet JavaScript API uses MKGroupSheet", () => {
  const sheet = source("scripts/group-sheet/sheet.js");
  const registration = source("scripts/group-sheet/registration.js");
  const entry = source("scripts/group-sheet/group-sheet.js");

  assert.match(sheet, /class\s+MKGroupSheet\s+extends\s+ActorSheetBase/);
  assert.match(sheet, /export\s*\{[\s\S]*MKGroupSheet[\s\S]*\}/);
  assert.match(registration, /import\s*\{[^}]*MKGroupSheet[^}]*\}\s*from\s*["']\.\/sheet\.js["']/);
  assert.match(registration, /instanceof\s+MKGroupSheet/);
  assert.match(registration, /registerSheet\(MODULE_ID,\s*MKGroupSheet,/);
  assert.match(entry, /export\s*\{[^}]*MKGroupSheet[^}]*\}\s*from\s*["']\.\/sheet\.js["']/);

  assert.doesNotMatch(sheet, /\bSDXGroupSheet\b/);
  assert.doesNotMatch(registration, /\bSDXGroupSheet\b/);
  assert.doesNotMatch(entry, /\bSDXGroupSheet\b/);
});

test("persisted Group Sheet ID remains compatible with existing actors", () => {
  const constants = source("scripts/group-sheet/constants.js");
  assert.match(constants, /SHEET_ID\s*=\s*`\$\{MODULE_ID\}\.SDXGroupSheet`/);
  assert.doesNotMatch(constants, /SHEET_ID\s*=.*MKGroupSheet/);
});

test("legacy render-hook alias remains available during the class rename", () => {
  const layout = source("scripts/group-sheet/dashboard-layout.js");
  assert.match(layout, /Hooks\.on\(["']renderActorSheet["'],\s*onRenderGroupSheet\)/);
  assert.match(layout, /Hooks\.on\(["']renderMKGroupSheet["'],\s*onRenderGroupSheet\)/);
  assert.match(layout, /Hooks\.on\(["']renderSDXGroupSheet["'],\s*onRenderGroupSheet\)/);
});

test("Group Sheet implementation file set remains present", () => {
  assert.equal(fs.existsSync(GROUP_DIR), true);
  for (const file of ["sheet.js", "registration.js", "group-sheet.js", "constants.js", "dashboard-layout.js"]) {
    assert.equal(fs.existsSync(path.join(GROUP_DIR, file)), true, `${file} should exist`);
  }
  assert.equal(fs.existsSync(path.join(GROUP_DIR, "dashboard-behavior.js")), false);
});
