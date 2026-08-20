import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const viewModel = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const topContext = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const overviewLinks = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const refactorStylesheet = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const tools = fs.readFileSync(new URL("../scripts/gm-screen/tools-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

const WORKSPACES = [
  "overview",
  "exploration",
  "combat",
  "downtime",
  "tables",
  "tools",
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

test("Procedure and Elapsed are operational direct controls", () => {
  assert.match(runtime, /GROUP_PROCEDURE_STATES/);
  assert.match(runtime, /setGroupProcedureState\(group, next/);
  assert.match(runtime, /installProcedureSelector\(procedure/);
  assert.match(runtime, /select\.addEventListener\("change"/);
  assert.match(runtime, /actionAdvanceOneTurn/);
  assert.match(runtime, /advanceGroupTime\(group, seconds/);
  assert.match(runtime, /getExplorationEncounterState\(group\)\.turnSeconds/);
  assert.match(runtime, /REST_TURN_SECONDS/);
  assert.match(runtime, /COMBAT_TURN_SECONDS = 6/);
  assert.match(runtime, /fa-forward-step/);
  assert.doesNotMatch(runtime, /actionTimeControls|Advance Custom|timeAmount|timeUnit/);
  assert.doesNotMatch(runtime, /resetGroupTime/);
});

test("GM Screen cannot manually enter or exit the canonical Resting workflow", () => {
  assert.match(runtime, /GM_SCREEN_MANUAL_PROCEDURE_STATES = Object\.freeze\([\s\S]*filter\(state => state !== "resting"\)/);
  assert.match(runtime, /if \(next === "resting"\)/);
  assert.match(runtime, /Resting is controlled by the Group rest workflow/);
  assert.match(runtime, /if \(current === "resting"\)/);
  assert.match(runtime, /Finish or resolve the active Group rest before changing procedure/);
  assert.match(runtime, /const restingActive = value === "resting"/);
  assert.match(runtime, /const states = restingActive \? \["resting"\] : GM_SCREEN_MANUAL_PROCEDURE_STATES/);
  assert.match(runtime, /select\.disabled = disabled \|\| restingActive/);
});

test("one-turn advancement is 6m Exploration, 1h actual Resting, and 6s Combat", () => {
  assert.match(runtime, /procedure === "exploration"/);
  assert.match(runtime, /procedure === "resting"/);
  assert.match(runtime, /procedure === "combat"/);
  assert.match(runtime, /if \(procedure === "combat"\) return COMBAT_TURN_SECONDS/);
  assert.match(viewModel, /return `\$\{minuteLabel\}m`/);
  assert.doesNotMatch(viewModel, /return `\$\{total\}s`/);
});

test("GM Screen owns the exact seven workspaces in order", () => {
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
  assert.doesNotMatch(template, /data-workspace-panel="rules"/);
  assert.doesNotMatch(template, /data-workspace-panel="resting"/);
  assert.match(template, /<i class="fas \{\{icon\}\}" aria-hidden="true"><\/i><span>/);
  assert.doesNotMatch(template, /configureEnvironment/);
  assert.doesNotMatch(template, /profileName|Active Profile/);
  assert.doesNotMatch(template, /Group Traveling/);
  assert.doesNotMatch(template, /Group Camping/);
  assert.match(template, /Process Due Checks/);
  assert.match(template, /data-mk-gm-tools-panel/);
});

test("Overview combines canonical home summary, document shortcuts, and top Scene Context autosave", () => {
  assert.match(overviewLinks, /const summary = await buildOverviewSummary\(application\)/);
  assert.match(overviewLinks, /overview\.innerHTML = overviewShellHtml\(summary\)/);
  assert.match(overviewLinks, /data-mk-overview-shortcuts/);
  assert.doesNotMatch(overviewLinks, /Encounter Pressure|Combat \/ Morale|Resting/);
  assert.match(topContext, /pressureCell\(root, "Terrain"\)/);
  assert.match(topContext, /pressureCell\(root, "Danger"\)/);
  assert.match(topContext, /pressureCell\(root, "Period"\)/);
  assert.match(topContext, /bindTopContextAutosave/);
  assert.doesNotMatch(topContext, /Save Context|data-mk-context-save/);
});

test("Exploration focuses on actionable procedure pressure instead of repeating top context", () => {
  const start = template.indexOf('data-workspace-panel="exploration"');
  const end = template.indexOf('data-workspace-panel="combat"');
  const exploration = template.slice(start, end);
  assert.match(exploration, />Turns</);
  assert.match(exploration, />Next Check</);
  assert.match(exploration, />Due</);
  assert.match(exploration, />Encounter Table</);
  assert.match(exploration, /Process Due Checks/);
  assert.match(exploration, /Safe: encounter checks are disabled/);
  assert.doesNotMatch(exploration, />Terrain</);
  assert.doesNotMatch(exploration, />Danger</);
  assert.doesNotMatch(exploration, />Period</);
  assert.doesNotMatch(exploration, />Turn Length</);
  assert.doesNotMatch(exploration, />Cadence</);
});

test("visible Downtime workspace is renamed Settlement without changing the internal workspace id", () => {
  const start = template.indexOf('data-workspace-panel="downtime"');
  const end = template.indexOf('data-workspace-panel="tables"');
  const settlement = template.slice(start, end);
  assert.match(settlement, />Settlement</);
  assert.match(settlement, /Settlement-facing generators and tools/);
  assert.doesNotMatch(settlement, /Resting \/ Camp|Checks Left|Stage Latest Encounter/);
  assert.match(template, /eq id "downtime"/);
  assert.match(template, /Settlement\{\{else\}\}\{\{label\}\}/);
});

test("view model workspace contract keeps downtime as the compatibility id", () => {
  for (const workspace of WORKSPACES) {
    assert.match(viewModel, new RegExp(`"${workspace.replace("-", "\\-")}"`));
  }
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"encounter"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"environment"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"rules"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"resting"/);
  assert.match(viewModel, /GM_SCREEN_WORKSPACE_ICONS/);
  assert.match(viewModel, /rawWorkspace === "resting" \? "downtime"/);
});

test("requested workspace active tints remain defined", () => {
  assert.match(refactorStylesheet, /data-workspace="exploration"/);
  assert.match(refactorStylesheet, /data-workspace="combat"/);
  assert.match(refactorStylesheet, /data-workspace="downtime"/);
  assert.match(refactorStylesheet, /data-workspace="tools"/);
});

test("GM Screen exposes a wider standalone Time Passes dice selector", () => {
  assert.match(template, /data-time-passes-dice/);
  assert.match(template, /<option value="1">1d6<\/option>/);
  assert.match(template, /<option value="2">2d6<\/option>/);
  assert.match(template, /<option value="3">3d6<\/option>/);
  assert.match(template, /data-action="timePasses"/);
  assert.match(runtime, /const rollTimePasses = api\?\.roll \?\? api\?\.timePasses/);
  assert.match(runtime, /rollTimePasses\(\{ diceCount \}\)/);
  assert.match(refactorStylesheet, /\.mk-gm-time-passes select[\s\S]*width: 82px/);
});

test("Tools exposes hidden state inline and keeps only true actions as buttons", () => {
  for (const label of [
    "Scene / Encounter Context",
    "Encounter Procedures",
    "Active Light Sources",
    "Group Assignments",
    "Rest Schedule",
    "Morale State",
    "Encounter Setup",
    "Import Source Tables",
  ]) {
    assert.match(tools, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(tools, /<details class="mk-gm-tool-section"/);
  assert.match(tools, /<summary>/);
  assert.match(tools, /mk-gm-tools-sections/);
  assert.match(tools, /mk-gm-tools-actions/);
  assert.doesNotMatch(tools, /waitForGmDialog|showInspector/);
  assert.match(tools, /Read-only here/);
  assert.match(refactorStylesheet, /\.mk-gm-tool-section/);
  assert.match(refactorStylesheet, /\.mk-gm-tools-actions/);
});

test("Combat display converts Foundry's zero-based turn index to a human-facing number", () => {
  assert.match(viewModel, /hasCurrentTurn \? turnIndex \+ 1 : null/);
  assert.match(template, /\{\{#if combat\.currentCombatant\}\}\{\{combat\.turn\}\}\{\{else\}\}—\{\{\/if\}\}/);
});

test("GM Screen core does not persist duplicate gameplay state", () => {
  const combined = `${runtime}\n${viewModel}`;
  assert.doesNotMatch(combined, /\.setFlag\s*\(/);
  assert.doesNotMatch(combined, /\.unsetFlag\s*\(/);
  assert.doesNotMatch(combined, /localStorage/);
  assert.doesNotMatch(combined, /game\.settings\.set\s*\(/);
});

test("retired presentation buttons are not loaded", () => {
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-controls.js"));
  assert.ok(!manifest.styles.includes("styles/gm-screen-presentation.css"));
});

test("GM Screen runtime assets are loaded independently from Group Sheet", () => {
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"));
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/top-context-controls.js"));
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/overview-links.js"));
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/tools-controls.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen.css"));
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/source-table-browser.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-source-tables.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/quick-rules.js"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});