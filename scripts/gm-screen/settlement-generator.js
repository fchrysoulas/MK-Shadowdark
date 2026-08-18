import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  CORE_BOOK_TITLE,
  districtTypeFromSourceRoll,
  resolveSettlementTypeConfig,
  rollAlignmentFromSource,
  rollDistrictPoiFromSource,
  rollSettlementNameFromSource,
  settlementSourceStatus,
  tableProvenance,
} from "./settlement-source-tables.js";

const SETTLEMENT_TYPES = Object.freeze({
  village: Object.freeze({ id: "village", label: "Village" }),
  town: Object.freeze({ id: "town", label: "Town" }),
  city: Object.freeze({ id: "city", label: "City" }),
  metropolis: Object.freeze({ id: "metropolis", label: "Metropolis" }),
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

function settlementDiceFormula(type, { sourceStatus = null, tables = globalThis.game?.tables } = {}) {
  const status = sourceStatus ?? settlementSourceStatus(tables);
  return resolveSettlementTypeConfig(normalizeSettlementType(type), {
    table: status?.tables?.type ?? null,
    tables,
  })?.diceFormula ?? "";
}

function districtDieLabel(settlement) {
  const sides = Number(settlement?.districtDieSides);
  if (Number.isInteger(sides) && sides > 1) return `d${sides}`;
  const match = /d(\d+)/i.exec(String(settlement?.diceFormula ?? ""));
  return match ? `d${match[1]}` : "die";
}

async function rollAlignment({ sourceStatus = null, tables = globalThis.game?.tables } = {}) {
  const status = sourceStatus ?? settlementSourceStatus(tables);
  const result = await rollAlignmentFromSource({
    table: status?.tables?.alignment ?? null,
    tables,
  });
  if (!result) return null;
  return {
    roll: result.roll,
    alignment: result.alignment,
    source: tableProvenance(result.table),
  };
}

async function rollDistrictPoi(districtType, { sourceStatus = null, tables = globalThis.game?.tables } = {}) {
  const status = sourceStatus ?? settlementSourceStatus(tables);
  const table = status?.tables?.districtPoiTables?.get?.(districtType) ?? null;
  const result = await rollDistrictPoiFromSource(districtType, { table, tables });
  if (!result) return null;
  return {
    roll: result.roll,
    result: result.result,
    source: tableProvenance(result.table),
  };
}

async function rollSettlementDistrict({
  type = "village",
  index = 0,
  alignmentMode = ALIGNMENT_MODE_OVERALL,
  random = Math.random,
  sourceStatus = null,
  tables = globalThis.game?.tables,
} = {}) {
  const typeKey = normalizeSettlementType(type);
  const status = sourceStatus ?? settlementSourceStatus(tables);
  const config = resolveSettlementTypeConfig(typeKey, {
    table: status?.tables?.type ?? null,
    tables,
  });
  if (!config) return null;

  const resolvedAlignmentMode = normalizeAlignmentMode(alignmentMode);
  const districtRoll = rollDie(config.dieSides, random);
  const districtResult = districtTypeFromSourceRoll(districtRoll, {
    table: status?.tables?.districts ?? null,
    tables,
  });
  if (!districtResult?.districtType) return null;

  const poiCountRoll = rollDie(4, random);
  const pointsOfInterest = [];
  for (let count = 0; count < poiCountRoll; count += 1) {
    const point = await rollDistrictPoi(districtResult.districtType, { sourceStatus: status, tables });
    if (!point) return null;
    pointsOfInterest.push(point);
  }

  const districtAlignment = resolvedAlignmentMode === ALIGNMENT_MODE_DISTRICT
    ? await rollAlignment({ sourceStatus: status, tables })
    : null;
  if (resolvedAlignmentMode === ALIGNMENT_MODE_DISTRICT && !districtAlignment) return null;

  return {
    index,
    number: index + 1,
    districtRoll,
    districtType: districtResult.districtType,
    districtSource: tableProvenance(districtResult.table),
    poiCountRoll,
    pointsOfInterest,
    alignmentRoll: districtAlignment?.roll ?? null,
    alignment: districtAlignment?.alignment ?? null,
    alignmentSource: districtAlignment?.source ?? null,
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

async function rollSettlementName(type, { sourceStatus = null, tables = globalThis.game?.tables } = {}) {
  const status = sourceStatus ?? settlementSourceStatus(tables);
  const result = await rollSettlementNameFromSource(normalizeSettlementType(type), {
    table: status?.tables?.names ?? null,
    tables,
  });
  if (!result) return null;
  return {
    roll: result.roll,
    name: result.name,
    source: tableProvenance(result.table),
  };
}

async function rollShadowdarkSettlement({
  type = "village",
  alignmentMode = ALIGNMENT_MODE_OVERALL,
  random = Math.random,
  sourceStatus = null,
  tables = globalThis.game?.tables,
} = {}) {
  const typeKey = normalizeSettlementType(type);
  const status = sourceStatus ?? settlementSourceStatus(tables);
  if (!status.available) return null;

  const config = resolveSettlementTypeConfig(typeKey, {
    table: status.tables.type,
    tables,
  });
  if (!config) return null;

  const resolvedAlignmentMode = normalizeAlignmentMode(alignmentMode);
  const nameResult = await rollSettlementName(typeKey, { sourceStatus: status, tables });
  if (!nameResult) return null;
  const overallAlignment = resolvedAlignmentMode === ALIGNMENT_MODE_OVERALL
    ? await rollAlignment({ sourceStatus: status, tables })
    : null;
  if (resolvedAlignmentMode === ALIGNMENT_MODE_OVERALL && !overallAlignment) return null;

  const districts = [];
  for (let index = 0; index < config.diceCount; index += 1) {
    const district = await rollSettlementDistrict({
      type: typeKey,
      index,
      alignmentMode: resolvedAlignmentMode,
      random,
      sourceStatus: status,
      tables,
    });
    if (!district) return null;
    districts.push(district);
  }

  return {
    type: typeKey,
    typeLabel: config.label || SETTLEMENT_TYPES[typeKey].label,
    diceFormula: config.diceFormula,
    districtDieSides: config.dieSides,
    nameRoll: nameResult.roll,
    name: nameResult.name,
    nameSource: nameResult.source,
    alignmentMode: resolvedAlignmentMode,
    alignmentRoll: overallAlignment?.roll ?? null,
    alignment: overallAlignment?.alignment ?? null,
    alignmentSource: overallAlignment?.source ?? null,
    typeSource: tableProvenance(config.sourceTable),
    districtsSource: tableProvenance(status.tables.districts),
    sourceBookTitle: CORE_BOOK_TITLE,
    districts: markSeatOfGovernment(districts),
  };
}

async function rerollSettlementDistrict(settlement, districtIndex, {
  random = Math.random,
  sourceStatus = null,
  tables = globalThis.game?.tables,
} = {}) {
  if (!settlement) return settlement;
  const index = Math.floor(Number(districtIndex));
  if (!Number.isInteger(index) || index < 0 || index >= (settlement.districts?.length ?? 0)) return settlement;
  const status = sourceStatus ?? settlementSourceStatus(tables);
  if (!status.available) return null;

  const replacement = await rollSettlementDistrict({
    type: settlement.type,
    index,
    alignmentMode: settlement.alignmentMode,
    random,
    sourceStatus: status,
    tables,
  });
  if (!replacement) return null;

  const districts = settlement.districts.map((district, currentIndex) => (
    currentIndex === index ? replacement : { ...district }
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

function settlementOptionsDialogContent({ defaultType = "village", sourceStatus = null } = {}) {
  const typeKey = normalizeSettlementType(defaultType);
  const status = sourceStatus ?? settlementSourceStatus();
  return `
    <div class="mk-gm-create-document-form mk-gm-settlement-options-form">
      <div class="form-group">
        <label>Settlement Type</label>
        <select name="settlementType">
          ${Object.values(SETTLEMENT_TYPES).map(type => {
            const config = resolveSettlementTypeConfig(type.id, { table: status?.tables?.type ?? null });
            const suffix = config?.diceFormula ? ` · ${config.diceFormula}` : "";
            return `<option value="${type.id}" ${type.id === typeKey ? "selected" : ""}>${type.label}${suffix}</option>`;
          }).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Alignment</label>
        <select name="alignmentMode">
          <option value="overall">One alignment for the settlement</option>
          <option value="district">Roll alignment for each district</option>
        </select>
      </div>
      <p class="mk-gm-secondary">Uses imported ${escapeHtml(CORE_BOOK_TITLE)} RollTables. The physical dice-on-paper settlement map layout is not automated.</p>
    </div>
  `;
}

async function promptForSettlementOptions({ defaultType = "village", sourceStatus = null } = {}) {
  const result = await waitForGmDialog({
    title: "Expand Shadowdark Settlement",
    content: settlementOptionsDialogContent({ defaultType, sourceStatus }),
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

function missingSettlementSourceDialogContent(status) {
  const missing = status?.missing ?? [];
  return `
    <div class="mk-gm-create-document-form">
      <p>The imported <strong>${escapeHtml(CORE_BOOK_TITLE)}</strong> settlement RollTables are required.</p>
      ${missing.length ? `<p>Missing: ${missing.map(escapeHtml).join(", ")}.</p>` : ""}
      <p class="hint">Use Import / Update Source Tables and select your owned Core v4.9 Markdown transcription.</p>
    </div>
  `;
}

async function promptForMissingSettlementSource(status) {
  return waitForGmDialog({
    title: "Settlement Source Tables Required",
    content: missingSettlementSourceDialogContent(status),
    buttons: [
      {
        action: "import",
        icon: '<i class="fas fa-file-import"></i>',
        label: "Import / Update Source Tables",
        default: true,
        callback: () => "import",
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => "cancel",
      },
    ],
    close: () => "cancel",
  });
}

async function openSourceTableImporter() {
  const api = globalThis.game?.modules?.get?.("mk-shadowdark")?.api?.sourceTables;
  if (typeof api?.openImporter !== "function") {
    globalThis.ui?.notifications?.warn?.("Source Table Importer is unavailable.");
    return null;
  }
  return api.openImporter();
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
      <p class="mk-gm-secondary">Source: ${escapeHtml(settlement.sourceBookTitle || CORE_BOOK_TITLE)}</p>
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
  promptMissingSource = promptForMissingSettlementSource,
  importSources = openSourceTableImporter,
  tables = globalThis.game?.tables,
} = {}) {
  let status = settlementSourceStatus(tables);
  if (!status.available) {
    const choice = await promptMissingSource(status);
    if (choice !== "import") return null;
    await importSources();
    status = settlementSourceStatus(globalThis.game?.tables ?? tables);
    if (!status.available) {
      globalThis.ui?.notifications?.warn?.("Required Core settlement RollTables are still unavailable after import.");
      return null;
    }
  }

  const options = await promptOptions({ defaultType, sourceStatus: status });
  if (!options) return null;

  let settlement = await rollSettlement({
    type: options.type,
    alignmentMode: options.alignmentMode,
    sourceStatus: status,
    tables: globalThis.game?.tables ?? tables,
  });
  if (!settlement) {
    globalThis.ui?.notifications?.warn?.("The imported Core settlement tables could not resolve a complete settlement.");
    return null;
  }

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
      settlement = await rollSettlement({
        type: options.type,
        alignmentMode: options.alignmentMode,
        sourceStatus: status,
        tables: globalThis.game?.tables ?? tables,
      });
      if (!settlement) return null;
      continue;
    }
    if (result.action === "rerollDistrict") {
      settlement = await rerollDistrict(settlement, result.districtIndex, {
        sourceStatus: status,
        tables: globalThis.game?.tables ?? tables,
      });
      if (!settlement) return null;
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

function sourcePages(settlement) {
  const pages = new Set();
  const add = source => {
    for (const page of source?.pages ?? []) if (Number.isFinite(Number(page))) pages.add(Number(page));
  };
  add(settlement?.nameSource);
  add(settlement?.typeSource);
  add(settlement?.alignmentSource);
  add(settlement?.districtsSource);
  for (const district of settlement?.districts ?? []) {
    add(district?.districtSource);
    add(district?.alignmentSource);
    for (const point of district?.pointsOfInterest ?? []) add(point?.source);
  }
  return [...pages].sort((a, b) => a - b);
}

function buildSettlementPageContent(settlement, originPoint = null) {
  if (!settlement) return "";
  const seatSummary = governmentSeatSummary(settlement);
  const dieLabel = districtDieLabel(settlement);
  const pages = sourcePages(settlement);
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
    <p><strong>Source:</strong> ${escapeHtml(settlement.sourceBookTitle || CORE_BOOK_TITLE)}${pages.length ? ` · PDF p. ${escapeHtml(pages.join(", "))}` : ""}</p>
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
  missingSettlementSourceDialogContent,
  promptForMissingSettlementSource,
  openSourceTableImporter,
  settlementGeneratorDialogContent,
  promptForShadowdarkSettlement,
  sourcePages,
  buildSettlementPageContent,
};