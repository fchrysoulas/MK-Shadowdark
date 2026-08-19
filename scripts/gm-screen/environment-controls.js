import { availableRollTables } from "../encounter-engine/helpers.js";
import {
  getSceneEnvironmentContext,
  normalizeDangerDefinition,
  resolveSceneEnvironmentContext,
  setSceneEnvironmentContext,
} from "../libs/environment-context.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import { APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const SCENE_CONTEXT_FLAG = "encounterContext";
const ENCOUNTER_ZONE_FLAG = "encounterZoneTableUuid";

let availableTableCache = null;
let availableTablePromise = null;

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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function rollResultsLabel(values = []) {
  const results = [...new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  return results.length ? results.join(", ") : "—";
}

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

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = "") {
  if (!scene) return fallback;
  try {
    const value = scene.getFlag?.(MODULE_ID, key);
    return value === undefined ? rawSceneFlag(scene, key) ?? fallback : value;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

function getSceneEncounterZoneTableUuid(scene = currentScene()) {
  return String(getSceneFlag(scene, ENCOUNTER_ZONE_FLAG, "") ?? "");
}

async function setSceneEncounterZoneTableUuid(tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the encounter zone source.");
    return null;
  }

  const normalized = String(tableUuid ?? "");
  const current = getSceneEncounterZoneTableUuid(scene);
  if (current === normalized) return normalized;

  await scene.setFlag(MODULE_ID, ENCOUNTER_ZONE_FLAG, normalized);
  return normalized;
}

function tableName(tableUuid, tables = []) {
  const uuid = String(tableUuid ?? "");
  if (!uuid) return "Not configured";
  return tables.find(table => String(table?.uuid ?? "") === uuid)?.name ?? uuid;
}

function dangerOptions(rules, selected) {
  return Object.entries(rules?.dangerLevels ?? {}).map(([id, data]) => `
    <option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(data?.label ?? id)}</option>
  `).join("");
}

function tableOptions(tables, selectedUuid, {
  emptyLabel = "Automatic / default table",
} = {}) {
  const groups = new Map();
  for (const table of tables ?? []) {
    const group = String(table?.group ?? "World");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(table);
  }

  const automatic = `<option value="" ${selectedUuid ? "" : "selected"}>${escapeHtml(emptyLabel)}</option>`;
  const grouped = [...groups.entries()].map(([group, entries]) => `
    <optgroup label="${escapeHtml(group)}">
      ${entries.map(table => `
        <option value="${escapeHtml(table.uuid)}" ${table.uuid === selectedUuid ? "selected" : ""}>${escapeHtml(table.name)}</option>
      `).join("")}
    </optgroup>
  `).join("");

  return automatic + grouped;
}

function isDiceColumn(column) {
  return /^\s*(?:\d*)d\d+(?:\s*,\s*(?:\d*)d\d+)?(?:\s*\+.*)?\s*$/i.test(String(column ?? ""));
}

function encounterZoneTerrainNames(table) {
  const metadata = sourceTableFlag(table);
  const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
  return [...new Set(columns
    .map(column => String(column ?? "").trim())
    .filter(column => column && !isDiceColumn(column)))];
}

function isEncounterZoneTable(table) {
  const name = String(table?.name ?? "").toLowerCase();
  return name.includes("encounter zone") && encounterZoneTerrainNames(table).length > 0;
}

function availableEncounterZoneTables(tables = globalThis.game?.tables) {
  return collectionValues(tables)
    .filter(isEncounterZoneTable)
    .map(table => ({
      uuid: String(table.uuid ?? ""),
      name: String(table.name ?? "Encounter Zone"),
      group: String(sourceTableFlag(table)?.bookTitle ?? "Imported Source Tables"),
      document: table,
    }))
    .filter(table => table.uuid)
    .sort((left, right) => left.group.localeCompare(right.group) || left.name.localeCompare(right.name));
}

function findWorldTable(tableUuid, tables = globalThis.game?.tables) {
  const uuid = String(tableUuid ?? "");
  if (!uuid) return null;
  return collectionValues(tables).find(table => String(table?.uuid ?? "") === uuid) ?? null;
}

function terrainOptions(terrains, selected) {
  if (!terrains.length) return '<option value="Default" selected>Configure Encounter Zone in Exploration</option>';
  const resolved = terrains.includes(selected) ? selected : terrains[0];
  return terrains.map(terrain => `
    <option value="${escapeHtml(terrain)}" ${terrain === resolved ? "selected" : ""}>${escapeHtml(terrain)}</option>
  `).join("");
}

async function cachedAvailableRollTables() {
  if (availableTableCache) return availableTableCache;
  if (availableTablePromise) return availableTablePromise;

  availableTablePromise = availableRollTables()
    .then(tables => {
      availableTableCache = tables;
      return tables;
    })
    .finally(() => {
      availableTablePromise = null;
    });

  return availableTablePromise;
}

function invalidateAvailableRollTableCache() {
  availableTableCache = null;
  availableTablePromise = null;
}

function draftForScene(application, scene) {
  const draft = application?._mkSceneContextDraft;
  if (!draft || String(draft.sceneId ?? "") !== String(scene?.id ?? "")) return null;
  return draft;
}

function buildEnvironmentEditorView({
  scene = currentScene(),
  tables = [],
  stored = getSceneEnvironmentContext(scene),
  resolved = resolveSceneEnvironmentContext(scene),
  zoneTableUuid = getSceneEncounterZoneTableUuid(scene),
  zoneTable = findWorldTable(zoneTableUuid),
  draft = null,
} = {}) {
  const rules = resolved?.profile ?? {};
  const terrains = encounterZoneTerrainNames(zoneTable);
  const requestedTerrain = String(draft?.terrain ?? stored.terrain ?? resolved.terrain ?? rules.defaultTerrain ?? "Default");
  const terrain = terrains.length && !terrains.includes(requestedTerrain) ? terrains[0] : requestedTerrain;
  const dangerLevel = String(draft?.dangerLevel ?? stored.dangerLevel ?? resolved.dangerLevel ?? rules.defaultDangerLevel ?? "unsafe");
  const danger = normalizeDangerDefinition(rules, dangerLevel);

  return {
    scene,
    sceneName: String(scene?.name ?? "No active Scene"),
    tables,
    rules,
    terrains,
    zoneTableUuid,
    stored: {
      terrain,
      dangerLevel,
      period: String(draft?.period ?? stored.period ?? resolved.requestedPeriod ?? "auto"),
    },
    resolved: {
      period: String(resolved.period ?? "day"),
      dangerLabel: String(resolved.danger?.label ?? danger.label),
      interval: Number(resolved.encounter?.interval ?? danger.interval),
      formula: String(resolved.encounter?.formula ?? danger.formula),
      encounterOn: rollResultsLabel(resolved.encounter?.encounterOn ?? danger.encounterOn),
      tableUuid: String(resolved.tableUuid ?? ""),
      tableName: tableName(resolved.tableUuid, tables),
      tableConfigured: Boolean(resolved.tableUuid),
    },
  };
}

function renderEnvironmentEditor(view) {
  const stored = view.stored;
  const resolved = view.resolved;
  const terrainDisabled = view.terrains.length ? "" : "disabled";

  return `
    <header><i class="fas fa-mountain-sun"></i><span>Scene Context</span></header>

    ${view.terrains.length ? "" : `
      <div class="mk-gm-alert is-warning" data-mk-environment-zone-warning>
        <i class="fas fa-triangle-exclamation"></i>
        <strong>No Encounter Zone selected.</strong> Choose one in Exploration to populate Terrain.
      </div>
    `}

    <form data-mk-environment-form>
      <div class="mk-gm-scene-context-grid">
        <div class="form-group">
          <label>Terrain</label>
          <select name="terrain" ${terrainDisabled}>${terrainOptions(view.terrains, stored.terrain)}</select>
        </div>

        <div class="form-group">
          <label>Danger</label>
          <select name="dangerLevel">${dangerOptions(view.rules, stored.dangerLevel)}</select>
        </div>

        <div class="form-group">
          <label>Period</label>
          <select name="period">
            <option value="auto" ${stored.period === "auto" ? "selected" : ""}>Automatic from world time</option>
            <option value="day" ${stored.period === "day" ? "selected" : ""}>Day</option>
            <option value="night" ${stored.period === "night" ? "selected" : ""}>Night</option>
          </select>
        </div>
      </div>
      <p class="hint">Changes save automatically.</p>
    </form>

    <dl class="mk-gm-data-list mk-gm-scene-context-summary" data-mk-environment-resolved>
      <div><dt>Scene</dt><dd>${escapeHtml(view.sceneName)}</dd></div>
      <div><dt>Effective Period</dt><dd>${escapeHtml(resolved.period)}</dd></div>
      <div><dt>Encounter Cadence</dt><dd>${escapeHtml(resolved.dangerLabel)} · every ${resolved.interval} ${resolved.interval === 1 ? "turn" : "turns"}</dd></div>
      <div><dt>Occurrence</dt><dd>${escapeHtml(resolved.formula)} · encounter on ${escapeHtml(resolved.encounterOn)}</dd></div>
    </dl>
  `;
}

function buildEncounterSetupView({
  scene = currentScene(),
  tables = [],
  stored = getSceneEnvironmentContext(scene),
  zoneTableUuid = getSceneEncounterZoneTableUuid(scene),
  zoneTables = availableEncounterZoneTables(),
} = {}) {
  const selectedZone = zoneTables.find(table => table.uuid === zoneTableUuid) ?? null;
  const terrains = encounterZoneTerrainNames(selectedZone?.document);

  return {
    scene,
    zoneTables,
    tables,
    selectedZone,
    zoneTableUuid,
    encounterTableUuid: String(stored.tableUuid ?? ""),
    terrains,
  };
}

function renderEncounterSetup(view) {
  const terrainSummary = view.terrains.length
    ? view.terrains.map(escapeHtml).join(", ")
    : "No terrain columns detected";

  return `
    <header><i class="fas fa-table-list"></i><span>Encounter Setup</span></header>
    <div class="mk-gm-scene-context-grid" data-mk-encounter-setup-form>
      <div class="form-group">
        <label>Encounter Zone</label>
        <select name="zoneTableUuid">${tableOptions(view.zoneTables, view.zoneTableUuid, { emptyLabel: "Select imported Encounter Zone" })}</select>
        <p class="hint">Terrain comes from this table's source columns.</p>
      </div>
      <div class="form-group">
        <label>Encounter Table</label>
        <select name="tableUuid">${tableOptions(view.tables, view.encounterTableUuid, { emptyLabel: "Select encounter RollTable" })}</select>
        <p class="hint">Used when an encounter check triggers.</p>
      </div>
    </div>
    <dl class="mk-gm-data-list">
      <div><dt>Terrain choices</dt><dd data-mk-encounter-zone-terrains>${terrainSummary}</dd></div>
      <div><dt>Encounter Table</dt><dd>${escapeHtml(tableName(view.encounterTableUuid, view.tables))}</dd></div>
    </dl>
    <p class="hint">Encounter setup saves automatically.</p>
  `;
}

function readEnvironmentForm(root) {
  const form = root?.querySelector?.("[data-mk-environment-form]");
  if (!form) return null;
  const read = name => String(form.querySelector(`[name="${name}"]`)?.value ?? "");
  return {
    terrain: read("terrain").trim() || "Default",
    dangerLevel: read("dangerLevel"),
    period: read("period"),
  };
}

function sameEditorValue(left, right) {
  return left?.terrain === right?.terrain
    && left?.dangerLevel === right?.dangerLevel
    && left?.period === right?.period;
}

async function saveEnvironmentEditor(application, root, scene) {
  const value = readEnvironmentForm(root);
  if (!value || !scene?.setFlag) return null;
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the Scene context.");
    return null;
  }

  const current = getSceneEnvironmentContext(scene);
  const next = {
    ...current,
    ...value,
    tableUuid: current.tableUuid,
  };
  const draft = {
    sceneId: String(scene.id ?? ""),
    ...value,
  };
  application._mkSceneContextDraft = draft;

  try {
    const result = await setSceneEnvironmentContext(next, scene);
    if (sameEditorValue(application._mkSceneContextDraft, draft)) {
      application._mkSceneContextDraft = null;
    }
    return result;
  } catch (error) {
    if (sameEditorValue(application._mkSceneContextDraft, draft)) {
      application._mkSceneContextDraft = null;
    }
    throw error;
  }
}

async function saveEncounterSetup(application, control, scene, tables) {
  if (!scene?.setFlag || !globalThis.game?.user?.isGM) return null;
  const name = String(control?.name ?? "");
  const value = String(control?.value ?? "");

  if (name === "tableUuid") {
    const current = getSceneEnvironmentContext(scene);
    return setSceneEnvironmentContext({ ...current, tableUuid: value }, scene);
  }

  if (name !== "zoneTableUuid") return null;
  await setSceneEncounterZoneTableUuid(value, scene);

  const zoneTable = findWorldTable(value);
  const terrains = encounterZoneTerrainNames(zoneTable);
  const current = getSceneEnvironmentContext(scene);
  if (terrains.length && !terrains.includes(current.terrain)) {
    await setSceneEnvironmentContext({ ...current, terrain: terrains[0] }, scene);
  }

  const summary = control.closest?.("[data-mk-gm-exploration-encounter-setup]")
    ?.querySelector?.("[data-mk-encounter-zone-terrains]");
  if (summary) summary.textContent = terrains.length ? terrains.join(", ") : "No terrain columns detected";

  void application;
  void tables;
  return value;
}

function bindAutoSave(application, editor, scene) {
  editor.querySelectorAll?.("[data-mk-environment-form] select").forEach(control => {
    control.addEventListener("change", async () => {
      try {
        await saveEnvironmentEditor(application, editor, scene);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Scene Context | Auto-save failed", error);
        globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
      }
    });
  });
}

function bindEncounterSetupAutoSave(application, setup, scene, tables) {
  setup.querySelectorAll?.("[data-mk-encounter-setup-form] select").forEach(control => {
    control.addEventListener("change", async () => {
      control.disabled = true;
      try {
        await saveEncounterSetup(application, control, scene, tables);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Encounter Setup | Auto-save failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter setup update failed: ${error.message}`);
      } finally {
        control.disabled = false;
      }
    });
  });
}

async function decorateEnvironmentWorkspace(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const scene = currentScene();
  if (!root || !scene) return false;

  const editor = root.querySelector("[data-mk-gm-overview-scene-context]");
  const setup = root.querySelector("[data-mk-gm-exploration-encounter-setup]");
  if (!editor && !setup) return false;

  const renderToken = Number(application._mkSceneContextRenderToken ?? 0) + 1;
  application._mkSceneContextRenderToken = renderToken;
  const tables = await cachedAvailableRollTables();
  if (application._mkSceneContextRenderToken !== renderToken) return false;

  if (editor?.isConnected) {
    const view = buildEnvironmentEditorView({
      scene,
      tables,
      draft: draftForScene(application, scene),
    });
    editor.innerHTML = renderEnvironmentEditor(view);
    bindAutoSave(application, editor, scene);
  }

  if (setup?.isConnected) {
    const setupView = buildEncounterSetupView({ scene, tables });
    setup.innerHTML = renderEncounterSetup(setupView);
    bindEncounterSetupAutoSave(application, setup, scene, tables);
  }

  return true;
}

function registerGmScreenEnvironmentControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateEnvironmentWorkspace(application, element);
  });

  for (const hook of ["createRollTable", "updateRollTable", "deleteRollTable", "createCompendium", "updateCompendium", "deleteCompendium"]) {
    globalThis.Hooks?.on?.(hook, invalidateAvailableRollTableCache);
  }
}

registerGmScreenEnvironmentControls();

export {
  MODULE_ID,
  SCENE_CONTEXT_FLAG,
  ENCOUNTER_ZONE_FLAG,
  gmScreenApplication,
  rollResultsLabel,
  collectionValues,
  getSceneEncounterZoneTableUuid,
  setSceneEncounterZoneTableUuid,
  tableName,
  dangerOptions,
  tableOptions,
  isDiceColumn,
  encounterZoneTerrainNames,
  isEncounterZoneTable,
  availableEncounterZoneTables,
  findWorldTable,
  terrainOptions,
  cachedAvailableRollTables,
  invalidateAvailableRollTableCache,
  buildEnvironmentEditorView,
  renderEnvironmentEditor,
  buildEncounterSetupView,
  renderEncounterSetup,
  readEnvironmentForm,
  saveEnvironmentEditor,
  saveEncounterSetup,
  bindAutoSave,
  bindEncounterSetupAutoSave,
  decorateEnvironmentWorkspace,
  registerGmScreenEnvironmentControls,
};