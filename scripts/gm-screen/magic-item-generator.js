import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  parseLabeledResultText,
  rollImportedSourceTable,
  tableResultText,
} from "../source-tables/source-table-service.js";
import {
  getSceneMagicItemGeneratorTables,
  MAGIC_ITEM_GENERATOR_TABLE_KEYS,
  MAGIC_ITEM_GENERATOR_TABLE_LABELS,
  magicItemGeneratorTableStatus,
} from "./magic-item-generator-settings.js";
import { pinDocument } from "./pinned-documents.js";

const DEFAULT_MAGIC_ITEM_NAME = "Generated Magic Item";
const MAGIC_ITEM_DOCUMENT_TYPE = "Basic";

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
  if (html?.form?.querySelector) return html.form;
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function dialogName(html) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.('[name="name"]')?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.('[name="name"]')?.val?.() ?? "").trim();
}

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function normalizeLabel(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function magicItemResultValue(draw, label) {
  const text = tableResultText(draw?.result ?? draw?.results?.[0]);
  const fields = parseLabeledResultText(text);
  const wanted = normalizeLabel(label);
  const match = Object.entries(fields).find(([field]) => normalizeLabel(field) === wanted);
  return String(match?.[1] ?? text).trim();
}

function magicItemTableSource(table) {
  return {
    tableId: String(table?.id ?? table?._id ?? ""),
    tableUuid: String(table?.uuid ?? ""),
    tableName: String(table?.name ?? ""),
  };
}

async function rollMagicItemFromSource({
  tables = globalThis.game?.tables,
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  status = null,
  rollTable = rollImportedSourceTable,
} = {}) {
  const source = status ?? magicItemGeneratorTableStatus(
    getSceneMagicItemGeneratorTables(scene),
    tables,
  );
  if (!source.available) {
    return {
      mode: "missing-linked-tables",
      missing: [...source.missing],
      unavailable: [...source.unavailable],
    };
  }

  const results = {};
  const rolls = {};
  const sources = {};
  for (const key of MAGIC_ITEM_GENERATOR_TABLE_KEYS) {
    const table = source.tables[key];
    const draw = await rollTable(table);
    results[key] = String(magicItemResultValue(draw, MAGIC_ITEM_GENERATOR_TABLE_LABELS[key])).trim();
    rolls[key] = draw?.total ?? null;
    sources[key] = magicItemTableSource(table);
  }

  return {
    mode: "generated",
    sourceMode: "linked",
    name: results.name || DEFAULT_MAGIC_ITEM_NAME,
    results,
    rolls,
    sources,
    sourceBookTitle: "Scene-linked RollTables",
  };
}

function magicItemGeneratorDialogContent(result) {
  const rows = MAGIC_ITEM_GENERATOR_TABLE_KEYS
    .filter(key => key !== "name")
    .map(key => `
        <div><dt>${escapeHtml(MAGIC_ITEM_GENERATOR_TABLE_LABELS[key])}</dt><dd>${escapeHtml(result?.results?.[key] || "Not available")}</dd></div>
  `).join("");
  return `
    <div class="mk-gm-create-document-form mk-gm-magic-item-generator-form">
      <div class="form-group">
        <label>Magic Item Name</label>
        <input type="text" name="name" value="${escapeHtml(result?.name || DEFAULT_MAGIC_ITEM_NAME)}" required autofocus autocomplete="off">
      </div>
      <p class="mk-gm-secondary">Generated as a native Shadowdark Basic magic item from the linked Scene RollTables.</p>
      <dl class="mk-gm-data-list mk-gm-magic-item-result-list">
        ${rows}
      </dl>
    </div>
  `;
}

async function promptForGeneratedMagicItem({
  rollMagicItem = rollMagicItemFromSource,
  sourceStatus = null,
  tables = globalThis.game?.tables,
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
} = {}) {
  let result = await rollMagicItem({
    status: sourceStatus,
    tables,
    scene,
  });
  if (!result || result.mode !== "generated") return result ?? { mode: "missing-linked-tables" };

  while (true) {
    const choice = await waitForGmDialog({
      title: "Create Shadowdark Magic Item",
      content: magicItemGeneratorDialogContent(result),
      buttons: [
        {
          action: "create",
          icon: '<i class="fas fa-wand-sparkles"></i>',
          label: "Create",
          default: true,
          callback: (_event, button) => ({ action: "create", name: dialogName(button.form) }),
        },
        {
          action: "reroll",
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Again",
          callback: () => ({ action: "reroll" }),
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-xmark"></i>',
          label: "Cancel",
          callback: () => ({ action: "cancel" }),
        },
      ],
      close: () => ({ action: "cancel" }),
    });

    if (!choice || choice.action === "cancel") return null;
    if (choice.action === "reroll") {
      result = await rollMagicItem({
        status: sourceStatus,
        tables: globalThis.game?.tables ?? tables,
        scene,
      });
      if (!result || result.mode !== "generated") return result ?? { mode: "missing-linked-tables" };
      continue;
    }

    return {
      mode: "generated",
      result,
      name: String(choice.name ?? "").trim() || DEFAULT_MAGIC_ITEM_NAME,
    };
  }
}

function magicItemDescription(result, name) {
  const rows = MAGIC_ITEM_GENERATOR_TABLE_KEYS
    .filter(key => key !== "name")
    .map(key => (
      `<li><strong>${escapeHtml(MAGIC_ITEM_GENERATOR_TABLE_LABELS[key])}:</strong> ${escapeHtml(result?.results?.[key] || "Not available")}</li>`
    )).join("");

  return `
    <p>${escapeHtml(name)} was generated from the linked Scene RollTables.</p>
    <ul>${rows}</ul>
  `.trim();
}

function buildMagicItemData(options = {}, legacyResult = null) {
  const config = options && typeof options === "object" && !Array.isArray(options)
    ? options
    : { name: options, result: legacyResult };
  const name = String(config.name ?? "").trim() || DEFAULT_MAGIC_ITEM_NAME;
  const result = config.result ?? {};

  return {
    name,
    type: MAGIC_ITEM_DOCUMENT_TYPE,
    system: {
      magicItem: true,
      description: magicItemDescription(result, name),
    },
  };
}

async function createMagicItem({ name, result = null } = {}) {
  const ItemClass = configuredDocumentClass(globalThis.Item);
  if (!ItemClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Item creation is unavailable.");
    return null;
  }

  const item = await ItemClass.create(buildMagicItemData({ name, result }));
  await pinDocument(item);
  item?.sheet?.render?.(true);
  return item ?? null;
}

async function createSourceDrivenMagicItem({
  tables = globalThis.game?.tables,
  scene = globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null,
  promptGenerated = promptForGeneratedMagicItem,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can create Magic Items.");
    return null;
  }

  const sourceStatus = magicItemGeneratorTableStatus(
    getSceneMagicItemGeneratorTables(scene),
    tables,
  );
  if (!sourceStatus.available) {
    const missing = [...sourceStatus.missing, ...sourceStatus.unavailable];
    globalThis.ui?.notifications?.warn?.(
      `Assign all Magic Item Generator RollTables in GM Screen Settings${missing.length ? `: ${missing.join(", ")}` : "."}`,
    );
    return null;
  }

  const generated = await promptGenerated({
    sourceStatus,
    tables: globalThis.game?.tables ?? tables,
    scene,
  });
  if (!generated || generated.mode !== "generated") return null;
  return createMagicItem({ name: generated.name, result: generated.result });
}

export {
  DEFAULT_MAGIC_ITEM_NAME,
  MAGIC_ITEM_DOCUMENT_TYPE,
  escapeHtml,
  dialogRoot,
  dialogName,
  configuredDocumentClass,
  magicItemResultValue,
  rollMagicItemFromSource,
  magicItemGeneratorDialogContent,
  promptForGeneratedMagicItem,
  magicItemDescription,
  buildMagicItemData,
  createMagicItem,
  createSourceDrivenMagicItem,
};
