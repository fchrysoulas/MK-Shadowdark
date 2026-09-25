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

test("GM Screen is a separate ApplicationV2 surface", () => {
  assert.match(runtime, /HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(runtime, /class MKGMscreen extends ApplicationBase/);
  assert.match(runtime, /getSceneControlButtons/);
  assert.match(runtime, /module\.api\.gmScreen/);
  assert.match(runtime, /bindActiveGroupSelector/);
  assert.match(template, /data-mk-gm-active-group/);
  assert.doesNotMatch(template, /Group Management/);
  assert.match(stylesheet, /\.mk-gm-screen-layout/);
});

test("GM Screen keeps active Group selection in the party rail", () => {
  assert.match(template, /mk-gm-rail-heading/);
  assert.doesNotMatch(template, /<span>Party<\/span>|<span>Active Party<\/span>|party\.length/);
  assert.match(template, /data-mk-gm-active-group/);
  assert.match(template, /#each groups/);
  assert.match(template, /value="{{uuid}}"/);
  assert.match(runtime, /target\?\.value \?\? target\?\.dataset\?\.groupUuid/);
  assert.match(runtime, /select\.addEventListener\("change"/);
  assert.doesNotMatch(template, /mk-gm-group-controls|mk-gm-group-selector|data-action="selectGroup"|data-action="createGroup"/);
  assert.doesNotMatch(template, /data-action="openGroup"/);

  const headerStart = template.indexOf('<header class="mk-gm-screen-header">');
  const stripIndex = template.indexOf('<section class="mk-gm-pressure-strip">');
  const headerEnd = template.indexOf("</header>", headerStart);
  assert.ok(headerStart >= 0);
  assert.ok(stripIndex > headerStart && stripIndex < headerEnd);
  const header = template.slice(headerStart, headerEnd);
  assert.match(header, /mk-gm-time-passes|data-action="timePasses"/);

  const timePassesIndex = template.indexOf("<span>Time Passes</span>", stripIndex);
  const encounterIndex = template.indexOf("<span>Roll Encounter</span>", stripIndex);
  assert.ok(timePassesIndex > stripIndex);
  assert.ok(encounterIndex > timePassesIndex);
  assert.match(stylesheet, /\.mk-gm-active-group-select/);
  assert.match(stylesheet, /\.mk-gm-context-action-cell/);
  assert.match(stylesheet, /\.mk-gm-screen-header[\s\S]*background: #070809/);
  assert.match(stylesheet, /grid-template-areas: "title context actions"/);
  assert.match(stylesheet, /--mk-gm-zone-header-height: 42px/);
  assert.match(stylesheet, /grid-template-columns: 200px minmax\(0, 1fr\)/);
  assert.match(stylesheet, /\.mk-gm-rail-heading[\s\S]*height: var\(--mk-gm-zone-header-height\)/);
  assert.match(refactorStylesheet, /\.mk-gm-screen-zone-header[\s\S]*height: var\(--mk-gm-zone-header-height\)/);
  assert.match(refactorStylesheet, /\.mk-gm-quick-actions-zone \.mk-gm-overview-shortcuts-head[\s\S]*height: var\(--mk-gm-zone-header-height\)/);
});

test("GM Screen is GM-gated and has a supported toggle entry point", () => {
  assert.match(runtime, /game\?\.user\?\.isGM/);
  assert.match(runtime, /toggle: toggleGmScreen/);
  assert.match(runtime, /button: true/);
  assert.match(runtime, /visible: true/);
});

test("GM status inspection is retired from the GM Screen", () => {
  assert.doesNotMatch(runtime, /inspectMember|actionInspectMember|openGroupMemberStatus/);
  assert.doesNotMatch(template, /mk-gm-member-status|Inspect GM status/);
  assert.doesNotMatch(stylesheet, /mk-gm-member-status/);
  assert.doesNotMatch(refactorStylesheet, /mk-gm-member-status/);
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

test("GM Screen renders four permanent zones without workspace navigation", () => {
  assert.match(template, /mk-gm-party-rail/);
  assert.match(template, /mk-gm-pressure-strip/);

  let previousIndex = -1;
  for (const marker of [
    "mk-gm-party-rail",
    "data-mk-gm-quick-actions",
    "data-mk-gm-pinned-documents",
    "data-mk-gm-tables-zone",
  ]) {
    const index = template.indexOf(marker);
    assert.ok(index > previousIndex, `${marker} should appear in canonical order`);
    previousIndex = index;
  }

  assert.doesNotMatch(template, /mk-gm-workspace-nav|data-action="workspace"|data-workspace-panel=/);
  assert.doesNotMatch(template, /Settlement|Session Log/);
  assert.doesNotMatch(template, /data-workspace-panel="encounter"/);
  assert.doesNotMatch(template, /data-workspace-panel="environment"/);
  assert.doesNotMatch(template, /data-workspace-panel="rules"/);
  assert.doesNotMatch(template, /data-workspace-panel="resting"/);
  assert.match(template, /mk-gm-screen-zone-header/);
  assert.doesNotMatch(template, /configureEnvironment/);
  assert.doesNotMatch(template, /profileName|Active Profile/);
  assert.doesNotMatch(template, /Group Traveling/);
  assert.doesNotMatch(template, /Group Camping/);
  assert.doesNotMatch(template, /data-workspace-panel="tools"/);
  assert.doesNotMatch(viewModel, /\"tools\"/);
  assert.doesNotMatch(template, /Process Due Checks|Process Encounter Checks/);
});

test("Tables zone collapses into a right-side rail", () => {
  assert.match(template, /mk-gm-screen-layout\{\{#if tablesCollapsed\}\} is-tables-collapsed/);
  assert.match(template, /mk-gm-tables-zone\{\{#if tablesCollapsed\}\} is-collapsed/);
  assert.match(template, /data-action="toggleTables"/);
  assert.match(runtime, /toggleTables: actionToggleTables/);
  assert.match(runtime, /this\.tablesCollapsed = false/);
  assert.match(runtime, /tablesCollapsed: this\.tablesCollapsed/);
  assert.match(refactorStylesheet, /\.mk-gm-screen-layout\.is-tables-collapsed/);
  assert.match(refactorStylesheet, /\.mk-gm-tables-zone\.is-collapsed/);
});

test("Quick Actions and Pinned Documents are permanent surfaces", () => {
  assert.match(overviewLinks, /quickActions\.innerHTML = quickActionsShellHtml\(\)/);
  assert.match(overviewLinks, /pinnedDocuments\.innerHTML = overviewShellHtml\(\)/);
  assert.match(overviewLinks, /renderQuickActions\(quickSurface\)/);
  assert.doesNotMatch(overviewLinks, /mk-gm-overview-summary|buildOverviewSummary|overviewSummaryHtml/);
  assert.match(overviewLinks, /data-mk-overview-shortcuts/);
  assert.match(overviewLinks, /data-mk-quick-actions-surface/);
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

test("Settlement and Session Log tabs are removed from the main screen", () => {
  assert.doesNotMatch(template, /Settlement|Session Log|data-workspace-panel="downtime"|data-workspace-panel="session-log"/);
  assert.doesNotMatch(refactorStylesheet, /mk-gm-workspace-nav|data-workspace=/);
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
  assert.match(settingsTemplate, /data-settings-page="shop-generator"/);
  assert.match(settingsTemplate, /data-settings-page="location-generator"/);
  assert.match(settingsTemplate, /data-settings-page="monster-generator"/);
  assert.match(settingsTemplate, /data-settings-page="magic-item-generator"/);
  assert.match(settingsTemplate, /data-mk-tavern-generator-tables/);
  assert.match(settingsTemplate, /data-mk-shop-generator-tables/);
  assert.match(settingsTemplate, /data-mk-location-generator-tables/);
  assert.match(settingsTemplate, />Tavern Generator</);
  assert.match(settingsTemplate, />Shop Generator</);
  assert.match(settingsTemplate, />Location Generator</);
  assert.match(settingsTemplate, />NPC Generator</);
  assert.match(settingsTemplate, />Monster Generator</);
  assert.match(settingsTemplate, />Magic Item Generator</);
  assert.match(settingsTemplate, /data-mk-npc-name-composition/);
  assert.match(settingsTemplate, /data-mk-npc-trait-tables/);
  assert.match(settingsTemplate, /Scene-owned RollTables used to compose generated NPC names/);
  assert.match(compositionStylesheet, /\.mk-gm-npc-name-composition-flow/);
  assert.match(compositionStylesheet, /\.mk-gm-npc-trait-grid/);
  assert.match(settingsStylesheet, /\.mk-gm-settings-sidebar/);
  assert.match(settingsStylesheet, /\.mk-gm-settings-nav button\.is-active/);
  assert.match(manifest.styles.join("\n"), /gm-screen-tavern-generator\.css/);
  assert.match(manifest.esmodules.join("\n"), /gm-screen\/location-generator-settings\.js/);
  assert.match(manifest.esmodules.join("\n"), /gm-screen\/monster-generator-settings\.js/);
  assert.match(manifest.esmodules.join("\n"), /gm-screen\/monster-generator\.js/);
  assert.match(manifest.esmodules.join("\n"), /gm-screen\/magic-item-generator-settings\.js/);
  assert.match(manifest.esmodules.join("\n"), /gm-screen\/magic-item-generator\.js/);
});

test("GM Screen Settings cards control Quick Action visibility without drag sources", () => {
  assert.match(settingsTemplate, /#each homeFeatures/);
  assert.match(settingsTemplate, /data-mk-gm-quick-action-toggle="\{\{overviewTool\}\}"/);
  assert.match(settingsTemplate, /Show in Quick Actions/);
  assert.match(settingsRuntime, /homeFeatures/);
  assert.match(settingsRuntime, /bindQuickActionToggles/);
  assert.match(settingsRuntime, /setQuickActionEnabled/);
  assert.doesNotMatch(settingsTemplate, /data-mk-gm-overview-tool|draggable|Drag .* to Overview/);
  assert.doesNotMatch(settingsRuntime, /bindOverviewToolSources|dragstart/);
  assert.doesNotMatch(settingsTemplate, /Open Encounters|Open NPC Generator|Open Tavern Generator/);
  assert.match(settingsStylesheet, /font-family: var\(--font-primary/);
  assert.match(settingsStylesheet, /mk-gm-settings-quick-action-toggle/);
});

test("view model keeps only a compatibility Overview workspace", () => {
  assert.match(viewModel, /const GM_SCREEN_WORKSPACES = Object\.freeze\(\[[\s\S]*"overview"/);
  assert.doesNotMatch(viewModel, /"downtime"|"tables"|"session-log"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"encounter"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"environment"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"rules"/);
  assert.doesNotMatch(viewModel, /GM_SCREEN_WORKSPACES[\s\S]{0,400}"resting"/);
  assert.match(viewModel, /GM_SCREEN_WORKSPACE_ICONS/);
  assert.match(viewModel, /return "overview"/);
});

test("permanent zone layout replaces workspace active tints", () => {
  assert.match(refactorStylesheet, /grid-template-columns: 175px 175px minmax\(230px, 1fr\) 300px/);
  assert.match(refactorStylesheet, /\.mk-gm-screen-zone/);
  assert.doesNotMatch(refactorStylesheet, /mk-gm-workspace-nav|data-workspace=/);
});

test("GM Screen exposes standalone Time Passes and Roll Encounter actions without a dice selector", () => {
  assert.match(template, /class="mk-gm-time-passes mk-gm-context-action"/);
  assert.match(template, /class="mk-gm-encounter-roll mk-gm-context-action"/);
  assert.match(template, /fa-swords"><\/i> Roll Encounter/);
  assert.match(template, /data-action="timePasses"/);
  assert.doesNotMatch(template, /data-time-passes-dice|mk-gm-time-passes-dice|<option value="[123]">[123]d6/);
  assert.match(runtime, /const rollTimePasses = api\?\.roll \?\? api\?\.timePasses/);
  assert.match(runtime, /return rollTimePasses\(\);/);
  assert.doesNotMatch(runtime, /diceCount|data-time-passes-dice/);
  assert.match(stylesheet, /\.mk-gm-pressure-strip > \.mk-gm-context-action-cell[\s\S]*min-width: 115px/);
  assert.match(stylesheet, /\.mk-gm-context-action\s*\{[\s\S]*min-height: 40px;[\s\S]*margin: 5px;/);
  const contextActionRule = stylesheet.match(/\.mk-gm-context-action,\s*\.mk-gm-encounter-roll\s*\{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(contextActionRule, /height:\s*100%/);
  assert.match(stylesheet, /\.mk-gm-time-passes[\s\S]*border-color: rgba\(212, 154, 69/);
  assert.match(stylesheet, /\.mk-gm-encounter-roll[\s\S]*border-color: rgba\(184, 47, 69/);
  assert.doesNotMatch(refactorStylesheet, /mk-gm-time-passes select/);
});

test("Combat round tracking is not rendered by the GM Screen", () => {
  assert.doesNotMatch(template, /data-workspace-panel="combat"/);
  assert.doesNotMatch(template, /data-action="openCombat"/);
  assert.doesNotMatch(template, /combat\.active|Round \{\{combat\.round\}\}/);
  assert.doesNotMatch(viewModel, /function buildCombatView|combatView/);
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
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/monster-generator-settings.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/monster-generator.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/magic-item-generator-settings.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/magic-item-generator.js"));
  assert.ok(gmScreenEntries.includes("scripts/gm-screen/gm-screen-settings.js"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-exploration.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-compositions.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-tavern-generator.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-rolltable-assignment.css"));
  assert.ok(gmScreenStyles.includes("styles/gm-screen-settings.css"));
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen-mock/gm-screen-mock.js"));
});

test("Encounter bar control replaces the Light pressure cell", () => {
  assert.match(topContext, /installEncounterRollControl/);
  assert.match(topContext, /data-mk-gm-roll-encounter-zone/);
  assert.match(topContext, /name=\"encounterZone\"/);
  assert.match(topContext, /encounterZoneOptions/);
  assert.match(topContext, /Roll Encounter/);
  assert.match(topContext, /rollEncounterZone\(context\?\.terrain \?\? \"\", scene, \{[\s\S]*zoneId,[\s\S]*dangerLevel: context\?\.dangerLevel/);
  assert.doesNotMatch(template, />Procedure<|\{\{procedure\}\}/);
  assert.doesNotMatch(manifest.esmodules.join("\n"), /light-pressure\.js/);
  assert.doesNotMatch(manifest.styles.join("\n"), /gm-screen-light-pressure\.css/);
});

test("Encounter selector appears before Terrain in the header strip", () => {
  const encounterZoneIndex = template.indexOf("<div><span>Encounter Zone</span>");
  const terrainIndex = template.indexOf("<div><span>Terrain</span>");
  const periodIndex = template.indexOf("<div><span>Period</span>");
  const rollEncounterIndex = template.indexOf("<span>Roll Encounter</span>");

  assert.ok(encounterZoneIndex < terrainIndex);
  assert.ok(periodIndex < rollEncounterIndex);
});

test("Session Log no longer loads the retired GM Tools button panel", () => {
  assert.doesNotMatch(template, /data-mk-gm-session-tools|data-mk-session-tool/);
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/session-tools.js"));
  assert.ok(!manifest.styles.includes("styles/gm-screen-session-tools.css"));
});
