import { APP_ID } from "./gm-screen.js";
import { executeEncounterAction } from "./encounter-controls.js";
import {
  collectionValues,
  messageEncounterData,
  resolveGmScreenGroup,
} from "./view-model.js";

const ENCOUNTER_HISTORY_LIMIT = 8;

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

function messageTimestamp(message, data) {
  const value = Number(message?.timestamp ?? message?._source?.timestamp ?? data?.generatedAt ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function findRecentEncounterMessages(groupActor, messages = globalThis.game?.messages, limit = ENCOUNTER_HISTORY_LIMIT) {
  if (!groupActor) return [];
  const groupUuid = String(groupActor.uuid ?? "");
  const max = Math.max(1, Math.floor(Number(limit) || ENCOUNTER_HISTORY_LIMIT));

  return collectionValues(messages)
    .map(message => ({ message, data: messageEncounterData(message) }))
    .filter(entry => entry.data?.groupContext?.groupActorUuid === groupUuid)
    .sort((left, right) => messageTimestamp(right.message, right.data) - messageTimestamp(left.message, left.data))
    .slice(0, max);
}

function encounterHistoryEntry(entry, index, selectedMessageId = "") {
  const data = entry?.data ?? {};
  const messageId = String(entry?.message?.id ?? "");
  return {
    messageId,
    order: index + 1,
    latest: index === 0,
    selected: messageId === String(selectedMessageId ?? ""),
    label: String(data?.encounter?.label ?? "Encounter"),
    count: Math.max(1, Number(data?.encounter?.count ?? 1) || 1),
    terrain: String(data?.terrain ?? ""),
    danger: String(data?.dangerLabel ?? data?.dangerLevel ?? ""),
    period: String(data?.period ?? ""),
    disposition: String(data?.disposition ?? "neutral"),
    staged: Boolean(data?.staging?.deployed),
    data,
  };
}

function buildEncounterHistory(groupActor, {
  messages = globalThis.game?.messages,
  selectedMessageId = "",
  limit = ENCOUNTER_HISTORY_LIMIT,
} = {}) {
  const recent = findRecentEncounterMessages(groupActor, messages, limit);
  if (!recent.length) {
    return {
      entries: [],
      selected: null,
      latestMessageId: "",
      selectedMessageId: "",
    };
  }

  const latestMessageId = String(recent[0].message?.id ?? "");
  const requested = String(selectedMessageId ?? "");
  const selectedRaw = recent.find(entry => String(entry.message?.id ?? "") === requested) ?? recent[0];
  const resolvedSelectedId = String(selectedRaw.message?.id ?? latestMessageId);
  const entries = recent.map((entry, index) => encounterHistoryEntry(entry, index, resolvedSelectedId));

  return {
    entries,
    selected: entries.find(entry => entry.selected) ?? entries[0],
    latestMessageId,
    selectedMessageId: resolvedSelectedId,
  };
}

function historyLabel(entry) {
  if (entry.latest) return "Latest";
  return `Previous ${entry.order - 1}`;
}

function renderHistoryButton(entry) {
  return `
    <button
      type="button"
      class="mk-gm-encounter-history-item ${entry.selected ? "is-selected" : ""}"
      data-mk-select-encounter="${escapeHtml(entry.messageId)}"
      title="Inspect ${escapeHtml(entry.count)} × ${escapeHtml(entry.label)}"
    >
      <span>${escapeHtml(historyLabel(entry))}</span>
      <strong>${escapeHtml(entry.count)} × ${escapeHtml(entry.label)}</strong>
      <small>${escapeHtml(entry.terrain)} · ${escapeHtml(entry.danger)} · ${escapeHtml(entry.period)}${entry.staged ? " · staged" : ""}</small>
    </button>
  `;
}

function fieldRow(label, value, field, entry, { reroll = true } = {}) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd class="mk-gm-encounter-field">
        <span>${escapeHtml(value)}</span>
        ${reroll ? `<button type="button" data-mk-encounter-action="reroll-field" data-field="${escapeHtml(field)}" data-message-id="${escapeHtml(entry.messageId)}" title="Reroll ${escapeHtml(label)}"><i class="fas fa-rotate"></i></button>` : ""}
      </dd>
    </div>
  `;
}

function renderEncounterInspector(history) {
  const entry = history.selected;
  if (!entry) {
    return `
      <article class="mk-gm-panel is-wide">
        <header><i class="fas fa-skull-crossbones"></i><span>Group Encounters</span></header>
        <div class="mk-gm-empty">No resolved encounter card exists for this Group yet.</div>
      </article>
    `;
  }

  const data = entry.data ?? {};
  const awareness = String(data?.awareness?.label ?? "Determine during play");
  const reaction = String(data?.reaction?.label ?? "Not determined");
  const treasure = String(data?.treasure?.label ?? "No treasure");
  const morale = String(data?.morale?.label ?? "DC 15 WIS");
  const numberFormula = String(data?.encounter?.numberFormula ?? "");

  return `
    <div class="mk-gm-encounter-history" data-mk-gm-encounter-history>
      <div class="mk-gm-encounter-history-head">
        <strong>Recent Encounters</strong>
        <span>${history.entries.length} canonical chat record${history.entries.length === 1 ? "" : "s"}</span>
      </div>
      <div class="mk-gm-encounter-history-list">
        ${history.entries.map(renderHistoryButton).join("")}
      </div>
    </div>

    <article class="mk-gm-panel is-wide" data-mk-gm-selected-encounter>
      <header>
        <i class="fas fa-skull-crossbones"></i>
        <span>${entry.latest ? "Latest Group Encounter" : "Selected Group Encounter"}</span>
      </header>
      <div class="mk-gm-encounter-head">
        <strong>${escapeHtml(entry.count)} × ${escapeHtml(entry.label)}</strong>
        <span class="is-${escapeHtml(entry.disposition)}">${escapeHtml(entry.disposition)}</span>
      </div>
      <div class="mk-gm-encounter-context-line">
        <span><i class="fas fa-table-list"></i> ${escapeHtml(data.tableName ?? "")}</span>
        <span><i class="fas fa-layer-group"></i> ${escapeHtml(data.profileName ?? "")}</span>
        <span><i class="fas fa-mountain-sun"></i> ${escapeHtml(entry.terrain)}</span>
        <span><i class="fas fa-skull-crossbones"></i> ${escapeHtml(entry.danger)}</span>
        <span><i class="fas fa-clock"></i> ${escapeHtml(entry.period)}</span>
      </div>
      <dl class="mk-gm-data-list mk-gm-encounter-details">
        ${fieldRow("Number", `${entry.count}${numberFormula ? ` · ${numberFormula}` : ""}`, "number", entry)}
        ${fieldRow("Creature", entry.label, "encounter", entry)}
        ${fieldRow("Distance", String(data?.distance?.label ?? ""), "distance", entry)}
        ${fieldRow("Activity", String(data?.activity?.label ?? ""), "activity", entry)}
        ${fieldRow("Awareness", awareness, "awareness", entry, { reroll: Boolean(data?.awareness?.optional) })}
        ${fieldRow("Reaction", `${reaction} · ${entry.disposition}`, "reaction", entry)}
        ${data.intent ? fieldRow("Intent", String(data.intent.label ?? ""), "intent", entry) : ""}
        ${fieldRow("Treasure", treasure, "treasure", entry)}
        ${fieldRow("Morale", `${morale}${data?.morale?.trigger ? ` · ${data.morale.trigger}` : ""}`, "morale", entry, { reroll: false })}
        ${fieldRow("Staging", data?.staging?.deployed ? `Staged ${data.staging.count ?? entry.count} in ${data.staging.sceneName ?? "Scene"} · ${data.staging.formation ?? "cluster"}${data.staging.combat ? " · Combat" : ""}` : "Not staged", "staging", entry, { reroll: false })}
      </dl>
      <div class="mk-gm-panel-actions mk-gm-encounter-actions">
        <button type="button" data-mk-encounter-action="stage" data-message-id="${escapeHtml(entry.messageId)}"><i class="fas fa-location-dot"></i> ${entry.staged ? "Stage Again" : "Stage Encounter"}</button>
        <button type="button" data-mk-encounter-action="reveal" data-message-id="${escapeHtml(entry.messageId)}"><i class="fas fa-eye"></i> Reveal to Players</button>
        <button type="button" data-mk-encounter-action="reroll-all" data-message-id="${escapeHtml(entry.messageId)}"><i class="fas fa-dice-d20"></i> Reroll All</button>
        ${entry.latest ? "" : `<button type="button" data-mk-select-encounter="${escapeHtml(history.latestMessageId)}"><i class="fas fa-clock-rotate-left"></i> Return to Latest</button>`}
      </div>
    </article>
  `;
}

function bindHistorySelection(application, workspace) {
  workspace.querySelectorAll("[data-mk-select-encounter]").forEach(button => {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      application.encounterMessageId = String(button.dataset.mkSelectEncounter ?? "");
      application.render({ force: true });
    });
  });
}

function bindEncounterActions(application, workspace) {
  workspace.querySelectorAll("[data-mk-encounter-action]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await executeEncounterAction(application, button, {
          latestEncounter: { messageId: button.dataset.messageId },
        });
      } finally {
        button.disabled = false;
      }
    });
  });
}

async function decorateEncounterHistory(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const workspace = root?.querySelector?.('[data-workspace-panel="encounter"]');
  if (!workspace) return false;

  const group = await resolveGmScreenGroup(application.groupActorUuid ?? "");
  const history = buildEncounterHistory(group, {
    selectedMessageId: application.encounterMessageId ?? "",
  });
  application.encounterMessageId = history.selectedMessageId;
  workspace.innerHTML = renderEncounterInspector(history);
  bindHistorySelection(application, workspace);
  bindEncounterActions(application, workspace);
  return true;
}

function registerGmScreenEncounterHistory() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateEncounterHistory(application, element);
  });
}

registerGmScreenEncounterHistory();

export {
  ENCOUNTER_HISTORY_LIMIT,
  gmScreenApplication,
  messageTimestamp,
  findRecentEncounterMessages,
  encounterHistoryEntry,
  buildEncounterHistory,
  historyLabel,
  renderEncounterInspector,
  bindHistorySelection,
  bindEncounterActions,
  decorateEncounterHistory,
  registerGmScreenEncounterHistory,
};
