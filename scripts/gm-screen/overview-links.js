import { getExplorationEncounterState } from "../group-sheet/exploration-encounters.js";
import { getGroupProcedureState } from "../group-sheet/procedure.js";
import { getGroupElapsedTime } from "../group-sheet/time.js";
import { APP_ID } from "./gm-screen.js";
import {
  buildPartyView,
  formatDuration,
  formatExplorationNextCheck,
  resolveGmScreenGroup,
} from "./view-model.js";

const MODULE_ID = "mk-shadowdark";
const OVERVIEW_LINKS_FLAG = "gmScreenOverviewLinks";
const SESSION_FLAG = "gmScreenSession";
const MAX_OVERVIEW_LINKS = 100;

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

function normalizeOverviewLinkUuids(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source
    .map(value => String(value ?? "").trim())
    .filter(Boolean))]
    .slice(0, MAX_OVERVIEW_LINKS);
}

function rawUserFlag(user) {
  return user?._source?.flags?.[MODULE_ID]?.[OVERVIEW_LINKS_FLAG]
    ?? user?.flags?.[MODULE_ID]?.[OVERVIEW_LINKS_FLAG];
}

function getOverviewLinkUuids(user = globalThis.game?.user) {
  if (!user) return [];
  let value;
  try {
    value = user.getFlag?.(MODULE_ID, OVERVIEW_LINKS_FLAG);
  } catch (_error) {
    value = undefined;
  }
  if (value === undefined) value = rawUserFlag(user);
  return normalizeOverviewLinkUuids(value);
}

async function setOverviewLinkUuids(values, user = globalThis.game?.user) {
  const normalized = normalizeOverviewLinkUuids(values);
  if (!user?.setFlag) return normalized;
  await user.setFlag(MODULE_ID, OVERVIEW_LINKS_FLAG, normalized);
  return normalized;
}

function dragEventData(event) {
  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  const getData = TextEditorClass?.getDragEventData
    ?? TextEditorClass?.implementation?.getDragEventData;

  if (typeof getData === "function") {
    try {
      return getData.call(TextEditorClass, event) ?? {};
    } catch (_error) {
      // Fall through to raw DataTransfer JSON.
    }
  }

  try {
    const raw = event?.dataTransfer?.getData?.("text/plain")
      || event?.dataTransfer?.getData?.("application/json")
      || "";
    return raw ? JSON.parse(raw) : {};
  } catch (_error) {
    return {};
  }
}

function dragDataUuid(data) {
  for (const value of [data?.uuid, data?.documentUuid, data?.data?.uuid]) {
    const uuid = String(value ?? "").trim();
    if (uuid) return uuid;
  }
  return "";
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  try {
    return await resolver(String(uuid ?? ""));
  } catch (_error) {
    return null;
  }
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

function documentType(document) {
  return String(
    document?.documentName
    ?? document?.constructor?.metadata?.name
    ?? document?.constructor?.name
    ?? "Document"
  );
}

function documentIcon(document) {
  const icons = {
    Actor: "fa-user",
    Item: "fa-suitcase",
    JournalEntry: "fa-book-open",
    JournalEntryPage: "fa-file-lines",
    RollTable: "fa-table-list",
    Scene: "fa-map",
    Macro: "fa-code",
    Playlist: "fa-music",
    Cards: "fa-cards",
  };
  return icons[documentType(document)] ?? "fa-link";
}

function documentImage(document) {
  return String(
    document?.img
    ?? document?.thumbnail
    ?? document?.thumb
    ?? document?.parent?.img
    ?? ""
  );
}

function overviewLinkHtml({ uuid, document }) {
  const available = Boolean(document);
  const name = String(document?.name ?? document?.title ?? uuid ?? "Unavailable document");
  const type = available ? documentType(document) : "Unavailable";
  const image = available ? documentImage(document) : "";
  const visual = image
    ? `<img src="${escapeHtml(image)}" alt="">`
    : `<i class="fas ${available ? documentIcon(document) : "fa-link-slash"}"></i>`;

  return `
    <article class="mk-gm-overview-link ${available ? "" : "is-missing"}" data-mk-overview-link="${escapeHtml(uuid)}">
      <button type="button" class="mk-gm-overview-link-open" data-mk-overview-open="${escapeHtml(uuid)}" ${available ? "" : "disabled"} title="${available ? `Open ${escapeHtml(name)}` : "This document is no longer available"}">
        <span class="mk-gm-overview-link-visual">${visual}</span>
        <span class="mk-gm-overview-link-copy">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(type)}</small>
        </span>
      </button>
      <button type="button" class="mk-gm-overview-link-remove" data-mk-overview-remove="${escapeHtml(uuid)}" title="Remove shortcut" aria-label="Remove ${escapeHtml(name)} shortcut">
        <i class="fas fa-xmark"></i>
      </button>
    </article>
  `;
}

function procedureLabel(value) {
  const text = String(value ?? "downtime");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function groupSessionLabel(group) {
  if (!group) return "Not started";
  let value;
  try {
    value = group.getFlag?.(MODULE_ID, SESSION_FLAG);
  } catch (_error) {
    value = undefined;
  }
  if (value === undefined) value = group?.flags?.[MODULE_ID]?.[SESSION_FLAG];
  const label = String(value?.startLabel ?? "").trim();
  return label || "Not started";
}

async function buildOverviewSummary(application) {
  const group = await resolveGmScreenGroup(application?.groupActorUuid ?? "");
  if (!group) {
    return {
      procedure: "No Group",
      elapsed: "—",
      light: "—",
      encounter: "—",
      session: "Not started",
    };
  }

  const procedure = getGroupProcedureState(group);
  const elapsed = formatDuration(getGroupElapsedTime(group, procedure));
  const party = await buildPartyView(group);
  const lightTotal = party.reduce((total, member) => total + Math.max(0, Number(member?.light?.total ?? 0) || 0), 0);
  const lightCarriers = party.filter(member => Math.max(0, Number(member?.light?.total ?? 0) || 0) > 0).length;
  const exploration = getExplorationEncounterState(group);
  const encounter = exploration.encountersDisabled
    ? "No checks"
    : exploration.dueChecks > 0
      ? `${exploration.dueChecks} due`
      : formatExplorationNextCheck(exploration);

  return {
    procedure: procedureLabel(procedure),
    elapsed,
    light: lightTotal > 0 ? `${lightTotal} source${lightTotal === 1 ? "" : "s"} · ${lightCarriers} carrier${lightCarriers === 1 ? "" : "s"}` : "NO LIGHT",
    encounter,
    session: groupSessionLabel(group),
  };
}

function overviewSummaryHtml(summary = {}) {
  return `
    <div class="mk-gm-overview-summary" data-mk-overview-summary>
      <div><span>Procedure</span><strong>${escapeHtml(summary.procedure ?? "—")}</strong><small>${escapeHtml(summary.elapsed ?? "—")}</small></div>
      <div class="${summary.light === "NO LIGHT" ? "is-warning" : ""}"><span>Light</span><strong>${escapeHtml(summary.light ?? "—")}</strong></div>
      <div><span>Encounter</span><strong>${escapeHtml(summary.encounter ?? "—")}</strong></div>
      <div><span>Session</span><strong>${escapeHtml(summary.session ?? "Not started")}</strong></div>
    </div>
  `;
}

function overviewShellHtml(summary = {}) {
  return `
    ${overviewSummaryHtml(summary)}
    <div class="mk-gm-overview-shortcuts" data-mk-overview-shortcuts>
      <div class="mk-gm-overview-shortcuts-head">
        <div>
          <strong>Pinned Documents</strong>
          <span>Drop Journals, Actors, Items, RollTables, or other Foundry documents here to keep quick links.</span>
        </div>
        <i class="fas fa-thumbtack"></i>
      </div>
      <div class="mk-gm-overview-link-list" data-mk-overview-link-list></div>
    </div>
  `;
}

async function renderOverviewLinks(surface, uuids = getOverviewLinkUuids()) {
  const list = surface?.querySelector?.("[data-mk-overview-link-list]");
  if (!list) return [];

  const normalized = normalizeOverviewLinkUuids(uuids);
  if (!normalized.length) {
    list.innerHTML = `
      <div class="mk-gm-overview-drop-empty">
        <i class="fas fa-arrow-down"></i>
        <strong>Drop documents here</strong>
        <span>Drag from a Journal, Actor sheet, sidebar directory, or another Foundry document source.</span>
      </div>
    `;
    return [];
  }

  const entries = await Promise.all(normalized.map(async uuid => ({
    uuid,
    document: await resolveUuid(uuid),
  })));
  list.innerHTML = entries.map(overviewLinkHtml).join("");
  return entries;
}

async function openOverviewDocument(uuid) {
  const document = await resolveUuid(uuid);
  if (!document) {
    globalThis.ui?.notifications?.warn?.("That Overview shortcut no longer resolves to a Foundry document.");
    return null;
  }

  if (document.sheet?.render) {
    await document.sheet.render(true);
    return document;
  }

  if (document.documentName === "JournalEntryPage" && document.parent?.sheet?.render) {
    await document.parent.sheet.render(true, { pageId: document.id });
    return document;
  }

  if (typeof document.view === "function") {
    await document.view();
    return document;
  }

  globalThis.ui?.notifications?.warn?.(`${document.name ?? "This document"} has no openable sheet.`);
  return document;
}

async function addOverviewLink(uuid, surface, user = globalThis.game?.user) {
  const normalizedUuid = String(uuid ?? "").trim();
  if (!normalizedUuid) return getOverviewLinkUuids(user);

  const document = await resolveUuid(normalizedUuid);
  if (!document) {
    globalThis.ui?.notifications?.warn?.("The dropped data does not resolve to a Foundry document.");
    return getOverviewLinkUuids(user);
  }

  const next = await setOverviewLinkUuids([
    ...getOverviewLinkUuids(user),
    normalizedUuid,
  ], user);
  await renderOverviewLinks(surface, next);
  return next;
}

async function removeOverviewLink(uuid, surface, user = globalThis.game?.user) {
  const target = String(uuid ?? "").trim();
  const next = await setOverviewLinkUuids(
    getOverviewLinkUuids(user).filter(entry => entry !== target),
    user,
  );
  await renderOverviewLinks(surface, next);
  return next;
}

function bindOverviewLinks(surface, user = globalThis.game?.user) {
  if (!surface) return false;

  surface.addEventListener?.("dragenter", event => {
    event.preventDefault();
    surface.classList?.add?.("is-dragover");
  });
  surface.addEventListener?.("dragover", event => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "link";
    surface.classList?.add?.("is-dragover");
  });
  surface.addEventListener?.("dragleave", event => {
    if (event.relatedTarget && surface.contains?.(event.relatedTarget)) return;
    surface.classList?.remove?.("is-dragover");
  });
  surface.addEventListener?.("drop", event => {
    event.preventDefault();
    event.stopPropagation();
    surface.classList?.remove?.("is-dragover");
    const uuid = dragDataUuid(dragEventData(event));
    if (!uuid) {
      globalThis.ui?.notifications?.warn?.("Drop a Foundry document with a UUID to pin it on Overview.");
      return;
    }
    void addOverviewLink(uuid, surface, user);
  });

  surface.addEventListener?.("click", event => {
    const remove = event.target?.closest?.("[data-mk-overview-remove]");
    if (remove) {
      event.preventDefault();
      event.stopPropagation();
      void removeOverviewLink(remove.dataset.mkOverviewRemove, surface, user);
      return;
    }

    const open = event.target?.closest?.("[data-mk-overview-open]");
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      void openOverviewDocument(open.dataset.mkOverviewOpen);
    }
  });

  return true;
}

async function decorateOverviewLinks(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = rootElement(element);
  const overview = root?.querySelector?.('[data-workspace-panel="overview"]');
  if (!overview) return false;

  const summary = await buildOverviewSummary(application);
  overview.innerHTML = overviewShellHtml(summary);
  const surface = overview.querySelector("[data-mk-overview-shortcuts]");
  if (!surface) return false;

  await renderOverviewLinks(surface, getOverviewLinkUuids());
  bindOverviewLinks(surface);
  return true;
}

function registerOverviewLinks() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateOverviewLinks(application, element);
  });
}

registerOverviewLinks();

export {
  MODULE_ID,
  OVERVIEW_LINKS_FLAG,
  SESSION_FLAG,
  MAX_OVERVIEW_LINKS,
  gmScreenApplication,
  rootElement,
  normalizeOverviewLinkUuids,
  getOverviewLinkUuids,
  setOverviewLinkUuids,
  dragEventData,
  dragDataUuid,
  resolveUuid,
  documentType,
  documentIcon,
  documentImage,
  overviewLinkHtml,
  procedureLabel,
  groupSessionLabel,
  buildOverviewSummary,
  overviewSummaryHtml,
  overviewShellHtml,
  renderOverviewLinks,
  openOverviewDocument,
  addOverviewLink,
  removeOverviewLink,
  bindOverviewLinks,
  decorateOverviewLinks,
  registerOverviewLinks,
};