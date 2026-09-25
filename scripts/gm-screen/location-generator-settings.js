import { SETTINGS_APP_ID } from "./gm-screen.js";
import {
  currentScene,
  normalizeTableUuid,
  resolveRollTable,
  tableForUuid,
} from "./tavern-generator-settings.js";

const MODULE_ID = "mk-shadowdark";
const LOCATION_GENERATOR_TABLE_FLAG = "locationGeneratorTables";
const LOCATION_GENERATOR_TABLE_SCHEMA = 1;

const LOCATION_GENERATOR_TABLE_KEYS = Object.freeze([
  "descriptor",
  "location",
  "feature",
]);

const LOCATION_GENERATOR_TABLE_LABELS = Object.freeze({
  descriptor: "Descriptor",
  location: "Location",
  feature: "Feature",
});

const LOCATION_GENERATOR_TABLE_DESCRIPTIONS = Object.freeze({
  descriptor: "Rolls the descriptive part of the location.",
  location: "Rolls the type or place of the location.",
  feature: "Rolls the notable feature of the location.",
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

function normalizeLocationGeneratorTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: LOCATION_GENERATOR_TABLE_SCHEMA,
    descriptor: normalizeTableUuid(source.descriptor),
    location: normalizeTableUuid(source.location),
    feature: normalizeTableUuid(source.feature),
  };
}

function getSceneLocationGeneratorTables(scene = currentScene()) {
  return normalizeLocationGeneratorTables(getSceneFlag(scene, LOCATION_GENERATOR_TABLE_FLAG, null));
}

function locationGeneratorTableStatus(value, tables = globalThis.game?.tables) {
  const assignments = normalizeLocationGeneratorTables(value);
  const resolvedTables = Object.fromEntries(
    LOCATION_GENERATOR_TABLE_KEYS.map(key => [key, tableForUuid(assignments[key], tables)]),
  );
  const missing = LOCATION_GENERATOR_TABLE_KEYS
    .filter(key => !assignments[key])
    .map(key => LOCATION_GENERATOR_TABLE_LABELS[key]);
  const unavailable = LOCATION_GENERATOR_TABLE_KEYS
    .filter(key => assignments[key] && !resolvedTables[key])
    .map(key => LOCATION_GENERATOR_TABLE_LABELS[key]);

  return {
    available: missing.length === 0 && unavailable.length === 0,
    configured: LOCATION_GENERATOR_TABLE_KEYS.some(key => Boolean(assignments[key])),
    assignments,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function resolveLocationGeneratorEntries(scene = currentScene(), tables = globalThis.game?.tables) {
  const assignments = getSceneLocationGeneratorTables(scene);
  return Promise.all(LOCATION_GENERATOR_TABLE_KEYS.map(async key => ({
    key,
    label: LOCATION_GENERATOR_TABLE_LABELS[key],
    description: LOCATION_GENERATOR_TABLE_DESCRIPTIONS[key],
    uuid: assignments[key],
    table: assignments[key] ? await resolveRollTable(assignments[key], tables) : null,
  })));
}

async function setSceneLocationGeneratorTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!LOCATION_GENERATOR_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Location Generator RollTables.");
    return null;
  }

  const next = normalizeLocationGeneratorTables(getSceneFlag(scene, LOCATION_GENERATOR_TABLE_FLAG, null));
  next[normalizedKey] = normalizeTableUuid(tableUuid);
  await scene.setFlag(MODULE_ID, LOCATION_GENERATOR_TABLE_FLAG, next);
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

function renderLocationGeneratorSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const slots = LOCATION_GENERATOR_TABLE_KEYS.map(key => {
    const entry = byKey.get(key) ?? {
      key,
      label: LOCATION_GENERATOR_TABLE_LABELS[key],
      description: LOCATION_GENERATOR_TABLE_DESCRIPTIONS[key],
      uuid: "",
      table: null,
    };
    const assigned = Boolean(entry.uuid);
    const tableName = entry.table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
    return [
      '<article class="mk-gm-location-generator-slot mk-gm-rolltable-assignment-row ',
      assigned ? "is-assigned" : "is-empty",
      '" data-mk-location-generator-slot="',
      escapeHtml(key),
      '">',
      '<span class="mk-gm-location-generator-label mk-gm-rolltable-assignment-title">',
      escapeHtml(entry.label),
      "</span>",
      '<span class="mk-gm-location-generator-description mk-gm-rolltable-assignment-description">',
      escapeHtml(entry.description),
      "</span>",
      '<div class="mk-gm-location-generator-drop mk-gm-rolltable-assignment-table" data-mk-location-generator-drop>',
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
        ? '<button type="button" data-mk-location-generator-clear title="Clear '
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
    '<section class="mk-gm-location-generator-tables" data-mk-location-generator-tables>',
    '<header class="mk-gm-location-generator-heading">',
    "<div>",
    "<strong>Location Generator RollTables</strong>",
    "<span>Drop the RollTables used by the location procedure into their assignments.</span>",
    "</div>",
    '<i class="fas fa-map-location-dot" aria-hidden="true"></i>',
    "</header>",
    '<div class="mk-gm-location-generator-grid mk-gm-rolltable-assignment-grid">',
    slots,
    "</div>",
    '<small class="mk-gm-location-generator-status">Assignments are stored on the active Scene. Location generation requires all three linked tables.</small>',
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

function bindLocationGeneratorTables(_application, root, scene) {
  root?.querySelectorAll?.("[data-mk-location-generator-slot]")?.forEach(slot => {
    const key = String(slot.dataset?.mkLocationGeneratorSlot ?? "");
    const drop = slot.querySelector?.("[data-mk-location-generator-drop]");
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
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the Location Generator assignment.");
        return;
      }

      try {
        await setSceneLocationGeneratorTable(key, table.uuid ?? uuid, scene);
        const target = root.querySelector?.("[data-mk-location-generator-tables]");
        if (target) {
          const entries = await resolveLocationGeneratorEntries(scene);
          target.outerHTML = renderLocationGeneratorSetup(entries);
          bindLocationGeneratorTables(_application, root, scene);
        }
      } catch (error) {
        console.error("mk-shadowdark | Location Generator | Assignment failed", error);
        globalThis.ui?.notifications?.error?.("Location Generator assignment failed: " + error.message);
      }
    });

    drop.querySelector?.("[data-mk-location-generator-clear]")?.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        await setSceneLocationGeneratorTable(key, "", scene);
        const target = root.querySelector?.("[data-mk-location-generator-tables]");
        if (target) {
          const entries = await resolveLocationGeneratorEntries(scene);
          target.outerHTML = renderLocationGeneratorSetup(entries);
          bindLocationGeneratorTables(_application, root, scene);
        }
      } catch (error) {
        console.error("mk-shadowdark | Location Generator | Clear failed", error);
        globalThis.ui?.notifications?.error?.("Location Generator clear failed: " + error.message);
      }
    });
  });
}

async function decorateLocationGeneratorSettings(application, element) {
  if (!settingsApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const target = root?.querySelector?.("[data-mk-location-generator-tables]");
  if (!target) return false;

  const scene = currentScene();
  if (!scene) {
    target.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    return true;
  }

  const entries = await resolveLocationGeneratorEntries(scene);
  target.innerHTML = renderLocationGeneratorSetup(entries);
  bindLocationGeneratorTables(application, target.parentElement ?? root, scene);
  return true;
}

function registerLocationGeneratorSettings() {
  const render = (application, element) => {
    void decorateLocationGeneratorSettings(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", render);
  globalThis.Hooks?.on?.("renderApplication", render);
}

registerLocationGeneratorSettings();

export {
  MODULE_ID,
  LOCATION_GENERATOR_TABLE_FLAG,
  LOCATION_GENERATOR_TABLE_SCHEMA,
  LOCATION_GENERATOR_TABLE_KEYS,
  LOCATION_GENERATOR_TABLE_LABELS,
  LOCATION_GENERATOR_TABLE_DESCRIPTIONS,
  currentScene,
  normalizeLocationGeneratorTables,
  getSceneLocationGeneratorTables,
  locationGeneratorTableStatus,
  resolveLocationGeneratorEntries,
  setSceneLocationGeneratorTable,
  renderLocationGeneratorSetup,
  bindLocationGeneratorTables,
  decorateLocationGeneratorSettings,
  registerLocationGeneratorSettings,
};
