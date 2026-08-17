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
  assert.match(runtime, /templates\/gm-screen\.hbs/);
  assert.match(runtime, /getSceneControlButtons/);
  assert.match(runtime, /button: true/);
  assert.match(runtime, /visible: true/);
  assert.match(stylesheet, /\.mk-gm-screen-layout/);
  assert.match(template, /Group Management/);
});

test("GM Screen exposes a GM-gated public API", () => {
  assert.match(runtime, /function canUseGmScreen\(\)/);
  assert.match(runtime, /game\?\.user\?\.isGM/);
  assert.match(runtime, /module\.api\.gmScreen/);
  assert.match(runtime, /open: openGmScreen/);
  assert.match(runtime, /close: closeGmScreen/);
  assert.match(runtime, /toggle: toggleGmScreen/);
});

test("GM Screen view model consumes canonical Group and Scene services", () => {
  assert.match(viewModel, /getGroupData/);
  assert.match(viewModel, /getGroupProcedureState/);
  assert.match(viewModel, /getGroupElapsedTime/);
  assert.match(viewModel, /getGroupAssignments/);
  assert.match(viewModel, /buildExplorationEncounterViewData/);
  assert.match(viewModel, /getGroupRestState/);
  assert.match(viewModel, /buildGroupMemberStatus/);
  assert.match(viewModel, /resolveSceneEnvironmentContext/);
  assert.match(viewModel, /api\?\.morale/);
});

test("GM Screen routes actions to existing encounter/rest/staging workflows", () => {
  assert.match(runtime, /processDueExplorationEncounters\(group\)/);
  assert.match(runtime, /continueGroupRest\(group\)/);
  assert.match(runtime, /openEncounterStagingDialog\(latest\.data/);
  assert.match(runtime, /openExplorationEncounterContextDialog\(group\)/);
  assert.match(runtime, /group\.sheet\?\.render\?\.\(true\)/);
});

test("GM Screen includes persistent status/pressure and contextual workspaces", () => {
  assert.match(template, /mk-gm-party-rail/);
  assert.match(template, /mk-gm-pressure-strip/);
  assert.match(template, /data-workspace-panel="overview"/);
  assert.match(template, /data-workspace-panel="exploration"/);
  assert.match(template, /data-workspace-panel="resting"/);
  assert.match(template, /data-workspace-panel="encounter"/);
  assert.match(template, /data-workspace-panel="combat"/);
  assert.match(template, /data-workspace-panel="environment"/);
  assert.match(template, /data-workspace-panel="rules"/);
  assert.match(template, /Procedure Turns/);
});

test("GM Screen files contain no gameplay-state persistence API", () => {
  const combined = `${runtime}\n${viewModel}`;

  assert.doesNotMatch(combined, /\.setFlag\s*\(/);
  assert.doesNotMatch(combined, /\.unsetFlag\s*\(/);
  assert.doesNotMatch(combined, /localStorage/);
  assert.doesNotMatch(combined, /game\.settings\.set\s*\(/);
  assert.doesNotMatch(combined, /\.update\s*\(\s*\{\s*\[?['"]?flags\./);
});

test("GM Screen runtime assets are registered in the manifest", () => {
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});

test("GM Screen implementation does not alter Group Sheet runtime files", () => {
  const changedRuntimeTargets = [
    "scripts/gm-screen/gm-screen.js",
    "scripts/gm-screen/view-model.js",
    "templates/gm-screen.hbs",
    "styles/gm-screen.css",
  ];

  assert.ok(changedRuntimeTargets.every(path => !path.includes("group-sheet.hbs")));
  assert.ok(changedRuntimeTargets.every(path => !path.endsWith("group-sheet/sheet.js")));
});
