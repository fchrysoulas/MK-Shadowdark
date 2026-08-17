import { MODULE_ID } from "./constants.js";
import { isGroupActor } from "./actors.js";

const GROUP_ASSIGNMENTS_CHANGED_HOOK = "mkShadowdarkGroupAssignmentsChanged";
const GROUP_ASSIGNMENTS_UPDATE_PATH = `flags.${MODULE_ID}.group.assignments`;

const EXPLORATION_POSITIONS = Object.freeze(["front", "middle", "rear"]);
const EXPLORATION_ROLES = Object.freeze(["scout", "lightBearer"]);

function uniqueStrings(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter(value => typeof value === "string" && value)
  )];
}

function readGroupData(actor) {
  if (!actor) return {};

  try {
    const group = actor.getFlag?.(MODULE_ID, "group");
    if (group && typeof group === "object") return group;
  } catch (_error) {
    // Fall through for lightweight mocks and partial documents.
  }

  return actor.flags?.[MODULE_ID]?.group ?? {};
}

function getActiveMemberUuids(actor) {
  const group = readGroupData(actor);
  const members = uniqueStrings(group.members);
  const source = Array.isArray(group.activeMembers) ? group.activeMembers : members;
  const memberSet = new Set(members.length ? members : source);

  return uniqueStrings(source).filter(uuid => !memberSet.size || memberSet.has(uuid));
}

function normalizeWatchSlots(value, activeSet) {
  const source = Array.isArray(value) ? value : [];
  const usedIds = new Set();

  return source.map((slot, index) => {
    const sourceSlot = slot && typeof slot === "object" && !Array.isArray(slot) ? slot : {};
    let id = String(sourceSlot.id ?? "").trim();
    if (!id || usedIds.has(id)) id = `watch-${index + 1}`;
    while (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);

    return {
      id,
      label: String(sourceSlot.label ?? "").trim() || `Watch ${index + 1}`,
      actorUuids: uniqueStrings(sourceSlot.actorUuids).filter(uuid => activeSet.has(uuid)),
    };
  });
}

function normalizeGroupAssignments(value, activeMembers = []) {
  const active = uniqueStrings(activeMembers);
  const activeSet = new Set(active);
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const exploration = source.exploration && typeof source.exploration === "object"
    ? source.exploration
    : {};
  const camping = source.camping && typeof source.camping === "object"
    ? source.camping
    : {};

  const order = uniqueStrings(exploration.order).filter(uuid => activeSet.has(uuid));
  for (const uuid of active) {
    if (!order.includes(uuid)) order.push(uuid);
  }

  const sourcePositions = exploration.positions && typeof exploration.positions === "object"
    ? exploration.positions
    : {};
  const positions = {
    front: [],
    middle: [],
    rear: [],
  };
  const positioned = new Set();

  for (const position of EXPLORATION_POSITIONS) {
    for (const uuid of uniqueStrings(sourcePositions[position])) {
      if (!activeSet.has(uuid) || positioned.has(uuid)) continue;
      positions[position].push(uuid);
      positioned.add(uuid);
    }
  }

  const sourceRoles = exploration.roles && typeof exploration.roles === "object"
    ? exploration.roles
    : {};
  const roles = {
    scout: activeSet.has(sourceRoles.scout) ? sourceRoles.scout : "",
    lightBearer: activeSet.has(sourceRoles.lightBearer) ? sourceRoles.lightBearer : "",
  };

  return {
    exploration: {
      order,
      positions,
      roles,
    },
    camping: {
      watches: normalizeWatchSlots(camping.watches, activeSet),
    },
  };
}

function readStoredAssignments(actor) {
  return readGroupData(actor).assignments;
}

function getGroupAssignments(actor) {
  return normalizeGroupAssignments(readStoredAssignments(actor), getActiveMemberUuids(actor));
}

function sameAssignments(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function writeAssignments(actor, state, {
  user = globalThis.game?.user,
  notify = true,
  reason = "",
  emit = true,
} = {}) {
  if (!actor?.update) {
    throw new TypeError("A Group Actor document is required to change Group assignments.");
  }
  if (!isGroupActor(actor)) {
    throw new TypeError("Assignments can only be changed on an MK-Shadowdark Group actor.");
  }
  if (!user?.isGM) {
    if (notify) {
      globalThis.ui?.notifications?.warn?.("Only the GM can change Group procedure assignments.");
    }
    return null;
  }

  const previous = getGroupAssignments(actor);
  const normalized = normalizeGroupAssignments(state, getActiveMemberUuids(actor));
  if (sameAssignments(previous, normalized)) {
    return {
      changed: false,
      previous,
      state: normalized,
      reason: String(reason ?? "").trim(),
    };
  }

  await actor.update({
    [GROUP_ASSIGNMENTS_UPDATE_PATH]: normalized,
  });

  const transition = {
    changed: true,
    previous,
    state: normalized,
    reason: String(reason ?? "").trim(),
  };

  if (emit) globalThis.Hooks?.callAll?.(GROUP_ASSIGNMENTS_CHANGED_HOOK, actor, transition);
  return transition;
}

async function ensureGroupAssignments(actor, {
  user = globalThis.game?.user,
  emit = false,
  reason = "normalize",
} = {}) {
  if (!actor?.update || !isGroupActor(actor) || !user?.isGM) return false;

  const stored = readStoredAssignments(actor);
  const normalized = getGroupAssignments(actor);
  const current = stored && typeof stored === "object"
    ? normalizeGroupAssignments(stored, getActiveMemberUuids(actor))
    : null;

  if (stored && sameAssignments(stored, normalized) && current && sameAssignments(current, normalized)) {
    return false;
  }

  await actor.update({
    [GROUP_ASSIGNMENTS_UPDATE_PATH]: normalized,
  });

  if (emit) {
    globalThis.Hooks?.callAll?.(GROUP_ASSIGNMENTS_CHANGED_HOOK, actor, {
      changed: true,
      previous: stored ?? null,
      state: normalized,
      reason,
    });
  }

  return true;
}

function requirePosition(position) {
  const value = String(position ?? "").trim();
  if (!EXPLORATION_POSITIONS.includes(value)) {
    throw new RangeError(`Unknown exploration position: ${value}.`);
  }
  return value;
}

function requireRole(role) {
  const value = String(role ?? "").trim();
  if (!EXPLORATION_ROLES.includes(value)) {
    throw new RangeError(`Unknown exploration role: ${value}.`);
  }
  return value;
}

async function setMarchingOrder(actor, actorUuids, options = {}) {
  const state = getGroupAssignments(actor);
  state.exploration.order = uniqueStrings(actorUuids);
  return writeAssignments(actor, state, options);
}

async function setPositionMembers(actor, position, actorUuids, options = {}) {
  const resolvedPosition = requirePosition(position);
  const state = getGroupAssignments(actor);
  const requested = uniqueStrings(actorUuids);
  const requestedSet = new Set(requested);

  for (const key of EXPLORATION_POSITIONS) {
    state.exploration.positions[key] = state.exploration.positions[key]
      .filter(uuid => !requestedSet.has(uuid));
  }
  state.exploration.positions[resolvedPosition] = requested;

  return writeAssignments(actor, state, options);
}

async function setExplorationRole(actor, role, actorUuid, options = {}) {
  const resolvedRole = requireRole(role);
  const state = getGroupAssignments(actor);
  state.exploration.roles[resolvedRole] = String(actorUuid ?? "").trim();
  return writeAssignments(actor, state, options);
}

async function setCampWatches(actor, watches, options = {}) {
  const state = getGroupAssignments(actor);
  state.camping.watches = Array.isArray(watches) ? watches : [];
  return writeAssignments(actor, state, options);
}

function membershipChanged(changes) {
  if (!changes || typeof changes !== "object") return false;

  const flattened = [
    `flags.${MODULE_ID}.group`,
    `flags.${MODULE_ID}.group.members`,
    `flags.${MODULE_ID}.group.activeMembers`,
  ];
  if (flattened.some(key => Object.prototype.hasOwnProperty.call(changes, key))) return true;

  const group = changes.flags?.[MODULE_ID]?.group;
  if (!group || typeof group !== "object") return false;
  return Object.prototype.hasOwnProperty.call(group, "members")
    || Object.prototype.hasOwnProperty.call(group, "activeMembers");
}

function exposeGroupAssignmentsApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupAssignments = {
    changedHook: GROUP_ASSIGNMENTS_CHANGED_HOOK,
    positions: EXPLORATION_POSITIONS,
    roles: EXPLORATION_ROLES,
    getState: getGroupAssignments,
    setOrder: setMarchingOrder,
    setPosition: setPositionMembers,
    setRole: setExplorationRole,
    setWatches: setCampWatches,
  };

  return module.api.groupAssignments;
}

function registerGroupAssignmentsService() {
  globalThis.Hooks?.once?.("ready", async () => {
    exposeGroupAssignmentsApi();

    if (!globalThis.game?.user?.isGM) return;
    for (const actor of globalThis.game?.actors ?? []) {
      try {
        await ensureGroupAssignments(actor);
      } catch (error) {
        console.warn(`${MODULE_ID} | Group Assignments | Could not initialize ${actor?.name ?? actor?.id ?? "Group"}.`, error);
      }
    }
  });

  globalThis.Hooks?.on?.("createActor", async actor => {
    if (!globalThis.game?.user?.isGM) return;
    try {
      await ensureGroupAssignments(actor);
    } catch (error) {
      console.warn(`${MODULE_ID} | Group Assignments | Could not initialize new Group actor.`, error);
    }
  });

  globalThis.Hooks?.on?.("updateActor", async (actor, changes) => {
    if (!globalThis.game?.user?.isGM || !isGroupActor(actor) || !membershipChanged(changes)) return;
    try {
      await ensureGroupAssignments(actor, {
        emit: true,
        reason: "active-party-change",
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Group Assignments | Could not clean assignments after party change.`, error);
    }
  });
}

export {
  GROUP_ASSIGNMENTS_CHANGED_HOOK,
  EXPLORATION_POSITIONS,
  EXPLORATION_ROLES,
  getActiveMemberUuids,
  normalizeGroupAssignments,
  getGroupAssignments,
  ensureGroupAssignments,
  setMarchingOrder,
  setPositionMembers,
  setExplorationRole,
  setCampWatches,
  membershipChanged,
  exposeGroupAssignmentsApi,
  registerGroupAssignmentsService,
};
