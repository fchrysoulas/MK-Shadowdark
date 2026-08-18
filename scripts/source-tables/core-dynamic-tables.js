const CORE_BOOK_ID = "shadowdark-core-v4.9";
const CORE_BOOK_TITLE = "Shadowdark RPG Core Rulebook v4.9";
const DYNAMIC_DRINKS_KEY = `${CORE_BOOK_ID}:taverns-drinks:d-star`;
const DYNAMIC_DRINKS_WARNING = "Source formula d* is context-dependent. The native RollTable uses 1d12 only as a browsing default; consumers must supply the contextual roll formula.";

const PAGE_MARKER_RE = /<!--\s*PDF(?:\s+Page|\s+page)\s+(\d+)\s*-->/g;
const DRINKS_HEADING_RE = /^#{1,6}\s+DRINKS\s*$/i;
const DYNAMIC_HEADER_RE = /^d\*\s+Details\s*$/i;
const RESULT_ROW_RE = /^\s*(\d{1,3})\s+(.+?)\s*$/;
const HEADING_RE = /^#{1,6}\s+/;

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sourcePages(text) {
  const source = String(text ?? "");
  const matches = [...source.matchAll(PAGE_MARKER_RE)];
  if (!matches.length) return [{ page: null, text: source }];
  return matches.map((match, index) => ({
    page: Number(match[1]),
    text: source.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : source.length,
    ),
  }));
}

function dynamicDrinkRows(lines, startIndex) {
  const results = [];
  let current = null;

  for (let index = startIndex; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed === "---" || /^<a\b/i.test(trimmed) || /^>\s*\*\*Layout note:/i.test(trimmed)) break;
    if (HEADING_RE.test(trimmed)) break;

    const match = RESULT_ROW_RE.exec(raw);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isInteger(value) || value < 1 || value > 12) break;
      if (current) results.push(current);
      current = {
        raw: String(value),
        low: value,
        high: value,
        open: false,
        text: clean(match[2]),
      };
      if (value === 12) {
        results.push(current);
        current = null;
        break;
      }
      continue;
    }

    if (current) current.text = clean(`${current.text} ${trimmed}`);
  }

  if (current) results.push(current);
  return results;
}

function parseCoreDynamicDrinks(text, { bookTitle = CORE_BOOK_TITLE } = {}) {
  for (const page of sourcePages(text)) {
    const lines = page.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!DRINKS_HEADING_RE.test(lines[index].trim())) continue;
      let headerIndex = index + 1;
      while (headerIndex < lines.length && !lines[headerIndex].trim()) headerIndex += 1;
      if (!DYNAMIC_HEADER_RE.test(lines[headerIndex]?.trim() ?? "")) continue;

      const results = dynamicDrinkRows(lines, headerIndex + 1);
      if (!results.length) return null;
      const warnings = [DYNAMIC_DRINKS_WARNING];
      if (results.length !== 12 || results.some((result, resultIndex) => result.low !== resultIndex + 1)) {
        warnings.push("Dynamic Drinks rows were incomplete or non-contiguous; preserved without correction.");
      }

      return {
        bookId: CORE_BOOK_ID,
        bookTitle,
        sourceKind: "core-dynamic",
        page: Number.isFinite(page.page) ? page.page : null,
        pages: Number.isFinite(page.page) ? [page.page] : [],
        context: ["Game Master", "Taverns", "DRINKS"],
        title: "DRINKS",
        name: "Game Master — Taverns — DRINKS",
        formulaRaw: "d*",
        formula: "1d12",
        columns: ["d*", "Details"],
        results,
        warnings,
        importable: true,
        key: DYNAMIC_DRINKS_KEY,
      };
    }
  }
  return null;
}

function mergeCoreDynamicTables(tables = [], text, options = {}) {
  const merged = [...tables];
  const drinks = parseCoreDynamicDrinks(text, options);
  if (drinks && !merged.some(table => table?.key === drinks.key)) merged.push(drinks);
  return merged;
}

export {
  CORE_BOOK_ID,
  CORE_BOOK_TITLE,
  DYNAMIC_DRINKS_KEY,
  DYNAMIC_DRINKS_WARNING,
  sourcePages,
  dynamicDrinkRows,
  parseCoreDynamicDrinks,
  mergeCoreDynamicTables,
};