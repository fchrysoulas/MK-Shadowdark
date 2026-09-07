const CURRENT_WOUND_DATA_VERSION = 3;
const WOUND_MIGRATION_VERSION = 2;

const STATUS_RANKS = Object.freeze({
  ok: 1,
  wounded: 2,
  critical: 3,
  destroyed: 4
});

const WOUND_LOCATION_RULES = Object.freeze([
  { key: "head", label: "Head", rolls: Object.freeze([1]), table: "head" },
  { key: "rightArm", label: "Right Arm", rolls: Object.freeze([2, 3]), table: "arms" },
  { key: "leftArm", label: "Left Arm", rolls: Object.freeze([4, 5]), table: "arms" },
  { key: "body", label: "Body", rolls: Object.freeze([6, 7, 8]), table: "body" },
  { key: "rightLeg", label: "Right Leg", rolls: Object.freeze([9]), table: "legs" },
  { key: "leftLeg", label: "Left Leg", rolls: Object.freeze([10]), table: "legs" }
]);

const LOCATION_KEYS = Object.freeze(WOUND_LOCATION_RULES.map(location => location.key));

const LEGACY_LOCATION_KEYS = Object.freeze([
  "head",
  "leftArm",
  "leftHand",
  "leftLeg",
  "leftFoot",
  "torso",
  "abdomen",
  "rightArm",
  "rightHand",
  "rightLeg",
  "rightFoot"
]);

const LEGACY_SEVERITY_RANKS = Object.freeze({
  minor: 2,
  moderate: 2,
  severe: 3,
  critical: 3
});

const WOUND_TABLES = Object.freeze({
  head: Object.freeze([
    Object.freeze({
      min: 1,
      max: 2,
      key: "scar",
      label: "Scar",
      status: "ok",
      consequence: "A scar only."
    }),
    Object.freeze({
      min: 3,
      max: 6,
      key: "concussion",
      label: "Concussion",
      status: "wounded",
      consequence: "DISADV on all checks and attacks for 1d4 rounds.",
      durationFormula: "1d4",
      durationUnit: "rounds"
    }),
    Object.freeze({
      min: 7,
      max: 7,
      key: "brokenJaw",
      label: "Broken Jaw",
      status: "wounded",
      consequence: "Cannot speak or cast spells for 2d6 days of rest.",
      durationFormula: "2d6",
      durationUnit: "days"
    }),
    Object.freeze({
      min: 8,
      max: 8,
      key: "lostTeeth",
      label: "Lost Teeth",
      status: "critical",
      consequence: "-1 CHA permanently.",
      changes: Object.freeze([["cha", -1]]),
      permanent: true
    }),
    Object.freeze({
      min: 9,
      max: 9,
      key: "lostEye",
      label: "Lost Eye",
      status: "critical",
      consequence: "DISADV on WIS checks permanently.",
      permanent: true
    }),
    Object.freeze({
      min: 10,
      max: 10,
      key: "instantDeath",
      label: "Head",
      status: "destroyed",
      consequence: "Instant death.",
      fatal: true
    })
  ]),
  body: Object.freeze([
    Object.freeze({
      min: 1,
      max: 2,
      key: "scar",
      label: "Scar",
      status: "ok",
      consequence: "A scar only."
    }),
    Object.freeze({
      min: 3,
      max: 6,
      key: "cripplingPain",
      label: "Crippling Pain",
      status: "wounded",
      consequence: "-1 CON.",
      changes: Object.freeze([["con", -1]])
    }),
    Object.freeze({
      min: 7,
      max: 8,
      key: "brokenRibs",
      label: "Broken Ribs",
      status: "wounded",
      consequence: "-1 CON.",
      changes: Object.freeze([["con", -1]])
    }),
    Object.freeze({
      min: 9,
      max: 9,
      key: "internalOrganBleeding",
      label: "Internal Organ Bleeding",
      status: "critical",
      consequence: "-2 CON.",
      changes: Object.freeze([["con", -2]]),
      bleeding: true
    }),
    Object.freeze({
      min: 10,
      max: 10,
      key: "heart",
      label: "Heart",
      status: "destroyed",
      consequence: "DC 12 CON or die.",
      save: Object.freeze({ ability: "con", dc: 12 })
    })
  ]),
  arms: Object.freeze([
    Object.freeze({
      min: 1,
      max: 2,
      key: "scar",
      label: "Scar",
      status: "ok",
      consequence: "A scar only."
    }),
    Object.freeze({
      min: 3,
      max: 6,
      key: "cripplingPain",
      label: "Crippling Pain",
      status: "wounded",
      consequence: "-1 CON; drop anything held in that hand.",
      changes: Object.freeze([["con", -1]])
    }),
    Object.freeze({
      min: 7,
      max: 8,
      key: "brokenArm",
      label: "Broken Arm",
      status: "wounded",
      consequence: "2d6 days of rest.",
      durationFormula: "2d6",
      durationUnit: "days"
    }),
    Object.freeze({
      min: 9,
      max: 9,
      key: "lostHand",
      label: "Lost Hand",
      status: "critical",
      consequence: "-1 DEX and -1 STR.",
      changes: Object.freeze([["dex", -1], ["str", -1]])
    }),
    Object.freeze({
      min: 10,
      max: 10,
      key: "lostArm",
      label: "Lost Arm",
      status: "destroyed",
      consequence: "Bleeding; -2 DEX and -2 STR.",
      changes: Object.freeze([["dex", -2], ["str", -2]]),
      bleeding: true
    })
  ]),
  legs: Object.freeze([
    Object.freeze({
      min: 1,
      max: 2,
      key: "scar",
      label: "Scar",
      status: "ok",
      consequence: "A scar only."
    }),
    Object.freeze({
      min: 3,
      max: 6,
      key: "cripplingPain",
      label: "Crippling Pain",
      status: "wounded",
      consequence: "-1 CON; fall prone.",
      changes: Object.freeze([["con", -1]]),
      prone: true
    }),
    Object.freeze({
      min: 7,
      max: 8,
      key: "brokenLeg",
      label: "Broken Leg",
      status: "wounded",
      consequence: "2d6 days of rest.",
      durationFormula: "2d6",
      durationUnit: "days"
    }),
    Object.freeze({
      min: 9,
      max: 9,
      key: "lostFoot",
      label: "Lost Foot",
      status: "critical",
      consequence: "Cannot run; -1 DEX and -1 STR.",
      changes: Object.freeze([["dex", -1], ["str", -1]])
    }),
    Object.freeze({
      min: 10,
      max: 10,
      key: "lostLeg",
      label: "Lost Leg",
      status: "destroyed",
      consequence: "Bleeding; -2 DEX and -2 STR.",
      changes: Object.freeze([["dex", -2], ["str", -2]]),
      bleeding: true
    })
  ])
});

const LEGACY_TO_CURRENT = Object.freeze({
  head: Object.freeze(["head"]),
  rightArm: Object.freeze(["rightArm", "rightHand"]),
  leftArm: Object.freeze(["leftArm", "leftHand"]),
  body: Object.freeze(["body", "torso", "abdomen"]),
  rightLeg: Object.freeze(["rightLeg", "rightFoot"]),
  leftLeg: Object.freeze(["leftLeg", "leftFoot"])
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
    ? String(value.status ?? value.level ?? "").toLowerCase()
    : "";
  const normalizedStatus = directStatus === "wound" ? "wounded" : directStatus;
  if (STATUS_RANKS[normalizedStatus]) return normalizedStatus;

  if (!Array.isArray(value) || value.length === 0) return "ok";

  const highestRank = value.reduce(
    (rank, wound) => Math.max(rank, LEGACY_SEVERITY_RANKS[String(wound?.severity ?? "").toLowerCase()] ?? 1),
    1
  );
  return statusForRank(highestRank);
}

function clampInteger(value, minimum, maximum) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return minimum;
  return Math.min(Math.max(number, minimum), maximum);
}

function normalizeWoundLocation(value) {
  const objectValue = value && !Array.isArray(value) && typeof value === "object" ? value : null;
  const status = normalizeLegacyStatus(value);
  const hits = Array.isArray(value)
    ? value.length
    : Math.max(0, Math.floor(Number(objectValue?.hits) || (status === "ok" ? 0 : 1)));
  const severityRoll = clampInteger(objectValue?.severityRoll ?? 0, 0, 10);
  const resultKey = typeof objectValue?.resultKey === "string" && objectValue.resultKey.trim()
    ? objectValue.resultKey.trim()
    : null;
  const normalized = {
    status,
    hits,
    severityRoll,
    resultKey
  };

  if (objectValue?.legacy === true) normalized.legacy = true;

  const durationValue = Math.floor(Number(objectValue?.durationValue));
  if (Number.isFinite(durationValue) && durationValue > 0) normalized.durationValue = durationValue;

  const saveTotal = Number(objectValue?.saveTotal);
  if (Number.isFinite(saveTotal)) normalized.saveTotal = saveTotal;
  if (typeof objectValue?.saveSuccess === "boolean") normalized.saveSuccess = objectValue.saveSuccess;

  return normalized;
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
    && STATUS_RANKS[String(value.status ?? "").toLowerCase()]
    && Number.isFinite(Number(value.hits))
    && Number(value.hits) >= 0
    && Number.isFinite(Number(value.severityRoll))
    && Number(value.severityRoll) >= 0
    && Number(value.severityRoll) <= 10
    && (value.resultKey === null || typeof value.resultKey === "string" || value.resultKey === undefined)
  );
}

function getWoundLocationForRoll(locationRoll) {
  const roll = clampInteger(locationRoll, 1, 10);
  return WOUND_LOCATION_RULES.find(location => location.rolls.includes(roll)) ?? WOUND_LOCATION_RULES[0];
}

function getWoundOutcome(locationKey, severityRoll) {
  const location = WOUND_LOCATION_RULES.find(entry => entry.key === locationKey);
  const table = location ? WOUND_TABLES[location.table] : null;
  const roll = clampInteger(severityRoll, 1, 10);
  return table?.find(outcome => roll >= outcome.min && roll <= outcome.max) ?? null;
}

function getNextWoundSeverityRoll(severityRoll) {
  const roll = clampInteger(severityRoll, 0, 10);
  if (roll <= 2) return 3;
  if (roll <= 6) return 7;
  if (roll <= 8) return 9;
  return 10;
}

function getPreviousWoundSeverityRoll(severityRoll) {
  const roll = clampInteger(severityRoll, 0, 10);
  if (roll <= 6) return 0;
  if (roll <= 8) return 3;
  if (roll === 9) return 7;
  return 9;
}

function mergeLegacyLocations(sourceLocations, keys) {
  const records = keys
    .filter(key => Object.prototype.hasOwnProperty.call(sourceLocations, key))
    .map(key => normalizeWoundLocation(sourceLocations[key]));
  if (!records.length) return normalizeWoundLocation(null);

  const highestRank = records.reduce(
    (rank, record) => Math.max(rank, STATUS_RANKS[record.status] ?? 1),
    1
  );
  const hits = records.reduce((total, record) => total + Math.max(0, Number(record.hits) || 0), 0);

  return {
    status: statusForRank(highestRank),
    hits,
    severityRoll: 0,
    resultKey: null,
    legacy: true
  };
}

function migrateLegacyWoundData(raw) {
  const source = clonePlain(raw);
  const locations = source.locations && typeof source.locations === "object" && !Array.isArray(source.locations)
    ? source.locations
    : {};
  const data = { version: CURRENT_WOUND_DATA_VERSION, locations: {} };
  const hasCompleteCurrentData = Number(source.version) === CURRENT_WOUND_DATA_VERSION
    && LOCATION_KEYS.every(key => isCurrentLocation(locations[key]));

  if (hasCompleteCurrentData) {
    for (const key of LOCATION_KEYS) data.locations[key] = normalizeWoundLocation(locations[key]);

    const hasObsoleteLocations = Object.keys(locations).some(key => !LOCATION_KEYS.includes(key));
    return { data, needsWrite: hasObsoleteLocations };
  }

  for (const location of WOUND_LOCATION_RULES) {
    data.locations[location.key] = mergeLegacyLocations(locations, LEGACY_TO_CURRENT[location.key]);
  }

  return {
    data,
    needsWrite: Number(source.version) !== CURRENT_WOUND_DATA_VERSION
      || Object.keys(locations).some(key => !LOCATION_KEYS.includes(key))
      || LOCATION_KEYS.some(key => !isCurrentLocation(locations[key]))
  };
}

export {
  CURRENT_WOUND_DATA_VERSION,
  LEGACY_LOCATION_KEYS,
  LOCATION_KEYS,
  STATUS_RANKS,
  WOUND_LOCATION_RULES,
  WOUND_MIGRATION_VERSION,
  WOUND_TABLES,
  getNextWoundSeverityRoll,
  getPreviousWoundSeverityRoll,
  getWoundLocationForRoll,
  getWoundOutcome,
  migrateLegacyWoundData,
  normalizeCurrentWoundData,
  normalizeWoundLocation
};
