import { MODULE_ID } from "./constants.js";
import { isGroupActor, resolveActorFromUuid } from "./actors.js";
import { getGroupData } from "./activities.js";
import { getGroupAssignments } from "./assignments.js";
import {
  getGroupProcedureState,
  setGroupProcedureState,
} from "./procedure.js";
import {
  advanceGroupTime,
  getGroupElapsedTime,
  resetGroupTime,
} from "./time.js";
import { resolveSceneEnvironmentContext } from "../libs/environment-context.js";
import {
  checkAndResolveEncounterService,
  ENCOUNTER_FAILURE,
} from "../encounter-engine/service.js";
import { createEncounterMessage } from "../encounter-engine/chat.js";
import { resolveUuid } from "../encounter-engine/helpers.js";
import {
  consumePartyFoodRations,
  getPartyFoodTotal,
} from "./inventory.js";
import { getRestMode, reportRest, restActor } from "../libs/resting.js";

const REST_TURN_SECONDS = 60 * 60;
const REST_TOTAL_TURNS = 8;
const GROUP_REST_WORKFLOW_HOOK = "mkShadowdarkGroupRestWorkflow";
const GROUP_REST_UPDATE_PATH = `flags.${MODULE_ID}.group.resting`;
const REST_STATUSES = new Set(["ready", "checking", "interrupted", "completed"]);

function nonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function uniqueStrings(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter(value => typeof value === "string" && value)
  )];
}

function normalizeRestCheckTurns(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(nonNegativeInteger)
      .filter(turn => turn >= 1 && turn <= REST_TOTAL_TURNS)
  )].sort((left, right) => left - right);
}

function normalizeGroupRestWorkflow(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const status = REST_STATUSES.has(source.status) ? source.status : "ready";
  const mode = String(source.mode ?? "normal").toLowerCase() === "grinder"
    ? "grinder"
    : "normal";
  const checkTurns = normalizeRestCheckTurns(source.checkTurns);

  return {
    status,
    mode,
    plannedRations: nonNegativeInteger(source.plannedRations),
    consumedChecks: nonNegativeInteger(source.consumedChecks),
    intervalTurns: nonNegativeInteger(source.intervalTurns),
    checkTurns,
    participantUuids: uniqueStrings(source.participantUuids),
    completedMemberUuids: uniqueStrings(source.completedMemberUuids),
    rationsConsumed: Boolean(source.rationsConsumed),
    returnProcedure: String(source.returnProcedure ?? "downtime"),
  };
}

function getGroupRestWorkflow(actor) {
  return normalizeGroupRestWorkflow(getGroupData(actor)?.resting);
}

async function setGroupRestWorkflow(actor, workflow) {
  const normalized = normalizeGroupRestWorkflow(workflow);
  await actor.update({
    [GROUP_REST_UPDATE_PATH]: normalized,
  });
  return normalized;
}

function calculateRestCheckTurns(intervalTurns, totalTurns = REST_TOTAL_TURNS) {
  const interval = Math.max(1, nonNegativeInteger(intervalTurns) || 1);
  const total = Math.max(0, nonNegativeInteger(totalTurns));
  const turns = [];

  for (let turn = interval; turn <= total; turn += interval) {
    turns.push(turn);
  }

  return turns;
}

function getCompletedRestTurns(actor) {
  return Math.min(
    REST_TOTAL_TURNS,
    Math.floor(getGroupElapsedTime(actor, "resting") / REST_TURN_SECONDS)
  );
}

function restCadenceForContext(context = resolveSceneEnvironmentContext()) {
  const intervalTurns = Math.max(1, Number(context?.encounter?.interval ?? 1) || 1);
  return {
    intervalTurns,
    checkTurns: calculateRestCheckTurns(intervalTurns),
  };
}

function workflowHasCadenceSnapshot(workflow) {
  return Array.isArray(workflow?.checkTurns) && workflow.checkTurns.length > 0;
}

function getGroupRestState(actor, {
  context = resolveSceneEnvironmentContext(),
} = {}) {
  const workflow = getGroupRestWorkflow(actor);
  const currentCadence = restCadenceForContext(context);
  const hasSnapshot = workflowHasCadenceSnapshot(workflow);
  const intervalTurns = hasSnapshot
    ? Math.max(1, workflow.intervalTurns || currentCadence.intervalTurns)
    : currentCadence.intervalTurns;
  const checkTurns = hasSnapshot
    ? [...workflow.checkTurns]
    : currentCadence.checkTurns;
  const consumedChecks = Math.min(workflow.consumedChecks, checkTurns.length);
  const completedTurns = getCompletedRestTurns(actor);
  const nextCheckTurn = checkTurns[consumedChecks] ?? null;

  return {
    workflow: {
      ...workflow,
      consumedChecks,
    },
    context,
    cadenceSnapshotted: hasSnapshot,
    intervalTurns,
    checkTurns,
    completedTurns,
    requiredChecks: checkTurns.length,
    remainingChecks: Math.max(0, checkTurns.length - consumedChecks),
    nextCheckTurn,
    completeTimeReached: completedTurns >= REST_TOTAL_TURNS,
  };
}

async function ensureActiveRestCadenceSnapshot(actor, {
  context = resolveSceneEnvironmentContext(),
  user = globalThis.game?.user,
} = {}) {
  if (!actor?.update || !isGroupActor(actor) || !user?.isGM) return false;

  const workflow = getGroupRestWorkflow(actor);
  if (!["checking", "interrupted"].includes(workflow.status)) return false;
  if (workflowHasCadenceSnapshot(workflow)) return false;

  const cadence = restCadenceForContext(context);
  workflow.intervalTurns = cadence.intervalTurns;
  workflow.checkTurns = cadence.checkTurns;
  await setGroupRestWorkflow(actor, workflow);
  return true;
}

async function resolveRestParticipants(actor, workflow = getGroupRestWorkflow(actor)) {
  const participants = [];

  for (const uuid of workflow.participantUuids) {
    const member = await resolveActorFromUuid(uuid);
    if (member?.update) participants.push(member);
  }

  return participants;
}

async function getCurrentActiveParticipants(actor) {
  const group = getGroupData(actor);
  const participants = [];

  for (const uuid of group.activeMembers ?? []) {
    const member = await resolveActorFromUuid(uuid);
    if (member?.update) participants.push(member);
  }

  return participants;
}

async function preflightRestEncounterTable(state) {
  if (state.remainingChecks <= 0) return "";
  const tableUuid = String(state.context?.tableUuid ?? "");
  if (!tableUuid) return ENCOUNTER_FAILURE.MISSING_TABLE;
  const table = await resolveUuid(tableUuid);
  if (!table || table.documentName !== "RollTable") return ENCOUNTER_FAILURE.INVALID_TABLE;
  return "";
}

function emitRestWorkflow(actor, transition) {
  globalThis.Hooks?.callAll?.(GROUP_REST_WORKFLOW_HOOK, actor, transition);
  actor?.sheet?.render?.(false);
  return transition;
}

async function startGroupRest(actor, {
  plannedRations,
  participants,
  mode = getRestMode(),
  user = globalThis.game?.user,
  context = resolveSceneEnvironmentContext(),
} = {}) {
  if (!actor?.update || !isGroupActor(actor)) {
    throw new TypeError("A Group Actor is required to start resting.");
  }
  if (!user?.isGM) return null;

  const participantUuids = uniqueStrings((participants ?? []).map(member => member?.uuid));
  if (!participantUuids.length) throw new Error("At least one active party member is required to rest.");

  const rationCount = nonNegativeInteger(plannedRations);
  const previousProcedure = getGroupProcedureState(actor);
  const returnProcedure = previousProcedure === "resting" ? "downtime" : previousProcedure;
  const cadence = restCadenceForContext(context);

  await resetGroupTime(actor, "resting", {
    user,
    reason: "start-group-rest",
    notify: false,
  });
  await setGroupProcedureState(actor, "resting", {
    user,
    reason: "start-group-rest",
    notify: false,
  });

  const workflow = await setGroupRestWorkflow(actor, {
    status: "checking",
    mode,
    plannedRations: rationCount,
    consumedChecks: 0,
    intervalTurns: cadence.intervalTurns,
    checkTurns: cadence.checkTurns,
    participantUuids,
    completedMemberUuids: [],
    rationsConsumed: false,
    returnProcedure,
  });

  emitRestWorkflow(actor, {
    action: "started",
    workflow,
  });
  return workflow;
}

async function advanceRestToTurn(actor, targetTurn, {
  user = globalThis.game?.user,
} = {}) {
  const currentTurn = getCompletedRestTurns(actor);
  const target = Math.max(currentTurn, Math.min(REST_TOTAL_TURNS, nonNegativeInteger(targetTurn)));
  const turnsToAdvance = target - currentTurn;
  if (turnsToAdvance <= 0) return null;

  return advanceGroupTime(actor, turnsToAdvance * REST_TURN_SECONDS, {
    procedure: "resting",
    syncWorldTime: true,
    user,
    reason: `rest-to-turn-${target}`,
    notify: false,
  });
}

async function finalizeGroupRest(actor, {
  user = globalThis.game?.user,
  notify = true,
} = {}) {
  let workflow = getGroupRestWorkflow(actor);
  const participants = await resolveRestParticipants(actor, workflow);

  if (!participants.length) {
    throw new Error("The resting party members can no longer be resolved.");
  }

  if (!workflow.rationsConsumed) {
    const available = getPartyFoodTotal(participants);
    if (workflow.plannedRations > available) {
      throw new Error(
        `Only ${available} tracked ration${available === 1 ? "" : "s"} remain for the resting party; `
        + `${workflow.plannedRations} were planned.`
      );
    }

    await consumePartyFoodRations(participants, workflow.plannedRations);
    workflow.rationsConsumed = true;
    workflow = await setGroupRestWorkflow(actor, workflow);
  }

  const completed = new Set(workflow.completedMemberUuids);
  const failedNames = [];

  for (const member of participants) {
    if (completed.has(member.uuid)) continue;

    try {
      const result = await restActor(member, workflow.mode);
      if (!result) {
        failedNames.push(member.name);
        continue;
      }
      await reportRest(member, result);
      completed.add(member.uuid);
      workflow.completedMemberUuids = [...completed];
      workflow = await setGroupRestWorkflow(actor, workflow);
    } catch (error) {
      console.error(`${MODULE_ID} | Group Rest | Could not rest ${member.name}.`, error);
      failedNames.push(member.name);
    }
  }

  if (failedNames.length) {
    workflow.status = "checking";
    workflow = await setGroupRestWorkflow(actor, workflow);
    if (notify) {
      globalThis.ui?.notifications?.warn?.(
        `Rest benefits are incomplete for: ${failedNames.join(", ")}. Use Rest Party to continue.`
      );
    }
    return emitRestWorkflow(actor, {
      action: "benefits-incomplete",
      workflow,
      failedNames,
    });
  }

  workflow.status = "completed";
  workflow = await setGroupRestWorkflow(actor, workflow);

  const returnProcedure = ["exploration", "combat", "downtime"].includes(workflow.returnProcedure)
    ? workflow.returnProcedure
    : "downtime";
  await setGroupProcedureState(actor, returnProcedure, {
    user,
    reason: "group-rest-completed",
    notify: false,
  });

  if (notify) {
    globalThis.ui?.notifications?.info?.(
      `${participants.length} party member${participants.length === 1 ? "" : "s"} completed a ${workflow.mode} rest. `
      + `${workflow.plannedRations} ration${workflow.plannedRations === 1 ? "" : "s"} consumed.`
    );
  }

  return emitRestWorkflow(actor, {
    action: "completed",
    workflow,
    participants: participants.map(member => member.uuid),
  });
}

async function continueGroupRest(actor, {
  user = globalThis.game?.user,
  notify = true,
  encounterService = checkAndResolveEncounterService,
} = {}) {
  if (!actor?.update || !isGroupActor(actor)) {
    throw new TypeError("A Group Actor is required to continue resting.");
  }
  if (!user?.isGM) return null;

  await ensureActiveRestCadenceSnapshot(actor, { user });

  let state = getGroupRestState(actor);
  let workflow = state.workflow;
  if (!["checking", "interrupted"].includes(workflow.status)) {
    throw new Error("There is no active interrupted/checking rest to continue.");
  }

  const preflightReason = await preflightRestEncounterTable(state);
  if (preflightReason) {
    if (notify) {
      const message = preflightReason === ENCOUNTER_FAILURE.MISSING_TABLE
        ? "Configure an encounter RollTable before continuing this rest."
        : "The configured encounter RollTable is invalid.";
      globalThis.ui?.notifications?.warn?.(message);
    }
    return emitRestWorkflow(actor, {
      action: "configuration-required",
      workflow,
      reason: preflightReason,
      state,
    });
  }

  if (workflow.status === "interrupted") {
    workflow.status = "checking";
    workflow = await setGroupRestWorkflow(actor, workflow);
  }

  while (true) {
    state = getGroupRestState(actor);
    workflow = state.workflow;

    if (workflow.consumedChecks >= state.requiredChecks) break;

    const targetTurn = state.checkTurns[workflow.consumedChecks];
    await advanceRestToTurn(actor, targetTurn, { user });

    const serviceResult = await encounterService({
      source: "groupResting",
      requireGm: true,
      respectEnabled: true,
      user,
    });

    workflow = getGroupRestWorkflow(actor);

    if (serviceResult.reason) {
      workflow.status = "interrupted";
      workflow = await setGroupRestWorkflow(actor, workflow);
      if (notify) {
        globalThis.ui?.notifications?.warn?.(
          `Rest paused because the encounter check could not finish: ${serviceResult.reason}.`
        );
      }
      return emitRestWorkflow(actor, {
        action: "interrupted",
        workflow,
        encounter: serviceResult,
        completedTurns: getCompletedRestTurns(actor),
      });
    }

    workflow.consumedChecks += 1;

    if (serviceResult.isEncounter) {
      workflow.status = "interrupted";
      workflow = await setGroupRestWorkflow(actor, workflow);

      if (serviceResult.encounter) {
        serviceResult.encounter.groupContext = {
          groupActorUuid: String(actor.uuid ?? ""),
          procedure: "resting",
        };
        await createEncounterMessage(serviceResult.encounter, { whisper: true });
      }

      if (notify) {
        globalThis.ui?.notifications?.warn?.(
          `Rest interrupted at resting turn ${getCompletedRestTurns(actor)}. Resolve the encounter, then use Rest Party to continue.`
        );
      }

      return emitRestWorkflow(actor, {
        action: "interrupted",
        workflow,
        encounter: serviceResult,
        completedTurns: getCompletedRestTurns(actor),
      });
    }

    workflow = await setGroupRestWorkflow(actor, workflow);
  }

  await advanceRestToTurn(actor, REST_TOTAL_TURNS, { user });
  return finalizeGroupRest(actor, { user, notify });
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

function getRootElement(html) {
  if (!html) return null;
  if (globalThis.HTMLElement && html instanceof HTMLElement) return html;
  if (globalThis.HTMLElement && html[0] instanceof HTMLElement) return html[0];
  return html?.[0] ?? html;
}

async function promptNewGroupRest(actor) {
  const participants = await getCurrentActiveParticipants(actor);
  if (!participants.length) {
    globalThis.ui?.notifications?.warn?.("Add at least one active party member before resting.");
    return null;
  }

  const availableRations = getPartyFoodTotal(participants);
  const mode = getRestMode();
  const state = getGroupRestState(actor);
  const checks = state.checkTurns.length;
  const assignments = getGroupAssignments(actor);
  const watches = assignments.camping.watches ?? [];
  const watchMembers = uniqueStrings(watches.flatMap(watch => watch.actorUuids));

  const rationInput = await Dialog.wait({
    title: "Rest Active Party",
    content: `
      <form>
        <p><strong>${escapeHtml(participants.length)}</strong> active party member${participants.length === 1 ? "" : "s"}; <strong>${escapeHtml(availableRations)}</strong> tracked ration${availableRations === 1 ? "" : "s"}.</p>
        <p>Rest duration: <strong>${REST_TOTAL_TURNS} turns / ${REST_TOTAL_TURNS} hours</strong>. Required encounter checks in the current danger: <strong>${checks}</strong>.</p>
        <p>Camp watches: <strong>${escapeHtml(watches.length)}</strong> slot${watches.length === 1 ? "" : "s"}, <strong>${escapeHtml(watchMembers.length)}</strong> assigned member${watchMembers.length === 1 ? "" : "s"}.</p>
        <div class="form-group">
          <label>Total rations to consume on successful completion</label>
          <input type="number" name="rations" value="${Math.min(participants.length, availableRations)}" min="0" max="${availableRations}" step="1" required>
        </div>
        <p class="hint">The encounter cadence is fixed when this rest begins. Rations and rest benefits are applied only after all required checks complete without an unresolved interruption.</p>
      </form>
    `,
    buttons: {
      rest: {
        icon: '<i class="fas fa-bed"></i>',
        label: "Begin Rest",
        callback: html => {
          const root = getRootElement(html);
          return root?.querySelector?.('[name="rations"]')?.value
            ?? html?.find?.('[name="rations"]')?.val?.()
            ?? null;
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "rest",
    close: () => null,
  });

  if (rationInput === null) return null;
  const rationCount = Number(rationInput);
  if (!Number.isInteger(rationCount) || rationCount < 0 || rationCount > availableRations) {
    globalThis.ui?.notifications?.warn?.(`Enter a whole number from 0 to ${availableRations}.`);
    return null;
  }

  await startGroupRest(actor, {
    plannedRations: rationCount,
    participants,
    mode,
  });
  return continueGroupRest(actor);
}

async function handleRestPartyClick(event, actor) {
  if (!globalThis.game?.user?.isGM) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();

  const workflow = getGroupRestWorkflow(actor);

  if (["checking", "interrupted"].includes(workflow.status)) {
    if (workflow.status === "interrupted") {
      const resume = await Dialog.confirm({
        title: "Resume Interrupted Rest",
        content: "<p>The GM is confirming that the interruption has been resolved. Continue the same rest from its current resting turn?</p>",
        yes: () => true,
        no: () => false,
        defaultYes: false,
      });
      if (!resume) return;
    }

    await continueGroupRest(actor);
    return;
  }

  await promptNewGroupRest(actor);
}

function statusLabel(status) {
  if (status === "checking") return "In progress";
  if (status === "interrupted") return "Interrupted";
  if (status === "completed") return "Completed";
  return "Ready";
}

async function renderGroupRestContext(app, html) {
  const actor = app?.actor;
  if (!isGroupActor(actor)) return;

  await ensureActiveRestCadenceSnapshot(actor);

  const root = getRootElement(html);
  const campingInfo = root?.querySelector?.(".mk-group-tab[data-tab='camping'] .mk-camping-info");
  const restButton = root?.querySelector?.("[data-action='rest-party']");
  if (!campingInfo || !restButton) return;

  root.querySelector?.("[data-mk-group-rest-context]")?.remove();
  const state = getGroupRestState(actor);
  const watches = getGroupAssignments(actor).camping.watches ?? [];
  const watchMembers = uniqueStrings(watches.flatMap(watch => watch.actorUuids));
  const isGm = Boolean(globalThis.game?.user?.isGM);

  const gmDetails = isGm
    ? `
      <span><i class="fas fa-skull-crossbones"></i> Rest cadence <strong>every ${escapeHtml(state.intervalTurns)} ${state.intervalTurns === 1 ? "turn" : "turns"}</strong></span>
      <span>Checks <strong>${escapeHtml(state.workflow.consumedChecks)}/${escapeHtml(state.requiredChecks)}</strong></span>
      <span>Watches <strong>${escapeHtml(watches.length)}</strong> / ${escapeHtml(watchMembers.length)} assigned</span>
    `
    : "";

  campingInfo.insertAdjacentHTML("afterend", `
    <div class="mk-travel-toolbar" data-mk-group-rest-context>
      <span><i class="fas fa-bed"></i> Rest <strong>${escapeHtml(statusLabel(state.workflow.status))}</strong></span>
      <span>Rest turns <strong>${escapeHtml(state.completedTurns)}/${REST_TOTAL_TURNS}</strong></span>
      <span>Turn <strong>1 hour</strong></span>
      ${gmDetails}
    </div>
  `);

  if (isGm) {
    if (state.workflow.status === "interrupted") {
      restButton.innerHTML = '<i class="fas fa-play"></i> Resume Rest';
    } else if (state.workflow.status === "checking") {
      restButton.innerHTML = '<i class="fas fa-play"></i> Continue Rest';
    }

    restButton.addEventListener("click", event => {
      handleRestPartyClick(event, actor).catch(error => {
        console.error(`${MODULE_ID} | Group Rest | Rest workflow failed`, error);
        globalThis.ui?.notifications?.error?.(`Rest failed: ${error.message}`);
      });
    }, { capture: true });
  }
}

function exposeGroupRestApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupRest = {
    hook: GROUP_REST_WORKFLOW_HOOK,
    turnSeconds: REST_TURN_SECONDS,
    totalTurns: REST_TOTAL_TURNS,
    calculateCheckTurns: calculateRestCheckTurns,
    getWorkflow: getGroupRestWorkflow,
    getState: getGroupRestState,
    start: startGroupRest,
    continue: continueGroupRest,
    finalize: finalizeGroupRest,
  };

  return module.api.groupRest;
}

function registerGroupRestEncounterService() {
  globalThis.Hooks?.once?.("ready", async () => {
    exposeGroupRestApi();
    if (!globalThis.game?.user?.isGM) return;
    for (const actor of globalThis.game?.actors ?? []) {
      try {
        await ensureActiveRestCadenceSnapshot(actor);
      } catch (error) {
        console.warn(`${MODULE_ID} | Group Rest | Could not migrate active rest cadence.`, error);
      }
    }
  });

  globalThis.Hooks?.on?.("renderActorSheet", (app, html) => {
    renderGroupRestContext(app, html).catch(error => {
      console.warn(`${MODULE_ID} | Group Rest | Render failed.`, error);
    });
  });
}

export {
  REST_TURN_SECONDS,
  REST_TOTAL_TURNS,
  GROUP_REST_WORKFLOW_HOOK,
  normalizeRestCheckTurns,
  normalizeGroupRestWorkflow,
  calculateRestCheckTurns,
  restCadenceForContext,
  workflowHasCadenceSnapshot,
  getGroupRestWorkflow,
  getGroupRestState,
  ensureActiveRestCadenceSnapshot,
  startGroupRest,
  advanceRestToTurn,
  continueGroupRest,
  finalizeGroupRest,
  renderGroupRestContext,
  exposeGroupRestApi,
  registerGroupRestEncounterService,
};