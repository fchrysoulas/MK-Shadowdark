import { getSceneEnvironmentContext, setSceneEnvironmentContext } from "../libs/environment-context.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import { APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const GRID_FLAG = "encounterZoneGrid";
const ENCOUNTER_ZONE_FLAG = "encounterZoneTableUuid";
const AUXILIARY_TABLE_FLAG = "encounterZoneAuxiliaryTables";
const GRID_SCHEMA = 1;
const DEFAULT_ROW_COUNT = 8;

const AUXILIARY_TABLE_KEYS = Object.freeze([
  "distance",
  "activity",
  "trap",
  "hazard",
]);

const AUXILIARY_TABLE_LABELS = Object.freeze({
  distance: "Starting Distance",
  activity: "Activity",
  trap: "Trap",
  hazard: "Hazard",
});

const DEFAULT_COLUMNS = Object.freeze([
  { id: "column-sea", label: "Sea" },
  { id: "column-river", label: "River" },
  { id: "column-mountain", label: "Mountain" },
  { id: "column-forest", label: "Forest" },
]);

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  try {
    return [...collection];
  } catch (_error) {
    return [];
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = undefined) {
  if (!scene) return fallback;
  try {
    const value = scene.getFlag?.(MODULE_ID, key);
    return value === undefined ? rawSceneFlag(scene, key) ?? fallback : value;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

function createDefaultGrid() {
  return {
    schema: GRID_SCHEMA,
    title: "ENCOUNTER ZONE",
    rowHeader: "d8",
    columns: DEFAULT_COLUMNS.map(column => ({ ...column })),
    rows: Array.from({ length: DEFAULT_ROW_COUNT }, (_value, index) => ({
      label: String(index + 1),
      cells: DEFAULT_COLUMNS.map(() => null),
    })),
  };
}

function uniqueColumnId(value, used, fallbackIndex) {
  const base = String(value ?? `column-${fallbackIndex + 1}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `column-${fallbackIndex + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function isUuid(value) {
  const normalized = String(value ?? "").trim();
  return normalized.startsWith("RollTable.")
    || normalized.startsWith("World.")
    || normalized.startsWith("Compendium.");
}

function normalizeCell(value) {
  if (!value) return null;
  if (typeof value === "string") {
    return isUuid(value) ? { uuid: value, name: "" } : null;
  }
  if (typeof value !== "object") return null;
  const uuid = String(value.uuid ?? value.documentUuid ?? "").trim();
  if (!uuid) return null;
  return {
    uuid,
    name: String(value.name ?? value.label ?? "").trim(),
  };
}

function cellValue(row, column, columnIndex) {
  if (Array.isArray(row?.cells)) return normalizeCell(row.cells[columnIndex]);
  if (row?.cells && typeof row.cells === "object") {
    return normalizeCell(row.cells[column?.id] ?? row.cells[column?.label]);
  }
  return normalizeCell(row?.[column?.id] ?? row?.[column?.label]);
}

function normalizeGrid(rawGrid) {
  const fallback = createDefaultGrid();
  const source = rawGrid && typeof rawGrid === "object" && !Array.isArray(rawGrid)
    ? rawGrid
    : fallback;
  const rawColumns = Array.isArray(source.columns) && source.columns.length
    ? source.columns
    : fallback.columns;
  const usedIds = new Set();
  const columns = rawColumns.map((column, index) => {
    const object = column && typeof column === "object" ? column : { label: column };
    return {
      id: uniqueColumnId(object.id, usedIds, index),
      label: String(object.label ?? object.name ?? `Column ${index + 1}`).trim() || `Column ${index + 1}`,
    };
  });

  const rawRows = Array.isArray(source.rows) && source.rows.length
    ? source.rows
    : fallback.rows;
  const rows = rawRows.map((row, index) => ({
    label: String(row?.label ?? row?.range ?? index + 1).trim() || String(index + 1),
    cells: columns.map((column, columnIndex) => cellValue(row, column, columnIndex)),
  }));

  return {
    schema: GRID_SCHEMA,
    title: String(source.title ?? fallback.title).trim() || fallback.title,
    rowHeader: String(source.rowHeader ?? fallback.rowHeader).trim() || fallback.rowHeader,
    columns,
    rows,
  };
}

function isDiceColumn(value) {
  return /^\s*(?:\d*)d\d+(?:\s*,\s*(?:\d*)d\d+)?(?:\s*\+.*)?\s*$/i.test(String(value ?? ""));
}

function sourceTableForScene(scene = currentScene()) {
  const uuid = String(getSceneFlag(scene, ENCOUNTER_ZONE_FLAG, "") ?? "");
  if (!uuid) return null;
  return collectionValues(globalThis.game?.tables)
    .find(table => String(table?.uuid ?? "") === uuid)
    ?? null;
}

function resultRangeLabel(result, index) {
  const range = result?.range ?? result?._source?.range;
  const low = Number(range?.[0]);
  const high = Number(range?.[1]);
  if (!Number.isFinite(low)) return String(index + 1);
  if (!Number.isFinite(high) || high === low) return String(low);
  return `${low}-${high}`;
}

function gridFromZoneTable(table) {
  const metadata = sourceTableFlag(table);
  const rawColumns = Array.isArray(metadata?.columns) ? metadata.columns.map(value => String(value ?? "").trim()) : [];
  const terrainColumns = rawColumns.filter(column => column && !isDiceColumn(column));
  if (!terrainColumns.length) return null;

  const rows = collectionValues(table?.results).map((result, index) => {
    return {
      label: resultRangeLabel(result, index),
      cells: terrainColumns.map(() => null),
    };
  });

  if (!rows.length) return null;
  return normalizeGrid({
    title: "ENCOUNTER ZONE",
    rowHeader: rawColumns.find(isDiceColumn) ?? "d8",
    columns: terrainColumns.map((label, index) => ({ id: `column-${index + 1}`, label })),
    rows,
  });
}

function getSceneEncounterZoneGrid(scene = currentScene()) {
  const stored = getSceneFlag(scene, GRID_FLAG, null);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return normalizeGrid(stored);
  return gridFromZoneTable(sourceTableForScene(scene)) ?? createDefaultGrid();
}

function normalizeAuxiliaryTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(AUXILIARY_TABLE_KEYS.map(key => [
    key,
    String(source[key] ?? "").trim(),
  ]));
}

function getSceneEncounterZoneAuxiliaryTables(scene = currentScene()) {
  return normalizeAuxiliaryTables(getSceneFlag(scene, AUXILIARY_TABLE_FLAG, null));
}

async function setSceneEncounterZoneAuxiliaryTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!AUXILIARY_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Encounter RollTables.");
    return null;
  }

  const next = getSceneEncounterZoneAuxiliaryTables(scene);
  next[normalizedKey] = String(tableUuid ?? "").trim();
  await scene.setFlag(MODULE_ID, AUXILIARY_TABLE_FLAG, next);
  return next;
}

function gridColumnLabels(grid) {
  return normalizeGrid(grid).columns.map(column => column.label).filter(Boolean);
}

function encounterZoneDieFormula(grid) {
  const normalized = normalizeGrid(grid);
  const match = String(normalized.rowHeader ?? "").match(/(\d*)d(\d+)/i);
  if (match) {
    const count = Math.max(1, Number(match[1] || 1));
    const sides = Math.max(1, Number(match[2] || 1));
    return `${count}d${sides}`;
  }

  const highestRow = normalized.rows.reduce((highest, row, index) => {
    const values = String(row?.label ?? "").match(/\d+/g)?.map(Number) ?? [];
    return Math.max(highest, ...(values.length ? values : [index + 1]));
  }, 1);
  return `1d${highestRow}`;
}

function encounterZoneRowRange(row, index) {
  const values = String(row?.label ?? "").match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  const low = values[0] ?? index + 1;
  const high = values[1] ?? low;
  return {
    min: Math.min(low, high),
    max: Math.max(low, high),
  };
}

function findEncounterZoneCell(grid, terrain, total) {
  const normalized = normalizeGrid(grid);
  const requestedTerrain = String(terrain ?? "").trim().toLowerCase();
  const columnIndex = normalized.columns.findIndex(column => String(column.label).trim().toLowerCase() === requestedTerrain);
  if (columnIndex < 0) return null;

  const numericTotal = Number(total);
  const rowIndex = normalized.rows.findIndex((row, index) => {
    const range = encounterZoneRowRange(row, index);
    return Number.isFinite(numericTotal) && numericTotal >= range.min && numericTotal <= range.max;
  });
  if (rowIndex < 0) return null;

  const row = normalized.rows[rowIndex];
  return {
    terrain: normalized.columns[columnIndex].label,
    columnIndex,
    rowIndex,
    row,
    range: encounterZoneRowRange(row, rowIndex),
    cell: row.cells[columnIndex] ?? null,
  };
}

async function saveSceneEncounterZoneGrid(grid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the Encounter Zone grid.");
    return null;
  }

  const normalized = normalizeGrid(grid);
  await scene.setFlag(MODULE_ID, GRID_FLAG, normalized);

  const columns = gridColumnLabels(normalized);
  const environment = getSceneEnvironmentContext(scene);
  if (columns.length && !columns.includes(environment.terrain)) {
    await setSceneEnvironmentContext({
      ...environment,
      terrain: columns[0],
    }, scene);
  }

  return normalized;
}

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function gridInputValue(value) {
  return escapeHtml(String(value ?? ""));
}

function cellTableLabel(cell) {
  return String(cell?.name ?? "").trim() || "Drop RollTable";
}

function dragEventData(event) {
  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  const getData = TextEditorClass?.getDragEventData
    ?? TextEditorClass?.implementation?.getDragEventData;

  if (typeof getData === "function") {
    try {
      return getData.call(TextEditorClass, event) ?? {};
    } catch (_error) {
      // Fall through to raw DataTransfer JSON.
    }
  }

  for (const mime of ["application/json", "text/plain"]) {
    const raw = event?.dataTransfer?.getData?.(mime);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      // Try the next supported payload type.
    }
  }
  return {};
}

function dragDataUuid(data) {
  for (const value of [data?.uuid, data?.documentUuid, data?.data?.uuid]) {
    const uuid = String(value ?? "").trim();
    if (uuid) return uuid;
  }
  return "";
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  try {
    return await resolver(String(uuid ?? ""));
  } catch (_error) {
    return null;
  }
}

async function resolveRollTable(uuid) {
  const table = await resolveUuid(uuid);
  if (!table || table.documentName !== "RollTable") return null;
  return table;
}

async function resolveAuxiliaryTableEntries(scene = currentScene()) {
  const assignments = getSceneEncounterZoneAuxiliaryTables(scene);
  return Promise.all(AUXILIARY_TABLE_KEYS.map(async key => {
    const uuid = assignments[key];
    return {
      key,
      label: AUXILIARY_TABLE_LABELS[key],
      uuid,
      table: uuid ? await resolveRollTable(uuid) : null,
    };
  }));
}

function renderEncounterAuxiliaryTableSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  return `
    <section class="mk-gm-encounter-auxiliary-tables" data-mk-encounter-auxiliary-tables>
      <header class="mk-gm-encounter-auxiliary-heading">
        <div>
          <strong>Encounter RollTables</strong>
          <span>Optional tables rolled with each Roll Zone encounter.</span>
        </div>
        <i class="fas fa-table-list" aria-hidden="true"></i>
      </header>
      <div class="mk-gm-encounter-auxiliary-grid">
        ${AUXILIARY_TABLE_KEYS.map(key => {
          const entry = byKey.get(key) ?? { key, label: AUXILIARY_TABLE_LABELS[key], uuid: "", table: null };
          const tableName = entry.uuid
            ? String(entry.table?.name ?? "Unavailable RollTable")
            : "Drop RollTable here";
          const assigned = Boolean(entry.uuid && entry.table);
          return `
            <article class="mk-gm-encounter-auxiliary-slot ${assigned ? "is-assigned" : "is-empty"}" data-mk-encounter-auxiliary-slot="${key}">
              <span class="mk-gm-encounter-auxiliary-label">${escapeHtml(entry.label)}</span>
              <div class="mk-gm-encounter-auxiliary-drop" data-mk-encounter-auxiliary-drop>
                <i class="fas ${assigned ? "fa-table-list" : "fa-arrow-down"}" aria-hidden="true"></i>
                <strong>${escapeHtml(tableName)}</strong>
                ${entry.uuid && !assigned ? `<small>${escapeHtml(entry.uuid)}</small>` : ""}
                ${entry.uuid ? `<button type="button" data-mk-encounter-auxiliary-clear title="Clear ${escapeHtml(entry.label)} RollTable" aria-label="Clear ${escapeHtml(entry.label)} RollTable"><i class="fas fa-xmark"></i></button>` : ""}
              </div>
            </article>
          `;
        }).join("")}
      </div>
      <small class="mk-gm-encounter-auxiliary-status">Drag a RollTable from the sidebar onto a box. Empty boxes are skipped.</small>
    </section>
  `;
}

function bindEncounterAuxiliaryTables(application, root, scene) {
  root?.querySelectorAll?.("[data-mk-encounter-auxiliary-slot]")?.forEach(slot => {
    const drop = slot.querySelector?.("[data-mk-encounter-auxiliary-drop]");
    if (!drop) return;

    drop.addEventListener("dragenter", event => {
      event.preventDefault();
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", event => {
      if (event.relatedTarget && drop.contains?.(event.relatedTarget)) return;
      slot.classList.remove("is-dragover");
    });
    drop.addEventListener("drop", async event => {
      event.preventDefault();
      event.stopPropagation();
      slot.classList.remove("is-dragover");
      const uuid = dragDataUuid(dragEventData(event));
      const table = await resolveRollTable(uuid);
      if (!table) {
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the encounter table box.");
        return;
      }

      try {
        await setSceneEncounterZoneAuxiliaryTable(slot.dataset.mkEncounterAuxiliarySlot, table.uuid ?? uuid, scene);
        await application?.render?.({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Encounter RollTables | Assignment failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter RollTable assignment failed: ${error.message}`);
      }
    });

    drop.querySelector?.("[data-mk-encounter-auxiliary-clear]")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await setSceneEncounterZoneAuxiliaryTable(slot.dataset.mkEncounterAuxiliarySlot, "", scene);
        await application?.render?.({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Encounter RollTables | Clear failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter RollTable clear failed: ${error.message}`);
        button.disabled = false;
      }
    });
  });
  return true;
}

async function drawRollTable(table, { displayChat = true } = {}) {
  if (!table) return null;

  if (typeof table.draw === "function") return table.draw({ displayChat });
  if (typeof table.roll === "function") return table.roll({ recursive: true });

  globalThis.ui?.notifications?.warn?.("The assigned document cannot be rolled as a RollTable.");
  return null;
}

async function rollGridTable(uuid, options = {}) {
  const table = await resolveRollTable(uuid);
  if (!table) {
    globalThis.ui?.notifications?.warn?.("The assigned RollTable is unavailable.");
    return null;
  }

  return drawRollTable(table, options);
}

function rollSummary(roll) {
  const total = Number(roll?.total);
  return {
    formula: String(roll?.formula ?? roll?._formula ?? "").trim(),
    total: Number.isFinite(total) ? total : null,
  };
}

function plainTableText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDocumentField(document, field, fallback = "") {
  try {
    return document?.[field] ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function tableResultSummary(result, index = 0) {
  const rangeValue = safeDocumentField(result, "range", []);
  const range = Array.isArray(rangeValue) ? rangeValue : [];
  const text = plainTableText(
    safeDocumentField(result, "text")
      || safeDocumentField(result, "name")
      || safeDocumentField(result, "description"),
  );
  return {
    index: index + 1,
    range: range.length ? range.join("–") : "",
    text: text || "(No result text)",
    documentCollection: String(safeDocumentField(result, "documentCollection")).trim(),
    documentId: String(safeDocumentField(result, "documentId")).trim(),
    uuid: String(safeDocumentField(result, "uuid")).trim(),
  };
}

function tableRollSummary(draw) {
  const results = collectionValues(draw?.results);
  const singleResult = safeDocumentField(draw, "result", null);
  if (!results.length && singleResult) results.push(singleResult);
  return {
    roll: rollSummary(draw?.roll),
    results: results.map((result, index) => tableResultSummary(result, index)),
  };
}

async function rollEncounterAuxiliaryTables(scene = currentScene()) {
  const assignments = getSceneEncounterZoneAuxiliaryTables(scene);
  const rolls = [];

  for (const key of AUXILIARY_TABLE_KEYS) {
    const tableUuid = assignments[key];
    const base = {
      key,
      label: AUXILIARY_TABLE_LABELS[key],
      tableUuid,
      tableName: tableUuid ? "Unavailable RollTable" : "Not configured",
      configured: Boolean(tableUuid),
      roll: { formula: "", total: null },
      results: [],
    };
    if (!tableUuid) {
      rolls.push(base);
      continue;
    }

    const table = await resolveRollTable(tableUuid);
    if (!table) {
      rolls.push({ ...base, error: "Assigned RollTable is unavailable." });
      continue;
    }

    try {
      const draw = await drawRollTable(table, { displayChat: false });
      const summary = tableRollSummary(draw);
      rolls.push({
        ...base,
        tableName: String(safeDocumentField(table, "name", tableUuid)),
        ...summary,
      });
    } catch (error) {
      rolls.push({
        ...base,
        tableName: String(safeDocumentField(table, "name", tableUuid)),
        error: String(error?.message ?? error),
      });
    }
  }

  return rolls;
}

function activeGmIds() {
  const ids = collectionValues(globalThis.game?.users)
    .filter(user => user?.isGM && user?.active !== false && user?.id)
    .map(user => String(user.id));
  const currentId = String(globalThis.game?.user?.id ?? "");
  if (globalThis.game?.user?.isGM && currentId && !ids.includes(currentId)) ids.push(currentId);
  return [...new Set(ids)];
}

function renderTableResultDetails(results = []) {
  if (!results.length) return "<div class=\"mk-gm-encounter-zone-result\">No table result details returned.</div>";
  return results.map(result => `
    <div class="mk-gm-encounter-zone-result">
      <strong>${result.range ? `Result ${escapeHtml(result.range)}` : `Result ${result.index}`}</strong>
      <div>${escapeHtml(result.text ?? "(No result text)")}</div>
      ${result.documentCollection || result.documentId
        ? `<small>Document: ${escapeHtml([result.documentCollection, result.documentId].filter(Boolean).join(" · "))}</small>`
        : ""}
    </div>
  `).join("");
}

function renderRollTableDetail(label, detail = {}) {
  const tableRoll = detail.tableRoll ?? detail;
  const results = Array.isArray(tableRoll.results) ? tableRoll.results : [];
  const configured = detail.configured !== false;
  const status = detail.error
    ? `<div class="mk-gm-encounter-zone-result is-warning">${escapeHtml(detail.error)}</div>`
    : !configured
      ? "<div class=\"mk-gm-encounter-zone-result\">Not configured; skipped.</div>"
      : renderTableResultDetails(results);

  return `
    <div class="mk-gm-encounter-zone-auxiliary-result">
      <header><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail.tableName ?? detail.tableUuid ?? "Not configured")}</span></header>
      <div><span>Roll</span><strong>${escapeHtml(tableRoll.roll?.formula || "—")} → ${escapeHtml(tableRoll.roll?.total ?? "—")}</strong></div>
      ${status}
    </div>
  `;
}

function renderEncounterZoneRollCard(data = {}) {
  const zoneRoll = data.zoneRoll ?? {};
  const tableRoll = data.tableRoll ?? {};
  const results = Array.isArray(tableRoll.results) ? tableRoll.results : [];
  const auxiliaryRolls = Array.isArray(data.auxiliaryRolls) ? data.auxiliaryRolls : [];

  return `
    <section class="mk-gm-encounter-zone-roll-card">
      <header><strong>Encounter Zone Roll</strong><span>GM Only</span></header>
      <dl>
        <div><dt>Terrain</dt><dd>${escapeHtml(data.terrain ?? "Unknown")}</dd></div>
        <div><dt>Zone Roll</dt><dd>${escapeHtml(zoneRoll.formula || "—")} → ${escapeHtml(zoneRoll.total ?? "—")}</dd></div>
        <div><dt>Selected Row</dt><dd>${escapeHtml(data.rowLabel ?? "Unknown")}</dd></div>
        <div><dt>RollTable</dt><dd>${escapeHtml(data.tableName ?? data.tableUuid ?? "Unknown")}</dd></div>
        <div><dt>Table Roll</dt><dd>${escapeHtml(tableRoll.roll?.formula || "—")} → ${escapeHtml(tableRoll.roll?.total ?? "—")}</dd></div>
      </dl>
      <div class="mk-gm-encounter-zone-results"><strong>Encounter Result</strong>${renderTableResultDetails(results)}</div>
      ${auxiliaryRolls.length
        ? `<div class="mk-gm-encounter-zone-auxiliary-results"><strong>Additional Encounter Rolls</strong>${auxiliaryRolls.map(roll => renderRollTableDetail(roll.label, roll)).join("")}</div>`
        : ""}
    </section>
  `;
}

async function createEncounterZoneRollMessage(data = {}) {
  const ChatMessageClass = globalThis.ChatMessage;
  const whisper = activeGmIds();
  if (!ChatMessageClass?.create || !whisper.length) {
    globalThis.ui?.notifications?.warn?.("No active GM is available for the Encounter Zone result.");
    return null;
  }

  return ChatMessageClass.create({
    speaker: ChatMessageClass.getSpeaker?.() ?? {},
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content: renderEncounterZoneRollCard(data),
    whisper,
    flags: {
      [MODULE_ID]: {
        encounterZoneRoll: data,
      },
    },
  });
}

async function rollEncounterZone(terrain, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can roll an Encounter Zone.");
    return null;
  }

  const selectedTerrain = String(terrain ?? "").trim();
  if (!selectedTerrain) {
    globalThis.ui?.notifications?.warn?.("Select a Terrain before rolling an Encounter Zone.");
    return null;
  }

  const grid = getSceneEncounterZoneGrid(scene);
  const formula = encounterZoneDieFormula(grid);
  const RollClass = globalThis.Roll ?? globalThis.foundry?.dice?.Roll;
  if (!RollClass) {
    globalThis.ui?.notifications?.error?.("Foundry's Roll API is unavailable.");
    return null;
  }

  const roll = new RollClass(formula);
  const evaluated = typeof roll.evaluate === "function" ? await roll.evaluate() : roll;
  const total = Number(evaluated?.total ?? roll?.total);
  const selection = findEncounterZoneCell(grid, selectedTerrain, total);
  if (!selection) {
    globalThis.ui?.notifications?.warn?.(`No Encounter Zone row matches ${total} for ${selectedTerrain}.`);
    return null;
  }
  if (!selection.cell?.uuid) {
    globalThis.ui?.notifications?.warn?.(`No RollTable is assigned to ${selectedTerrain} at ${selection.row.label}.`);
    return null;
  }

  const table = await resolveRollTable(selection.cell.uuid);
  if (!table) {
    globalThis.ui?.notifications?.warn?.("The assigned RollTable is unavailable.");
    return null;
  }

  const tableRoll = await drawRollTable(table, { displayChat: false });
  const auxiliaryRolls = await rollEncounterAuxiliaryTables(scene);
  const detail = {
    terrain: selection.terrain,
    rowLabel: selection.row.label,
    rowRange: selection.range,
    tableUuid: String(table.uuid ?? selection.cell.uuid),
    tableName: String(safeDocumentField(table, "name", selection.cell.name ?? "RollTable")),
    zoneRoll: rollSummary(evaluated),
    tableRoll: tableRollSummary(tableRoll),
    auxiliaryRolls,
  };
  const message = await createEncounterZoneRollMessage(detail);
  return {
    formula,
    total,
    terrain: selection.terrain,
    row: selection.row,
    range: selection.range,
    cell: selection.cell,
    tableRoll,
    auxiliaryRolls,
    message,
    detail,
  };
}

function renderGridView(grid, { sourceTable = null } = {}) {
  const normalized = normalizeGrid(grid);
  const sourceHint = sourceTable
    ? `Loaded from ${sourceTable.name ?? "the selected Encounter Zone source"}.`
    : "View mode · use Edit Grid to change this Scene's Encounter Zone.";

  return `
    <div class="mk-gm-encounter-zone-editor" data-mk-encounter-zone-editor data-grid-mode="view">
      <div class="mk-gm-encounter-zone-heading">
        <div>
          <strong>${gridInputValue(normalized.title)}</strong>
          <span>${escapeHtml(sourceHint)}</span>
        </div>
        <div class="mk-gm-encounter-zone-actions">
          <button type="button" data-grid-toggle-mode data-grid-mode="view" title="Edit this Encounter Zone grid">
            <i class="fas fa-pen"></i> Edit Grid
          </button>
        </div>
      </div>

      <div class="mk-gm-encounter-zone-table-wrap">
        <table class="mk-gm-encounter-zone-table">
          <caption class="sr-only">Encounter Zone grid</caption>
          <thead>
            <tr>
              <th class="mk-gm-encounter-zone-row-header">${gridInputValue(normalized.rowHeader)}</th>
              ${normalized.columns.map(column => `<th>${gridInputValue(column.label)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${normalized.rows.map(row => `
              <tr>
                <th class="mk-gm-encounter-zone-row-label">${gridInputValue(row.label)}</th>
                ${row.cells.map(cell => cell?.uuid
                  ? `<td class="mk-gm-encounter-zone-cell is-assigned"><button type="button" class="mk-gm-encounter-zone-cell-roll" data-grid-roll data-grid-table-uuid="${gridInputValue(cell.uuid)}" title="Roll ${gridInputValue(cellTableLabel(cell))}"><i class="fas fa-dice-d20"></i><span>${gridInputValue(cellTableLabel(cell))}</span></button></td>`
                  : `<td class="mk-gm-encounter-zone-cell is-empty"><span>Drop RollTable</span></td>`).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <small class="mk-gm-encounter-zone-status" data-grid-status>${normalized.rows.length} rows · ${normalized.columns.length} columns</small>
    </div>
  `;
}

function renderGridEditor(grid, { sourceTable = null, mode = "edit" } = {}) {
  if (mode !== "edit") return renderGridView(grid, { sourceTable });

  const normalized = normalizeGrid(grid);
  const removeColumnDisabled = normalized.columns.length <= 1 ? "disabled" : "";
  const removeRowDisabled = normalized.rows.length <= 1 ? "disabled" : "";
  const sourceHint = sourceTable
    ? `Loaded from ${sourceTable.name ?? "the selected Encounter Zone source"}. Save to make this Scene's grid editable independently.`
    : "Changes are staged locally until you save the grid.";

  return `
    <div class="mk-gm-encounter-zone-editor" data-mk-encounter-zone-editor data-grid-title-value="${gridInputValue(normalized.title)}">
      <div class="mk-gm-encounter-zone-heading">
        <div>
          <strong>${gridInputValue(normalized.title)}</strong>
          <span>${escapeHtml(sourceHint)}</span>
        </div>
        <div class="mk-gm-encounter-zone-actions">
          <button type="button" data-grid-toggle-mode data-grid-mode="edit" title="View this Encounter Zone grid">
            <i class="fas fa-eye"></i> View Grid
          </button>
          <button type="button" data-grid-add-column title="Add an encounter zone column">
            <i class="fas fa-table-columns"></i> Add Column
          </button>
          <button type="button" data-grid-add-row title="Add an encounter zone row">
            <i class="fas fa-plus"></i> Add Row
          </button>
          <button type="button" data-grid-save hidden disabled>
            <i class="fas fa-floppy-disk"></i> Save Grid
          </button>
        </div>
      </div>

      <div class="mk-gm-encounter-zone-table-wrap">
        <table class="mk-gm-encounter-zone-table">
          <caption class="sr-only">Editable Encounter Zone grid</caption>
          <thead>
            <tr>
              <th class="mk-gm-encounter-zone-row-header">
                <input type="text" data-grid-row-header value="${gridInputValue(normalized.rowHeader)}" aria-label="Dice column heading">
              </th>
              ${normalized.columns.map((column, columnIndex) => `
                <th data-grid-column-index="${columnIndex}">
                  <div class="mk-gm-encounter-zone-column-heading">
                    <input type="text" data-grid-column-label value="${gridInputValue(column.label)}" aria-label="Encounter Zone column ${columnIndex + 1}">
                    <button type="button" data-grid-remove-column="${columnIndex}" ${removeColumnDisabled} title="Remove column" aria-label="Remove column ${columnIndex + 1}">
                      <i class="fas fa-xmark"></i>
                    </button>
                  </div>
                </th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
            ${normalized.rows.map((row, rowIndex) => `
              <tr data-grid-row-index="${rowIndex}">
                <th class="mk-gm-encounter-zone-row-label">
                  <div>
                    <input type="text" data-grid-row-label value="${gridInputValue(row.label)}" aria-label="Encounter Zone row ${rowIndex + 1}">
                    <button type="button" data-grid-remove-row="${rowIndex}" ${removeRowDisabled} title="Remove row" aria-label="Remove row ${rowIndex + 1}">
                      <i class="fas fa-xmark"></i>
                    </button>
                  </div>
                </th>
                ${row.cells.map((cell, columnIndex) => `
                  <td class="mk-gm-encounter-zone-cell ${cell?.uuid ? "is-assigned" : "is-empty"}" data-grid-cell data-grid-row-index="${rowIndex}" data-grid-column-index="${columnIndex}" data-grid-cell-uuid="${gridInputValue(cell?.uuid ?? "")}" data-grid-cell-name="${gridInputValue(cell?.name ?? "")}">
                    <div class="mk-gm-encounter-zone-cell-drop">
                      ${cell?.uuid
                        ? `<button type="button" class="mk-gm-encounter-zone-cell-roll" data-grid-roll data-grid-table-uuid="${gridInputValue(cell.uuid)}" title="Roll ${gridInputValue(cellTableLabel(cell))}"><i class="fas fa-dice-d20"></i><span>${gridInputValue(cellTableLabel(cell))}</span></button><button type="button" class="mk-gm-encounter-zone-cell-clear" data-grid-clear-cell title="Clear assigned RollTable" aria-label="Clear assigned RollTable"><i class="fas fa-xmark"></i></button>`
                        : `<span>Drop RollTable</span>`}
                    </div>
                  </td>
                `).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <small class="mk-gm-encounter-zone-status" data-grid-status>${normalized.rows.length} rows · ${normalized.columns.length} columns</small>
    </div>
  `;
}

function readGridEditor(editor) {
  const columns = [...(editor?.querySelectorAll?.("[data-grid-column-label]") ?? [])]
    .map((input, index) => ({
      id: String(input.closest?.("[data-grid-column-index]")?.dataset?.gridColumnIndex ?? `column-${index + 1}`),
      label: String(input.value ?? "").trim() || `Column ${index + 1}`,
    }));
  const rows = [...(editor?.querySelectorAll?.("tbody tr[data-grid-row-index]") ?? [])]
    .map((row, rowIndex) => ({
      label: String(row.querySelector?.("[data-grid-row-label]")?.value ?? "").trim() || String(rowIndex + 1),
      cells: [...(row.querySelectorAll?.("[data-grid-cell]") ?? [])].map(cell => normalizeCell({
        uuid: cell.dataset?.gridCellUuid,
        name: cell.dataset?.gridCellName,
      })),
    }));

  return normalizeGrid({
    title: String(editor?.dataset?.gridTitleValue ?? "ENCOUNTER ZONE").trim() || "ENCOUNTER ZONE",
    rowHeader: String(editor?.querySelector?.("[data-grid-row-header]")?.value ?? "d8").trim() || "d8",
    columns,
    rows,
  });
}

function setGridSaveState(editor, baseline) {
  const save = editor?.querySelector?.("[data-grid-save]");
  const value = readGridEditor(editor);
  const dirty = JSON.stringify(value) !== JSON.stringify(normalizeGrid(baseline));
  if (save) {
    save.hidden = !dirty;
    save.disabled = !dirty;
  }
  if (editor) editor.dataset.gridDirty = dirty ? "true" : "false";
  const status = editor?.querySelector?.("[data-grid-status]");
  if (status) status.textContent = `${value.rows.length} rows · ${value.columns.length} columns${dirty ? " · Unsaved changes" : ""}`;
  return dirty;
}

function nextColumnId(columns) {
  const used = new Set(columns.map(column => String(column?.id ?? "")));
  let index = columns.length + 1;
  let id = `column-${index}`;
  while (used.has(id)) {
    index += 1;
    id = `column-${index}`;
  }
  return id;
}

function bindGridEditor(application, editor, scene, baseline) {
  const rerender = nextGrid => {
    editor.innerHTML = renderGridEditor(nextGrid, { sourceTable: null });
    bindGridModeToggle(application, editor, "edit");
    bindGridEditor(application, editor, scene, baseline);
  };

  editor.querySelectorAll?.("[data-grid-column-label], [data-grid-row-label], [data-grid-row-header]")
    .forEach(input => input.addEventListener("input", () => setGridSaveState(editor, baseline)));

  editor.querySelector?.("[data-grid-add-column]")?.addEventListener("click", event => {
    event.preventDefault();
    const current = readGridEditor(editor);
    const columnIndex = current.columns.length;
    current.columns.push({ id: nextColumnId(current.columns), label: `Column ${columnIndex + 1}` });
    current.rows = current.rows.map(row => ({ ...row, cells: [...row.cells, null] }));
    rerender(current);
  });

  editor.querySelector?.("[data-grid-add-row]")?.addEventListener("click", event => {
    event.preventDefault();
    const current = readGridEditor(editor);
    current.rows.push({
      label: String(current.rows.length + 1),
      cells: current.columns.map(() => null),
    });
    rerender(current);
  });

  editor.querySelectorAll?.("[data-grid-remove-column]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      const current = readGridEditor(editor);
      const index = Number(button.dataset.gridRemoveColumn);
      if (current.columns.length <= 1 || !Number.isInteger(index)) return;
      current.columns.splice(index, 1);
      current.rows = current.rows.map(row => ({
        ...row,
        cells: row.cells.filter((_value, cellIndex) => cellIndex !== index),
      }));
      rerender(current);
    });
  });

  editor.querySelectorAll?.("[data-grid-clear-cell]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const cell = button.closest?.("[data-grid-cell]");
      const current = readGridEditor(editor);
      const rowIndex = Number(cell?.dataset?.gridRowIndex);
      const columnIndex = Number(cell?.dataset?.gridColumnIndex);
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
      current.rows[rowIndex].cells[columnIndex] = null;
      rerender(current);
    });
  });

  bindGridRollControls(editor);
  bindGridDropTargets(editor, rerender);

  editor.querySelectorAll?.("[data-grid-remove-row]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      const current = readGridEditor(editor);
      const index = Number(button.dataset.gridRemoveRow);
      if (current.rows.length <= 1 || !Number.isInteger(index)) return;
      current.rows.splice(index, 1);
      rerender(current);
    });
  });

  editor.querySelector?.("[data-grid-save]")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const save = event.currentTarget;
    save.disabled = true;
    try {
      await saveSceneEncounterZoneGrid(readGridEditor(editor), scene);
      await application?.render?.({ force: true });
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Encounter Zone | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Encounter Zone grid save failed: ${error.message}`);
      setGridSaveState(editor, baseline);
    }
  });

  setGridSaveState(editor, baseline);
  return true;
}

function bindGridModeToggle(application, editor, mode) {
  const toggle = editor?.querySelector?.("[data-grid-toggle-mode]");
  if (!toggle) return false;

  toggle.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();

    if (mode === "edit" && editor.dataset.gridDirty === "true") {
      globalThis.ui?.notifications?.warn?.("Save the Encounter Zone grid before switching to View mode.");
      return;
    }

    application.encounterZoneGridEditMode = mode !== "edit";
    await application.render?.({ force: true });
  });

  return true;
}

function bindGridRollControls(editor) {
  editor?.querySelectorAll?.("[data-grid-roll]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await rollGridTable(button.dataset.gridTableUuid);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Encounter Zone | Roll failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter Zone RollTable failed: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
  });
  return true;
}

function bindGridDropTargets(editor, rerender) {
  editor?.querySelectorAll?.("[data-grid-cell]").forEach(cell => {
    cell.addEventListener("dragenter", event => {
      event.preventDefault();
      cell.classList.add("is-dragover");
    });
    cell.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      cell.classList.add("is-dragover");
    });
    cell.addEventListener("dragleave", event => {
      if (event.relatedTarget && cell.contains?.(event.relatedTarget)) return;
      cell.classList.remove("is-dragover");
    });
    cell.addEventListener("drop", async event => {
      event.preventDefault();
      event.stopPropagation();
      cell.classList.remove("is-dragover");
      const uuid = dragDataUuid(dragEventData(event));
      const table = await resolveRollTable(uuid);
      if (!table) {
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the grid cell.");
        return;
      }

      const current = readGridEditor(editor);
      const rowIndex = Number(cell.dataset.gridRowIndex);
      const columnIndex = Number(cell.dataset.gridColumnIndex);
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
      current.rows[rowIndex].cells[columnIndex] = {
        uuid: String(table.uuid ?? uuid),
        name: String(table.name ?? "RollTable"),
      };
      rerender(current);
    });
  });
  return true;
}

function decorateExplorationZoneGrid(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const target = root?.querySelector?.("[data-mk-exploration-zone-grid]");
  const auxiliaryTarget = root?.querySelector?.("[data-mk-encounter-auxiliary-tables]");
  const scene = currentScene();
  if ((!target && !auxiliaryTarget) || !scene) return false;

  if (target) {
    const grid = getSceneEncounterZoneGrid(scene);
    const sourceTable = getSceneFlag(scene, GRID_FLAG, null) ? null : sourceTableForScene(scene);
    const mode = application.encounterZoneGridEditMode === true ? "edit" : "view";
    target.innerHTML = renderGridEditor(grid, { sourceTable, mode });
    bindGridModeToggle(application, target, mode);
    if (mode === "edit") bindGridEditor(application, target, scene, grid);
  }

  if (auxiliaryTarget) {
    void resolveAuxiliaryTableEntries(scene).then(entries => {
      auxiliaryTarget.innerHTML = renderEncounterAuxiliaryTableSetup(entries);
      bindEncounterAuxiliaryTables(application, auxiliaryTarget, scene);
    });
  }
  return true;
}

function registerExplorationZoneGrid() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decorateExplorationZoneGrid(application, element);
  });
}

registerExplorationZoneGrid();

export {
  MODULE_ID,
  GRID_FLAG,
  AUXILIARY_TABLE_FLAG,
  AUXILIARY_TABLE_KEYS,
  AUXILIARY_TABLE_LABELS,
  DEFAULT_ROW_COUNT,
  DEFAULT_COLUMNS,
  createDefaultGrid,
  normalizeGrid,
  sourceTableForScene,
  gridFromZoneTable,
  getSceneEncounterZoneGrid,
  normalizeAuxiliaryTables,
  getSceneEncounterZoneAuxiliaryTables,
  setSceneEncounterZoneAuxiliaryTable,
  gridColumnLabels,
  encounterZoneDieFormula,
  encounterZoneRowRange,
  findEncounterZoneCell,
  rollSummary,
  tableResultSummary,
  tableRollSummary,
  renderEncounterAuxiliaryTableSetup,
  bindEncounterAuxiliaryTables,
  rollEncounterAuxiliaryTables,
  renderEncounterZoneRollCard,
  createEncounterZoneRollMessage,
  saveSceneEncounterZoneGrid,
  renderGridView,
  renderGridEditor,
  readGridEditor,
  setGridSaveState,
  bindGridEditor,
  bindGridModeToggle,
  bindGridRollControls,
  rollEncounterZone,
  bindGridDropTargets,
  decorateExplorationZoneGrid,
  registerExplorationZoneGrid,
};
