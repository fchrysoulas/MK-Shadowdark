import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCATION_GENERATOR_TABLE_FLAG,
  LOCATION_GENERATOR_TABLE_KEYS,
  getSceneLocationGeneratorTables,
  locationGeneratorTableStatus,
  normalizeLocationGeneratorTables,
  renderLocationGeneratorSetup,
  resolveLocationGeneratorEntries,
  setSceneLocationGeneratorTable,
} from "../scripts/gm-screen/location-generator-settings.js";

function mockTable(id, name = id) {
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    documentName: "RollTable",
    roll() {},
  };
}

test("Location Generator assignments normalize to three Scene-owned table slots", () => {
  assert.deepEqual(normalizeLocationGeneratorTables({
    descriptor: { uuid: "RollTable.descriptor" },
    location: "RollTable.location",
    feature: "RollTable.feature",
  }), {
    schema: 1,
    descriptor: "RollTable.descriptor",
    location: "RollTable.location",
    feature: "RollTable.feature",
  });
  assert.deepEqual(LOCATION_GENERATOR_TABLE_KEYS, ["descriptor", "location", "feature"]);
});

test("Location Generator status reports incomplete and unavailable linked assignments", () => {
  const status = locationGeneratorTableStatus({
    descriptor: "RollTable.descriptor",
    location: "RollTable.location",
    feature: "",
  }, [mockTable("descriptor")]);

  assert.equal(status.configured, true);
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Feature"]);
  assert.deepEqual(status.unavailable, ["Location"]);
  assert.equal(status.tables.descriptor.name, "descriptor");
});

test("Location Generator settings render one drag target for each linked RollTable", () => {
  const html = renderLocationGeneratorSetup([
    { key: "descriptor", label: "Descriptor", description: "Descriptor", uuid: "RollTable.descriptor", table: mockTable("descriptor", "Descriptors") },
    { key: "location", label: "Location", description: "Location", uuid: "", table: null },
    { key: "feature", label: "Feature", description: "Feature", uuid: "RollTable.feature", table: mockTable("feature", "Features") },
  ]);

  assert.equal((html.match(/data-mk-location-generator-slot=/g) ?? []).length, 3);
  assert.equal((html.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, 3);
  assert.match(html, /mk-gm-rolltable-assignment-grid/);
  assert.match(html, /Descriptors/);
  assert.match(html, /Features/);
  assert.match(html, /Drop RollTable here/);
  assert.match(html, /data-mk-location-generator-clear/);
});

test("Location Generator assignments read, write, and resolve the active Scene tables", async () => {
  let stored = {
    descriptor: "RollTable.descriptor",
    location: "",
    feature: "",
  };
  const scene = {
    getFlag(moduleId, key) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, LOCATION_GENERATOR_TABLE_FLAG);
      return stored;
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "mk-shadowdark");
      assert.equal(key, LOCATION_GENERATOR_TABLE_FLAG);
      stored = value;
    },
  };

  assert.deepEqual(getSceneLocationGeneratorTables(scene), {
    schema: 1,
    descriptor: "RollTable.descriptor",
    location: "",
    feature: "",
  });
  await setSceneLocationGeneratorTable("feature", "RollTable.feature", scene, { user: { isGM: true } });
  assert.equal(stored.feature, "RollTable.feature");

  const entries = await resolveLocationGeneratorEntries(scene, [
    mockTable("descriptor", "Descriptor"),
    mockTable("feature", "Feature"),
  ]);
  assert.deepEqual(entries.map(entry => entry.table?.name ?? ""), ["Descriptor", "", "Feature"]);
});
