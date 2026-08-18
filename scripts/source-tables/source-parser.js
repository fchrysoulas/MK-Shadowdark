import {
  parseSourceTables,
  parseWesternMarkdownTables,
} from "./parser.js";
import { structureCoreDenseTables } from "./core-structured-tables.js";

const CURSED_SCROLL_4_BOOK = Object.freeze({
  id: "cursed-scroll-4-river-of-night-v1-2",
  title: "Cursed Scroll 4: River of Night V1-2",
  shortTitle: "Cursed Scroll 4",
  kind: "markdown",
});

const WESTERN_BOOK_ID = "western-reaches-player-guide-v1";
const CORE_BOOK_ID = "shadowdark-core-v4.9";

function cleanText(value) {
  return String(value ?? "").trim();
}

function isCursedScroll4Source(text, filename = "") {
  const sample = `${filename}\n${String(text ?? "").slice(0, 6000)}`.toLowerCase();
  return (
    sample.includes("shadowdark-cursed-scroll-4")
    || sample.includes("cursed scroll 4")
    || sample.includes("river of night v1-2")
  );
}

function remapCursedScrollTable(table) {
  const oldPrefix = `${WESTERN_BOOK_ID}:`;
  const key = cleanText(table?.key);
  return {
    ...table,
    bookId: CURSED_SCROLL_4_BOOK.id,
    bookTitle: CURSED_SCROLL_4_BOOK.title,
    key: key.startsWith(oldPrefix)
      ? `${CURSED_SCROLL_4_BOOK.id}:${key.slice(oldPrefix.length)}`
      : `${CURSED_SCROLL_4_BOOK.id}:${key || "table"}`,
  };
}

function parseCursedScroll4Tables(text) {
  return parseWesternMarkdownTables(text).map(remapCursedScrollTable);
}

function rebuildWarnings(tables = []) {
  return tables.flatMap(table => (
    (table.warnings ?? []).map(warning => `${table.name}: ${warning}`)
  ));
}

function parseSupportedSourceTables(text, { filename = "" } = {}) {
  if (!isCursedScroll4Source(text, filename)) {
    const parsed = parseSourceTables(text, { filename });
    if (parsed.book?.id !== CORE_BOOK_ID) return parsed;
    const tables = structureCoreDenseTables(parsed.tables);
    return {
      ...parsed,
      tables,
      warnings: rebuildWarnings(tables),
    };
  }

  const tables = parseCursedScroll4Tables(text);
  return {
    book: CURSED_SCROLL_4_BOOK,
    tables,
    warnings: rebuildWarnings(tables),
  };
}

export {
  CURSED_SCROLL_4_BOOK,
  isCursedScroll4Source,
  remapCursedScrollTable,
  parseCursedScroll4Tables,
  rebuildWarnings,
  parseSupportedSourceTables,
};