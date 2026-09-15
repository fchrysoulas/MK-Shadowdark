import {
  appendHistoryEntry,
  createHistoryEntry,
  editHistoryEntry,
  normalizeWoundHistory,
  removeHistoryEntry,
  woundMechanicalSignature
} from "./history-core.js";
import {
  WOUND_LOCATION_RULES,
  getWoundOutcome,
  normalizeCurrentWoundData
} from "./detailed-wounds-migration.js";

const MODULE_ID = "mk-shadowdark";
const FLAG_KEY = "detailedWounds";
const beforeUpdates = new WeakMap();
const historyWrites = new WeakSet();

function isPlayerActor(actor) {
  return actor?.documentName === "Actor" && actor.type === "Player";
}

function isPrimaryActiveGM() {
  const activeGms = (game.users ?? [])
    .filter(user => user.active && user.isGM)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const authority = activeGms[0];
  return authority ? game.user?.id === authority.id : game.user?.isGM === true;
}

function hasWoundFlagChange(change) {
  if (!change || typeof change !== "object") return false;
  const directPath = `flags.${MODULE_ID}.${FLAG_KEY}`;
  if (Object.prototype.hasOwnProperty.call(change, directPath)) return true;
  const scope = change.flags?.[MODULE_ID];
  return Boolean(scope && Object.prototype.hasOwnProperty.call(scope, FLAG_KEY));
}

function outcomeFor(locationKey, record) {
  const severityRoll = Number(record?.severityRoll);
  if (!Number.isFinite(severityRoll) || severityRoll <= 0) return null;
  const outcome = getWoundOutcome(locationKey, severityRoll);
  if (!outcome) return null;
  if (record?.resultKey && record.resultKey !== outcome.key) return null;
  return outcome;
}

function recordLabel(locationKey, record) {
  const outcome = outcomeFor(locationKey, record);
  if (outcome?.label) return outcome.label;
  if (String(record?.status ?? "ok").toLowerCase() === "ok") return "No wound";
  return String(record?.status ?? "Wound");
}

function transitionNote(before, after) {
  const beforeSeverity = Math.max(0, Number(before?.severityRoll) || 0);
  const afterSeverity = Math.max(0, Number(after?.severityRoll) || 0);
  const beforeHits = Math.max(0, Number(before?.hits) || 0);
  const afterHits = Math.max(0, Number(after?.hits) || 0);

  if (afterSeverity === 0 && beforeSeverity > 0) return "Recovered";
  if (afterSeverity < beforeSeverity) return "Improved";
  if (afterHits > beforeHits && beforeSeverity === 0) return "New wound";
  if (afterSeverity > beforeSeverity) return "Worsened";
  if (afterHits > beforeHits) return "New wound";
  return "Wound transition";
}

function transitionHistoryEntry(locationKey, before, after) {
  const outcome = outcomeFor(locationKey, after);
  return createHistoryEntry({
    kind: "transition",
    note: transitionNote(before, after),
    fromStatus: String(before?.status ?? "ok"),
    toStatus: String(after?.status ?? "ok"),
    fromLabel: recordLabel(locationKey, before),
    toLabel: recordLabel(locationKey, after),
    outcomeKey: outcome?.key ?? after?.resultKey ?? null
  });
}

async function writeHistoryData(actor, data) {
  if (!isPlayerActor(actor) || typeof actor?.setFlag !== "function") return false;
  historyWrites.add(actor);
  try {
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
  } finally {
    historyWrites.delete(actor);
  }
  return true;
}

async function appendTransitionHistory(actor, beforeData) {
  if (!isPlayerActor(actor) || !beforeData) return { changed: false, locations: [] };

  const currentData = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
  const changedLocations = [];

  for (const location of WOUND_LOCATION_RULES) {
    const before = beforeData.locations?.[location.key] ?? {};
    const after = currentData.locations?.[location.key] ?? {};
    if (woundMechanicalSignature(before) === woundMechanicalSignature(after)) continue;

    currentData.locations[location.key] = appendHistoryEntry(
      after,
      transitionHistoryEntry(location.key, before, after)
    );
    changedLocations.push(location.key);
  }

  if (!changedLocations.length) return { changed: false, locations: [] };
  await writeHistoryData(actor, currentData);
  refreshOpenHistory(actor);
  return { changed: true, locations: changedLocations };
}

async function addHistoryNote(actor, locationKey, note) {
  const location = WOUND_LOCATION_RULES.find(entry => entry.key === locationKey);
  const text = String(note ?? "").replace(/\s+/g, " ").trim();
  if (!isPrimaryActiveGM() || !isPlayerActor(actor) || !location || !text) return false;

  const data = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
  const record = data.locations[locationKey];
  const label = recordLabel(locationKey, record);
  data.locations[locationKey] = appendHistoryEntry(record, createHistoryEntry({
    kind: "note",
    note: text,
    fromStatus: record?.status ?? "ok",
    toStatus: record?.status ?? "ok",
    fromLabel: label,
    toLabel: label,
    outcomeKey: record?.resultKey ?? null
  }));

  await writeHistoryData(actor, data);
  refreshOpenHistory(actor);
  return true;
}

async function updateHistoryNote(actor, locationKey, entryId, note) {
  if (!isPrimaryActiveGM() || !isPlayerActor(actor)) return false;
  const data = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
  const record = data.locations?.[locationKey];
  if (!record) return false;
  data.locations[locationKey] = editHistoryEntry(record, entryId, note);
  await writeHistoryData(actor, data);
  refreshOpenHistory(actor);
  return true;
}

async function deleteHistoryEntry(actor, locationKey, entryId) {
  if (!isPrimaryActiveGM() || !isPlayerActor(actor)) return false;
  const data = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
  const record = data.locations?.[locationKey];
  if (!record) return false;
  data.locations[locationKey] = removeHistoryEntry(record, entryId);
  await writeHistoryData(actor, data);
  refreshOpenHistory(actor);
  return true;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function formatTimestamp(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "";
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return "";
  }
}

function historyEntryText(entry) {
  if (entry.kind === "note") return entry.note || entry.toLabel || "Note";
  const transition = entry.fromLabel && entry.toLabel && entry.fromLabel !== entry.toLabel
    ? `${entry.fromLabel} → ${entry.toLabel}`
    : entry.toLabel ?? entry.fromLabel ?? "Wound transition";
  return entry.note ? `${transition} · ${entry.note}` : transition;
}

function renderHistoryDetails(locationKey, record, editable) {
  const history = normalizeWoundHistory(record?.history);
  if (!history.length && !editable) return "";

  const rows = history.length
    ? history.slice().reverse().map(entry => `
      <li class="mk-wounds-history-entry" data-history-entry="${escapeHtml(entry.id)}">
        <span class="mk-wounds-history-copy">
          <strong>${escapeHtml(historyEntryText(entry))}</strong>
          ${entry.timestamp ? `<small>${escapeHtml(formatTimestamp(entry.timestamp))}</small>` : ""}
        </span>
        ${editable ? `
          <span class="mk-wounds-history-actions">
            <button type="button" data-history-action="edit" title="Edit history note" aria-label="Edit history note"><i class="fa-solid fa-pen"></i></button>
            <button type="button" data-history-action="delete" title="Delete history entry" aria-label="Delete history entry"><i class="fa-solid fa-trash"></i></button>
          </span>
        ` : ""}
      </li>
    `).join("")
    : '<li class="mk-wounds-history-empty">No history yet.</li>';

  return `
    <details class="mk-wounds-history" data-history-location="${locationKey}">
      <summary><i class="fa-solid fa-clock-rotate-left"></i> History${history.length ? ` · ${history.length}` : ""}</summary>
      <ul>${rows}</ul>
      ${editable ? '<button type="button" class="mk-wounds-history-add" data-history-action="add"><i class="fa-solid fa-plus"></i> Add note</button>' : ""}
    </details>
  `;
}

function promptText(message, current = "") {
  const promptFn = globalThis.window?.prompt ?? globalThis.prompt;
  if (typeof promptFn !== "function") {
    ui.notifications?.warn?.("A text prompt is unavailable in this client.");
    return null;
  }
  return promptFn(message, current);
}

function confirmDelete(message) {
  const confirmFn = globalThis.window?.confirm ?? globalThis.confirm;
  return typeof confirmFn === "function" ? confirmFn(message) : false;
}

function injectHistoryUi(actor, root) {
  const element = root?.[0] ?? root;
  if (!isPlayerActor(actor) || !element?.querySelectorAll) return;

  const data = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
  const editable = Boolean(game.user?.isGM);

  for (const card of element.querySelectorAll(".mk-wounds-location-card[data-wound-location]")) {
    const locationKey = card.dataset.woundLocation;
    const record = data.locations?.[locationKey];
    if (!record) continue;

    let stack = card.closest(".mk-wounds-location-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "mk-wounds-location-stack";
      card.replaceWith(stack);
      stack.append(card);
    }

    stack.querySelector(":scope > .mk-wounds-history")?.remove();
    const html = renderHistoryDetails(locationKey, record, editable);
    if (html) stack.insertAdjacentHTML("beforeend", html);
  }

  bindHistoryControls(actor, element);
}

function bindHistoryControls(actor, root) {
  if (!game.user?.isGM) return;

  for (const control of root.querySelectorAll("[data-history-action]")) {
    control.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();

      const details = control.closest("[data-history-location]");
      const locationKey = details?.dataset.historyLocation;
      const entryElement = control.closest("[data-history-entry]");
      const entryId = entryElement?.dataset.historyEntry ?? "";
      const action = control.dataset.historyAction;
      const data = normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY));
      const record = data.locations?.[locationKey];
      if (!record) return;

      if (action === "add") {
        const note = promptText("Add a short wound history note or source:", "");
        if (note !== null && String(note).trim()) await addHistoryNote(actor, locationKey, note);
      } else if (action === "edit") {
        const entry = normalizeWoundHistory(record.history).find(item => item.id === entryId);
        if (!entry) return;
        const note = promptText("Edit the history note/source:", entry.note ?? "");
        if (note !== null) await updateHistoryNote(actor, locationKey, entryId, note);
      } else if (action === "delete") {
        if (confirmDelete("Delete this informational wound history entry?")) {
          await deleteHistoryEntry(actor, locationKey, entryId);
        }
      }
    });
  }
}

function refreshOpenHistory(actor) {
  if (!globalThis.document || !actor?.id) return;
  const root = document.getElementById(`mk-detailed-wounds-${actor.id}`);
  if (root) injectHistoryUi(actor, root);
}

function maybeInjectHistory(app, element) {
  const actor = app?.actor;
  if (!isPlayerActor(actor)) return;
  const root = element?.[0] ?? element ?? app?.element;
  const isWoundsApp = app?.constructor?.name === "DetailedWoundsApplication"
    || root?.classList?.contains?.("mk-wounds-window")
    || root?.querySelector?.(".mk-wounds-shell");
  if (!isWoundsApp) return;
  injectHistoryUi(actor, root);
}

function registerHistoryApi() {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = mod.api ?? {};
  mod.api.woundHistory = {
    get: (actor, locationKey) => isPlayerActor(actor)
      ? normalizeWoundHistory(normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY)).locations?.[locationKey]?.history)
      : [],
    addNote: addHistoryNote,
    editNote: updateHistoryNote,
    remove: deleteHistoryEntry
  };
}

Hooks.on("preUpdateActor", (actor, change) => {
  if (!isPrimaryActiveGM() || historyWrites.has(actor) || !isPlayerActor(actor) || !hasWoundFlagChange(change)) return;
  beforeUpdates.set(actor, normalizeCurrentWoundData(actor.getFlag(MODULE_ID, FLAG_KEY)));
});

Hooks.on("updateActor", (actor, change) => {
  if (!isPrimaryActiveGM() || historyWrites.has(actor) || !isPlayerActor(actor) || !hasWoundFlagChange(change)) return;
  const before = beforeUpdates.get(actor);
  beforeUpdates.delete(actor);
  if (before) void appendTransitionHistory(actor, before);
});

Hooks.on("renderDetailedWoundsApplication", maybeInjectHistory);
Hooks.on("renderApplicationV2", maybeInjectHistory);
Hooks.once("ready", registerHistoryApi);

export {
  addHistoryNote,
  appendTransitionHistory,
  deleteHistoryEntry,
  hasWoundFlagChange,
  historyEntryText,
  injectHistoryUi,
  isPrimaryActiveGM,
  recordLabel,
  transitionHistoryEntry,
  transitionNote,
  updateHistoryNote
};