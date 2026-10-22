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

  assert.ok(readme.includes(`Foundry VTT v${manifest.compatibility.minimum}+`));
  const system = manifest.relationships.systems.find(entry => entry.id === "shadowdark");
  assert.ok(readme.includes(`Shadowdark RPG system ${system.compatibility.minimum}+`));
});

test("README summarizes manual encounters and their separate supporting tables", async () => {
  const readme = await readReadme();

  assert.match(readme, /Manual Encounter Zone Rolls/);
  assert.match(readme, /Danger Level, Starting Distance, and Activity/i);
  assert.match(readme, /Encounter, Trap, and Hazard tables have separate assignments/i);
  assert.match(readme, /Encounter rolls are manual/i);
  assert.doesNotMatch(readme, /Every encounter interval means/i);
});

test("README does not advertise retired standalone Encounter Engine entry points", async () => {
  const readme = await readReadme();

  assert.doesNotMatch(readme, /Encounter Engine Phase 1|Open the main dialog from:/i);
  assert.doesNotMatch(readme, /Token controls:.*Encounter/i);
  assert.doesNotMatch(readme, /RollTable directory Resolve Encounter action/i);
});

test("README keeps Time Passes separate from Group Time and encounter automation", async () => {
  const readme = await readReadme();

  assert.match(readme, /Time Passes.*Public 1d6, 2d6, or 3d6 roll after a synchronized splash/i);
  assert.match(readme, /Any die showing 1.*ENCOUNTER! skull.*visual cue only/i);
  assert.match(readme, /Time Passes operates independently of Group Time and encounter automation/i);
  assert.doesNotMatch(readme, /Time Passes performs its own encounter check/i);
});

test("README summarizes encounter staging and morale without obsolete workspaces", async () => {
  const readme = await readReadme();

  assert.match(readme, /Encounter Staging.*Preview.*before Deploy/i);
  assert.match(readme, /Morale Automation.*half strength.*half HP.*leader.*immunity.*Fleeing/i);
  assert.doesNotMatch(readme, /^#+ (?:Group Exploration Encounters|Group Resting|GM Member Status)$/im);
});

test("README explains how GMs open the production GM Screen", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen.*GMs open it.*shield.*Token Scene Controls/i);
  assert.match(readme, /GM Screen → gear/);
});

test("README uses Foundry time and Combat without advertising retired timer controls", async () => {
  const readme = await readReadme();

  assert.match(readme, /Foundry world time and Combat track time and rounds/i);
  assert.doesNotMatch(readme, /Clicking \*\*Elapsed\*\*|Reset Timer|due-check queue/i);
});

test("README summarizes auto-saving Scene context, world tables and Group-owned activities", async () => {
  const readme = await readReadme();

  assert.match(readme, /Scene Context.*Encounter Zone, Terrain, Danger, and Period.*save automatically/i);
  assert.match(readme, /RollTable Browser.*existing world RollTables/i);
  assert.match(readme, /Traveling, Camping, marching order, and watches are managed in the Group Sheet/i);
  assert.doesNotMatch(readme, /Tables -> Encounter Setup|Procedure dropdown changes the canonical Group procedure/i);
});

test("README summarizes generators and pinned shortcuts without obsolete NPC macros", async () => {
  const readme = await readReadme();

  for (const feature of ["NPC Generator", "Monster Generator", "Magic Item Generator",
    "Trap Generator", "Hazard Generator", "Tavern Generator", "Shop Generator", "Create Location"]) {
    assert.ok(readme.includes(feature), `Missing generator summary: ${feature}`);
  }
  assert.match(readme, /Pinned Documents.*Per-GM shortcuts to Journals, Actors, Items, and RollTables/i);
  assert.match(readme, /removing a pin preserves the original document/i);
  assert.doesNotMatch(readme, /macros\/create-npc\.js|npcGenerator/is);
});

test("README retains the four-zone GM Screen summary", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen.*Four zones: Active Party, Quick Actions, Pinned Documents, and Tables/i);
  assert.doesNotMatch(readme, /Available workspaces, in order|^- \*\*(?:Downtime|Session Log)\*\*/m);
});

test("README does not require the retired GM Screen Mock", async () => {
  const readme = await readReadme();

  assert.doesNotMatch(readme, /install.*GM Screen Mock|requires.*GM Screen Mock/i);
});
