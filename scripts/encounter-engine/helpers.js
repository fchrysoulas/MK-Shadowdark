import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILES,
  MODULE_ID,
  SCENE_FLAG,
  SETTINGS,
  SUBMODULE,
} from "./constants.js";

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

export function registerSetting(key, data) {
  if (settingExists(key)) return;
  game.settings.register(MODULE_ID, key, data);
}

export function deepClone(value) {
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
  return canvas?.scene ?? game.scenes?.current ?? null;
}

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = undefined) {
  try {
    const current = scene.getFlag?.(MODULE_ID, key);
    return current === undefined ? rawSceneFlag(scene, key) ?? fallback : current;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

export function normalizeProfiles(rawValue) {
  let parsed = rawValue;
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue || "{}");
    } catch (parseError) {
      warn("Invalid Encounter Profiles JSON. Using defaults.", parseError);
      parsed = {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};

  const normalized = {};
  const source = Object.keys(parsed).length ? parsed : DEFAULT_PROFILES;
  for (const [profileId, profileValue] of Object.entries(source)) {
    const id = slug(profileId);
    normalized[id] = mergeObject(DEFAULT_PROFILES.default, profileValue ?? {});
    normalized[id].name = String(profileValue?.name ?? profileId ?? "Default");
  }

  if (!Object.keys(normalized).length) normalized.default = deepClone(DEFAULT_PROFILES.default);
  return normalized;
}

export function getProfiles() {
  return normalizeProfiles(setting(SETTINGS.profiles, JSON.stringify(DEFAULT_PROFILES, null, 2)));
}

export function getDefaultProfileId(profiles = getProfiles()) {
  const requested = slug(setting(SETTINGS.defaultProfile, DEFAULT_PROFILE_ID));
  if (profiles[requested]) return requested;
  return Object.keys(profiles)[0] ?? DEFAULT_PROFILE_ID;
}

export function getProfile(profileId, profiles = getProfiles()) {
  const id = slug(profileId || getDefaultProfileId(profiles));
  return {
    id: profiles[id] ? id : getDefaultProfileId(profiles),
    data: profiles[id] ?? profiles[getDefaultProfileId(profiles)] ?? deepClone(DEFAULT_PROFILES.default),
  };
}

function worldHour() {
  const worldTime = Number(game.time?.worldTime ?? 0);
  const secondsInDay = 24 * 60 * 60;
  const normalized = ((worldTime % secondsInDay) + secondsInDay) % secondsInDay;
  return Math.floor(normalized / 3600);
}

export function determinePeriod(profile, requestedPeriod = "auto") {
  if (["day", "night"].includes(requestedPeriod)) return requestedPeriod;

  const hour = worldHour();
  const dayStart = Number(profile.dayStart ?? 6);
  const nightStart = Number(profile.nightStart ?? 18);

  if (dayStart === nightStart) return "day";
  if (dayStart < nightStart) return hour >= dayStart && hour < nightStart ? "day" : "night";
  return hour >= dayStart || hour < nightStart ? "day" : "night";
}

export function getSceneEncounterContext(scene = currentScene()) {
  const profiles = getProfiles();
  const fallbackProfileId = getDefaultProfileId(profiles);
  const stored = getSceneFlag(scene, SCENE_FLAG, {}) ?? {};
  const profileId = profiles[slug(stored.profileId)] ? slug(stored.profileId) : fallbackProfileId;
  const profile = profiles[profileId];

  return {
    profileId,
    terrain: String(stored.terrain ?? profile.defaultTerrain ?? Object.keys(profile.terrains ?? {})[0] ?? "Default"),
    period: ["auto", "day", "night"].includes(stored.period) ? stored.period : "auto",
    tableUuid: String(stored.tableUuid ?? ""),
  };
}

export async function setSceneEncounterContext(context, scene = currentScene()) {
  if (!scene || !game.user?.isGM) return null;
  const normalized = {
    profileId: slug(context.profileId),
    terrain: String(context.terrain ?? "Default"),
    period: ["auto", "day", "night"].includes(context.period) ? context.period : "auto",
    tableUuid: String(context.tableUuid ?? ""),
  };
  await scene.setFlag(MODULE_ID, SCENE_FLAG, normalized);
  return normalized;
}

export function terrainNames(profile) {
  const names = Object.keys(profile.terrains ?? {});
  if (profile.defaultTerrain && !names.includes(profile.defaultTerrain)) names.unshift(profile.defaultTerrain);
  return names.length ? names : ["Default"];
}

export function tableUuidForContext(profile, terrain, period, explicitUuid = "") {
  if (explicitUuid) return explicitUuid;

  const terrainData = profile.terrains?.[terrain] ?? profile.terrains?.[profile.defaultTerrain] ?? {};
  return String(
    terrainData?.[period] ||
    terrainData?.any ||
    setting(SETTINGS.defaultTable, "") ||
    ""
  );
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
