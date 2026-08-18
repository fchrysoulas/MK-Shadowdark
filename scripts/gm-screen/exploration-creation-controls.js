import { APP_ID } from "./gm-screen.js";
import {
  buildSettlementPageContent,
  defaultSettlementTypeForPoint,
  isSettlementPoint,
  promptForShadowdarkSettlement,
} from "./settlement-generator.js";

const DEFAULT_NPC_NAME = "New NPC";
const DEFAULT_LOCATION_NAME = "New Location";
const LOCATION_PAGE_NAME = "Location";

const SHADOWDARK_POI_DESCRIPTORS = Object.freeze([
  "Crumbling",
  "Fortified",
  "New",
  "Overgrown",
  "Destroyed",
  "Pristine",
  "Unnatural",
  "Haunted",
  "Infested",
  "Ancient",
  "Primitive",
  "Illusory",
  "Occupied",
  "Abandoned",
  "Cursed",
  "Temporary",
  "Disguised",
  "Enchanted",
  "Protected",
  "Benevolent",
]);

const SHADOWDARK_POI_LOCATIONS = Object.freeze([
  "Monster nest",
  "Cave",
  "Sinkhole",
  "Pond",
  "Grove",
  "Rock formation",
  "Ruin",
  "Grave site",
  "Treasure cache",
  "Monument",
  "Trap",
  "Dwelling",
  "Camp",
  "Holy site",
  "Tower",
  "Keep",
  "Temple",
  "Castle",
  "Village",
  "City",
]);

const SHADOWDARK_POI_FEATURES = Object.freeze([
  "Magical hazards",
  "Rival adventuring party",
  "Recent cataclysm",
  "Underground tunnels",
  "Dangerous terrain",
  "Unusual flora or fauna",
  "Strange weather",
  "Abundant resources",
  "Changes at night",
  "Unusual material",
  "Hostages",
  "From another realm",
  "Tiny in size",
  "Shifting terrain",
  "Time flows strangely",
  "Unusual shape",
  "Moves locations",
  "Devoid of resources",
  "Massive in size",
  "Home of a minor deity",
]);

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

function rollD20(random = Math.random) {
  const rolled = Number(random());
  const bounded = Number.isFinite(rolled) ? Math.min(Math.max(rolled, 0), 0.999999999999) : 0;
  return Math.floor(bounded * 20) + 1;
}

function titleCase(value) {
  return String(value ?? "").replace(/\b\w/g, character => character.toUpperCase());
}

function pointOfInterestSuggestedName(pointOfInterest) {
  if (!pointOfInterest) return DEFAULT_LOCATION_NAME;
  const descriptor = String(pointOfInterest.descriptor ?? "").trim();
  const location = titleCase(String(pointOfInterest.location ?? "").trim());
  return `${descriptor} ${location}`.trim() || DEFAULT_LOCATION_NAME;
}

function rollShadowdarkPointOfInterest({ random = Math.random } = {}) {
  const descriptorRoll = rollD20(random);
  const locationRoll = rollD20(random);
  const featureRoll = rollD20(random);
  const result = {
    descriptorRoll,
    descriptor: SHADOWDARK_POI_DESCRIPTORS[descriptorRoll - 1],
    locationRoll,
    location: SHADOWDARK_POI_LOCATIONS[locationRoll - 1],
    featureRoll,
    feature: SHADOWDARK_POI_FEATURES[featureRoll - 1],
  };
  result.suggestedName = pointOfInterestSuggestedName(result);
  return result;
}

function locationGeneratorDialogContent(pointOfInterest) {
  return `
    <form class="mk-gm-create-document-form mk-gm-location-generator-form">
      <div class="form-group">
        <label>Location Name</label>
        <input type="text" name="name" value="${escapeHtml(pointOfInterest.suggestedName)}" autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">Shadowdark Point of Interest · three independent d20 rolls</p>
      <dl class="mk-gm-data-list">
        <div><dt>Descriptor · d20 ${pointOfInterest.descriptorRoll}</dt><dd>${escapeHtml(pointOfInterest.descriptor)}</dd></div>
        <div><dt>Location · d20 ${pointOfInterest.locationRoll}</dt><dd>${escapeHtml(pointOfInterest.location)}</dd></div>
        <div><dt>Feature · d20 ${pointOfInterest.featureRoll}</dt><dd>${escapeHtml(pointOfInterest.feature)}</dd></div>
      </dl>
      ${isSettlementPoint(pointOfInterest) ? '<p class="mk-gm-secondary"><i class="fas fa-city"></i> This result can be expanded with the core Shadowdark settlement generator.</p>' : ""}
    </form>
  `;
}

async function promptForShadowdarkLocation({
  rollPointOfInterest = rollShadowdarkPointOfInterest,
} = {}) {
  let pointOfInterest = rollPointOfInterest();
  const DialogClass = globalThis.Dialog;
  if (!DialogClass?.wait) {
    return {
      ...pointOfInterest,
      mode: "location",
      name: pointOfInterest.suggestedName,
    };
  }

  while (true) {
    const buttons = {
      create: {
        icon: '<i class="fas fa-plus"></i>',
        label: "Create",
        callback: html => ({
          action: "create",
          name: dialogName(html),
        }),
      },
    };

    if (isSettlementPoint(pointOfInterest)) {
      buttons.expand = {
        icon: '<i class="fas fa-city"></i>',
        label: "Expand Settlement",
        callback: html => ({
          action: "expand",
          name: dialogName(html),
        }),
      };
    }

    buttons.reroll = {
      icon: '<i class="fas fa-dice-d20"></i>',
      label: "Roll Again",
      callback: () => ({ action: "reroll" }),
    };
    buttons.cancel = {
      icon: '<i class="fas fa-xmark"></i>',
      label: "Cancel",
      callback: () => ({ action: "cancel" }),
    };

    const result = await DialogClass.wait({
      title: "Create Shadowdark Location",
      content: locationGeneratorDialogContent(pointOfInterest),
      buttons,
      default: "create",
      close: () => ({ action: "cancel" }),
    });

    if (!result || result.action === "cancel") return null;
    if (result.action === "reroll") {
      pointOfInterest = rollPointOfInterest();
      continue;
    }
    if (result.action === "create" || result.action === "expand") {
      return {
        ...pointOfInterest,
        mode: result.action === "expand" ? "settlement" : "location",
        name: String(result.name ?? "").trim() || pointOfInterest.suggestedName,
      };
    }
  }
}

function buildNpcDocumentData(name = DEFAULT_NPC_NAME) {
  return {
    name: String(name || "").trim() || DEFAULT_NPC_NAME,
    type: "NPC",
  };
}

function buildLocationPageContent(pointOfInterest, name = DEFAULT_LOCATION_NAME, settlement = null) {
  if (settlement) return buildSettlementPageContent(settlement, pointOfInterest);
  if (!pointOfInterest) return "";
  return `
    <h1>${escapeHtml(name)}</h1>
    <p><strong>Shadowdark Point of Interest</strong></p>
    <table>
      <thead>
        <tr><th>Roll</th><th>Category</th><th>Result</th></tr>
      </thead>
      <tbody>
        <tr><td>d20 ${pointOfInterest.descriptorRoll}</td><td>Descriptor</td><td>${escapeHtml(pointOfInterest.descriptor)}</td></tr>
        <tr><td>d20 ${pointOfInterest.locationRoll}</td><td>Location</td><td>${escapeHtml(pointOfInterest.location)}</td></tr>
        <tr><td>d20 ${pointOfInterest.featureRoll}</td><td>Feature</td><td>${escapeHtml(pointOfInterest.feature)}</td></tr>
      </tbody>
    </table>
    <h2>GM Notes</h2>
    <p></p>
  `.trim();
}

function buildLocationDocumentData(name = DEFAULT_LOCATION_NAME, {
  htmlFormat = 1,
  pointOfInterest = null,
  settlement = null,
} = {}) {
  const resolvedName = String(name || "").trim() || DEFAULT_LOCATION_NAME;
  return {
    name: resolvedName,
    pages: [
      {
        name: LOCATION_PAGE_NAME,
        type: "text",
        text: {
          content: buildLocationPageContent(pointOfInterest, resolvedName, settlement),
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

async function createExplorationLocation({
  rollPointOfInterest = rollShadowdarkPointOfInterest,
  promptSettlement = promptForShadowdarkSettlement,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    notifyGmOnly();
    return null;
  }

  const pointOfInterest = await promptForShadowdarkLocation({ rollPointOfInterest });
  if (pointOfInterest === null) return null;

  let settlement = null;
  let documentName = pointOfInterest.name;
  if (pointOfInterest.mode === "settlement") {
    settlement = await promptSettlement({
      originPoint: pointOfInterest,
      defaultType: defaultSettlementTypeForPoint(pointOfInterest) ?? "village",
    });
    if (!settlement) return null;
    documentName = settlement.name;
  }

  const JournalEntryClass = configuredDocumentClass(globalThis.JournalEntry);
  if (!JournalEntryClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Journal creation is unavailable.");
    return null;
  }

  const htmlFormat = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
  const journal = await JournalEntryClass.create(buildLocationDocumentData(documentName, {
    htmlFormat,
    pointOfInterest,
    settlement,
  }));
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
      title: "Roll a Shadowdark Point of Interest and create a Location Journal",
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
  SHADOWDARK_POI_DESCRIPTORS,
  SHADOWDARK_POI_LOCATIONS,
  SHADOWDARK_POI_FEATURES,
  gmScreenApplication,
  promptForName,
  rollD20,
  pointOfInterestSuggestedName,
  rollShadowdarkPointOfInterest,
  locationGeneratorDialogContent,
  promptForShadowdarkLocation,
  buildNpcDocumentData,
  buildLocationPageContent,
  buildLocationDocumentData,
  configuredDocumentClass,
  createExplorationNpc,
  createExplorationLocation,
  ensureActionRow,
  decorateExplorationCreationControls,
  registerExplorationCreationControls,
};
