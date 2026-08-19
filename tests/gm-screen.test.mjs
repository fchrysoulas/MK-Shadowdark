import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const viewModel = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const refactorStylesheet = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

const WORKSPACES = [
  "overview",
  "exploration",
  "combat",
  "resting",
  "downtime",
  "rules",
  "tables",
  "session-log",
];

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
  assert.match(runtime, /openEncounterStagingDialog\(latest\.data/);
  assert.doesNotMatch(runtime, /continueGroupRest\(group\)/);
  assert.doesNotMatch(runtime, /startGroupRest\(group/);
});

test("GM Screen procedure and elapsed pressure values are operational controls", () => {
  assert.match(runtime, /GROUP_PROCEDURE_STATES/);
  assert.match(runtime, /setGroupProcedureState\(group, next/);
  assert.match(runtime, /advanceGroupTime\(group, seconds/);
  assert.match(runtime, /resetGroupTime\(group, procedure/);
  assert.match(runtime, /getExplorationEncounterState\(group\)\.turnSeconds/);
  assert.match(runtime, /REST_TURN_SECONDS/);
  assert.doesNotMatch(runtime, /presentation:\s*true/);
  assert.match(runtime, /bindPressureControls\(this\)/);
  assert.match(runtime, /Change Group procedure/);
  assert.match(runtime, /Advance or reset Group procedure time/);
});

test("GM Screen only offers one-turn advancement where a canonical duration exists", () => {
  assert.match(runtime, /procedure === "exploration"/);
  assert.match(runtime, /procedure === "resting"/);
  assert.match(runtime, /This procedure has no canonical generic turn duration/);
  assert.match(runtime, /Use an explicit custom amount/);
});

test("GM Screen template natively owns the exact eight workspaces in order", () => {
  assert.match(template, /mk-gm-party-rail/);
  assert.match(template, /mk-gm-pressure-strip/);

  let previousIndex = -1;
  for (const workspace of WORKSPACES) {
    const marker = `data-workspace-panel="${workspace}"`;
    const index = template.indexOf(marker);
    assert.ok(index > previousIndex, `${workspace} should appear in canonical order`);
    previousIndex = index;
  }

  assert.doesNotMatch(template, /data-workspace-panel="encounter"/);
  assert.doesNotMatch(template, /data-workspace-panel="environment"/);
  assert.doesNotMatch(template, /configureEnvironment/);
  assert.doesNotMatch(template, /profileName|Active Profile/);
  assert.doesNotMatch(template, /Group Traveling/);
  assert.doesNotMatch(template, /Group Camping/);
  assert.match(template, /data-mk-gm-overview-scene-context/);
  assert.match(template, /Process Due Checks/);
});

test("view model workspace contract matches the native template", () => {
  for (const workspace of WORKSPACES) {
    assert.match(viewModel, new RegExp(`"${workspace.replace("-", "\\-")}"`));
  }
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"encounter"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"environment"/);
});

test("requested workspace active tints remain defined", () => {
  assert.match(refactorStylesheet, /data-workspace="exploration"/);
  assert.match(refactorStylesheet, /data-workspace="combat"/);
  assert.match(refactorStylesheet, /data-workspace="resting"/);
  assert.match(refactorStylesheet, /data-workspace="downtime"/);
});

test("GM Screen exposes the standalone Time Passes dice selector", () => {
  assert.match(template, /data-time-passes-dice/);
  assert.match(template, /<option value="1">1d6<\/option>/);
  assert.match(template, /<option value="2">2d6<\/option>/);
  assert.match(template, /<option value="3">3d6<\/option>/);
  assert.match(template, /data-action="timePasses"/);
  assert.match(runtime, /const rollTimePasses = api\?\.roll \?\? api\?\.timePasses/);
  assert.match(runtime, /rollTimePasses\(\{ diceCount \}\)/);
});

test("Combat display converts Foundry's zero-based turn index to a human-facing number", () => {
  assert.match(viewModel, /hasCurrentTurn \? turnIndex \+ 1 : null/);
  assert.match(template, /\{\{#if combat\.currentCombatant\}\}\{\{combat\.turn\}\}\{\{else\}\}—\{\{\/if\}\}/);
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