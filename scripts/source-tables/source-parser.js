import {
  parseSourceTables,
  parseWesternMarkdownTables,
} from "./parser.js";
import { structureCoreDenseTables } from "./core-structured-tables.js";
import { mergeCoreDynamicTables } from "./core-dynamic-tables.js";

const CURSED_SCROLL_BOOKS = Object.freeze({
  1: Object.freeze({
    id: "cursed-scroll-1-diablerie",
    title: "Cursed Scroll 1: Diablerie!",
    shortTitle: "Cursed Scroll 1",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-1", "cursed scroll 1", "diablerie"],
  }),
  2: Object.freeze({
    id: "cursed-scroll-2-red-sands",
    title: "Cursed Scroll 2: Red Sands",
    shortTitle: "Cursed Scroll 2",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-2", "cursed scroll 2", "red sands"],
  }),
  3: Object.freeze({
    id: "cursed-scroll-3-midnight-sun",
    title: "Cursed Scroll 3: Midnight Sun",
    shortTitle: "Cursed Scroll 3",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-3", "cursed scroll 3", "midnight sun"],
  }),
  4: Object.freeze({
    id: "cursed-scroll-4-river-of-night-v1-2",
    title: "Cursed Scroll 4: River of Night V1-2",
    shortTitle: "Cursed Scroll 4",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-4", "cursed scroll 4", "river of night"],
  }),
  5: Object.freeze({
    id: "cursed-scroll-5-dwellers-in-the-deep-v1-3",
    title: "Cursed Scroll 5: Dwellers in the Deep V1-3",
    shortTitle: "Cursed Scroll 5",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-5", "cursed scroll 5", "dwellers in the deep", "morzomotha"],
  }),
  6: Object.freeze({
    id: "cursed-scroll-6-city-of-masks-v1-1",
    title: "Cursed Scroll 6: City of Masks V1-1",
    shortTitle: "Cursed Scroll 6",
    kind: "markdown",
    markers: ["shadowdark-cursed-scroll-6", "cursed scroll 6", "city of masks"],
  }),
});

const CURSED_SCROLL_4_BOOK = CURSED_SCROLL_BOOKS[4];
const WESTERN_BOOK_ID = "western-reaches-player-guide-v1";
const CORE_BOOK_ID = "shadowdark-core-v4.9";

function cleanText(value) {
  return String(value ?? "").trim();
}

function cursedScrollSample(text, filename = "") {
  return `${filename}\n${String(text ?? "").slice(0, 8000)}`.toLowerCase();
}

function detectCursedScrollBook(text, filename = "") {
  const sample = cursedScrollSample(text, filename);
  for (const book of Object.values(CURSED_SCROLL_BOOKS)) {
    if (book.markers.some(marker => sample.includes(marker))) return book;
  }
  return null;
}

function isCursedScroll4Source(text, filename = "") {
  return detectCursedScrollBook(text, filename)?.id === CURSED_SCROLL_4_BOOK.id;
}

function remapCursedScrollTable(table, book = CURSED_SCROLL_4_BOOK) {
  const oldPrefix = `${WESTERN_BOOK_ID}:`;
  const key = cleanText(table?.key);
  const suffix = key.startsWith(oldPrefix) ? key.slice(oldPrefix.length) : key || "table";
  return {
    ...table,
    bookId: book.id,
    bookTitle: book.title,
    key: `${book.id}:${suffix}`,
  };
}

function parseCursedScrollTables(text, book) {
  if (!book) return [];
  return parseWesternMarkdownTables(text).map(table => remapCursedScrollTable(table, book));
}

function parseCursedScroll4Tables(text) {
  return parseCursedScrollTables(text, CURSED_SCROLL_4_BOOK);
}

function rebuildWarnings(tables = []) {
  return tables.flatMap(table => (
    (table.warnings ?? []).map(warning => `${table.name}: ${warning}`)
  ));
}

function parseSupportedSourceTables(text, { filename = "" } = {}) {
  const cursedScrollBook = detectCursedScrollBook(text, filename);
  if (cursedScrollBook) {
    const tables = parseCursedScrollTables(text, cursedScrollBook);
    return {
      book: cursedScrollBook,
      tables,
      warnings: rebuildWarnings(tables),
    };
  }

  const parsed = parseSourceTables(text, { filename });
  if (parsed.book?.id !== CORE_BOOK_ID) return parsed;
  const structured = structureCoreDenseTables(parsed.tables);
  const tables = mergeCoreDynamicTables(structured, text, {
    bookTitle: parsed.book?.title,
  });
  return {
    ...parsed,
    tables,
    warnings: rebuildWarnings(tables),
  };
}

export {
  CURSED_SCROLL_BOOKS,
  CURSED_SCROLL_4_BOOK,
  detectCursedScrollBook,
  isCursedScroll4Source,
  remapCursedScrollTable,
  parseCursedScrollTables,
  parseCursedScroll4Tables,
  rebuildWarnings,
  parseSupportedSourceTables,
};
