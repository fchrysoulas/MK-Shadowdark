import { APP_ID } from "./gm-screen.js";
import {
  buildSettlementPageContent,
  defaultSettlementTypeForPoint,
  isSettlementPoint,
  promptForShadowdarkSettlement,
} from "./settlement-generator.js";
import {
  rollShadowdarkPointOfInterestFromSource,
} from "./location-source-table.js";
import { createSourceDrivenNpc } from "./npc-generator.js";
import { pinDocument } from "./pinned-documents.js";
import { waitForGmDialog } from "../libs/dialog-v2.js";

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
  if (html?.form?.querySelector) return html.form;
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

function titleCase(value) {
  return String(value ?? "").replace(/\b\w/g, character => character.toUpperCase());
}

function pointOfInterestSuggestedName(pointOfInterest) {
  if (!pointOfInterest) return DEFAULT_LOCATION_NAME;
  const descriptor = String(pointOfInterest.descriptor ?? "").trim();
  const location = titleCase(String(pointOfInterest.location ?? "").trim());
  return `${descriptor} ${location}`.trim() || DEFAULT_LOCATION_NAME;
}

async function rollShadowdarkPointOfInterest(options = {}) {
  const result = await rollShadowdarkPointOfInterestFromSource(options);
  if (!result) return null;
  if (result.mode === "missing-linked-tables") return result;
  result.suggestedName = pointOfInterestSuggestedName(result);
  return result;
}

function pointOfInterestSources(pointOfInterest) {
  if (pointOfInterest?.sources && typeof pointOfInterest.sources === "object") {
    return pointOfInterest.sources;
  }
  if (pointOfInterest?.source) {
    return {
      descriptor: pointOfInterest.source,
      location: pointOfInterest.source,
      feature: pointOfInterest.source,
    };
  }
  return {};
}

function pointOfInterestSourceLabel(pointOfInterest) {
  const sources = Object.values(pointOfInterestSources(pointOfInterest));
  const titles = [...new Set(sources.map(source => String(source?.bookTitle ?? "").trim()).filter(Boolean))];
  const pages = [...new Set(sources.flatMap(source => source?.pages ?? []))]
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const title = titles.length === 1 ? titles[0] : "Linked Location Generator RollTables";
  return `${escapeHtml(title)}${pages.length ? ` · PDF p. ${escapeHtml(pages.join(", "))}` : ""}`;
}

function pointOfInterestRollFormula(pointOfInterest, key) {
  const source = pointOfInterestSources(pointOfInterest)[key] ?? {};
  return String(source.formulaRaw ?? source.formula ?? "d20").trim() || "d20";
}

function locationGeneratorDialogContent(pointOfInterest) {
  return `
    <div class="mk-gm-create-document-form mk-gm-location-generator-form">
      <div class="form-group">
        <label>Location Name</label>
        <input type="text" name="name" value="${escapeHtml(pointOfInterest.suggestedName)}" autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">${pointOfInterestSourceLabel(pointOfInterest)} · three independent RollTable rolls</p>
      <dl class="mk-gm-data-list">
        <div><dt>Descriptor · ${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "descriptor"))} ${pointOfInterest.descriptorRoll}</dt><dd>${escapeHtml(pointOfInterest.descriptor)}</dd></div>
        <div><dt>Location · ${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "location"))} ${pointOfInterest.locationRoll}</dt><dd>${escapeHtml(pointOfInterest.location)}</dd></div>
        <div><dt>Feature · ${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "feature"))} ${pointOfInterest.featureRoll}</dt><dd>${escapeHtml(pointOfInterest.feature)}</dd></div>
      </dl>
      ${isSettlementPoint(pointOfInterest) ? '<p class="mk-gm-secondary"><i class="fas fa-city"></i> This result can be expanded with the Shadowdark settlement generator.</p>' : ""}
    </div>
  `;
}

async function promptForShadowdarkLocation({
  rollPointOfInterest = rollShadowdarkPointOfInterest,
} = {}) {
  let pointOfInterest = await rollPointOfInterest();
  if (!pointOfInterest) return { mode: "missing-linked-tables" };
  if (pointOfInterest.mode === "missing-linked-tables") return pointOfInterest;

  while (true) {
    const buttons = [
      {
        action: "create",
        icon: '<i class="fas fa-plus"></i>',
        label: "Create",
        default: true,
        callback: (_event, button) => ({
          action: "create",
          name: dialogName(button.form),
        }),
      },
    ];

    if (isSettlementPoint(pointOfInterest)) {
      buttons.push({
        action: "expand",
        icon: '<i class="fas fa-city"></i>',
        label: "Expand Settlement",
        callback: (_event, button) => ({
          action: "expand",
          name: dialogName(button.form),
        }),
      });
    }

    buttons.push({
      action: "reroll",
      icon: '<i class="fas fa-dice-d20"></i>',
      label: "Roll Again",
      callback: () => ({ action: "reroll" }),
    });
    buttons.push({
      action: "cancel",
      icon: '<i class="fas fa-xmark"></i>',
      label: "Cancel",
      callback: () => ({ action: "cancel" }),
    });

    const result = await waitForGmDialog({
      title: "Create Shadowdark Location",
      content: locationGeneratorDialogContent(pointOfInterest),
      buttons,
      close: () => ({ action: "cancel" }),
    });

    if (!result || result.action === "cancel") return null;
    if (result.action === "reroll") {
      pointOfInterest = await rollPointOfInterest();
      if (!pointOfInterest) return { mode: "missing-linked-tables" };
      if (pointOfInterest.mode === "missing-linked-tables") return pointOfInterest;
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

function buildLocationPageContent(pointOfInterest, name = DEFAULT_LOCATION_NAME, settlement = null) {
  if (settlement) return buildSettlementPageContent(settlement, pointOfInterest);
  if (!pointOfInterest) return "";
  const sourceLine = `<p><strong>Source:</strong> ${pointOfInterestSourceLabel(pointOfInterest)}</p>`;
  return `
    <h1>${escapeHtml(name)}</h1>
    <p><strong>Shadowdark Point of Interest</strong></p>
    ${sourceLine}
    <table>
      <thead>
        <tr><th>Roll</th><th>Category</th><th>Result</th></tr>
      </thead>
      <tbody>
        <tr><td>${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "descriptor"))} ${pointOfInterest.descriptorRoll}</td><td>Descriptor</td><td>${escapeHtml(pointOfInterest.descriptor)}</td></tr>
        <tr><td>${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "location"))} ${pointOfInterest.locationRoll}</td><td>Location</td><td>${escapeHtml(pointOfInterest.location)}</td></tr>
        <tr><td>${escapeHtml(pointOfInterestRollFormula(pointOfInterest, "feature"))} ${pointOfInterest.featureRoll}</td><td>Feature</td><td>${escapeHtml(pointOfInterest.feature)}</td></tr>
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
  globalThis.ui?.notifications?.warn?.("Only the GM can create Locations.");
}

async function createExplorationLocation({
  rollPointOfInterest = rollShadowdarkPointOfInterest,
  promptSettlement = promptForShadowdarkSettlement,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    notifyGmOnly();
    return null;
  }

  let pointOfInterest = await promptForShadowdarkLocation({ rollPointOfInterest });
  if (pointOfInterest === null) return null;
  if (pointOfInterest?.mode === "missing-linked-tables") {
    const missing = [...new Set([...(pointOfInterest.missing ?? []), ...(pointOfInterest.unavailable ?? [])])];
    globalThis.ui?.notifications?.warn?.(`Assign all Location Generator RollTables in GM Screen Settings${missing.length ? `: ${missing.join(", ")}` : "."}`);
    return null;
  }

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
  await pinDocument(journal);
  journal?.sheet?.render?.(true);
  return journal ?? null;
}

function createButton({ kind, label, icon, title }) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mkSettlementCreate = kind;
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
  if (!button || button.dataset.mkSettlementCreateBound === "true") return;
  button.dataset.mkSettlementCreateBound = "true";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.mkSettlementCreate === "npc") void createSourceDrivenNpc();
    if (button.dataset.mkSettlementCreate === "location") void createExplorationLocation();
  });
}

function decorateExplorationCreationControls(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const workspace = root?.querySelector?.('[data-workspace-panel="downtime"]');
  if (!workspace) return false;

  const actions = ensureActionRow(workspace);
  if (!actions) return false;

  let npcButton = actions.querySelector('[data-mk-settlement-create="npc"]');
  if (!npcButton) {
    npcButton = createButton({
      kind: "npc",
      label: "NPC Generator",
      icon: "fa-user-plus",
      title: "Generate a Shadowdark NPC from the linked Scene RollTables",
    });
    actions.append(npcButton);
  }

  let locationButton = actions.querySelector('[data-mk-settlement-create="location"]');
  if (!locationButton) {
    locationButton = createButton({
      kind: "location",
      label: "Create Location",
      icon: "fa-map-location-dot",
      title: "Roll the linked Location Generator tables and create a Location Journal",
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
  DEFAULT_LOCATION_NAME,
  LOCATION_PAGE_NAME,
  gmScreenApplication,
  pointOfInterestSuggestedName,
  rollShadowdarkPointOfInterest,
  locationGeneratorDialogContent,
  promptForShadowdarkLocation,
  buildLocationPageContent,
  buildLocationDocumentData,
  configuredDocumentClass,
  createExplorationLocation,
  ensureActionRow,
  decorateExplorationCreationControls,
  registerExplorationCreationControls,
};
