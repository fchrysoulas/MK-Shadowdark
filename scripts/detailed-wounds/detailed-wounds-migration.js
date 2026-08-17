const CURRENT_WOUND_DATA_VERSION = 2;
const WOUND_MIGRATION_VERSION = 1;

const LOCATION_KEYS = Object.freeze([
  "head",
  "leftArm",
  "leftHand",
  "leftLeg",
  "leftFoot",
  "torso",
  "rightArm",
  "rightHand",
  "rightLeg",
  "rightFoot"
]);

const STATUS_RANKS = Object.freeze({
  ok: 1,
  wounded: 2,
  critical: 3,
  destroyed: 4
});

const LEGACY_SEVERITY_RANKS = Object.freeze({
  minor: 2,
  moderate: 2,
  severe: 3,
  critical: 3
});

function clonePlain(value) {
  if (!value || typeof value !== "object") return {};
  return JSON.parse(JSON.stringify(value));
}

function statusForRank(rank) {
  return Object.entries(STATUS_RANKS).find(([, value]) => value === rank)?.[0] ?? "ok";
}

function normalizeLegacyStatus(value) {
  const directStatus = value && !Array.isArray(value) && typeof value === "object"
    ? String(value.status ?? "")
    : "";
  if (STATUS_RANKS[directStatus]) return directStatus;

  if (!Array.isArray(value) || value.length === 0) return "ok";

  const highestRank = value.reduce(
    (rank, wound) => Math.max(rank, LEGACY_SEVERITY_RANKS[wound?.severity] ?? 1),
    1
  );
  return statusForRank(highestRank);
}

function normalizeWoundLocation(value) {
  const status = normalizeLegacyStatus(value);
  const hits = Array.isArray(value)
    ? value.length
    : Math.max(0, Number(value?.hits) || (status === "ok" ? 0 : 1));

  return { status, hits };
}

function normalizeCurrentWoundData(raw) {
  const source = clonePlain(raw);
  const data = { version: CURRENT_WOUND_DATA_VERSION, locations: {} };

  for (const key of LOCATION_KEYS) {
    data.locations[key] = normalizeWoundLocation(source.locations?.[key]);
  }

  return data;
}

function isCurrentLocation(value) {
  return Boolean(
    value
    && !Array.isArray(value)
    && typeof value === "object"
    && STATUS_RANKS[String(value.status ?? "")]
    && Number.isFinite(Number(value.hits))
    && Number(value.hits) >= 0
  );
}

function migrateLegacyWoundData(raw) {
  const source = clonePlain(raw);
  const data = normalizeCurrentWoundData(source);
  const abdomen = normalizeWoundLocation(source.locations?.abdomen);
  const torso = data.locations.torso;

  if (source.locations && Object.prototype.hasOwnProperty.call(source.locations, "abdomen")) {
    const abdomenRank = STATUS_RANKS[abdomen.status] ?? 1;
    const torsoRank = STATUS_RANKS[torso.status] ?? 1;
    data.locations.torso = {
      status: abdomenRank > torsoRank ? abdomen.status : torso.status,
      hits: torso.hits + abdomen.hits
    };
  }

  const locations = source.locations && typeof source.locations === "object"
    ? source.locations
    : {};
  const needsWrite = Number(source.version) !== CURRENT_WOUND_DATA_VERSION
    || Object.prototype.hasOwnProperty.call(locations, "abdomen")
    || LOCATION_KEYS.some(key => !isCurrentLocation(locations[key]));

  return { data, needsWrite };
}

export {
  CURRENT_WOUND_DATA_VERSION,
  LOCATION_KEYS,
  WOUND_MIGRATION_VERSION,
  migrateLegacyWoundData,
  normalizeCurrentWoundData,
  normalizeWoundLocation
};
