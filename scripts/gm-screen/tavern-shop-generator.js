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
import { currentScene } from "./tavern-generator-settings.js";

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

function decodeHtmlEntities(value) {
  const text = String(value ?? "");
  if (!text.includes("&")) return text;

  const textarea = globalThis.document?.createElement?.("textarea");
  if (textarea) {
    textarea.innerHTML = text;
    return textarea.value;
  }

  return text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : _match;
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : _match;
    });
}

function journalText(value) {
  return escapeHtml(decodeHtmlEntities(value));
}

function tavernDebugEnabled() {
  try {
    return Boolean(globalThis.game?.settings?.get?.(MODULE_ID, "gmScreenTavernDebug"));
  } catch (_error) {
    return false;
  }
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

function sourceRollFormula(result, key, fallback = "die") {
  return result?.sources?.[key]?.formulaRaw
    || result?.sources?.[key]?.formula
    || fallback;
}

function tavernIdentityDialogRows(result) {
  if (result?.sourceMode === "linked") {
    return [
      `<div><dt>Wealth · ${escapeHtml(sourceRollFormula(result, "wealth"))} ${escapeHtml(result?.rolls?.wealth)}</dt><dd>${escapeHtml(result?.wealthLabel || result?.qualityLabel)}</dd></div>`,
      `<div><dt>First Part · ${escapeHtml(sourceRollFormula(result, "firstPart"))} ${escapeHtml(result?.rolls?.firstPart)}</dt><dd>${escapeHtml(result?.nameParts?.first)}</dd></div>`,
      `<div><dt>Second Part · ${escapeHtml(sourceRollFormula(result, "secondPart"))} ${escapeHtml(result?.rolls?.secondPart)}</dt><dd>${escapeHtml(result?.nameParts?.second)}</dd></div>`,
      `<div><dt>Known For · ${escapeHtml(sourceRollFormula(result, "knownFor"))} ${escapeHtml(result?.rolls?.knownFor)}</dt><dd>${escapeHtml(result?.knownFor)}</dd></div>`,
    ].join("");
  }
  return [
    `<div><dt>Wealth</dt><dd>${escapeHtml(result?.wealthLabel || result?.qualityLabel)}</dd></div>`,
    `<div><dt>Identity · d20 ${escapeHtml(result?.rolls?.identity)}</dt><dd>${escapeHtml(result?.name)}</dd></div>`,
    `<div><dt>Known For · same d20</dt><dd>${escapeHtml(result?.knownFor)}</dd></div>`,
  ].join("");
}

function tavernGeneratorDialogContent(result) {
  const foods = (result?.foods ?? []).map(food => `
    <div>
      <dt>${escapeHtml(food.tierLabel)} Food · ${escapeHtml(food.formula || "die")} ${escapeHtml(food.roll)}</dt>
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
        ${tavernIdentityDialogRows(result)}
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
  scene = currentScene(),
  tables = globalThis.game?.tables,
  rollTavern = rollTavernFromSource,
  rollShop = rollShopFromSource,
} = {}) {
  const isShop = kind === "shop";
  const roll = isShop ? rollShop : rollTavern;
  const label = isShop ? "Shop" : "Tavern";
  let generated = await roll({ quality, status: sourceStatus, tables, scene });
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
        scene,
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

function tavernIdentityJournalRows(result) {
  if (result?.sourceMode === "linked") {
    return [
      `<li><strong>Wealth:</strong> ${journalText(sourceRollFormula(result, "wealth"))} ${journalText(result?.rolls?.wealth)} — ${journalText(result?.wealthLabel || result?.qualityLabel)}</li>`,
      `<li><strong>First Part:</strong> ${journalText(sourceRollFormula(result, "firstPart"))} ${journalText(result?.rolls?.firstPart)} — ${journalText(result?.nameParts?.first)}</li>`,
      `<li><strong>Second Part:</strong> ${journalText(sourceRollFormula(result, "secondPart"))} ${journalText(result?.rolls?.secondPart)} — ${journalText(result?.nameParts?.second)}</li>`,
      `<li><strong>Known For:</strong> ${journalText(sourceRollFormula(result, "knownFor"))} ${journalText(result?.rolls?.knownFor)} — ${journalText(result?.knownFor)}</li>`,
    ].join("");
  }
  return [
    `<li><strong>Wealth:</strong> ${journalText(result?.wealthLabel || result?.qualityLabel)}</li>`,
    `<li><strong>Identity roll:</strong> d20 ${journalText(result?.rolls?.identity)} — ${journalText(result?.name)}</li>`,
    `<li><strong>Known For:</strong> same d20 — ${journalText(result?.knownFor)}</li>`,
  ].join("");
}

function tavernDebugJournalContent(result) {
  const pages = sourcePages(result);
  const foods = (result?.foods ?? []).map(food => (
    `<li><strong>${journalText(food.tierLabel)} Food:</strong> ${journalText(food.formula || "die")} ${journalText(food.roll)} — ${journalText(food.item)} · ${journalText(food.priceRoll)} ${journalText(food.currency)} (${journalText(food.priceFormula)})</li>`
  )).join("");
  const drinks = (result?.drinks ?? []).map(drink => (
    `<li><strong>Drink:</strong> ${journalText(drink.formula)} = ${journalText(drink.roll)} — ${journalText(drink.details)}</li>`
  )).join("");
  return `
    <section class="mk-gm-tavern-journal-section mk-gm-tavern-journal-debug">
      <h2><i class="fas fa-bug" aria-hidden="true"></i> Roll Details</h2>
      <div class="mk-gm-tavern-journal-card">
        <p><strong>Source:</strong> ${journalText(result?.sourceBookTitle || CORE_BOOK_TITLE)}${pages.length ? ` · PDF p. ${journalText(pages.join(", "))}` : ""}</p>
        <ul>
          ${tavernIdentityJournalRows(result)}
          ${foods}
          ${drinks}
        </ul>
      </div>
    </section>
  `.trim();
}

function tavernPageContent(result, name, { debug = tavernDebugEnabled() } = {}) {
  if (!result) return "<h2>GM Notes</h2><p></p>";
  const foods = (result.foods ?? []).map(food => (
    `<li><strong>${journalText(food.tierLabel)}:</strong> ${journalText(food.item)} <span>— ${journalText(food.priceRoll)} ${journalText(food.currency)}</span></li>`
  )).join("");
  const drinks = (result.drinks ?? []).map(drink => (
    `<li>${journalText(drink.details)}</li>`
  )).join("");
  const quality = String(result.wealthLabel || result.qualityLabel || "unknown").trim().toLowerCase();
  const knownFor = String(result.knownFor || "nothing in particular").trim() || "nothing in particular";
  return `
    <div class="mk-gm-tavern-journal">
      <h1>${journalText(name)}</h1>
      <section class="mk-gm-tavern-journal-section mk-gm-tavern-journal-overview">
        <h2><i class="fas fa-beer-mug-empty" aria-hidden="true"></i> Tavern Overview</h2>
        <div class="mk-gm-tavern-journal-card">
          <p><strong>${journalText(name)}</strong> is a <strong>${journalText(quality)}</strong> tavern known for <strong>${journalText(knownFor)}</strong>.</p>
        </div>
      </section>
      ${debug ? tavernDebugJournalContent(result) : ""}
      <section class="mk-gm-tavern-journal-section mk-gm-tavern-journal-menu">
        <h2><i class="fas fa-utensils" aria-hidden="true"></i> Food</h2>
        <div class="mk-gm-tavern-journal-card">
          <ul>${foods || "<li>None listed.</li>"}</ul>
        </div>
      </section>
      <section class="mk-gm-tavern-journal-section mk-gm-tavern-journal-menu">
        <h2><i class="fas fa-wine-glass" aria-hidden="true"></i> Drinks</h2>
        <div class="mk-gm-tavern-journal-card">
          <ul>${drinks || "<li>None listed.</li>"}</ul>
        </div>
      </section>
      <section class="mk-gm-tavern-journal-section mk-gm-tavern-journal-notes">
        <h2><i class="fas fa-scroll" aria-hidden="true"></i> GM Notes</h2>
        <div class="mk-gm-tavern-journal-card">
          <h3>Current Situation</h3>
          <p>Add current events, conflicts, complications, or other information that becomes relevant during play.</p>
          <hr>
          <p><strong>Proprietor:</strong> <em>Not defined</em></p>
          <p><strong>Staff:</strong> <em>Not defined</em></p>
          <p><strong>Important Patrons:</strong> <em>Not defined</em></p>
          <p><strong>Rumors:</strong> <em>Not defined</em></p>
        </div>
      </section>
    </div>
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
  scene = currentScene(),
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
  let status = isShop ? statusFor(tables) : statusFor(tables, { scene });
  if (!status.available && !isShop && status.mode === "linked") {
    globalThis.ui?.notifications?.warn?.("Assign all Tavern Generator RollTables in GM Screen Settings.");
    return null;
  }
  if (!status.available) {
    const missingChoice = await promptMissing(kind, status);
    if (!missingChoice || missingChoice === "cancel") return null;
    if (missingChoice === "blank") {
      const name = await promptBlank(kind);
      return name ? createEstablishmentJournal({ kind, name }) : null;
    }
    await importSources();
    status = isShop
      ? statusFor(globalThis.game?.tables ?? tables)
      : statusFor(globalThis.game?.tables ?? tables, { scene });
    if (!status.available) {
      globalThis.ui?.notifications?.warn?.(`Required Core ${label} RollTables are still unavailable after import.`);
      return null;
    }
  }

  const quality = !isShop && status.mode === "linked"
    ? null
    : await promptQuality(kind);
  if ((isShop || status.mode !== "linked") && !quality) return null;
  const generated = await promptGenerated({
    kind,
    quality,
    sourceStatus: status,
    tables: globalThis.game?.tables ?? tables,
    scene,
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
