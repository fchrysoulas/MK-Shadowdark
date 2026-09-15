import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  MAX_WOUND_HISTORY_ENTRIES,
  appendHistoryEntry,
  createHistoryEntry,
  editHistoryEntry,
  normalizeWoundHistory,
  removeHistoryEntry,
  woundMechanicalSignature
} from "../scripts/detailed-wounds/history-core.js";
import {
  migrateLegacyWoundData,
  normalizeCurrentWoundData
} from "../scripts/detailed-wounds/detailed-wounds-migration.js";
import { advanceWoundRecovery } from "../scripts/detailed-wounds/recovery-core.js";

const runtimeUrl = new URL("../scripts/detailed-wounds/history-runtime.js", import.meta.url);
const manifestUrl = new URL("../module.json", import.meta.url);

function currentLocations(overrides = {}) {
  const base = Object.fromEntries([
    "head", "rightArm", "leftArm", "body", "rightLeg", "leftLeg"
  ].map(key => [key, { status: "ok", hits: 0, severityRoll: 0, resultKey: null }]));
  return { ...base, ...overrides };
}

test("existing Detailed Wounds v3 records remain valid without history", () => {
  const raw = {
    version: 3,
    locations: currentLocations({
      rightArm: { status: "wounded", hits: 1, severityRoll: 7, resultKey: "brokenArm", durationValue: 4 }
    })
  };

  const normalized = normalizeCurrentWoundData(raw);
  assert.equal(Object.hasOwn(normalized.locations.rightArm, "history"), false);

  const migrated = migrateLegacyWoundData(normalized);
  assert.equal(migrated.needsWrite, false);
  assert.deepEqual(migrated.data, normalized);
});

test("optional history survives current-data normalization and migration", () => {
  const raw = {
    version: 3,
    locations: currentLocations({
      rightArm: {
        status: "critical",
        hits: 2,
        severityRoll: 9,
        resultKey: "lostHand",
        history: [{
          id: "h1",
          timestamp: 123456,
          kind: "transition",
          note: "Wyvern bite",
          fromStatus: "wounded",
          toStatus: "critical",
          fromLabel: "Broken Arm",
          toLabel: "Lost Hand",
          outcomeKey: "lostHand"
        }]
      }
    })
  };

  const normalized = normalizeCurrentWoundData(raw);
  assert.equal(normalized.locations.rightArm.history.length, 1);
  assert.equal(normalized.locations.rightArm.history[0].note, "Wyvern bite");
  assert.equal(normalized.locations.rightArm.history[0].toLabel, "Lost Hand");

  const migrated = migrateLegacyWoundData(normalized);
  assert.equal(migrated.needsWrite, false);
  assert.deepEqual(migrated.data, normalized);
});

test("history is compact, normalized, and bounded independently of mechanics", () => {
  const record = { status: "critical", hits: 2, severityRoll: 9, resultKey: "lostHand" };
  const signature = woundMechanicalSignature(record);
  let next = record;

  for (let index = 0; index < MAX_WOUND_HISTORY_ENTRIES + 4; index += 1) {
    next = appendHistoryEntry(next, createHistoryEntry({
      id: `entry-${index}`,
      timestamp: 1000 + index,
      note: `  source   ${index}  `,
      toStatus: "critical",
      toLabel: "Lost Hand",
      outcomeKey: "lostHand"
    }));
  }

  assert.equal(next.history.length, MAX_WOUND_HISTORY_ENTRIES);
  assert.equal(next.history[0].id, "entry-4");
  assert.equal(next.history.at(-1).note, `source ${MAX_WOUND_HISTORY_ENTRIES + 3}`);
  assert.equal(woundMechanicalSignature(next), signature);
});

test("editing or removing history never changes the wound mechanical record", () => {
  const record = appendHistoryEntry(
    { status: "destroyed", hits: 3, severityRoll: 10, resultKey: "lostArm", durationValue: 2 },
    createHistoryEntry({ id: "history-1", timestamp: 100, note: "Ogre maul", toLabel: "Lost Arm" })
  );
  const signature = woundMechanicalSignature(record);

  const edited = editHistoryEntry(record, "history-1", "Pit fight");
  assert.equal(edited.history[0].note, "Pit fight");
  assert.equal(woundMechanicalSignature(edited), signature);
  assert.equal(edited.durationValue, 2);

  const removed = removeHistoryEntry(edited, "history-1");
  assert.equal(normalizeWoundHistory(removed.history).length, 0);
  assert.equal(woundMechanicalSignature(removed), signature);
  assert.equal(removed.durationValue, 2);
});

test("wound recovery preserves informational history after mechanical recovery", () => {
  const data = {
    version: 3,
    locations: currentLocations({
      head: {
        status: "wounded",
        hits: 1,
        severityRoll: 3,
        resultKey: "concussion",
        durationValue: 1,
        history: [{
          id: "concussion-1",
          timestamp: 100,
          kind: "transition",
          note: "Falling stone",
          fromStatus: "ok",
          toStatus: "wounded",
          fromLabel: "No wound",
          toLabel: "Concussion",
          outcomeKey: "concussion"
        }]
      }
    })
  };

  const result = advanceWoundRecovery(data, { rounds: 1 });
  assert.equal(result.changed, true);
  assert.equal(result.data.locations.head.status, "ok");
  assert.equal(result.data.locations.head.severityRoll, 0);
  assert.equal(result.data.locations.head.history.length, 1);
  assert.equal(result.data.locations.head.history[0].note, "Falling stone");
});

test("history runtime observes mechanical transitions and exposes GM-only note controls", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /Hooks\.on\("preUpdateActor"/);
  assert.match(source, /Hooks\.on\("updateActor"/);
  assert.match(source, /woundMechanicalSignature\(before\) === woundMechanicalSignature\(after\)/);
  assert.match(source, /isPrimaryActiveGM\(\)/);
  assert.match(source, /addHistoryNote/);
  assert.match(source, /updateHistoryNote/);
  assert.match(source, /deleteHistoryEntry/);
  assert.match(source, /data-history-action="edit"/);
  assert.match(source, /data-history-action="delete"/);
  assert.doesNotMatch(source, /buildWoundPenaltyChanges|resolveWoundConsequences|classifyWoundRecovery/);
});

test("history loads after canonical recovery while remaining ahead of later wound consumers", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const woundsIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/detailed-wounds.js");
  const recoveryIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/recovery-runtime.js");
  const historyIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/history-runtime.js");
  const consequencesIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/functional-consequences-runtime.js");

  assert.ok(woundsIndex >= 0);
  assert.equal(recoveryIndex, woundsIndex + 1);
  assert.ok(historyIndex > recoveryIndex);
  assert.ok(consequencesIndex > historyIndex);
  assert.ok(manifest.styles.includes("styles/detailed-wounds-history.css"));
});
