import {
  getGroupAssignments,
  setCampWatches,
  setExplorationRole,
  setMarchingOrder,
  setPositionMembers,
} from "../group-sheet/assignments.js";
import { APP_ID } from "./gm-screen.js";
import { resolveGmScreenGroup } from "./view-model.js";

const MAX_WATCH_SLOTS = 8;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

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

function partyNameMap(party = []) {
  return new Map(
    (Array.isArray(party) ? party : [])
      .map(member => [String(member?.actorUuid ?? ""), String(member?.name ?? "Member")])
      .filter(([uuid]) => uuid)
  );
}

function memberNames(actorUuids, names) {
  const values = (Array.isArray(actorUuids) ? actorUuids : [])
    .map(uuid => names.get(String(uuid)) ?? String(uuid))
    .filter(Boolean);
  return values.length ? values.join(" → ") : "—";
}

function roleName(actorUuid, names) {
  const uuid = String(actorUuid ?? "");
  return uuid ? names.get(uuid) ?? uuid : "—";
}

function memberOptions(party, selectedUuid = "", { allowNone = true } = {}) {
  const selected = String(selectedUuid ?? "");
  const options = [];
  if (allowNone) options.push('<option value="">— None —</option>');

  for (const member of party ?? []) {
    const uuid = String(member?.actorUuid ?? "");
    if (!uuid) continue;
    options.push(
      `<option value="${escapeHtml(uuid)}" ${uuid === selected ? "selected" : ""}>${escapeHtml(member?.name ?? uuid)}</option>`
    );
  }

  return options.join("");
}

function selectedPosition(state, actorUuid) {
  const uuid = String(actorUuid ?? "");
  for (const position of ["front", "middle", "rear"]) {
    if ((state?.exploration?.positions?.[position] ?? []).includes(uuid)) return position;
  }
  return "";
}

function orderRank(state, actorUuid, fallback) {
  const index = (state?.exploration?.order ?? []).indexOf(String(actorUuid ?? ""));
  return index >= 0 ? index + 1 : fallback;
}

function dialogRoot(html) {
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function explorationDialogContent(state, party) {
  const rows = (party ?? []).map((member, index) => {
    const uuid = String(member.actorUuid ?? "");
    const position = selectedPosition(state, uuid);
    const positionOptions = [
      ["", "Unassigned"],
      ["front", "Front"],
      ["middle", "Middle"],
      ["rear", "Rear"],
    ].map(([value, label]) => (
      `<option value="${value}" ${position === value ? "selected" : ""}>${label}</option>`
    )).join("");

    return `
      <div class="form-group" data-mk-assignment-member data-actor-uuid="${escapeHtml(uuid)}">
        <label>${escapeHtml(member.name)}</label>
        <div class="form-fields">
          <input type="number" name="order" value="${orderRank(state, uuid, index + 1)}" min="1" max="${party.length}" step="1" title="Marching-order position">
          <select name="position" title="Exploration position">${positionOptions}</select>
        </div>
      </div>
    `;
  }).join("");

  return `
    <form class="mk-gm-assignment-dialog">
      <p class="notes">Set marching order and Front / Middle / Rear placement for the active party. Scout and Light Bearer are independent roles.</p>
      ${rows || '<p class="notes">No active party members.</p>'}
      <hr>
      <div class="form-group">
        <label>Scout</label>
        <select name="scout">${memberOptions(party, state?.exploration?.roles?.scout)}</select>
      </div>
      <div class="form-group">
        <label>Light Bearer</label>
        <select name="lightBearer">${memberOptions(party, state?.exploration?.roles?.lightBearer)}</select>
      </div>
    </form>
  `;
}

function readExplorationDialog(html) {
  const root = dialogRoot(html);
  if (!root) return null;

  const members = Array.from(root.querySelectorAll("[data-mk-assignment-member]")).map((row, index) => ({
    actorUuid: String(row.dataset.actorUuid ?? ""),
    order: Number(row.querySelector('[name="order"]')?.value ?? index + 1),
    position: String(row.querySelector('[name="position"]')?.value ?? ""),
    sourceIndex: index,
  })).filter(entry => entry.actorUuid);

  members.sort((left, right) => {
    const leftOrder = Number.isFinite(left.order) && left.order > 0 ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isFinite(right.order) && right.order > 0 ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.sourceIndex - right.sourceIndex;
  });

  const positions = { front: [], middle: [], rear: [] };
  for (const member of members) {
    if (positions[member.position]) positions[member.position].push(member.actorUuid);
  }

  return {
    order: members.map(member => member.actorUuid),
    positions,
    scout: String(root.querySelector('[name="scout"]')?.value ?? ""),
    lightBearer: String(root.querySelector('[name="lightBearer"]')?.value ?? ""),
  };
}

async function applyExplorationAssignments(group, value) {
  if (!group || !value) return null;
  const options = { reason: "gm-screen" };

  await setMarchingOrder(group, value.order, options);
  await setPositionMembers(group, "front", value.positions.front, options);
  await setPositionMembers(group, "middle", value.positions.middle, options);
  await setPositionMembers(group, "rear", value.positions.rear, options);
  await setExplorationRole(group, "scout", value.scout, options);
  return setExplorationRole(group, "lightBearer", value.lightBearer, options);
}

async function openExplorationAssignmentsDialog(application, context) {
  const group = await resolveGmScreenGroup(context?.groupActorUuid ?? application?.groupActorUuid ?? "");
  if (!group) return null;

  const party = Array.isArray(context?.party) ? context.party : [];
  const state = getGroupAssignments(group);
  const result = await Dialog.wait({
    title: "Marching Order & Exploration Roles",
    content: explorationDialogContent(state, party),
    buttons: {
      save: {
        icon: '<i class="fas fa-check"></i>',
        label: "Save Assignments",
        callback: html => readExplorationDialog(html),
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "save",
    close: () => null,
  });

  if (!result) return null;
  const transition = await applyExplorationAssignments(group, result);
  await application.render({ force: true });
  return transition;
}

function watchMemberOptions(party, selected = []) {
  const selectedSet = new Set((selected ?? []).map(String));
  return (party ?? []).map(member => {
    const uuid = String(member?.actorUuid ?? "");
    return `<option value="${escapeHtml(uuid)}" ${selectedSet.has(uuid) ? "selected" : ""}>${escapeHtml(member?.name ?? uuid)}</option>`;
  }).join("");
}

function watchDialogContent(state, party) {
  const watches = state?.camping?.watches ?? [];
  const rows = Array.from({ length: MAX_WATCH_SLOTS }, (_, index) => {
    const watch = watches[index] ?? null;
    const enabled = Boolean(watch);
    return `
      <fieldset data-mk-watch-slot data-slot-index="${index}">
        <legend>Watch ${index + 1}</legend>
        <div class="form-group">
          <label>Use slot</label>
          <input type="checkbox" name="enabled" ${enabled ? "checked" : ""}>
        </div>
        <div class="form-group">
          <label>Label</label>
          <input type="text" name="label" value="${escapeHtml(watch?.label ?? `Watch ${index + 1}`)}">
        </div>
        <div class="form-group">
          <label>Members</label>
          <select name="members" multiple size="${Math.max(2, Math.min(5, party.length || 2))}">
            ${watchMemberOptions(party, watch?.actorUuids ?? [])}
          </select>
        </div>
      </fieldset>
    `;
  }).join("");

  return `
    <form class="mk-gm-watch-dialog">
      <p class="notes">Enable only the watch slots you want to use. Enabled slots are saved in top-to-bottom order.</p>
      ${rows}
    </form>
  `;
}

function readWatchDialog(html) {
  const root = dialogRoot(html);
  if (!root) return null;

  return Array.from(root.querySelectorAll("[data-mk-watch-slot]"))
    .filter(row => row.querySelector('[name="enabled"]')?.checked)
    .map((row, index) => ({
      id: `watch-${index + 1}`,
      label: String(row.querySelector('[name="label"]')?.value ?? "").trim() || `Watch ${index + 1}`,
      actorUuids: Array.from(row.querySelector('[name="members"]')?.selectedOptions ?? [])
        .map(option => String(option.value ?? ""))
        .filter(Boolean),
    }));
}

async function openCampWatchesDialog(application, context) {
  const group = await resolveGmScreenGroup(context?.groupActorUuid ?? application?.groupActorUuid ?? "");
  if (!group) return null;

  const party = Array.isArray(context?.party) ? context.party : [];
  const state = getGroupAssignments(group);
  const result = await Dialog.wait({
    title: "Camp Watches",
    content: watchDialogContent(state, party),
    buttons: {
      save: {
        icon: '<i class="fas fa-check"></i>',
        label: "Save Watches",
        callback: html => readWatchDialog(html),
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "save",
    close: () => null,
  });

  if (!result) return null;
  const transition = await setCampWatches(group, result, { reason: "gm-screen" });
  await application.render({ force: true });
  return transition;
}

function renderExplorationSummary(state, party) {
  const names = partyNameMap(party);
  return `
    <div class="mk-gm-assignment-summary" data-mk-gm-exploration-assignments>
      <dl class="mk-gm-data-list">
        <div><dt>Marching Order</dt><dd>${escapeHtml(memberNames(state.exploration.order, names))}</dd></div>
        <div><dt>Front</dt><dd>${escapeHtml(memberNames(state.exploration.positions.front, names))}</dd></div>
        <div><dt>Middle</dt><dd>${escapeHtml(memberNames(state.exploration.positions.middle, names))}</dd></div>
        <div><dt>Rear</dt><dd>${escapeHtml(memberNames(state.exploration.positions.rear, names))}</dd></div>
        <div><dt>Scout</dt><dd>${escapeHtml(roleName(state.exploration.roles.scout, names))}</dd></div>
        <div><dt>Light Bearer</dt><dd>${escapeHtml(roleName(state.exploration.roles.lightBearer, names))}</dd></div>
      </dl>
      <div class="mk-gm-panel-actions">
        <button type="button" data-mk-edit-exploration-assignments ${party.length ? "" : "disabled"}>
          <i class="fas fa-people-arrows-left-right"></i> Edit Marching Order & Roles
        </button>
      </div>
    </div>
  `;
}

function renderWatchSummary(state, party) {
  const names = partyNameMap(party);
  const watches = state.camping.watches ?? [];
  const rows = watches.length
    ? watches.map((watch, index) => `
      <div><dt>${escapeHtml(watch.label || `Watch ${index + 1}`)}</dt><dd>${escapeHtml(memberNames(watch.actorUuids, names))}</dd></div>
    `).join("")
    : '<div><dt>Camp Watches</dt><dd>None configured</dd></div>';

  return `
    <div class="mk-gm-assignment-summary" data-mk-gm-camp-watches>
      <dl class="mk-gm-data-list">${rows}</dl>
      <div class="mk-gm-panel-actions">
        <button type="button" data-mk-edit-camp-watches ${party.length ? "" : "disabled"}>
          <i class="fas fa-moon"></i> Edit Watches
        </button>
      </div>
    </div>
  `;
}

async function injectAssignmentControls(application, element, context) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  const group = await resolveGmScreenGroup(context?.groupActorUuid ?? application?.groupActorUuid ?? "");
  if (!group) return false;

  const party = Array.isArray(context?.party) ? context.party : [];
  const state = getGroupAssignments(group);

  const explorationPanel = root.querySelector('[data-workspace-panel="exploration"] .mk-gm-panel');
  if (explorationPanel && !explorationPanel.querySelector("[data-mk-gm-exploration-assignments]")) {
    const actions = explorationPanel.querySelector(":scope > .mk-gm-panel-actions");
    const holder = document.createElement("div");
    holder.innerHTML = renderExplorationSummary(state, party);
    const summary = holder.firstElementChild;
    if (summary) {
      explorationPanel.insertBefore(summary, actions ?? null);
      summary.querySelector("[data-mk-edit-exploration-assignments]")?.addEventListener("click", event => {
        event.preventDefault();
        void openExplorationAssignmentsDialog(application, context);
      });
    }
  }

  const restingPanel = root.querySelector('[data-workspace-panel="resting"] .mk-gm-panel');
  if (restingPanel && !restingPanel.querySelector("[data-mk-gm-camp-watches]")) {
    const actions = restingPanel.querySelector(":scope > .mk-gm-panel-actions");
    const holder = document.createElement("div");
    holder.innerHTML = renderWatchSummary(state, party);
    const summary = holder.firstElementChild;
    if (summary) {
      restingPanel.insertBefore(summary, actions ?? null);
      summary.querySelector("[data-mk-edit-camp-watches]")?.addEventListener("click", event => {
        event.preventDefault();
        void openCampWatchesDialog(application, context);
      });
    }
  }

  return true;
}

function registerGmScreenAssignmentControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element, context) => {
    void injectAssignmentControls(application, element, context);
  });
}

registerGmScreenAssignmentControls();

export {
  MAX_WATCH_SLOTS,
  gmScreenApplication,
  partyNameMap,
  selectedPosition,
  orderRank,
  readExplorationDialog,
  applyExplorationAssignments,
  readWatchDialog,
  renderExplorationSummary,
  renderWatchSummary,
  injectAssignmentControls,
  registerGmScreenAssignmentControls,
};
