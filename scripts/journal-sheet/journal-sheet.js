const MODULE_ID = "mk-shadowdark";
const JOURNAL_SHEET_DEFAULT_SETTING = "journalSheetDefault";

const PAGE_ICONS = {
  text: "fas fa-file-lines",
  image: "fas fa-image",
  video: "fas fa-film",
  pdf: "fas fa-file-pdf",
  other: "fas fa-file-lines"
};

function humanize(value) {
  return String(value ?? "Record")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, character => character.toUpperCase());
}

function escapeHtml(value) {
  const text = String(value ?? "");
  return text.replace(/[&<>'"]/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  })[character]);
}

function embeddedContents(collection) {
  if (Array.isArray(collection)) return [...collection];
  if (Array.isArray(collection?.contents)) return [...collection.contents];
  if (collection?.contents) return Array.from(collection.contents);
  if (typeof collection?.values === "function") return Array.from(collection.values());
  return [];
}

function pageCategoryId(page) {
  const category = page?.category ?? page?._source?.category;
  return category?.id ?? category?._id ?? category ?? null;
}

async function enrichPage(page, journal) {
  let content = "";

  if (page.type === "text") {
    content = String(page.text?.content ?? "");
    const editor = globalThis.foundry?.applications?.ux?.TextEditor;
    if (editor?.enrichHTML) {
      try {
        content = await editor.enrichHTML(content, {
          async: true,
          secrets: journal.isOwner,
          relativeTo: page
        });
      } catch (_error) {
        // Keep the stored HTML if enrichment is unavailable on a version.
      }
    }
  } else if (page.type === "image" && page.src) {
    content = `<figure class="mk-journal-sheet-image-page"><img src="${escapeHtml(page.src)}" alt="${escapeHtml(page.name)}"></figure>`;
  } else {
    content = `<div class="mk-journal-sheet-empty-page"><p>${humanize(page.type)} page. Open the page editor to view or edit this page type.</p></div>`;
  }

  return {
    id: page.id,
    name: page.name,
    icon: PAGE_ICONS[page.type] ?? PAGE_ICONS.other,
    categoryId: pageCategoryId(page),
    content
  };
}

async function buildContext(journal) {
  const pages = embeddedContents(journal?.pages)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  const categories = embeddedContents(journal?.categories)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  const renderedPages = [];

  for (const page of pages) renderedPages.push(await enrichPage(page, journal));

  const categoryGroups = categories.map(category => ({
    id: category.id ?? category._id,
    name: category.name,
    showHeading: true,
    pages: []
  }));
  const categoryGroupsById = new Map(categoryGroups.map(group => [String(group.id), group]));
  const uncategorized = {
    id: "uncategorized",
    name: "Uncategorized",
    showHeading: true,
    pages: []
  };

  for (const page of renderedPages) {
    const category = page.categoryId == null ? null : categoryGroupsById.get(String(page.categoryId));
    (category ?? uncategorized).pages.push(page);
  }

  const navigationGroups = [...categoryGroups];
  if (uncategorized.pages.length) navigationGroups.push(uncategorized);
  const firstPage = renderedPages[0];
  if (firstPage) firstPage.active = true;

  return {
    document: journal,
    title: journal?.name ?? "Journal",
    icon: "fas fa-book-open",
    typeLabel: "Journal",
    pageCount: renderedPages.length,
    activePageName: firstPage?.name ?? "",
    navigationGroups,
    pages: renderedPages,
    hasPages: renderedPages.length > 0
  };
}

function bindSheetInteractions(root) {
  if (!root) return;

  const navButtons = root.querySelectorAll("[data-mk-journal-page-id]");
  const panels = root.querySelectorAll("[data-mk-journal-page-panel]");
  const pageTitle = root.querySelector("[data-mk-journal-active-page-title]");

  for (const button of navButtons) {
    button.addEventListener("click", event => {
      event.preventDefault();
      const id = button.dataset.mkJournalPageId;
      for (const other of navButtons) other.classList.toggle("active", other === button);
      for (const panel of panels) {
        panel.classList.toggle("active", panel.dataset.mkJournalPagePanel === id);
      }
      if (pageTitle) pageTitle.textContent = button.dataset.mkJournalPageName ?? "";
    });
  }
}

const foundryApi = globalThis.foundry?.applications?.api ?? {};
const BaseDocumentSheetV2 = foundryApi.DocumentSheetV2 ?? class {};
const HandlebarsMixin = foundryApi.HandlebarsApplicationMixin ?? (base => base);

class MKJournalEntrySheet extends HandlebarsMixin(BaseDocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["mk-shadowdark-journal-sheet", "sheet", "journal-sheet"],
    window: {
      frame: true,
      icon: "fas fa-book-open",
      minimizable: true,
      resizable: true
    },
    position: {
      width: 1040,
      height: 820
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/journal-sheet.hbs`,
      scrollable: [".mk-journal-sheet-main", ".mk-journal-sheet-sidebar", ".mk-journal-sheet-page-body"]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return Object.assign(context, await buildContext(this.document));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    bindSheetInteractions(this.element);
  }
}

function getJournalSheetDefault() {
  const settings = globalThis.game?.settings;
  if (typeof settings?.get !== "function") return true;

  try {
    return settings.get(MODULE_ID, JOURNAL_SHEET_DEFAULT_SETTING) !== false;
  } catch (_error) {
    return true;
  }
}

function getJournalSheetConfig() {
  return globalThis.foundry?.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;
}

function getJournalEntryDocumentClass() {
  return globalThis.CONFIG?.JournalEntry?.documentClass ?? globalThis.JournalEntry;
}

function restoreFoundryDefaultSheets(config) {
  if (typeof config?.updateDefaultSheets !== "function") return;

  let storedDefaults = {};
  try {
    storedDefaults = globalThis.game?.settings?.get?.("core", "sheetClasses") ?? {};
  } catch (_error) {
    // The core sheet setting is not available during early initialization on some versions.
  }

  config.updateDefaultSheets(storedDefaults);
}

function registerJournalSheet({ resetExisting = false, enabled } = {}) {
  const documentClass = getJournalEntryDocumentClass();
  const config = getJournalSheetConfig();

  if (!documentClass || !config?.registerSheet) return false;

  try {
    if (resetExisting && typeof config.unregisterSheet === "function") {
      try {
        config.unregisterSheet(documentClass, MODULE_ID, MKJournalEntrySheet);
      } catch (error) {
        console.warn(`${MODULE_ID} | Failed to refresh the JournalEntry sheet registration.`, error);
      }
    }

    const useAsDefault = typeof enabled === "boolean" ? enabled : getJournalSheetDefault();
    config.registerSheet(documentClass, MODULE_ID, MKJournalEntrySheet, {
      label: "MK-Shadowdark Journal",
      makeDefault: useAsDefault,
      canBeDefault: true,
      canConfigure: true
    });

    if (resetExisting && !useAsDefault) restoreFoundryDefaultSheets(config);
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to register JournalEntry sheet.`, error);
    return false;
  }
}

globalThis.MKShadowdarkJournalSheet = {
  setDefault: value => registerJournalSheet({ resetExisting: true, enabled: value })
};

globalThis.Hooks?.once?.("init", registerJournalSheet);
