import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ENDURING_WOUNDS_FAILURE,
  drawEnduringWound,
  resolveEnduringWoundsTable,
  validateEnduringWoundsTable
} from "../scripts/detailed-wounds/enduring-wounds.js";
import {
  SURVIVAL_WOUND_PROFILES,
  normalizeSurvivalWoundProfile,
  survivalWoundProfileEnabled
} from "../scripts/detailed-wounds/survival-profile-core.js";

const settingsUrl = new URL("../scripts/detailed-wounds/survival-profile-settings.js", import.meta.url);
const runtimeUrl = new URL("../scripts/detailed-wounds/survival-trigger.js", import.meta.url);
const manifestUrl = new URL("../module.json", import.meta.url);

test("survival wound profile selection is deterministic and backward-safe", () => {
  assert.equal(
    normalizeSurvivalWoundProfile(SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE),
    SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE
  );
  assert.equal(
    normalizeSurvivalWoundProfile(SURVIVAL_WOUND_PROFILES.DISABLED),
    SURVIVAL_WOUND_PROFILES.DISABLED
  );
  assert.equal(
    normalizeSurvivalWoundProfile("unknown"),
    SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS
  );

  assert.equal(
    survivalWoundProfileEnabled(SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS, { detailedWoundsEnabled: false }),
    false
  );
  assert.equal(
    survivalWoundProfileEnabled(SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE, { detailedWoundsEnabled: false }),
    true
  );
  assert.equal(
    survivalWoundProfileEnabled(SURVIVAL_WOUND_PROFILES.DISABLED, { detailedWoundsEnabled: true }),
    false
  );
});

test("configured Enduring Wounds UUID must resolve to a RollTable", async () => {
  assert.equal(validateEnduringWoundsTable(null), ENDURING_WOUNDS_FAILURE.MISSING_TABLE);
  assert.equal(
    validateEnduringWoundsTable({ documentName: "JournalEntry", draw() {} }),
    ENDURING_WOUNDS_FAILURE.INVALID_TABLE
  );
  assert.equal(
    validateEnduringWoundsTable({ documentName: "RollTable", draw() {} }),
    ""
  );

  const missing = await resolveEnduringWoundsTable("", { resolver: async () => null });
  assert.equal(missing.reason, ENDURING_WOUNDS_FAILURE.MISSING_TABLE);

  const invalid = await resolveEnduringWoundsTable("RollTable.bad", {
    resolver: async () => ({ documentName: "Actor" })
  });
  assert.equal(invalid.reason, ENDURING_WOUNDS_FAILURE.INVALID_TABLE);

  const thrown = await resolveEnduringWoundsTable("RollTable.bad", {
    resolver: async () => { throw new Error("not found"); }
  });
  assert.equal(thrown.reason, ENDURING_WOUNDS_FAILURE.INVALID_TABLE);
});

test("external profile draws the GM RollTable with chat display and does not interpret results", async () => {
  const calls = [];
  const table = {
    documentName: "RollTable",
    uuid: "RollTable.enduring",
    name: "Owned Enduring Wounds",
    async draw(options) {
      calls.push(options);
      return { results: [{ id: "result-1", text: "user-owned table content" }] };
    }
  };

  const result = await drawEnduringWound(table.uuid, {
    resolver: async uuid => uuid === table.uuid ? table : null
  });

  assert.equal(result.reason, "");
  assert.equal(result.table, table);
  assert.deepEqual(calls, [{ displayChat: true, recursive: false }]);
  assert.equal(result.draw.results[0].text, "user-owned table content");
});

test("empty and failed RollTable draws fail safe", async () => {
  const empty = await drawEnduringWound("RollTable.empty", {
    resolver: async () => ({
      documentName: "RollTable",
      async draw() { return { results: [] }; }
    })
  });
  assert.equal(empty.reason, ENDURING_WOUNDS_FAILURE.EMPTY_TABLE);

  const failed = await drawEnduringWound("RollTable.failed", {
    resolver: async () => ({
      documentName: "RollTable",
      async draw() { throw new Error("boom"); }
    })
  });
  assert.equal(failed.reason, ENDURING_WOUNDS_FAILURE.DRAW_FAILED);
});

test("settings expose profile selection and GM-supplied UUID without bundled table content", async () => {
  const source = await readFile(settingsUrl, "utf8");

  assert.match(source, /detailedWoundsSurvivalProfile/);
  assert.match(source, /enduringWoundsTableUuid/);
  assert.match(source, /MK Detailed Wounds/);
  assert.match(source, /Enduring Wounds RollTable/);
  assert.match(source, /Disabled/);
  assert.match(source, /does not include, copy, interpret, or map the table's results/);
  assert.doesNotMatch(source, /Lost Eye|Lost Arm|Lost Leg|Miracle|equipment destruction/i);
});

test("survival runtime routes profiles without writing Detailed Wounds data in the external path", async () => {
  const source = await readFile(runtimeUrl, "utf8");

  assert.match(source, /SURVIVAL_WOUND_PROFILES\.ENDURING_WOUNDS_ROLLTABLE/);
  assert.match(source, /drawEnduringWound\(getSetting\(SETTING_ENDURING_TABLE, ""\)\)/);
  assert.match(source, /api\?\.wounds\?\.rollRandom\?\.\(actor\)/);
  assert.doesNotMatch(source, /setFlag\([^\n]*detailedWounds/);
  assert.match(source, /MISSING_TABLE/);
  assert.match(source, /INVALID_TABLE/);
});

test("profile settings load before the survival watcher", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const settingsIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/survival-profile-settings.js");
  const triggerIndex = manifest.esmodules.indexOf("scripts/detailed-wounds/survival-trigger.js");

  assert.ok(settingsIndex >= 0);
  assert.ok(triggerIndex >= 0);
  assert.ok(settingsIndex < triggerIndex);
});
