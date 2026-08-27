const MODULE_ID = "mk-shadowdark";

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
    content
  };
}

async function buildContext(journal) {
  const pages = [...(journal?.pages?.contents ?? journal?.pages ?? [])]
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
  const renderedPages = [];

  for (const page of pages) renderedPages.push(await enrichPage(page, journal));
  if (renderedPages.length) renderedPages[0].active = true;

  return {
    document: journal,
    title: journal?.name ?? "Journal",
    icon: "fas fa-book-open",
    typeLabel: "Journal",
    pageCount: renderedPages.length,
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

function registerJournalSheet() {
  const documentClass = globalThis.CONFIG?.JournalEntry?.documentClass ?? globalThis.JournalEntry;
  const config = globalThis.foundry?.applications?.apps?.DocumentSheetConfig ?? globalThis.DocumentSheetConfig;

  if (!documentClass || !config?.registerSheet) return false;

  try {
    config.registerSheet(documentClass, MODULE_ID, MKJournalEntrySheet, {
      label: "MK-Shadowdark Journal",
      makeDefault: true,
      canBeDefault: true,
      canConfigure: true
    });
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Failed to register JournalEntry sheet.`, error);
    return false;
  }
}

globalThis.Hooks?.once?.("init", registerJournalSheet);
