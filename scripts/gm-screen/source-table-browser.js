import { sourceTableFlag } from "../source-tables/source-table-importer.js";
import {
  bindEncounterSetupAutoSave,
  buildEncounterSetupView,
  cachedAvailableRollTables,
  renderEncounterSetup,
} from "./environment-controls.js";
import { patchGmScreenPresentationPreferences } from "./presentation-preferences.js";

const MODULE_ID = "mk-shadowdark";
const GM_SCREEN_APP_ID = "mk-shadowdark-gm-screen";
const WORKSPACE_ID = "tables";

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  try {
    return [...collection];
  } catch (_error) {
    return [];
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

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === GM_SCREEN_APP_ID
      || application.options?.id === GM_SCREEN_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === GM_SCREEN_APP_ID
    )
  );
}

function isContextualSourceFormula(value) {
  return String(value ?? "").trim().includes("*");
}

function collectSourceTableEntries(tables = globalThis.game?.tables) {
  return collectionValues(tables)
    .map(table => {
      const metadata = sourceTableFlag(table);
      if (!metadata?.key) return null;

      const pages = Array.isArray(metadata.pages) ? metadata.pages : [];
      const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];
      const sourceFormula = String(metadata.formulaRaw ?? metadata.formula ?? "").trim();
      const formula = sourceFormula || String(table?.formula ?? "");
      const contextualFormula = isContextualSourceFormula(sourceFormula);
      return {
        id: String(table?.id ?? table?._id ?? ""),
        uuid: String(table?.uuid ?? ""),
        name: String(table?.name ?? "Imported Table"),
        formula,
        contextualFormula,
        bookId: String(metadata.bookId ?? ""),
        bookTitle: String(metadata.bookTitle ?? metadata.bookId ?? "Imported Source"),
        pages,
        pagesLabel: pages.length ? pages.join(", ") : "—",
        warningCount: warnings.length,
        warnings,
        key: String(metadata.key),
        searchText: [
          table?.name,
          table?.formula,
          metadata.bookId,
          metadata.bookTitle,
          metadata.formula,
          metadata.formulaRaw,
          pages.join(" "),
        ].filter(Boolean).join(" ").toLowerCase(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const book = left.bookTitle.localeCompare(right.bookTitle, undefined, { sensitivity: "base", numeric: true });
      if (book !== 0) return book;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
    });
}

function sourceBookOptions(entries = []) {
  const books = new Map();
  for (const entry of entries) {
    if (!entry?.bookId) continue;
    if (!books.has(entry.bookId)) books.set(entry.bookId, entry.bookTitle || entry.bookId);
  }
  return [...books.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base", numeric: true }));
}

function filterSourceTableEntries(entries = [], { query = "", bookId = "" } = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  const source = String(bookId ?? "").trim();
  return entries.filter(entry => {
    if (source && entry.bookId !== source) return false;
    if (needle && !entry.searchText.includes(needle)) return false;
    return true;
  });
}

function sourceTablePanelContent(entries = [], encounterSetupHtml = "") {
  const encounterSetup = encounterSetupHtml
    ? `<article class="mk-gm-panel is-wide" data-mk-gm-tables-encounter-setup>${encounterSetupHtml}</article>`
    : "";

  return `
    ${encounterSetup}
    <article class="mk-gm-panel is-wide" data-mk-gm-source-tables-panel>
      <header><i class="fas fa-table-list"></i><span>Source Tables</span></header>
      <div class="mk-gm-source-table-toolbar">
        <input type="search" data-mk-source-table-search placeholder="Search imported tables…" autocomplete="off" aria-label="Search imported source tables">
        <select data-mk-source-table-book aria-label="Filter source book">
          <option value="">All Sources</option>
          ${sourceBookOptions(entries).map(book => `<option value="${escapeHtml(book.id)}">${escapeHtml(book.title)}</option>`).join("")}
        </select>
        <button type="button" data-mk-source-table-action="import"><i class="fas fa-file-import"></i> Import / Update</button>
      </div>
      <div class="mk-gm-source-table-summary" data-mk-source-table-summary></div>
      <div class="mk-gm-source-table-list" data-mk-source-table-list></div>
    </article>
  `;
}

function sourceTablePanelHtml(entries = [], encounterSetupHtml = "") {
  return `
    <section class="mk-gm-workspace mk-gm-source-tables-workspace" data-workspace-panel="${WORKSPACE_ID}">
      ${sourceTablePanelContent(entries, encounterSetupHtml)}
    </section>
  `;
}

function sourceTableRowHtml(entry) {
  const rollAction = entry.contextualFormula
    ? '<button type="button" disabled title="This source table uses a contextual dice formula. Roll it through the relevant generator."><i class="fas fa-dice"></i> Contextual</button>'
    : `<button type="button" data-mk-source-table-action="roll" data-table-id="${escapeHtml(entry.id)}" title="Roll ${escapeHtml(entry.name)}"><i class="fas fa-dice-d20"></i> Roll</button>`;
  return `
    <article class="mk-gm-source-table-row" data-source-table-id="${escapeHtml(entry.id)}">
      <div class="mk-gm-source-table-main">
        <strong title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</strong>
        <small>${escapeHtml(entry.bookTitle)}</small>
      </div>
      <div class="mk-gm-source-table-meta">
        <span title="Source roll formula"><i class="fas fa-dice"></i> ${escapeHtml(entry.formula || "—")}</span>
        <span title="PDF page(s)"><i class="fas fa-book-open"></i> ${escapeHtml(entry.pagesLabel)}</span>
        ${entry.warningCount ? `<span class="is-warning" title="${entry.warningCount} import warning(s)"><i class="fas fa-triangle-exclamation"></i> ${entry.warningCount}</span>` : ""}
      </div>
      <div class="mk-gm-source-table-actions">
        ${rollAction}
        <button type="button" data-mk-source-table-action="open" data-table-id="${escapeHtml(entry.id)}" title="Open ${escapeHtml(entry.name)}"><i class="fas fa-arrow-up-right-from-square"></i></button>
      </div>
    </article>
  `;
}

function renderSourceTableList(root, entries, filters = {}) {
  const list = root?.querySelector?.("[data-mk-source-table-list]");
  const summary = root?.querySelector?.("[data-mk-source-table-summary]");
  if (!list || !summary) return [];

  const filtered = filterSourceTableEntries(entries, filters);
  summary.textContent = entries.length
    ? `Showing ${filtered.length} of ${entries.length} imported RollTables.`
    : "No imported source RollTables are available yet.";

  if (!entries.length) {
    list.innerHTML = `
      <div class="mk-gm-source-table-empty">
        <i class="fas fa-book"></i>
        <strong>No source tables imported</strong>
        <span>Use Import / Update and select one of your supported owned Shadowdark Markdown transcriptions.</span>
      </div>
    `;
    return filtered;
  }

  if (!filtered.length) {
    list.innerHTML = '<div class="mk-gm-source-table-empty"><i class="fas fa-magnifying-glass"></i><strong>No matching tables</strong><span>Change the search text or source filter.</span></div>';
    return filtered;
  }

  list.innerHTML = filtered.map(sourceTableRowHtml).join("");
  return filtered;
}

function findWorldTable(tableId, tables = globalThis.game?.tables) {
  const id = String(tableId ?? "");
  if (!id) return null;
  if (typeof tables?.get === "function") return tables.get(id) ?? null;
  return collectionValues(tables).find(table => String(table?.id ?? table?._id ?? "") === id) ?? null;
}

async function rollSourceTable(table) {
  if (!table || typeof table.draw !== "function") {
    globalThis.ui?.notifications?.warn?.("The selected RollTable is unavailable.");
    return null;
  }
  const metadata = sourceTableFlag(table);
  if (isContextualSourceFormula(metadata?.formulaRaw)) {
    globalThis.ui?.notifications?.warn?.("This source table uses a contextual dice formula. Roll it through the relevant generator.");
    return null;
  }
  return table.draw({ displayChat: true });
}

async function openSourceTable(table) {
  if (!table) {
    globalThis.ui?.notifications?.warn?.("The selected RollTable is unavailable.");
    return null;
  }
  const sheet = table.sheet;
  if (!sheet?.render) {
    globalThis.ui?.notifications?.warn?.("The selected RollTable sheet is unavailable.");
    return null;
  }
  await sheet.render(true);
  return table;
}

async function importSourceTables(application) {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.sourceTables;
  if (typeof api?.openImporter !== "function") {
    globalThis.ui?.notifications?.warn?.("The Shadowdark source-table importer is unavailable.");
    return null;
  }
  const result = await api.openImporter();
  if (result?.report) await application?.render?.({ force: true });
  return result;
}

function activateTablesWorkspace(application, root, navButton) {
  application.workspace = WORKSPACE_ID;
  root.dataset.workspace = WORKSPACE_ID;
  root.querySelectorAll(".mk-gm-workspace-nav button").forEach(button => {
    button.classList.toggle("is-active", button === navButton);
  });
  void patchGmScreenPresentationPreferences({
    groupActorUuid: String(application?.groupActorUuid ?? ""),
    workspace: WORKSPACE_ID,
    partyRailCollapsed: application?.partyRailCollapsed === true,
  });
}

function findTablesNavButton(nav) {
  if (!nav?.querySelector) return null;
  const canonical = nav.querySelector(`[data-action="workspace"][data-workspace="${WORKSPACE_ID}"]`);
  const legacy = nav.querySelector('[data-mk-source-tables-nav="true"]');
  if (canonical && legacy && canonical !== legacy) legacy.remove?.();
  return canonical ?? legacy ?? null;
}

function bindSourceTableBrowser(application, root, entries) {
  const search = root.querySelector("[data-mk-source-table-search]");
  const source = root.querySelector("[data-mk-source-table-book]");
  const panel = root.querySelector('[data-workspace-panel="tables"]');
  if (!panel || !search || !source) return false;

  const currentFilters = () => ({
    query: search.value ?? "",
    bookId: source.value ?? "",
  });
  const refreshList = () => renderSourceTableList(panel, entries, currentFilters());

  search.addEventListener?.("input", refreshList);
  source.addEventListener?.("change", refreshList);

  panel.addEventListener("click", event => {
    const button = event.target?.closest?.("[data-mk-source-table-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const action = String(button.dataset.mkSourceTableAction ?? "");
    if (action === "import") {
      void importSourceTables(application);
      return;
    }

    const table = findWorldTable(button.dataset.tableId);
    if (action === "roll") void rollSourceTable(table);
    if (action === "open") void openSourceTable(table);
  });

  refreshList();
  return true;
}

async function decorateSourceTableBrowser(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root?.querySelector) return false;

  const nav = root.querySelector(".mk-gm-workspace-nav");
  const body = root.querySelector(".mk-gm-workspace-body");
  if (!nav || !body) return false;

  const entries = collectSourceTableEntries();
  const tables = await cachedAvailableRollTables();
  const encounterSetupView = buildEncounterSetupView({ tables });
  const encounterSetupHtml = renderEncounterSetup(encounterSetupView);

  let button = findTablesNavButton(nav);
  let canonicalNavigation = button?.dataset?.action === "workspace";
  if (!button) {
    button = globalThis.document?.createElement?.("button");
    if (!button) return false;
    button.type = "button";
    button.dataset.mkSourceTablesNav = "true";
    button.dataset.workspace = WORKSPACE_ID;
    button.textContent = "Tables";
    nav.append(button);
    canonicalNavigation = false;
  }

  let panel = body.querySelector('[data-workspace-panel="tables"]');
  if (!panel) {
    const wrapper = globalThis.document?.createElement?.("div");
    if (!wrapper) return false;
    wrapper.innerHTML = sourceTablePanelHtml(entries, encounterSetupHtml).trim();
    panel = wrapper.firstElementChild;
    if (!panel) return false;
    body.append(panel);
  } else {
    panel.innerHTML = sourceTablePanelContent(entries, encounterSetupHtml).trim();
  }

  const encounterSetup = panel.querySelector("[data-mk-gm-tables-encounter-setup]");
  if (encounterSetup && encounterSetupView.scene) {
    bindEncounterSetupAutoSave(encounterSetup, encounterSetupView.scene);
  }

  if (!canonicalNavigation) {
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      activateTablesWorkspace(application, root, button);
    });
  }

  if (String(application.workspace ?? "") === WORKSPACE_ID) {
    root.dataset.workspace = WORKSPACE_ID;
    root.querySelectorAll(".mk-gm-workspace-nav button").forEach(candidate => {
      candidate.classList.toggle("is-active", candidate === button);
    });
  }

  bindSourceTableBrowser(application, root, entries);
  return true;
}

function registerSourceTableBrowser() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateSourceTableBrowser(application, element);
  });
}

registerSourceTableBrowser();

export {
  MODULE_ID,
  GM_SCREEN_APP_ID,
  WORKSPACE_ID,
  collectionValues,
  escapeHtml,
  gmScreenApplication,
  isContextualSourceFormula,
  collectSourceTableEntries,
  sourceBookOptions,
  filterSourceTableEntries,
  sourceTablePanelContent,
  sourceTablePanelHtml,
  sourceTableRowHtml,
  renderSourceTableList,
  findWorldTable,
  rollSourceTable,
  openSourceTable,
  importSourceTables,
  activateTablesWorkspace,
  findTablesNavButton,
  bindSourceTableBrowser,
  decorateSourceTableBrowser,
  registerSourceTableBrowser,
};