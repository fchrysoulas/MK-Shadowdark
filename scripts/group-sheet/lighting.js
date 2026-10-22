import { isGroupActor, resolveActorFromUuid } from "./actors.js";
import { getGroupData } from "./activities.js";
import { getSettingValue } from "./group-settings.js";
import { isPrimaryActiveGm } from "./users.js";
import { GROUP_SHEET_ENABLED_SETTING } from "./constants.js";

const LIGHT_SOURCE_MAP_PATH = "systems/shadowdark/assets/mappings/map-light-sources.json";
const NO_LIGHT = Object.freeze({ dim: 0, bright: 0 });
const pending = new WeakMap();
let mappingsPromise = null;

function canSync() {
  return getSettingValue(GROUP_SHEET_ENABLED_SETTING, true) !== false && isPrimaryActiveGm();
}

function touchesPath(changes, target, prefix = "") {
  if (!changes || typeof changes !== "object") return false;
  return Object.entries(changes).some(([key, value]) => {
    const path = (prefix ? `${prefix}.${key}` : key).replace(/(^|\.)-=/g, "$1");
    if (path === target || path.startsWith(`${target}.`)) return true;
    return target.startsWith(`${path}.`) && (value && typeof value === "object"
      ? touchesPath(value, target, path) : true);
  });
}

export function actorChangesAffectGroupLight(changes) {
  return ["items", "flags.mk-shadowdark.isGroup", "flags.mk-shadowdark.group.activeMembers",
    "flags.mk-shadowdark.group.members"].some(path => touchesPath(changes, path));
}

export function itemChangesAffectGroupLight(changes, item) {
  return touchesPath(changes, "system.light") || (isGroupLightSource(item) && touchesPath(changes, "sort"));
}

export function isGroupLightSource(item) {
  return item?.system?.light?.isSource === true;
}

async function getActiveLight(groupActor) {
  for (const uuid of getGroupData(groupActor).activeMembers) {
    const member = await resolveActorFromUuid(uuid);
    const light = member?.items?.find(item => isGroupLightSource(item) && item.system.light.active === true);
    if (light) return light;
  }
  return groupActor.items?.find(item => isGroupLightSource(item) && item.system.light.active === true) ?? null;
}

function loadMappings() {
  // System mappings are static during a session; share an in-flight fetch and retry failures.
  mappingsPromise ??= foundry.utils.fetchJsonWithTimeout(LIGHT_SOURCE_MAP_PATH).catch(error => {
    mappingsPromise = null;
    throw error;
  });
  return mappingsPromise;
}

function containsLight(current, desired) {
  return Object.entries(desired).every(([key, value]) => value && typeof value === "object"
    ? containsLight(current?.[key], value) : current?.[key] === value);
}

async function applyGroupLight(groupActor) {
  const scene = globalThis.canvas?.scene;
  if (!canSync() || !isGroupActor(groupActor) || !scene) return;
  const tokens = scene.tokens?.filter?.(token => token.actorId === groupActor.id || token.actor?.id === groupActor.id) ?? [];
  if (!tokens.length) return;
  const activeLight = await getActiveLight(groupActor);
  const mappings = activeLight ? await loadMappings() : null;
  const light = mappings?.[String(activeLight?.system?.light?.template ?? "")]?.light ?? NO_LIGHT;
  // Authority or Scene can change while resolving members or loading the mappings.
  if (!canSync() || globalThis.canvas?.scene !== scene) return;
  await Promise.all(tokens.filter(token => !containsLight(token._source?.light ?? token.light?.toObject?.() ?? token.light, light))
    .map(token => token.update({ light: foundry.utils.deepClone(light) })));
}

export function syncGroupTokenLight(groupActor) {
  if (!groupActor || !canSync() || !globalThis.canvas?.scene) return Promise.resolve();
  const existing = pending.get(groupActor);
  if (existing) {
    existing.dirty = true;
    return existing.promise;
  }
  const state = { dirty: false, promise: null };
  state.promise = (async () => {
    // Collapse synchronous Item/Actor batches before reading the latest light state.
    await Promise.resolve();
    try {
      do {
        state.dirty = false;
        await applyGroupLight(groupActor);
      } while (state.dirty);
    } finally {
      pending.delete(groupActor);
    }
  })();
  pending.set(groupActor, state);
  return state.promise;
}

export async function syncGroupTokenLightsForActor(actor) {
  const scene = globalThis.canvas?.scene;
  if (!actor || !canSync() || !scene) return;
  const visibleGroupIds = new Set((scene.tokens?.contents ?? scene.tokens ?? []).map(token => token.actorId ?? token.actor?.id));
  const groups = (game.actors ?? []).filter(groupActor => visibleGroupIds.has(groupActor.id) && isGroupActor(groupActor)
    && (groupActor.id === actor.id || getGroupData(groupActor).activeMembers.includes(actor.uuid)));
  await Promise.all(groups.map(groupActor => syncGroupTokenLight(groupActor)));
}
