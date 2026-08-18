import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  CORE_BOOK_TITLE,
  SHOP_QUALITIES,
  TAVERN_QUALITIES,
  rollShopFromSource,
  rollTavernFromSource,
  shopSourceStatus,
  tavernSourceStatus,
} from "./tavern-shop-source-tables.js";

const MODULE_ID = "mk-shadowdark";
const DEFAULT_TAVERN_NAME = "New Tavern";
const DEFAULT_SHOP_NAME = "New Shop";
const TAVERN_PAGE_NAME = "Tavern";
const SHOP_PAGE_NAME = "Shop";

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

function dialogValue(html, name) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.(`[name="${name}"]`)?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.(`[name="${name}"]`)?.val?.() ?? "").trim();
}

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function sourcePages(result) {
  const pages = new Set();
  for (const source of Object.values(result?.sources ?? {})) {
    for (const page of source?.pages ?? []) {
      const number = Number(page);
      if (Number.isFinite(number)) pages.add(number);
    }
  }
  return [...pages].sort((left, right) => left - right);
}

function qualityOptions(qualities, selected = "poor") {
  return Object.values(qualities).map(quality => (
    `<option value="${escapeHtml(quality.id)}" ${quality.id === selected ? "selected" : ""}>${escapeHtml(quality.label)}</option>`
  )).join("");
}

function qualityDialogContent(kind, selected = "poor") {
  const label = kind === "shop" ? "Shop" : "Tavern";
  const qualities = kind === "shop" ? SHOP_QUALITIES : TAVERN_QUALITIES;
  return `
    <div class="mk-gm-create-document-form">
      <div class="form-group">
        <label>${label} Quality</label>
        <select name="quality">${qualityOptions(qualities, selected)}</select>
      </div>
      <p class="hint">The selected quality controls the Core Shadowdark generation procedure.</p>
    </div>
  `;
}

async function promptForQuality(kind, { selected = "poor" } = {}) {
  const label = kind === "shop" ? "Shop" : "Tavern";
  const result = await waitForGmDialog({
    title: `Create Shadowdark ${label}`,
    content: qualityDialogContent(kind, selected),
    buttons: [
      {
        action: "generate",
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Generate",
        default: true,
        callback: (_event, button) => dialogValue(button.form, "quality") || selected,
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
    close: () => null,
  });
  return result ? String(result) : null;
}

function sourceLabel(result) {
  const pages = sourcePages(result);
  return `${escapeHtml(result?.sourceBookTitle || CORE_BOOK_TITLE)}${pages.length ? ` · PDF p. ${escapeHtml(pages.join(", "))}` : ""}`;
}

function tavernGeneratorDialogContent(result) {
  const foods = (result?.foods ?? []).map(food => `
    <div>
      <dt>${escapeHtml(food.tierLabel)} Food · d12 ${escapeHtml(food.roll)}</dt>
      <dd>${escapeHtml(food.item)} · ${escapeHtml(food.priceRoll)} ${escapeHtml(food.currency)} <small>(${escapeHtml(food.priceFormula)})</small></dd>
    </div>
  `).join("");
  const drinks = (result?.drinks ?? []).map(drink => `
    <div><dt>Drink · ${escapeHtml(drink.formula)} = ${escapeHtml(drink.roll)}</dt><dd>${escapeHtml(drink.details)}</dd></div>
  `).join("");
  return `
    <div class="mk-gm-create-document-form mk-gm-tavern-generator-form">
      <div class="form-group">
        <label>Tavern Name</label>
        <input type="text" name="name" value="${escapeHtml(result?.name)}" autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">${sourceLabel(result)}</p>
      <dl class="mk-gm-data-list">
        <div><dt>Quality</dt><dd>${escapeHtml(result?.qualityLabel)}</dd></div>
        <div><dt>Identity · d20 ${escapeHtml(result?.rolls?.identity)}</dt><dd>${escapeHtml(result?.name)}</dd></div>
        <div><dt>Known For · same d20</dt><dd>${escapeHtml(result?.knownFor)}</dd></div>
        ${foods}
        ${drinks}
      </dl>
    </div>
  `;
}

function shopGeneratorDialogContent(result) {
  const typeFormula = result?.sources?.shopType?.formulaRaw || "die";
  return `
    <div class="mk-gm-create-document-form mk-gm-shop-generator-form">
      <div class="form-group">
        <label>Shop Name</label>
        <input type="text" name="name" value="${escapeHtml(result?.name)}" autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">${sourceLabel(result)}</p>
      <dl class="mk-gm-data-list">
        <div><dt>Quality</dt><dd>${escapeHtml(result?.qualityLabel)}</dd></div>
        <div><dt>Shop Type · ${escapeHtml(typeFormula)} ${escapeHtml(result?.rolls?.shopType)}</dt><dd>${escapeHtml(result?.shopType)}</dd></div>
        <div><dt>Identity · d20 ${escapeHtml(result?.rolls?.identity)}</dt><dd>${escapeHtml(result?.name)}</dd></div>
        <div><dt>Known For · same d20</dt><dd>${escapeHtml(result?.knownFor)}</dd></div>
        <div><dt>Interesting Customer · d4 ${escapeHtml(result?.rolls?.customerRow)}, d4 ${escapeHtml(result?.rolls?.customerColumn)}</dt><dd>${escapeHtml(result?.customer)}</dd></div>
      </dl>
    </div>
  `;
}

async function promptForGeneratedEstablishment({
  kind,
  quality,
  sourceStatus,
  tables = globalThis.game?.tables,
  rollTavern = rollTavernFromSource,
  rollShop = rollShopFromSource,
} = {}) {
  const isShop = kind === "shop";
  const roll = isShop ? rollShop : rollTavern;
  const label = isShop ? "Shop" : "Tavern";
  let generated = await roll({ quality, status: sourceStatus, tables });
  if (!generated) return { mode: "missing-source" };

  while (true) {
    const choice = await waitForGmDialog({
      title: `Create Shadowdark ${label}`,
      content: isShop ? shopGeneratorDialogContent(generated) : tavernGeneratorDialogContent(generated),
      buttons: [
        {
          action: "create",
          icon: '<i class="fas fa-plus"></i>',
          label: "Create",
          default: true,
          callback: (_event, button) => ({ action: "create", name: dialogValue(button.form, "name") }),
        },
        {
          action: "reroll",
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Again",
          callback: () => ({ action: "reroll" }),
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-xmark"></i>',
          label: "Cancel",
          callback: () => ({ action: "cancel" }),
        },
      ],
      close: () => ({ action: "cancel" }),
    });

    if (!choice || choice.action === "cancel") return null;
    if (choice.action === "reroll") {
      generated = await roll({
        quality,
        status: sourceStatus,
        tables: globalThis.game?.tables ?? tables,
      });
      if (!generated) return { mode: "missing-source" };
      continue;
    }
    return {
      mode: "generated",
      result: generated,
      name: String(choice.name ?? "").trim() || generated.name || (isShop ? DEFAULT_SHOP_NAME : DEFAULT_TAVERN_NAME),
    };
  }
}

function missingSourceDialogContent(kind, status) {
  const label = kind === "shop" ? "Shop" : "Tavern";
  const missing = status?.missing ?? [];
  return `
    <div class="mk-gm-create-document-form">
      <p>The imported <strong>${escapeHtml(CORE_BOOK_TITLE)}</strong> ${label} RollTables are required for generation.</p>
      ${missing.length ? `<p>Missing: ${missing.map(escapeHtml).join(", ")}.</p>` : ""}
      <p class="hint">Import or update your owned Core v4.9 Markdown transcription, or create a blank ${label.toLowerCase()}.</p>
    </div>
  `;
}

async function promptForMissingSource(kind, status) {
  const label = kind === "shop" ? "Shop" : "Tavern";
  return waitForGmDialog({
    title: `${label} Source Tables Required`,
    content: missingSourceDialogContent(kind, status),
    buttons: [
      {
        action: "import",
        icon: '<i class="fas fa-file-import"></i>',
        label: "Import / Update Source Tables",
        default: true,
        callback: () => "import",
      },
      {
        action: "blank",
        icon: '<i class="fas fa-file-circle-plus"></i>',
        label: `Create Blank ${label}`,
        callback: () => "blank",
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => "cancel",
      },
    ],
    close: () => "cancel",
  });
}

async function promptForBlankName(kind) {
  const isShop = kind === "shop";
  const label = isShop ? "Shop" : "Tavern";
  const defaultName = isShop ? DEFAULT_SHOP_NAME : DEFAULT_TAVERN_NAME;
  const result = await waitForGmDialog({
    title: `Create Blank ${label}`,
    content: `<div class="mk-gm-create-document-form"><div class="form-group"><label>${label} Name</label><input type="text" name="name" value="${escapeHtml(defaultName)}" autofocus autocomplete="off"></div></div>`,
    buttons: [
      {
        action: "create",
        icon: '<i class="fas fa-plus"></i>',
        label: "Create",
        default: true,
        callback: (_event, button) => dialogValue(button.form, "name"),
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
    close: () => null,
  });
  if (result === null || result === undefined) return null;
  return String(result).trim() || defaultName;
}

async function openSourceTableImporter() {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.sourceTables;
  if (typeof api?.openImporter !== "function") {
    globalThis.ui?.notifications?.warn?.("Source Table Importer is unavailable.");
    return null;
  }
  return api.openImporter();
}

function tavernPageContent(result, name) {
  if (!result) return "<h2>GM Notes</h2><p></p>";
  const pages = sourcePages(result);
  const foods = result.foods.map(food => (
    `<li><strong>${escapeHtml(food.tierLabel)}</strong> · d12 ${escapeHtml(food.roll)}: ${escapeHtml(food.item)} — ${escapeHtml(food.priceRoll)} ${escapeHtml(food.currency)} (${escapeHtml(food.priceFormula)})</li>`
  )).join("");
  const drinks = result.drinks.map(drink => (
    `<li><strong>${escapeHtml(drink.formula)} = ${escapeHtml(drink.roll)}</strong>: ${escapeHtml(drink.details)}</li>`
  )).join("");
  return `
    <h1>${escapeHtml(name)}</h1>
    <p><strong>Source:</strong> ${escapeHtml(result.sourceBookTitle || CORE_BOOK_TITLE)}${pages.length ? ` · PDF p. ${escapeHtml(pages.join(", "))}` : ""}</p>
    <h2>Shadowdark Tavern</h2>
    <ul>
      <li><strong>Quality:</strong> ${escapeHtml(result.qualityLabel)}</li>
      <li><strong>Identity roll:</strong> d20 ${escapeHtml(result.rolls.identity)}</li>
      <li><strong>Known For:</strong> ${escapeHtml(result.knownFor)}</li>
    </ul>
    <h3>Food</h3>
    <ul>${foods}</ul>
    <h3>Drinks</h3>
    <ul>${drinks}</ul>
    <h2>GM Notes</h2>
    <p></p>
  `.trim();
}

function shopPageContent(result, name) {
  if (!result) return "<h2>GM Notes</h2><p></p>";
  const pages = sourcePages(result);
  const typeFormula = result.sources?.shopType?.formulaRaw || "die";
  return `
    <h1>${escapeHtml(name)}</h1>
    <p><strong>Source:</strong> ${escapeHtml(result.sourceBookTitle || CORE_BOOK_TITLE)}${pages.length ? ` · PDF p. ${escapeHtml(pages.join(", "))}` : ""}</p>
    <h2>Shadowdark Shop</h2>
    <ul>
      <li><strong>Quality:</strong> ${escapeHtml(result.qualityLabel)}</li>
      <li><strong>Shop Type:</strong> ${escapeHtml(typeFormula)} ${escapeHtml(result.rolls.shopType)} — ${escapeHtml(result.shopType)}</li>
      <li><strong>Identity:</strong> d20 ${escapeHtml(result.rolls.identity)} — ${escapeHtml(result.name)}</li>
      <li><strong>Known For:</strong> ${escapeHtml(result.knownFor)}</li>
      <li><strong>Interesting Customer:</strong> d4 ${escapeHtml(result.rolls.customerRow)}, d4 ${escapeHtml(result.rolls.customerColumn)} — ${escapeHtml(result.customer)}</li>
    </ul>
    <h2>GM Notes</h2>
    <p></p>
  `.trim();
}

function buildEstablishmentJournalData({ kind = "tavern", name, result = null, htmlFormat = 1 } = {}) {
  const isShop = kind === "shop";
  const defaultName = isShop ? DEFAULT_SHOP_NAME : DEFAULT_TAVERN_NAME;
  const resolvedName = String(name ?? "").trim() || defaultName;
  return {
    name: resolvedName,
    pages: [
      {
        name: isShop ? SHOP_PAGE_NAME : TAVERN_PAGE_NAME,
        type: "text",
        text: {
          content: isShop ? shopPageContent(result, resolvedName) : tavernPageContent(result, resolvedName),
          format: Number(htmlFormat) || 1,
        },
      },
    ],
  };
}

async function createEstablishmentJournal({ kind, name, result = null } = {}) {
  const JournalEntryClass = configuredDocumentClass(globalThis.JournalEntry);
  if (!JournalEntryClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Journal creation is unavailable.");
    return null;
  }
  const htmlFormat = globalThis.CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1;
  const journal = await JournalEntryClass.create(buildEstablishmentJournalData({
    kind,
    name,
    result,
    htmlFormat,
  }));
  journal?.sheet?.render?.(true);
  return journal ?? null;
}

async function createSourceDrivenEstablishment(kind, {
  tables = globalThis.game?.tables,
  promptMissing = promptForMissingSource,
  importSources = openSourceTableImporter,
  promptQuality = promptForQuality,
  promptGenerated = promptForGeneratedEstablishment,
  promptBlank = promptForBlankName,
} = {}) {
  const isShop = kind === "shop";
  const label = isShop ? "Shop" : "Tavern";
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.(`Only the GM can create Exploration ${label}s.`);
    return null;
  }

  const statusFor = isShop ? shopSourceStatus : tavernSourceStatus;
  let status = statusFor(tables);
  if (!status.available) {
    const missingChoice = await promptMissing(kind, status);
    if (!missingChoice || missingChoice === "cancel") return null;
    if (missingChoice === "blank") {
      const name = await promptBlank(kind);
      return name ? createEstablishmentJournal({ kind, name }) : null;
    }
    await importSources();
    status = statusFor(globalThis.game?.tables ?? tables);
    if (!status.available) {
      globalThis.ui?.notifications?.warn?.(`Required Core ${label} RollTables are still unavailable after import.`);
      return null;
    }
  }

  const quality = await promptQuality(kind);
  if (!quality) return null;
  const generated = await promptGenerated({
    kind,
    quality,
    sourceStatus: status,
    tables: globalThis.game?.tables ?? tables,
  });
  if (!generated || generated.mode !== "generated") return null;
  return createEstablishmentJournal({ kind, name: generated.name, result: generated.result });
}

async function createSourceDrivenTavern(options = {}) {
  return createSourceDrivenEstablishment("tavern", options);
}

async function createSourceDrivenShop(options = {}) {
  return createSourceDrivenEstablishment("shop", options);
}

export {
  MODULE_ID,
  DEFAULT_TAVERN_NAME,
  DEFAULT_SHOP_NAME,
  TAVERN_PAGE_NAME,
  SHOP_PAGE_NAME,
  escapeHtml,
  dialogRoot,
  dialogValue,
  configuredDocumentClass,
  sourcePages,
  qualityOptions,
  qualityDialogContent,
  promptForQuality,
  sourceLabel,
  tavernGeneratorDialogContent,
  shopGeneratorDialogContent,
  promptForGeneratedEstablishment,
  missingSourceDialogContent,
  promptForMissingSource,
  promptForBlankName,
  openSourceTableImporter,
  tavernPageContent,
  shopPageContent,
  buildEstablishmentJournalData,
  createEstablishmentJournal,
  createSourceDrivenEstablishment,
  createSourceDrivenTavern,
  createSourceDrivenShop,
};