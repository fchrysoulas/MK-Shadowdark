import { APP_ID } from "./gm-screen.js";
import { getSceneEnvironmentContext } from "../libs/environment-context.js";
import {
  promptForEncounterGenerator,
  promptForEncounterZone,
} from "./exploration-zone-grid.js";
import { createExplorationLocation } from "./exploration-creation-controls.js";
import { createSourceDrivenNpc } from "./npc-generator.js";
import {
  createSourceDrivenShop,
  createSourceDrivenTavern,
} from "./tavern-shop-generator.js";
import { createSourceDrivenMonster } from "./monster-generator.js";
import { createSourceDrivenMagicItem } from "./magic-item-generator.js";
import { PINNED_DOCUMENTS_REFRESH_HOOK } from "./pinned-documents.js";

const MODULE_ID = "mk-shadowdark";
const OVERVIEW_LINKS_FLAG = "gmScreenOverviewLinks";
const QUICK_ACTIONS_FLAG = "gmScreenQuickActions";
const QUICK_ACTIONS_REFRESH_HOOK = "mk-shadowdark.gm-screen-quick-actions-changed";
const MAX_OVERVIEW_LINKS = 100;
const OVERVIEW_TOOL_PREFIX = "mk-shadowdark.gm-screen-tool:";
const OVERVIEW_TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "encounters",
    uuid: `${OVERVIEW_TOOL_PREFIX}encounters`,
    label: "Encounters",
    type: "GM Screen",
    icon: "fa-dice-d20",
    action: "roll-encounter",
  }),
  Object.freeze({
    id: "trap-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}trap-generator`,
    label: "Trap Generator",
    type: "GM Screen",
    icon: "fa-spider",
    action: "generate-trap",
  }),
  Object.freeze({
    id: "hazard-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}hazard-generator`,
    label: "Hazard Generator",
    type: "GM Screen",
    icon: "fa-triangle-exclamation",
    action: "generate-hazard",
  }),
  Object.freeze({
    id: "npc-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}npc-generator`,
    label: "NPC Generator",
    type: "GM Screen",
    icon: "fa-font",
    action: "generate-npc",
  }),
  Object.freeze({
    id: "monster-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}monster-generator`,
    label: "Monster Generator",
    type: "GM Screen",
    icon: "fa-skull-crossbones",
    action: "generate-monster",
  }),
  Object.freeze({
    id: "magic-item-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}magic-item-generator`,
    label: "Magic Item Generator",
    type: "GM Screen",
    icon: "fa-wand-sparkles",
    action: "generate-magic-item",
  }),
  Object.freeze({
    id: "tavern-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}tavern-generator`,
    label: "Tavern Generator",
    type: "GM Screen",
    icon: "fa-beer-mug-empty",
    action: "generate-tavern",
  }),
  Object.freeze({
    id: "shop-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}shop-generator`,
    label: "Shop Generator",
    type: "GM Screen",
    icon: "fa-store",
    action: "generate-shop",
  }),
  Object.freeze({
    id: "location-generator",
    uuid: `${OVERVIEW_TOOL_PREFIX}location-generator`,
    label: "Create Location",
    type: "GM Screen",
    icon: "fa-map-location-dot",
    action: "create-location",
  }),
]);
const OVERVIEW_TOOLS_BY_UUID = new Map(OVERVIEW_TOOL_DEFINITIONS.map(tool => [tool.uuid, tool]));
const DEFAULT_QUICK_ACTION_IDS = Object.freeze(OVERVIEW_TOOL_DEFINITIONS.map(tool => tool.id));

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

function overviewToolUuid(value) {
  const normalized = String(value ?? "").trim();
  return OVERVIEW_TOOL_DEFINITIONS.find(tool => tool.id === normalized || tool.uuid === normalized)?.uuid ?? "";
}

function overviewToolForUuid(value) {
  return OVERVIEW_TOOLS_BY_UUID.get(String(value ?? "").trim()) ?? null;
}

function pinnedDocumentUuids(values) {
  return normalizeOverviewLinkUuids(values)
    .filter(uuid => !overviewToolForUuid(uuid));
}

function normalizeQuickActionIds(values) {
  const requested = new Set((Array.isArray(values) ? values : [])
    .map(value => String(value ?? "").trim()));
  return DEFAULT_QUICK_ACTION_IDS.filter(id => requested.has(id));
}

function rawUserFlag(user, key = OVERVIEW_LINKS_FLAG) {
  return user?._source?.flags?.[MODULE_ID]?.[key]
    ?? user?.flags?.[MODULE_ID]?.[key];
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

function getQuickActionIds(user = globalThis.game?.user) {
  if (!user) return [...DEFAULT_QUICK_ACTION_IDS];
  let value;
  try {
    value = user.getFlag?.(MODULE_ID, QUICK_ACTIONS_FLAG);
  } catch (_error) {
    value = undefined;
  }
  if (value === undefined) value = rawUserFlag(user, QUICK_ACTIONS_FLAG);
  return Array.isArray(value)
    ? normalizeQuickActionIds(value)
    : [...DEFAULT_QUICK_ACTION_IDS];
}

async function setOverviewLinkUuids(values, user = globalThis.game?.user) {
  const normalized = normalizeOverviewLinkUuids(values);
  if (!user?.setFlag) return normalized;
  await user.setFlag(MODULE_ID, OVERVIEW_LINKS_FLAG, normalized);
  return normalized;
}

async function setQuickActionIds(values, user = globalThis.game?.user) {
  const normalized = normalizeQuickActionIds(values);
  if (user?.setFlag) {
    await user.setFlag(MODULE_ID, QUICK_ACTIONS_FLAG, normalized);
  }
  globalThis.Hooks?.callAll?.(QUICK_ACTIONS_REFRESH_HOOK, normalized, user);
  return normalized;
}

function isQuickActionEnabled(id, user = globalThis.game?.user) {
  return getQuickActionIds(user).includes(String(id ?? "").trim());
}

async function setQuickActionEnabled(id, enabled, user = globalThis.game?.user) {
  const normalizedId = String(id ?? "").trim();
  if (!DEFAULT_QUICK_ACTION_IDS.includes(normalizedId)) return getQuickActionIds(user);

  const current = new Set(getQuickActionIds(user));
  if (enabled) current.add(normalizedId);
  else current.delete(normalizedId);
  return setQuickActionIds([...current], user);
}

function dragEventData(event) {
  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  const getData = TextEditorClass?.getDragEventData
    ?? TextEditorClass?.implementation?.getDragEventData;

  if (typeof getData === "function") {
    try {
      const data = getData.call(TextEditorClass, event);
      if (data && typeof data === "object" && dragDataUuid(data)) return data;
      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (dragDataUuid(parsed)) return parsed;
        } catch (_error) {
          if (data.trim()) return { uuid: data.trim() };
        }
      }
    } catch (_error) {
      // Fall through to raw DataTransfer JSON.
    }
  }

  try {
    const raw = event?.dataTransfer?.getData?.("application/json")
      || event?.dataTransfer?.getData?.("text/plain")
      || event?.dataTransfer?.getData?.("text/uri-list")
      || "";
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (dragDataUuid(parsed)) return parsed;
    } catch (_error) {
      return { uuid: raw.trim() };
    }
  } catch (_error) {
    return {};
  }
}

function dragDataUuid(data) {
  for (const value of [data?.uuid, data?.documentUuid, data?.data?.uuid, data?.text]) {
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
  const tool = overviewToolForUuid(uuid);
  const available = Boolean(document || tool);
  const name = String(tool?.label ?? document?.name ?? document?.title ?? uuid ?? "Unavailable document");
 const type = tool?.type ?? (available ? documentType(document) : "Unavailable");
 const image = tool ? "" : (available ? documentImage(document) : "");
  const openTitle = tool ? `Execute ${escapeHtml(name)}` : `Open ${escapeHtml(name)}`;
 const visual = image
    ? `<img src="${escapeHtml(image)}" alt="">`
    : `<i class="fas ${tool?.icon ?? (available ? documentIcon(document) : "fa-link-slash")}"></i>`;

  return `
    <article class="mk-gm-overview-link ${available ? "" : "is-missing"}" data-mk-overview-link="${escapeHtml(uuid)}">
      <button type="button" class="mk-gm-overview-link-open" data-mk-overview-open="${escapeHtml(uuid)}" ${available ? "" : "disabled"} title="${available ? openTitle : "This document is no longer available"}">
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

function quickActionHtml(tool) {
  return `
    <button type="button" class="mk-gm-quick-action" data-mk-quick-action="${escapeHtml(tool.uuid)}" title="Execute ${escapeHtml(tool.label)}">
      <span class="mk-gm-quick-action-visual"><i class="fas ${escapeHtml(tool.icon)}" aria-hidden="true"></i></span>
      <span class="mk-gm-quick-action-copy">
        <strong>${escapeHtml(tool.label)}</strong>
        <small>${escapeHtml(tool.type)}</small>
      </span>
    </button>
  `;
}

function quickActionsShellHtml() {
  return `
    <div class="mk-gm-overview-shortcuts" data-mk-quick-actions-surface>
      <div class="mk-gm-overview-shortcuts-head">
        <div>
          <strong>Quick Actions</strong>
          <span>Choose which generators and encounter actions stay visible in GM Screen Settings.</span>
        </div>
        <i class="fas fa-bolt"></i>
      </div>
      <div class="mk-gm-quick-action-list" data-mk-quick-action-list></div>
    </div>
  `;
}

function overviewShellHtml() {
  return `
    <div class="mk-gm-overview-shortcuts" data-mk-overview-shortcuts>
      <div class="mk-gm-overview-shortcuts-head">
        <div>
          <strong>Pinned Documents</strong>
          <span>Drop Foundry documents here to keep them close at the table.</span>
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

  const normalized = pinnedDocumentUuids(uuids);
  if (!normalized.length) {
    list.innerHTML = `
      <div class="mk-gm-overview-drop-empty">
        <i class="fas fa-arrow-down"></i>
        <strong>Drop documents here</strong>
        <span>Drag from a Foundry document source to pin it here.</span>
      </div>
    `;
    return [];
  }

  const entries = await Promise.all(normalized.map(async uuid => ({
    uuid,
    document: overviewToolForUuid(uuid) ? null : await resolveUuid(uuid),
  })));
  list.innerHTML = entries.map(overviewLinkHtml).join("");
  return entries;
}

function renderQuickActions(surface, user = globalThis.game?.user) {
  const list = surface?.querySelector?.("[data-mk-quick-action-list]");
  if (!list) return [];
  const enabled = new Set(getQuickActionIds(user));
  const tools = OVERVIEW_TOOL_DEFINITIONS.filter(tool => enabled.has(tool.id));
  list.innerHTML = tools.length
    ? tools.map(quickActionHtml).join("")
    : `
        <div class="mk-gm-quick-action-empty">
          <i class="fas fa-eye-slash" aria-hidden="true"></i>
          <strong>No Quick Actions enabled</strong>
          <span>Enable actions from GM Screen Settings.</span>
        </div>
      `;
  return [...tools];
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

async function executeOverviewTool(tool) {
  if (!tool || !globalThis.game?.user?.isGM) return null;

  if (tool.action === "roll-encounter") {
    const scene = currentScene();
    const context = getSceneEnvironmentContext(scene);
    const application = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.gmScreen?.application;
    const zoneId = String(application?.encounterZoneId ?? "");
    return promptForEncounterZone(context?.terrain ?? "", scene, {
      zoneId,
      dangerLevel: context?.dangerLevel,
    });
  }

  if (tool.action === "open-settings") {
    const settings = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.gmScreen?.settings;
    if (typeof settings?.open !== "function") {
      globalThis.ui?.notifications?.warn?.("GM Screen Settings are unavailable.");
      return null;
    }
    return settings.open({ settingsTab: tool.settingsTab });
  }

  if (tool.action === "generate-trap") return promptForEncounterGenerator("trap");
  if (tool.action === "generate-hazard") return promptForEncounterGenerator("hazard");
  if (tool.action === "generate-npc") return createSourceDrivenNpc();
  if (tool.action === "generate-monster") return createSourceDrivenMonster();
  if (tool.action === "generate-magic-item") return createSourceDrivenMagicItem();
  if (tool.action === "generate-tavern") return createSourceDrivenTavern();
  if (tool.action === "generate-shop") return createSourceDrivenShop();
  if (tool.action === "create-location") return createExplorationLocation();
  return null;
}

async function openOverviewDocument(uuid) {
  const tool = overviewToolForUuid(uuid);
  if (tool) {
    try {
      return await executeOverviewTool(tool);
    } catch (error) {
      console.error(`mk-shadowdark | GM Screen Overview | ${tool.label} failed`, error);
      globalThis.ui?.notifications?.error?.(`${tool.label} failed: ${error.message}`);
      return null;
    }
  }

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

  const tool = overviewToolForUuid(normalizedUuid);
  if (tool) {
    globalThis.ui?.notifications?.info?.(`${tool.label} is already available in Quick Actions.`);
    await renderOverviewLinks(surface, getOverviewLinkUuids(user));
    return getOverviewLinkUuids(user);
  }
  const document = tool ? null : await resolveUuid(normalizedUuid);
  if (!document && !tool) {
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
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
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
      globalThis.ui?.notifications?.warn?.("Drop a Foundry document with a UUID to pin it here.");
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

function bindQuickActions(surface) {
  if (!surface) return false;

  surface.addEventListener?.("click", event => {
    const button = event.target?.closest?.("[data-mk-quick-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void openOverviewDocument(button.dataset.mkQuickAction);
  });
  return true;
}

async function decorateOverviewLinks(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = rootElement(element);
  const quickActions = root?.querySelector?.("[data-mk-gm-quick-actions]");
  const pinnedDocuments = root?.querySelector?.("[data-mk-gm-pinned-documents]");
  if (!quickActions || !pinnedDocuments) return false;

  quickActions.innerHTML = quickActionsShellHtml();
  const quickSurface = quickActions.querySelector("[data-mk-quick-actions-surface]");
  if (!quickSurface) return false;
  renderQuickActions(quickSurface);
  bindQuickActions(quickSurface);

  pinnedDocuments.innerHTML = overviewShellHtml();
  const pinnedSurface = pinnedDocuments.querySelector("[data-mk-overview-shortcuts]");
  if (!pinnedSurface) return false;
  await renderOverviewLinks(pinnedSurface, getOverviewLinkUuids());
  bindOverviewLinks(pinnedSurface);
  return true;
}

function registerOverviewLinks() {
  const decorateRenderedOverview = (application, element) => {
    void decorateOverviewLinks(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", decorateRenderedOverview);
  globalThis.Hooks?.on?.("renderApplication", decorateRenderedOverview);
  globalThis.Hooks?.on?.(PINNED_DOCUMENTS_REFRESH_HOOK, () => {
    const surface = globalThis.document?.querySelector?.("[data-mk-gm-pinned-documents] [data-mk-overview-shortcuts]");
    if (surface) void renderOverviewLinks(surface, getOverviewLinkUuids());
  });
  globalThis.Hooks?.on?.(QUICK_ACTIONS_REFRESH_HOOK, () => {
    const surface = globalThis.document?.querySelector?.("[data-mk-gm-quick-actions] [data-mk-quick-actions-surface]");
    if (surface) renderQuickActions(surface);
  });
}

registerOverviewLinks();

export {
  MODULE_ID,
  OVERVIEW_LINKS_FLAG,
  QUICK_ACTIONS_FLAG,
  QUICK_ACTIONS_REFRESH_HOOK,
  MAX_OVERVIEW_LINKS,
  OVERVIEW_TOOL_PREFIX,
  OVERVIEW_TOOL_DEFINITIONS,
  gmScreenApplication,
  rootElement,
  normalizeOverviewLinkUuids,
  overviewToolUuid,
  overviewToolForUuid,
  pinnedDocumentUuids,
  currentScene,
  executeOverviewTool,
  getOverviewLinkUuids,
  getQuickActionIds,
  isQuickActionEnabled,
  setOverviewLinkUuids,
  setQuickActionIds,
  setQuickActionEnabled,
  normalizeQuickActionIds,
  dragEventData,
  dragDataUuid,
  resolveUuid,
  documentType,
  documentIcon,
  documentImage,
  overviewLinkHtml,
  quickActionHtml,
  quickActionsShellHtml,
  overviewShellHtml,
  renderOverviewLinks,
  renderQuickActions,
  openOverviewDocument,
  addOverviewLink,
  removeOverviewLink,
  bindOverviewLinks,
  bindQuickActions,
  decorateOverviewLinks,
  registerOverviewLinks,
};
