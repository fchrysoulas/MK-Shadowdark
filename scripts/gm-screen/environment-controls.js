import {
  availableRollTables,
} from "../encounter-engine/helpers.js";
import {
  getSceneEnvironmentContext,
  normalizeDangerDefinition,
  resolveSceneEnvironmentContext,
  terrainNames,
} from "../libs/environment-context.js";
import { APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const SCENE_CONTEXT_FLAG = "encounterContext";

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

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function tableName(tableUuid, tables = []) {
  const uuid = String(tableUuid ?? "");
  if (!uuid) return "Not configured";
  return tables.find(table => String(table?.uuid ?? "") === uuid)?.name ?? uuid;
}

function terrainOptions(rules, selected) {
  return terrainNames(rules).map(terrain => `
    <option value="${escapeHtml(terrain)}" ${terrain === selected ? "selected" : ""}>${escapeHtml(terrain)}</option>
  `).join("");
}

function dangerOptions(rules, selected) {
  return Object.entries(rules?.dangerLevels ?? {}).map(([id, data]) => `
    <option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>${escapeHtml(data?.label ?? id)}</option>
  `).join("");
}

function tableOptions(tables, selectedUuid) {
  const groups = new Map();
  for (const table of tables ?? []) {
    const group = String(table?.group ?? "World");
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(table);
  }

  const automatic = `<option value="" ${selectedUuid ? "" : "selected"}>Automatic / default mapping</option>`;
  const grouped = [...groups.entries()].map(([group, entries]) => `
    <optgroup label="${escapeHtml(group)}">
      ${entries.map(table => `
        <option value="${escapeHtml(table.uuid)}" ${table.uuid === selectedUuid ? "selected" : ""}>${escapeHtml(table.name)}</option>
      `).join("")}
    </optgroup>
  `).join("");

  return automatic + grouped;
}

function buildEnvironmentEditorView({
  scene = currentScene(),
  tables = [],
  stored = getSceneEnvironmentContext(scene),
  resolved = resolveSceneEnvironmentContext(scene),
} = {}) {
  const rules = resolved?.profile ?? {};
  const terrain = String(stored.terrain ?? resolved.terrain ?? rules.defaultTerrain ?? "Default");
  const dangerLevel = String(stored.dangerLevel ?? resolved.dangerLevel ?? rules.defaultDangerLevel ?? "unsafe");
  const danger = normalizeDangerDefinition(rules, dangerLevel);
  const effectiveTableUuid = String(resolved.tableUuid ?? "");

  return {
    scene,
    sceneName: String(scene?.name ?? "No active Scene"),
    tables,
    rules,
    stored: {
      terrain,
      dangerLevel,
      period: String(stored.period ?? resolved.requestedPeriod ?? "auto"),
      tableUuid: String(stored.tableUuid ?? resolved.explicitTableUuid ?? ""),
    },
    resolved: {
      terrain: String(resolved.terrain ?? terrain),
      period: String(resolved.period ?? "day"),
      dangerLabel: String(resolved.danger?.label ?? danger.label),
      interval: Number(resolved.encounter?.interval ?? danger.interval),
      formula: String(resolved.encounter?.formula ?? danger.formula),
      encounterOn: rollResultsLabel(resolved.encounter?.encounterOn ?? danger.encounterOn),
      tableUuid: effectiveTableUuid,
      tableName: tableName(effectiveTableUuid, tables),
      tableConfigured: Boolean(effectiveTableUuid),
    },
  };
}

function renderEnvironmentEditor(view) {
  const stored = view.stored;
  const resolved = view.resolved;

  return `
    <header><i class="fas fa-mountain-sun"></i><span>Scene Context</span></header>

    ${resolved.tableConfigured ? "" : `
      <div class="mk-gm-alert is-warning" data-mk-environment-table-warning>
        <i class="fas fa-triangle-exclamation"></i>
        <strong>Encounter table not configured.</strong> Encounter checks remain blocked until a table is selected or the default mapping resolves one.
      </div>
    `}

    <form data-mk-environment-form>
      <div class="mk-gm-scene-context-grid">
        <div class="form-group">
          <label>Terrain</label>
          <select name="terrain">${terrainOptions(view.rules, stored.terrain)}</select>
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

        <div class="form-group">
          <label>Encounter Table</label>
          <select name="tableUuid">${tableOptions(view.tables, stored.tableUuid)}</select>
        </div>
      </div>
    </form>

    <dl class="mk-gm-data-list mk-gm-scene-context-summary" data-mk-environment-resolved>
      <div><dt>Scene</dt><dd>${escapeHtml(view.sceneName)}</dd></div>
      <div><dt>Effective Period</dt><dd>${escapeHtml(resolved.period)}</dd></div>
      <div><dt>Encounter Cadence</dt><dd>${escapeHtml(resolved.dangerLabel)} · every ${resolved.interval} ${resolved.interval === 1 ? "turn" : "turns"}</dd></div>
      <div><dt>Occurrence</dt><dd>${escapeHtml(resolved.formula)} · encounter on ${escapeHtml(resolved.encounterOn)}</dd></div>
      <div><dt>Effective Table</dt><dd>${escapeHtml(resolved.tableName)}</dd></div>
    </dl>

    <div class="mk-gm-panel-actions">
      <button type="button" data-mk-environment-save><i class="fas fa-floppy-disk"></i> Save Scene Context</button>
    </div>
  `;
}

function readEnvironmentForm(root) {
  const form = root?.querySelector?.("[data-mk-environment-form]");
  if (!form) return null;
  const read = name => String(form.querySelector(`[name="${name}"]`)?.value ?? "");
  return {
    terrain: read("terrain"),
    dangerLevel: read("dangerLevel"),
    period: read("period"),
    tableUuid: read("tableUuid"),
  };
}

async function saveEnvironmentEditor(application, root, scene) {
  const value = readEnvironmentForm(root);
  if (!value || !scene?.setFlag) return null;
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the Scene context.");
    return null;
  }

  await scene.setFlag(MODULE_ID, SCENE_CONTEXT_FLAG, value);
  await application.render({ force: true });
  return value;
}

async function decorateEnvironmentWorkspace(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const scene = currentScene();
  if (!root || !scene) return false;

  const editor = root.querySelector("[data-mk-gm-overview-scene-context]");
  if (!editor) return false;

  const tables = await availableRollTables();
  const view = buildEnvironmentEditorView({ scene, tables });
  editor.innerHTML = renderEnvironmentEditor(view);
  editor.querySelector("[data-mk-environment-save]")?.addEventListener("click", async event => {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await saveEnvironmentEditor(application, editor, scene);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Scene Context | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });

  return true;
}

function registerGmScreenEnvironmentControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateEnvironmentWorkspace(application, element);
  });
}

registerGmScreenEnvironmentControls();

export {
  MODULE_ID,
  SCENE_CONTEXT_FLAG,
  gmScreenApplication,
  rollResultsLabel,
  tableName,
  terrainOptions,
  dangerOptions,
  tableOptions,
  buildEnvironmentEditorView,
  renderEnvironmentEditor,
  readEnvironmentForm,
  saveEnvironmentEditor,
  decorateEnvironmentWorkspace,
  registerGmScreenEnvironmentControls,
};