import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CURSED_SCROLL_4_BOOK,
  isCursedScroll4Source,
  parseSupportedSourceTables,
} from "../scripts/source-tables/source-parser.js";
import {
  findImportedSourceTable,
  parseLabeledResultText,
  rollImportedSourceTableField,
} from "../scripts/source-tables/source-table-service.js";
import {
  findPointsOfInterestSourceTable,
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

test("Points of Interest lookup requires canonical Cursed Scroll source metadata and columns", () => {
  const table = mockSourceTable({
    rolls: [{ total: 1, text: "Descriptor: Mossy | Location: Shrine | Feature: Unstable" }],
  });
  const unrelated = {
    ...table,
    id: "other",
    name: "Other Table",
    flags: {
      "mk-shadowdark": {
        sourceTable: {
          ...table.flags["mk-shadowdark"].sourceTable,
          bookId: "shadowdark-core-v4.9",
        },
      },
    },
  };

  assert.equal(findPointsOfInterestSourceTable([unrelated, table]), table);
  assert.equal(findImportedSourceTable({
    bookId: CURSED_SCROLL_4_BOOK.id,
    requiredColumns: ["Descriptor", "Location", "Feature"],
    tables: [unrelated, table],
  }), table);
});

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

  const point = await rollShadowdarkPointOfInterestFromSource({ table });
  assert.equal(table.rollCalls, 3);
  assert.deepEqual(point, {
    descriptorRoll: 3,
    descriptor: "Mossy",
    locationRoll: 14,
    location: "Shrine",
    featureRoll: 19,
    feature: "Unstable",
    source: {
      tableId: "poi-table",
      tableUuid: "RollTable.poi-table",
      tableName: "Points of Interest — POINTS OF INTEREST",
      bookId: CURSED_SCROLL_4_BOOK.id,
      bookTitle: CURSED_SCROLL_4_BOOK.title,
      key: `${CURSED_SCROLL_4_BOOK.id}:points-of-interest:1d20`,
      pages: [27],
    },
  });
});

test("public Location runtime does not contain the former sourcebook table arrays", () => {
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_DESCRIPTORS/);
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_LOCATIONS/);
  assert.doesNotMatch(locationRuntime, /SHADOWDARK_POI_FEATURES/);
});