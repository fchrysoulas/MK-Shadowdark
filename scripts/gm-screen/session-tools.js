import { setSceneEnvironmentContext, getSceneEnvironmentContext } from "../libs/environment-context.js";
import { waitForGmDialog } from "../libs/dialog-v2.js";
import { openEncounterStagingDialog } from "../group-sheet/encounters/staging.js";
import { createSourceDrivenNpc } from "./npc-generator.js";
import {
  availableEncounterZoneTables,
  cachedAvailableRollTables,
  dangerOptions,
  setSceneEncounterZoneTableUuid,
  tableOptions,
  terrainOptions,
  buildEnvironmentEditorView,
} from "./environment-controls.js";
import { APP_ID } from "./gm-screen.js";
import {
  buildEncounterHistory,
  getSessionState,
} from "./encounter-history.js";
import { resolveGmScreenGroup } from "./view-model.js";

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

function rootElement(element) {
  if (element?.querySelector) return element;
  if (element?.[0]?.querySelector) return element[0];
  return null;
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function sceneContextDialogContent(view, zoneTables, tables) {
  const zoneUuids = new Set(zoneTables.map(table => table.uuid));
  const encounterTables = tables.filter(table => !zoneUuids.has(String(table?.uuid ?? "")));
  const stored = view.stored;
  return `
    <div class="mk-gm-session-tool-dialog mk-gm-scene-context-dialog">
      <p class="mk-gm-secondary">Configure the active Scene's terrain, danger, period, Encounter Zone source, and encounter RollTable.</p>
      <div class="mk-gm-scene-context-grid">
        <div class="form-group">
          <label>Encounter Zone Source</label>
          <select name="zoneTableUuid">
            ${tableOptions(zoneTables, view.zoneTableUuid, { emptyLabel: "Use Scene Encounter Zone grid" })}
          </select>
        </div>
        <div class="form-group">
          <label>Encounter Table</label>
          <select name="tableUuid">
            ${tableOptions(encounterTables, getSceneEnvironmentContext(view.scene).tableUuid, { emptyLabel: "Automatic / default table" })}
          </select>
        </div>
        <div class="form-group">
          <label>Terrain</label>
          <select name="terrain" ${view.terrains.length ? "" : "disabled"}>
            ${terrainOptions(view.terrains, stored.terrain)}
          </select>
        </div>
        <div class="form-group">
          <label>Danger</label>
          <select name="dangerLevel">
            ${dangerOptions(view.rules, stored.dangerLevel)}
          </select>
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
      <dl class="mk-gm-data-list">
        <div><dt>Effective Period</dt><dd>${escapeHtml(view.resolved.period)}</dd></div>
        <div><dt>Encounter Cadence</dt><dd>${escapeHtml(view.resolved.dangerLabel)} · every ${escapeHtml(view.resolved.interval)} ${view.resolved.interval === 1 ? "turn" : "turns"}</dd></div>
        <div><dt>Occurrence</dt><dd>${escapeHtml(view.resolved.formula)} · encounter on ${escapeHtml(view.resolved.encounterOn)}</dd></div>
      </dl>
    </div>
  `;
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

function readSceneContextDialog(button) {
  const form = button?.form ?? button?.closest?.("form");
  if (!form) return null;
  const read = name => String(form.querySelector?.(`[name="${name}"]`)?.value ?? "");
  return {
    zoneTableUuid: read("zoneTableUuid"),
    tableUuid: read("tableUuid"),
    terrain: read("terrain").trim() || "Default",
    dangerLevel: read("dangerLevel"),
    period: read("period") || "auto",
  };
}

async function openSceneContextDialog(application = null) {
  if (!globalThis.game?.user?.isGM) return null;
  const scene = currentScene();
  if (!scene) {
    globalThis.ui?.notifications?.warn?.("Activate a Scene before editing Scene Context.");
    return null;
  }

  const view = buildEnvironmentEditorView({ scene });
  const zoneTables = availableEncounterZoneTables();
  const tables = await cachedAvailableRollTables();
  const result = await waitForGmDialog({
    title: `Scene Context · ${view.sceneName}`,
    content: sceneContextDialogContent(view, zoneTables, tables),
    buttons: [
      {
        action: "save",
        icon: '<i class="fas fa-floppy-disk"></i>',
        label: "Save Scene Context",
        default: true,
        callback: (_event, button) => ({
          action: "save",
          value: readSceneContextDialog(button),
        }),
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

  if (result?.action !== "save" || !result.value) return null;
  const value = result.value;
  const current = getSceneEnvironmentContext(scene);
  await setSceneEncounterZoneTableUuid(value.zoneTableUuid, scene);
  const nextView = buildEnvironmentEditorView({ scene });
  const terrain = nextView.terrains.length && !nextView.terrains.includes(value.terrain)
    ? nextView.terrains[0]
    : value.terrain;
  await setSceneEnvironmentContext({
    ...current,
    terrain,
    dangerLevel: value.dangerLevel,
    period: value.period,
    tableUuid: value.tableUuid,
  }, scene);
  await application?.render?.({ force: true });
  globalThis.ui?.notifications?.info?.("Scene Context saved.");
  return value;
}

function renderSessionTools({
  hasGroup = false,
  hasLatestEncounter = false,
} = {}) {
  return `
    <article class="mk-gm-panel is-wide mk-gm-session-tools" data-mk-gm-session-tools>
      <header><i class="fas fa-screwdriver-wrench"></i><span>GM Tools</span></header>
      <p class="mk-gm-secondary">Every GM Screen tool has a direct test or open button here.</p>
      <div class="mk-gm-session-tools-grid">
        <button type="button" data-mk-session-tool="group" ${hasGroup ? "" : "disabled"}>
          <i class="fas fa-users-gear"></i> Open Group Management
        </button>
        <button type="button" data-mk-session-tool="scene-context">
          <i class="fas fa-mountain-sun"></i> Scene Context &amp; Encounters
        </button>
        <button type="button" data-mk-session-tool="overview">
          <i class="fas fa-house"></i> Open Overview
        </button>
        <button type="button" data-mk-session-tool="exploration">
          <i class="fas fa-map"></i> Open Encounter Zone
        </button>
        <button type="button" data-mk-session-tool="tables">
          <i class="fas fa-table-list"></i> Open Source Tables
        </button>
        <button type="button" data-mk-session-tool="settlement">
          <i class="fas fa-coins"></i> Open Settlement Tools
        </button>
        <button type="button" data-mk-session-tool="npc">
          <i class="fas fa-user-plus"></i> Test NPC Generator
        </button>
        <div class="mk-gm-session-tool-roll">
          <label for="mk-gm-session-time-passes-dice">Time Passes</label>
          <select id="mk-gm-session-time-passes-dice" data-mk-session-time-passes-dice aria-label="Time Passes dice">
            <option value="1">1d6</option>
            <option value="2">2d6</option>
            <option value="3">3d6</option>
          </select>
          <button type="button" data-mk-session-tool="time-passes"><i class="fas fa-hourglass-half"></i> Test Roll</button>
        </div>
        <button type="button" data-mk-session-tool="stage-latest" ${hasLatestEncounter ? "" : "disabled"}>
          <i class="fas fa-location-dot"></i> Test Latest Encounter Staging
        </button>
      </div>
    </article>
  `;
}

async function openWorkspace(application, workspace) {
  application.workspace = workspace;
  await application.render?.({ force: true });
  return workspace;
}

async function openGroupManagement(application) {
  const group = await resolveGmScreenGroup(application?.groupActorUuid ?? "");
  if (!group) {
    globalThis.ui?.notifications?.warn?.("No MK-Shadowdark Group is available.");
    return null;
  }
  group.sheet?.render?.(true);
  return group;
}

async function testTimePasses(root) {
  const diceCount = Math.min(3, Math.max(1, Number(root?.querySelector?.("[data-mk-session-time-passes-dice]")?.value) || 1));
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.timePasses;
  const roll = api?.roll ?? api?.timePasses;
  if (typeof roll !== "function") {
    globalThis.ui?.notifications?.warn?.("Time Passes is unavailable.");
    return null;
  }
  return roll({ diceCount });
}

async function stageLatestEncounter(application) {
  const group = await resolveGmScreenGroup(application?.groupActorUuid ?? "");
  const history = buildEncounterHistory(group, {
    session: getSessionState(group),
  });
  const latest = history.entries[0];
  if (!latest?.data) {
    globalThis.ui?.notifications?.warn?.("No resolved Group encounter is available to stage.");
    return null;
  }
  return openEncounterStagingDialog(latest.data, {
    sourceMessageId: latest.messageId,
  });
}

async function bindSessionTools(application, workspace) {
  const root = workspace?.querySelector?.("[data-mk-gm-session-tools]");
  if (!root || root.dataset.mkSessionToolsBound === "true") return false;
  root.dataset.mkSessionToolsBound = "true";

  root.querySelectorAll?.("[data-mk-session-tool]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try {
        const action = String(button.dataset.mkSessionTool ?? "");
        if (action === "group") await openGroupManagement(application);
        if (["overview", "exploration", "tables", "settlement"].includes(action)) {
          await openWorkspace(application, action === "settlement" ? "downtime" : action);
        }
        if (action === "scene-context") await openSceneContextDialog(application);
        if (action === "npc") await createSourceDrivenNpc();
        if (action === "time-passes") await testTimePasses(root);
        if (action === "stage-latest") await stageLatestEncounter(application);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Session Tools | Action failed", error);
        globalThis.ui?.notifications?.error?.(`GM tool failed: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
  });
  return true;
}

async function decorateSessionTools(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = rootElement(element);
  const workspace = root?.querySelector?.('[data-workspace-panel="session-log"]');
  if (!workspace) return false;

  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  const history = buildEncounterHistory(group, { session: getSessionState(group) });
  workspace.querySelector?.("[data-mk-gm-session-tools]")?.remove?.();
  workspace.insertAdjacentHTML?.("afterbegin", renderSessionTools({
    hasGroup: Boolean(group),
    hasLatestEncounter: Boolean(history.entries[0]?.data),
  }));
  await bindSessionTools(application, workspace);
  return true;
}

function registerSessionTools() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateSessionTools(application, element);
  });
}

registerSessionTools();

export {
  MODULE_ID,
  gmScreenApplication,
  sceneContextDialogContent,
  readSceneContextDialog,
  openSceneContextDialog,
  renderSessionTools,
  openWorkspace,
  openGroupManagement,
  testTimePasses,
  stageLatestEncounter,
  bindSessionTools,
  decorateSessionTools,
  registerSessionTools,
};
