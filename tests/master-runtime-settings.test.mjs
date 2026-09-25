import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const settings = source("scripts/libs/settings.js");

const MASTER_SETTINGS = [
  "journalSheetEnabled",
  "quickdrawEnabled",
  "gmScreenEnabled",
  "groupEncountersEnabled",
  "targetingAssistantEnabled",
  "targetedSpellDcEnabled",
  "spellEffectsEnabled",
  "chatReportingEnabled",
  "torchAttackEnabled",
  "sourceTablesEnabled",
  "automatedAnimationsCompatibilityEnabled",
];

test("new runtime switches are public world booleans with an enabled default", () => {
  for (const key of MASTER_SETTINGS) {
    const start = settings.indexOf(`registerSetting("${key}"`);
    assert.notEqual(start, -1, `${key} must be registered`);
    const block = settings.slice(start, settings.indexOf("});", start) + 3);
    assert.match(block, /scope: "world"/, `${key} must be world-scoped`);
    assert.match(block, /config: true/, `${key} must be configurable`);
    assert.match(block, /type: Boolean/, `${key} must be boolean`);
    assert.match(block, /default: true/, `${key} must default to enabled`);
  }
});

test("runtime switches are grouped with the feature controls they govern", () => {
  const menuGroups = [
    ["quickdrawEnabled", "quickdrawIconEnabled"],
    ["journalSheetEnabled", "journalSheetDefault"],
    ["gmScreenEnabled", "gmScreenEncounterDebug"],
    ["enableGroupActors", "groupEncountersEnabled"],
    ["targetingAssistantEnabled", "targetedSpellDcEnabled", "spellEffectsEnabled"],
    ["chatReportingEnabled", "torchAttackEnabled", "sourceTablesEnabled", "automatedAnimationsCompatibilityEnabled"],
  ];

  for (const keys of menuGroups) {
    const first = settings.indexOf(`settings: [${keys.map(key => `"${key}"`).join(", ")}`);
    assert.notEqual(first, -1, `${keys.join(", ")} must share a feature menu`);
  }
});

test("Journal Sheet availability is separate from default selection", () => {
  const runtime = source("scripts/journal-sheet/journal-sheet.js");
  assert.match(runtime, /const JOURNAL_SHEET_ENABLED_SETTING = "journalSheetEnabled"/);
  assert.match(runtime, /const shouldRegister = typeof enabled === "boolean" \? enabled : getJournalSheetEnabled\(\)/);
  assert.match(runtime, /if \(!shouldRegister\) \{[\s\S]*?unregisterJournalSheet\(config\)/);
  assert.match(runtime, /makeDefault: useAsDefault/);
  assert.match(runtime, /setEnabled: value => registerJournalSheet/);
});

test("Character Dashboard, GM Screen, and Group Sheet skip registration when disabled", () => {
  const dashboard = source("scripts/character-dashboard/character-dashboard.js");
  const gmScreen = source("scripts/gm-screen/gm-screen.js");
  const groupSheet = source("scripts/group-sheet/group-sheet.js");
  const groupRegistration = source("scripts/group-sheet/registration.js");

  assert.match(dashboard, /setCharacterDashboardEnabled\(characterDashboardEnabled\(\)\)/);
  assert.match(dashboard, /actors\.unregisterSheet/);
  assert.match(gmScreen, /Hooks\?\.once\?\.\("init", \(\) => \{[\s\S]*?if \(isGmScreenEnabled\(\)\) registerSceneControl/);
  assert.match(gmScreen, /Hooks\?\.once\?\.\("ready", \(\) => \{[\s\S]*?if \(isGmScreenEnabled\(\)\) registerActivePartyStatusRefresh/);
  assert.match(groupSheet, /if \(getSettingValue\("enableGroupActors", true\) === false\) return/);
  assert.match(groupRegistration, /if \(!isGroupSheetEnabled\(\)\) return false/);
});

test("Quickdraw, targeting, spell effects, and utility runtimes honor their master switches", () => {
  const quickdraw = source("scripts/quickdraw/quickdraw-icons.js");
  const targeting = source("scripts/targeting-assistant/targeting-assistant.js");
  const targetedDc = source("scripts/targeted-spell-dc/targeted-spell-dc.js");
  const spellEffects = source("scripts/spell-effects/spell-effects.js");
  const chatReporting = source("scripts/chat-reporting/chat-reporting.js");
  const torch = source("scripts/torch-attack/torch-attack.js");
  const sourceTables = source("scripts/source-tables/source-table-importer.js");
  const automatedAnimations = source("scripts/compatibility/automated-animations.js");

  assert.match(quickdraw, /if \(!isQuickdrawEnabled\(\)\) \{[\s\S]*?clearQuickdrawUi/);
  assert.match(quickdraw, /function clearQuickdrawUi/);
  assert.match(targeting, /if \(!isTargetingAssistantEnabled\(\)\) return false/);
  assert.match(targetedDc, /if \(!isTargetedSpellDcEnabled\(\)\) return null/);
  assert.match(spellEffects, /if \(!isSpellEffectsEnabled\(\)/);
  assert.match(chatReporting, /if \(!isChatReportingEnabled\(\)\) return/);
  assert.match(torch, /if \(!isTorchAttackEnabled\(\)\) return/);
  assert.match(sourceTables, /if \(!isSourceTablesEnabled\(runtime\.game\)\)/);
  assert.match(sourceTables, /if \(!isSourceTablesEnabled\(\)\)/);
  assert.match(automatedAnimations, /if \(!isCompatibilityEnabled\(\)\) return/);
});

test("Group Encounters uses its independent switch and keeps legacy storage untouched", () => {
  const constants = source("scripts/group-sheet/encounters/constants.js");
  const helpers = source("scripts/group-sheet/encounters/helpers.js");
  const registration = source("scripts/group-sheet/encounters/registration.js");
  const chat = source("scripts/group-sheet/encounters/chat.js");
  const staging = source("scripts/group-sheet/encounters/staging.js");

  assert.match(constants, /enabled: "groupEncountersEnabled"/);
  assert.match(helpers, /isGroupEncountersEnabled/);
  assert.match(registration, /if \(isGroupEncountersEnabled\(\)\) bindEncounterCard/);
  assert.match(chat, /if \(!isGroupEncountersEnabled\(\)\) return null/);
  assert.match(staging, /if \(!isGroupEncountersEnabled\(\)\) return null/);
  assert.match(source("scripts/libs/feature-settings.js"), /registerSetting\("encounterEngineEnabled"/);
});
