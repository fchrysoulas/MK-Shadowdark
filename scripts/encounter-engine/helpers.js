import {
  MODULE_ID,
  SUBMODULE,
} from "./constants.js";

export {
  normalizeEnvironmentProfiles as normalizeProfiles,
  getEnvironmentProfiles as getProfiles,
  getDefaultEnvironmentProfileId as getDefaultProfileId,
  getEnvironmentProfile as getProfile,
  determineEnvironmentPeriod as determinePeriod,
  getSceneEnvironmentContext as getSceneEncounterContext,
  setSceneEnvironmentContext as setSceneEncounterContext,
  terrainNames,
  tableUuidForEnvironmentContext as tableUuidForContext,
} from "../libs/environment-context.js";

export function moduleVersion() {
  const module = game.modules?.get(MODULE_ID);
  return module?.version ?? module?.data?.version ?? "unknown";
}

export function log(...args) {
  console.log(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
}

export function warn(...args) {
  console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
}

export function error(...args) {
  console.error(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
}

export function settingExists(key) {
  return game.settings?.settings?.has(`${MODULE_ID}.${key}`) ?? false;
}

export function setting(key, fallback) {
  try {
    if (!settingExists(key)) return fallback;
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

export function deepClone(value) {
  if (value === undefined || value === null) return value;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function mergeObject(original, other) {
  if (globalThis.foundry?.utils?.mergeObject) {
    return foundry.utils.mergeObject(original, other, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true,
    });
  }

  const result = deepClone(original ?? {});
  for (const [key, value] of Object.entries(other ?? {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeObject(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function stripHtml(value) {
  const text = String(value ?? "");
  const div = document.createElement("div");
  div.innerHTML = text;
  return String(div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
}

export function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

export function getRootElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

export function activeGmIds() {
  return Array.from(game.users ?? [])
    .filter(user => user.active && user.isGM)
    .map(user => user.id);
}

export function currentScene() {
  return globalThis.canvas?.scene ?? game.scenes?.current ?? null;
}

export async function resolveUuid(uuid) {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch (resolveError) {
    warn(`Could not resolve UUID ${uuid}`, resolveError);
    return null;
  }
}

export async function availableRollTables() {
  const tables = [];

  for (const table of game.tables ?? []) {
    tables.push({ uuid: table.uuid, name: table.name, group: "World" });
  }

  for (const pack of game.packs ?? []) {
    const documentName = pack.documentName ?? pack.metadata?.type;
    if (documentName !== "RollTable") continue;

    try {
      const index = await pack.getIndex({ fields: ["name"] });
      for (const entry of index) {
        tables.push({
          uuid: `Compendium.${pack.collection}.RollTable.${entry._id}`,
          name: entry.name,
          group: pack.metadata?.label ?? pack.title ?? pack.collection,
        });
      }
    } catch (indexError) {
      warn(`Could not index RollTable pack ${pack.collection}`, indexError);
    }
  }

  return tables.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

export function renderGroupedOptions(entries, selectedUuid = "") {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.group)) grouped.set(entry.group, []);
    grouped.get(entry.group).push(entry);
  }

  const empty = `<option value="" ${selectedUuid ? "" : "selected"}>Automatic / not configured</option>`;
  const groups = Array.from(grouped.entries()).map(([group, options]) => `
    <optgroup label="${escapeHtml(group)}">
      ${options.map(option => `
        <option value="${escapeHtml(option.uuid)}" ${option.uuid === selectedUuid ? "selected" : ""}>
          ${escapeHtml(option.name)}
        </option>
      `).join("")}
    </optgroup>
  `).join("");

  return empty + groups;
}

export function readDialogForm(html) {
  const root = getRootElement(html);
  const form = root?.querySelector("form") ?? root;
  if (!form) return {};

  return globalThis.FormDataExtended
    ? new FormDataExtended(form).object
    : Object.fromEntries(new FormData(form).entries());
}
