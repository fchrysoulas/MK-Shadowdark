import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/quickdraw/quickdraw-icons.js";
let source = await readFile(path, "utf8");

function replaceExact(from, to, label) {
  if (!source.includes(from)) throw new Error(`Expected Quickdraw block not found: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
`  const STYLESHEET_ID = "mk-shadowdark-quickdraw-styles";\n  const STYLESHEET_PATH = \`modules/${"${MODULE_ID}"}/styles/quickdraw-icons.css\`;\n  const FLAG_KEY = "quickdraw";\n  const invalidLimitExpressionsWarned = new Set();\n\n  ensureStylesheet();\n\n  function ensureStylesheet() {\n    if (document.getElementById(STYLESHEET_ID)) return;\n\n    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))\n      .find(link => link.href.includes(\`/modules/${"${MODULE_ID}"}/styles/quickdraw-icons.css\`));\n    if (existing) {\n      existing.id = STYLESHEET_ID;\n      return;\n    }\n\n    const link = document.createElement("link");\n    link.id = STYLESHEET_ID;\n    link.rel = "stylesheet";\n    link.href = toFoundryRoute(STYLESHEET_PATH);\n    document.head.append(link);\n  }\n\n  function toFoundryRoute(path) {\n    const clean = String(path ?? "").replace(/^\\/+/, "");\n    try {\n      if (foundry.utils.getRoute) return foundry.utils.getRoute(clean);\n    } catch (_error) {\n      // Use the host-root fallback.\n    }\n    return \`/${"${clean}"}\`;\n  }\n`,
`  const FLAG_KEY = "quickdraw";\n  const invalidLimitExpressionsWarned = new Set();\n`,
"manifest-loaded stylesheet cleanup"
);

replaceExact(
`  function sortInventoryGroups(html, app) {\n    if (!isAutoSortEnabled()) return;\n\n    const rows = getInventoryRows(html);\n    if (!rows?.length) return;\n`,
`  function sortInventoryGroups(html, app, rows = getInventoryRows(html)) {\n    if (!isAutoSortEnabled()) return;\n    if (!rows?.length) return;\n`,
"shared inventory row collection for sorting"
);

replaceExact(
`    for (const [parent, entries] of groups.entries()) {\n      const parent$ = $(parent);\n      const sorted = entries.slice().sort(compareInventoryEntries);\n\n      for (const ent of sorted) parent$.append(ent.rowEl);\n    }\n`,
`    for (const [parent, entries] of groups.entries()) {\n      const sorted = entries.slice().sort(compareInventoryEntries);\n      const orderChanged = sorted.some((entry, index) => entry.rowEl !== entries[index]?.rowEl);\n      if (!orderChanged) continue;\n\n      const parent$ = $(parent);\n      for (const ent of sorted) parent$.append(ent.rowEl);\n    }\n`,
"avoid unnecessary sort DOM mutations"
);

replaceExact(
`  function injectQuickdrawToggles(app, html) {\n    const rows = getInventoryRows(html);\n    if (!rows?.length) return;\n`,
`  function injectQuickdrawToggles(app, html, rows = getInventoryRows(html)) {\n    if (!rows?.length) return;\n`,
"shared inventory row collection for injection"
);

replaceExact(
`    sortInventoryGroups(html, app);\n\n    dlog("quickdraw summary", {\n`,
`    dlog("quickdraw summary", {\n`,
"remove duplicate sort from injection"
);

replaceExact(
`  function refreshQuickdrawRowState(app, html) {\n    const rows = getInventoryRows(html);\n    if (!rows?.length) return;\n`,
`  function refreshQuickdrawRowState(app, rows) {\n    if (!rows?.length) return;\n`,
"shared inventory row collection for state refresh"
);

replaceExact(
`  function processSheet(app, html) {\n    applyHighlightScope(html);\n    refreshQuickdrawRowState(app, html);\n    if (isQuickdrawIconEnabled()) injectQuickdrawToggles(app, html);\n    else sortInventoryGroups(html, app);\n    renderQuickdrawSummaryCard(app, html);\n  }\n`,
`  function processSheet(app, html) {\n    const rows = getInventoryRows(html);\n\n    applyHighlightScope(html);\n    refreshQuickdrawRowState(app, rows);\n    if (isQuickdrawIconEnabled()) injectQuickdrawToggles(app, html, rows);\n    sortInventoryGroups(html, app, rows);\n    renderQuickdrawSummaryCard(app, html);\n  }\n`,
"one inventory scan per logical render"
);

await writeFile(path, source, "utf8");
console.log("Quickdraw render optimization applied.");
