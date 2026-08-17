import test from "node:test";
import assert from "node:assert/strict";

import {
  CORPSE_TOKEN_MIGRATION_VERSION,
  buildMigratedCorpseFlagData
} from "../scripts/corpse-token/corpse-token-migration.js";

test("corpse token migration version is explicit", () => {
  assert.equal(CORPSE_TOKEN_MIGRATION_VERSION, 1);
});

test("legacy corpse flags migrate into the current schema", () => {
  const result = buildMigratedCorpseFlagData({
    worldLegacy: {
      originalTexture: "legacy.webp",
      originalX: 100,
      originalY: 200
    }
  });

  assert.equal(result.hasLegacy, true);
  assert.deepEqual(result.data, {
    originalTexture: "legacy.webp",
    originalX: 100,
    originalY: 200
  });
});

test("current corpse flags win over both legacy formats", () => {
  const result = buildMigratedCorpseFlagData({
    moduleLegacy: {
      originalTexture: "oldest.webp",
      originalX: 10,
      originalHeight: 2
    },
    worldLegacy: {
      originalTexture: "world.webp",
      originalX: 20,
      originalWidth: 2
    },
    current: {
      originalTexture: "current.webp",
      originalX: 30
    }
  });

  assert.equal(result.hasLegacy, true);
  assert.deepEqual(result.data, {
    originalTexture: "current.webp",
    originalX: 30,
    originalHeight: 2,
    originalWidth: 2
  });
});

test("current-only data does not request a legacy migration", () => {
  const result = buildMigratedCorpseFlagData({
    current: {
      originalTexture: "current.webp",
      applied: true
    }
  });

  assert.equal(result.hasLegacy, false);
  assert.deepEqual(result.data, {
    originalTexture: "current.webp",
    applied: true
  });
});
