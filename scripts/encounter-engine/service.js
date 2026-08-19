import { SETTINGS } from "./constants.js";
import {
  currentScene,
  resolveUuid,
  setting,
} from "./helpers.js";
import {
  getSceneEnvironmentContext,
  resolveEnvironmentContext,
} from "../libs/environment-context.js";
import {
  buildEncounterData,
  drawEncounterResult,
  evaluateRoll,
  rollTotal,
} from "./resolver.js";

const ENCOUNTER_SERVICE_VERSION = 1;

const ENCOUNTER_FAILURE = Object.freeze({
  NOT_GM: "not-gm",
  DISABLED: "disabled",
  MISSING_TABLE: "missing-table",
  INVALID_TABLE: "invalid-table",
  EMPTY_TABLE: "empty-table",
});

function encounterServiceGuard(options = {}) {
  const user = options.user ?? globalThis.game?.user;
  if (options.requireGm !== false && !user?.isGM) return ENCOUNTER_FAILURE.NOT_GM;
  if (options.respectEnabled !== false && !setting(SETTINGS.enabled, true)) return ENCOUNTER_FAILURE.DISABLED;
  return "";
}

function getEncounterServiceContext(options = {}) {
  const scene = options.scene ?? currentScene();
  const sceneContext = getSceneEnvironmentContext(scene);
  const rawContext = {
    terrain: options.terrain ?? sceneContext.terrain,
    dangerLevel: options.dangerLevel ?? sceneContext.dangerLevel,
    period: options.period ?? sceneContext.period,
    tableUuid: options.tableUuid ?? sceneContext.tableUuid,
  };

  return resolveEnvironmentContext(rawContext, {
    scene,
    worldTime: options.worldTime,
  });
}

function buildEncounterCheckDefinition(context) {
  const encounter = context?.encounter ?? {};
  const disabled = encounter?.disabled === true || String(context?.dangerLevel ?? "") === "safe";
  const encounterOn = disabled
    ? []
    : Array.isArray(encounter.encounterOn)
      ? [...new Set(encounter.encounterOn.map(Number).filter(Number.isFinite))]
      : [1];

  return {
    dangerLevel: String(context?.dangerLevel ?? "unsafe"),
    label: String(context?.danger?.label ?? context?.dangerLevel ?? "Unsafe"),
    disabled,
    interval: disabled ? 0 : Math.max(1, Math.floor(Number(encounter.interval ?? 1) || 1)),
    formula: disabled ? "" : String(encounter.formula ?? "1d6"),
    encounterOn: disabled ? [] : encounterOn.length ? encounterOn : [1],
  };
}

function encounterOccurs(total, encounterOn) {
  const numericTotal = Number(total);
  const triggers = Array.isArray(encounterOn) ? encounterOn.map(Number) : [1];
  return Number.isFinite(numericTotal) && triggers.includes(numericTotal);
}

function baseServiceResult({ context = null, reason = "" } = {}) {
  return {
    check: null,
    isEncounter: false,
    encounter: null,
    context,
    reason,
  };
}

async function checkEncounterService(options = {}) {
  const context = getEncounterServiceContext(options);
  const guardReason = encounterServiceGuard(options);
  if (guardReason) return baseServiceResult({ context, reason: guardReason });

  const definition = buildEncounterCheckDefinition(context);
  if (definition.disabled) {
    return {
      check: {
        ...definition,
        total: null,
        isEncounter: false,
      },
      isEncounter: false,
      encounter: null,
      context,
      reason: "",
    };
  }

  const roll = await evaluateRoll(definition.formula, "Random Encounter Check");
  const total = rollTotal(roll, 0);
  const isEncounter = encounterOccurs(total, definition.encounterOn);
  const check = {
    ...definition,
    total,
    isEncounter,
  };

  return {
    check,
    isEncounter,
    encounter: null,
    context,
    reason: "",
  };
}

async function resolveEncounterService(options = {}) {
  const context = getEncounterServiceContext(options);
  const guardReason = encounterServiceGuard(options);
  if (guardReason) return baseServiceResult({ context, reason: guardReason });

  const tableUuid = String(context.tableUuid ?? "");
  if (!tableUuid) {
    return {
      ...baseServiceResult({ context, reason: ENCOUNTER_FAILURE.MISSING_TABLE }),
      isEncounter: true,
    };
  }

  const table = await resolveUuid(tableUuid);
  if (!table || table.documentName !== "RollTable") {
    return {
      ...baseServiceResult({ context, reason: ENCOUNTER_FAILURE.INVALID_TABLE }),
      isEncounter: true,
    };
  }

  const draw = await drawEncounterResult(tableUuid, context.profile, context.period);
  if (!draw?.encounter) {
    return {
      ...baseServiceResult({ context, reason: ENCOUNTER_FAILURE.EMPTY_TABLE }),
      isEncounter: true,
    };
  }

  const data = await buildEncounterData({
    profileId: context.profileId,
    profile: context.profile,
    terrain: context.terrain,
    dangerLevel: context.dangerLevel,
    requestedPeriod: context.requestedPeriod,
    period: context.period,
    tableUuid,
    tableName: table.name,
    draw,
    options,
  });

  return {
    check: null,
    isEncounter: true,
    encounter: data,
    context,
    reason: "",
  };
}

async function checkAndResolveEncounterService(options = {}) {
  const checked = await checkEncounterService(options);
  if (checked.reason || !checked.isEncounter) return checked;

  const resolved = await resolveEncounterService(options);
  return {
    check: checked.check,
    isEncounter: true,
    encounter: resolved.encounter,
    context: resolved.context ?? checked.context,
    reason: resolved.reason,
  };
}

function createEncounterServiceApi() {
  return Object.freeze({
    version: ENCOUNTER_SERVICE_VERSION,
    failureReasons: ENCOUNTER_FAILURE,
    getContext: getEncounterServiceContext,
    check: checkEncounterService,
    resolve: resolveEncounterService,
    checkAndResolve: checkAndResolveEncounterService,
  });
}

export {
  ENCOUNTER_SERVICE_VERSION,
  ENCOUNTER_FAILURE,
  encounterServiceGuard,
  getEncounterServiceContext,
  buildEncounterCheckDefinition,
  encounterOccurs,
  checkEncounterService,
  resolveEncounterService,
  checkAndResolveEncounterService,
  createEncounterServiceApi,
};