import {
  parseSourceTables,
  parseWesternMarkdownTables,
} from "./parser.js";

const CURSED_SCROLL_4_BOOK = Object.freeze({
  id: "cursed-scroll-4-river-of-night-v1-2",
  title: "Cursed Scroll 4: River of Night V1-2",
  shortTitle: "Cursed Scroll 4",
  kind: "markdown",
});

const WESTERN_BOOK_ID = "western-reaches-player-guide-v1";

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

function parseSupportedSourceTables(text, { filename = "" } = {}) {
  if (!isCursedScroll4Source(text, filename)) {
    return parseSourceTables(text, { filename });
  }

  const tables = parseCursedScroll4Tables(text);
  const warnings = tables.flatMap(table => (
    (table.warnings ?? []).map(warning => `${table.name}: ${warning}`)
  ));
  return {
    book: CURSED_SCROLL_4_BOOK,
    tables,
    warnings,
  };
}

export {
  CURSED_SCROLL_4_BOOK,
  isCursedScroll4Source,
  remapCursedScrollTable,
  parseCursedScroll4Tables,
  parseSupportedSourceTables,
};