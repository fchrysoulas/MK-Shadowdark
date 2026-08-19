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
  if (getSceneEncounterZoneTableUuid(scene) === normalized) return normalized;
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

  const empty = `<option value="" ${selectedUuid ? "" : "selected"}>${escapeHtml(emptyLabel)}</option>`;
  const grouped = [...groups.entries()].map(([group, entries]) => `
    <optgroup label="${escapeHtml(group)}">
      ${entries.map(table => `
        <option value="${escapeHtml(table.uuid)}" ${table.uuid === selectedUuid ? "selected" : ""}>${escapeHtml(table.name)}</option>
      `).join("")}
    </optgroup>
  `).join("");

  return empty + grouped;
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
  return String(table?.name ?? "").toLowerCase().includes("encounter zone")
    && encounterZoneTerrainNames(table).length > 0;
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
  if (!terrains.length) {
    return '<option value="Default" selected>Configure Encounter Zone in Tables</option>';
  }
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

function buildEnvironmentEditorView({
  scene = currentScene(),
  stored = getSceneEnvironmentContext(scene),
  resolved = resolveSceneEnvironmentContext(scene),
  zoneTableUuid = getSceneEncounterZoneTableUuid(scene),
  zoneTable = findWorldTable(zoneTableUuid),
} = {}) {
  const rules = resolved?.profile ?? {};
  const terrains = encounterZoneTerrainNames(zoneTable);
  const persistedTerrain = String(stored.terrain ?? resolved.terrain ?? rules.defaultTerrain ?? "Default");
  const terrain = terrains.length && !terrains.includes(persistedTerrain) ? terrains[0] : persistedTerrain;
  const dangerLevel = String(stored.dangerLevel ?? resolved.dangerLevel ?? rules.defaultDangerLevel ?? "unsafe");
  const danger = normalizeDangerDefinition(rules, dangerLevel);
  const period = String(stored.period ?? resolved.requestedPeriod ?? "auto");

  return {
    scene,
    sceneName: String(scene?.name ?? "No active Scene"),
    rules,
    terrains,
    zoneTableUuid,
    persisted: {
      terrain: persistedTerrain,
      dangerLevel,
      period,
    },
    stored: {
      terrain,
      dangerLevel,
      period,
    },
    resolved: {
      period: String(resolved.period ?? "day"),
      dangerLabel: String(resolved.danger?.label ?? danger.label),
      interval: Number(resolved.encounter?.interval ?? danger.interval),
      formula: String(resolved.encounter?.formula ?? danger.formula),
      encounterOn: rollResultsLabel(resolved.encounter?.encounterOn ?? danger.encounterOn),
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
        <strong>No Encounter Zone selected.</strong> Choose one in Tables to populate Terrain.
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
      <p class="hint">Changes are staged locally until you save them.</p>
    </form>

    <dl class="mk-gm-data-list mk-gm-scene-context-summary" data-mk-environment-resolved>
      <div><dt>Scene</dt><dd>${escapeHtml(view.sceneName)}</dd></div>
      <div><dt>Effective Period</dt><dd>${escapeHtml(resolved.period)}</dd></div>
      <div><dt>Encounter Cadence</dt><dd>${escapeHtml(resolved.dangerLabel)} · every ${resolved.interval} ${resolved.interval === 1 ? "turn" : "turns"}</dd></div>
      <div><dt>Occurrence</dt><dd>${escapeHtml(resolved.formula)} · encounter on ${escapeHtml(resolved.encounterOn)}</dd></div>
    </dl>

    <div class="mk-gm-panel-actions">
      <button type="button" data-mk-environment-save hidden disabled>
        <i class="fas fa-floppy-disk"></i> Save Changes
      </button>
    </div>
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
  const zoneUuids = new Set(zoneTables.map(table => table.uuid));

  return {
    scene,
    zoneTables,
    tables: (tables ?? []).filter(table => !zoneUuids.has(String(table?.uuid ?? ""))),
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
        <p class="hint">Terrain choices come from this table's source columns.</p>
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
    <p class="hint">Changes are staged locally until you save them.</p>
    <div class="mk-gm-panel-actions">
      <button type="button" data-mk-encounter-setup-save hidden disabled>
        <i class="fas fa-floppy-disk"></i> Save Encounter Setup
      </button>
    </div>
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

function readEncounterSetupForm(root) {
  const form = root?.querySelector?.("[data-mk-encounter-setup-form]");
  if (!form) return null;
  const read = name => String(form.querySelector(`[name="${name}"]`)?.value ?? "");
  return {
    zoneTableUuid: read("zoneTableUuid"),
    tableUuid: read("tableUuid"),
  };
}

function sameEnvironmentValue(left, right) {
  return left?.terrain === right?.terrain
    && left?.dangerLevel === right?.dangerLevel
    && left?.period === right?.period;
}

function sameEncounterSetupValue(left, right) {
  return left?.zoneTableUuid === right?.zoneTableUuid
    && left?.tableUuid === right?.tableUuid;
}

function setSaveButtonDirty(button, dirty) {
  if (!button) return Boolean(dirty);
  button.hidden = !dirty;
  button.disabled = !dirty;
  return Boolean(dirty);
}

function updateEnvironmentSaveState(editor, baseline) {
  const value = readEnvironmentForm(editor);
  const dirty = Boolean(value && !sameEnvironmentValue(value, baseline));
  setSaveButtonDirty(editor?.querySelector?.("[data-mk-environment-save]"), dirty);
  return dirty;
}

function updateEncounterSetupSaveState(setup, baseline) {
  const value = readEncounterSetupForm(setup);
  const dirty = Boolean(value && !sameEncounterSetupValue(value, baseline));
  setSaveButtonDirty(setup?.querySelector?.("[data-mk-encounter-setup-save]"), dirty);
  return dirty;
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
  const result = await setSceneEnvironmentContext(next, scene);
  await application?.render?.({ force: true });
  return result;
}

async function saveEncounterSetup(application, setup, scene) {
  const value = readEncounterSetupForm(setup);
  if (!value || !scene?.setFlag) return null;
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Encounter Setup.");
    return null;
  }

  const current = getSceneEnvironmentContext(scene);
  await setSceneEncounterZoneTableUuid(value.zoneTableUuid, scene);

  const zoneTable = findWorldTable(value.zoneTableUuid);
  const terrains = encounterZoneTerrainNames(zoneTable);
  const terrain = terrains.length && !terrains.includes(current.terrain)
    ? terrains[0]
    : current.terrain;

  await setSceneEnvironmentContext({
    ...current,
    terrain,
    tableUuid: value.tableUuid,
  }, scene);

  await application?.render?.({ force: true });
  return {
    ...value,
    terrain,
  };
}

function bindEnvironmentManualSave(application, editor, scene, baseline) {
  const saveButton = editor?.querySelector?.("[data-mk-environment-save]");
  if (!saveButton) return false;

  const refreshDirtyState = () => updateEnvironmentSaveState(editor, baseline);
  editor.querySelectorAll?.("[data-mk-environment-form] select").forEach(control => {
    control.addEventListener("change", refreshDirtyState);
  });

  saveButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    saveButton.disabled = true;
    try {
      await saveEnvironmentEditor(application, editor, scene);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Scene Context | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
      refreshDirtyState();
    }
  });

  refreshDirtyState();
  return true;
}

function previewEncounterZoneTerrains(setup) {
  const value = readEncounterSetupForm(setup);
  const summary = setup?.querySelector?.("[data-mk-encounter-zone-terrains]");
  if (!value || !summary) return [];

  const terrains = encounterZoneTerrainNames(findWorldTable(value.zoneTableUuid));
  summary.textContent = terrains.length ? terrains.join(", ") : "No terrain columns detected";
  return terrains;
}

function bindEncounterSetupManualSave(application, setup, scene, baseline) {
  const saveButton = setup?.querySelector?.("[data-mk-encounter-setup-save]");
  if (!saveButton) return false;

  const refreshDirtyState = () => updateEncounterSetupSaveState(setup, baseline);
  setup.querySelectorAll?.("[data-mk-encounter-setup-form] select").forEach(control => {
    control.addEventListener("change", () => {
      if (control.name === "zoneTableUuid") previewEncounterZoneTerrains(setup);
      refreshDirtyState();
    });
  });

  saveButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    saveButton.disabled = true;
    try {
      await saveEncounterSetup(application, setup, scene);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Encounter Setup | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Encounter setup update failed: ${error.message}`);
      refreshDirtyState();
    }
  });

  refreshDirtyState();
  return true;
}

function decorateEnvironmentWorkspace(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const scene = currentScene();
  const editor = root?.querySelector?.("[data-mk-gm-overview-scene-context]");
  if (!editor || !scene) return false;

  const view = buildEnvironmentEditorView({ scene });
  editor.innerHTML = renderEnvironmentEditor(view);
  bindEnvironmentManualSave(application, editor, scene, view.persisted);
  return true;
}

function registerGmScreenEnvironmentControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decorateEnvironmentWorkspace(application, element);
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
  readEncounterSetupForm,
  sameEnvironmentValue,
  sameEncounterSetupValue,
  setSaveButtonDirty,
  updateEnvironmentSaveState,
  updateEncounterSetupSaveState,
  saveEnvironmentEditor,
  saveEncounterSetup,
  bindEnvironmentManualSave,
  previewEncounterZoneTerrains,
  bindEncounterSetupManualSave,
  decorateEnvironmentWorkspace,
  registerGmScreenEnvironmentControls,
};
