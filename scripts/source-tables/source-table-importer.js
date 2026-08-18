import {
  SOURCE_BOOKS,
  parseSourceTables,
} from "./parser.js";

const MODULE_ID = "mk-shadowdark";
const ROOT_FOLDER_NAME = "MK Shadowdark Source Tables";
const SOURCE_TABLE_FLAG = "sourceTable";

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

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function runtimeDefaults() {
  return {
    game: globalThis.game,
    FolderClass: configuredDocumentClass(globalThis.Folder),
    RollTableClass: configuredDocumentClass(globalThis.RollTable),
    textResultType: globalThis.CONST?.TABLE_RESULT_TYPES?.TEXT ?? "text",
  };
}

function sourceFolderName(bookId) {
  const book = Object.values(SOURCE_BOOKS).find(candidate => candidate.id === bookId);
  return book?.title ?? bookId;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  try {
    return Array.from(collection);
  } catch {
    return [];
  }
}

function folderParentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

function findFolder(game, name, parentId = null) {
  return collectionValues(game?.folders).find(folder => (
    folder?.type === "RollTable"
    && folder?.name === name
    && folderParentId(folder) === parentId
  )) ?? null;
}

async function ensureRollTableFolder(name, parentId = null, runtime = runtimeDefaults()) {
  const existing = findFolder(runtime.game, name, parentId);
  if (existing) return existing;
  if (!runtime.FolderClass?.create) throw new Error("Foundry Folder creation is unavailable.");
  return runtime.FolderClass.create({
    name,
    type: "RollTable",
    folder: parentId,
  });
}

function sourceTableMetadata(table) {
  return {
    schema: 1,
    bookId: table.bookId,
    bookTitle: table.bookTitle,
    key: table.key,
    pages: [...(table.pages ?? [])],
    formulaRaw: table.formulaRaw,
    formula: table.formula,
    columns: [...(table.columns ?? [])],
    sourceKind: table.sourceKind,
    warnings: [...(table.warnings ?? [])],
  };
}

function sourceTableFlag(document) {
  try {
    const fromMethod = document?.getFlag?.(MODULE_ID, SOURCE_TABLE_FLAG);
    if (fromMethod) return fromMethod;
  } catch {
    // Fall through to raw flags for tests and partially hydrated documents.
  }
  return document?.flags?.[MODULE_ID]?.[SOURCE_TABLE_FLAG] ?? null;
}

function findExistingSourceTable(game, key) {
  return collectionValues(game?.tables).find(table => sourceTableFlag(table)?.key === key) ?? null;
}

function buildTableDescription(table) {
  const pages = table.pages?.length ? table.pages.join(", ") : "unknown";
  const warnings = table.warnings?.length
    ? `<h3>Import Warnings</h3><ul>${table.warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  return [
    `<p><strong>Imported from an owned source file.</strong></p>`,
    `<p>Source: ${escapeHtml(table.bookTitle)}<br>PDF page(s): ${escapeHtml(pages)}<br>Source formula: <code>${escapeHtml(table.formulaRaw)}</code></p>`,
    `<p>Original columns: ${escapeHtml((table.columns ?? []).join(" | "))}</p>`,
    warnings,
  ].join("");
}

function buildTableResultData(table, textResultType = "text") {
  return (table.results ?? []).map(result => ({
    type: textResultType,
    text: String(result.text ?? ""),
    range: [Number(result.low), Number(result.high)],
    weight: Math.max(1, Number(result.high) - Number(result.low) + 1),
    drawn: false,
    flags: {
      [MODULE_ID]: {
        sourceRange: result.raw,
      },
    },
  }));
}

function buildRollTableData(table, folderId = null) {
  return {
    name: table.name,
    formula: table.formula,
    description: buildTableDescription(table),
    replacement: true,
    displayRoll: true,
    folder: folderId,
    flags: {
      [MODULE_ID]: {
        [SOURCE_TABLE_FLAG]: sourceTableMetadata(table),
      },
    },
  };
}

async function replaceTableResults(document, table, runtime = runtimeDefaults()) {
  const ids = collectionValues(document?.results)
    .map(result => result?.id ?? result?._id)
    .filter(Boolean);
  if (ids.length && document?.deleteEmbeddedDocuments) {
    await document.deleteEmbeddedDocuments("TableResult", ids);
  }
  const results = buildTableResultData(table, runtime.textResultType);
  if (results.length && document?.createEmbeddedDocuments) {
    await document.createEmbeddedDocuments("TableResult", results);
  }
}

async function upsertSourceRollTable(table, folder, runtime = runtimeDefaults()) {
  if (!table?.importable) return { action: "skipped", table: null, source: table };
  const existing = findExistingSourceTable(runtime.game, table.key);
  const folderId = folder?.id ?? folder?._id ?? null;
  const data = buildRollTableData(table, folderId);

  if (existing) {
    if (!existing.update) throw new Error(`Cannot update RollTable ${existing.name ?? table.name}.`);
    await existing.update({
      name: data.name,
      formula: data.formula,
      description: data.description,
      replacement: data.replacement,
      displayRoll: data.displayRoll,
      folder: data.folder,
      [`flags.${MODULE_ID}.${SOURCE_TABLE_FLAG}`]: sourceTableMetadata(table),
    });
    await replaceTableResults(existing, table, runtime);
    return { action: "updated", table: existing, source: table };
  }

  if (!runtime.RollTableClass?.create) throw new Error("Foundry RollTable creation is unavailable.");
  const created = await runtime.RollTableClass.create(data);
  await replaceTableResults(created, table, runtime);
  return { action: "created", table: created, source: table };
}

async function importParsedSources(parsedSources, runtime = runtimeDefaults()) {
  if (!runtime.game?.user?.isGM) throw new Error("Only the GM can import source RollTables.");

  const root = await ensureRollTableFolder(ROOT_FOLDER_NAME, null, runtime);
  const report = {
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: [],
    documents: [],
  };

  for (const parsed of parsedSources ?? []) {
    if (!parsed?.book) {
      report.skipped += parsed?.tables?.length ?? 0;
      report.warnings.push(...(parsed?.warnings ?? []));
      continue;
    }
    const sourceFolder = await ensureRollTableFolder(
      sourceFolderName(parsed.book.id),
      root?.id ?? root?._id ?? null,
      runtime,
    );
    for (const table of parsed.tables ?? []) {
      const result = await upsertSourceRollTable(table, sourceFolder, runtime);
      report[result.action] += 1;
      if (result.table) report.documents.push(result.table);
      report.warnings.push(...(table.warnings ?? []).map(warning => `${table.name}: ${warning}`));
    }
  }
  return report;
}

async function readSourceFiles(files) {
  const parsedSources = [];
  const warnings = [];
  for (const file of files ?? []) {
    if (!file?.text) {
      warnings.push("A selected file could not be read.");
      continue;
    }
    const text = await file.text();
    const parsed = parseSourceTables(text, { filename: file.name ?? "" });
    parsed.filename = file.name ?? "";
    parsedSources.push(parsed);
    warnings.push(...parsed.warnings);
  }
  return { parsedSources, warnings };
}

function filePickerContent() {
  return `
    <form class="mk-source-table-importer">
      <p>Select your own Markdown transcriptions. MK-Shadowdark reads the table text locally and does not bundle sourcebook content.</p>
      <div class="form-group">
        <label>Source Markdown</label>
        <input type="file" name="sourceFiles" accept=".md,text/markdown,text/plain" multiple>
      </div>
      <p class="hint">Supported: Shadowdark RPG Core v4.9 and Player's Guide to the Western Reaches V1.</p>
    </form>
  `;
}

function previewContent(parsedSources) {
  const sources = (parsedSources ?? []).map(parsed => {
    if (!parsed.book) {
      return `<li><strong>${escapeHtml(parsed.filename || "Unknown file")}</strong>: unsupported source.</li>`;
    }
    const importable = parsed.tables.filter(table => table.importable).length;
    const skipped = parsed.tables.length - importable;
    return `<li><strong>${escapeHtml(parsed.book.title)}</strong>: ${importable} RollTables${skipped ? `, ${skipped} skipped` : ""}, ${parsed.warnings.length} warning(s).</li>`;
  }).join("");

  const warnings = (parsedSources ?? [])
    .flatMap(parsed => parsed.warnings ?? [])
    .slice(0, 40);
  const warningHtml = warnings.length
    ? `<details><summary>Warnings (${(parsedSources ?? []).reduce((sum, parsed) => sum + (parsed.warnings?.length ?? 0), 0)})</summary><ul>${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>${warnings.length >= 40 ? "<p>Only the first 40 warnings are shown here.</p>" : ""}</details>`
    : "<p>No parser warnings.</p>";

  return `
    <div class="mk-source-table-import-preview">
      <p>The importer will create or update native Foundry RollTables. Existing imported tables keep their RollTable IDs.</p>
      <ul>${sources}</ul>
      ${warningHtml}
    </div>
  `;
}

async function chooseSourceFiles() {
  const DialogClass = globalThis.Dialog;
  if (!DialogClass?.wait) throw new Error("Foundry Dialog is unavailable.");
  return DialogClass.wait({
    title: "Import Shadowdark Source Tables",
    content: filePickerContent(),
    buttons: {
      analyze: {
        icon: '<i class="fas fa-magnifying-glass"></i>',
        label: "Analyze",
        callback: html => {
          const root = dialogRoot(html);
          return Array.from(root?.querySelector?.('[name="sourceFiles"]')?.files ?? []);
        },
      },
      cancel: {
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "analyze",
    close: () => null,
  });
}

async function confirmImport(parsedSources) {
  const DialogClass = globalThis.Dialog;
  if (!DialogClass?.wait) return true;
  return DialogClass.wait({
    title: "Source Table Import Preview",
    content: previewContent(parsedSources),
    buttons: {
      import: {
        icon: '<i class="fas fa-file-import"></i>',
        label: "Import",
        callback: () => true,
      },
      cancel: {
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => false,
      },
    },
    default: "import",
    close: () => false,
  });
}

async function openSourceTableImporter() {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can import Shadowdark source tables.");
    return null;
  }

  const files = await chooseSourceFiles();
  if (!files?.length) return null;
  const { parsedSources } = await readSourceFiles(files);
  const totalTables = parsedSources.reduce((sum, parsed) => (
    sum + parsed.tables.filter(table => table.importable).length
  ), 0);
  if (!totalTables) {
    globalThis.ui?.notifications?.warn?.("No supported dice-driven tables were detected.");
    return { parsedSources, report: null };
  }

  const confirmed = await confirmImport(parsedSources);
  if (!confirmed) return { parsedSources, report: null };

  const report = await importParsedSources(parsedSources);
  globalThis.ui?.notifications?.info?.(
    `Source tables imported: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped.`
  );
  return { parsedSources, report };
}

function exposeSourceTableApi() {
  const mod = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!mod) return null;
  mod.api = mod.api ?? {};
  mod.api.sourceTables = {
    parseSource: parseSourceTables,
    readFiles: readSourceFiles,
    importParsedSources,
    openImporter: openSourceTableImporter,
  };
  return mod.api.sourceTables;
}

function registerSourceTableImporter() {
  globalThis.Hooks?.once?.("ready", exposeSourceTableApi);
}

registerSourceTableImporter();

export {
  MODULE_ID,
  ROOT_FOLDER_NAME,
  SOURCE_TABLE_FLAG,
  escapeHtml,
  configuredDocumentClass,
  sourceFolderName,
  sourceTableMetadata,
  sourceTableFlag,
  findExistingSourceTable,
  buildTableDescription,
  buildTableResultData,
  buildRollTableData,
  ensureRollTableFolder,
  replaceTableResults,
  upsertSourceRollTable,
  importParsedSources,
  readSourceFiles,
  filePickerContent,
  previewContent,
  chooseSourceFiles,
  confirmImport,
  openSourceTableImporter,
  exposeSourceTableApi,
  registerSourceTableImporter,
};
