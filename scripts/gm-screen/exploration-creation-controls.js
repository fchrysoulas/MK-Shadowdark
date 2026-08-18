import { APP_ID } from "./gm-screen.js";

const DEFAULT_NPC_NAME = "New NPC";
const DEFAULT_LOCATION_NAME = "New Location";
const LOCATION_PAGE_NAME = "Location";

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

function dialogRoot(html) {
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function dialogName(html) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.('[name="name"]')?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.('[name="name"]')?.val?.() ?? "").trim();
}

async function promptForName({ title, label, defaultName }) {
  const DialogClass = globalThis.Dialog;
  if (!DialogClass?.wait) return defaultName;

  const result = await DialogClass.wait({
    title,
    content: `
      <form class="mk-gm-create-document-form">
        <div class="form-group">
          <label>${escapeHtml(label)}</label>
          <input type="text" name="name" value="${escapeHtml(defaultName)}" autofocus autocomplete="off">
        </div>
      </form>
    `,
    buttons: {
      create: {
        icon: '<i class="fas fa-plus"></i>',
        label: "Create",
        callback: html => dialogName(html),
      },
      cancel: {
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "create",
    close: () => null,
  });

  if (result === null || result === undefined) return null;
  return String(result).trim() || defaultName;
}

function buildNpcDocumentData(name = DEFAULT_NPC_NAME) {
  return {
    name: String(name || "").trim() || DEFAULT_NPC_NAME,
    type: "NPC",
  };
}

function buildLocationDocumentData(name = DEFAULT_LOCATION_NAME, { htmlFormat = 1 } = {}) {
  const resolvedName = String(name || "").trim() || DEFAULT_LOCATION_NAME;
  return {
    name: resolvedName,
    pages: [
      {
        name: LOCATION_PAGE_NAME,
        type: "text",
        text: {
          content: "",
          format: Number(htmlFormat) || 1,
        },
      },
    ],
  };
}

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function notifyGmOnly() {
  globalThis.ui?.notifications?.warn?.("Only the GM can create Exploration NPCs or Locations.");
}

async function createExplorationNpc() {
  if (!globalThis.game?.user?.isGM) {
    notifyGmOnly();
    return null;
  }

  const name = await promptForName({
    title: "Create NPC",
    label: "NPC Name",
    defaultName: DEFAULT_NPC_NAME,
  });
  if (name === null) return null;

  const ActorClass = configuredDocumentClass(globalThis.Actor);
  if (!ActorClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Actor creation is unavailable.");
    return null;
  }

  const actor = await ActorClass.create(buildNpcDocumentData(name));
  actor?.sheet?.render?.(true);
  return actor ?? null;
}

async function createExplorationLocation() {
  if (!globalThis.game?.user?.isGM) {
    notifyGmOnly();
    return null;
  }

  const name = await promptForName({
    title: "Create Location",
    label: "Location Name",
    defaultName: DEFAULT_LOCATION_NAME,
  });
  if (name === null) return null;

  const JournalEntryClass = configuredDocumentClass(globalThis.JournalEntry);
  if (!JournalEntryClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Journal creation is unavailable.");
    return null;
  }

  const htmlFormat = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
  const journal = await JournalEntryClass.create(buildLocationDocumentData(name, { htmlFormat }));
  journal?.sheet?.render?.(true);
  return journal ?? null;
}

function createButton({ kind, label, icon, title }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mkExplorationCreate = kind;
  button.title = title;
  button.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
  return button;
}

function ensureActionRow(workspace) {
  const panel = workspace?.querySelector?.(".mk-gm-panel");
  if (!panel) return null;

  let actions = panel.querySelector(".mk-gm-panel-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "mk-gm-panel-actions";
    panel.append(actions);
  }
  return actions;
}

function bindCreationButton(button) {
  if (!button || button.dataset.mkExplorationCreateBound === "true") return;
  button.dataset.mkExplorationCreateBound = "true";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const kind = String(button.dataset.mkExplorationCreate ?? "");
    if (kind === "npc") void createExplorationNpc();
    if (kind === "location") void createExplorationLocation();
  });
}

function decorateExplorationCreationControls(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const workspace = root?.querySelector?.('[data-workspace-panel="exploration"]');
  if (!workspace) return false;

  const actions = ensureActionRow(workspace);
  if (!actions) return false;

  let npcButton = actions.querySelector('[data-mk-exploration-create="npc"]');
  if (!npcButton) {
    npcButton = createButton({
      kind: "npc",
      label: "Create NPC",
      icon: "fa-user-plus",
      title: "Create a new Shadowdark NPC Actor",
    });
    actions.append(npcButton);
  }

  let locationButton = actions.querySelector('[data-mk-exploration-create="location"]');
  if (!locationButton) {
    locationButton = createButton({
      kind: "location",
      label: "Create Location",
      icon: "fa-map-location-dot",
      title: "Create a new Location Journal",
    });
    actions.append(locationButton);
  }

  bindCreationButton(npcButton);
  bindCreationButton(locationButton);
  return true;
}

function registerExplorationCreationControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decorateExplorationCreationControls(application, element);
  });
}

registerExplorationCreationControls();

export {
  DEFAULT_NPC_NAME,
  DEFAULT_LOCATION_NAME,
  LOCATION_PAGE_NAME,
  gmScreenApplication,
  promptForName,
  buildNpcDocumentData,
  buildLocationDocumentData,
  configuredDocumentClass,
  createExplorationNpc,
  createExplorationLocation,
  ensureActionRow,
  decorateExplorationCreationControls,
  registerExplorationCreationControls,
};
