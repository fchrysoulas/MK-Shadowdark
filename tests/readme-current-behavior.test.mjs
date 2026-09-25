import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readmeUrl = new URL("../README.md", import.meta.url);
const moduleUrl = new URL("../module.json", import.meta.url);

async function readReadme() {
  return readFile(readmeUrl, "utf8");
}

async function readManifest() {
  return JSON.parse(await readFile(moduleUrl, "utf8"));
}

test("README documents the current supported platform floor from the manifest", async () => {
  const [readme, manifest] = await Promise.all([readReadme(), readManifest()]);

  assert.equal(manifest.compatibility.minimum, "13");
  assert.equal(manifest.relationships.systems[0].compatibility.minimum, "4.0.0");
  assert.match(readme, /Foundry VTT v13\+/);
  assert.match(readme, /Shadowdark RPG system 4\.0\.0\+/);
});

test("README documents manual encounter rolls without a module encounter clock", async () => {
  const readme = await readReadme();

  assert.match(readme, /does not maintain a Group elapsed-time clock or a GM Screen turn counter/i);
  assert.match(readme, /no encounter cadence, due-check queue, or Group turn counter/i);
  assert.match(readme, /Manual Encounter Zone Rolls/);
  assert.match(readme, /Danger Level, Starting Distance, and Activity/i);
  assert.match(readme, /Trap and Hazard generators have separate settings tabs/i);
  assert.doesNotMatch(readme, /Every encounter interval means/i);
});

test("README retires standalone Encounter Engine entry points", async () => {
  const readme = await readReadme();

  assert.match(readme, /old standalone Encounter Engine UI is retired/i);
  assert.match(readme, /There is no separate:/i);
  assert.doesNotMatch(readme, /Encounter Engine Phase 1/);
  assert.doesNotMatch(readme, /Open the main dialog from:/);
  assert.doesNotMatch(readme, /Token controls:.*Encounter/i);
});

test("README documents standalone Time Passes dice without encounter automation", async () => {
  const readme = await readReadme();

  assert.match(readme, /choose \*\*1d6\*\*, \*\*2d6\*\*, or \*\*3d6\*\*/i);
  assert.match(readme, /public chat roll after the splash completes/i);
  assert.match(readme, /If any selected d6 shows \*\*1\*\*.*original synchronized \*\*ENCOUNTER!\*\* skull splash/i);
  assert.match(readme, /result-of-1 behavior is a visual cue only/i);
  assert.match(readme, /Group Time is fully separate and does not invoke Time Passes/i);
  assert.doesNotMatch(readme, /Time Passes performs its own encounter check/i);
  assert.doesNotMatch(readme, /Automatic Time Passes encounter resolution/i);
});

test("README documents manual encounter rolls, staging, and morale", async () => {
  const readme = await readReadme();

  assert.match(readme, /# Manual Encounter Zone Rolls/);
  assert.doesNotMatch(readme, /# Group Exploration Encounters/);
  assert.doesNotMatch(readme, /# Group Resting/);
  assert.match(readme, /# Encounter Staging/);
  assert.doesNotMatch(readme, /# GM Member Status/);
  assert.match(readme, /# Morale Automation/);
  assert.match(readme, /Resume Rest.*Group Management/i);
  assert.match(readme, /Encounter card -> Options -> Preview -> Deploy/);
});

test("README documents the production GM Screen", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen is available to GMs/i);
  assert.match(readme, /Token Scene Controls/i);
  assert.match(readme, /standalone Time Passes remain available/i);
});

test("README documents that elapsed and turn controls are retired", async () => {
  const readme = await readReadme();

  assert.match(readme, /does not maintain a Group elapsed-time clock or a GM Screen turn counter/i);
  assert.doesNotMatch(readme, /Clicking \*\*Elapsed\*\*/i);
  assert.doesNotMatch(readme, /Reset Timer/i);
});

test("README documents auto-saving top context and source-only Tables", async () => {
  const readme = await readReadme();

  assert.match(readme, /Encounter Zone, Terrain, Danger, and Period selectors in the top strip/i);
  assert.doesNotMatch(readme, /Procedure dropdown changes the canonical Group procedure/i);
  assert.match(readme, /save immediately when their dropdown changes/i);
  assert.match(readme, /There is no Save Context button/i);
  assert.match(readme, /Tables.*existing world RollTables.*fixed search control/is);
  assert.doesNotMatch(readme, /Tables -> Encounter Setup/);
  assert.match(readme, /Marching order and exploration-role editing remain in Group Management/i);
  assert.match(readme, /production GM Screen no longer edits watches or starts\/resumes rests/i);
});

test("README documents Quick Actions and Pinned Documents without NPC macros", async () => {
  const readme = await readReadme();

  assert.match(readme, /Quick Actions.*Encounters.*Trap Generator.*Hazard Generator.*NPC Generator.*Tavern Generator/is);
  assert.match(readme, /Pinned Documents.*per-GM (?:drop area|workspace)/is);
  assert.doesNotMatch(readme, /macros\/create-npc\.js|npcGenerator/is);
  assert.match(readme, /Journal entries\/pages, Actors, Items, RollTables/i);
  assert.match(readme, /Removing a pin deletes only that shortcut/i);
  assert.match(readme, /presentation-only state stored on the current GM user as document UUIDs/i);
  assert.match(readme, /does not force a full GM Screen rerender/i);
});

test("README documents the permanent four-zone screen without Settlement or Session Log tabs", async () => {
  const readme = await readReadme();

  assert.match(readme, /four permanent main-screen zones:.*Active Party.*Quick Actions.*Pinned Documents.*Tables/is);
  assert.match(readme, /Shop Generator.*Create Location/is);
  assert.doesNotMatch(readme, /Available workspaces, in order|^- \*\*Downtime\*\*|^- \*\*Session Log\*\*/m);
});

test("README does not require the retired GM Screen Mock", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen Mock.*is not a dependency/i);
  assert.doesNotMatch(readme, /install.*GM Screen Mock/i);
  assert.doesNotMatch(readme, /requires.*GM Screen Mock/i);
});
