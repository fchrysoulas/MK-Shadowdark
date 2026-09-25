import { MODULE_ID } from "./constants.js";

const STATUS_SEVERITIES = Object.freeze(["normal", "attention", "critical"]);
const WOUND_LEVELS = Object.freeze(["ok", "wound", "critical", "destroyed"]);
const FOCUS_FLAG = "focusTracker";
const WOUNDS_FLAG = "detailedWounds";
const DEATH_TIMER_FLAG = "deathTimer";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function actorFlag(actor, key, fallback = undefined) {
  if (!actor) return fallback;

  try {
    const value = actor.getFlag?.(MODULE_ID, key);
    if (value !== undefined) return value;
  } catch (_error) {
    // Fall through to raw actor flag data for partial documents/tests.
  }

  return actor.flags?.[MODULE_ID]?.[key] ?? fallback;
}

function getActorHp(actor) {
  const hp = actor?.system?.attributes?.hp ?? {};
  return {
    value: Math.max(0, numberOrZero(hp.value)),
    max: Math.max(0, numberOrZero(hp.max)),
  };
}

function getActorAc(actor) {
  return numberOrZero(actor?.system?.attributes?.ac?.value ?? actor?.system?.attributes?.ac);
}

function effectStatusIds(effect) {
  const statuses = effect?.statuses;
  if (statuses instanceof Set) return [...statuses].map(String);
  if (Array.isArray(statuses)) return statuses.map(String);
  return [];
}

function activeActorEffects(actor) {
  return Array.from(actor?.effects ?? [])
    .filter(effect => effect?.disabled !== true && effect?.isSuppressed !== true)
    .map(effect => ({
      id: String(effect?.id ?? ""),
      name: String(effect?.name ?? effect?.label ?? "Effect"),
      img: String(effect?.img ?? effect?.icon ?? ""),
      statuses: effectStatusIds(effect),
    }));
}

function nativeDeadState(actor, effects = activeActorEffects(actor)) {
  const configuredDeadId = String(globalThis.CONFIG?.specialStatusEffects?.DEFEATED ?? "dead");
  const actorStatuses = actor?.statuses;

  if (actorStatuses instanceof Set) {
    if (actorStatuses.has("dead") || actorStatuses.has(configuredDeadId)) return true;
  }

  return effects.some(effect => (
    effect.statuses.includes("dead")
    || effect.statuses.includes(configuredDeadId)
    || effect.name.trim().toLowerCase() === "dead"
  ));
}

function deathTimerSummary(actor) {
  const raw = actorFlag(actor, DEATH_TIMER_FLAG, null);
  const turns = Number(raw?.turns);

  return {
    active: Number.isFinite(turns) && turns > 0,
    turns: Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : null,
  };
}

function normalizeWoundLevel(level) {
  const normalized = String(level ?? "ok").trim().toLowerCase();
  if (normalized === "wounded") return "wound";
  return WOUND_LEVELS.includes(normalized) ? normalized : "ok";
}

function formatWoundResultKey(resultKey) {
  const normalized = String(resultKey ?? "").trim();
  if (!normalized || normalized.toLowerCase() === "scar") return "";
  return normalized
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, character => character.toUpperCase());
}

function hasActiveWoundResult(raw, level) {
  const resultKey = String(raw?.resultKey ?? "").trim().toLowerCase();
  if (resultKey && resultKey !== "scar") return true;
  return level !== "ok";
}

function woundsSummary(actor) {
  const data = actorFlag(actor, WOUNDS_FLAG, {});
  const locations = data?.locations && typeof data.locations === "object"
    ? data.locations
    : {};
  const counts = {
    wound: 0,
    critical: 0,
    destroyed: 0,
  };
  const entries = [];

  for (const [locationId, raw] of Object.entries(locations)) {
    const level = normalizeWoundLevel(raw?.status ?? raw?.level);
    if (!hasActiveWoundResult(raw, level)) continue;

    counts[level] += 1;
    const entry = {
      locationId,
      level,
      damage: Math.max(0, numberOrZero(raw?.damage)),
    };
    const resultLabel = String(raw?.resultLabel ?? formatWoundResultKey(raw?.resultKey) ?? "").trim();
    if (resultLabel) entry.resultLabel = resultLabel;
    if (raw?.consequence) entry.consequence = String(raw.consequence);
    entries.push(entry);
  }

  return {
    total: entries.length,
    ...counts,
    entries,
  };
}

function fallbackFocusSessions(actor) {
  const data = actorFlag(actor, FOCUS_FLAG, {});
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  return sessions
    .filter(session => session && typeof session === "object")
    .map(session => ({
      id: String(session.id ?? ""),
      spellName: String(session.spellName ?? "Spell"),
      pendingLoss: Boolean(session.pendingLoss),
    }));
}

function focusSessions(actor) {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.focus;
  if (typeof api?.getActorSessions === "function") {
    try {
      const sessions = api.getActorSessions(actor);
      if (Array.isArray(sessions)) return sessions;
    } catch (_error) {
      // Fall back to the canonical persisted Focus actor flag.
    }
  }

  return fallbackFocusSessions(actor);
}

function focusSummary(actor) {
  const sessions = focusSessions(actor).map(session => ({
    id: String(session?.id ?? ""),
    spellName: String(session?.spellName ?? "Spell"),
    pendingLoss: Boolean(session?.pendingLoss),
  }));

  return {
    total: sessions.length,
    pendingLoss: sessions.filter(session => session.pendingLoss).length,
    sessions,
  };
}

function activeLightSummary(actor) {
  const items = Array.from(actor?.items ?? [])
    .filter(item => item?.system?.light?.isSource === true && item?.system?.light?.active === true)
    .map(item => ({
      id: String(item?.id ?? ""),
      name: String(item?.name ?? "Light Source"),
    }));

  return {
    total: items.length,
    items,
  };
}

function determineMemberStatusSeverity({ hp, dead, deathTimer, wounds, focus, effects }) {
  if (
    dead
    || hp.value <= 0
    || deathTimer.active
    || wounds.critical > 0
    || wounds.destroyed > 0
    || focus.pendingLoss > 0
  ) {
    return "critical";
  }

  if (wounds.total > 0 || focus.total > 0 || effects.length > 0) {
    return "attention";
  }

  return "normal";
}

function buildGroupMemberStatus(actor) {
  const hp = getActorHp(actor);
  const ac = getActorAc(actor);
  const effects = activeActorEffects(actor);
  const dead = nativeDeadState(actor, effects);
  const deathTimer = deathTimerSummary(actor);
  const wounds = woundsSummary(actor);
  const focus = focusSummary(actor);
  const light = activeLightSummary(actor);
  const severity = determineMemberStatusSeverity({
    hp,
    dead,
    deathTimer,
    wounds,
    focus,
    effects,
  });
  const notableCount = (
    wounds.total
    + focus.total
    + effects.length
    + (deathTimer.active || dead ? 1 : 0)
  );

  return {
    actorUuid: String(actor?.uuid ?? ""),
    actorName: String(actor?.name ?? "Member"),
    severity,
    notableCount,
    hp,
    ac,
    dead,
    deathTimer,
    wounds,
    focus,
    light,
    effects,
  };
}

export {
  STATUS_SEVERITIES,
  WOUND_LEVELS,
  getActorHp,
  getActorAc,
  activeActorEffects,
  nativeDeadState,
  deathTimerSummary,
  woundsSummary,
  focusSessions,
  focusSummary,
  activeLightSummary,
  determineMemberStatusSeverity,
  buildGroupMemberStatus,
};
