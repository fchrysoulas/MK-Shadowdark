import { MODULE_ID } from "./constants.js";
import { isGroupActor, resolveActorFromUuid } from "./actors.js";

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
  return WOUND_LEVELS.includes(normalized) ? normalized : "ok";
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
    const level = normalizeWoundLevel(raw?.level);
    if (level === "ok") continue;

    counts[level] += 1;
    entries.push({
      locationId,
      level,
      damage: Math.max(0, numberOrZero(raw?.damage)),
    });
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function severityLabel(severity) {
  if (severity === "critical") return "Critical attention";
  if (severity === "attention") return "Review recommended";
  return "No notable warning";
}

function statusButtonTitle(status) {
  const count = status.notableCount;
  const suffix = count > 0
    ? ` · ${count} notable ${count === 1 ? "item" : "items"}`
    : "";
  return `GM Status: ${severityLabel(status.severity)}${suffix}`;
}

function statusButtonHtml(status) {
  return `
    <button
      type="button"
      class="mk-member-gm-status is-${escapeHtml(status.severity)}"
      data-action="open-gm-member-status"
      data-actor-uuid="${escapeHtml(status.actorUuid)}"
      title="${escapeHtml(statusButtonTitle(status))}"
      aria-label="${escapeHtml(statusButtonTitle(status))}"
    >
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      ${status.notableCount > 0 ? `<span>${escapeHtml(status.notableCount)}</span>` : ""}
    </button>
  `;
}

function listOrEmpty(entries, renderEntry) {
  if (!entries.length) return '<span class="mk-gm-status-empty">None</span>';
  return `<ul>${entries.map(renderEntry).join("")}</ul>`;
}

function renderGroupMemberStatus(status) {
  const death = status.dead
    ? "Dead"
    : status.deathTimer.active
      ? `Death Timer: ${status.deathTimer.turns} turn${status.deathTimer.turns === 1 ? "" : "s"}`
      : "No death state";

  return `
    <div class="mk-gm-member-status-dialog">
      <header>
        <h2>${escapeHtml(status.actorName)}</h2>
        <p><strong>${escapeHtml(severityLabel(status.severity))}</strong></p>
      </header>
      <div class="mk-gm-status-grid">
        <section>
          <h3>Combat</h3>
          <p>HP <strong>${escapeHtml(status.hp.value)}/${escapeHtml(status.hp.max)}</strong></p>
          <p>AC <strong>${escapeHtml(status.ac)}</strong></p>
          <p>${escapeHtml(death)}</p>
        </section>
        <section>
          <h3>Detailed Wounds</h3>
          <p>${escapeHtml(status.wounds.total)} affected location${status.wounds.total === 1 ? "" : "s"}</p>
          <p>Wound <strong>${escapeHtml(status.wounds.wound)}</strong> · Critical <strong>${escapeHtml(status.wounds.critical)}</strong> · Destroyed <strong>${escapeHtml(status.wounds.destroyed)}</strong></p>
          ${listOrEmpty(status.wounds.entries, wound => `<li>${escapeHtml(wound.locationId)}: ${escapeHtml(wound.level)}${wound.damage ? ` (${escapeHtml(wound.damage)} damage)` : ""}</li>`)}
        </section>
        <section>
          <h3>Focus</h3>
          <p>Active <strong>${escapeHtml(status.focus.total)}</strong> · Pending loss <strong>${escapeHtml(status.focus.pendingLoss)}</strong></p>
          ${listOrEmpty(status.focus.sessions, session => `<li>${escapeHtml(session.spellName)}${session.pendingLoss ? " — pending loss" : ""}</li>`)}
        </section>
        <section>
          <h3>Active Light</h3>
          <p><strong>${escapeHtml(status.light.total)}</strong> active source${status.light.total === 1 ? "" : "s"}</p>
          ${listOrEmpty(status.light.items, item => `<li>${escapeHtml(item.name)}</li>`)}
        </section>
        <section class="mk-gm-status-effects">
          <h3>Active Effects / Statuses</h3>
          ${listOrEmpty(status.effects, effect => `<li>${escapeHtml(effect.name)}${effect.statuses.length ? ` <small>[${escapeHtml(effect.statuses.join(", "))}]</small>` : ""}</li>`)}
        </section>
      </div>
    </div>
  `;
}

async function openGroupMemberStatus(actorOrUuid) {
  if (!globalThis.game?.user?.isGM) return null;

  const actor = typeof actorOrUuid === "string"
    ? await resolveActorFromUuid(actorOrUuid)
    : actorOrUuid;
  if (!actor) {
    globalThis.ui?.notifications?.warn?.("Group member could not be resolved.");
    return null;
  }

  const status = buildGroupMemberStatus(actor);
  return Dialog.wait({
    title: `GM Status — ${status.actorName}`,
    content: renderGroupMemberStatus(status),
    buttons: {
      close: {
        icon: '<i class="fas fa-check"></i>',
        label: "Close",
        callback: () => status,
      },
    },
    default: "close",
    close: () => status,
  }, { width: 620, resizable: true });
}

function getRootElement(html) {
  if (!html) return null;
  if (globalThis.HTMLElement && html instanceof HTMLElement) return html;
  if (globalThis.HTMLElement && html?.[0] instanceof HTMLElement) return html[0];
  return html?.[0] ?? html;
}

async function renderGroupMemberStatusControls(app, html) {
  if (!globalThis.game?.user?.isGM || !isGroupActor(app?.actor)) return 0;

  const root = getRootElement(html);
  if (!root?.querySelectorAll) return 0;

  const cards = Array.from(root.querySelectorAll(".mk-group-member[data-actor-uuid]"));
  let injected = 0;

  for (const card of cards) {
    card.querySelector?.("[data-action='open-gm-member-status']")?.remove?.();

    const actorUuid = String(card.dataset?.actorUuid ?? "");
    if (!actorUuid) continue;

    const actor = await resolveActorFromUuid(actorUuid);
    if (!actor) continue;

    const status = buildGroupMemberStatus(actor);
    card.insertAdjacentHTML?.("afterbegin", statusButtonHtml(status));
    const button = card.querySelector?.("[data-action='open-gm-member-status']");
    if (!button) continue;

    button.addEventListener?.("click", event => {
      event.preventDefault?.();
      event.stopPropagation?.();
      openGroupMemberStatus(actorUuid).catch(error => {
        console.error(`${MODULE_ID} | Group Member Status | Could not open GM member status.`, error);
        globalThis.ui?.notifications?.error?.(`GM member status failed: ${error.message}`);
      });
    });
    injected += 1;
  }

  return injected;
}

function exposeGroupMemberStatusApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.groupMemberStatus = {
    build: buildGroupMemberStatus,
    open: openGroupMemberStatus,
  };
  return module.api.groupMemberStatus;
}

function registerGroupMemberStatus() {
  globalThis.Hooks?.once?.("ready", exposeGroupMemberStatusApi);
  globalThis.Hooks?.on?.("renderActorSheet", (app, html) => {
    renderGroupMemberStatusControls(app, html).catch(error => {
      console.warn(`${MODULE_ID} | Group Member Status | Render injection failed.`, error);
    });
  });
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
  renderGroupMemberStatus,
  openGroupMemberStatus,
  renderGroupMemberStatusControls,
  exposeGroupMemberStatusApi,
  registerGroupMemberStatus,
};
