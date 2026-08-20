import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { getGroupRestState } from "../group-sheet/rest-encounters.js";
import {
  getSceneEnvironmentContext,
  resolveSceneEnvironmentContext,
} from "../libs/environment-context.js";
import { APP_ID } from "./gm-screen.js";
import {
  encounterZoneTerrainNames,
  findWorldTable,
  getSceneEncounterZoneTableUuid,
} from "./environment-controls.js";
import { buildLightPressure } from "./light-pressure.js";
import { buildMoraleView } from "./morale-controls.js";
import {
  buildAssignmentsView,
  buildPartyView,
  resolveGmScreenGroup,
} from "./view-model.js";

const MODULE_ID = "mk-shadowdark";

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

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function toolsButton(action, label, icon, hint) {
  return `
    <button type="button" class="mk-gm-tool-button" data-mk-gm-tool="${escapeHtml(action)}" title="${escapeHtml(hint)}">
      <i class="fas ${escapeHtml(icon)}"></i>
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></span>
    </button>
  `;
}

function toolSection(id, label, icon, hint, content) {
  return `
    <details class="mk-gm-tool-section" data-mk-gm-tool-section="${escapeHtml(id)}">
      <summary>
        <i class="fas ${escapeHtml(icon)}"></i>
        <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></span>
        <i class="fas fa-chevron-down mk-gm-tool-chevron" aria-hidden="true"></i>
      </summary>
      <div class="mk-gm-tool-inspector">${content}</div>
    </details>
  `;
}

async function resolveDocument(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (!uuid || typeof resolver !== "function") return null;
  try {
    return await resolver(String(uuid));
  } catch (_error) {
    return null;
  }
}

function listValues(values = []) {
  const entries = (Array.isArray(values) ? values : []).filter(Boolean);
  return entries.length ? entries.map(escapeHtml).join(", ") : "None";
}

async function contextInspectorHtml() {
  const scene = currentScene();
  if (!scene) return "<p>No active Scene.</p>";

  const stored = getSceneEnvironmentContext(scene);
  const resolved = resolveSceneEnvironmentContext(scene);
  const zoneUuid = getSceneEncounterZoneTableUuid(scene);
  const zone = findWorldTable(zoneUuid);
  const terrains = encounterZoneTerrainNames(zone);
  const encounterTable = await resolveDocument(resolved.tableUuid);
  const cadence = resolved.encounter?.disabled
    ? "No encounter checks"
    : `Every ${resolved.encounter?.interval ?? 1} ${(resolved.encounter?.interval ?? 1) === 1 ? "turn" : "turns"}`;
  const occurrence = resolved.encounter?.disabled
    ? "Disabled"
    : `${resolved.encounter?.formula ?? "1d6"} · encounter on ${(resolved.encounter?.encounterOn ?? [1]).join(", ")}`;

  return `
    <dl class="mk-gm-data-list">
      <div><dt>Scene</dt><dd>${escapeHtml(scene.name ?? "Active Scene")}</dd></div>
      <div><dt>Terrain</dt><dd>${escapeHtml(stored.terrain)}</dd></div>
      <div><dt>Danger</dt><dd>${escapeHtml(resolved.danger?.label ?? stored.dangerLevel)}</dd></div>
      <div><dt>Requested Period</dt><dd>${escapeHtml(stored.period)}</dd></div>
      <div><dt>Effective Period</dt><dd>${escapeHtml(resolved.period)}</dd></div>
      <div><dt>Encounter Zone</dt><dd>${escapeHtml(zone?.name ?? "Not configured")}</dd></div>
      <div><dt>Zone Terrains</dt><dd>${listValues(terrains)}</dd></div>
      <div><dt>Encounter Table</dt><dd>${escapeHtml(encounterTable?.name ?? resolved.tableUuid ?? "Not configured")}</dd></div>
      <div><dt>Cadence</dt><dd>${escapeHtml(cadence)}</dd></div>
      <div><dt>Occurrence</dt><dd>${escapeHtml(occurrence)}</dd></div>
    </dl>
  `;
}

function rangeLabel(result) {
  const min = Number(result?.min);
  const max = Number(result?.max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  return min === max ? String(min) : `${min}-${max}`;
}

function outcomeRows(definition) {
  return (definition?.results ?? []).map(result => (
    `<li><strong>${escapeHtml(rangeLabel(result))}</strong> ${escapeHtml(result?.label ?? "")}</li>`
  )).join("");
}

function procedureInspectorHtml() {
  const rules = resolveSceneEnvironmentContext(currentScene())?.profile ?? {};
  const optional = rules.optionalProcedures ?? {};
  const awareness = rules.awareness ?? {};
  const outcomes = rules.outcomes ?? {};
  return `
    <dl class="mk-gm-data-list">
      <div><dt>Distance</dt><dd>${escapeHtml(outcomes.distance?.formula ?? "—")}</dd></div>
      <div><dt>Activity</dt><dd>${escapeHtml(outcomes.activity?.formula ?? "—")}</dd></div>
      <div><dt>Reaction</dt><dd>${escapeHtml(outcomes.reaction?.formula ?? "—")}</dd></div>
      <div><dt>Treasure</dt><dd>${escapeHtml(outcomes.treasure?.formula ?? "—")}</dd></div>
      <div><dt>Awareness</dt><dd>${escapeHtml(awareness.options?.[awareness.default] ?? awareness.default ?? "Determine during play")}</dd></div>
      <div><dt>Intent</dt><dd>${optional.intent ? "Enabled" : "Disabled"}</dd></div>
      <div><dt>Surprise Dice</dt><dd>${optional.surpriseDice ? "Enabled" : "Disabled"}</dd></div>
      <div><dt>Morale</dt><dd>DC ${escapeHtml(rules.morale?.dc ?? 15)} ${escapeHtml(String(rules.morale?.ability ?? "wis").toUpperCase())}</dd></div>
    </dl>
    <h3>Distance</h3><ul>${outcomeRows(outcomes.distance)}</ul>
    <h3>Activity</h3><ul>${outcomeRows(outcomes.activity)}</ul>
    <h3>Reaction</h3><ul>${outcomeRows(outcomes.reaction)}</ul>
    <h3>Treasure</h3><ul>${outcomeRows(outcomes.treasure)}</ul>
  `;
}

async function lightInspectorHtml(application) {
  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  const party = await buildPartyView(group);
  const summary = buildLightPressure(party);
  const rows = summary.carriers.length
    ? summary.carriers.map(carrier => `
        <div><dt>${escapeHtml(carrier.name)}</dt><dd>${listValues(carrier.items.map(item => item.name))}</dd></div>
      `).join("")
    : '<div><dt>Active Party</dt><dd>No active light sources</dd></div>';

  return `
    <dl class="mk-gm-data-list">
      <div><dt>Total</dt><dd>${escapeHtml(summary.total)}</dd></div>
      <div><dt>Carriers</dt><dd>${escapeHtml(summary.carrierCount)}</dd></div>
      ${rows}
    </dl>
  `;
}

async function namesForUuids(uuids = []) {
  const names = [];
  for (const uuid of uuids) {
    const actor = await resolveActorFromUuid(uuid);
    names.push(actor?.name ?? String(uuid));
  }
  return names;
}

async function assignmentsInspectorHtml(application) {
  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  if (!group) return "<p>No Group selected.</p>";
  const assignments = buildAssignmentsView(group);
  const order = await namesForUuids(assignments.order);
  const front = await namesForUuids(assignments.front);
  const middle = await namesForUuids(assignments.middle);
  const rear = await namesForUuids(assignments.rear);
  const scout = assignments.scout ? (await namesForUuids([assignments.scout]))[0] : "None";
  const lightBearer = assignments.lightBearer ? (await namesForUuids([assignments.lightBearer]))[0] : "None";
  const watches = [];
  for (const watch of assignments.watches) {
    watches.push(`${escapeHtml(watch.label)}: ${listValues(await namesForUuids(watch.actorUuids))}`);
  }

  return `
    <dl class="mk-gm-data-list">
      <div><dt>Marching Order</dt><dd>${listValues(order)}</dd></div>
      <div><dt>Front</dt><dd>${listValues(front)}</dd></div>
      <div><dt>Middle</dt><dd>${listValues(middle)}</dd></div>
      <div><dt>Rear</dt><dd>${listValues(rear)}</dd></div>
      <div><dt>Scout</dt><dd>${escapeHtml(scout)}</dd></div>
      <div><dt>Light Bearer</dt><dd>${escapeHtml(lightBearer)}</dd></div>
      <div><dt>Camp Watches</dt><dd>${watches.length ? watches.join("<br>") : "None"}</dd></div>
    </dl>
    <p class="hint">Read-only here. Edit assignments from Group Management.</p>
  `;
}

async function restInspectorHtml(application) {
  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  if (!group) return "<p>No Group selected.</p>";
  const state = getGroupRestState(group);
  const cadence = state.encountersDisabled
    ? "No encounter checks"
    : `Every ${state.intervalTurns} ${state.intervalTurns === 1 ? "turn" : "turns"}`;
  const checkTurns = state.checkTurns.length ? state.checkTurns.join(", ") : "None";

  return `
    <dl class="mk-gm-data-list">
      <div><dt>Status</dt><dd>${escapeHtml(state.workflow.status)}</dd></div>
      <div><dt>Mode</dt><dd>${escapeHtml(state.workflow.mode)}</dd></div>
      <div><dt>Completed</dt><dd>${escapeHtml(state.completedTurns)} / 8 turns</dd></div>
      <div><dt>Cadence Snapshot</dt><dd>${state.cadenceSnapshotted ? "Yes" : "Not started"}</dd></div>
      <div><dt>Cadence</dt><dd>${escapeHtml(cadence)}</dd></div>
      <div><dt>Check Turns</dt><dd>${escapeHtml(checkTurns)}</dd></div>
      <div><dt>Consumed Checks</dt><dd>${escapeHtml(state.workflow.consumedChecks)}</dd></div>
      <div><dt>Remaining Checks</dt><dd>${escapeHtml(state.remainingChecks)}</dd></div>
      <div><dt>Next Check</dt><dd>${escapeHtml(state.nextCheckTurn ?? "None")}</dd></div>
    </dl>
    <p class="hint">Read-only here. Rest controls remain in Group Management.</p>
  `;
}

function moraleInspectorHtml() {
  const view = buildMoraleView(globalThis.game?.combat);
  if (!view.available) return "<p>No active Combat or Morale service is available.</p>";
  return `
    <dl class="mk-gm-data-list">
      <div><dt>Enemy Force</dt><dd>${escapeHtml(view.livingCount)} / ${escapeHtml(view.initialCount)} living</dd></div>
      <div><dt>Threshold</dt><dd>${escapeHtml(view.thresholdLabel)}${view.thresholdReached ? " · reached" : ""}</dd></div>
      <div><dt>Leader</dt><dd>${escapeHtml(view.leader?.name ?? "None")}</dd></div>
      <div><dt>Immune</dt><dd>${listValues(view.immune.map(entry => entry.name))}</dd></div>
      <div><dt>Fleeing</dt><dd>${listValues(view.fleeing.map(entry => entry.name))}</dd></div>
      <div><dt>Status</dt><dd>${view.checked ? "Resolved" : "Watching"}</dd></div>
      <div><dt>Result</dt><dd>${escapeHtml(view.resultLabel)}</dd></div>
    </dl>
    <p class="hint">Use the Combat workspace for morale actions.</p>
  `;
}

async function toolsPanelHtml(application) {
  const [context, lights, assignments, rest] = await Promise.all([
    contextInspectorHtml(),
    lightInspectorHtml(application),
    assignmentsInspectorHtml(application),
    restInspectorHtml(application),
  ]);
  const procedures = procedureInspectorHtml();
  const morale = moraleInspectorHtml();

  return `
    <article class="mk-gm-panel is-wide" data-mk-gm-tools-panel>
      <header><i class="fas fa-toolbox"></i><span>GM Tools</span></header>
      <p class="mk-gm-secondary">Expand a section to inspect active mechanics and selections. These references are read-only unless an action explicitly opens an authoritative configuration surface.</p>
      <div class="mk-gm-tools-sections">
        ${toolSection("context", "Scene / Encounter Context", "fa-mountain-sun", "Saved and effective Scene encounter selections", context)}
        ${toolSection("procedures", "Encounter Procedures", "fa-dice-d20", "Canonical hidden encounter outcome procedures", procedures)}
        ${toolSection("lights", "Active Light Sources", "fa-fire-flame-simple", "Active party light carriers and sources", lights)}
        ${toolSection("assignments", "Group Assignments", "fa-list-ol", "Marching order, roles, and camp watches", assignments)}
        ${toolSection("rest", "Rest Schedule", "fa-bed", "Current snapshotted rest encounter schedule", rest)}
        ${toolSection("morale", "Morale State", "fa-flag", "Current morale force, leader, immunity, and Fleeing", morale)}
      </div>
      <div class="mk-gm-tools-actions">
        ${toolsButton("encounter-setup", "Encounter Setup", "fa-table-list", "Open Encounter Zone and Encounter Table setup")}
        ${toolsButton("source-import", "Import Source Tables", "fa-file-import", "Open the Shadowdark source-table importer")}
      </div>
    </article>
  `;
}

async function openEncounterSetup(application) {
  application.workspace = "tables";
  return application.render({ force: true });
}

async function openSourceImporter(application) {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.sourceTables;
  if (typeof api?.openImporter !== "function") {
    globalThis.ui?.notifications?.warn?.("Source Table Importer is unavailable.");
    return null;
  }
  const result = await api.openImporter();
  if (result?.report) await application.render({ force: true });
  return result;
}

function bindTools(application, panel) {
  panel.querySelectorAll?.("[data-mk-gm-tool]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const action = String(button.dataset.mkGmTool ?? "");
      if (action === "encounter-setup") void openEncounterSetup(application);
      else if (action === "source-import") void openSourceImporter(application);
    });
  });
  return true;
}

async function decorateTools(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : element?.[0];
  const workspace = root?.querySelector?.('[data-workspace-panel="tools"]');
  if (!workspace) return false;
  workspace.innerHTML = await toolsPanelHtml(application);
  const panel = workspace.querySelector("[data-mk-gm-tools-panel]");
  if (!panel) return false;
  bindTools(application, panel);
  return true;
}

function registerGmScreenTools() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateTools(application, element);
  });
}

registerGmScreenTools();

export {
  MODULE_ID,
  gmScreenApplication,
  toolsButton,
  toolSection,
  toolsPanelHtml,
  resolveDocument,
  contextInspectorHtml,
  procedureInspectorHtml,
  lightInspectorHtml,
  namesForUuids,
  assignmentsInspectorHtml,
  restInspectorHtml,
  moraleInspectorHtml,
  openEncounterSetup,
  openSourceImporter,
  bindTools,
  decorateTools,
  registerGmScreenTools,
};