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

test("README makes encounter intervals procedure-turn based including Safe", async () => {
  const readme = await readReadme();

  assert.match(readme, /Every encounter interval means a number of procedure turns/i);
  assert.match(readme, /Exploration:\*\* 6 minutes \/ 360 seconds per turn/i);
  assert.match(readme, /Resting:\*\* 1 hour \/ 3600 seconds per turn/i);
  assert.match(readme, /Combat:\*\* 6 seconds per turn/i);
  assert.match(readme, /Safe \| No encounter checks/i);
  assert.match(readme, /Unsafe \| Every 3 turns/i);
  assert.match(readme, /Risky \| Every 2 turns/i);
  assert.match(readme, /Deadly \| Every 1 turn/i);
  assert.match(readme, /Safe performs no encounter roll at all/i);
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

test("README documents Group Exploration, Resting, staging, morale, and GM status", async () => {
  const readme = await readReadme();

  assert.match(readme, /# Group Exploration Encounters/);
  assert.match(readme, /# Group Resting/);
  assert.match(readme, /# Encounter Staging/);
  assert.match(readme, /# GM Member Status/);
  assert.match(readme, /# Morale Automation/);
  assert.match(readme, /Resume Rest.*Group Management/i);
  assert.match(readme, /Encounter card -> Options -> Preview -> Deploy/);
});

test("README documents the production GM Screen as a manual-update surface", async () => {
  const readme = await readReadme();

  assert.match(readme, /Group Management.*GM Screen|GM Screen.*Group Management/is);
  assert.match(readme, /separate GM-only GM Screen/i);
  assert.match(readme, /shield button in Token Scene Controls/i);
  assert.match(readme, /mk\.gmScreen\.open\(\)/);
  assert.match(readme, /manual-update surface/i);
  assert.match(readme, /does not subscribe to ambient Actor, Scene, Combat, or MK workflow changes/i);
  assert.match(readme, /does not expose a generic Refresh button/i);
  assert.match(readme, /Hide\/Show Active Party rail and Reset GM Screen Presentation controls are retired/i);
});

test("README documents direct one-turn Elapsed behavior", async () => {
  const readme = await readReadme();

  assert.match(readme, /Clicking \*\*Elapsed\*\* advances exactly one canonical turn/i);
  assert.match(readme, /Exploration:\*\* 6 minutes/i);
  assert.match(readme, /Resting:\*\* 1 hour/i);
  assert.match(readme, /Combat:\*\* 6 seconds/i);
  assert.match(readme, /Downtime:\*\* no generic turn duration/i);
  assert.match(readme, /Elapsed readout uses hours and minutes only/i);
  assert.match(readme, /There is no custom-time popup or Advance Custom action/i);
});

test("README documents auto-saving top context and explicit Encounter Setup saves", async () => {
  const readme = await readReadme();

  assert.match(readme, /Terrain, Danger, and Period dropdowns in the top strip/i);
  assert.match(readme, /save immediately when their dropdown changes/i);
  assert.match(readme, /There is no Save Context button/i);
  assert.match(readme, /Save Encounter Setup/);
  assert.match(readme, /Marching order and exploration-role editing remain in Group Management/i);
  assert.match(readme, /production GM Screen no longer edits watches or starts\/resumes rests/i);
});

test("README documents Overview as per-GM document shortcuts", async () => {
  const readme = await readReadme();

  assert.match(readme, /Overview.*per-GM shortcut dashboard/is);
  assert.match(readme, /Journal entries\/pages, Actors, Items, RollTables/i);
  assert.match(readme, /Clicking a pinned shortcut opens the original document/i);
  assert.match(readme, /presentation-only state stored on the current GM user as document UUIDs/i);
  assert.match(readme, /does not force a full GM Screen rerender/i);
});

test("README documents Downtime, Tools, and Session Log responsibilities", async () => {
  const readme = await readReadme();

  assert.match(readme, /Downtime.*Create Tavern.*Create Shop/is);
  assert.match(readme, /Resting\/Camp status and controls are intentionally absent/i);
  assert.match(readme, /Tools.*Scene\/Encounter Context.*Encounter Procedures/is);
  assert.match(readme, /Rest schedule.*read-only inspector/is);
  assert.match(readme, /Starting date and time/i);
  assert.match(readme, /Start Session/);
  assert.match(readme, /Reset Timer/);
  assert.match(readme, /does not.*rewrite the world's calendar\/time/is);
});

test("README does not require the retired GM Screen Mock", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen Mock.*is not a dependency/i);
  assert.doesNotMatch(readme, /install.*GM Screen Mock/i);
  assert.doesNotMatch(readme, /requires.*GM Screen Mock/i);
});
