import test from "node:test";
import assert from "node:assert/strict";

import {
  CURRENT_WOUND_DATA_VERSION,
  WOUND_MIGRATION_VERSION,
  migrateLegacyWoundData,
  normalizeCurrentWoundData
} from "../scripts/detailed-wounds/detailed-wounds-migration.js";

test("Detailed Wounds migration versions are explicit", () => {
  assert.equal(CURRENT_WOUND_DATA_VERSION, 2);
  assert.equal(WOUND_MIGRATION_VERSION, 1);
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
  assert.deepEqual(data.locations.leftArm, { status: "critical", hits: 2 });
  assert.equal(data.version, 2);
});

test("legacy abdomen merges into torso once during migration", () => {
  const { data, needsWrite } = migrateLegacyWoundData({
    version: 1,
    locations: {
      torso: { status: "wounded", hits: 1 },
      abdomen: { status: "critical", hits: 2 }
    }
  });

  assert.equal(needsWrite, true);
  assert.deepEqual(data.locations.torso, { status: "critical", hits: 3 });
  assert.equal(Object.hasOwn(data.locations, "abdomen"), false);
});

test("current v2 data does not request another migration", () => {
  const current = normalizeCurrentWoundData({
    version: 2,
    locations: Object.fromEntries([
      "head", "leftArm", "leftHand", "leftLeg", "leftFoot",
      "torso", "rightArm", "rightHand", "rightLeg", "rightFoot"
    ].map(key => [key, { status: "ok", hits: 0 }]))
  });

  const result = migrateLegacyWoundData(current);
  assert.equal(result.needsWrite, false);
  assert.deepEqual(result.data, current);
});

test("normal current-data reads ignore obsolete abdomen instead of re-merging it", () => {
  const normalized = normalizeCurrentWoundData({
    version: 2,
    locations: {
      torso: { status: "wounded", hits: 1 },
      abdomen: { status: "destroyed", hits: 9 }
    }
  });

  assert.deepEqual(normalized.locations.torso, { status: "wounded", hits: 1 });
});
