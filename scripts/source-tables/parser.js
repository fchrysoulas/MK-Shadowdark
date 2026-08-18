const SOURCE_BOOKS = Object.freeze({
  core: Object.freeze({
    id: "shadowdark-core-v4.9",
    title: "Shadowdark RPG Core Rulebook v4.9",
    shortTitle: "Core v4.9",
    kind: "core",
  }),
  western: Object.freeze({
    id: "western-reaches-player-guide-v1",
    title: "Player's Guide to the Western Reaches V1",
    shortTitle: "Western Reaches",
    kind: "western",
  }),
});

const PAGE_MARKER_RE = /<!--\s*PDF(?:\s+Page|\s+page)\s+(\d+)\s*-->/g;
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const DICE_HEADER_RE = /^\s*((?:\d*d\d+)(?:\s*,\s*(?:\d*d\d+))?(?:\s*\+\s*[A-Za-z][A-Za-z0-9 ]*?)?)\s+(.+?)\s*$/i;
const RANGE_TOKEN_RE = /^\s*(\d{1,3}|00)(?:\s*[-–—]\s*(\d{1,3}|00))?(\+)?\s*$/;
const RANGE_ROW_RE = /^\s*((?:\d{1,3}|00)(?:\s*[-–—]\s*(?:\d{1,3}|00))?|\d{1,3}\+)\s+(.+?)\s*$/;
const MARKDOWN_SEPARATOR_CELL_RE = /^:?-{3,}:?$/;
const DICE_COLUMN_HEADER_RE = /^\s*(?:\d*d\d+)(?:\s*,\s*(?:\d*d\d+))?(?:\s*\+\s*[A-Za-z][A-Za-z0-9 ]*)?\s*$/i;
const MAX_OPEN_RANGE = 999;

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHeading(value) {
  return cleanText(value).replace(/[*_`]/g, "");
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[\s_.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "table";
}

function splitPdfPages(text) {
  const source = String(text ?? "");
  const matches = [...source.matchAll(PAGE_MARKER_RE)];
  if (!matches.length) return [{ page: null, text: source, start: 0 }];
  return matches.map((match, index) => ({
    page: Number(match[1]),
    start: match.index ?? 0,
    text: source.slice(
      (match.index ?? 0) + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : source.length,
    ),
  }));
}

function detectSourceBook(text, filename = "") {
  const sample = `${filename}\n${String(text ?? "").slice(0, 5000)}`.toLowerCase();
  if (
    sample.includes("player's guide to the western reaches")
    || sample.includes("players-guide-to-the-western-reaches")
    || sample.includes("western reaches v1")
  ) return SOURCE_BOOKS.western;
  if (
    sample.includes("sourcebook transcription: shadowdark rpg v4-9")
    || sample.includes("shadowdark-core-rules-v4-9")
    || sample.includes("# shadowdark rpg")
  ) return SOURCE_BOOKS.core;
  return null;
}

function parseDiceFormula(rawFormula) {
  const raw = cleanText(rawFormula);
  const dice = [...raw.matchAll(/(\d*)d(\d+)/gi)].map(match => ({
    count: Number(match[1] || 1),
    sides: Number(match[2]),
  }));
  if (!dice.length) return null;
  const compound = dice.length > 1 || raw.includes(",");
  const primary = dice[0];
  const min = primary.count;
  const max = primary.count * primary.sides;
  const dynamicModifier = /\+\s*[A-Za-z]/i.test(raw);
  return {
    raw,
    formula: `${primary.count}d${primary.sides}`,
    dice,
    compound,
    dynamicModifier,
    min,
    max,
    percentile: primary.count === 1 && primary.sides === 100,
  };
}

function normalizeRangeNumber(token, { percentile = false } = {}) {
  const value = cleanText(token);
  if (percentile && value === "00") return 100;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseRangeToken(token, formulaInfo = null) {
  const match = RANGE_TOKEN_RE.exec(cleanText(token));
  if (!match) return null;
  const percentile = Boolean(formulaInfo?.percentile);
  const low = normalizeRangeNumber(match[1], { percentile });
  if (!Number.isFinite(low)) return null;
  if (match[3]) {
    const formulaMax = Number(formulaInfo?.max);
    return {
      low,
      high: Number.isFinite(formulaMax) && formulaMax >= low ? formulaMax : MAX_OPEN_RANGE,
      open: true,
      raw: cleanText(token),
    };
  }
  const high = match[2] === undefined
    ? low
    : normalizeRangeNumber(match[2], { percentile });
  if (!Number.isFinite(high)) return null;
  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
    open: false,
    raw: cleanText(token),
  };
}

function resultTextFromCells(headers, cells, startIndex, endIndex) {
  const values = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const value = cleanText(cells[index]);
    if (!value) continue;
    const header = cleanText(headers[index]);
    if (endIndex - startIndex === 1 || !header) values.push(value);
    else values.push(`${header}: ${value}`);
  }
  return values.join(" | ");
}

function splitMarkdownRow(line) {
  let value = String(line ?? "").trim();
  if (!value.startsWith("|")) return [];
  value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map(cell => cleanText(cell));
}

function isMarkdownSeparatorRow(cells) {
  return cells.length > 0 && cells.every(cell => MARKDOWN_SEPARATOR_CELL_RE.test(cleanText(cell)));
}

function meaningfulHeading(text) {
  return !/^PDF Page \d+$/i.test(cleanText(text));
}

function updateHeadingStack(stack, line) {
  const match = HEADING_RE.exec(String(line ?? "").trim());
  if (!match || !meaningfulHeading(match[2])) return false;
  const level = match[1].length;
  for (const key of [...stack.keys()]) {
    if (key >= level) stack.delete(key);
  }
  stack.set(level, cleanHeading(match[2]));
  return true;
}

function headingContext(stack) {
  return [...stack.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, value]) => value)
    .filter(Boolean);
}

function usefulBreadcrumb(context) {
  const filtered = context.filter(value => (
    !/^Contents(?:\s+\(continued\))?$/i.test(value)
    && !/^Overview$/i.test(value)
  ));
  return filtered.slice(-3);
}

function tableNameFromContext(context, fallback = "Roll Table") {
  const parts = usefulBreadcrumb(context);
  return parts.length ? parts.join(" — ") : fallback;
}

function tableTitleFromContext(context, fallback = "Roll Table") {
  const parts = usefulBreadcrumb(context);
  return parts.at(-1) || fallback;
}

function makePart({
  book,
  page,
  context,
  title,
  formulaRaw,
  columns,
  results,
  warnings = [],
  kind,
}) {
  const formula = parseDiceFormula(formulaRaw);
  return {
    bookId: book.id,
    bookTitle: book.title,
    sourceKind: kind,
    page,
    pages: page === null ? [] : [page],
    context: [...context],
    title: cleanText(title),
    name: tableNameFromContext([...context.slice(0, -1), title], title),
    formulaRaw: cleanText(formulaRaw),
    formula: formula?.formula ?? "",
    formulaInfo: formula,
    columns: columns.map(cleanText),
    results,
    warnings: [...warnings],
  };
}

function diceColumnIndices(headers) {
  const indices = [];
  headers.forEach((header, index) => {
    if (DICE_COLUMN_HEADER_RE.test(cleanText(header)) && parseDiceFormula(header)) indices.push(index);
  });
  return indices;
}

function parseMarkdownDataRows(headers, dataRows, formulaRaw, warnings = []) {
  const diceColumns = diceColumnIndices(headers);
  if (!diceColumns.length) return [];
  if (diceColumns.length > 1) {
    const signatures = diceColumns.map(index => parseDiceFormula(headers[index])?.formula);
    if (new Set(signatures).size > 1) {
      warnings.push("Multiple dice columns use different formulas; result groups were preserved but need GM review.");
    }
  }
  const primaryFormula = parseDiceFormula(formulaRaw);
  const results = [];
  for (const cells of dataRows) {
    const parsedRanges = diceColumns.map(columnIndex => parseRangeToken(cells[columnIndex], primaryFormula));
    if (!parsedRanges.some(Boolean)) break;
    for (let diceIndex = 0; diceIndex < diceColumns.length; diceIndex += 1) {
      const columnIndex = diceColumns[diceIndex];
      const range = parsedRanges[diceIndex];
      if (!range) continue;
      const nextDiceColumn = diceColumns[diceIndex + 1] ?? headers.length;
      const text = resultTextFromCells(headers, cells, columnIndex + 1, nextDiceColumn);
      if (!text) {
        warnings.push(`Range ${range.raw} has no result text.`);
        continue;
      }
      results.push({ ...range, text });
    }
  }
  return results;
}

function parseWesternMarkdownTables(text) {
  const book = SOURCE_BOOKS.western;
  const pages = splitPdfPages(text);
  const stack = new Map();
  const parts = [];
  let priorPart = null;

  for (const page of pages) {
    const lines = page.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (updateHeadingStack(stack, line)) continue;
      if (!line.trim().startsWith("|")) continue;
      if (index + 1 >= lines.length) continue;

      const headers = splitMarkdownRow(line);
      const separators = splitMarkdownRow(lines[index + 1]);
      if (!headers.length || !isMarkdownSeparatorRow(separators)) continue;

      const dataRows = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].trim().startsWith("|")) {
        dataRows.push(splitMarkdownRow(lines[cursor]));
        cursor += 1;
      }
      index = Math.max(index, cursor - 1);

      const context = headingContext(stack);
      const diceColumns = diceColumnIndices(headers);
      if (diceColumns.length) {
        const formulaRaw = headers[diceColumns[0]];
        const warnings = [];
        const results = parseMarkdownDataRows(headers, dataRows, formulaRaw, warnings);
        const title = tableTitleFromContext(context);
        const part = makePart({
          book,
          page: page.page,
          context,
          title,
          formulaRaw,
          columns: headers,
          results,
          warnings,
          kind: "markdown",
        });
        parts.push(part);
        priorPart = part;
        continue;
      }

      // Layout conversions can split a wide two-pair table and accidentally
      // promote the first continuation data row to a Markdown header.
      const headerLooksLikeData = headers.length >= 2 && parseRangeToken(headers[0], priorPart?.formulaInfo);
      const sameContext = priorPart && tableTitleFromContext(context) === priorPart.title;
      if (headerLooksLikeData && sameContext) {
        const continuationRows = [headers, ...dataRows];
        const warnings = ["Recovered a malformed Markdown continuation whose first data row was promoted to a header."];
        const recovered = parseMarkdownDataRows(
          priorPart.columns,
          continuationRows,
          priorPart.formulaRaw,
          warnings,
        );
        priorPart.results.push(...recovered);
        priorPart.pages.push(page.page);
        priorPart.warnings.push(...warnings);
      }
    }
  }

  return finalizeTables(parts).filter(table => table.results.length > 0);
}

function findFirstDenseRangeRow(lines, startIndex, formulaInfo, scanLimit = 18) {
  for (let index = startIndex; index < Math.min(lines.length, startIndex + scanLimit); index += 1) {
    const match = RANGE_ROW_RE.exec(lines[index]);
    if (!match) continue;
    if (parseRangeToken(match[1], formulaInfo)) return index;
  }
  return -1;
}

function denseRowsFrom(lines, firstRowIndex, formulaInfo) {
  const rows = [];
  let current = null;
  for (let index = firstRowIndex; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (index > firstRowIndex && (HEADING_RE.test(trimmed) || DICE_HEADER_RE.test(trimmed) || trimmed === "---" || /^<a\b/i.test(trimmed))) {
      break;
    }
    const match = RANGE_ROW_RE.exec(raw);
    if (match) {
      const range = parseRangeToken(match[1], formulaInfo);
      if (!range) break;
      if (current) rows.push(current);
      current = { ...range, text: cleanText(match[2]) };
      if (range.open || (!formulaInfo?.dynamicModifier && !formulaInfo?.compound && range.high >= formulaInfo.max)) {
        rows.push(current);
        current = null;
        break;
      }
      continue;
    }
    if (current) {
      // Preserve wrapped layout text without trying to reconstruct columns.
      current.text = cleanText(`${current.text} ${trimmed}`);
    }
  }
  if (current) rows.push(current);
  return rows;
}

function recoverInterleavedCoreCarousing(lines, headerIndex, formulaInfo) {
  const block = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed === "---" || /^<a\b/i.test(trimmed)) break;
    if (!trimmed || HEADING_RE.test(trimmed)) continue;
    block.push(trimmed);
  }

  const rows = new Map();
  const standaloneRanges = [];
  const orphanText = [];
  const benefits = [];

  for (const line of block) {
    if (/^Gain\b/i.test(line)) {
      benefits.push(cleanText(line));
      continue;
    }
    const rowMatch = RANGE_ROW_RE.exec(line);
    if (rowMatch) {
      const range = parseRangeToken(rowMatch[1], formulaInfo);
      if (!range) continue;
      let outcome = cleanText(rowMatch[2]);
      let benefit = "";
      const benefitMatch = outcome.match(/^(.*?)\s+(Gain\b.+)$/i);
      if (benefitMatch) {
        outcome = cleanText(benefitMatch[1]);
        benefit = cleanText(benefitMatch[2]);
      }
      rows.set(range.low, { ...range, outcome, benefit });
      continue;
    }
    const standalone = parseRangeToken(line, formulaInfo);
    if (standalone) {
      standaloneRanges.push(standalone);
      continue;
    }
    orphanText.push(cleanText(line));
  }

  // The layout-preserving Core transcription can separate a row number from
  // its outcome. Reattach only when the orphan/standalone structure is unambiguous.
  for (const range of standaloneRanges) {
    if (rows.has(range.low)) continue;
    let outcome = "";
    if (range.low === 2 && orphanText.length) outcome = orphanText.shift();
    else if (range.open && orphanText.length) outcome = orphanText.pop();
    if (outcome) rows.set(range.low, { ...range, outcome, benefit: "" });
  }

  const ordered = [...rows.values()].sort((left, right) => left.low - right.low);
  let benefitIndex = 0;
  for (const row of ordered) {
    if (!row.benefit) row.benefit = benefits[benefitIndex++] ?? "";
  }
  if (ordered.length < 8 || ordered.some(row => !row.outcome)) return null;
  return ordered.map(row => ({
    low: row.low,
    high: row.high,
    open: row.open,
    raw: row.raw,
    text: [row.outcome, row.benefit].filter(Boolean).join(" | "),
  }));
}

function parseCoreDenseTables(text) {
  const book = SOURCE_BOOKS.core;
  const pages = splitPdfPages(text);
  const stack = new Map();
  const parts = [];

  for (const page of pages) {
    if (Number.isFinite(page.page) && page.page >= 330) continue; // quick-reference duplicates
    const lines = page.text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (updateHeadingStack(stack, line)) continue;
      const header = DICE_HEADER_RE.exec(line.trim());
      if (!header) continue;

      const formulaRaw = header[1];
      const formulaInfo = parseDiceFormula(formulaRaw);
      if (!formulaInfo) continue;
      const firstRowIndex = findFirstDenseRangeRow(lines, index + 1, formulaInfo);
      if (firstRowIndex < 0) continue;

      const interstitialHeadings = [];
      for (let cursor = index + 1; cursor < firstRowIndex; cursor += 1) {
        const heading = HEADING_RE.exec(lines[cursor].trim());
        if (heading && meaningfulHeading(heading[2])) {
          interstitialHeadings.push(cleanHeading(heading[2]));
        }
      }

      const context = headingContext(stack);
      const title = interstitialHeadings.at(-1) || tableTitleFromContext(context);
      let rows = denseRowsFrom(lines, firstRowIndex, formulaInfo);
      const warnings = [];
      if (title.toUpperCase() === "CAROUSING OUTCOME" && rows.length < 8) {
        const recovered = recoverInterleavedCoreCarousing(lines, index, formulaInfo);
        if (recovered) {
          rows = recovered;
          warnings.push("Recovered an interleaved multi-column table from the layout-preserving source transcription.");
        }
      }
      if (!rows.length) continue;
      if (formulaInfo.compound) {
        warnings.push(`Compound source formula "${formulaRaw}" was imported using ${formulaInfo.formula}; each result preserves the remaining roll options for manual resolution.`);
      }
      if (formulaInfo.dynamicModifier) {
        warnings.push(`Source formula "${formulaRaw}" contains a contextual modifier; Foundry rolls ${formulaInfo.formula} and the modifier must be applied by the GM.`);
      }

      parts.push(makePart({
        book,
        page: page.page,
        context,
        title,
        formulaRaw,
        columns: [formulaRaw, header[2]],
        results: rows,
        warnings,
        kind: "dense",
      }));
    }
  }

  return finalizeTables(parts);
}

function rangesOverlap(left, right) {
  return left.low <= right.high && right.low <= left.high;
}

function validateTable(table) {
  const warnings = [...table.warnings];
  const sorted = [...table.results].sort((left, right) => left.low - right.low || left.high - right.high);
  for (let index = 1; index < sorted.length; index += 1) {
    if (rangesOverlap(sorted[index - 1], sorted[index])) {
      warnings.push(`Overlapping source ranges ${sorted[index - 1].raw} and ${sorted[index].raw}; preserved without correction.`);
    }
  }
  if (!table.formulaInfo?.dynamicModifier && !table.formulaInfo?.compound && sorted.length) {
    const min = table.formulaInfo.min;
    const max = table.formulaInfo.max;
    if (sorted[0].low > min) warnings.push(`Source ranges begin at ${sorted[0].low}, above ${table.formula} minimum ${min}.`);
    if (sorted.at(-1).high < max) warnings.push(`Source ranges end at ${sorted.at(-1).high}, below ${table.formula} maximum ${max}.`);
    for (let index = 1; index < sorted.length; index += 1) {
      const prior = sorted[index - 1];
      const current = sorted[index];
      if (prior.high + 1 < current.low && prior.high < max && current.low > min) {
        warnings.push(`Gap in source ranges between ${prior.raw} and ${current.raw}.`);
      }
    }
  }
  return [...new Set(warnings)];
}

function logicalSignature(part) {
  const context = usefulBreadcrumb(part.context);
  const path = [...context.slice(0, -1), part.title].join("|");
  return `${part.bookId}|${slugify(path)}|${slugify(part.formulaRaw)}|${slugify(part.columns.join("|"))}`;
}

function finalizeTables(parts) {
  const grouped = new Map();
  const order = [];
  for (const part of parts) {
    const signature = logicalSignature(part);
    const existing = grouped.get(signature);
    if (!existing) {
      const table = {
        ...part,
        results: [...part.results],
        pages: [...new Set(part.pages.filter(Number.isFinite))],
        warnings: [...part.warnings],
        importable: part.importable !== false,
      };
      grouped.set(signature, table);
      order.push(signature);
      continue;
    }
    existing.results.push(...part.results);
    existing.pages.push(...part.pages.filter(Number.isFinite));
    existing.pages = [...new Set(existing.pages)].sort((a, b) => a - b);
    existing.warnings.push(...part.warnings);
  }

  const keyCounts = new Map();
  return order.map(signature => {
    const table = grouped.get(signature);
    table.pages = [...new Set(table.pages)].sort((a, b) => a - b);
    table.page = table.pages[0] ?? null;
    table.warnings = validateTable(table);
    const baseKey = `${table.bookId}:${slugify([...usefulBreadcrumb(table.context).slice(0, -1), table.title].join("-"))}:${slugify(table.formulaRaw)}`;
    const occurrence = (keyCounts.get(baseKey) ?? 0) + 1;
    keyCounts.set(baseKey, occurrence);
    table.key = occurrence === 1 ? baseKey : `${baseKey}:${occurrence}`;
    table.importable = table.importable !== false && table.results.length > 0;
    delete table.formulaInfo;
    return table;
  });
}

function parseSourceTables(text, { filename = "" } = {}) {
  const book = detectSourceBook(text, filename);
  if (!book) {
    return {
      book: null,
      tables: [],
      warnings: ["Unsupported source. Expected Shadowdark Core v4.9 or Player's Guide to the Western Reaches V1 Markdown transcription."],
    };
  }
  const tables = book.kind === "western"
    ? parseWesternMarkdownTables(text)
    : parseCoreDenseTables(text);
  const warnings = tables.flatMap(table => table.warnings.map(warning => `${table.name}: ${warning}`));
  return { book, tables, warnings };
}

export {
  SOURCE_BOOKS,
  MAX_OPEN_RANGE,
  cleanText,
  slugify,
  splitPdfPages,
  detectSourceBook,
  parseDiceFormula,
  parseRangeToken,
  splitMarkdownRow,
  parseWesternMarkdownTables,
  parseCoreDenseTables,
  validateTable,
  parseSourceTables,
};
