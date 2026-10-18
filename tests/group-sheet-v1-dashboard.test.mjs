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
  const groupCss = source("styles/group-sheet.css");
  const css = source("styles/group-sheet-dashboard.css");

  assert.match(groupCss, /\.mk-group-nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(9,\s*minmax\(40px,\s*1fr\)\)/);
  assert.match(groupCss, /\.mk-group-nav \.item\s*\{[\s\S]*?font-size:\s*16px[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /--mk-party-sidebar-width:\s*224px/);
  assert.match(css, /--mk-party-sidebar-collapsed-width:\s*58px/);
  assert.match(css, /\.mk-party-sidebar-header\s*\{[\s\S]*?min-height:\s*43px/);
  assert.match(css, /@container\s*\(max-width:\s*760px\)[\s\S]*?width:\s*196px/);
  assert.match(css, /@container\s*\(max-width:\s*760px\)[\s\S]*?\.mk-group-dashboard-enabled \.mk-group-nav\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /@container\s*\(max-width:\s*560px\)[\s\S]*?font-size:\s*15px/);
  assert.match(css, /@container\s*\(max-width:\s*560px\)[\s\S]*?grid-template-columns:\s*repeat\(9,\s*minmax\(36px,\s*1fr\)/);
});

test("Group Sheet links Bastion actors while their rules remain on the standalone sheet", () => {
  const template = source("templates/group-sheet.hbs");
  const sheet = source("scripts/group-sheet/sheet.js");
  const css = source("styles/group-sheet.css");

  assert.match(template, /data-tab="bastions"/);
  assert.doesNotMatch(template, /Bastion Rules|Bastion Types|Bastion Upgrades/);
  assert.doesNotMatch(sheet, /BASTION_TYPES|BASTION_UPGRADES|mk\.bastions/);
  assert.doesNotMatch(css, /mk-bastions/);
});

test("Warbands follows Hirelings while Boats and Bastion retain their order, with drops on headers and tab bodies", () => {
  const template = source("templates/group-sheet.hbs");
  const nav = template.match(/<nav class="mk-group-nav[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]), [
    "summary", "traveling", "camping", "inventory", "hirelings", "warbands", "mounts", "boats", "bastions",
  ]);
  for (const kind of ["warbands", "boats", "bastions"]) {
    assert.match(nav, new RegExp(`data-tab="${kind}" data-group-actor-kind="${kind}"`));
    assert.match(template, new RegExp(`<div class="tab mk-group-tab mk-group-tab-body"[^>]*data-tab="${kind}" data-group-actor-kind="${kind}"`));
  }
});

test("all Group Sheet tabs are icon-only with accessible hover labels and Summary opens first", () => {
  const template = source("templates/group-sheet.hbs");
  const nav = template.match(/<nav class="mk-group-nav[\s\S]*?<\/nav>/)[0];
  const tabs = [...nav.matchAll(/<a\b([^>]+)>([\s\S]*?)<\/a>/g)];
  assert.equal(tabs.length, 9);
  for (const [, attributes, content] of tabs) {
    const label = attributes.match(/data-tooltip="([^"]+)"/)[1];
    assert.ok(attributes.includes(`aria-label="${label}"`));
    assert.match(attributes, /tabindex="0"/);
    assert.match(content, /<i[^>]+aria-hidden="true"/);
    assert.equal(content.replace(/<[^>]+>/g, "").trim(), "");
  }
  assert.match(source("scripts/group-sheet/sheet.js"), /initial:\s*"summary"/);
  assert.match(template, /class="tab mk-group-tab mk-group-tab-body active"[^>]*data-tab="summary"/);
});

test("Summary shows treasure and weekly payroll without resource totals, roster or shared inventory", () => {
  const template = source("templates/group-sheet.hbs");
  const summary = template.slice(template.indexOf('data-tab="summary">'), template.indexOf('<div class="tab mk-group-tab mk-group-tab-body" data-group="primary" data-tab="traveling">'));
  assert.match(summary, /Party Treasure/);
  assert.match(summary, /Hireling Salaries/);
  assert.match(summary, /Warband Wages/);
  assert.match(summary, /Total Wages &amp; Salaries/);
  assert.match(summary, /Some warband wages are unavailable/);
  assert.doesNotMatch(summary, /Shared Carrying Capacity|Rations|Torches|mk\.campingResources|mk\.inventory\.slots|mk\.members|mk\.inventory\.items/);
});
