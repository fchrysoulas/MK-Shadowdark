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

function groupJavaScript() {
  return fs.readdirSync(GROUP_DIR)
    .filter(file => file.endsWith(".js"))
    .map(file => source(`scripts/group-sheet/${file}`))
    .join("\n");
}

test("Group dashboard no longer reconstructs a second member DOM", () => {
  const entry = source("scripts/group-sheet/group-sheet.js");
  const runtime = groupJavaScript();

  assert.match(entry, /import\s+["']\.\/dashboard-behavior\.js["']/);
  assert.doesNotMatch(entry, /dashboard-layout/);
  assert.equal(fs.existsSync(path.join(GROUP_DIR, "dashboard-layout.js")), false);

  assert.doesNotMatch(runtime, /\bforwardClick\b/);
  assert.doesNotMatch(runtime, /\bfindOriginalAction\b/);
  assert.doesNotMatch(runtime, /\bextractStat\b/);
  assert.doesNotMatch(runtime, /new\s+MouseEvent\s*\(/);
});

test("template-rendered member cards are the canonical Party rail", () => {
  const template = source("templates/group-sheet.hbs");
  const css = source("styles/group-sheet-dashboard.css");
  const behavior = source("scripts/group-sheet/dashboard-behavior.js");

  assert.match(template, /class=["']mk-group-member-source["']/);
  assert.match(template, /\{\{#each mk\.members\}\}/);
  assert.match(template, /data-member-uuid=["']\{\{uuid\}\}["']/);
  assert.match(template, /data-action=["']open-member["']/);
  assert.match(template, /data-action=["']roll-ability["']/);

  assert.match(css, />\s*\.mk-group-member-source\s*\{[\s\S]*?display:\s*flex/u);
  assert.doesNotMatch(css, /\.mk-group-member-source\s*\{[^}]*display:\s*none/u);
  assert.match(behavior, /sidebar\.removeAttribute\(["']aria-hidden["']\)/);
  assert.match(behavior, /sidebar\.dataset\.partyMemberDropzone\s*=\s*["']true["']/);
});

test("native Party rail preserves direct member actions and UI state", () => {
  const behavior = source("scripts/group-sheet/dashboard-behavior.js");
  const sheet = source("scripts/group-sheet/sheet.js");

  assert.match(behavior, /app\._setPartyMemberActive\(uuid,\s*!active\)/);
  assert.match(behavior, /app\._removeGroupMember\(uuid,\s*\{\s*confirm:\s*true\s*\}\)/);
  assert.match(behavior, /expandedMemberByGroup/);
  assert.match(behavior, /groupDashboard\.sidebarCollapsed/);
  assert.match(behavior, /app\._campingDragActorUuid\s*=\s*card\.dataset\.memberUuid/);

  assert.match(sheet, /closest\(\s*["']\[data-party-member-dropzone='true'\]["']\s*\)/);
  assert.match(sheet, /async\s+_setPartyMemberActive\(/);
  assert.match(sheet, /async\s+_removeGroupMember\(/);
});
