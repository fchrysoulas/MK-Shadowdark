import { MODULE_ID } from "./constants.js";
import { isGroupActor } from "./actors.js";
import {
  GROUP_PROCEDURE_STATES,
  getGroupProcedureState,
} from "./procedure.js";

const GROUP_TIME_ADVANCED_HOOK = "mkShadowdarkGroupTimeAdvanced";
const GROUP_TIME_RESET_HOOK = "mkShadowdarkGroupTimeReset";
const GROUP_TIME_UPDATE_PATH = `flags.${MODULE_ID}.group.time`;

function nonNegativeSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function normalizeGroupTime(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const sourceElapsed = source.elapsed && typeof source.elapsed === "object" && !Array.isArray(source.elapsed)
    ? source.elapsed
    : {};

  const elapsed = {};
  for (const procedure of GROUP_PROCEDURE_STATES) {
    elapsed[procedure] = nonNegativeSeconds(sourceElapsed[procedure]);
  }

  return { elapsed };
}

function readStoredGroupTime(actor) {
  if (!actor) return undefined;

  try {
    const group = actor.getFlag?.(MODULE_ID, "group");
    if (group?.time !== undefined) return group.time;
  } catch (_error) {
    // Fall through to raw flag data for lightweight mocks and partial documents.
  }

  return actor.flags?.[MODULE_ID]?.group?.time;
}

function getGroupTimeState(actor) {
  return normalizeGroupTime(readStoredGroupTime(actor));
}

function normalizeProcedure(procedure, actor) {
  const requested = String(procedure ?? getGroupProcedureState(actor) ?? "").trim().toLowerCase();
  if (!GROUP_PROCEDURE_STATES.includes(requested)) {
    throw new RangeError(
      `Unknown Group procedure for time tracking: ${String(procedure ?? "")}. `
      + `Expected one of: ${GROUP_PROCEDURE_STATES.join(", ")}.`
    );
  }
  return requested;
}

function getGroupElapsedTime(actor, procedure = undefined) {
  const resolvedProcedure = normalizeProcedure(procedure, actor);
  return getGroupTimeState(actor).elapsed[resolvedProcedure];
}

function isStoredGroupTimeNormalized(actor) {
  const stored = readStoredGroupTime(actor);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return false;
  if (!stored.elapsed || typeof stored.elapsed !== "object" || Array.isArray(stored.elapsed)) return false;

  return GROUP_PROCEDURE_STATES.every(procedure => {
    const value = stored.elapsed[procedure];
    return Number.isInteger(value) && value >= 0;
  });
}

async function ensureGroupTimeState(actor, {
  user = globalThis.game?.user,
} = {}) {
  if (!actor?.update || !isGroupActor(actor) || !user?.isGM) return false;
  if (isStoredGroupTimeNormalized(actor)) return false;

  await actor.update({
    [GROUP_TIME_UPDATE_PATH]: getGroupTimeState(actor),
  });
  return true;
}

function currentWorldTime() {
  const value = Number(globalThis.game?.time?.worldTime ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function buildAdvanceResult({
  actor,
  procedure,
  seconds,
  previousElapsed,
  elapsed,
  worldTimeBefore,
  worldTimeAfter,
  syncWorldTime,
  reason,
}) {
  return {
    groupActorUuid: String(actor?.uuid ?? ""),
    procedure,
    seconds,
    previousElapsed,
    elapsed,
    worldTimeBefore,
    worldTimeAfter,
    worldTimeAdvanced: Boolean(syncWorldTime),
    reason: String(reason ?? "").trim(),
  };
}

function normalizeTimePassesPresentation(value) {
  if (value === true) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...value };
}

async function presentGroupTimeAdvance(actor, transition, presentation) {
  const options = normalizeTimePassesPresentation(presentation);
  if (!options) return null;

  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.timePasses;
  const present = api?.present ?? api?.timePasses;
  if (typeof present !== "function") {
    return {
      requested: true,
      presented: false,
      reason: "time-passes-unavailable",
    };
  }

  try {
    const result = await present({
      ...options,
      groupActorUuid: String(actor?.uuid ?? ""),
      procedure: transition.procedure,
      seconds: transition.seconds,
      reason: transition.reason,
    });

    return {
      requested: true,
      presented: Boolean(result?.presented ?? result),
      reason: "",
    };
  } catch (error) {
    console.warn(`${MODULE_ID} | Group Time | Time Passes presentation failed.`, error);
    return {
      requested: true,
      presented: false,
      reason: "time-passes-error",
    };
  }
}

async function advanceGroupTime(actor, seconds, {
  procedure = undefined,
  syncWorldTime = true,
  user = globalThis.game?.user,
  reason = "",
  notify = true,
  presentation = false,
} = {}) {
  if (!actor?.update) {
    throw new TypeError("A Group Actor document is required to advance Group time.");
  }
  if (!isGroupActor(actor)) {
    throw new TypeError("Group time can only be advanced on an MK-Shadowdark Group actor.");
  }
  if (!user?.isGM) {
    if (notify) {
      globalThis.ui?.notifications?.warn?.("Only the GM can advance Group time.");
    }
    return null;
  }

  const delta = Number(seconds);
  if (!Number.isFinite(delta) || delta <= 0 || !Number.isInteger(delta)) {
    throw new RangeError("Group time advancement must be a positive whole number of seconds.");
  }

  const resolvedProcedure = normalizeProcedure(procedure, actor);
  const previousState = getGroupTimeState(actor);
  const previousElapsed = previousState.elapsed[resolvedProcedure];
  const nextState = normalizeGroupTime(previousState);
  nextState.elapsed[resolvedProcedure] = previousElapsed + delta;

  const worldTimeBefore = currentWorldTime();
  let worldTimeAfter = worldTimeBefore;

  await actor.update({
    [GROUP_TIME_UPDATE_PATH]: nextState,
  });

  if (syncWorldTime) {
    const advance = globalThis.game?.time?.advance;
    if (typeof advance !== "function") {
      try {
        await actor.update({
          [GROUP_TIME_UPDATE_PATH]: previousState,
        });
      } catch (rollbackError) {
        console.error(`${MODULE_ID} | Group Time | Could not roll back Group time state.`, rollbackError);
      }
      throw new Error("Foundry world time is unavailable; Group time was not advanced.");
    }

    try {
      const result = await advance.call(globalThis.game.time, delta, {
        mkShadowdark: {
          groupActorUuid: String(actor.uuid ?? ""),
          procedure: resolvedProcedure,
          reason: String(reason ?? "").trim(),
        },
      });
      const numericResult = Number(result);
      worldTimeAfter = Number.isFinite(numericResult) ? numericResult : currentWorldTime();
    } catch (error) {
      try {
        await actor.update({
          [GROUP_TIME_UPDATE_PATH]: previousState,
        });
      } catch (rollbackError) {
        console.error(`${MODULE_ID} | Group Time | Could not roll back Group time state.`, rollbackError);
      }
      throw error;
    }
  }

  const transition = buildAdvanceResult({
    actor,
    procedure: resolvedProcedure,
    seconds: delta,
    previousElapsed,
    elapsed: nextState.elapsed[resolvedProcedure],
    worldTimeBefore,
    worldTimeAfter,
    syncWorldTime,
    reason,
  });

  const presentationResult = await presentGroupTimeAdvance(actor, transition, presentation);
  if (presentationResult) transition.presentation = presentationResult;

  globalThis.Hooks?.callAll?.(GROUP_TIME_ADVANCED_HOOK, actor, transition);
  return transition;
}

async function resetGroupTime(actor, procedure = undefined, {
  user = globalThis.game?.user,
  notify = true,
  reason = "",
} = {}) {
  if (!actor?.update) {
    throw new TypeError("A Group Actor document is required to reset Group time.");
  }
  if (!isGroupActor(actor)) {
    throw new TypeError("Group time can only be reset on an MK-Shadowdark Group actor.");
  }
  if (!user?.isGM) {
    if (notify) {
      globalThis.ui?.notifications?.warn?.("Only the GM can reset Group time.");
    }
    return null;
  }

  const previousState = getGroupTimeState(actor);
  const nextState = normalizeGroupTime(previousState);
  let resolvedProcedure = null;

  if (procedure === undefined || procedure === null || procedure === "") {
    for (const key of GROUP_PROCEDURE_STATES) nextState.elapsed[key] = 0;
  } else {
    resolvedProcedure = normalizeProcedure(procedure, actor);
    nextState.elapsed[resolvedProcedure] = 0;
  }

  await actor.update({
    [GROUP_TIME_UPDATE_PATH]: nextState,
  });

  const transition = {
    groupActorUuid: String(actor.uuid ?? ""),
    procedure: resolvedProcedure,
    previousState,
    state: nextState,
    reason: String(reason ?? "").trim(),
  };

  globalThis.Hooks?.callAll?.(GROUP_TIME_RESET_HOOK, actor, transition);
  return transition;
}

function exposeGroupTimeApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupTime = {
    advancedHook: GROUP_TIME_ADVANCED_HOOK,
    resetHook: GROUP_TIME_RESET_HOOK,
    getState: getGroupTimeState,
    getElapsed: getGroupElapsedTime,
    advance: advanceGroupTime,
    reset: resetGroupTime,
  };

  return module.api.groupTime;
}

function registerGroupTimeService() {
  globalThis.Hooks?.once?.("ready", async () => {
    exposeGroupTimeApi();

    if (!globalThis.game?.user?.isGM) return;
    for (const actor of globalThis.game?.actors ?? []) {
      try {
        await ensureGroupTimeState(actor);
      } catch (error) {
        console.warn(`${MODULE_ID} | Group Time | Could not initialize ${actor?.name ?? actor?.id ?? "Group"}.`, error);
      }
    }
  });

  globalThis.Hooks?.on?.("createActor", async actor => {
    if (!globalThis.game?.user?.isGM) return;
    try {
      await ensureGroupTimeState(actor);
    } catch (error) {
      console.warn(`${MODULE_ID} | Group Time | Could not initialize new Group actor.`, error);
    }
  });
}

export {
  GROUP_TIME_ADVANCED_HOOK,
  GROUP_TIME_RESET_HOOK,
  normalizeGroupTime,
  getGroupTimeState,
  getGroupElapsedTime,
  ensureGroupTimeState,
  normalizeTimePassesPresentation,
  presentGroupTimeAdvance,
  advanceGroupTime,
  resetGroupTime,
  exposeGroupTimeApi,
  registerGroupTimeService,
};
