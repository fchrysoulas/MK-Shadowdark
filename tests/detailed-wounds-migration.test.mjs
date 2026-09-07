import test from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_WOUND_DATA_VERSION,
  WOUND_MIGRATION_VERSION,
  getWoundLocationForRoll,
  getWoundOutcome,
  migrateLegacyWoundData,
  normalizeCurrentWoundData
} from "../scripts/detailed-wounds/detailed-wounds-migration.js";

test("Detailed Wounds migration versions are explicit", () => {
  assert.equal(CURRENT_WOUND_DATA_VERSION, 3);
  assert.equal(WOUND_MIGRATION_VERSION, 2);
});

test("version 1 wound arrays migrate into current status and hit counts", () => {
  const { data, needsWrite } = migrateLegacyWoundData({
    version: 1,
    locations: {
      leftArm: [
        { severity: "minor" },
        { severity: "critical" }
      ]
    }
  });

  assert.equal(needsWrite, true);
  assert.deepEqual(data.locations.leftArm, {
    status: "critical",
    hits: 2,
    severityRoll: 0,
    resultKey: null,
    legacy: true,
  });
  assert.equal(data.version, 3);
});

test("legacy abdomen merges into body once during migration", () => {
  const { data, needsWrite } = migrateLegacyWoundData({
    version: 1,
    locations: {
      torso: { status: "wounded", hits: 1 },
      abdomen: { status: "critical", hits: 2 }
    }
  });

  assert.equal(needsWrite, true);
  assert.deepEqual(data.locations.body, {
    status: "critical",
    hits: 3,
    severityRoll: 0,
    resultKey: null,
    legacy: true,
  });
  assert.equal(Object.hasOwn(data.locations, "abdomen"), false);
});

test("current v3 data does not request another migration", () => {
  const current = normalizeCurrentWoundData({
    version: 3,
    locations: Object.fromEntries([
      "head", "rightArm", "leftArm", "body", "rightLeg", "leftLeg"
    ].map(key => [key, { status: "ok", hits: 0, severityRoll: 0, resultKey: null }]))
  });

  const result = migrateLegacyWoundData(current);
  assert.equal(result.needsWrite, false);
  assert.deepEqual(result.data, current);
});

test("normal current-data reads ignore obsolete abdomen instead of re-merging it", () => {
  const normalized = normalizeCurrentWoundData({
    version: 3,
    locations: {
      body: { status: "wounded", hits: 1, severityRoll: 3, resultKey: "cripplingPain" },
      abdomen: { status: "destroyed", hits: 9 }
    }
  });

  assert.deepEqual(normalized.locations.body, {
    status: "wounded",
    hits: 1,
    severityRoll: 3,
    resultKey: "cripplingPain",
  });
});

test("the location d10 uses the requested six-zone distribution", () => {
  assert.equal(getWoundLocationForRoll(1).key, "head");
  assert.equal(getWoundLocationForRoll(2).key, "rightArm");
  assert.equal(getWoundLocationForRoll(3).key, "rightArm");
  assert.equal(getWoundLocationForRoll(4).key, "leftArm");
  assert.equal(getWoundLocationForRoll(5).key, "leftArm");
  assert.equal(getWoundLocationForRoll(6).key, "body");
  assert.equal(getWoundLocationForRoll(8).key, "body");
  assert.equal(getWoundLocationForRoll(9).key, "rightLeg");
  assert.equal(getWoundLocationForRoll(10).key, "leftLeg");
});

test("severity outcomes preserve the requested location consequences", () => {
  assert.equal(getWoundOutcome("head", 10).fatal, true);
  assert.equal(getWoundOutcome("body", 10).save.dc, 12);
  assert.equal(getWoundOutcome("rightArm", 8).key, "brokenArm");
  assert.deepEqual(getWoundOutcome("rightArm", 9).changes, [["dex", -1], ["str", -1]]);
  assert.equal(getWoundOutcome("leftLeg", 3).prone, true);
});
