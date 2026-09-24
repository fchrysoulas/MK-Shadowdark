import {
  getSceneEnvironmentContext,
  resolveSceneEnvironmentContext,
  setSceneEnvironmentContext,
} from "../libs/environment-context.js";
import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import {
  getSceneEncounterZoneGrids,
  gridColumnLabels,
} from "./exploration-zone-grid.js";
import { APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const SCENE_CONTEXT_FLAG = "encounterContext";
const ENCOUNTER_ZONE_FLAG = "encounterZoneTableUuid";

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

function dangerOptions(rules, selected) {
  return Object.entries(rules?.dangerLevels ?? {}).map(([id, data]) => `
    <option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(data?.label ?? id)}</option>
  `).join("");
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
    return '<option value="Default" selected>Select an imported Encounter Zone source</option>';
  }
  const resolved = terrains.includes(selected) ? selected : terrains[0];
  return terrains.map(terrain => `
    <option value="${escapeHtml(terrain)}" ${terrain === resolved ? "selected" : ""}>${escapeHtml(terrain)}</option>
  `).join("");
}

function buildEnvironmentEditorView({
  scene = currentScene(),
  stored = getSceneEnvironmentContext(scene),
  resolved = resolveSceneEnvironmentContext(scene),
  zoneTableUuid = getSceneEncounterZoneTableUuid(scene),
  zoneTable = findWorldTable(zoneTableUuid),
} = {}) {
  const rules = resolved?.profile ?? {};
  const encounterZones = getSceneEncounterZoneGrids(scene, { fallback: false })
    .map((zone, index) => ({
      id: String(zone?.id ?? `zone-${index + 1}`),
      title: String(zone?.title ?? `Encounter Zone ${index + 1}`),
      terrains: gridColumnLabels(zone),
    }))
    .filter(zone => zone.id);
  const gridTerrains = [...new Set(encounterZones.flatMap(zone => zone.terrains))];
  const terrains = gridTerrains.length ? gridTerrains : encounterZoneTerrainNames(zoneTable);
  const persistedTerrain = String(stored.terrain ?? resolved.terrain ?? rules.defaultTerrain ?? "Default");
  const terrain = terrains.length && !terrains.includes(persistedTerrain) ? terrains[0] : persistedTerrain;
  const dangerLevel = String(stored.dangerLevel ?? resolved.dangerLevel ?? rules.defaultDangerLevel ?? "unsafe");
  const period = String(stored.period ?? resolved.requestedPeriod ?? "auto");

  return {
    scene,
    sceneName: String(scene?.name ?? "No active Scene"),
    rules,
    encounterZones,
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
        <strong>No Encounter Zone configured.</strong> Add a zone in Encounters or choose an imported source to populate Terrain.
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
    </dl>

    <div class="mk-gm-panel-actions">
      <button type="button" data-mk-environment-save hidden disabled>
        <i class="fas fa-floppy-disk"></i> Save Changes
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

function sameEnvironmentValue(left, right) {
  return left?.terrain === right?.terrain
    && left?.dangerLevel === right?.dangerLevel
    && left?.period === right?.period;
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
}

registerGmScreenEnvironmentControls();

export {
  MODULE_ID,
  SCENE_CONTEXT_FLAG,
  ENCOUNTER_ZONE_FLAG,
  gmScreenApplication,
  collectionValues,
  getSceneEncounterZoneTableUuid,
  setSceneEncounterZoneTableUuid,
  dangerOptions,
  isDiceColumn,
  encounterZoneTerrainNames,
  isEncounterZoneTable,
  availableEncounterZoneTables,
  findWorldTable,
  terrainOptions,
  buildEnvironmentEditorView,
  renderEnvironmentEditor,
  readEnvironmentForm,
  sameEnvironmentValue,
  setSaveButtonDirty,
  saveEnvironmentEditor,
  bindEnvironmentManualSave,
  decorateEnvironmentWorkspace,
  registerGmScreenEnvironmentControls,
};
