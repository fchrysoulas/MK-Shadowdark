import {
  getWoundOutcome,
  normalizeCurrentWoundData
} from "./detailed-wounds-migration.js";

const DEFAULT_BASE_HANDS = 2;
const UPPER_LIMB_LOCATIONS = Object.freeze(["rightArm", "leftArm"]);
const LOWER_LIMB_LOCATIONS = Object.freeze(["rightLeg", "leftLeg"]);
const UPPER_LIMB_LOSS_KEYS = new Set(["lostHand", "lostArm"]);
const LOWER_LIMB_LOSS_KEYS = new Set(["lostFoot", "lostLeg"]);

function normalizeBaseHands(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.max(0, number) : DEFAULT_BASE_HANDS;
}

function sideForLocation(locationKey) {
  if (locationKey.startsWith("right")) return "right";
  if (locationKey.startsWith("left")) return "left";
  return null;
}

function getStoredOutcome(locationKey, wound) {
  if (!wound || Number(wound.severityRoll) <= 0) return null;

  const outcome = getWoundOutcome(locationKey, wound.severityRoll);
  if (!outcome) return null;

  const storedKey = typeof wound.resultKey === "string" && wound.resultKey.trim()
    ? wound.resultKey.trim()
    : null;

  return !storedKey || storedKey === outcome.key ? outcome : null;
}

function createLossRecord(locationKey, wound, outcome) {
  return Object.freeze({
    location: locationKey,
    side: sideForLocation(locationKey),
    outcomeKey: outcome.key,
    label: outcome.label,
    severityRoll: Number(wound.severityRoll) || 0
  });
}

function deriveWoundFunctionalState(rawWoundData, { baseHands = DEFAULT_BASE_HANDS } = {}) {
  const data = normalizeCurrentWoundData(rawWoundData);
  const normalizedBaseHands = normalizeBaseHands(baseHands);
  const upperLimbLosses = [];
  const lowerLimbLosses = [];

  for (const locationKey of UPPER_LIMB_LOCATIONS) {
    const wound = data.locations[locationKey];
    const outcome = getStoredOutcome(locationKey, wound);
    if (outcome && UPPER_LIMB_LOSS_KEYS.has(outcome.key)) {
      upperLimbLosses.push(createLossRecord(locationKey, wound, outcome));
    }
  }

  for (const locationKey of LOWER_LIMB_LOCATIONS) {
    const wound = data.locations[locationKey];
    const outcome = getStoredOutcome(locationKey, wound);
    if (outcome && LOWER_LIMB_LOSS_KEYS.has(outcome.key)) {
      lowerLimbLosses.push(createLossRecord(locationKey, wound, outcome));
    }
  }

  const unavailableHands = Math.min(normalizedBaseHands, upperLimbLosses.length);
  const usableHands = Math.max(0, normalizedBaseHands - unavailableHands);
  const hasLostLeg = lowerLimbLosses.some(loss => loss.outcomeKey === "lostLeg");

  return Object.freeze({
    baseHands: normalizedBaseHands,
    usableHands,
    unavailableHands,
    upperLimbLosses: Object.freeze(upperLimbLosses),
    mobility: Object.freeze({
      restricted: lowerLimbLosses.length > 0,
      cannotRun: lowerLimbLosses.length > 0,
      severity: hasLostLeg ? "severe" : (lowerLimbLosses.length ? "restricted" : "none"),
      lowerLimbLosses: Object.freeze(lowerLimbLosses)
    })
  });
}

export {
  DEFAULT_BASE_HANDS,
  LOWER_LIMB_LOCATIONS,
  UPPER_LIMB_LOCATIONS,
  deriveWoundFunctionalState,
  getStoredOutcome,
  normalizeBaseHands
};
