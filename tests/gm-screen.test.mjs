import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
const settingsRuntime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen-settings.js", import.meta.url), "utf8");
const explorationRuntime = fs.readFileSync(new URL("../scripts/gm-screen/exploration-zone-grid.js", import.meta.url), "utf8");
const viewModel = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
const settingsTemplate = fs.readFileSync(new URL("../templates/gm-screen-settings.hbs", import.meta.url), "utf8");
const topContext = fs.readFileSync(new URL("../scripts/gm-screen/top-context-controls.js", import.meta.url), "utf8");
const overviewLinks = fs.readFileSync(new URL("../scripts/gm-screen/overview-links.js", import.meta.url), "utf8");
const settings = fs.readFileSync(new URL("../scripts/libs/settings.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const compositionStylesheet = fs.readFileSync(new URL("../styles/gm-screen-compositions.css", import.meta.url), "utf8");
const settingsStylesheet = fs.readFileSync(new URL("../styles/gm-screen-settings.css", import.meta.url), "utf8");
const refactorStylesheet = fs.readFileSync(new URL("../styles/gm-screen-workspace-refactor.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

const WORKSPACES = [
  "overview",
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

test("GM Screen consumes canonical Group and Scene context services", () => {
  assert.match(viewModel, /getGroupData/);
  assert.match(viewModel, /getGroupAssignments/);
  assert.match(viewModel, /buildGroupMemberStatus/);
  assert.match(viewModel, /resolveSceneEnvironmentContext/);
  assert.doesNotMatch(runtime, /Group Time|advanceGroupTime|processDueExplorationEncounters/);
});

test("GM Screen header no longer owns Group procedure controls", () => {
  assert.doesNotMatch(runtime, /GROUP_PROCEDURE_STATES|setGroupProcedureState|installProcedureSelector|actionSelectProcedure/);
  assert.doesNotMatch(viewModel, /getGroupProcedureState|procedure:/);
  assert.doesNotMatch(template, />Procedure<|\{\{procedure\}\}/);
  assert.doesNotMatch(runtime, /actionAdvanceOneTurn|advanceGroupTime|REST_TURN_SECONDS|COMBAT_TURN_SECONDS|fa-forward-step/);
  assert.doesNotMatch(template, /Elapsed|Every \{\{environment\.intervalTurns\}\}/);
  assert.doesNotMatch(viewModel, /elapsedSeconds|elapsedLabel|formatDuration|dueChecks|checkTurns/);
});

test("pending Group encounter checks and timed workflows are retired", () => {
  const groupSheet = fs.readFileSync(new URL("../scripts/group-sheet/group-sheet.js", import.meta.url), "utf8");
  assert.doesNotMatch(groupSheet, /exploration-encounters|rest-encounters|group-sheet\/time/);
  assert.doesNotMatch(topContext, /getGroupRestState|activeRestRetainsChecks|rest-snapshot-warning/);
  assert.doesNotMatch(fs.readFileSync(new URL("../scripts/gm-screen/encounter-history.js", import.meta.url), "utf8"), /Reset Timer|Procedure Timer|resetGroupTime|getGroupElapsedTime/);
});

test("GM Screen owns the exact four workspaces in order", () => {
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

test("Encounters is an editable Encounter Zone Settings tab with detail RollTable slots", () => {
  assert.doesNotMatch(template, /data-workspace-panel="exploration"/);
  const start = settingsTemplate.indexOf('data-settings-page="encounters"');
  const end = settingsTemplate.indexOf('data-settings-page="compositions"');
  const encounters = settingsTemplate.slice(start, end);
  assert.match(encounters, /data-mk-exploration-zone-grid/);
  assert.match(settingsTemplate, /data-settings-tab="\{\{id\}\}"/);
  assert.match(explorationRuntime, /SETTINGS_APP_ID/);
  assert.match(encounters, /data-mk-encounter-auxiliary-tables/);
  assert.doesNotMatch(encounters, />Turns</);
  assert.doesNotMatch(encounters, />Next Check</);
  assert.doesNotMatch(encounters, />Due</);
  assert.doesNotMatch(encounters, /Encounter Table|Latest Check/);
  assert.doesNotMatch(encounters, /Process Due Checks|Process Encounter Checks/);
  assert.doesNotMatch(encounters, /Safe: encounter checks are disabled/);
  assert.doesNotMatch(encounters, />Terrain</);
  assert.doesNotMatch(encounters, />Danger</);
  assert.doesNotMatch(encounters, />Period</);
  assert.doesNotMatch(encounters, />Turn Length</);
  assert.doesNotMatch(encounters, />Cadence</);
});

test("GM Screen encounter roll details are controlled by a disabled-by-default debug setting", () => {
  assert.match(settings, /registerSetting\("gmScreenEncounterDebug",/);
  assert.match(settings, /name: "GM Screen \| Encounter Roll Debug Mode"/);
  assert.match(settings, /hint: "When enabled, Roll Encounter Journal pages show dice formulas, roll totals, and result numbers\./);
  const settingStart = settings.indexOf('registerSetting("gmScreenEncounterDebug"');
  const settingBlock = settings.slice(settingStart, settings.indexOf("});", settingStart));
  assert.match(settingBlock, /default: false/);
});

test("GM Screen Tavern Journal roll details are controlled by a disabled-by-default debug setting", () => {
  assert.match(settings, /registerSetting\("gmScreenTavernDebug",/);
  assert.match(settings, /name: "GM Screen \| Tavern Generator Debug Mode"/);
  assert.match(settings, /hint: "When enabled, Tavern Journal pages show source tables, dice formulas, roll totals, and result numbers\./);
  const settingStart = settings.indexOf('registerSetting("gmScreenTavernDebug"');
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

test("NPC Generator lives in GM Screen Settings with left-side navigation", () => {
  assert.doesNotMatch(template, /data-workspace-panel="compositions"/);
  assert.doesNotMatch(viewModel, /compositions: "Compositions"/);
  assert.doesNotMatch(viewModel, /compositions: "fa-font"/);
  assert.match(settingsRuntime, /SETTINGS_APP_ID/);
  assert.match(settingsRuntime, /class MKGMscreenSettings extends ApplicationBase/);
  assert.match(settingsRuntime, /data-mk-gm-open-settings/);
  assert.match(settingsRuntime, /Open GM Screen Settings/);
  assert.match(settingsTemplate, /mk-gm-settings-sidebar/);
  assert.match(settingsTemplate, /data-action="settingsTab"/);
  assert.match(settingsTemplate, /data-settings-page="encounters"/);
  assert.match(settingsTemplate, /data-settings-page="tavern-generator"/);
  assert.match(settingsTemplate, /data-mk-tavern-generator-tables/);
  assert.match(settingsTemplate, />Tavern Generator</);
  assert.match(settingsTemplate, />NPC Generator</);
  assert.match(settingsTemplate, /data-mk-npc-name-composition/);
  assert.match(settingsTemplate, /data-mk-npc-trait-tables/);
  assert.match(settingsTemplate, /Scene-owned RollTables used to compose generated NPC names/);
  assert.match(compositionStylesheet, /\.mk-gm-npc-name-composition-flow/);
  assert.match(compositionStylesheet, /\.mk-gm-npc-trait-grid/);
  assert.match(settingsStylesheet, /\.mk-gm-settings-sidebar/);
  assert.match(settingsStylesheet, /\.mk-gm-settings-nav button\.is-active/);
});

test("GM Screen Settings cards provide executable drag sources without Open buttons", () => {
  assert.equal((settingsTemplate.match(/data-mk-gm-overview-tool=/g) ?? []).length, 3);
  assert.match(settingsTemplate, /data-mk-gm-overview-tool="encounters"[\s\S]*Drag Encounters to Overview/);
  assert.match(settingsTemplate, /data-mk-gm-overview-tool="npc-generator"[\s\S]*Drag NPC Generator to Overview/);
  assert.match(settingsTemplate, /data-mk-gm-overview-tool="tavern-generator"[\s\S]*Drag Tavern Generator to Overview/);
  assert.doesNotMatch(settingsTemplate, /Open Encounters|Open NPC Generator|Open Tavern Generator/);
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
  assert.doesNotMatch(refactorStylesheet, /data-workspace="exploration"/);
  assert.match(refactorStylesheet, /data-workspace="downtime"/);
  assert.doesNotMatch(refactorStylesheet, /data-workspace="compositions"/);
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
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/npc-name-compositions.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/tavern-generator-settings.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/gm-screen-settings.js"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-exploration.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-compositions.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-tavern-generator.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-settings.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});

test("Encounter bar control replaces the Light pressure cell", () => {
  assert.match(topContext, /installEncounterRollControl/);
  assert.match(topContext, /data-mk-gm-roll-encounter-zone/);
  assert.match(topContext, /name=\"encounterZone\"/);
  assert.match(topContext, /encounterZoneOptions/);
  assert.match(topContext, /Roll Encounter/);
  assert.match(topContext, /rollEncounterZone\(context\?\.terrain \?\? \"\", scene, \{ zoneId \}\)/);
  assert.doesNotMatch(template, />Procedure<|\{\{procedure\}\}/);
  assert.doesNotMatch(manifest.esmodules.join("\n"), /light-pressure\.js/);
  assert.doesNotMatch(manifest.styles.join("\n"), /gm-screen-light-pressure\.css/);
});

test("Encounter selector appears before Terrain in the header strip", () => {
  const encounterZoneIndex = template.indexOf("<div><span>Encounter Zone</span>");
  const terrainIndex = template.indexOf("<div><span>Terrain</span>");
  const rollEncounterIndex = template.indexOf("<div><span>Roll Encounter</span>");
  const combatStart = template.indexOf("{{#if combat.active}}");
  const combatEnd = template.indexOf("{{/if}}", combatStart);

  assert.ok(encounterZoneIndex < terrainIndex);
  assert.ok(rollEncounterIndex > combatEnd);
});

test("Session Log no longer loads the retired GM Tools button panel", () => {
  assert.doesNotMatch(template, /data-mk-gm-session-tools|data-mk-session-tool/);
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/session-tools.js"));
  assert.ok(!manifest.styles.includes("styles/gm-screen-session-tools.css"));
});
