import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CURSED_SCROLL_4_BOOK,
  isCursedScroll4Source,
  parseSupportedSourceTables,
} from "../scripts/source-tables/source-parser.js";
import {
  parseLabeledResultText,
  rollImportedSourceTableField,
} from "../scripts/source-tables/source-table-service.js";
import {
  locationSourceStatus,
  rollShadowdarkPointOfInterestFromSource,
} from "../scripts/gm-screen/location-source-table.js";
import {
  filePickerContent,
  sourceFolderName,
} from "../scripts/source-tables/source-table-importer.js";

const locationRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/exploration-creation-controls.js", import.meta.url),
  "utf8",
);

const SYNTHETIC_CURSED_SCROLL = `
# Cursed Scroll 4: River of Night V1-2
<!-- PDF page 27 -->
# Points of Interest
### POINTS OF INTEREST
| d20 | Descriptor | Location | Feature |
| --- | --- | --- | --- |
| 1-10 | Mossy | Shrine | Unstable |
| 11-20 | Sunken | Vault | Echoing |
`;

test("Cursed Scroll 4 source is detected separately from Core and Western Reaches", () => {
  assert.equal(isCursedScroll4Source(SYNTHETIC_CURSED_SCROLL, "shadowdark-cursed-scroll-4.md"), true);
  const parsed = parseSupportedSourceTables(SYNTHETIC_CURSED_SCROLL, {
    filename: "shadowdark-cursed-scroll-4.md",
  });
  assert.equal(parsed.book.id, CURSED_SCROLL_4_BOOK.id);
  assert.equal(parsed.book.title, CURSED_SCROLL_4_BOOK.title);
  assert.equal(parsed.tables.length, 1);
  assert.equal(parsed.tables[0].bookId, CURSED_SCROLL_4_BOOK.id);
  assert.match(parsed.tables[0].key, /^cursed-scroll-4-river-of-night-v1-2:/);
  assert.deepEqual(parsed.tables[0].columns, ["d20", "Descriptor", "Location", "Feature"]);
});

test("source importer advertises Cursed Scroll 4 and can use its parsed title as folder name", () => {
  assert.match(filePickerContent(), /Cursed Scroll 4: River of Night V1-2/);
  assert.equal(
    sourceFolderName(CURSED_SCROLL_4_BOOK.id, CURSED_SCROLL_4_BOOK.title),
    CURSED_SCROLL_4_BOOK.title,
  );
});

test("labeled imported table result text exposes individual source columns", () => {
  assert.deepEqual(
    parseLabeledResultText("Descriptor: Mossy | Location: Shrine | Feature: Unstable"),
    {
      Descriptor: "Mossy",
      Location: "Shrine",
      Feature: "Unstable",
    },
  );
});

function mockSourceTable({ rolls = [] } = {}) {
  let index = 0;
  return {
    id: "poi-table",
    uuid: "RollTable.poi-table",
    name: "Points of Interest — POINTS OF INTEREST",
    flags: {
      "mk-shadowdark": {
        sourceTable: {
          key: `${CURSED_SCROLL_4_BOOK.id}:points-of-interest:1d20`,
          bookId: CURSED_SCROLL_4_BOOK.id,
          bookTitle: CURSED_SCROLL_4_BOOK.title,
          pages: [27],
          columns: ["d20", "Descriptor", "Location", "Feature"],
        },
      },
    },
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
    async roll() {
      const current = rolls[index++] ?? rolls.at(-1);
      return {
        roll: { total: current.total },
        results: [{ text: current.text }],
      };
    },
    get rollCalls() {
      return index;
    },
  };
}

test("field roll uses RollTable.roll without chat and extracts requested labeled field", async () => {
  const table = mockSourceTable({
    rolls: [{ total: 12, text: "Descriptor: Sunken | Location: Vault | Feature: Echoing" }],
  });
  const result = await rollImportedSourceTableField(table, "Location");
  assert.equal(result.total, 12);
  assert.equal(result.value, "Vault");
});

test("Location generation performs three independent RollTable rolls and preserves totals", async () => {
  const table = mockSourceTable({
    rolls: [
      { total: 3, text: "Descriptor: Mossy | Location: First Place | Feature: First Feature" },
      { total: 14, text: "Descriptor: Second Descriptor | Location: Shrine | Feature: Second Feature" },
      { total: 19, text: "Descriptor: Third Descriptor | Location: Third Place | Feature: Unstable" },
    ],
  });

  const scene = {
    getFlag() {
      return {
        descriptor: table.uuid,
        location: table.uuid,
        feature: table.uuid,
      };
    },
  };
  const point = await rollShadowdarkPointOfInterestFromSource({ tables: [table], scene });
  assert.equal(table.rollCalls, 3);
  assert.equal(point.descriptorRoll, 3);
  assert.equal(point.descriptor, "Mossy");
  assert.equal(point.locationRoll, 14);
  assert.equal(point.location, "Shrine");
  assert.equal(point.featureRoll, 19);
  assert.equal(point.feature, "Unstable");
  assert.deepEqual(Object.keys(point.sources), ["descriptor", "location", "feature"]);
  assert.equal(point.source.tableUuid, table.uuid);
});

test("Location generation honors separate table selections for each value", async () => {
  const descriptorTable = mockSourceTable({
    rolls: [{ total: 2, text: "Descriptor: Mossy | Location: Ignored | Feature: Ignored" }],
  });
  descriptorTable.id = "descriptor-table";
  descriptorTable.uuid = "RollTable.descriptor-table";
  const locationTable = mockSourceTable({
    rolls: [{ total: 11, text: "Descriptor: Ignored | Location: Shrine | Feature: Ignored" }],
  });
  locationTable.id = "location-table";
  locationTable.uuid = "RollTable.location-table";
  const featureTable = mockSourceTable({
    rolls: [{ total: 17, text: "Descriptor: Ignored | Location: Ignored | Feature: Unstable" }],
  });
  featureTable.id = "feature-table";
  featureTable.uuid = "RollTable.feature-table";

  const scene = {
    getFlag() {
      return {
      descriptor: descriptorTable.uuid,
      location: locationTable.uuid,
      feature: featureTable.uuid,
      };
    },
  };
  const point = await rollShadowdarkPointOfInterestFromSource({
    tables: [descriptorTable, locationTable, featureTable],
    scene,
  });

  assert.equal(point.descriptor, "Mossy");
  assert.equal(point.location, "Shrine");
  assert.equal(point.feature, "Unstable");
  assert.deepEqual(Object.keys(point.sources), ["descriptor", "location", "feature"]);
});

test("Scene-linked Location Generator assignments drive every location result", async () => {
  const descriptorTable = mockSourceTable({
    rolls: [{ total: 4, text: "Descriptor: Mossy | Location: Ignored | Feature: Ignored" }],
  });
  descriptorTable.id = "linked-descriptor";
  descriptorTable.uuid = "RollTable.linked-descriptor";
  const locationTable = mockSourceTable({
    rolls: [{ total: 12, text: "Descriptor: Ignored | Location: Shrine | Feature: Ignored" }],
  });
  locationTable.id = "linked-location";
  locationTable.uuid = "RollTable.linked-location";
  const featureTable = mockSourceTable({
    rolls: [{ total: 19, text: "Descriptor: Ignored | Location: Ignored | Feature: Unstable" }],
  });
  featureTable.id = "linked-feature";
  featureTable.uuid = "RollTable.linked-feature";
  const tables = [descriptorTable, locationTable, featureTable];
  const scene = {
    getFlag() {
      return {
        descriptor: descriptorTable.uuid,
        location: locationTable.uuid,
        feature: featureTable.uuid,
      };
    },
  };

  const status = locationSourceStatus(tables, { scene });
  assert.equal(status.mode, "linked");
  assert.equal(status.available, true);

  const point = await rollShadowdarkPointOfInterestFromSource({ tables, scene });
  assert.equal(point.descriptor, "Mossy");
  assert.equal(point.location, "Shrine");
  assert.equal(point.feature, "Unstable");
  assert.deepEqual(Object.keys(point.sources), ["descriptor", "location", "feature"]);
});

test("Location generation does not fall back to an imported source table", async () => {
  const sourceTable = mockSourceTable({
    rolls: [{ total: 1, text: "Descriptor: Mossy | Location: Shrine | Feature: Unstable" }],
  });
  const scene = { getFlag() { return null; } };

  const status = locationSourceStatus([sourceTable], { scene });
  assert.equal(status.mode, "linked");
  assert.equal(status.available, false);
  assert.deepEqual(status.missing, ["Descriptor", "Location", "Feature"]);

  const result = await rollShadowdarkPointOfInterestFromSource({
    tables: [sourceTable],
    scene,
  });
  assert.deepEqual(result, {
    mode: "missing-linked-tables",
    missing: ["Descriptor", "Location", "Feature"],
    unavailable: [],
  });
  assert.equal(sourceTable.rollCalls, 0);
});

test("public Location runtime does not contain the former sourcebook table arrays", () => {
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_DESCRIPTORS/);
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_LOCATIONS/);
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_FEATURES/);
});
