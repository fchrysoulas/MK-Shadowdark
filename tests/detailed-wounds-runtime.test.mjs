import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../scripts/detailed-wounds/detailed-wounds.js", import.meta.url);

test("Detailed Wounds normal reads use only current-schema normalization", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const normalizeBlock = source.match(/function normalizeData\(raw\) \{([\s\S]*?)\n  \}/);

  assert.ok(normalizeBlock, "normalizeData must exist");
  assert.match(normalizeBlock[1], /normalizeCurrentWoundData\(raw\)/);
  assert.doesNotMatch(normalizeBlock[1], /abdomen|getLegacyStatus|severityRanks/);
});

test("Detailed Wounds ready path uses the versioned migration instead of an unconditional world scan", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /await migrateDetailedWounds\(\)/);
  assert.match(source, /detailedWoundsMigrationVersion/);
  assert.doesNotMatch(source, /penalty sync error/);
});

test("Detailed Wounds generated output contains no em dash punctuation", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /—/);
});

test("Detailed Wounds exposes a separate informational history surface", async () => {
  const source = (await readFile(sourceUrl, "utf8")).replace(/\r\n/g, "\n");

  assert.match(source, /renderWoundHistoryHtml\(data, editable\)/);
  assert.match(source, /data-action="add-wound-history"/);
  assert.match(source, /data-action="edit-wound-history"/);
  assert.match(source, /data-action="remove-wound-history"/);
  assert.match(source, /Informational only/);
});

test("Detailed Wounds history is not used to calculate penalties", async () => {
  const source = (await readFile(sourceUrl, "utf8")).replace(/\r\n/g, "\n");
  const penaltyBlock = source.match(/function buildWoundPenaltyChanges\(data\) \{([\s\S]*?)\n  \}\n\n  function getLocationPenaltyValues/);

  assert.ok(penaltyBlock, "buildWoundPenaltyChanges block must exist");
  assert.doesNotMatch(penaltyBlock[1], /history/);
  assert.match(source, /appendAutomaticWoundHistory\(entry, current, outcome, historyContext\)/);
});
