import { SETTINGS_APP_ID } from "./gm-screen.js";
import {
  currentScene,
  normalizeTableUuid,
  resolveRollTable,
  tableForUuid,
} from "./tavern-generator-settings.js";

const MODULE_ID = "mk-shadowdark";
const MONSTER_GENERATOR_TABLE_FLAG = "monsterGeneratorTables";
const MONSTER_GENERATOR_TABLE_SCHEMA = 1;

const MONSTER_GENERATOR_TABLE_KEYS = Object.freeze([
  "combat",
  "quality",
  "strength",
  "weakness",
  "mutation1",
  "mutation2",
  "mutation3",
]);

const MONSTER_GENERATOR_TABLE_LABELS = Object.freeze({
  combat: "Combat",
  quality: "Quality",
  strength: "Strength",
  weakness: "Weakness",
  mutation1: "Mutation 1",
  mutation2: "Mutation 2",
  mutation3: "Mutation 3",
});

const MONSTER_GENERATOR_TABLE_DESCRIPTIONS = Object.freeze({
  combat: "Rolls the monster's combat behavior or signature attack.",
  quality: "Rolls the monster's defining quality or notable trait.",
  strength: "Rolls the monster's primary strength.",
  weakness: "Rolls the monster's exploitable weakness.",
  mutation1: "Rolls the monster's first mutation.",
  mutation2: "Rolls the monster's second mutation.",
  mutation3: "Rolls the monster's third mutation.",
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

function normalizeMonsterGeneratorTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: MONSTER_GENERATOR_TABLE_SCHEMA,
    combat: normalizeTableUuid(source.combat),
    quality: normalizeTableUuid(source.quality),
    strength: normalizeTableUuid(source.strength),
    weakness: normalizeTableUuid(source.weakness),
    mutation1: normalizeTableUuid(source.mutation1 ?? source.mutation_1),
    mutation2: normalizeTableUuid(source.mutation2 ?? source.mutation_2),
    mutation3: normalizeTableUuid(source.mutation3 ?? source.mutation_3),
  };
}

function getSceneMonsterGeneratorTables(scene = currentScene()) {
  return normalizeMonsterGeneratorTables(getSceneFlag(scene, MONSTER_GENERATOR_TABLE_FLAG, null));
}

function monsterGeneratorTableStatus(value, tables = globalThis.game?.tables) {
  const assignments = normalizeMonsterGeneratorTables(value);
  const resolvedTables = Object.fromEntries(
    MONSTER_GENERATOR_TABLE_KEYS.map(key => [key, tableForUuid(assignments[key], tables)]),
  );
  const missing = MONSTER_GENERATOR_TABLE_KEYS
    .filter(key => !assignments[key])
    .map(key => MONSTER_GENERATOR_TABLE_LABELS[key]);
  const unavailable = MONSTER_GENERATOR_TABLE_KEYS
    .filter(key => assignments[key] && !resolvedTables[key])
    .map(key => MONSTER_GENERATOR_TABLE_LABELS[key]);

  return {
    available: missing.length === 0 && unavailable.length === 0,
    configured: MONSTER_GENERATOR_TABLE_KEYS.some(key => Boolean(assignments[key])),
    assignments,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function resolveMonsterGeneratorEntries(scene = currentScene(), tables = globalThis.game?.tables) {
  const assignments = getSceneMonsterGeneratorTables(scene);
  return Promise.all(MONSTER_GENERATOR_TABLE_KEYS.map(async key => ({
    key,
    label: MONSTER_GENERATOR_TABLE_LABELS[key],
    description: MONSTER_GENERATOR_TABLE_DESCRIPTIONS[key],
    uuid: assignments[key],
    table: assignments[key] ? await resolveRollTable(assignments[key], tables) : null,
  })));
}

async function setSceneMonsterGeneratorTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!MONSTER_GENERATOR_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Monster Generator RollTables.");
    return null;
  }

  const next = normalizeMonsterGeneratorTables(getSceneFlag(scene, MONSTER_GENERATOR_TABLE_FLAG, null));
  next[normalizedKey] = normalizeTableUuid(tableUuid);
  await scene.setFlag(MODULE_ID, MONSTER_GENERATOR_TABLE_FLAG, next);
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

function renderMonsterGeneratorSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const slots = MONSTER_GENERATOR_TABLE_KEYS.map(key => {
    const entry = byKey.get(key) ?? {
      key,
      label: MONSTER_GENERATOR_TABLE_LABELS[key],
      description: MONSTER_GENERATOR_TABLE_DESCRIPTIONS[key],
      uuid: "",
      table: null,
    };
    const assigned = Boolean(entry.uuid);
    const tableName = entry.table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
    return [
      '<article class="mk-gm-monster-generator-slot mk-gm-rolltable-assignment-row ',
      assigned ? "is-assigned" : "is-empty",
      '" data-mk-monster-generator-slot="',
      escapeHtml(key),
      '">',
      '<span class="mk-gm-monster-generator-label mk-gm-rolltable-assignment-title">',
      escapeHtml(entry.label),
      "</span>",
      '<span class="mk-gm-monster-generator-description mk-gm-rolltable-assignment-description">',
      escapeHtml(entry.description),
      "</span>",
      '<div class="mk-gm-monster-generator-drop mk-gm-rolltable-assignment-table" data-mk-monster-generator-drop>',
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
        ? '<button type="button" data-mk-monster-generator-clear title="Clear '
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
    '<section class="mk-gm-monster-generator-tables" data-mk-monster-generator-tables>',
    '<header class="mk-gm-monster-generator-heading">',
    "<div>",
    "<strong>Monster Generator RollTables</strong>",
    "<span>Drop the RollTables used by the monster procedure into their assignments.</span>",
    "</div>",
    '<i class="fas fa-skull-crossbones" aria-hidden="true"></i>',
    "</header>",
    '<div class="mk-gm-monster-generator-grid mk-gm-rolltable-assignment-grid">',
    slots,
    "</div>",
    '<small class="mk-gm-monster-generator-status">Assignments are stored on the active Scene. Monster generation requires all seven linked tables.</small>',
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

function bindMonsterGeneratorTables(application, root, scene) {
  root?.querySelectorAll?.("[data-mk-monster-generator-slot]")?.forEach(slot => {
    const key = String(slot.dataset?.mkMonsterGeneratorSlot ?? "");
    const drop = slot.querySelector?.("[data-mk-monster-generator-drop]");
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
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the Monster Generator assignment.");
        return;
      }

      try {
        await setSceneMonsterGeneratorTable(key, table.uuid ?? uuid, scene);
        await application?.render?.({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | Monster Generator | Assignment failed", error);
        globalThis.ui?.notifications?.error?.("Monster Generator assignment failed: " + error.message);
      }
    });

    drop.querySelectorAll?.("[data-mk-monster-generator-clear]")?.forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          await setSceneMonsterGeneratorTable(key, "", scene);
          await application?.render?.({ force: true });
        } catch (error) {
          console.error("mk-shadowdark | Monster Generator | Clear failed", error);
          globalThis.ui?.notifications?.error?.("Monster Generator clear failed: " + error.message);
          button.disabled = false;
        }
      });
    });
  });
  return true;
}

async function decorateMonsterGeneratorSettings(application, element) {
  if (!settingsApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const target = root?.querySelector?.("[data-mk-monster-generator-tables]");
  if (!target) return false;

  const scene = currentScene();
  if (!scene) {
    target.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    return true;
  }

  const entries = await resolveMonsterGeneratorEntries(scene);
  target.innerHTML = renderMonsterGeneratorSetup(entries);
  bindMonsterGeneratorTables(application, target, scene);
  return true;
}

function registerMonsterGeneratorSettings() {
  const render = (application, element) => {
    void decorateMonsterGeneratorSettings(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", render);
  globalThis.Hooks?.on?.("renderApplication", render);
}

registerMonsterGeneratorSettings();

export {
  MODULE_ID,
  MONSTER_GENERATOR_TABLE_FLAG,
  MONSTER_GENERATOR_TABLE_SCHEMA,
  MONSTER_GENERATOR_TABLE_KEYS,
  MONSTER_GENERATOR_TABLE_LABELS,
  MONSTER_GENERATOR_TABLE_DESCRIPTIONS,
  currentScene,
  normalizeMonsterGeneratorTables,
  getSceneMonsterGeneratorTables,
  monsterGeneratorTableStatus,
  resolveMonsterGeneratorEntries,
  setSceneMonsterGeneratorTable,
  renderMonsterGeneratorSetup,
  bindMonsterGeneratorTables,
  decorateMonsterGeneratorSettings,
  registerMonsterGeneratorSettings,
};
