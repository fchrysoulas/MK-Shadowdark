const GM_SCREEN_APP_ID = "mk-shadowdark-gm-screen";
const WORKSPACE_ID = "tables";

function sourceFormulaForTable(table) {
  let metadata = null;
  try {
    metadata = table?.getFlag?.("mk-shadowdark", "sourceTable") ?? null;
  } catch (_error) {
    // Fall through to raw flags for tests and partially hydrated documents.
  }
  metadata ??= table?.flags?.["mk-shadowdark"]?.sourceTable ?? null;

  const nativeFormula = String(table?.formula ?? "").trim();
  return String(metadata?.formulaRaw ?? nativeFormula).trim() || nativeFormula;
}

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

function documentId(document) {
  return String(document?.id ?? document?._id ?? document ?? "").trim();
}

function resolveFolder(folderReference, folders = globalThis.game?.folders) {
  if (folderReference && typeof folderReference === "object") return folderReference;
  const id = documentId(folderReference);
  if (!id) return null;
  return collectionValues(folders).find(folder => documentId(folder) === id) ?? null;
}

function folderPathForTable(table, folders = globalThis.game?.folders) {
  const path = [];
  const visited = new Set();
  let folder = resolveFolder(table?.folder ?? table?.folderId, folders);
  while (folder) {
    const id = documentId(folder) || String(folder.name ?? "");
    if (visited.has(id)) break;
    visited.add(id);
    const name = String(folder.name ?? "").trim();
    if (name) path.unshift(name);
    folder = resolveFolder(folder.folder, folders);
  }
  return path;
}

function collectSourceTableEntries(
  tables = globalThis.game?.tables,
  folders = globalThis.game?.folders,
) {
  return collectionValues(tables)
    .map(table => {
      const formula = String(table?.formula ?? "").trim();
      const formulaRaw = sourceFormulaForTable(table);
      if (!table?.id && !table?._id) return null;
      return {
        id: String(table?.id ?? table?._id ?? ""),
        uuid: String(table?.uuid ?? ""),
        name: String(table?.name ?? "RollTable"),
        formula,
        formulaRaw,
        contextualFormula: isContextualSourceFormula(formulaRaw),
        img: String(table?.img ?? table?.icon ?? "").trim(),
        folderPath: folderPathForTable(table, folders),
        searchText: [
          table?.name,
          formulaRaw,
          table?.formula,
        ].filter(Boolean).join(" ").toLowerCase(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base", numeric: true });
    });
}

function groupSourceTableEntries(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const folderPath = Array.isArray(entry?.folderPath) ? entry.folderPath : [];
    const key = folderPath.join("\u0000");
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: folderPath.length ? folderPath.join(" / ") : "Unfiled",
        folderPath,
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()].sort((left, right) => {
    if (!left.folderPath.length && right.folderPath.length) return -1;
    if (left.folderPath.length && !right.folderPath.length) return 1;
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base", numeric: true });
  });
}

function filterSourceTableEntries(entries = [], { query = "" } = {}) {
  const needle = String(query ?? "").trim().toLowerCase();
  return entries.filter(entry => !needle || entry.searchText.includes(needle));
}

function sourceTablePanelContent(entries = []) {
  return `
    <article class="mk-gm-panel is-wide" data-mk-gm-source-tables-panel>
      <div class="mk-gm-source-table-toolbar">
        <input type="search" data-mk-source-table-search placeholder="Search RollTables…" autocomplete="off" aria-label="Search RollTables">
      </div>
      <div class="mk-gm-source-table-summary" data-mk-source-table-summary></div>
      <div class="mk-gm-source-table-list" data-mk-source-table-list></div>
    </article>
  `;
}

function sourceTablePanelHtml(entries = []) {
  return `
    <section class="mk-gm-screen-zone mk-gm-tables-zone" data-mk-gm-tables-zone>
      <div class="mk-gm-screen-zone-header">
        <div>
          <strong>Tables</strong>
          <span>Search and roll any world RollTable.</span>
        </div>
        <button type="button" class="mk-gm-zone-collapse-toggle" data-action="toggleTables" aria-expanded="true" aria-label="Collapse Tables" title="Toggle Tables panel">
          <i class="fas fa-angles-right" aria-hidden="true"></i>
        </button>
        <i class="fas fa-table-list" aria-hidden="true"></i>
      </div>
      <div class="mk-gm-screen-zone-body">
        ${sourceTablePanelContent(entries)}
      </div>
    </section>
  `;
}

function sourceTableRowHtml(entry) {
  const sourceFormula = escapeHtml(entry.formulaRaw || entry.formula);
  const rollAction = entry.contextualFormula
    ? `<button type="button" disabled title="This RollTable uses a contextual dice formula. Roll it through the relevant generator."><i class="fas fa-dice"></i> Contextual <code>${sourceFormula}</code></button>`
    : `<button type="button" data-mk-source-table-action="roll" data-table-id="${escapeHtml(entry.id)}" title="Roll ${escapeHtml(entry.name)}"><i class="fas fa-dice-d20"></i> Roll</button>`;
  const icon = entry.img
    ? `<img src="${escapeHtml(entry.img)}" alt="" loading="lazy">`
    : '<i class="fas fa-dice-d20" aria-hidden="true"></i>';
  return `
    <article class="mk-gm-source-table-row" data-source-table-id="${escapeHtml(entry.id)}">
      <div class="mk-gm-source-table-main">
        <span class="mk-gm-source-table-icon" aria-hidden="true">${icon}</span>
        <strong title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</strong>
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
    ? `Showing ${filtered.length} of ${entries.length} RollTables.`
    : "No RollTables are available yet.";

  if (!entries.length) {
    list.innerHTML = `
      <div class="mk-gm-source-table-empty">
        <i class="fas fa-book"></i>
        <strong>No RollTables available</strong>
        <span>Create or add RollTables through Foundry, then return here to search, roll, or open them.</span>
      </div>
    `;
    return filtered;
  }

  if (!filtered.length) {
    list.innerHTML = '<div class="mk-gm-source-table-empty"><i class="fas fa-magnifying-glass"></i><strong>No matching tables</strong><span>Change the search text.</span></div>';
    return filtered;
  }

  list.innerHTML = groupSourceTableEntries(filtered).map(group => `
    <details class="mk-gm-source-table-group" data-folder-path="${escapeHtml(group.label)}">
      <summary class="mk-gm-source-table-group-header">
        <span class="mk-gm-source-table-group-caret" aria-hidden="true"></span>
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        <strong>${escapeHtml(group.label)}</strong>
        <span>${group.entries.length}</span>
      </summary>
      <div class="mk-gm-source-table-group-list">
        ${group.entries.map(sourceTableRowHtml).join("")}
      </div>
    </details>
  `).join("");
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
  if (isContextualSourceFormula(sourceFormulaForTable(table))) {
    globalThis.ui?.notifications?.warn?.("This RollTable uses a contextual dice formula. Roll it through the relevant generator.");
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

function bindSourceTableBrowser(root, entries) {
  const search = root.querySelector("[data-mk-source-table-search]");
  const panel = root.querySelector("[data-mk-gm-source-tables-panel]");
  if (!panel || !search) return false;

  const currentFilters = () => ({ query: search.value ?? "" });
  const refreshList = () => renderSourceTableList(panel, entries, currentFilters());

  search.addEventListener?.("input", refreshList);

  panel.addEventListener("click", event => {
    const button = event.target?.closest?.("[data-mk-source-table-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const action = String(button.dataset.mkSourceTableAction ?? "");
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

  const entries = collectSourceTableEntries();
  const panel = root.querySelector("[data-mk-gm-source-tables-panel]");
  if (!panel) return false;

  panel.outerHTML = sourceTablePanelContent(entries).trim();

  bindSourceTableBrowser(root, entries);
  return true;
}

function registerSourceTableBrowser() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateSourceTableBrowser(application, element);
  });
}

registerSourceTableBrowser();

export {
  GM_SCREEN_APP_ID,
  WORKSPACE_ID,
  collectionValues,
  escapeHtml,
  gmScreenApplication,
  isContextualSourceFormula,
  sourceFormulaForTable,
  collectSourceTableEntries,
  folderPathForTable,
  filterSourceTableEntries,
  groupSourceTableEntries,
  sourceTablePanelContent,
  sourceTablePanelHtml,
  sourceTableRowHtml,
  renderSourceTableList,
  findWorldTable,
  rollSourceTable,
  openSourceTable,
  bindSourceTableBrowser,
  decorateSourceTableBrowser,
  registerSourceTableBrowser,
};
