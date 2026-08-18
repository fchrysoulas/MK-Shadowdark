import { waitForGmDialog } from "../libs/dialog-v2.js";

const SETTLEMENT_TYPES = Object.freeze({
  village: Object.freeze({
    id: "village",
    label: "Village",
    diceCount: 3,
    dieSides: 4,
    nameTable: Object.freeze([
      "Bruga's Hold", "Lastwatch", "Darkwater", "Ostlin",
      "Treefall", "Vorn", "Hillshire", "Nighthaven",
    ]),
  }),
  town: Object.freeze({
    id: "town",
    label: "Town",
    diceCount: 4,
    dieSides: 4,
    nameTable: Object.freeze([
      "Fairhollow", "Ivan's Keep", "Galina", "Brightlantern",
      "Corvin's Crest", "Ironbridge", "Skalvin", "Toresk",
    ]),
  }),
  city: Object.freeze({
    id: "city",
    label: "City",
    diceCount: 6,
    dieSides: 6,
    nameTable: Object.freeze([
      "Doraine", "Meridia", "King's Gate", "Myrkhos",
      "Rularn", "Ordos", "Thane", "Rahgbat",
    ]),
  }),
  metropolis: Object.freeze({
    id: "metropolis",
    label: "Metropolis",
    diceCount: 8,
    dieSides: 8,
    nameTable: Object.freeze([
      "Doraine", "Meridia", "King's Gate", "Myrkhos",
      "Rularn", "Ordos", "Thane", "Rahgbat",
    ]),
  }),
});

const SETTLEMENT_DISTRICTS = Object.freeze([
  "Slums",
  "Low district",
  "Artisan district",
  "Market",
  "High District",
  "Temple district",
  "University district",
  "Castle district",
]);

const SETTLEMENT_ALIGNMENTS = Object.freeze([
  "Lawful", "Lawful", "Lawful", "Neutral", "Neutral", "Chaotic",
]);

const DISTRICT_POINTS_OF_INTEREST = Object.freeze({
  "Slums": Object.freeze([
    "Seedy flophouse",
    "Poor tavern",
    "Poor tavern",
    "Criminal safehouse",
    "Poor shop",
    "Witch/warlock's hovel",
  ]),
  "Low district": Object.freeze([
    "Graveyard",
    "Poor tavern",
    "Poor tavern",
    "Poor shop",
    "Standard shop",
    "Warehouses/sheds",
  ]),
  "Artisan district": Object.freeze([
    "Stocks and pillories",
    "Modest temple",
    "Modest temple",
    "Standard tavern",
    "Standard tavern",
    "Wealthy shop",
  ]),
  "Market": Object.freeze([
    "Fortune teller",
    "Rare and exotic goods",
    "Rare and exotic goods",
    "Rare and exotic goods",
    "Apothecary",
    "Illicit black market",
  ]),
  "High District": Object.freeze([
    "Guildhouse",
    "Wealthy tavern",
    "Wealthy tavern",
    "Manor house",
    "Wealthy shop",
    "City Watch outpost",
  ]),
  "Temple district": Object.freeze([
    "Ruined temple",
    "Minor deity's chapel",
    "Minor deity's chapel",
    "Forbidden shrine",
    "Major god's temple",
    "Revered holy site",
  ]),
  "University district": Object.freeze([
    "Library",
    "Lecture hall",
    "Lecture hall",
    "Standard tavern",
    "Standard tavern",
    "Wizard's tower",
  ]),
  "Castle district": Object.freeze([
    "Royal bathhouse",
    "City Watch's garrison",
    "City Watch's garrison",
    "Theater or coliseum",
    "Theater or coliseum",
    "Royal castle",
  ]),
});

const ALIGNMENT_MODE_OVERALL = "overall";
const ALIGNMENT_MODE_DISTRICT = "district";
const ALIGNMENT_MODES = Object.freeze([ALIGNMENT_MODE_OVERALL, ALIGNMENT_MODE_DISTRICT]);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function dialogRoot(html) {
  if (html?.form?.querySelector) return html.form;
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function dialogValue(html, name) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.(`[name="${name}"]`)?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.(`[name="${name}"]`)?.val?.() ?? "").trim();
}

function rollDie(sides, random = Math.random) {
  const size = Math.max(1, Math.floor(Number(sides) || 1));
  const rolled = Number(random());
  const bounded = Number.isFinite(rolled) ? Math.min(Math.max(rolled, 0), 0.999999999999) : 0;
  return Math.floor(bounded * size) + 1;
}

function normalizeSettlementType(type) {
  const key = String(type ?? "").trim().toLowerCase();
  return SETTLEMENT_TYPES[key] ? key : "village";
}

function normalizeAlignmentMode(mode) {
  const key = String(mode ?? "").trim().toLowerCase();
  return ALIGNMENT_MODES.includes(key) ? key : ALIGNMENT_MODE_OVERALL;
}

function settlementDiceFormula(type) {
  const config = SETTLEMENT_TYPES[normalizeSettlementType(type)];
  return `${config.diceCount}d${config.dieSides}`;
}

function districtDieLabel(settlement) {
  const config = SETTLEMENT_TYPES[normalizeSettlementType(settlement?.type)];
  return `d${config.dieSides}`;
}

function rollAlignment(random = Math.random) {
  const roll = rollDie(6, random);
  return {
    roll,
    alignment: SETTLEMENT_ALIGNMENTS[roll - 1],
  };
}

function districtPoiTable(districtType) {
  return DISTRICT_POINTS_OF_INTEREST[districtType] ?? DISTRICT_POINTS_OF_INTEREST.Slums;
}

function rollDistrictPoi(districtType, random = Math.random) {
  const roll = rollDie(6, random);
  const table = districtPoiTable(districtType);
  return {
    roll,
    result: table[roll - 1],
  };
}

function rollSettlementDistrict({
  type = "village",
  index = 0,
  alignmentMode = ALIGNMENT_MODE_OVERALL,
  random = Math.random,
} = {}) {
  const typeKey = normalizeSettlementType(type);
  const config = SETTLEMENT_TYPES[typeKey];
  const resolvedAlignmentMode = normalizeAlignmentMode(alignmentMode);
  const districtRoll = rollDie(config.dieSides, random);
  const districtType = SETTLEMENT_DISTRICTS[districtRoll - 1];
  const poiCountRoll = rollDie(4, random);
  const pointsOfInterest = Array.from({ length: poiCountRoll }, () => rollDistrictPoi(districtType, random));
  const districtAlignment = resolvedAlignmentMode === ALIGNMENT_MODE_DISTRICT
    ? rollAlignment(random)
    : null;

  return {
    index,
    number: index + 1,
    districtRoll,
    districtType,
    poiCountRoll,
    pointsOfInterest,
    alignmentRoll: districtAlignment?.roll ?? null,
    alignment: districtAlignment?.alignment ?? null,
    seatCandidate: false,
    seatOfGovernment: false,
  };
}

function markSeatOfGovernment(districts = []) {
  if (!districts.length) return [];
  const maxRoll = Math.max(...districts.map(district => Number(district?.districtRoll) || 0));
  const candidateIndexes = districts
    .map((district, index) => ({ index, roll: Number(district?.districtRoll) || 0 }))
    .filter(candidate => candidate.roll === maxRoll)
    .map(candidate => candidate.index);
  const uniqueSeatIndex = candidateIndexes.length === 1 ? candidateIndexes[0] : -1;

  return districts.map((district, index) => ({
    ...district,
    index,
    number: index + 1,
    seatCandidate: candidateIndexes.includes(index),
    seatOfGovernment: index === uniqueSeatIndex,
  }));
}

function governmentSeatSummary(settlement) {
  const districts = settlement?.districts ?? [];
  const seat = districts.find(district => district.seatOfGovernment);
  if (seat) {
    return {
      tied: false,
      seat,
      candidates: [seat],
      label: `District ${seat.number} · ${seat.districtType} · roll ${seat.districtRoll}`,
    };
  }

  const candidates = districts.filter(district => district.seatCandidate);
  if (candidates.length > 1) {
    return {
      tied: true,
      seat: null,
      candidates,
      label: `Highest-roll tie: ${candidates.map(district => `District ${district.number} (${district.districtType}, ${district.districtRoll})`).join(" / ")} · GM chooses`,
    };
  }

  return {
    tied: false,
    seat: null,
    candidates: [],
    label: "—",
  };
}

function rollSettlementName(type, random = Math.random) {
  const typeKey = normalizeSettlementType(type);
  const config = SETTLEMENT_TYPES[typeKey];
  const roll = rollDie(8, random);
  return {
    roll,
    name: config.nameTable[roll - 1],
  };
}

function rollShadowdarkSettlement({
  type = "village",
  alignmentMode = ALIGNMENT_MODE_OVERALL,
  random = Math.random,
} = {}) {
  const typeKey = normalizeSettlementType(type);
  const config = SETTLEMENT_TYPES[typeKey];
  const resolvedAlignmentMode = normalizeAlignmentMode(alignmentMode);
  const nameResult = rollSettlementName(typeKey, random);
  const overallAlignment = resolvedAlignmentMode === ALIGNMENT_MODE_OVERALL
    ? rollAlignment(random)
    : null;

  const districts = Array.from({ length: config.diceCount }, (_, index) => rollSettlementDistrict({
    type: typeKey,
    index,
    alignmentMode: resolvedAlignmentMode,
    random,
  }));

  return {
    type: typeKey,
    typeLabel: config.label,
    diceFormula: settlementDiceFormula(typeKey),
    nameRoll: nameResult.roll,
    name: nameResult.name,
    alignmentMode: resolvedAlignmentMode,
    alignmentRoll: overallAlignment?.roll ?? null,
    alignment: overallAlignment?.alignment ?? null,
    districts: markSeatOfGovernment(districts),
  };
}

function rerollSettlementDistrict(settlement, districtIndex, { random = Math.random } = {}) {
  if (!settlement) return settlement;
  const index = Math.floor(Number(districtIndex));
  if (!Number.isInteger(index) || index < 0 || index >= (settlement.districts?.length ?? 0)) return settlement;

  const districts = settlement.districts.map((district, currentIndex) => (
    currentIndex === index
      ? rollSettlementDistrict({
        type: settlement.type,
        index,
        alignmentMode: settlement.alignmentMode,
        random,
      })
      : { ...district }
  ));

  return {
    ...settlement,
    districts: markSeatOfGovernment(districts),
  };
}

function isSettlementPoint(pointOfInterest) {
  const location = String(pointOfInterest?.location ?? "").trim().toLowerCase();
  return location === "village" || location === "city";
}

function defaultSettlementTypeForPoint(pointOfInterest) {
  const location = String(pointOfInterest?.location ?? "").trim().toLowerCase();
  if (location === "village") return "village";
  if (location === "city") return "city";
  return null;
}

function settlementOptionsDialogContent({ defaultType = "village" } = {}) {
  const typeKey = normalizeSettlementType(defaultType);
  return `
    <div class="mk-gm-create-document-form mk-gm-settlement-options-form">
      <div class="form-group">
        <label>Settlement Type</label>
        <select name="settlementType">
          ${Object.values(SETTLEMENT_TYPES).map(config => `<option value="${config.id}" ${config.id === typeKey ? "selected" : ""}>${config.label} · ${config.diceCount}d${config.dieSides}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Alignment</label>
        <select name="alignmentMode">
          <option value="overall">One alignment for the settlement</option>
          <option value="district">Roll alignment for each district</option>
        </select>
      </div>
      <p class="mk-gm-secondary">Shadowdark settlement generation records the district dice, but does not automate the physical dice-on-paper map layout.</p>
    </div>
  `;
}

async function promptForSettlementOptions({ defaultType = "village" } = {}) {
  const result = await waitForGmDialog({
    title: "Expand Shadowdark Settlement",
    content: settlementOptionsDialogContent({ defaultType }),
    buttons: [
      {
        action: "generate",
        icon: '<i class="fas fa-city"></i>',
        label: "Generate",
        default: true,
        callback: (_event, button) => ({
          type: normalizeSettlementType(dialogValue(button, "settlementType")),
          alignmentMode: normalizeAlignmentMode(dialogValue(button, "alignmentMode")),
        }),
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
    close: () => null,
  });

  return result ?? null;
}

function settlementGeneratorDialogContent(settlement, originPoint = null) {
  const seatSummary = governmentSeatSummary(settlement);
  const alignment = settlement.alignmentMode === ALIGNMENT_MODE_OVERALL
    ? `${settlement.alignment} · d6 ${settlement.alignmentRoll}`
    : "Per district";
  const dieLabel = districtDieLabel(settlement);

  return `
    <div class="mk-gm-create-document-form mk-gm-settlement-generator-form">
      <div class="form-group">
        <label>Settlement Name</label>
        <input type="text" name="name" value="${escapeHtml(settlement.name)}" autofocus autocomplete="off">
      </div>
      ${originPoint ? `<p class="mk-gm-secondary">Expanded from ${escapeHtml(originPoint.descriptor)} ${escapeHtml(originPoint.location)} · ${escapeHtml(originPoint.feature)}</p>` : ""}
      <dl class="mk-gm-data-list">
        <div><dt>Type</dt><dd>${escapeHtml(settlement.typeLabel)} · ${escapeHtml(settlement.diceFormula)}</dd></div>
        <div><dt>Name Roll</dt><dd>d8 ${settlement.nameRoll}</dd></div>
        <div><dt>Alignment</dt><dd>${escapeHtml(alignment)}</dd></div>
        <div><dt>Seat of Government</dt><dd>${escapeHtml(seatSummary.label)}</dd></div>
      </dl>
      ${seatSummary.tied ? '<div class="mk-gm-alert"><i class="fas fa-scale-balanced"></i> Shadowdark does not specify a tie-breaker for the highest district roll. Choose one of the tied candidates as the seat when using the settlement.</div>' : ""}
      <div class="form-group">
        <label>District to Reroll</label>
        <select name="districtIndex">
          ${settlement.districts.map(district => `<option value="${district.index}">District ${district.number} · ${escapeHtml(district.districtType)} · ${district.districtRoll}</option>`).join("")}
        </select>
      </div>
      <div class="mk-gm-settlement-districts">
        ${settlement.districts.map(district => `
          <section class="mk-gm-settlement-district ${district.seatOfGovernment ? "is-seat" : ""} ${district.seatCandidate && !district.seatOfGovernment ? "is-seat-candidate" : ""}">
            <strong>District ${district.number}: ${escapeHtml(district.districtType)} · ${dieLabel} ${district.districtRoll}${district.seatOfGovernment ? " · Seat of Government" : ""}${district.seatCandidate && !district.seatOfGovernment ? " · Seat candidate" : ""}</strong>
            ${district.alignment ? `<small>Alignment: ${escapeHtml(district.alignment)} · d6 ${district.alignmentRoll}</small>` : ""}
            <small>Points of Interest: d4 ${district.poiCountRoll}</small>
            <ul>${district.pointsOfInterest.map(point => `<li>d6 ${point.roll} · ${escapeHtml(point.result)}</li>`).join("")}</ul>
          </section>
        `).join("")}
      </div>
    </div>
  `;
}

async function promptForShadowdarkSettlement({
  originPoint = null,
  defaultType = defaultSettlementTypeForPoint(originPoint) ?? "village",
  promptOptions = promptForSettlementOptions,
  rollSettlement = rollShadowdarkSettlement,
  rerollDistrict = rerollSettlementDistrict,
} = {}) {
  const options = await promptOptions({ defaultType });
  if (!options) return null;

  let settlement = rollSettlement({
    type: options.type,
    alignmentMode: options.alignmentMode,
  });

  while (true) {
    const result = await waitForGmDialog({
      title: "Shadowdark Settlement",
      content: settlementGeneratorDialogContent(settlement, originPoint),
      buttons: [
        {
          action: "create",
          icon: '<i class="fas fa-plus"></i>',
          label: "Create",
          default: true,
          callback: (_event, button) => ({
            action: "create",
            name: dialogValue(button, "name"),
          }),
        },
        {
          action: "rerollDistrict",
          icon: '<i class="fas fa-building-circle-arrow-right"></i>',
          label: "Reroll District",
          callback: (_event, button) => ({
            action: "rerollDistrict",
            districtIndex: Number(dialogValue(button, "districtIndex")),
          }),
        },
        {
          action: "rerollAll",
          icon: '<i class="fas fa-dice"></i>',
          label: "Reroll Settlement",
          callback: () => ({ action: "rerollAll" }),
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-xmark"></i>',
          label: "Cancel",
          callback: () => ({ action: "cancel" }),
        },
      ],
      close: () => ({ action: "cancel" }),
    });

    if (!result || result.action === "cancel") return null;
    if (result.action === "rerollAll") {
      settlement = rollSettlement({
        type: options.type,
        alignmentMode: options.alignmentMode,
      });
      continue;
    }
    if (result.action === "rerollDistrict") {
      settlement = rerollDistrict(settlement, result.districtIndex);
      continue;
    }
    if (result.action === "create") {
      return {
        ...settlement,
        name: String(result.name ?? "").trim() || settlement.name,
      };
    }
  }
}

function buildSettlementPageContent(settlement, originPoint = null) {
  if (!settlement) return "";
  const seatSummary = governmentSeatSummary(settlement);
  const dieLabel = districtDieLabel(settlement);
  const originHtml = originPoint ? `
    <h2>Origin Point of Interest</h2>
    <table>
      <thead><tr><th>Roll</th><th>Category</th><th>Result</th></tr></thead>
      <tbody>
        <tr><td>d20 ${originPoint.descriptorRoll}</td><td>Descriptor</td><td>${escapeHtml(originPoint.descriptor)}</td></tr>
        <tr><td>d20 ${originPoint.locationRoll}</td><td>Location</td><td>${escapeHtml(originPoint.location)}</td></tr>
        <tr><td>d20 ${originPoint.featureRoll}</td><td>Feature</td><td>${escapeHtml(originPoint.feature)}</td></tr>
      </tbody>
    </table>
  ` : "";

  const alignmentHtml = settlement.alignmentMode === ALIGNMENT_MODE_OVERALL
    ? `${escapeHtml(settlement.alignment)} (d6 ${settlement.alignmentRoll})`
    : "Per district";

  return `
    <h1>${escapeHtml(settlement.name)}</h1>
    ${originHtml}
    <h2>Shadowdark Settlement</h2>
    <ul>
      <li><strong>Type:</strong> ${escapeHtml(settlement.typeLabel)}</li>
      <li><strong>Settlement dice:</strong> ${escapeHtml(settlement.diceFormula)}</li>
      <li><strong>Name:</strong> d8 ${settlement.nameRoll} · ${escapeHtml(settlement.name)}</li>
      <li><strong>Alignment:</strong> ${alignmentHtml}</li>
      <li><strong>Seat of Government:</strong> ${escapeHtml(seatSummary.label)}</li>
    </ul>
    ${seatSummary.tied ? '<p><strong>Government-seat tie:</strong> the core rule identifies the highest district roll but gives no tie-breaker. The GM chooses one of the listed highest-roll candidates.</p>' : ""}
    <h2>Districts</h2>
    ${settlement.districts.map(district => `
      <h3>District ${district.number}: ${escapeHtml(district.districtType)}${district.seatOfGovernment ? " — Seat of Government" : ""}${district.seatCandidate && !district.seatOfGovernment ? " — Seat candidate" : ""}</h3>
      <ul>
        <li><strong>District die:</strong> ${dieLabel} ${district.districtRoll}</li>
        ${district.alignment ? `<li><strong>Alignment:</strong> ${escapeHtml(district.alignment)} (d6 ${district.alignmentRoll})</li>` : ""}
        <li><strong>Points of Interest:</strong> d4 ${district.poiCountRoll}</li>
      </ul>
      <ol>
        ${district.pointsOfInterest.map(point => `<li>d6 ${point.roll} · ${escapeHtml(point.result)}</li>`).join("")}
      </ol>
    `).join("")}
    <h2>GM Notes</h2>
    <p></p>
  `.trim();
}

export {
  SETTLEMENT_TYPES,
  SETTLEMENT_DISTRICTS,
  SETTLEMENT_ALIGNMENTS,
  DISTRICT_POINTS_OF_INTEREST,
  ALIGNMENT_MODE_OVERALL,
  ALIGNMENT_MODE_DISTRICT,
  ALIGNMENT_MODES,
  rollDie,
  normalizeSettlementType,
  normalizeAlignmentMode,
  settlementDiceFormula,
  districtDieLabel,
  rollAlignment,
  rollDistrictPoi,
  rollSettlementDistrict,
  markSeatOfGovernment,
  governmentSeatSummary,
  rollSettlementName,
  rollShadowdarkSettlement,
  rerollSettlementDistrict,
  isSettlementPoint,
  defaultSettlementTypeForPoint,
  settlementOptionsDialogContent,
  promptForSettlementOptions,
  settlementGeneratorDialogContent,
  promptForShadowdarkSettlement,
  buildSettlementPageContent,
};
