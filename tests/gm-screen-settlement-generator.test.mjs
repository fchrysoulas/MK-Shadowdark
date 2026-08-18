import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ALIGNMENT_MODE_DISTRICT,
  ALIGNMENT_MODE_OVERALL,
  SETTLEMENT_TYPES,
  buildSettlementPageContent,
  defaultSettlementTypeForPoint,
  governmentSeatSummary,
  isSettlementPoint,
  markSeatOfGovernment,
  rerollSettlementDistrict,
  rollShadowdarkSettlement,
  settlementDiceFormula,
} from "../scripts/gm-screen/settlement-generator.js";
import {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  resolveSettlementTypeConfig,
  settlementSourceStatus,
} from "../scripts/gm-screen/settlement-source-tables.js";

const locationRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/exploration-creation-controls.js", import.meta.url),
  "utf8",
);
const settlementRuntime = fs.readFileSync(
  new URL("../scripts/gm-screen/settlement-generator.js", import.meta.url),
  "utf8",
);

function constantRandom(value) {
  return () => value;
}

function sourceFlag({ key, columns, pages = [100] }) {
  return {
    key,
    bookId: CORE_BOOK_ID,
    bookTitle: CORE_BOOK_TITLE,
    columns,
    pages,
  };
}

function mockTable({ id, name, formula, columns, results, rollTotals = [], pages = [100] }) {
  let rollIndex = 0;
  const table = {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula,
    results: results.map((result, index) => ({ id: `${id}-${index}`, ...result })),
    flags: {
      "mk-shadowdark": {
        sourceTable: sourceFlag({ key: `${CORE_BOOK_ID}:${id}`, columns, pages }),
      },
    },
    getFlag(moduleId, key) {
      return this.flags?.[moduleId]?.[key];
    },
    async roll() {
      const total = rollTotals[rollIndex++] ?? rollTotals.at(-1) ?? 1;
      const result = this.results.find(entry => total >= entry.range[0] && total <= entry.range[1]);
      return { roll: { total }, results: result ? [result] : [] };
    },
  };
  return table;
}

function syntheticSettlementTables() {
  const type = mockTable({
    id: "settlement-type",
    name: "Settlement Maps — Type",
    formula: "1d6",
    columns: ["d6", "Settlement Type", "Dice"],
    results: [
      { range: [1, 1], text: "Settlement Type: Village | Dice: 3d4" },
      { range: [2, 3], text: "Settlement Type: Town | Dice: 4d4" },
      { range: [4, 5], text: "Settlement Type: City | Dice: 6d6" },
      { range: [6, 6], text: "Settlement Type: Metropolis | Dice: 8d8" },
    ],
  });
  const names = mockTable({
    id: "settlement-name",
    name: "Overland — Settlement Name",
    formula: "1d8",
    columns: ["d8", "Village", "Town", "City/Metropolis"],
    results: Array.from({ length: 8 }, (_, index) => ({
      range: [index + 1, index + 1],
      text: `Village: Hamlet ${index + 1} | Town: Borough ${index + 1} | City/Metropolis: Capital ${index + 1}`,
    })),
    rollTotals: [2, 3, 4, 5],
    pages: [101],
  });
  const districtNames = Array.from({ length: 8 }, (_, index) => `District ${index + 1}`);
  const districts = mockTable({
    id: "districts",
    name: "Settlement Maps — Districts",
    formula: "1d8",
    columns: ["d8", "Type"],
    results: districtNames.map((name, index) => ({
      range: [index + 1, index + 1],
      text: name,
    })),
    pages: [102],
  });
  const alignment = mockTable({
    id: "alignment",
    name: "Settlement Maps — Alignment",
    formula: "1d6",
    columns: ["d6", "Alignment"],
    results: [
      { range: [1, 3], text: "Ordered" },
      { range: [4, 5], text: "Unaligned" },
      { range: [6, 6], text: "Wild" },
    ],
    rollTotals: Array(20).fill(1),
    pages: [102],
  });
  const poiTables = districtNames.map((districtName, districtIndex) => mockTable({
    id: `poi-${districtIndex + 1}`,
    name: `Settlement Maps — ${districtName}`,
    formula: "1d6",
    columns: ["d6", "Point of Interest"],
    results: Array.from({ length: 6 }, (_, index) => ({
      range: [index + 1, index + 1],
      text: `Feature ${districtIndex + 1}.${index + 1}`,
    })),
    rollTotals: Array(20).fill(1),
    pages: [103],
  }));

  return [type, names, districts, alignment, ...poiTables];
}

function districtContentWithoutSeatMetadata(district) {
  const {
    seatCandidate: _seatCandidate,
    seatOfGovernment: _seatOfGovernment,
    ...content
  } = district;
  return content;
}

test("Settlement type selector retains only non-source type identifiers and labels", () => {
  assert.deepEqual(SETTLEMENT_TYPES, {
    village: { id: "village", label: "Village" },
    town: { id: "town", label: "Town" },
    city: { id: "city", label: "City" },
    metropolis: { id: "metropolis", label: "Metropolis" },
  });
});

test("settlement dice formula and type configuration are derived from imported Type RollTable", () => {
  const tables = syntheticSettlementTables();
  const status = settlementSourceStatus(tables);
  assert.equal(status.available, true);
  assert.deepEqual(resolveSettlementTypeConfig("village", { table: status.tables.type }), {
    id: "village",
    label: "Village",
    diceFormula: "3d4",
    diceCount: 3,
    dieSides: 4,
    sourceTable: status.tables.type,
  });
  assert.equal(settlementDiceFormula("metropolis", { sourceStatus: status, tables }), "8d8");
});

test("source status requires the base settlement tables and every district POI table", () => {
  const tables = syntheticSettlementTables();
  assert.equal(settlementSourceStatus(tables).available, true);
  const missingOne = tables.filter(table => table.id !== "poi-8");
  const status = settlementSourceStatus(missingOne);
  assert.equal(status.available, false);
  assert.ok(status.missing.some(value => value.includes("District 8")));
});

test("Settlement generation uses source-derived district count and die size", async () => {
  for (const [type, expected] of Object.entries({
    village: { count: 3, sides: 4 },
    town: { count: 4, sides: 4 },
    city: { count: 6, sides: 6 },
    metropolis: { count: 8, sides: 8 },
  })) {
    const tables = syntheticSettlementTables();
    const status = settlementSourceStatus(tables);
    const settlement = await rollShadowdarkSettlement({
      type,
      alignmentMode: ALIGNMENT_MODE_OVERALL,
      random: constantRandom(0),
      sourceStatus: status,
      tables,
    });
    assert.equal(settlement.districts.length, expected.count);
    assert.equal(settlement.diceFormula, `${expected.count}d${expected.sides}`);
    assert.equal(settlement.districtDieSides, expected.sides);
    assert.ok(settlement.districts.every(district => district.districtRoll === 1));
    assert.ok(settlement.districts.every(district => district.districtType === "District 1"));
    assert.equal(settlement.districts.filter(district => district.seatOfGovernment).length, 0);
    assert.equal(settlement.districts.filter(district => district.seatCandidate).length, expected.count);
    assert.equal(settlement.alignment, "Ordered");
    assert.equal(settlement.alignmentRoll, 1);
  }
});

test("Each district rolls 1d4 main POIs from its matching imported district table", async () => {
  const tables = syntheticSettlementTables();
  const status = settlementSourceStatus(tables);
  const settlement = await rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
    sourceStatus: status,
    tables,
  });
  for (const district of settlement.districts) {
    assert.equal(district.poiCountRoll, 1);
    assert.equal(district.pointsOfInterest.length, 1);
    assert.equal(district.pointsOfInterest[0].roll, 1);
    assert.equal(district.pointsOfInterest[0].result, "Feature 1.1");
    assert.equal(district.pointsOfInterest[0].source.name, "Settlement Maps — District 1");
  }
});

test("Per-district alignment uses imported Alignment RollTable for every district", async () => {
  const tables = syntheticSettlementTables();
  const status = settlementSourceStatus(tables);
  const settlement = await rollShadowdarkSettlement({
    type: "town",
    alignmentMode: ALIGNMENT_MODE_DISTRICT,
    random: constantRandom(0),
    sourceStatus: status,
    tables,
  });
  assert.equal(settlement.alignment, null);
  assert.equal(settlement.alignmentRoll, null);
  assert.ok(settlement.districts.every(district => district.alignment === "Ordered"));
  assert.ok(settlement.districts.every(district => district.alignmentRoll === 1));
});

test("A unique highest district roll identifies the seat of government", () => {
  const districts = markSeatOfGovernment([
    { districtRoll: 2, districtType: "District A" },
    { districtRoll: 4, districtType: "District B" },
    { districtRoll: 3, districtType: "District C" },
  ]);
  assert.equal(districts[0].seatCandidate, false);
  assert.equal(districts[1].seatCandidate, true);
  assert.equal(districts[1].seatOfGovernment, true);
  assert.equal(districts[2].seatCandidate, false);
});

test("Highest-roll ties stay explicit because the source rule gives no tie-breaker", () => {
  const settlement = {
    districts: markSeatOfGovernment([
      { districtRoll: 2, districtType: "District A" },
      { districtRoll: 4, districtType: "District B" },
      { districtRoll: 4, districtType: "District C" },
    ]),
  };
  const summary = governmentSeatSummary(settlement);
  assert.equal(settlement.districts.filter(district => district.seatOfGovernment).length, 0);
  assert.deepEqual(
    settlement.districts.filter(district => district.seatCandidate).map(district => district.number),
    [2, 3],
  );
  assert.equal(summary.tied, true);
  assert.match(summary.label, /GM chooses/);
});

test("Reroll District replaces only selected source-driven district and recalculates seat metadata", async () => {
  const tables = syntheticSettlementTables();
  const status = settlementSourceStatus(tables);
  const original = await rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
    sourceStatus: status,
    tables,
  });
  const firstBefore = districtContentWithoutSeatMetadata(original.districts[0]);
  const thirdBefore = districtContentWithoutSeatMetadata(original.districts[2]);

  const rerolled = await rerollSettlementDistrict(original, 1, {
    random: constantRandom(0.999999),
    sourceStatus: status,
    tables,
  });

  assert.deepEqual(districtContentWithoutSeatMetadata(rerolled.districts[0]), firstBefore);
  assert.deepEqual(districtContentWithoutSeatMetadata(rerolled.districts[2]), thirdBefore);
  assert.equal(rerolled.districts[1].districtRoll, 4);
  assert.equal(rerolled.districts[1].districtType, "District 4");
  assert.equal(rerolled.districts[1].poiCountRoll, 4);
  assert.equal(rerolled.districts[1].seatCandidate, true);
  assert.equal(rerolled.districts[1].seatOfGovernment, true);
});

test("Generated Village and City POIs remain eligible for settlement expansion", () => {
  assert.equal(isSettlementPoint({ location: "Village" }), true);
  assert.equal(isSettlementPoint({ location: "City" }), true);
  assert.equal(isSettlementPoint({ location: "Ruin" }), false);
  assert.equal(defaultSettlementTypeForPoint({ location: "Village" }), "village");
  assert.equal(defaultSettlementTypeForPoint({ location: "City" }), "city");
  assert.equal(defaultSettlementTypeForPoint({ location: "Town" }), null);
});

test("Settlement Journal preserves source provenance, rolls, districts, POIs, seat handling, and notes", async () => {
  const tables = syntheticSettlementTables();
  const status = settlementSourceStatus(tables);
  const settlement = await rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
    sourceStatus: status,
    tables,
  });
  const origin = {
    descriptorRoll: 8,
    descriptor: "Synthetic",
    locationRoll: 19,
    location: "Village",
    featureRoll: 9,
    feature: "Test Feature",
  };
  const html = buildSettlementPageContent(settlement, origin);
  assert.match(html, /Origin Point of Interest/);
  assert.match(html, /Synthetic/);
  assert.match(html, /Shadowdark Settlement/);
  assert.match(html, /Shadowdark RPG Core Rulebook v4\.9/);
  assert.match(html, /3d4/);
  assert.match(html, /Seat of Government/);
  assert.match(html, /Government-seat tie/);
  assert.match(html, /Feature 1\.1/);
  assert.match(html, /GM Notes/);
});

test("Settlement runtime no longer embeds sourcebook names, district arrays, alignment weights, or POI arrays", () => {
  assert.doesNotMatch(settlementRuntime, /DISTRICT_POINTS_OF_INTEREST/);
  assert.doesNotMatch(settlementRuntime, /SETTLEMENT_DISTRICTS/);
  assert.doesNotMatch(settlementRuntime, /SETTLEMENT_ALIGNMENTS/);
  assert.doesNotMatch(settlementRuntime, /nameTable/);
  assert.match(settlementRuntime, /settlementSourceStatus/);
  assert.match(settlementRuntime, /rollDistrictPoiFromSource|rollDistrictPoi/);
});

test("Create Location still exposes settlement expansion without adding gameplay state", () => {
  assert.match(locationRuntime, /Expand Settlement/);
  assert.match(locationRuntime, /promptForShadowdarkSettlement/);
  assert.match(locationRuntime, /defaultSettlementTypeForPoint/);
  assert.doesNotMatch(settlementRuntime, /setFlag\s*\(/);
  assert.doesNotMatch(settlementRuntime, /game\.settings\.set/);
  assert.doesNotMatch(settlementRuntime, /createEmbeddedDocuments/);
});