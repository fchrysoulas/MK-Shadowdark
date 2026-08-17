import { MODULE_ID } from "./constants.js";

const GROUP_PROCEDURE = Object.freeze({
  EXPLORATION: "exploration",
  RESTING: "resting",
  COMBAT: "combat",
  DOWNTIME: "downtime",
});

const GROUP_PROCEDURE_STATES = Object.freeze(Object.values(GROUP_PROCEDURE));
const GROUP_PROCEDURE_STATE_SET = new Set(GROUP_PROCEDURE_STATES);
const GROUP_PROCEDURE_DEFAULT_STATE = GROUP_PROCEDURE.DOWNTIME;
const GROUP_PROCEDURE_HOOK = "mkShadowdarkGroupProcedureChanged";
const GROUP_PROCEDURE_UPDATE_PATH = `flags.${MODULE_ID}.group.procedure`;

function parseGroupProcedureState(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return GROUP_PROCEDURE_STATE_SET.has(normalized) ? normalized : null;
}

function normalizeGroupProcedure(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

  return {
    state: parseGroupProcedureState(source.state) ?? GROUP_PROCEDURE_DEFAULT_STATE,
  };
}

function readModuleFlag(actor, key, fallback = undefined) {
  if (!actor || !key) return fallback;

  try {
    const value = actor.getFlag?.(MODULE_ID, key);
    if (value !== undefined) return value;
  } catch (_error) {
    // Fall through to direct flag data for lightweight mocks and partial documents.
  }

  return actor.flags?.[MODULE_ID]?.[key] ?? fallback;
}

function isGroupActor(actor) {
  return Boolean(readModuleFlag(actor, "isGroup", false));
}

function getStoredGroupProcedure(actor) {
  return readModuleFlag(actor, "group", {})?.procedure;
}

function getGroupProcedure(actor) {
  return normalizeGroupProcedure(getStoredGroupProcedure(actor));
}

function getGroupProcedureState(actor) {
  return getGroupProcedure(actor).state;
}

function createGroupProcedureTransition(previousState, state, reason = "") {
  return {
    changed: previousState !== state,
    previousState,
    state,
    reason: String(reason ?? "").trim(),
  };
}

function emitGroupProcedureTransition(actor, transition) {
  if (!transition?.changed) return transition;
  globalThis.Hooks?.callAll?.(GROUP_PROCEDURE_HOOK, actor, transition);
  return transition;
}

async function setGroupProcedureState(actor, state, {
  user = globalThis.game?.user,
  reason = "",
  notify = true,
} = {}) {
  if (!actor?.update) {
    throw new TypeError("A Group Actor document is required to change procedure state.");
  }

  if (!isGroupActor(actor)) {
    throw new TypeError("Procedure state can only be changed on an MK-Shadowdark Group actor.");
  }

  if (!user?.isGM) {
    if (notify) {
      globalThis.ui?.notifications?.warn?.("Only the GM can change the Group procedure state.");
    }

    return {
      ...createGroupProcedureTransition(getGroupProcedureState(actor), getGroupProcedureState(actor), reason),
      denied: true,
    };
  }

  const nextState = parseGroupProcedureState(state);
  if (!nextState) {
    throw new RangeError(
      `Unknown Group procedure state: ${String(state ?? "")}. `
      + `Expected one of: ${GROUP_PROCEDURE_STATES.join(", ")}.`
    );
  }

  const previousState = getGroupProcedureState(actor);
  const transition = createGroupProcedureTransition(previousState, nextState, reason);
  if (!transition.changed) return transition;

  await actor.update({
    [GROUP_PROCEDURE_UPDATE_PATH]: {
      state: nextState,
    },
  });

  return emitGroupProcedureTransition(actor, transition);
}

async function ensureGroupProcedureState(actor, {
  user = globalThis.game?.user,
} = {}) {
  if (!actor?.update || !isGroupActor(actor) || !user?.isGM) return false;

  const storedState = parseGroupProcedureState(getStoredGroupProcedure(actor)?.state);
  if (storedState) return false;

  await actor.update({
    [GROUP_PROCEDURE_UPDATE_PATH]: {
      state: GROUP_PROCEDURE_DEFAULT_STATE,
    },
  });

  return true;
}

function exposeGroupProcedureApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupProcedure = {
    states: GROUP_PROCEDURE_STATES,
    defaultState: GROUP_PROCEDURE_DEFAULT_STATE,
    get: getGroupProcedure,
    getState: getGroupProcedureState,
    setState: setGroupProcedureState,
  };

  return module.api.groupProcedure;
}

function registerGroupProcedureService() {
  globalThis.Hooks?.once?.("ready", async () => {
    exposeGroupProcedureApi();

    if (!globalThis.game?.user?.isGM) return;

    for (const actor of globalThis.game?.actors ?? []) {
      try {
        await ensureGroupProcedureState(actor);
      } catch (error) {
        console.warn(`${MODULE_ID} | Group Procedure | Could not initialize ${actor?.name ?? actor?.id ?? "Group"}.`, error);
      }
    }
  });

  globalThis.Hooks?.on?.("createActor", async actor => {
    if (!globalThis.game?.user?.isGM) return;

    try {
      await ensureGroupProcedureState(actor);
    } catch (error) {
      console.warn(`${MODULE_ID} | Group Procedure | Could not initialize new Group actor.`, error);
    }
  });
}

export {
  GROUP_PROCEDURE,
  GROUP_PROCEDURE_STATES,
  GROUP_PROCEDURE_DEFAULT_STATE,
  GROUP_PROCEDURE_HOOK,
  parseGroupProcedureState,
  normalizeGroupProcedure,
  getGroupProcedure,
  getGroupProcedureState,
  createGroupProcedureTransition,
  emitGroupProcedureTransition,
  setGroupProcedureState,
  ensureGroupProcedureState,
  exposeGroupProcedureApi,
  registerGroupProcedureService,
};
