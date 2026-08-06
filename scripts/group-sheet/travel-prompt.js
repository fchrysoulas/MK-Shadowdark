import {
  ACTIVITY_KIND_TRAVEL,
  GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT,
  GROUP_SHEET_SOCKET_FEATURE,
  GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL,
  GROUP_SHEET_SOCKET_PROMPT_TRAVEL,
  GROUP_SHEET_SOCKET_UPDATE_TRAVEL,
  MODULE_ID,
  SUBMODULE,
  TRAVEL_ACTIVITIES,
  TRAVEL_PROMPT_BODY_CLASS,
  TRAVEL_PROMPT_ELEMENT_ID,
  TRAVEL_ROLL_RESULT_TIMEOUT_MS,
} from "./constants.js";
import {
  canUserControlActor,
  getBestActivityAbility,
  isGroupActor,
  resolveActorFromUuid,
} from "./actors.js";
import {
  buildTravelProgress,
  getActivityByKey,
  getEffectiveTravelAssignments,
  getGroupData,
  getTravelAssignmentKey,
  getTravelAssignmentKeys,
  isActivityStore,
} from "./activities.js";
import { getTravelProgressDurationMs } from "./group-settings.js";
import { getTravelRollOutcome, isTravelRollResultParseable, rollTravelAbilityAndWait } from "./rolls.js";
import { travelPromptTimers } from "./state.js";
import { clampNumber, clampPercent, escapeHtml } from "./utils.js";
import { isPrimaryActiveGm } from "./users.js";
function renderTravelResultMarks(step) {
  if (!step?.resolved) return "";

  const successes = Math.max(0, Number(step?.successes ?? 0) || 0);
  const failures = Math.max(0, Number(step?.failures ?? 0) || 0);
  const marks = [];

  for (let i = 0; i < successes; i += 1) {
    marks.push(`<span data-travel-result="success" title="Success">V</span>`);
  }

  for (let i = 0; i < failures; i += 1) {
    marks.push(`<span data-travel-result="failure" title="Failure">X</span>`);
  }

  return marks.join("");
}

function renderTravelProgressSteps(progress) {
  const percent = Number(progress?.percent ?? 0) || 0;
  const durationMs = Number(progress?.durationMs ?? 0) || 0;
  const progressStartedAt = Number(progress?.progressStartedAt ?? 0) || 0;

  return `
    <div
      class="mk-travel-progress"
      data-prompt-id="${escapeHtml(progress?.promptId ?? "")}"
      data-travel-duration-ms="${escapeHtml(durationMs)}"
      data-travel-progress-started-at="${escapeHtml(progressStartedAt)}"
      style="--mk-travel-progress-fill: ${escapeHtml(percent)}%;"
    >
      <span class="mk-travel-progress-track" aria-hidden="true">
        <span class="mk-travel-progress-fill" data-travel-progress-fill></span>
      </span>
      ${TRAVEL_ACTIVITIES.map(activity => {
        const step = progress?.steps?.find(existing => existing.key === activity.key) ?? {
          ...activity,
          index: TRAVEL_ACTIVITIES.findIndex(existing => existing.key === activity.key) + 1,
          assignedCount: 0,
          completedCount: 0,
          statusLabel: "Unassigned",
          empty: true,
        };

        const classes = [
          "mk-travel-progress-step",
          step.complete ? "is-complete" : "",
          step.failed ? "is-failed" : "",
          step.successOutcome ? "is-success-result" : "",
          step.failureOutcome ? "is-failure-result" : "",
          step.active ? "is-active" : "",
          step.pending ? "is-pending" : "",
          step.empty ? "is-empty" : "",
        ].filter(Boolean).join(" ");

        return `
          <div class="${classes}" data-travel-progress-step="${escapeHtml(activity.key)}">
            <span class="mk-travel-progress-node">
              <img src="${escapeHtml(activity.icon)}" alt="">
            </span>
            <span class="mk-travel-progress-label">${escapeHtml(activity.name)}</span>
            <span class="mk-travel-progress-count">
              <span data-progress-completed>${escapeHtml(step.completedCount ?? 0)}</span>/<span data-progress-assigned>${escapeHtml(step.assignedCount ?? 0)}</span>
            </span>
            <span class="mk-travel-progress-status" data-progress-status>${escapeHtml(step.statusLabel ?? "Waiting")}</span>
            <span class="mk-travel-progress-results" data-progress-results>${renderTravelResultMarks(step)}</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderTravelPromptAssignment(assignment, options = {}) {
  const complete = Boolean(assignment.complete);
  const canRoll = Boolean(options.canRoll) && !complete;
  const rollLabel = options.isGm
    ? `GM Roll ${escapeHtml(assignment.abilityLabel)}`
    : `Roll ${escapeHtml(assignment.abilityLabel)}`;
  const ability = Array.isArray(assignment.abilities) ? assignment.abilities[0] : "";
  const classes = [
    "mk-travel-prompt-assignment",
    complete ? "is-complete" : "",
    assignment.implicit ? "is-default" : "",
  ].filter(Boolean).join(" ");

  return `
    <article
      class="${classes}"
      data-assignment-key="${escapeHtml(assignment.key)}"
      data-actor-uuid="${escapeHtml(assignment.actorUuid)}"
      data-activity-key="${escapeHtml(assignment.activityKey)}"
      data-ability="${escapeHtml(ability)}"
      data-dc="${escapeHtml(assignment.dc)}"
      data-implicit="${assignment.implicit ? "true" : "false"}"
    >
      <img class="mk-travel-prompt-token" src="${escapeHtml(assignment.actorImg)}" alt="${escapeHtml(assignment.actorName)}">
      <div class="mk-travel-prompt-assignment-main">
        <strong>${escapeHtml(assignment.actorName)}</strong>
        <span>
          ${escapeHtml(assignment.activityName)} <b>${escapeHtml(assignment.abilityLabel)}</b> DC ${escapeHtml(assignment.dc)}
          ${assignment.implicit ? `<em class="mk-travel-prompt-default">Default</em>` : ""}
        </span>
      </div>
      <div class="mk-travel-prompt-assignment-controls">
        ${canRoll
          ? `<button type="button" class="mk-travel-prompt-roll" data-action="travel-prompt-player-roll">${rollLabel}</button>`
          : `<span class="mk-travel-prompt-waiting">${complete ? "Resolved" : "Waiting for player or GM"}</span>`}
      </div>
    </article>
  `;
}

function clearTravelPromptClientTimers(wrap) {
  if (wrap?._mkTravelProgressStartTimer) {
    clearTimeout(wrap._mkTravelProgressStartTimer);
    wrap._mkTravelProgressStartTimer = null;
  }

  if (wrap?._mkTravelAutoCloseTimer) {
    clearTimeout(wrap._mkTravelAutoCloseTimer);
    wrap._mkTravelAutoCloseTimer = null;
  }
}

function scheduleTravelPromptAutoClose(wrap) {
  if (!wrap || wrap._mkTravelAutoCloseTimer) return;

  wrap._mkTravelAutoCloseTimer = setTimeout(() => {
    wrap._mkTravelAutoCloseTimer = null;
    removeTravelPromptElement(wrap);
  }, 5000);
}

function removeTravelPromptElement(wrap) {
  clearTravelPromptClientTimers(wrap);
  wrap?.remove?.();
  if (!document.getElementById(TRAVEL_PROMPT_ELEMENT_ID)) {
    document.body?.classList?.remove(TRAVEL_PROMPT_BODY_CLASS);
  }
}

function getTravelProgressStartTime(progress = {}, progressEl = null) {
  const explicit = Number(progress?.progressStartedAt ?? progressEl?.dataset.travelProgressStartedAt ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return 0;
}

function disableTravelPromptRollControls(wrap) {
  if (!wrap) return;

  wrap.querySelectorAll("[data-action='travel-prompt-player-roll']").forEach(button => {
    button.disabled = true;
  });

  const status = wrap.querySelector("[data-travel-prompt-status-text]");
  if (status) status.textContent = "Travelling is resolving. Watch the route progress.";
}

function startTravelProgressAnimation(wrap, progress = {}) {
  const progressEl = wrap?.querySelector?.(".mk-travel-progress");
  const fill = progressEl?.querySelector?.("[data-travel-progress-fill]");
  if (!progressEl || !fill) return;

  const durationMs = Math.max(0, Number(progress.durationMs ?? progressEl.dataset.travelDurationMs ?? 0) || 0);
  const progressStartedAt = getTravelProgressStartTime(progress, progressEl);
  const resolving = Boolean(progress.resolving) || (Boolean(progress.active) && progressStartedAt > 0 && !progress.complete);
  const resolvedPercent = clampPercent(progress.percent ?? 0);

  if (!progress.active || !resolving || progress.complete || durationMs <= 0 || progressStartedAt <= 0) {
    clearTravelPromptClientTimers(wrap);
    fill.style.transition = "none";
    fill.style.width = `${progress.complete ? 100 : resolvedPercent}%`;
    progressEl.style.setProperty("--mk-travel-progress-fill", `${progress.complete ? 100 : resolvedPercent}%`);
    return;
  }

  const remainingStartMs = progressStartedAt - Date.now();
  if (remainingStartMs > 0) {
    fill.style.transition = "none";
    fill.style.width = "0%";
    progressEl.style.setProperty("--mk-travel-progress-fill", "0%");
    if (!wrap._mkTravelProgressStartTimer) {
      wrap._mkTravelProgressStartTimer = setTimeout(() => {
        wrap._mkTravelProgressStartTimer = null;
        startTravelProgressAnimation(wrap, progress);
      }, remainingStartMs);
    }
    return;
  }

  const elapsedMs = Math.max(0, Date.now() - progressStartedAt);
  const currentPercent = clampPercent((elapsedMs / durationMs) * 100);
  const remainingMs = Math.max(0, durationMs - elapsedMs);

  fill.style.transition = "none";
  fill.style.width = `${currentPercent}%`;
  progressEl.style.setProperty("--mk-travel-progress-fill", `${currentPercent}%`);
  fill.getBoundingClientRect();

  requestAnimationFrame(() => {
    fill.style.transition = `width ${remainingMs}ms linear`;
    fill.style.width = "100%";
    progressEl.style.setProperty("--mk-travel-progress-fill", "100%");
  });
}

async function showTravelRollPrompt(payload = {}) {
  const existing = document.getElementById(TRAVEL_PROMPT_ELEMENT_ID);
  if (existing) removeTravelPromptElement(existing);

  const progressStartedAt = getTravelProgressStartTime(payload.progress);
  const resolving = Boolean(payload.progress?.resolving)
    || (Boolean(payload.progress?.active) && !payload.progress?.complete && progressStartedAt > 0);
  const rollingOpen = Boolean(payload.progress?.active) && !payload.progress?.complete && !resolving;
  const assignmentRows = await Promise.all((payload.assignments ?? []).map(async assignment => {
    const actor = await resolveActorFromUuid(assignment.actorUuid);
    return {
      assignment,
      canRoll: rollingOpen && (game.user?.isGM || canUserControlActor(actor)),
      isGm: Boolean(game.user?.isGM),
    };
  }));
  const statusText = payload.progress?.complete
    ? "Travelling complete. Closing in 5 seconds."
    : resolving
      ? "Travelling is resolving. Watch the route progress."
      : "Waiting for all travelling rolls.";

  const wrap = document.createElement("div");
  wrap.id = TRAVEL_PROMPT_ELEMENT_ID;
  wrap.dataset.promptId = payload.promptId ?? "";
  wrap.dataset.groupActorUuid = payload.groupActorUuid ?? "";
  wrap.innerHTML = `
    <div class="mk-travel-prompt-card">
      <button type="button" class="mk-travel-prompt-close" data-action="travel-prompt-close" aria-label="Close">
        <i class="fas fa-times"></i>
      </button>
      <header class="mk-travel-prompt-header">
        <h2>Travelling</h2>
        <span>${escapeHtml(payload.groupName ?? "Group")}</span>
      </header>
      ${renderTravelProgressSteps(payload.progress)}
      <div class="mk-travel-prompt-status">
        <span data-travel-prompt-status-text>
          ${escapeHtml(statusText)}
        </span>
      </div>
      <div class="mk-travel-prompt-assignments">
        ${assignmentRows.map(row => renderTravelPromptAssignment(row.assignment, {
          canRoll: row.canRoll,
          isGm: row.isGm,
        })).join("")}
      </div>
    </div>
  `;

  document.body?.classList?.add(TRAVEL_PROMPT_BODY_CLASS);
  document.body.appendChild(wrap);

  requestAnimationFrame(() => {
    wrap.classList.add("is-visible");
    startTravelProgressAnimation(wrap, payload.progress);
    if (payload.progress?.complete) scheduleTravelPromptAutoClose(wrap);
  });

  wrap.querySelector("[data-action='travel-prompt-close']")?.addEventListener("click", event => {
    event.preventDefault();
    removeTravelPromptElement(wrap);
  });

  wrap.querySelectorAll("[data-action='travel-prompt-player-roll']").forEach(button => {
    button.addEventListener("click", onTravelPromptPlayerRollClick);
  });
}

function setTravelPromptRowComplete(row) {
  if (!row) return;
  row.classList.add("is-complete");
  row.querySelectorAll("button, select").forEach(control => {
    control.disabled = true;
  });

  const waiting = row.querySelector(".mk-travel-prompt-waiting");
  if (waiting) waiting.textContent = "Resolved";
  if (!waiting) {
    const controls = row.querySelector(".mk-travel-prompt-assignment-controls");
    if (controls) controls.innerHTML = `<span class="mk-travel-prompt-waiting">Resolved</span>`;
  }
}

async function reportTravelPlayerRollResult(data = {}) {
  if (game.user?.isGM) {
    const groupActor = await resolveActorFromUuid(data.groupActorUuid);
    return applyTravelPlayerRollResult(groupActor, data, game.user);
  }

  const request = {
    feature: GROUP_SHEET_SOCKET_FEATURE,
    action: GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL,
    ...data,
    userId: game.user?.id,
  };

  // The module socket is the fast path. The short-lived whispered chat flag is
  // a reliable fallback for Foundry sessions where a player's custom socket
  // event does not reach the primary GM. Both paths are safe because completed
  // assignment keys make travel results idempotent.
  game.socket?.emit(`module.${MODULE_ID}`, request);

  try {
    const messageData = {
      speaker: ChatMessage.getSpeaker(),
      content: `<span style="display:none">mk-travelling-roll</span>`,
      whisper: Array.from(game.users ?? [])
        .filter(user => user.active && user.isGM)
        .map(user => user.id),
      flags: {
        [MODULE_ID]: {
          [GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT]: {
            ...request,
            createdAt: Date.now(),
          },
        },
      },
    };

    const messageStyle = globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER;
    if (messageStyle !== undefined) messageData.style = messageStyle;

    const message = await ChatMessage.create(messageData);
    setTimeout(() => message?.delete?.().catch(() => {}), 5000);
  } catch (error) {
    console.warn(`${MODULE_ID} | ${SUBMODULE} | Could not send travelling roll fallback`, error);
  }

  return null;
}

async function onTravelPromptPlayerRollClick(event) {
  event.preventDefault();

  const button = event.currentTarget;
  if (button.disabled) return;

  const row = button.closest(".mk-travel-prompt-assignment");
  const wrap = button.closest(`#${TRAVEL_PROMPT_ELEMENT_ID}`);
  const progressEl = wrap?.querySelector(".mk-travel-progress");
  if (!row || !wrap) return;

  if (getTravelProgressStartTime({}, progressEl) > 0) {
    disableTravelPromptRollControls(wrap);
    ui.notifications?.warn?.("Travelling progress has already begun.");
    return;
  }

  const actor = await resolveActorFromUuid(row.dataset.actorUuid);
  if (!actor || !canUserControlActor(actor)) {
    ui.notifications?.warn?.("You cannot roll for this traveller.");
    return;
  }

  const activity = getActivityByKey(ACTIVITY_KIND_TRAVEL, row.dataset.activityKey);
  const ability = row.dataset.ability || getBestActivityAbility(actor, activity);
  if (!activity || !ability) return;

  button.disabled = true;

  try {
    const rollResult = await rollTravelAbilityAndWait(actor, ability, activity, {
      event,
      fastForward: false,
      timeoutMs: TRAVEL_ROLL_RESULT_TIMEOUT_MS,
    });
    if (!isTravelRollResultParseable(rollResult)) {
      button.disabled = false;
      return;
    }

    const outcome = getTravelRollOutcome(rollResult, activity.dc);

    setTravelPromptRowComplete(row);
    await reportTravelPlayerRollResult({
      groupActorUuid: wrap.dataset.groupActorUuid,
      promptId: wrap.dataset.promptId,
      activityKey: activity.key,
      actorUuid: actor.uuid,
      successCount: outcome.success ? outcome.count : 0,
      failureCount: outcome.success ? 0 : outcome.count,
      userId: game.user?.id,
    });
  } catch (error) {
    console.warn(`${MODULE_ID} | ${SUBMODULE} | Could not submit travelling roll`, error);
    button.disabled = false;
    ui.notifications?.warn?.("Could not submit the travelling roll.");
  }
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/["\\]/g, "\\$&");
}

function applyTravelPromptUpdate(data = {}) {
  const wrap = document.getElementById(TRAVEL_PROMPT_ELEMENT_ID);
  if (!wrap) return;
  if (data.promptId && wrap.dataset.promptId !== data.promptId) return;

  const completedKeys = new Set(data.completedKeys ?? []);

  wrap.querySelectorAll(".mk-travel-prompt-assignment").forEach(row => {
    if (completedKeys.has(row.dataset.assignmentKey)) setTravelPromptRowComplete(row);
  });

  for (const step of data.progress?.steps ?? []) {
    const el = wrap.querySelector(`[data-travel-progress-step="${cssEscape(step.key)}"]`);
    if (!el) continue;

    el.classList.toggle("is-complete", Boolean(step.complete));
    el.classList.toggle("is-failed", Boolean(step.failed));
    el.classList.toggle("is-success-result", Boolean(step.successOutcome));
    el.classList.toggle("is-failure-result", Boolean(step.failureOutcome));
    el.classList.toggle("is-active", Boolean(step.active));
    el.classList.toggle("is-pending", Boolean(step.pending));
    el.classList.toggle("is-empty", Boolean(step.empty));

    const completed = el.querySelector("[data-progress-completed]");
    const assigned = el.querySelector("[data-progress-assigned]");
    const status = el.querySelector("[data-progress-status]");
    const results = el.querySelector("[data-progress-results]");
    if (completed) completed.textContent = String(step.completedCount ?? 0);
    if (assigned) assigned.textContent = String(step.assignedCount ?? 0);
    if (status) status.textContent = step.statusLabel ?? "Waiting";
    if (results) results.innerHTML = renderTravelResultMarks(step);
  }

  const progressEl = wrap.querySelector(".mk-travel-progress");
  const fill = progressEl?.querySelector("[data-travel-progress-fill]");
  if (progressEl && data.progress) {
    progressEl.dataset.travelDurationMs = String(data.progress.durationMs ?? 0);
    progressEl.dataset.travelProgressStartedAt = String(data.progress.progressStartedAt ?? 0);
  }

  if (progressEl && fill && data.progress && (!data.progress.active || data.progress.complete)) {
    const percent = data.progress.complete ? 100 : clampPercent(data.progress.percent ?? 0);
    fill.style.transition = "none";
    fill.style.width = `${percent}%`;
    progressEl.style.setProperty("--mk-travel-progress-fill", `${percent}%`);
  }

  if (data.progress) {
    const status = wrap.querySelector("[data-travel-prompt-status-text]") ?? wrap.querySelector(".mk-travel-prompt-status");
    const resolving = Boolean(data.progress.resolving)
      || (Boolean(data.progress.active) && !data.progress.complete && Number(data.progress.progressStartedAt ?? 0) > 0);

    if (resolving || data.progress.complete) disableTravelPromptRollControls(wrap);
    if (status) {
      status.textContent = data.progress.complete
        ? "Travelling complete. Closing in 5 seconds."
        : resolving
          ? "Travelling is resolving. Watch the route progress."
          : "Waiting for all travelling rolls.";
    }
    startTravelProgressAnimation(wrap, data.progress);
    if (data.progress.complete) scheduleTravelPromptAutoClose(wrap);
  }
}

function handleTravelPromptTransport(data = {}) {
  if (data.action === GROUP_SHEET_SOCKET_PROMPT_TRAVEL) {
    showTravelRollPrompt(data.payload).catch(error => {
      console.error(`${MODULE_ID} | ${SUBMODULE} | Travel prompt display error`, error);
    });
  }

  if (data.action === GROUP_SHEET_SOCKET_UPDATE_TRAVEL) {
    applyTravelPromptUpdate(data.payload ?? data);
  }
}

async function broadcastTravelPromptChat(action, payload = {}) {
  if (!game.user?.isGM) return null;

  try {
    const messageData = {
      speaker: ChatMessage.getSpeaker(),
      content: `<span style="display:none">mk-travelling</span>`,
      flags: {
        [MODULE_ID]: {
          [GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT]: {
            action,
            payload,
            createdAt: Date.now(),
          },
        },
      },
    };

    const messageStyle = globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER;
    if (messageStyle !== undefined) messageData.style = messageStyle;

    const message = await ChatMessage.create(messageData);

    setTimeout(() => {
      message?.delete?.().catch(() => {});
    }, 5000);

    return message;
  } catch (error) {
    console.warn(`${MODULE_ID} | ${SUBMODULE} | Could not broadcast travelling splash chat flag`, error);
    return null;
  }
}

function getTravelPromptTimerKey(groupActorUuid, promptId) {
  return `${groupActorUuid}:${promptId}`;
}

function clearTravelPromptTimer(groupActorUuid, promptId) {
  const key = getTravelPromptTimerKey(groupActorUuid, promptId);
  const timer = travelPromptTimers.get(key);

  if (timer) {
    clearTimeout(timer);
    travelPromptTimers.delete(key);
  }
}

function scheduleTravelPromptSequence(payload = {}) {
  if (!isPrimaryActiveGm()) return;
  if (!payload.groupActorUuid || !payload.promptId) return;
  if (payload.progress?.complete) return;

  const progress = payload.progress ?? {};
  const progressStartedAt = Number(progress.progressStartedAt ?? 0) || 0;
  const resolving = Boolean(progress.resolving) || (Boolean(progress.active) && progressStartedAt > 0);
  if (!resolving || progressStartedAt <= 0) return;

  const durationMs = Math.max(1000, Number(progress.durationMs ?? getTravelProgressDurationMs()) || getTravelProgressDurationMs());
  const resolvedCount = Math.max(0, Number(progress.totalResolved ?? 0) || 0);
  if (resolvedCount >= TRAVEL_ACTIVITIES.length) return;

  const nextBreakpoint = Math.min(TRAVEL_ACTIVITIES.length, resolvedCount + 1);
  const stepDuration = durationMs / TRAVEL_ACTIVITIES.length;
  const targetTime = progressStartedAt + (stepDuration * nextBreakpoint);
  const delay = Math.max(0, targetTime - Date.now());
  const key = getTravelPromptTimerKey(payload.groupActorUuid, payload.promptId);

  clearTravelPromptTimer(payload.groupActorUuid, payload.promptId);

  const timer = setTimeout(() => {
    travelPromptTimers.delete(key);
    resolveNextTravelPromptStep(payload.groupActorUuid, payload.promptId).catch(error => {
      console.error(`${MODULE_ID} | ${SUBMODULE} | Travel prompt sequence error`, error);
    });
  }, delay);

  travelPromptTimers.set(key, timer);
}

async function emitTravelPromptUpdate(groupActor, groupData) {
  const update = {
    groupActorUuid: groupActor.uuid,
    promptId: groupData.travel.prompt.id,
    completedKeys: groupData.travel.prompt.completedKeys,
    failedSteps: groupData.travel.prompt.failedSteps,
    resolvedSteps: groupData.travel.prompt.resolvedSteps,
    progress: buildTravelProgress(groupData),
  };

  if (update.progress.complete || !groupData.travel.prompt.active) {
    clearTravelPromptTimer(groupActor.uuid, groupData.travel.prompt.id);
  }

  applyTravelPromptUpdate(update);
  game.socket?.emit(`module.${MODULE_ID}`, {
    feature: GROUP_SHEET_SOCKET_FEATURE,
    action: GROUP_SHEET_SOCKET_UPDATE_TRAVEL,
    ...update,
  });
  await broadcastTravelPromptChat(GROUP_SHEET_SOCKET_UPDATE_TRAVEL, update);

  return update;
}

async function resolveNextTravelPromptStep(groupActorUuid, promptId) {
  if (!isPrimaryActiveGm()) return null;

  const groupActor = await resolveActorFromUuid(groupActorUuid);
  if (!isGroupActor(groupActor)) return null;

  const groupData = getGroupData(groupActor);
  if (!groupData.travel.prompt?.active || groupData.travel.prompt.id !== promptId) return null;

  const completedKeys = new Set(groupData.travel.prompt.completedKeys ?? []);
  const failedSteps = new Set(groupData.travel.prompt.failedSteps ?? []);
  const resolvedSteps = new Set(groupData.travel.prompt.resolvedSteps ?? []);
  groupData.travel.prompt.results = isActivityStore(groupData.travel.prompt.results)
    ? groupData.travel.prompt.results
    : {};
  const progress = buildTravelProgress(groupData);
  if (!progress.resolving || progress.progressStartedAt <= 0) return null;

  const step = progress.steps.find(existing => !existing.resolved);
  const activity = step ? getActivityByKey(ACTIVITY_KIND_TRAVEL, step.key) : null;

  if (!activity) {
    groupData.travel.prompt.active = false;
    await groupActor.setFlag(MODULE_ID, "group", groupData);
    return emitTravelPromptUpdate(groupActor, groupData);
  }

  const assignments = getEffectiveTravelAssignments(groupData)
    .filter(assignment => assignment.activityKey === activity.key);
  const result = isActivityStore(groupData.travel.prompt.results[activity.key])
    ? groupData.travel.prompt.results[activity.key]
    : { successes: 0, failures: 0 };

  result.successes = Math.max(0, Number(result.successes ?? 0) || 0);
  result.failures = Math.max(0, Number(result.failures ?? 0) || 0);

  if (!assignments.length) {
    failedSteps.add(activity.key);
    resolvedSteps.add(activity.key);
    groupData.travel.prompt.failedSteps = [...failedSteps];
    groupData.travel.prompt.resolvedSteps = [...resolvedSteps];
    result.failures += 1;
    groupData.travel.prompt.results[activity.key] = result;

    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: groupActor }),
        content: `<strong>${escapeHtml(activity.name)}</strong> has no assigned character and counts as a travel failure.`,
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | ${SUBMODULE} | Could not announce empty travel step`, error);
    }
  } else {
    const assignmentKeys = assignments.map(assignment => getTravelAssignmentKey(activity.key, assignment.actorUuid));
    const allAssignmentsRolled = assignmentKeys.every(key => completedKeys.has(key));
    if (!allAssignmentsRolled) {
      return null;
    }

    groupData.travel.prompt.completedKeys = [...completedKeys];
    resolvedSteps.add(activity.key);
    groupData.travel.prompt.resolvedSteps = [...resolvedSteps];
    groupData.travel.prompt.results[activity.key] = result;
  }

  const nextProgress = buildTravelProgress(groupData);
  if (nextProgress.complete) {
    groupData.travel.prompt.active = false;
  }

  await groupActor.setFlag(MODULE_ID, "group", groupData);
  const update = await emitTravelPromptUpdate(groupActor, groupData);

  if (groupData.travel.prompt.active) {
    scheduleTravelPromptSequence({
      groupActorUuid,
      promptId,
      progress: update.progress,
    });
  }

  return update;
}

async function applyTravelPlayerRollResult(groupActor, data = {}, requestingUser = game.user) {
  if (!isGroupActor(groupActor)) return null;

  const groupData = getGroupData(groupActor);
  if (!groupData.travel.prompt?.active || groupData.travel.prompt.id !== data.promptId) return null;

  const activity = getActivityByKey(ACTIVITY_KIND_TRAVEL, data.activityKey);
  const actor = await resolveActorFromUuid(data.actorUuid);
  if (!activity || !actor) return null;
  if (!canUserControlActor(actor, requestingUser)) return null;
  if (!groupData.activeMembers.includes(actor.uuid)) return null;

  const hasAssignment = getEffectiveTravelAssignments(groupData).some(assignment => (
    assignment.activityKey === activity.key && assignment.actorUuid === actor.uuid
  ));
  if (!hasAssignment) return null;

  const assignmentKey = getTravelAssignmentKey(activity.key, actor.uuid);
  const completedKeys = new Set(groupData.travel.prompt.completedKeys ?? []);
  if (completedKeys.has(assignmentKey)) return null;

  groupData.travel.prompt.results = isActivityStore(groupData.travel.prompt.results)
    ? groupData.travel.prompt.results
    : {};

  const result = isActivityStore(groupData.travel.prompt.results[activity.key])
    ? groupData.travel.prompt.results[activity.key]
    : { successes: 0, failures: 0 };

  result.successes = Math.max(0, Number(result.successes ?? 0) || 0);
  result.failures = Math.max(0, Number(result.failures ?? 0) || 0);
  result.successes += clampNumber(data.successCount, 0, 0, 2);
  result.failures += clampNumber(data.failureCount, 0, 0, 2);

  completedKeys.add(assignmentKey);
  groupData.travel.prompt.completedKeys = [...completedKeys];
  groupData.travel.prompt.results[activity.key] = result;

  const requiredKeys = getTravelAssignmentKeys(groupData);
  const allRollsComplete = requiredKeys.length > 0 && requiredKeys.every(key => completedKeys.has(key));
  const progressStartedAt = Number(groupData.travel.prompt.progressStartedAt ?? 0) || 0;
  const shouldStartProgress = allRollsComplete && progressStartedAt <= 0;

  if (shouldStartProgress) {
    groupData.travel.prompt.progressStartedAt = Date.now();
    groupData.travel.prompt.resolvedSteps = [];
    groupData.travel.prompt.failedSteps = [];
  }

  await groupActor.setFlag(MODULE_ID, "group", groupData);
  const update = await emitTravelPromptUpdate(groupActor, groupData);

  if (shouldStartProgress) {
    scheduleTravelPromptSequence({
      groupActorUuid: groupActor.uuid,
      promptId: groupData.travel.prompt.id,
      progress: update.progress,
    });
  }

  return update;
}
export {
  removeTravelPromptElement,
  showTravelRollPrompt,
  handleTravelPromptTransport,
  broadcastTravelPromptChat,
  clearTravelPromptTimer,
  scheduleTravelPromptSequence,
  applyTravelPlayerRollResult,
};
