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
      if (!table?.id && !table?._id) return null;
      return {
        id: String(table?.id ?? table?._id ?? ""),
        uuid: String(table?.uuid ?? ""),
        name: String(table?.name ?? "RollTable"),
        formula,
        contextualFormula: isContextualSourceFormula(formula),
        img: String(table?.img ?? table?.icon ?? "").trim(),
        folderPath: folderPathForTable(table, folders),
        searchText: [
          table?.name,
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
    <section class="mk-gm-workspace mk-gm-source-tables-workspace" data-workspace-panel="${WORKSPACE_ID}">
      ${sourceTablePanelContent(entries)}
    </section>
  `;
}

function sourceTableRowHtml(entry) {
  const rollAction = entry.contextualFormula
    ? '<button type="button" disabled title="This RollTable uses a contextual dice formula. Roll it through the relevant generator."><i class="fas fa-dice"></i> Contextual</button>'
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
      <div class="mk-gm-source-table-meta">
        <span title="Roll formula"><i class="fas fa-dice"></i> ${escapeHtml(entry.formula || "—")}</span>
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
  if (isContextualSourceFormula(table.formula)) {
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

function activateTablesWorkspace(application, root, navButton) {
  application.workspace = WORKSPACE_ID;
  root.dataset.workspace = WORKSPACE_ID;
  root.querySelectorAll(".mk-gm-workspace-nav button").forEach(button => {
    button.classList.toggle("is-active", button === navButton);
  });
}

function findTablesNavButton(nav) {
  if (!nav?.querySelector) return null;
  const canonical = nav.querySelector(`[data-action="workspace"][data-workspace="${WORKSPACE_ID}"]`);
  const legacy = nav.querySelector('[data-mk-source-tables-nav="true"]');
  if (canonical && legacy && canonical !== legacy) legacy.remove?.();
  return canonical ?? legacy ?? null;
}

function bindSourceTableBrowser(root, entries) {
  const search = root.querySelector("[data-mk-source-table-search]");
  const panel = root.querySelector('[data-workspace-panel="tables"]');
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

  const nav = root.querySelector(".mk-gm-workspace-nav");
  const body = root.querySelector(".mk-gm-workspace-body");
  if (!nav || !body) return false;

  const entries = collectSourceTableEntries();

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
    wrapper.innerHTML = sourceTablePanelHtml(entries).trim();
    panel = wrapper.firstElementChild;
    if (!panel) return false;
    body.append(panel);
  } else {
    panel.innerHTML = sourceTablePanelContent(entries).trim();
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
  activateTablesWorkspace,
  findTablesNavButton,
  bindSourceTableBrowser,
  decorateSourceTableBrowser,
  registerSourceTableBrowser,
};
