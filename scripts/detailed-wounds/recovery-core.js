import {
  WOUND_LOCATION_RULES,
  getWoundOutcome
} from "./detailed-wounds-migration.js";

const RECOVERY_KIND = Object.freeze({
  NONE: "none",
  TEMPORARY_ROUNDS: "temporary-rounds",
  REST_DAYS: "rest-days",
  MANUAL: "manual",
  PERMANENT: "permanent",
  CATASTROPHIC: "catastrophic"
});

const CATASTROPHIC_OUTCOME_KEYS = new Set([
  "instantDeath",
  "heart",
  "lostHand",
  "lostArm",
  "lostFoot",
  "lostLeg"
]);

const LOCATION_KEYS = Object.freeze(WOUND_LOCATION_RULES.map(location => location.key));

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function isActiveWound(wound) {
  if (!wound || typeof wound !== "object") return false;
  if (wound.resultKey && wound.resultKey !== "scar") return true;
  return String(wound.status ?? "ok").toLowerCase() !== "ok";
}

function getStoredOutcome(locationKey, wound) {
  const severityRoll = Number(wound?.severityRoll);
  if (!Number.isFinite(severityRoll) || severityRoll <= 0) return null;

  const outcome = getWoundOutcome(locationKey, severityRoll);
  if (!outcome) return null;
  if (wound?.resultKey && wound.resultKey !== outcome.key) return null;
  return outcome;
}

function classifyWoundRecovery(locationKey, wound) {
  if (!isActiveWound(wound)) {
    return { kind: RECOVERY_KIND.NONE, outcome: null };
  }

  const outcome = getStoredOutcome(locationKey, wound);
  if (!outcome) {
    return { kind: RECOVERY_KIND.MANUAL, outcome: null };
  }

  if (CATASTROPHIC_OUTCOME_KEYS.has(outcome.key)) {
    return { kind: RECOVERY_KIND.CATASTROPHIC, outcome };
  }

  if (outcome.permanent === true) {
    return { kind: RECOVERY_KIND.PERMANENT, outcome };
  }

  if (outcome.durationUnit === "rounds") {
    return { kind: RECOVERY_KIND.TEMPORARY_ROUNDS, outcome };
  }

  if (outcome.durationUnit === "days") {
    return { kind: RECOVERY_KIND.REST_DAYS, outcome };
  }

  return { kind: RECOVERY_KIND.MANUAL, outcome };
}

function clearedWoundEntry(wound) {
  const cleared = {
    ...(clonePlain(wound) ?? {}),
    status: "ok",
    hits: 0,
    severityRoll: 0,
    resultKey: null
  };

  delete cleared.durationValue;
  delete cleared.saveTotal;
  delete cleared.saveSuccess;
  delete cleared.legacy;
  return cleared;
}

function positiveInteger(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function recoveryStepForKind(kind, { rounds = 0, restDays = 0 } = {}) {
  if (kind === RECOVERY_KIND.TEMPORARY_ROUNDS) return positiveInteger(rounds);
  if (kind === RECOVERY_KIND.REST_DAYS) return positiveInteger(restDays);
  return 0;
}

function advanceWoundRecovery(rawData, { rounds = 0, restDays = 0 } = {}) {
  const data = clonePlain(rawData) ?? { version: 3, locations: {} };
  if (!data.locations || typeof data.locations !== "object" || Array.isArray(data.locations)) {
    data.locations = {};
  }

  let changed = false;
  const transitions = [];

  for (const locationKey of LOCATION_KEYS) {
    const wound = data.locations[locationKey];
    const classification = classifyWoundRecovery(locationKey, wound);
    const step = recoveryStepForKind(classification.kind, { rounds, restDays });
    const before = positiveInteger(wound?.durationValue);

    // Existing records without a rolled duration are intentionally left for GM
    // adjudication rather than inventing or rerolling a duration retroactively.
    if (step <= 0 || before <= 0) continue;

    const after = Math.max(0, before - step);
    if (after === before) continue;

    changed = true;
    if (after === 0) {
      data.locations[locationKey] = clearedWoundEntry(wound);
    } else {
      data.locations[locationKey] = {
        ...wound,
        durationValue: after
      };
    }

    transitions.push({
      locationKey,
      kind: classification.kind,
      outcomeKey: classification.outcome?.key ?? null,
      before,
      after,
      recovered: after === 0
    });
  }

  return { data, changed, transitions };
}

export {
  CATASTROPHIC_OUTCOME_KEYS,
  RECOVERY_KIND,
  advanceWoundRecovery,
  classifyWoundRecovery,
  getStoredOutcome
};
