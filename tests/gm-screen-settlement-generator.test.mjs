import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ALIGNMENT_MODE_DISTRICT,
  ALIGNMENT_MODE_OVERALL,
  DISTRICT_POINTS_OF_INTEREST,
  SETTLEMENT_ALIGNMENTS,
  SETTLEMENT_DISTRICTS,
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

function districtContentWithoutSeatMetadata(district) {
  const {
    seatCandidate: _seatCandidate,
    seatOfGovernment: _seatOfGovernment,
    ...content
  } = district;
  return content;
}

test("Shadowdark settlement type dice and official name tables are preserved", () => {
  assert.deepEqual(SETTLEMENT_TYPES.village, {
    id: "village",
    label: "Village",
    diceCount: 3,
    dieSides: 4,
    nameTable: ["Bruga's Hold", "Lastwatch", "Darkwater", "Ostlin", "Treefall", "Vorn", "Hillshire", "Nighthaven"],
  });
  assert.deepEqual(SETTLEMENT_TYPES.town, {
    id: "town",
    label: "Town",
    diceCount: 4,
    dieSides: 4,
    nameTable: ["Fairhollow", "Ivan's Keep", "Galina", "Brightlantern", "Corvin's Crest", "Ironbridge", "Skalvin", "Toresk"],
  });
  assert.equal(SETTLEMENT_TYPES.city.diceCount, 6);
  assert.equal(SETTLEMENT_TYPES.city.dieSides, 6);
  assert.equal(SETTLEMENT_TYPES.metropolis.diceCount, 8);
  assert.equal(SETTLEMENT_TYPES.metropolis.dieSides, 8);
  assert.deepEqual(SETTLEMENT_TYPES.city.nameTable, ["Doraine", "Meridia", "King's Gate", "Myrkhos", "Rularn", "Ordos", "Thane", "Rahgbat"]);
  assert.deepEqual(SETTLEMENT_TYPES.metropolis.nameTable, SETTLEMENT_TYPES.city.nameTable);
  assert.equal(settlementDiceFormula("village"), "3d4");
  assert.equal(settlementDiceFormula("town"), "4d4");
  assert.equal(settlementDiceFormula("city"), "6d6");
  assert.equal(settlementDiceFormula("metropolis"), "8d8");
});

test("Shadowdark district and alignment tables match the core rules", () => {
  assert.deepEqual(SETTLEMENT_DISTRICTS, [
    "Slums",
    "Low district",
    "Artisan district",
    "Market",
    "High District",
    "Temple district",
    "University district",
    "Castle district",
  ]);
  assert.deepEqual(SETTLEMENT_ALIGNMENTS, [
    "Lawful", "Lawful", "Lawful", "Neutral", "Neutral", "Chaotic",
  ]);
});

test("Shadowdark district point-of-interest d6 tables preserve weighted results", () => {
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST.Slums, [
    "Seedy flophouse", "Poor tavern", "Poor tavern", "Criminal safehouse", "Poor shop", "Witch/warlock's hovel",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["Low district"], [
    "Graveyard", "Poor tavern", "Poor tavern", "Poor shop", "Standard shop", "Warehouses/sheds",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["Artisan district"], [
    "Stocks and pillories", "Modest temple", "Modest temple", "Standard tavern", "Standard tavern", "Wealthy shop",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST.Market, [
    "Fortune teller", "Rare and exotic goods", "Rare and exotic goods", "Rare and exotic goods", "Apothecary", "Illicit black market",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["High District"], [
    "Guildhouse", "Wealthy tavern", "Wealthy tavern", "Manor house", "Wealthy shop", "City Watch outpost",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["Temple district"], [
    "Ruined temple", "Minor deity's chapel", "Minor deity's chapel", "Forbidden shrine", "Major god's temple", "Revered holy site",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["University district"], [
    "Library", "Lecture hall", "Lecture hall", "Standard tavern", "Standard tavern", "Wizard's tower",
  ]);
  assert.deepEqual(DISTRICT_POINTS_OF_INTEREST["Castle district"], [
    "Royal bathhouse", "City Watch's garrison", "City Watch's garrison", "Theater or coliseum", "Theater or coliseum", "Royal castle",
  ]);
});

test("Settlement generation uses the correct district count and die size for every type", () => {
  for (const [type, expected] of Object.entries({
    village: { count: 3, sides: 4 },
    town: { count: 4, sides: 4 },
    city: { count: 6, sides: 6 },
    metropolis: { count: 8, sides: 8 },
  })) {
    const settlement = rollShadowdarkSettlement({
      type,
      alignmentMode: ALIGNMENT_MODE_OVERALL,
      random: constantRandom(0),
    });
    assert.equal(settlement.districts.length, expected.count);
    assert.equal(settlement.diceFormula, `${expected.count}d${expected.sides}`);
    assert.ok(settlement.districts.every(district => district.districtRoll >= 1 && district.districtRoll <= expected.sides));
    assert.equal(settlement.districts.filter(district => district.seatOfGovernment).length, 0);
    assert.equal(settlement.districts.filter(district => district.seatCandidate).length, expected.count);
    assert.equal(settlement.alignment, "Lawful");
    assert.equal(settlement.alignmentRoll, 1);
  }
});

test("Each district rolls 1d4 main points of interest from its own d6 table", () => {
  const settlement = rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
  });
  for (const district of settlement.districts) {
    assert.equal(district.districtType, "Slums");
    assert.equal(district.poiCountRoll, 1);
    assert.equal(district.pointsOfInterest.length, 1);
    assert.deepEqual(district.pointsOfInterest[0], { roll: 1, result: "Seedy flophouse" });
  }
});

test("Per-district alignment mode rolls alignment for every district instead of the settlement", () => {
  const settlement = rollShadowdarkSettlement({
    type: "town",
    alignmentMode: ALIGNMENT_MODE_DISTRICT,
    random: constantRandom(0.999999),
  });
  assert.equal(settlement.alignment, null);
  assert.equal(settlement.alignmentRoll, null);
  assert.ok(settlement.districts.every(district => district.alignment === "Chaotic"));
  assert.ok(settlement.districts.every(district => district.alignmentRoll === 6));
});

test("A unique highest district roll identifies the seat of government", () => {
  const districts = markSeatOfGovernment([
    { districtRoll: 2, districtType: "Low district" },
    { districtRoll: 4, districtType: "Market" },
    { districtRoll: 3, districtType: "Artisan district" },
  ]);
  assert.equal(districts[0].seatCandidate, false);
  assert.equal(districts[1].seatCandidate, true);
  assert.equal(districts[1].seatOfGovernment, true);
  assert.equal(districts[2].seatCandidate, false);
});

test("Highest-roll ties stay explicit because Shadowdark gives no tie-breaker", () => {
  const settlement = {
    districts: markSeatOfGovernment([
      { districtRoll: 2, districtType: "Low district" },
      { districtRoll: 4, districtType: "Market" },
      { districtRoll: 4, districtType: "Market" },
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

test("Reroll District changes only selected district content and recalculates government metadata", () => {
  const original = rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
  });
  const firstBefore = districtContentWithoutSeatMetadata(original.districts[0]);
  const thirdBefore = districtContentWithoutSeatMetadata(original.districts[2]);

  const rerolled = rerollSettlementDistrict(original, 1, {
    random: constantRandom(0.999999),
  });

  assert.deepEqual(districtContentWithoutSeatMetadata(rerolled.districts[0]), firstBefore);
  assert.deepEqual(districtContentWithoutSeatMetadata(rerolled.districts[2]), thirdBefore);
  assert.equal(rerolled.districts[1].districtRoll, 4);
  assert.equal(rerolled.districts[1].districtType, "Market");
  assert.equal(rerolled.districts[1].poiCountRoll, 4);
  assert.equal(rerolled.districts[1].seatCandidate, true);
  assert.equal(rerolled.districts[1].seatOfGovernment, true);
  assert.equal(rerolled.districts[0].seatCandidate, false);
  assert.equal(rerolled.districts[2].seatCandidate, false);
});

test("Generated Village and City POIs are eligible for settlement expansion", () => {
  assert.equal(isSettlementPoint({ location: "Village" }), true);
  assert.equal(isSettlementPoint({ location: "City" }), true);
  assert.equal(isSettlementPoint({ location: "Ruin" }), false);
  assert.equal(defaultSettlementTypeForPoint({ location: "Village" }), "village");
  assert.equal(defaultSettlementTypeForPoint({ location: "City" }), "city");
  assert.equal(defaultSettlementTypeForPoint({ location: "Town" }), null);
});

test("Settlement Journal output preserves the origin POI, dice, districts, POIs, seat handling, and notes", () => {
  const settlement = rollShadowdarkSettlement({
    type: "village",
    random: constantRandom(0),
  });
  const origin = {
    descriptorRoll: 8,
    descriptor: "Haunted",
    locationRoll: 19,
    location: "Village",
    featureRoll: 9,
    feature: "Changes at night",
  };
  const html = buildSettlementPageContent(settlement, origin);
  assert.match(html, /Origin Point of Interest/);
  assert.match(html, /Haunted/);
  assert.match(html, /Village/);
  assert.match(html, /Changes at night/);
  assert.match(html, /Shadowdark Settlement/);
  assert.match(html, /3d4/);
  assert.match(html, /Seat of Government/);
  assert.match(html, /Government-seat tie/);
  assert.match(html, /Seedy flophouse/);
  assert.match(html, /GM Notes/);
});

test("Create Location exposes settlement expansion without adding new gameplay state", () => {
  assert.match(locationRuntime, /Expand Settlement/);
  assert.match(locationRuntime, /promptForShadowdarkSettlement/);
  assert.match(locationRuntime, /defaultSettlementTypeForPoint/);
  assert.doesNotMatch(settlementRuntime, /setFlag\s*\(/);
  assert.doesNotMatch(settlementRuntime, /game\.settings\.set/);
  assert.doesNotMatch(settlementRuntime, /createEmbeddedDocuments/);
});
