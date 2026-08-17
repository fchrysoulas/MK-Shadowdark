import {
  availableRollTables,
} from "../encounter-engine/helpers.js";
import {
  getEnvironmentProfiles,
  getSceneEnvironmentContext,
  normalizeDangerDefinition,
  resolveSceneEnvironmentContext,
  setSceneEnvironmentContext,
  terrainNames,
} from "../libs/environment-context.js";
import { APP_ID } from "./gm-screen.js";

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

function profileOptions(profiles, selectedId) {
  return Object.entries(profiles ?? {}).map(([id, profile]) => `
    <option value="${escapeHtml(id)}" ${id === selectedId ? "selected" : ""}>${escapeHtml(profile?.name ?? id)}</option>
  `).join("");
}

function terrainOptions(profile, selected) {
  return terrainNames(profile).map(terrain => `
    <option value="${escapeHtml(terrain)}" ${terrain === selected ? "selected" : ""}>${escapeHtml(terrain)}</option>
  `).join("");
}

function dangerOptions(profile, selected) {
  return Object.entries(profile?.dangerLevels ?? {}).map(([id, data]) => `
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

  const automatic = `<option value="" ${selectedUuid ? "" : "selected"}>Automatic / profile mapping</option>`;
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
  profiles = getEnvironmentProfiles(),
  tables = [],
  stored = getSceneEnvironmentContext(scene),
  resolved = resolveSceneEnvironmentContext(scene),
} = {}) {
  const profile = profiles?.[stored.profileId]
    ?? profiles?.[resolved.profileId]
    ?? Object.values(profiles ?? {})[0]
    ?? {};
  const danger = normalizeDangerDefinition(profile, stored.dangerLevel ?? resolved.dangerLevel ?? profile.defaultDangerLevel ?? "unsafe");
  const effectiveTableUuid = String(resolved.tableUuid ?? "");

  return {
    scene,
    sceneName: String(scene?.name ?? "No active Scene"),
    profiles,
    tables,
    stored: {
      profileId: String(stored.profileId ?? resolved.profileId ?? "default"),
      terrain: String(stored.terrain ?? resolved.terrain ?? profile.defaultTerrain ?? "Default"),
      dangerLevel: String(stored.dangerLevel ?? resolved.dangerLevel ?? profile.defaultDangerLevel ?? "unsafe"),
      period: String(stored.period ?? resolved.requestedPeriod ?? "auto"),
      tableUuid: String(stored.tableUuid ?? resolved.explicitTableUuid ?? ""),
    },
    resolved: {
      profileName: String(resolved.profile?.name ?? profile.name ?? resolved.profileId ?? "Profile"),
      terrain: String(resolved.terrain ?? "Default"),
      period: String(resolved.period ?? "day"),
      dangerLabel: String(resolved.danger?.label ?? danger.label),
      interval: Number(resolved.encounter?.interval ?? danger.interval),
      formula: String(resolved.encounter?.formula ?? danger.formula),
      encounterOn: rollResultsLabel(resolved.encounter?.encounterOn ?? danger.encounterOn),
      tableUuid: effectiveTableUuid,
      tableName: tableName(effectiveTableUuid, tables),
      tableConfigured: Boolean(effectiveTableUuid),
    },
    profile,
  };
}

function renderEnvironmentEditor(view) {
  const stored = view.stored;
  const resolved = view.resolved;

  return `
    <article class="mk-gm-panel is-wide" data-mk-gm-environment-editor>
      <header><i class="fas fa-mountain-sun"></i><span>Scene / Environment</span></header>

      ${resolved.tableConfigured ? "" : `
        <div class="mk-gm-alert is-warning" data-mk-environment-table-warning>
          <i class="fas fa-triangle-exclamation"></i>
          <strong>Encounter table not configured.</strong> Encounter checks are blocked until the active profile/terrain/period resolves a table or you choose an override below.
        </div>
      `}

      <form data-mk-environment-form>
        <div class="mk-gm-panel-grid two-col">
          <div>
            <div class="form-group">
              <label>Profile</label>
              <select name="profileId">${profileOptions(view.profiles, stored.profileId)}</select>
            </div>
            <div class="form-group">
              <label>Terrain</label>
              <select name="terrain">${terrainOptions(view.profile, stored.terrain)}</select>
            </div>
            <div class="form-group">
              <label>Danger</label>
              <select name="dangerLevel">${dangerOptions(view.profile, stored.dangerLevel)}</select>
            </div>
          </div>
          <div>
            <div class="form-group">
              <label>Requested Period</label>
              <select name="period">
                <option value="auto" ${stored.period === "auto" ? "selected" : ""}>Automatic from world time</option>
                <option value="day" ${stored.period === "day" ? "selected" : ""}>Day</option>
                <option value="night" ${stored.period === "night" ? "selected" : ""}>Night</option>
              </select>
            </div>
            <div class="form-group">
              <label>Encounter Table Override</label>
              <select name="tableUuid">${tableOptions(view.tables, stored.tableUuid)}</select>
            </div>
          </div>
        </div>
      </form>

      <dl class="mk-gm-data-list" data-mk-environment-resolved>
        <div><dt>Scene</dt><dd>${escapeHtml(view.sceneName)}</dd></div>
        <div><dt>Active Profile</dt><dd>${escapeHtml(resolved.profileName)}</dd></div>
        <div><dt>Effective Terrain</dt><dd>${escapeHtml(resolved.terrain)}</dd></div>
        <div><dt>Effective Period</dt><dd>${escapeHtml(resolved.period)}</dd></div>
        <div><dt>Danger</dt><dd>${escapeHtml(resolved.dangerLabel)} · every ${resolved.interval} ${resolved.interval === 1 ? "turn" : "turns"}</dd></div>
        <div><dt>Occurrence</dt><dd>${escapeHtml(resolved.formula)} · encounter on ${escapeHtml(resolved.encounterOn)}</dd></div>
        <div><dt>Effective Table</dt><dd>${escapeHtml(resolved.tableName)}</dd></div>
      </dl>

      <div class="mk-gm-panel-actions">
        <button type="button" data-mk-environment-save><i class="fas fa-floppy-disk"></i> Save Scene Context</button>
      </div>
    </article>
  `;
}

function replaceSelectOptions(select, html, preferredValue = "") {
  if (!select) return;
  select.innerHTML = html;
  const available = Array.from(select.options ?? []).some(option => option.value === preferredValue);
  if (available) select.value = preferredValue;
}

function bindProfileDependentFields(root, profiles) {
  const profileSelect = root.querySelector('[name="profileId"]');
  const terrainSelect = root.querySelector('[name="terrain"]');
  const dangerSelect = root.querySelector('[name="dangerLevel"]');
  if (!profileSelect) return;

  profileSelect.addEventListener("change", () => {
    const profile = profiles?.[profileSelect.value] ?? {};
    const preferredTerrain = String(profile.defaultTerrain ?? "");
    const preferredDanger = String(profile.defaultDangerLevel ?? "");
    replaceSelectOptions(terrainSelect, terrainOptions(profile, preferredTerrain), preferredTerrain);
    replaceSelectOptions(dangerSelect, dangerOptions(profile, preferredDanger), preferredDanger);
  });
}

function readEnvironmentForm(root) {
  const form = root?.querySelector?.("[data-mk-environment-form]");
  if (!form) return null;
  const read = name => String(form.querySelector(`[name="${name}"]`)?.value ?? "");
  return {
    profileId: read("profileId"),
    terrain: read("terrain"),
    dangerLevel: read("dangerLevel"),
    period: read("period"),
    tableUuid: read("tableUuid"),
  };
}

async function saveEnvironmentEditor(application, root, scene) {
  const value = readEnvironmentForm(root);
  if (!value || !scene) return null;
  const result = await setSceneEnvironmentContext(value, scene);
  if (result) await application.render({ force: true });
  return result;
}

function addOverviewTableWarning(application, root, view) {
  root.querySelector("[data-mk-overview-environment-warning]")?.remove();
  if (view.resolved.tableConfigured) return false;

  const panel = root.querySelector('[data-workspace-panel="overview"] .mk-gm-panel:first-child');
  if (!panel) return false;
  const warning = document.createElement("div");
  warning.className = "mk-gm-alert is-warning";
  warning.dataset.mkOverviewEnvironmentWarning = "true";
  warning.innerHTML = `
    <i class="fas fa-triangle-exclamation"></i>
    <span><strong>Encounter table not configured.</strong> Encounter checks are blocked.</span>
    <button type="button" data-mk-open-environment><i class="fas fa-sliders"></i> Configure</button>
  `;
  warning.querySelector("[data-mk-open-environment]")?.addEventListener("click", event => {
    event.preventDefault();
    application.workspace = "environment";
    application.render({ force: true });
  });
  panel.append(warning);
  return true;
}

async function decorateEnvironmentWorkspace(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const scene = currentScene();
  if (!root || !scene) return false;

  const profiles = getEnvironmentProfiles();
  const tables = await availableRollTables();
  const view = buildEnvironmentEditorView({ scene, profiles, tables });
  const workspace = root.querySelector('[data-workspace-panel="environment"]');
  if (!workspace) return false;

  workspace.innerHTML = renderEnvironmentEditor(view);
  const editor = workspace.querySelector("[data-mk-gm-environment-editor]");
  bindProfileDependentFields(editor, profiles);
  editor?.querySelector("[data-mk-environment-save]")?.addEventListener("click", async event => {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await saveEnvironmentEditor(application, editor, scene);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Environment | Save failed", error);
      globalThis.ui?.notifications?.error?.(`Scene context update failed: ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });

  addOverviewTableWarning(application, root, view);
  return true;
}

function registerGmScreenEnvironmentControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateEnvironmentWorkspace(application, element);
  });
}

registerGmScreenEnvironmentControls();

export {
  gmScreenApplication,
  rollResultsLabel,
  tableName,
  buildEnvironmentEditorView,
  renderEnvironmentEditor,
  readEnvironmentForm,
  addOverviewTableWarning,
  decorateEnvironmentWorkspace,
  registerGmScreenEnvironmentControls,
};
