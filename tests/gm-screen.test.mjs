import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const viewModel = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen is a separate ApplicationV2 surface", () => {
  assert.match(runtime, /HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(runtime, /class MKGMscreen extends ApplicationBase/);
  assert.match(runtime, /getSceneControlButtons/);
  assert.match(runtime, /module\.api\.gmScreen/);
  assert.match(template, /Group Management/);
  assert.match(stylesheet, /\.mk-gm-screen-layout/);
});

test("GM Screen is GM-gated and has a supported toggle entry point", () => {
  assert.match(runtime, /game\?\.user\?\.isGM/);
  assert.match(runtime, /toggle: toggleGmScreen/);
  assert.match(runtime, /button: true/);
  assert.match(runtime, /visible: true/);
});

test("GM Screen consumes canonical Group, Scene, encounter, and morale services", () => {
  assert.match(viewModel, /getGroupData/);
  assert.match(viewModel, /getGroupProcedureState/);
  assert.match(viewModel, /getGroupElapsedTime/);
  assert.match(viewModel, /getGroupAssignments/);
  assert.match(viewModel, /buildExplorationEncounterViewData/);
  assert.match(viewModel, /getGroupRestState/);
  assert.match(viewModel, /buildGroupMemberStatus/);
  assert.match(viewModel, /resolveSceneEnvironmentContext/);
  assert.match(viewModel, /api\?\.morale/);

  assert.match(runtime, /processDueExplorationEncounters\(group\)/);
  assert.match(runtime, /continueGroupRest\(group\)/);
  assert.match(runtime, /openEncounterStagingDialog\(latest\.data/);
});

test("GM Screen has party, pressure, and contextual workspaces", () => {
  assert.match(template, /mk-gm-party-rail/);
  assert.match(template, /mk-gm-pressure-strip/);
  for (const workspace of ["overview", "exploration", "resting", "encounter", "combat", "environment", "rules"]) {
    assert.match(template, new RegExp(`data-workspace-panel=["']${workspace}["']`));
  }
});

test("GM Screen does not persist duplicate gameplay state", () => {
  const combined = `${runtime}\n${viewModel}`;
  assert.doesNotMatch(combined, /\.setFlag\s*\(/);
  assert.doesNotMatch(combined, /\.unsetFlag\s*\(/);
  assert.doesNotMatch(combined, /localStorage/);
  assert.doesNotMatch(combined, /game\.settings\.set\s*\(/);
});

test("GM Screen runtime assets are loaded independently from Group Sheet", () => {
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});
