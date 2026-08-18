import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { getGroupAssignments } from "../group-sheet/assignments.js";
import { getPartyFoodTotal } from "../group-sheet/inventory.js";
import {
  continueGroupRest,
  getGroupRestState,
  REST_TOTAL_TURNS,
  startGroupRest,
} from "../group-sheet/rest-encounters.js";
import { getRestMode } from "../libs/resting.js";
import { APP_ID } from "./gm-screen.js";
import { resolveGmScreenGroup } from "./view-model.js";
import { confirmGmDialog, waitForGmDialog } from "../libs/dialog-v2.js";

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

async function activeParticipantActors(party = []) {
  const actors = [];
  for (const member of party ?? []) {
    const actor = await resolveActorFromUuid(String(member?.actorUuid ?? ""));
    if (actor?.update) actors.push(actor);
  }
  return actors;
}

function watchSummary(group) {
  const watches = getGroupAssignments(group)?.camping?.watches ?? [];
  const members = new Set(watches.flatMap(watch => watch.actorUuids ?? []));
  return {
    slots: watches.length,
    members: members.size,
  };
}

async function promptBeginRest(group, party) {
  const participants = await activeParticipantActors(party);
  if (!participants.length) {
    globalThis.ui?.notifications?.warn?.("Add at least one active party member before resting.");
    return null;
  }

  const state = getGroupRestState(group);
  const availableRations = getPartyFoodTotal(participants);
  const watches = watchSummary(group);
  const mode = getRestMode();

  const rationInput = await waitForGmDialog({
    title: "Rest Active Party",
    content: `
      <div class="mk-gm-rest-start-dialog">
        <p><strong>${participants.length}</strong> active party member${participants.length === 1 ? "" : "s"}; <strong>${availableRations}</strong> tracked ration${availableRations === 1 ? "" : "s"}.</p>
        <p>Rest duration: <strong>${REST_TOTAL_TURNS} turns / ${REST_TOTAL_TURNS} hours</strong>. Required encounter checks in the current danger: <strong>${state.requiredChecks}</strong>.</p>
        <p>Camp watches: <strong>${watches.slots}</strong> slot${watches.slots === 1 ? "" : "s"}, <strong>${watches.members}</strong> assigned member${watches.members === 1 ? "" : "s"}.</p>
        <p>Rest mode: <strong>${escapeHtml(mode)}</strong>.</p>
        <div class="form-group">
          <label>Total rations to consume on successful completion</label>
          <input type="number" name="rations" value="${Math.min(participants.length, availableRations)}" min="0" max="${availableRations}" step="1" required>
        </div>
        <p class="hint">Rations and rest benefits are applied only after all required encounter checks complete without an unresolved interruption.</p>
      </div>
    `,
    buttons: [
      {
        action: "rest",
        icon: '<i class="fas fa-bed"></i>',
        label: "Begin Rest",
        default: true,
        callback: (_event, button) => button.form?.elements?.rations?.value ?? null,
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
    close: () => null,
  });

  if (rationInput === null) return null;
  const rationCount = Number(rationInput);
  if (!Number.isInteger(rationCount) || rationCount < 0 || rationCount > availableRations) {
    globalThis.ui?.notifications?.warn?.(`Enter a whole number from 0 to ${availableRations}.`);
    return null;
  }

  await startGroupRest(group, {
    plannedRations: rationCount,
    participants,
    mode,
  });
  return continueGroupRest(group);
}

async function continueRest(group, state) {
  if (state.workflow.status === "interrupted") {
    const confirmed = await confirmGmDialog({
      title: "Resume Interrupted Rest",
      content: "<p>Confirm that the interruption has been resolved and continue the same rest from its current resting turn?</p>",
      yes: { label: "Continue" },
      no: { label: "Cancel", default: true },
    });
    if (!confirmed) return null;
  }

  return continueGroupRest(group);
}

function restActionForState(state) {
  const status = state?.workflow?.status ?? "ready";
  if (status === "checking") return { id: "continue", label: "Continue Rest", icon: "fa-play" };
  if (status === "interrupted") return { id: "resume", label: "Resume Rest", icon: "fa-play" };
  if (status === "completed") return { id: "begin", label: "Begin New Rest", icon: "fa-bed" };
  return { id: "begin", label: "Begin Rest", icon: "fa-bed" };
}

function checkDisplay(state) {
  const status = state?.workflow?.status ?? "ready";
  if (status === "ready") return { label: "Required Checks", value: state.requiredChecks };
  if (status === "completed") return { label: "Checks", value: `${state.requiredChecks}/${state.requiredChecks}` };
  return { label: "Checks Left", value: state.remainingChecks };
}

function renderRestDetails(state, watches, availableRations = null) {
  const workflow = state.workflow;
  const active = ["checking", "interrupted", "completed"].includes(workflow.status);
  const participants = active ? workflow.participantUuids.length : null;
  const plannedRations = active ? workflow.plannedRations : null;
  const checks = active
    ? `${workflow.consumedChecks}/${state.requiredChecks} completed · ${state.remainingChecks} left`
    : `${state.requiredChecks} required`;

  return `
    <dl class="mk-gm-data-list" data-mk-gm-rest-details>
      <div><dt>Mode</dt><dd>${escapeHtml(workflow.mode)}</dd></div>
      <div><dt>Participants</dt><dd>${participants === null ? "Active party" : participants}</dd></div>
      <div><dt>Rations</dt><dd>${plannedRations === null ? `${availableRations ?? 0} available` : `${plannedRations} planned${workflow.rationsConsumed ? " · consumed" : ""}`}</dd></div>
      <div><dt>Encounter Checks</dt><dd>${escapeHtml(checks)}</dd></div>
      <div><dt>Next Check</dt><dd>${state.nextCheckTurn ? `Rest turn ${state.nextCheckTurn}` : "None"}</dd></div>
      <div><dt>Camp Watches</dt><dd>${watches.slots} slot${watches.slots === 1 ? "" : "s"} · ${watches.members} assigned</dd></div>
    </dl>
  `;
}

function ensureActions(panel) {
  let actions = panel.querySelector(":scope > .mk-gm-panel-actions");
  if (actions) return actions;
  actions = document.createElement("div");
  actions.className = "mk-gm-panel-actions";
  panel.append(actions);
  return actions;
}

function replaceCheckStat(panel, state) {
  const cells = panel.querySelectorAll(".mk-gm-big-stats > div");
  const target = Array.from(cells).find(cell => {
    const label = String(cell.querySelector("span")?.textContent ?? "").trim();
    return ["Checks Left", "Required Checks", "Checks"].includes(label);
  });
  if (!target) return;

  const display = checkDisplay(state);
  const label = target.querySelector("span");
  const value = target.querySelector("strong");
  if (label) label.textContent = display.label;
  if (value) value.textContent = String(display.value);
}

function addRestAction(panel, action, handler) {
  panel.querySelectorAll('[data-action="resumeRest"], [data-mk-rest-action]').forEach(button => button.remove());
  const actions = ensureActions(panel);
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mkRestAction = action.id;
  button.innerHTML = `<i class="fas ${action.icon}"></i> ${action.label}`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void handler(button);
  });
  actions.prepend(button);
}

async function decorateRestPanels(application, element, context) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  const group = await resolveGmScreenGroup(context?.groupActorUuid ?? application?.groupActorUuid ?? "");
  if (!group) return false;

  const state = getGroupRestState(group);
  const watches = watchSummary(group);
  const participants = await activeParticipantActors(context?.party ?? []);
  const availableRations = participants.length ? getPartyFoodTotal(participants) : 0;
  const action = restActionForState(state);

  const panels = [
    root.querySelector('[data-workspace-panel="overview"] .mk-gm-panel:nth-of-type(3)'),
    root.querySelector('[data-workspace-panel="resting"] .mk-gm-panel'),
  ].filter(Boolean);

  for (const panel of panels) {
    replaceCheckStat(panel, state);
    if (panel.closest('[data-workspace-panel="resting"]')) {
      panel.querySelector("[data-mk-gm-rest-details]")?.remove();
      const actions = panel.querySelector(":scope > .mk-gm-panel-actions");
      const holder = document.createElement("div");
      holder.innerHTML = renderRestDetails(state, watches, availableRations);
      const details = holder.firstElementChild;
      if (details) panel.insertBefore(details, actions ?? null);
    }

    addRestAction(panel, action, async button => {
      button.disabled = true;
      try {
        const current = getGroupRestState(group);
        const result = action.id === "begin"
          ? await promptBeginRest(group, context?.party ?? [])
          : await continueRest(group, current);
        if (result) await application.render({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Rest | Action failed", error);
        globalThis.ui?.notifications?.error?.(`Rest failed: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
  }

  return panels.length > 0;
}

function registerGmScreenRestControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element, context) => {
    void decorateRestPanels(application, element, context);
  });
}

registerGmScreenRestControls();

export {
  gmScreenApplication,
  activeParticipantActors,
  watchSummary,
  restActionForState,
  checkDisplay,
  renderRestDetails,
  promptBeginRest,
  continueRest,
  decorateRestPanels,
  registerGmScreenRestControls,
};
