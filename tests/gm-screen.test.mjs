import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const viewModel = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const topContext = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const overviewLinks = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const sessionTools = fs.readFileSync(new URL("../scripts/gm-screen/session-tools.js", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../scripts/libs/settings.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const sessionToolsStylesheet = fs.readFileSync(new URL("../styles/gm-screen-session-tools.css", import.meta.url), "utf8");
const refactorStylesheet = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

const WORKSPACES = [
  "overview",
  "exploration",
  "downtime",
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

test("GM Screen consumes canonical Group, Scene, and rest services", () => {
  assert.match(viewModel, /getGroupData/);
  assert.match(viewModel, /getGroupProcedureState/);
  assert.match(viewModel, /getGroupElapsedTime/);
  assert.match(viewModel, /getGroupAssignments/);
  assert.match(viewModel, /getGroupRestState/);
  assert.match(viewModel, /buildGroupMemberStatus/);
  assert.match(viewModel, /resolveSceneEnvironmentContext/);
  assert.doesNotMatch(runtime, /processDueExplorationEncounters/);
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

test("GM Screen owns the exact five workspaces in order", () => {
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
  assert.doesNotMatch(template, /data-workspace-panel="tools"/);
  assert.doesNotMatch(viewModel, /\"tools\"/);
  assert.doesNotMatch(template, /Process Due Checks|Process Encounter Checks/);
});

test("Overview provides document shortcuts and top Scene Context autosave", () => {
  assert.match(overviewLinks, /overview\.innerHTML = overviewShellHtml\(\)/);
  assert.doesNotMatch(overviewLinks, /mk-gm-overview-summary|buildOverviewSummary|overviewSummaryHtml/);
  assert.match(overviewLinks, /data-mk-overview-shortcuts/);
  assert.doesNotMatch(overviewLinks, /Encounter Pressure|Combat \/ Morale|Resting/);
  assert.match(topContext, /pressureCell\(root, "Terrain"\)/);
  assert.match(topContext, /pressureCell\(root, "Danger"\)/);
  assert.match(topContext, /pressureCell\(root, "Period"\)/);
  assert.match(topContext, /bindTopContextAutosave/);
  assert.doesNotMatch(topContext, /Save Context|data-mk-context-save/);
});

test("Encounters is an editable Encounter Zone workspace with detail RollTable slots", () => {
  const start = template.indexOf('data-workspace-panel="exploration"');
  const end = template.indexOf('data-workspace-panel="downtime"');
  const exploration = template.slice(start, end);
  assert.match(exploration, /data-mk-exploration-zone-grid/);
  assert.match(exploration, /<span>Encounters<\/span>/);
  assert.match(exploration, /data-mk-encounter-auxiliary-tables/);
  assert.doesNotMatch(exploration, />Turns</);
  assert.doesNotMatch(exploration, />Next Check</);
  assert.doesNotMatch(exploration, />Due</);
  assert.doesNotMatch(exploration, /Encounter Table|Latest Check/);
  assert.doesNotMatch(exploration, /Process Due Checks|Process Encounter Checks/);
  assert.doesNotMatch(exploration, /Safe: encounter checks are disabled/);
  assert.doesNotMatch(exploration, />Terrain</);
  assert.doesNotMatch(exploration, />Danger</);
  assert.doesNotMatch(exploration, />Period</);
  assert.doesNotMatch(exploration, />Turn Length</);
  assert.doesNotMatch(exploration, />Cadence</);
});

test("GM Screen encounter roll details are controlled by a disabled-by-default debug setting", () => {
  assert.match(settings, /registerSetting\("gmScreenEncounterDebug",/);
  assert.match(settings, /name: "GM Screen \| Encounter Roll Debug Mode"/);
  assert.match(settings, /hint: "When enabled, Roll Zone Journal pages show dice formulas and roll totals\./);
  const settingStart = settings.indexOf('registerSetting("gmScreenEncounterDebug"');
  const settingBlock = settings.slice(settingStart, settings.indexOf("});", settingStart));
  assert.match(settingBlock, /default: false/);
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
  assert.match(refactorStylesheet, /data-workspace="downtime"/);
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

test("Combat remains outside the GM Screen workspace navigation", () => {
  assert.doesNotMatch(template, /data-workspace-panel="combat"/);
  assert.doesNotMatch(template, /data-action="openCombat"/);
  assert.match(viewModel, /function buildCombatView/);
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

test("GM Screen runtime assets are loaded for the production surface", () => {
  const gmScreenEntries = manifest.esmodules.filter(entry => entry.startsWith("scripts/gm-screen/"));
  const gmScreenStyles = manifest.styles.filter(entry => entry.startsWith("styles/gm-screen"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/gm-screen.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/exploration-zone-grid.js"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-exploration.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});

test("Encounter bar control replaces the Light pressure cell", () => {
  assert.match(topContext, /installEncounterRollControl/);
  assert.match(topContext, /data-mk-gm-roll-encounter-zone/);
  assert.match(topContext, /rollEncounterZone\(terrain, scene\)/);
  assert.doesNotMatch(manifest.esmodules.join("\n"), /light-pressure\.js/);
  assert.doesNotMatch(manifest.styles.join("\n"), /gm-screen-light-pressure\.css/);
});

test("Session Log exposes direct buttons for GM Screen tools", () => {
  for (const action of ["group", "scene-context", "overview", "exploration", "tables", "settlement", "npc", "time-passes"]) {
    assert.match(sessionTools, new RegExp(`data-mk-session-tool="${action}"`));
  }
  assert.match(sessionTools, /openSceneContextDialog/);
  assert.match(sessionTools, /createSourceDrivenNpc/);
  assert.doesNotMatch(sessionTools, /stage-latest|Latest Encounter Staging|openEncounterStagingDialog/);
  assert.match(sessionToolsStylesheet, /\.mk-gm-session-tools/);
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/session-tools.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen-session-tools.css"));
});
