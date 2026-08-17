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

test("Group Sheet uses the complete v1.6.0 command dashboard", () => {
  const entry = source("scripts/group-sheet/group-sheet.js");
  const layout = source("scripts/group-sheet/dashboard-layout.js");

  assert.match(entry, /import\s+["']\.\/dashboard-layout\.js["']/);
  assert.equal(fs.existsSync(path.join(GROUP_DIR, "dashboard-behavior.js")), false);
  assert.match(layout, /function\s+createSidebarHeader\(/);
  assert.match(layout, /function\s+createMemberSummary\(/);
  assert.match(layout, /function\s+createSidebar\(/);
  assert.match(layout, /function\s+applyDashboardLayout\(/);
  assert.match(layout, /\bforwardClick\b/);
  assert.match(layout, /mk-group-command-dashboard/);
});

test("v1.6.0 dashboard retains its Party rail controls and member functionality", () => {
  const layout = source("scripts/group-sheet/dashboard-layout.js");
  const sheet = source("scripts/group-sheet/sheet.js");

  assert.match(layout, /mk-party-sidebar-collapse/);
  assert.match(layout, /fa-angles-right/);
  assert.match(layout, /app\._setPartyMemberActive\(uuid,\s*!isActivePartyMember\)/);
  assert.match(layout, /app\._removeGroupMember\(uuid,\s*\{\s*confirm:\s*true\s*\}\)/);
  assert.match(layout, /app\._campingDragActorUuid\s*=\s*uuid/);
  assert.match(layout, /data-action='roll-ability'/);
  assert.match(sheet, /\[data-party-member-dropzone='true'\]/);
});

test("v1.6.0 dashboard structure keeps Active Torches below the workspace", () => {
  const template = source("templates/group-sheet.hbs");
  const layout = source("scripts/group-sheet/dashboard-layout.js");
  const css = source("styles/group-sheet-dashboard.css");

  assert.match(template, /class=["']mk-group-member-source["']\s+aria-hidden=["']true["']/);
  assert.ok(template.indexOf("class=\"mk-active-torches\"") < template.indexOf("class=\"mk-group-nav"));
  assert.match(layout, /header\.insertAdjacentElement\(["']afterend["'],\s*dashboard\)/);
  assert.match(css, /\.mk-group-member-source\s*\{\s*display:\s*none;/);
  assert.match(css, /\.mk-group-command-dashboard\s*\{[\s\S]*?grid-template-columns:\s*var\(--mk-party-sidebar-width\)/);
  assert.match(css, /\.mk-group-workspace\s*\{[\s\S]*?flex-direction:\s*column/);
});

test("v1.6.0 visual proportions and responsive behavior are preserved", () => {
  const css = source("styles/group-sheet-dashboard.css");

  assert.match(css, /--mk-party-sidebar-width:\s*224px/);
  assert.match(css, /--mk-party-sidebar-collapsed-width:\s*58px/);
  assert.match(css, /\.mk-party-sidebar-header\s*\{[\s\S]*?min-height:\s*43px/);
  assert.match(css, /@container\s*\(max-width:\s*760px\)[\s\S]*?width:\s*196px/);
  assert.match(css, /@container\s*\(max-width:\s*560px\)[\s\S]*?font-size:\s*0/);
});
