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

test("README makes encounter intervals procedure-turn based", async () => {
  const readme = await readReadme();

  assert.match(readme, /Every encounter interval means a number of procedure turns/i);
  assert.match(readme, /Exploration:\*\* 6 minutes \/ 360 seconds per turn/i);
  assert.match(readme, /Resting:\*\* 1 hour per turn/i);
  assert.match(readme, /Unsafe \| Every 3 turns/i);
  assert.match(readme, /Risky \| Every 2 turns/i);
  assert.match(readme, /Deadly \| Every 1 turn/i);
});

test("README retires standalone Encounter Engine entry points", async () => {
  const readme = await readReadme();

  assert.match(readme, /old standalone Encounter Engine UI is retired/i);
  assert.match(readme, /There is no separate:/i);
  assert.doesNotMatch(readme, /Encounter Engine Phase 1/);
  assert.doesNotMatch(readme, /Open the main dialog from:/);
  assert.doesNotMatch(readme, /Token controls:.*Encounter/i);
});

test("README documents Time Passes as presentation-only", async () => {
  const readme = await readReadme();

  assert.match(readme, /Time Passes is presentation-only/i);
  assert.match(readme, /does \*\*not\*\*:[\s\S]*roll encounter dice/i);
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
  assert.match(readme, /Resume Rest/);
  assert.match(readme, /Encounter card -> Options -> Preview -> Deploy/);
});

test("README does not require the retired GM Screen Mock", async () => {
  const readme = await readReadme();

  assert.match(readme, /GM Screen Mock.*is not a dependency/i);
  assert.doesNotMatch(readme, /install.*GM Screen Mock/i);
  assert.doesNotMatch(readme, /requires.*GM Screen Mock/i);
});
