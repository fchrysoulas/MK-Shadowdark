import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const refactor = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const core = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");

test("Active Party rail is compacted without reintroducing hide/collapse controls", () => {
  assert.match(refactor, /\.mk-gm-screen-layout\s*\{[\s\S]*grid-template-columns: 225px minmax\(0, 1fr\)/);
  assert.match(refactor, /\.mk-gm-party-member\s*\{[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\)/);
  assert.match(refactor, /\.mk-gm-member-open\s*\{[\s\S]*width: 40px !important;[\s\S]*height: 40px/);
  assert.doesNotMatch(template, /Hide Active Party|Show Active Party|togglePartyRail/);
  assert.doesNotMatch(core, /display:\s*none[^}]*mk-gm-party-rail/);
});

test("compact rail preserves critical character information in the template", () => {
  assert.match(template, /HP <strong>\{\{hp\}\}\/\{\{hpMax\}\}<\/strong>/);
  assert.match(template, /AC <strong>\{\{ac\}\}<\/strong>/);
  assert.match(template, /\{\{#if dead\}\}/);
  assert.match(template, /deathTimer\.active/);
  assert.match(template, /wounds\.total/);
  assert.match(template, /focus\.total/);
  assert.match(template, /light\.total/);
  assert.match(template, /effectCount/);
  assert.match(template, /data-action="inspectMember"/);
});
