import { collectionValues } from "../source-tables/source-table-service.js";
import { APP_ID, SETTINGS_APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const TAVERN_GENERATOR_TABLE_FLAG = "tavernGeneratorTables";
const TAVERN_GENERATOR_TABLE_SCHEMA = 4;

const TAVERN_GENERATOR_TABLE_KEYS = Object.freeze([
  "firstPart",
  "secondPart",
  "knownFor",
  "wealth",
  "foodPoor",
  "foodStandard",
  "foodWealthy",
  "drinksPoor",
  "drinksStandard",
  "drinksWealthy",
]);

const TAVERN_GENERATOR_TABLE_LABELS = Object.freeze({
  firstPart: "First Part",
  secondPart: "Second Part",
  knownFor: "Known For",
  wealth: "Wealth",
  foodPoor: "Poor Food",
  foodStandard: "Standard Food",
  foodWealthy: "Wealthy Food",
  drinksPoor: "Poor Drinks",
  drinksStandard: "Standard Drinks",
  drinksWealthy: "Wealthy Drinks",
});

const TAVERN_GENERATOR_TABLE_DESCRIPTIONS = Object.freeze({
  firstPart: "Rolls the first part of the tavern name.",
  secondPart: "Rolls the second part of the tavern name.",
  knownFor: "Rolls what the tavern is known for.",
  wealth: "Rolls Poor, Standard, or Wealthy for the tavern.",
  foodPoor: "Rolls the food entries and prices for a Poor tavern.",
  foodStandard: "Rolls the food entries and prices for a Standard tavern.",
  foodWealthy: "Rolls the food entries and prices for a Wealthy tavern.",
  drinksPoor: "Rolls the drink entries for a Poor tavern.",
  drinksStandard: "Rolls the drink entries for a Standard tavern.",
  drinksWealthy: "Rolls the drink entries for a Wealthy tavern.",
});

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

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

function normalizeTableUuid(value) {
  if (value && typeof value === "object") {
    return String(value.uuid ?? value.documentUuid ?? "").trim();
  }
  return String(value ?? "").trim();
}

function tieredTableValue(source, family, tier) {
  const directKey = `${family}${tier[0].toUpperCase()}${tier.slice(1)}`;
  if (source[directKey] !== undefined) return source[directKey];
  const legacy = source[family];
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)
    && !legacy.uuid && !legacy.documentUuid) {
    return legacy[tier];
  }
  return legacy;
}

function normalizeTavernGeneratorTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: TAVERN_GENERATOR_TABLE_SCHEMA,
    firstPart: normalizeTableUuid(source.firstPart ?? source.generator),
    secondPart: normalizeTableUuid(source.secondPart),
    knownFor: normalizeTableUuid(source.knownFor),
    wealth: normalizeTableUuid(source.wealth),
    foodPoor: normalizeTableUuid(tieredTableValue(source, "food", "poor")),
    foodStandard: normalizeTableUuid(tieredTableValue(source, "food", "standard")),
    foodWealthy: normalizeTableUuid(tieredTableValue(source, "food", "wealthy")),
    drinksPoor: normalizeTableUuid(tieredTableValue(source, "drinks", "poor")),
    drinksStandard: normalizeTableUuid(tieredTableValue(source, "drinks", "standard")),
    drinksWealthy: normalizeTableUuid(tieredTableValue(source, "drinks", "wealthy")),
  };
}

function getSceneTavernGeneratorTables(scene = currentScene()) {
  return normalizeTavernGeneratorTables(getSceneFlag(scene, TAVERN_GENERATOR_TABLE_FLAG, null));
}

function tableForUuid(uuid, tables = globalThis.game?.tables) {
  const requested = normalizeTableUuid(uuid);
  if (!requested) return null;
  return collectionValues(tables).find(table => String(table?.uuid ?? "") === requested) ?? null;
}

function tavernGeneratorTableStatus(value, tables = globalThis.game?.tables) {
  const assignments = normalizeTavernGeneratorTables(value);
  const resolvedTables = Object.fromEntries(
    TAVERN_GENERATOR_TABLE_KEYS.map(key => [key, tableForUuid(assignments[key], tables)]),
  );
  const missing = TAVERN_GENERATOR_TABLE_KEYS
    .filter(key => !assignments[key])
    .map(key => TAVERN_GENERATOR_TABLE_LABELS[key]);
  const unavailable = TAVERN_GENERATOR_TABLE_KEYS
    .filter(key => assignments[key] && !resolvedTables[key])
    .map(key => TAVERN_GENERATOR_TABLE_LABELS[key]);

  return {
    available: missing.length === 0 && unavailable.length === 0,
    configured: TAVERN_GENERATOR_TABLE_KEYS.some(key => Boolean(assignments[key])),
    assignments,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  try {
    return await resolver(String(uuid ?? ""));
  } catch (_error) {
    return null;
  }
}

async function resolveRollTable(uuid, tables = globalThis.game?.tables) {
  const local = tableForUuid(uuid, tables);
  if (local) return local;
  const resolved = await resolveUuid(uuid);
  if (!resolved || (resolved.documentName && resolved.documentName !== "RollTable")) return null;
  return typeof resolved.roll === "function" || typeof resolved.draw === "function" ? resolved : null;
}

async function resolveTavernGeneratorEntries(scene = currentScene(), tables = globalThis.game?.tables) {
  const assignments = getSceneTavernGeneratorTables(scene);
  return Promise.all(TAVERN_GENERATOR_TABLE_KEYS.map(async key => ({
    key,
    label: TAVERN_GENERATOR_TABLE_LABELS[key],
    description: TAVERN_GENERATOR_TABLE_DESCRIPTIONS[key],
    uuid: assignments[key],
    table: assignments[key] ? await resolveRollTable(assignments[key], tables) : null,
  })));
}

async function setSceneTavernGeneratorTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!TAVERN_GENERATOR_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change Tavern Generator RollTables.");
    return null;
  }

  const next = normalizeTavernGeneratorTables(getSceneFlag(scene, TAVERN_GENERATOR_TABLE_FLAG, null));
  next[normalizedKey] = normalizeTableUuid(tableUuid);
  await scene.setFlag(MODULE_ID, TAVERN_GENERATOR_TABLE_FLAG, next);
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

function renderTavernGeneratorSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const slots = TAVERN_GENERATOR_TABLE_KEYS.map(key => {
    const entry = byKey.get(key) ?? {
      key,
      label: TAVERN_GENERATOR_TABLE_LABELS[key],
      description: TAVERN_GENERATOR_TABLE_DESCRIPTIONS[key],
      uuid: "",
      table: null,
    };
    const assigned = Boolean(entry.uuid);
    const tableName = entry.table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
    return [
      '<article class="mk-gm-tavern-generator-slot ',
      assigned ? "is-assigned" : "is-empty",
      '" data-mk-tavern-generator-slot="',
      escapeHtml(key),
      '">',
      '<span class="mk-gm-tavern-generator-label">',
      escapeHtml(entry.label),
      "</span>",
      '<span class="mk-gm-tavern-generator-description">',
      escapeHtml(entry.description),
      "</span>",
      '<div class="mk-gm-tavern-generator-drop" data-mk-tavern-generator-drop>',
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
        ? '<button type="button" data-mk-tavern-generator-clear title="Clear '
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
    '<section class="mk-gm-tavern-generator-tables" data-mk-tavern-generator-tables>',
    '<header class="mk-gm-tavern-generator-heading">',
    "<div>",
    "<strong>Tavern Generator RollTables</strong>",
    "<span>Drop the RollTables used by the tavern procedure into their assignments.</span>",
    "</div>",
    '<i class="fas fa-beer-mug-empty" aria-hidden="true"></i>',
    "</header>",
    '<div class="mk-gm-tavern-generator-grid">',
    slots,
    "</div>",
    '<small class="mk-gm-tavern-generator-status">Assignments are stored on the active Scene. Tavern generation uses these linked tables when any assignment is present; otherwise the existing imported source tables remain available.</small>',
    "</section>",
  ].join("");
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

function bindTavernGeneratorTables(application, root, scene) {
  root?.querySelectorAll?.("[data-mk-tavern-generator-slot]")?.forEach(slot => {
    const key = String(slot.dataset?.mkTavernGeneratorSlot ?? "");
    const drop = slot.querySelector?.("[data-mk-tavern-generator-drop]");
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
        globalThis.ui?.notifications?.warn?.("Drop a RollTable onto the Tavern Generator assignment.");
        return;
      }

      try {
        await setSceneTavernGeneratorTable(key, table.uuid ?? uuid, scene);
        await application?.render?.({ force: true });
      } catch (error) {
        console.error("mk-shadowdark | Tavern Generator | Assignment failed", error);
        globalThis.ui?.notifications?.error?.("Tavern Generator assignment failed: " + error.message);
      }
    });

    drop.querySelectorAll?.("[data-mk-tavern-generator-clear]")?.forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          await setSceneTavernGeneratorTable(key, "", scene);
          await application?.render?.({ force: true });
        } catch (error) {
          console.error("mk-shadowdark | Tavern Generator | Clear failed", error);
          globalThis.ui?.notifications?.error?.("Tavern Generator clear failed: " + error.message);
          button.disabled = false;
        }
      });
    });
  });
  return true;
}

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
      || application.id === SETTINGS_APP_ID
      || application.options?.id === SETTINGS_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === SETTINGS_APP_ID
    )
  );
}

async function decorateTavernGeneratorSettings(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const target = root?.querySelector?.("[data-mk-tavern-generator-tables]");
  if (!target) return false;

  const scene = currentScene();
  if (!scene) {
    target.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    return true;
  }

  const entries = await resolveTavernGeneratorEntries(scene);
  target.innerHTML = renderTavernGeneratorSetup(entries);
  bindTavernGeneratorTables(application, target, scene);
  return true;
}

function registerTavernGeneratorSettings() {
  const render = (application, element) => {
    void decorateTavernGeneratorSettings(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", render);
  globalThis.Hooks?.on?.("renderApplication", render);
}

registerTavernGeneratorSettings();

export {
  MODULE_ID,
  TAVERN_GENERATOR_TABLE_FLAG,
  TAVERN_GENERATOR_TABLE_SCHEMA,
  TAVERN_GENERATOR_TABLE_KEYS,
  TAVERN_GENERATOR_TABLE_LABELS,
  TAVERN_GENERATOR_TABLE_DESCRIPTIONS,
  currentScene,
  normalizeTableUuid,
  normalizeTavernGeneratorTables,
  getSceneTavernGeneratorTables,
  tableForUuid,
  tavernGeneratorTableStatus,
  resolveRollTable,
  resolveTavernGeneratorEntries,
  setSceneTavernGeneratorTable,
  renderTavernGeneratorSetup,
  bindTavernGeneratorTables,
  decorateTavernGeneratorSettings,
  registerTavernGeneratorSettings,
};
