import { MODULE_ID } from "./constants.js";
import { isGroupActor } from "./actors.js";
import { getGroupData } from "./activities.js";
import { getGroupElapsedTime, GROUP_TIME_RESET_HOOK } from "./time.js";
import {
  ENVIRONMENT_CHANGED_HOOK,
  resolveSceneEnvironmentContext,
} from "../libs/environment-context.js";
import {
  checkAndResolveEncounterService,
  ENCOUNTER_FAILURE,
} from "../encounter-engine/service.js";
import { createEncounterMessage } from "../encounter-engine/chat.js";
import { resolveUuid } from "../encounter-engine/helpers.js";

const DEFAULT_EXPLORATION_TURN_SECONDS = 360;
const GROUP_EXPLORATION_ENCOUNTER_HOOK = "mkShadowdarkGroupExplorationEncounter";
const GROUP_EXPLORATION_ENCOUNTER_UPDATE_PATH = `flags.${MODULE_ID}.group.encounters.exploration`;

const latestSessionResults = new Map();

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function normalizeExplorationEncounterProgress(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

  return {
    consumedChecks: nonNegativeInteger(source.consumedChecks),
  };
}

function readStoredExplorationEncounterProgress(actor) {
  const group = getGroupData(actor);
  return group?.encounters?.exploration;
}

function getExplorationEncounterProgress(actor) {
  return normalizeExplorationEncounterProgress(readStoredExplorationEncounterProgress(actor));
}

function getExplorationTurnSeconds() {
  return DEFAULT_EXPLORATION_TURN_SECONDS;
}

function calculateExplorationEncounterSchedule({
  elapsedSeconds = 0,
  turnSeconds = DEFAULT_EXPLORATION_TURN_SECONDS,
  intervalTurns = 1,
  consumedChecks = 0,
  encountersDisabled = false,
} = {}) {
  const elapsed = nonNegativeInteger(elapsedSeconds);
  const turnDuration = Math.max(1, nonNegativeInteger(turnSeconds) || DEFAULT_EXPLORATION_TURN_SECONDS);
  const completedTurns = Math.floor(elapsed / turnDuration);

  if (encountersDisabled || Number(intervalTurns) <= 0) {
    return {
      elapsedSeconds: elapsed,
      turnSeconds: turnDuration,
      completedTurns,
      intervalTurns: 0,
      scheduledChecks: 0,
      consumedChecks: nonNegativeInteger(consumedChecks),
      dueChecks: 0,
      nextCheckTurn: null,
      turnsUntilNextCheck: null,
      encountersDisabled: true,
    };
  }

  const interval = Math.max(1, nonNegativeInteger(intervalTurns) || 1);
  const scheduledChecks = Math.floor(completedTurns / interval);
  const consumed = Math.min(nonNegativeInteger(consumedChecks), scheduledChecks);
  const dueChecks = Math.max(0, scheduledChecks - consumed);
  const nextCheckTurn = (consumed + 1) * interval;
  const turnsUntilNextCheck = Math.max(0, nextCheckTurn - completedTurns);

  return {
    elapsedSeconds: elapsed,
    turnSeconds: turnDuration,
    completedTurns,
    intervalTurns: interval,
    scheduledChecks,
    consumedChecks: consumed,
    dueChecks,
    nextCheckTurn,
    turnsUntilNextCheck,
    encountersDisabled: false,
  };
}

function getExplorationEncounterState(actor, {
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  context = resolveSceneEnvironmentContext(scene),
} = {}) {
  const progress = getExplorationEncounterProgress(actor);
  const elapsedSeconds = getGroupElapsedTime(actor, "exploration");
  const turnSeconds = getExplorationTurnSeconds();
  const encountersDisabled = context?.encounter?.disabled === true || context?.dangerLevel === "safe";
  const intervalTurns = encountersDisabled ? 0 : Number(context?.encounter?.interval ?? 1);
  const schedule = calculateExplorationEncounterSchedule({
    elapsedSeconds,
    turnSeconds,
    intervalTurns,
    consumedChecks: progress.consumedChecks,
    encountersDisabled,
  });

  return {
    context,
    progress,
    ...schedule,
  };
}

async function persistConsumedChecks(actor, consumedChecks) {
  const state = normalizeExplorationEncounterProgress({ consumedChecks });
  await actor.update({
    [GROUP_EXPLORATION_ENCOUNTER_UPDATE_PATH]: state,
  });
  return state;
}

async function reconcileExplorationEncounterProgress(actor, {
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  consumeCurrentSchedule = false,
  user = globalThis.game?.user,
} = {}) {
  if (!actor?.update || !isGroupActor(actor) || !user?.isGM) return false;

  const state = getExplorationEncounterState(actor, { scene });
  if (state.encountersDisabled) return false;
  const target = consumeCurrentSchedule
    ? state.scheduledChecks
    : Math.min(state.progress.consumedChecks, state.scheduledChecks);

  if (state.progress.consumedChecks === target) return false;
  await persistConsumedChecks(actor, target);
  return true;
}

function formatPeriod(period) {
  const value = String(period ?? "").toLowerCase();
  if (value === "night") return "Night";
  if (value === "day") return "Day";
  return value || "Unknown";
}

function latestResultForActor(actor) {
  return latestSessionResults.get(actor?.uuid ?? actor?.id ?? "") ?? null;
}

function setLatestResultForActor(actor, result) {
  const key = actor?.uuid ?? actor?.id ?? "";
  if (!key) return;
  latestSessionResults.set(key, result);
}

async function resolveEncounterTableName(context) {
  const uuid = String(context?.tableUuid ?? "");
  if (!uuid) return "Not configured";

  const table = await resolveUuid(uuid);
  if (!table || table.documentName !== "RollTable") return "Invalid table";
  return table.name ?? uuid;
}

async function buildExplorationEncounterViewData(actor, {
  isGm = Boolean(globalThis.game?.user?.isGM),
} = {}) {
  const state = getExplorationEncounterState(actor);
  const latest = isGm ? latestResultForActor(actor) : null;
  const tableName = isGm ? await resolveEncounterTableName(state.context) : "";

  return {
    terrain: state.context.terrain,
    period: formatPeriod(state.context.period),
    completedTurns: state.completedTurns,
    turnMinutes: state.turnSeconds / 60,
    isGm,
    dangerLabel: isGm ? state.context.danger?.label ?? state.context.dangerLevel : "",
    encountersDisabled: Boolean(state.encountersDisabled),
    intervalTurns: isGm ? state.intervalTurns : 0,
    dueChecks: isGm ? state.dueChecks : 0,
    tableName,
    tableConfigured: Boolean(state.context.tableUuid),
    canCheck: isGm && !state.encountersDisabled && state.dueChecks > 0 && Boolean(state.context.tableUuid),
    latest,
  };
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

function renderExplorationEncounterToolbar(view) {
  const cadence = view.encountersDisabled
    ? "<span><strong>No encounter checks</strong></span>"
    : `<span>Check every <strong>${escapeHtml(view.intervalTurns)}</strong> ${view.intervalTurns === 1 ? "turn" : "turns"}</span>`;
  const gmDetails = view.isGm
    ? `
      <span><i class="fas fa-skull-crossbones"></i> Danger <strong>${escapeHtml(view.dangerLabel)}</strong></span>
      ${cadence}
      <span>Due <strong>${escapeHtml(view.dueChecks)}</strong></span>
      <span title="Effective encounter RollTable">Table <strong>${escapeHtml(view.tableName)}</strong></span>
      <button type="button" data-action="check-due-exploration-encounters" ${view.canCheck ? "" : "disabled"}>
        <i class="fas fa-dice-d20"></i> Check Due
      </button>
      ${view.latest ? `<span title="Latest encounter check this session">Latest <strong>${escapeHtml(view.latest.label)}</strong></span>` : ""}
    `
    : "";

  return `
    <div class="mk-travel-toolbar mk-exploration-encounter-toolbar" data-mk-exploration-encounters>
      <span><i class="fas fa-map"></i> ${escapeHtml(view.terrain)}</span>
      <span><i class="fas fa-clock"></i> ${escapeHtml(view.period)}</span>
      <span>Exploration turns <strong>${escapeHtml(view.completedTurns)}</strong></span>
      <span title="${escapeHtml(view.turnMinutes)} minutes per exploration turn">Turn <strong>${escapeHtml(view.turnMinutes)} min</strong></span>
      ${gmDetails}
    </div>
  `;
}

function getRootElement(html) {
  if (!html) return null;
  if (globalThis.HTMLElement && html instanceof HTMLElement) return html;
  if (globalThis.HTMLElement && html[0] instanceof HTMLElement) return html[0];
  return html?.[0] ?? html;
}

async function openExplorationEncounterContextDialog(actor) {
  if (!globalThis.game?.user?.isGM) return null;
  globalThis.ui?.notifications?.warn?.(
    "Scene Context editing is temporarily unavailable while the MK-Shadowdark GM Screen is disabled."
  );
  return null;
}

async function preflightEncounterTable(context) {
  const tableUuid = String(context?.tableUuid ?? "");
  if (!tableUuid) return ENCOUNTER_FAILURE.MISSING_TABLE;
  const table = await resolveUuid(tableUuid);
  if (!table || table.documentName !== "RollTable") return ENCOUNTER_FAILURE.INVALID_TABLE;
  return "";
}

async function processDueExplorationEncounters(actor, {
  user = globalThis.game?.user,
  notify = true,
} = {}) {
  if (!actor?.update || !isGroupActor(actor)) {
    throw new TypeError("A Group Actor is required to process exploration encounters.");
  }
  if (!user?.isGM) {
    if (notify) globalThis.ui?.notifications?.warn?.("Only the GM can process Group exploration encounters.");
    return null;
  }

  let state = getExplorationEncounterState(actor);
  if (state.dueChecks <= 0) {
    if (notify) globalThis.ui?.notifications?.info?.(
      state.encountersDisabled ? "Safe danger has no exploration encounter checks." : "No exploration encounter check is due."
    );
    return {
      processed: 0,
      dueBefore: 0,
      results: [],
      state,
      reason: "not-due",
    };
  }

  const preflightReason = await preflightEncounterTable(state.context);
  if (preflightReason) {
    if (notify) {
      const message = preflightReason === ENCOUNTER_FAILURE.MISSING_TABLE
        ? "Configure an encounter RollTable before checking due encounters."
        : "The configured encounter RollTable is invalid.";
      globalThis.ui?.notifications?.warn?.(message);
    }
    return {
      processed: 0,
      dueBefore: state.dueChecks,
      results: [],
      state,
      reason: preflightReason,
    };
  }

  const dueBefore = state.dueChecks;
  const results = [];
  let consumedChecks = state.progress.consumedChecks;

  for (let index = 0; index < dueBefore; index += 1) {
    const serviceResult = await checkAndResolveEncounterService({
      source: "groupExploration",
      requireGm: true,
      respectEnabled: true,
      user,
    });

    results.push(serviceResult);

    let latestLabel = "No encounter";
    if (serviceResult.reason) {
      latestLabel = `Check failed: ${serviceResult.reason}`;
    } else {
      consumedChecks += 1;
      if (serviceResult.isEncounter && serviceResult.encounter) {
        serviceResult.encounter.groupContext = {
          groupActorUuid: String(actor.uuid ?? ""),
          procedure: "exploration",
        };
        latestLabel = `Encounter: ${serviceResult.encounter.encounter?.label ?? "Resolved"}`;
        await createEncounterMessage(serviceResult.encounter, { whisper: true });
      } else if (serviceResult.isEncounter) {
        latestLabel = "Encounter triggered";
      }
    }

    setLatestResultForActor(actor, {
      label: latestLabel,
      isEncounter: Boolean(serviceResult.isEncounter),
      reason: String(serviceResult.reason ?? ""),
      processedAt: Date.now(),
    });

    if (serviceResult.reason) break;
  }

  await persistConsumedChecks(actor, consumedChecks);
  state = getExplorationEncounterState(actor);

  const transition = {
    groupActorUuid: String(actor.uuid ?? ""),
    processed: results.filter(result => !result.reason).length,
    dueBefore,
    dueAfter: state.dueChecks,
    results,
    state,
  };

  globalThis.Hooks?.callAll?.(GROUP_EXPLORATION_ENCOUNTER_HOOK, actor, transition);

  if (notify) {
    const encounters = results.filter(result => result.isEncounter && result.encounter && !result.reason).length;
    globalThis.ui?.notifications?.info?.(
      `Processed ${transition.processed} exploration encounter ${transition.processed === 1 ? "check" : "checks"}; ${encounters} ${encounters === 1 ? "encounter" : "encounters"}.`
    );
  }

  actor.sheet?.render?.(false);
  return transition;
}

async function renderExplorationEncounterContext(app, html) {
  const actor = app?.actor;
  if (!isGroupActor(actor)) return;

  const root = getRootElement(html);
  const toolbar = root?.querySelector?.(".mk-group-tab[data-tab='traveling'] .mk-travel-toolbar");
  if (!toolbar) return;

  root.querySelector?.("[data-mk-exploration-encounters]")?.remove();
  const view = await buildExplorationEncounterViewData(actor);
  toolbar.insertAdjacentHTML("afterend", renderExplorationEncounterToolbar(view));

  const encounterToolbar = root.querySelector?.("[data-mk-exploration-encounters]");
  encounterToolbar?.querySelector?.("[data-action='check-due-exploration-encounters']")?.addEventListener("click", event => {
    event.preventDefault();
    processDueExplorationEncounters(actor).catch(error => {
      console.error(`${MODULE_ID} | Group Exploration Encounters | Encounter processing failed`, error);
      globalThis.ui?.notifications?.error?.(`Encounter processing failed: ${error.message}`);
    });
  });
}

function refreshAllGroupsForEnvironmentChange() {
  if (!globalThis.game?.user?.isGM) return;
  for (const actor of globalThis.game?.actors ?? []) {
    if (isGroupActor(actor)) actor.sheet?.render?.(false);
  }
}

async function handleGroupTimeReset(actor, transition) {
  if (!globalThis.game?.user?.isGM || !isGroupActor(actor)) return;
  if (transition?.procedure && transition.procedure !== "exploration") return;

  try {
    const state = getExplorationEncounterState(actor);
    await persistConsumedChecks(actor, state.scheduledChecks);
    latestSessionResults.delete(actor.uuid ?? actor.id ?? "");
    actor.sheet?.render?.(false);
  } catch (error) {
    console.warn(`${MODULE_ID} | Group Exploration Encounters | Could not reset encounter progress.`, error);
  }
}

function exposeExplorationEncounterApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupExplorationEncounters = {
    hook: GROUP_EXPLORATION_ENCOUNTER_HOOK,
    defaultTurnSeconds: DEFAULT_EXPLORATION_TURN_SECONDS,
    getTurnSeconds: getExplorationTurnSeconds,
    calculateSchedule: calculateExplorationEncounterSchedule,
    getState: getExplorationEncounterState,
    reconcile: reconcileExplorationEncounterProgress,
    processDue: processDueExplorationEncounters,
    configure: openExplorationEncounterContextDialog,
  };

  return module.api.groupExplorationEncounters;
}

function registerGroupExplorationEncounterService() {
  globalThis.Hooks?.once?.("ready", () => {
    exposeExplorationEncounterApi();
  });

  globalThis.Hooks?.on?.("renderActorSheet", (app, html) => {
    renderExplorationEncounterContext(app, html).catch(error => {
      console.warn(`${MODULE_ID} | Group Exploration Encounters | Render failed.`, error);
    });
  });

  globalThis.Hooks?.on?.(ENVIRONMENT_CHANGED_HOOK, () => {
    refreshAllGroupsForEnvironmentChange();
  });

  globalThis.Hooks?.on?.(GROUP_TIME_RESET_HOOK, (actor, transition) => {
    handleGroupTimeReset(actor, transition);
  });
}

export {
  DEFAULT_EXPLORATION_TURN_SECONDS,
  GROUP_EXPLORATION_ENCOUNTER_HOOK,
  normalizeExplorationEncounterProgress,
  getExplorationTurnSeconds,
  calculateExplorationEncounterSchedule,
  getExplorationEncounterProgress,
  getExplorationEncounterState,
  reconcileExplorationEncounterProgress,
  buildExplorationEncounterViewData,
  renderExplorationEncounterToolbar,
  openExplorationEncounterContextDialog,
  processDueExplorationEncounters,
  renderExplorationEncounterContext,
  refreshAllGroupsForEnvironmentChange,
  exposeExplorationEncounterApi,
  registerGroupExplorationEncounterService,
};
