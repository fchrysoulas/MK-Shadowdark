import { SETTINGS_APP_ID } from "./gm-screen.js";
import {
  currentScene,
  normalizeTableUuid,
  resolveRollTable,
  tableForUuid,
} from "./tavern-generator-settings.js";

const MODULE_ID = "mk-shadowdark";
const MAGIC_ITEM_GENERATOR_TABLE_FLAG = "magicItemGeneratorTables";
const MAGIC_ITEM_GENERATOR_TABLE_SCHEMA = 2;

const MAGIC_ITEM_GENERATOR_TABLE_KEYS = Object.freeze([
  "type",
  "qualities",
  "personality",
]);

const MAGIC_ITEM_GENERATOR_TABLE_LABELS = Object.freeze({
  type: "Type",
  qualities: "Qualities",
  personality: "Personality",
});

const MAGIC_ITEM_GENERATOR_TABLE_DESCRIPTIONS = Object.freeze({
  type: "Rolls the magic item's type.",
  qualities: "Rolls the item's qualities, benefits, drawbacks, or special properties.",
  personality: "Rolls the item's personality or quirk.",
});

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = undefined) {
  if (!scene) return fallback;
  try {
    const value = scene.getFlag?.(MODULE_ID, key);
    return value === undefined ? rawSceneFlag(scene, key) ?? fallback : value;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

function normalizeMagicItemGeneratorTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  // Schema 1 used Name, Bonus, Benefit, Curse, and Personality. Reuse the
  // old Name assignment as the closest equivalent for Type and leave
  // Qualities empty so the GM can choose one of the new tables.
  const type = source.type ?? source.itemType ?? source.name ?? source.itemName;
  const qualities = source.qualities ?? source.quality;

  return {
    schema: MAGIC_ITEM_GENERATOR_TABLE_SCHEMA,
    type: normalizeTableUuid(type),
    qualities: normalizeTableUuid(qualities),
    personality: normalizeTableUuid(source.personality),
  };
}

function getSceneMagicItemGeneratorTables(scene = currentScene()) {
  return normalizeMagicItemGeneratorTables(
    getSceneFlag(scene, MAGIC_ITEM_GENERATOR_TABLE_FLAG, null),
  );
}

function magicItemGeneratorTableStatus(value, tables = globalThis.game?.tables) {
  const assignments = normalizeMagicItemGeneratorTables(value);
  const resolvedTables = Object.fromEntries(
    MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(key => [key, tableForUuid(assignments[key], tables)]),
  );
  const missing = MAGIC_ITEM_GENERATOR_TABLE_KEYS
    .filter(key => !assignments[key])
    .map(key => MAGIC_ITEM_GENERATOR_TABLE_LABELS[key]);
  const unavailable = MAGIC_ITEM_GENERATOR_TABLE_KEYS
    .filter(key => assignments[key] && !resolvedTables[key])
    .map(key => MAGIC_ITEM_GENERATOR_TABLE_LABELS[key]);

  return {
    available: missing.length === 0 && unavailable.length === 0,
    configured: MAGIC_ITEM_GENERATOR_TABLE_KEYS.some(key => Boolean(assignments[key])),
    assignments,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function resolveMagicItemGeneratorEntries(
  scene = currentScene(),
  tables = globalThis.game?.tables,
) {
  const assignments = getSceneMagicItemGeneratorTables(scene);
  return Promise.all(MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(async key => ({
    key,
    label: MAGIC_ITEM_GENERATOR_TABLE_LABELS[key],
    description: MAGIC_ITEM_GENERATOR_TABLE_DESCRIPTIONS[key],
    uuid: assignments[key],
    table: assignments[key] ? await resolveRollTable(assignments[key], tables) : null,
  })));
}

async function setSceneMagicItemGeneratorTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!MAGIC_ITEM_GENERATOR_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Magic Item Generator RollTables.");
    return null;
  }

  const next = normalizeMagicItemGeneratorTables(
    getSceneFlag(scene, MAGIC_ITEM_GENERATOR_TABLE_FLAG, null),
  );
  next[normalizedKey] = normalizeTableUuid(tableUuid);
  await scene.setFlag(MODULE_ID, MAGIC_ITEM_GENERATOR_TABLE_FLAG, next);
  return next;
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

function dragEventData(event) {
  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  const getData = TextEditorClass?.getDragEventData
    ?? TextEditorClass?.implementation?.getDragEventData;

  if (typeof getData === "function") {
    try {
      return getData.call(TextEditorClass, event) ?? {};
    } catch (_error) {
      // Fall through to raw DataTransfer JSON.
    }
  }

  for (const mime of ["application/json", "text/plain"]) {
    const raw = event?.dataTransfer?.getData?.(mime);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      // Try the next supported payload type.
    }
  }
  return {};
}

function dragDataUuid(data) {
  for (const value of [data?.uuid, data?.documentUuid, data?.data?.uuid]) {
    const uuid = normalizeTableUuid(value);
    if (uuid) return uuid;
  }
  return "";
}

function renderMagicItemGeneratorSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const slots = MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(key => {
    const entry = byKey.get(key) ?? {
      key,
      label: MAGIC_ITEM_GENERATOR_TABLE_LABELS[key],
      description: MAGIC_ITEM_GENERATOR_TABLE_DESCRIPTIONS[key],
      uuid: "",
      table: null,
    };
    const assigned = Boolean(entry.uuid);
    const tableName = entry.table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
    return [
      '<article class="mk-gm-magic-item-generator-slot mk-gm-rolltable-assignment-row ',
      assigned ? "is-assigned" : "is-empty",
      '" data-mk-magic-item-generator-slot="',
      escapeHtml(key),
      '">',
      '<span class="mk-gm-magic-item-generator-label mk-gm-rolltable-assignment-title">',
      escapeHtml(entry.label),
      "</span>",
      '<span class="mk-gm-magic-item-generator-description mk-gm-rolltable-assignment-description">',
      escapeHtml(entry.description),
      "</span>",
      '<div class="mk-gm-magic-item-generator-drop mk-gm-rolltable-assignment-table" data-mk-magic-item-generator-drop>',
      '<i class="fas ',
      assigned ? "fa-table-list" : "fa-arrow-down",
      '" aria-hidden="true"></i>',
      "<strong>",
      escapeHtml(tableName),
      "</strong>",
      assigned && !entry.table
        ? "<small>" + escapeHtml(entry.uuid) + "</small>"
        : "",
      assigned
        ? '<button type="button" data-mk-magic-item-generator-clear title="Clear '
          + escapeHtml(entry.label)
          + ' RollTable" aria-label="Clear '
          + escapeHtml(entry.label)
          + ' RollTable"><i class="fas fa-xmark"></i></button>'
        : "",
      "</div>",
      "</article>",
    ].join("");
  }).join("");

  return [
    '<section class="mk-gm-magic-item-generator-tables" data-mk-magic-item-generator-tables>',
    '<header class="mk-gm-magic-item-generator-heading">',
    "<div>",
    "<strong>Magic Item Generator RollTables</strong>",
    "<span>Drop the RollTables used by the magic item procedure into their assignments.</span>",
    "</div>",
    '<i class="fas fa-wand-sparkles" aria-hidden="true"></i>',
    "</header>",
    '<div class="mk-gm-magic-item-generator-grid mk-gm-rolltable-assignment-grid">',
    slots,
    "</div>",
    '<small class="mk-gm-magic-item-generator-status">Assignments are stored on the active Scene. Magic item generation requires all three linked tables.</small>',
    "</section>",
  ].join("");
}

function settingsApplication(application) {
  return Boolean(
    application
    && (
      application.id === SETTINGS_APP_ID
      || application.options?.id === SETTINGS_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === SETTINGS_APP_ID
    )
  );
}

function bindMagicItemGeneratorTables(application, root, scene) {
  root?.querySelectorAll?.("[data-mk-magic-item-generator-slot]")?.forEach(slot => {
    const key = String(slot.dataset?.mkMagicItemGeneratorSlot ?? "");
    const drop = slot.querySelector?.("[data-mk-magic-item-generator-drop]");
    if (!drop) return;

    drop.addEventListener("dragenter", event => {
      event.preventDefault();
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", event => {
      if (event.relatedTarget && drop.contains?.(event.relatedTarget)) return;
      slot.classList.remove("is-dragover");
    });
    drop.addEventListener("drop", async event => {
      event.preventDefault();
      event.stopPropagation();
      slot.classList.remove("is-dragover");
      const uuid = dragDataUuid(dragEventData(event));
      const table = await resolveRollTable(uuid);
      if (!table) {
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the Magic Item Generator assignment.");
        return;
      }

      try {
        await setSceneMagicItemGeneratorTable(key, table.uuid ?? uuid, scene);
        await application?.render?.({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | Magic Item Generator | Assignment failed", error);
        globalThis.ui?.notifications?.error?.("Magic Item Generator assignment failed: " + error.message);
      }
    });

    drop.querySelectorAll?.("[data-mk-magic-item-generator-clear]")?.forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          await setSceneMagicItemGeneratorTable(key, "", scene);
          await application?.render?.({ force: true });
        } catch (error) {
          console.error("mk-shadowdark | Magic Item Generator | Clear failed", error);
          globalThis.ui?.notifications?.error?.("Magic Item Generator clear failed: " + error.message);
          button.disabled = false;
        }
      });
    });
  });
  return true;
}

async function decorateMagicItemGeneratorSettings(application, element) {
  if (!settingsApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const target = root?.querySelector?.("[data-mk-magic-item-generator-tables]");
  if (!target) return false;

  const scene = currentScene();
  if (!scene) {
    target.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    return true;
  }

  const entries = await resolveMagicItemGeneratorEntries(scene);
  target.innerHTML = renderMagicItemGeneratorSetup(entries);
  bindMagicItemGeneratorTables(application, target, scene);
  return true;
}

function registerMagicItemGeneratorSettings() {
  const render = (application, element) => {
    void decorateMagicItemGeneratorSettings(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", render);
  globalThis.Hooks?.on?.("renderApplication", render);
}

registerMagicItemGeneratorSettings();

export {
  MODULE_ID,
  MAGIC_ITEM_GENERATOR_TABLE_FLAG,
  MAGIC_ITEM_GENERATOR_TABLE_SCHEMA,
  MAGIC_ITEM_GENERATOR_TABLE_KEYS,
  MAGIC_ITEM_GENERATOR_TABLE_LABELS,
  MAGIC_ITEM_GENERATOR_TABLE_DESCRIPTIONS,
  currentScene,
  normalizeMagicItemGeneratorTables,
  getSceneMagicItemGeneratorTables,
  magicItemGeneratorTableStatus,
  resolveMagicItemGeneratorEntries,
  setSceneMagicItemGeneratorTable,
  renderMagicItemGeneratorSetup,
  bindMagicItemGeneratorTables,
  decorateMagicItemGeneratorSettings,
  registerMagicItemGeneratorSettings,
};
