// Tracks Shadowdark Focus spells, checks, chat actions, and token status effects.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const LEGACY_MODULE_ID = "mk-shadowdark-focus-tracker";
  const MODULE_TITLE = "MK-Shadowdark | Focus Tracker";
  const FLAG_KEY = "focusTracker";
  const CAPACITY_FLAG = "focusCapacity";
  const STATE_VERSION = 1;
  const WRAPPED = Symbol.for(`${MODULE_ID}.focusTracker.wrappedCastSpell`);
  const CONTEXT_KEY = "mkShadowdarkFocusCheckId";
  const TEMP_SOURCE_FLAG = "temporaryFocusSource";
  const FOCUS_STATUS_ID = "mk-focus-tracker";
  const FOCUS_ICON = "modules/mk-shadowdark/assets/icons/focus-tracker.svg";
  const SOCKET_CHANNEL = `module.${MODULE_ID}`;

  const SETTINGS = Object.freeze({
    ENABLED: "focusTrackerEnabled",
    TURN_REMINDERS: "focusTrackerTurnReminders",
    DAMAGE_PROMPTS: "focusTrackerDamagePrompts",
    SUMMARY_BAR: "focusTrackerSummaryBar",
    TOKEN_STATUS_ICON: "focusTrackerTokenHud",
    DEFAULT_CAPACITY: "focusTrackerDefaultCapacity",
    DEBUG: "focusTrackerDebug"
  });

  const processedSocketEvents = new Set();

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function log(...args) {
    if (!setting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${moduleVersion()} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} |`, ...args);
  }

  function setting(key, fallback) {
    try {
      const value = game.settings.get(MODULE_ID, key);
      return value ?? fallback;
    } catch (_err) {
      return fallback;
    }
  }

  function enabled() {
    return game.system?.id === "shadowdark" && setting(SETTINGS.ENABLED, true);
  }

  function randomId() {
    if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID();
    return Math.random().toString(36).slice(2, 14);
  }

  function clone(value) {
    if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function getProperty(object, path) {
    if (globalThis.foundry?.utils?.getProperty) return globalThis.foundry.utils.getProperty(object, path);
    return String(path).split(".").reduce((current, key) => current?.[key], object);
  }

  function setProperty(object, path, value) {
    if (globalThis.foundry?.utils?.setProperty) return globalThis.foundry.utils.setProperty(object, path, value);
    const parts = String(path).split(".");
    const final = parts.pop();
    let current = object;
    for (const part of parts) current = current[part] ??= {};
    current[final] = value;
    return true;
  }

  function escapeHtml(value) {
    const text = String(value ?? "");
    if (globalThis.foundry?.utils?.escapeHTML) return globalThis.foundry.utils.escapeHTML(text);
    return text.replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function getRootElement(html) {
    if (!html) return null;
    if (html instanceof HTMLElement) return html;
    if (html[0] instanceof HTMLElement) return html[0];
    if (html.element instanceof HTMLElement) return html.element;
    if (html.element?.[0] instanceof HTMLElement) return html.element[0];
    return null;
  }

  function normalizeState(raw) {
    const state = raw && typeof raw === "object" ? clone(raw) : {};
    state.version = STATE_VERSION;
    state.sessions = Array.isArray(state.sessions) ? state.sessions : [];

    state.sessions = state.sessions
      .filter(session => session && typeof session === "object")
      .map(session => ({
        id: String(session.id || randomId()),
        name: String(session.name || "Focus Spell"),
        img: String(session.img || "icons/svg/aura.svg"),
        spellUuid: session.spellUuid || null,
        sourceItemUuid: session.sourceItemUuid || null,
        sourceItemId: session.sourceItemId || null,
        sourceItemData: session.sourceItemData && typeof session.sourceItemData === "object"
          ? clone(session.sourceItemData)
          : null,
        tier: Number.isFinite(Number(session.tier)) ? Number(session.tier) : null,
        pendingChecks: Array.isArray(session.pendingChecks)
          ? session.pendingChecks.filter(Boolean).map(check => ({
            id: String(check.id || randomId()),
            reason: String(check.reason || "manual"),
            createdAt: Number(check.createdAt) || Date.now(),
            combatKey: check.combatKey || null,
            damage: Number.isFinite(Number(check.damage)) ? Number(check.damage) : null
          }))
          : [],
        lastTurnKey: session.lastTurnKey || null,
        lastCheck: session.lastCheck && typeof session.lastCheck === "object"
          ? clone(session.lastCheck)
          : null,
        initialCriticalSuccess: session.initialCriticalSuccess === true
      }));

    return state;
  }

  function readActorFlag(actor, scope, key) {
    if (!actor) return undefined;
    try {
      const value = actor.getFlag?.(scope, key);
      if (value !== undefined) return value;
    } catch (_err) {
      // Fall back to source data for inactive legacy scopes.
    }

    return getProperty(actor, `flags.${scope}.${key}`)
      ?? getProperty(actor?._source, `flags.${scope}.${key}`);
  }

  function getState(actor) {
    if (!actor) return normalizeState(null);
    const current = readActorFlag(actor, MODULE_ID, FLAG_KEY);
    const legacy = current === undefined
      ? readActorFlag(actor, LEGACY_MODULE_ID, FLAG_KEY)
      : undefined;
    return normalizeState(current ?? legacy);
  }

  async function setState(actor, state) {
    if (!actor) return false;
    const normalized = normalizeState(state);

    try {
      if (!normalized.sessions.length) {
        await actor.unsetFlag?.(MODULE_ID, FLAG_KEY);
      } else {
        await actor.setFlag(MODULE_ID, FLAG_KEY, normalized);
      }

      // A successful write also completes migration from the standalone scope.
      try {
        if (readActorFlag(actor, LEGACY_MODULE_ID, FLAG_KEY) !== undefined) {
          await actor.unsetFlag?.(LEGACY_MODULE_ID, FLAG_KEY);
        }
      } catch (_err) {
        // Legacy cleanup is best-effort and must not block Focus tracking.
      }
      await syncFocusStatusEffect(actor, normalized);
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not update Focus state`, error);
      ui.notifications?.error(`${MODULE_TITLE} | Could not update Focus state for ${actor.name}.`);
      return false;
    }
  }

  function getSessions(actor) {
    return getState(actor).sessions;
  }

  function getSession(actor, sessionId = null) {
    const sessions = getSessions(actor);
    if (!sessions.length) return null;
    if (!sessionId) return sessions[0];
    return sessions.find(session => session.id === sessionId) ?? null;
  }

  function getActorCapacity(actor) {
    const current = readActorFlag(actor, MODULE_ID, CAPACITY_FLAG);
    const legacy = current === undefined
      ? readActorFlag(actor, LEGACY_MODULE_ID, CAPACITY_FLAG)
      : undefined;
    const actorCapacity = Number(current ?? legacy);

    if (Number.isFinite(actorCapacity) && actorCapacity >= 1) {
      return Math.floor(actorCapacity);
    }

    const configured = Number(setting(SETTINGS.DEFAULT_CAPACITY, 1));
    return Math.max(1, Number.isFinite(configured) ? Math.floor(configured) : 1);
  }

  async function setActorCapacity(actor, capacity) {
    const value = Math.max(1, Math.floor(Number(capacity) || 1));
    await actor.setFlag(MODULE_ID, CAPACITY_FLAG, value);
    try {
      if (readActorFlag(actor, LEGACY_MODULE_ID, CAPACITY_FLAG) !== undefined) {
        await actor.unsetFlag?.(LEGACY_MODULE_ID, CAPACITY_FLAG);
      }
    } catch (_err) {
      // Legacy cleanup is best-effort.
    }
    return value;
  }

  function canOperateActor(actor) {
    if (!actor || !game.user) return false;
    if (game.user.isGM) return true;
    try {
      const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
      return actor.testUserPermission?.(game.user, ownerLevel) ?? actor.isOwner;
    } catch (_err) {
      return Boolean(actor.isOwner);
    }
  }

  function getPrimaryActiveGM() {
    return game.users
      ?.filter(user => user.active && user.isGM)
      ?.sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
  }

  function getActiveOwners(actor) {
    if (!actor) return [];
    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    return game.users
      ?.filter(user => {
        if (!user.active || user.isGM) return false;
        try {
          return actor.testUserPermission?.(user, ownerLevel);
        } catch (_err) {
          return false;
        }
      })
      ?.sort((left, right) => String(left.id).localeCompare(String(right.id))) ?? [];
  }

  function isAuthority(actor = null) {
    const gm = getPrimaryActiveGM();
    if (gm) return game.user?.id === gm.id;
    const owner = getActiveOwners(actor)[0];
    return owner ? game.user?.id === owner.id : game.user?.isGM === true;
  }

  function effectHasStatus(effect, statusId) {
    if (!effect) return false;
    if (effect.statuses?.has?.(statusId)) return true;
    if (Array.isArray(effect.statuses) && effect.statuses.includes(statusId)) return true;
    if (effect.getFlag?.("core", "statusId") === statusId) return true;
    return effect.flags?.core?.statusId === statusId;
  }

  function actorEffects(actor) {
    if (Array.isArray(actor?.effects)) return actor.effects;
    if (Array.isArray(actor?.effects?.contents)) return actor.effects.contents;
    if (typeof actor?.effects?.values === "function") return [...actor.effects.values()];
    return [];
  }

  function findFocusEffects(actor) {
    return actorEffects(actor).filter(effect =>
      effect.getFlag?.(MODULE_ID, "isFocusTracker") === true
      || effectHasStatus(effect, FOCUS_STATUS_ID)
    );
  }

  function refreshActorTokenEffects(actor) {
    window.setTimeout(() => {
      try {
        const tokens = actor?.getActiveTokens?.(true, true) ?? actor?.getActiveTokens?.() ?? [];
        for (const token of tokens) {
          if (typeof token.drawEffects === "function") {
            Promise.resolve(token.drawEffects()).catch(error => warn("Could not redraw token Focus effects", error));
          } else {
            token.refresh?.();
          }
        }
      } catch (error) {
        warn("Could not refresh token Focus effects", error);
      }
    }, 50);
  }

  async function syncFocusStatusEffect(actor, state = getState(actor)) {
    if (!actor) return false;

    const existing = findFocusEffects(actor);
    const sessions = enabled() && setting(SETTINGS.TOKEN_STATUS_ICON, true)
      ? state.sessions
      : [];

    try {
      if (!sessions.length) {
        if (existing.length && actor.deleteEmbeddedDocuments) {
          await actor.deleteEmbeddedDocuments("ActiveEffect", existing.map(effect => effect.id));
          refreshActorTokenEffects(actor);
        }
        return true;
      }

      if (!actor.createEmbeddedDocuments) return false;

      const pending = sessions.reduce((total, session) => total + session.pendingChecks.length, 0);
      const name = sessions.length === 1
        ? `Focus: ${sessions[0].name}${pending ? " (Check Due)" : ""}`
        : `Focus (${sessions.length})${pending ? ` - ${pending} Check${pending === 1 ? "" : "s"} Due` : ""}`;
      const data = {
        name,
        img: FOCUS_ICON,
        statuses: [FOCUS_STATUS_ID],
        disabled: false,
        changes: [],
        flags: {
          [MODULE_ID]: {
            isFocusTracker: true,
            sessionCount: sessions.length,
            pendingChecks: pending
          },
          core: {
            statusId: FOCUS_STATUS_ID
          }
        }
      };

      const [primary, ...duplicates] = existing;
      if (primary?.update) await primary.update(data);
      else await actor.createEmbeddedDocuments("ActiveEffect", [data]);

      if (duplicates.length && actor.deleteEmbeddedDocuments) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", duplicates.map(effect => effect.id));
      }

      refreshActorTokenEffects(actor);
      return true;
    } catch (error) {
      warn(`Could not synchronize the Focus token icon for ${actor.name ?? "actor"}`, error);
      return false;
    }
  }

  async function syncAllFocusStatusEffects() {
    for (const actor of game.actors ?? []) {
      if (!isAuthority(actor)) continue;
      await syncFocusStatusEffect(actor);
    }
  }

  function whisperRecipients(actor) {
    const ids = new Set();

    for (const user of game.users ?? []) {
      if (!user.active) continue;
      if (user.isGM) {
        ids.add(user.id);
        continue;
      }

      try {
        const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
        if (actor?.testUserPermission?.(user, ownerLevel)) ids.add(user.id);
      } catch (_err) {
        // Ignore inaccessible ownership data.
      }
    }

    return [...ids];
  }

  function getHp(actor) {
    const paths = [
      "system.attributes.hp.value",
      "system.hp.value",
      "system.hp"
    ];

    for (const path of paths) {
      const value = Number(getProperty(actor, path));
      if (Number.isFinite(value)) return { path, value };
    }

    return null;
  }

  function changedValue(changes, path) {
    if (!changes || typeof changes !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
    return getProperty(changes, path);
  }

  function focusDuration(document) {
    return String(getProperty(document, "system.duration.type") ?? "").toLowerCase() === "focus";
  }

  function itemSnapshot(item) {
    if (!item) return null;
    try {
      const data = item.toObject?.() ?? clone(item);
      delete data._id;
      delete data.id;
      delete data.sort;
      data.flags ??= {};
      data.flags[MODULE_ID] ??= {};
      data.flags[MODULE_ID][TEMP_SOURCE_FLAG] = true;
      return data;
    } catch (error) {
      warn("Could not snapshot focus source", item?.name, error);
      return null;
    }
  }

  function sessionSnapshot({ actor, spell, sourceItem, criticalSuccess = false }) {
    const displayDocument = spell ?? sourceItem;
    const linkedSpellName = getProperty(sourceItem, "system.spellName");
    const linkedSpellImage = getProperty(sourceItem, "system.spellImg");
    const distinctSpell = spell && spell !== sourceItem ? spell : null;
    const displayName = distinctSpell?.name
      ?? linkedSpellName
      ?? spell?.name
      ?? sourceItem?.name
      ?? "Focus Spell";
    const displayImage = distinctSpell?.img
      ?? linkedSpellImage
      ?? spell?.img
      ?? sourceItem?.img
      ?? actor?.img
      ?? "icons/svg/aura.svg";

    const tier = Number(
      getProperty(spell, "system.tier")
      ?? getProperty(sourceItem, "system.tier")
    );

    return {
      id: randomId(),
      name: String(displayName),
      img: String(displayImage),
      spellUuid: spell?.uuid ?? (focusDuration(displayDocument) ? displayDocument?.uuid : null),
      sourceItemUuid: sourceItem?.uuid ?? displayDocument?.uuid ?? null,
      sourceItemId: sourceItem?.id ?? displayDocument?.id ?? null,
      sourceItemData: itemSnapshot(sourceItem ?? displayDocument),
      tier: Number.isFinite(tier) ? tier : null,
      pendingChecks: [],
      lastTurnKey: null,
      lastCheck: null,
      initialCriticalSuccess: criticalSuccess === true
    };
  }

  function sessionMatchesContext(session, context) {
    if (!session || !context) return false;
    const candidates = new Set([
      context.spell?.uuid,
      context.sourceItem?.uuid,
      context.sourceItem?.id,
      context.spell?.id
    ].filter(Boolean));

    return candidates.has(session.spellUuid)
      || candidates.has(session.sourceItemUuid)
      || candidates.has(session.sourceItemId);
  }

  async function startFocus(actor, itemOrSpell, options = {}) {
    if (!actor || !itemOrSpell) return null;

    const state = getState(actor);
    const capacity = getActorCapacity(actor);

    if (state.sessions.length >= capacity) {
      ui.notifications?.warn(
        `${actor.name} is already maintaining the maximum number of Focus spells (${capacity}).`
      );
      return null;
    }

    const sourceItem = options.sourceItem ?? itemOrSpell;
    const spell = options.spell ?? (focusDuration(itemOrSpell) ? itemOrSpell : null);
    const session = sessionSnapshot({
      actor,
      spell,
      sourceItem,
      criticalSuccess: options.criticalSuccess
    });

    state.sessions.push(session);
    if (!await setState(actor, state)) return null;

    await createLifecycleMessage(actor, session, {
      kind: "started",
      text: `${actor.name} begins focusing on ${session.name}.`
    });

    refreshActorUi(actor);
    return session;
  }

  async function startFocusFromContext(context, criticalSuccess = false) {
    const actor = context?.actor;
    if (!actor) return null;

    const current = getSessions(actor);
    const existing = current.find(session => sessionMatchesContext(session, context));
    if (existing) return existing;

    return startFocus(actor, context.spell ?? context.sourceItem, {
      spell: context.spell,
      sourceItem: context.sourceItem,
      criticalSuccess
    });
  }

  async function endFocus(actor, sessionId = null, options = {}) {
    if (!actor) return false;
    const state = getState(actor);
    const session = sessionId
      ? state.sessions.find(entry => entry.id === sessionId)
      : state.sessions[0];
    if (!session) return false;

    state.sessions = state.sessions.filter(entry => entry.id !== session.id);
    if (!await setState(actor, state)) return false;

    const reason = options.reason ?? "manual";
    const reasonText = {
      failure: "The Focus check failed.",
      criticalFailure: "The Focus check critically failed, and the spell is lost for the day.",
      manual: "The caster ended Focus.",
      replaced: "The Focus spell was replaced.",
      expired: "The Focus session ended."
    }[reason] ?? String(reason);

    if (options.announce !== false) {
      await createLifecycleMessage(actor, session, {
        kind: "ended",
        text: `${actor.name} stops focusing on ${session.name}. ${reasonText}`
      });
    }

    refreshActorUi(actor);
    return true;
  }

  function findPendingCheck(session, checkId = null) {
    if (!session?.pendingChecks?.length) return null;
    if (checkId) {
      return session.pendingChecks.find(check => check.id === checkId) ?? null;
    }
    return session.pendingChecks[0];
  }

  async function recordSuccessfulCheck(actor, sessionId, checkId = null, details = {}) {
    const state = getState(actor);
    const session = state.sessions.find(entry => entry.id === sessionId);
    if (!session) return false;

    const check = findPendingCheck(session, checkId);
    if (check) {
      session.pendingChecks = session.pendingChecks.filter(entry => entry.id !== check.id);
    }

    session.lastCheck = {
      result: "success",
      reason: check?.reason ?? details.reason ?? "manual",
      timestamp: Date.now(),
      critical: details.critical ?? null
    };

    await setState(actor, state);
    refreshActorUi(actor);
    return true;
  }

  async function ignorePendingCheck(actor, sessionId, checkId) {
    const state = getState(actor);
    const session = state.sessions.find(entry => entry.id === sessionId);
    if (!session) return false;

    const check = findPendingCheck(session, checkId);
    if (!check) return false;

    session.pendingChecks = session.pendingChecks.filter(entry => entry.id !== check.id);
    session.lastCheck = {
      result: "ignored",
      reason: check.reason,
      timestamp: Date.now(),
      critical: null
    };

    await setState(actor, state);
    refreshActorUi(actor);
    return true;
  }

  async function markCheckDue(actor, sessionId, reason, details = {}) {
    if (!actor) return null;
    const state = getState(actor);
    const session = state.sessions.find(entry => entry.id === sessionId);
    if (!session) return null;

    if (details.combatKey) {
      const duplicate = session.pendingChecks.find(check => check.combatKey === details.combatKey);
      if (duplicate) return duplicate;
    }

    const check = {
      id: randomId(),
      reason: String(reason || "manual"),
      createdAt: Date.now(),
      combatKey: details.combatKey ?? null,
      damage: Number.isFinite(Number(details.damage)) ? Number(details.damage) : null
    };

    session.pendingChecks.push(check);
    if (details.combatKey) session.lastTurnKey = details.combatKey;

    await setState(actor, state);
    refreshActorUi(actor);

    if (details.remind !== false) {
      await createReminderMessage(actor, session, check);
    }

    return check;
  }

  async function markAllSessionsDue(actor, reason, details = {}) {
    const sessions = getSessions(actor);
    const checks = [];
    for (const session of sessions) {
      const check = await markCheckDue(actor, session.id, reason, details);
      if (check) checks.push(check);
    }
    return checks;
  }

  function reasonLabel(reason) {
    return {
      turn: "Start of turn",
      damage: "Damage taken",
      distraction: "Distraction",
      manual: "Manual check"
    }[reason] ?? String(reason || "Focus check");
  }

  async function createReminderMessage(actor, session, check) {
    const damageText = check.reason === "damage" && Number.isFinite(check.damage)
      ? ` HP decreased by ${check.damage}.`
      : "";
    const text = check.reason === "turn"
      ? `It is ${actor.name}'s turn. A Focus check is required for ${session.name}.`
      : `${actor.name} must immediately check Focus for ${session.name}.${damageText}`;

    const allowIgnore = check.reason === "damage";
    const content = renderChatCard(actor, session, {
      heading: "Focus Check Required",
      text,
      meta: reasonLabel(check.reason),
      actions: [
        { action: "check", label: "Focus Check", icon: "fa-solid fa-dice-d20", checkId: check.id },
        ...(allowIgnore ? [{ action: "ignore", label: "Ignore", icon: "fa-solid fa-forward", checkId: check.id }] : []),
        { action: "end", label: "End Focus", icon: "fa-solid fa-xmark" },
        { action: "open", label: "Open Spell", icon: "fa-solid fa-book-open" }
      ]
    });

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      whisper: whisperRecipients(actor),
      content,
      flags: {
        [MODULE_ID]: {
          type: "focus-reminder",
          actorUuid: actor.uuid,
          sessionId: session.id,
          checkId: check.id
        }
      }
    });
  }

  async function createLifecycleMessage(actor, session, { kind, text }) {
    const content = renderChatCard(actor, session, {
      heading: kind === "started" ? "Focus Begun" : "Focus Ended",
      text,
      meta: null,
      showHeader: kind !== "started",
      actions: kind === "started"
        ? [
          { action: "check", label: "Focus Check", icon: "fa-solid fa-dice-d20" },
          { action: "end", label: "End Focus", icon: "fa-solid fa-xmark" }
        ]
        : []
    });

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: {
        [MODULE_ID]: {
          type: `focus-${kind}`,
          actorUuid: actor.uuid,
          sessionId: session.id
        }
      }
    });
  }

  function renderChatCard(actor, session, { heading, text, meta, actions = [], showHeader = true }) {
    const buttons = actions.map(action => `
      <button
        type="button"
        data-mk-focus-action="${escapeHtml(action.action)}"
        data-actor-uuid="${escapeHtml(actor.uuid)}"
        data-session-id="${escapeHtml(session.id)}"
        ${action.checkId ? `data-check-id="${escapeHtml(action.checkId)}"` : ""}
      >
        <i class="${escapeHtml(action.icon)}" aria-hidden="true"></i>
        <span>${escapeHtml(action.label)}</span>
      </button>
    `).join("");

    return `
      <section class="mk-focus-chat-card" data-mk-focus-session="${escapeHtml(session.id)}">
        ${showHeader ? `
          <header class="mk-focus-chat-card__header">
            <img src="${escapeHtml(session.img)}" alt="" />
            <div>
              <h3>${escapeHtml(heading)}</h3>
              <strong>${escapeHtml(session.name)}</strong>
            </div>
          </header>
        ` : ""}
        <div class="mk-focus-chat-card__body">
          ${text ? `<p>${escapeHtml(text)}</p>` : ""}
          ${meta ? `<p class="mk-focus-chat-card__meta">${escapeHtml(meta)}</p>` : ""}
          ${buttons ? `<div class="mk-focus-chat-card__actions">${buttons}</div>` : ""}
        </div>
      </section>
    `;
  }

  async function resolveActor(uuid) {
    if (!uuid) return null;
    try {
      return await fromUuid(uuid);
    } catch (_err) {
      return game.actors?.get(uuid) ?? null;
    }
  }

  async function resolveSessionSource(actor, session) {
    const uuids = [session.sourceItemUuid, session.spellUuid].filter(Boolean);
    for (const uuid of uuids) {
      try {
        const document = await fromUuid(uuid);
        if (document) return { document, temporary: false };
      } catch (_err) {
        // Try the next source.
      }
    }

    if (session.sourceItemId) {
      const embedded = actor.items?.get(session.sourceItemId);
      if (embedded) return { document: embedded, temporary: false };
    }

    if (!session.sourceItemData || !actor.createEmbeddedDocuments) return null;

    const sourceData = clone(session.sourceItemData);
    delete sourceData._id;
    delete sourceData.id;
    sourceData.name = sourceData.name || `${session.name} (Focus Source)`;
    sourceData.flags ??= {};
    sourceData.flags[MODULE_ID] ??= {};
    sourceData.flags[MODULE_ID][TEMP_SOURCE_FLAG] = true;

    try {
      const created = await actor.createEmbeddedDocuments("Item", [sourceData], {
        [MODULE_ID]: { temporaryFocusSource: true },
        renderSheet: false
      });
      return created?.[0] ? { document: created[0], temporary: true } : null;
    } catch (error) {
      console.error(`${MODULE_ID} | Could not reconstruct consumed Focus source`, error);
      return null;
    }
  }

  async function cleanupTemporarySource(actor, resolved) {
    if (!resolved?.temporary || !resolved.document?.id) return;
    try {
      if (actor.items?.get(resolved.document.id)) {
        await actor.deleteEmbeddedDocuments("Item", [resolved.document.id], {
          [MODULE_ID]: { temporaryFocusSource: true }
        });
      }
    } catch (error) {
      warn("Could not clean temporary Focus source", error);
    }
  }

  async function rollFocusCheck(actor, sessionId = null, options = {}) {
    if (!actor) return false;
    if (!canOperateActor(actor)) {
      ui.notifications?.warn(`You do not have permission to roll Focus for ${actor.name}.`);
      return false;
    }

    const session = getSession(actor, sessionId);
    if (!session) {
      ui.notifications?.warn(`${actor.name} has no tracked Focus spell.`);
      return false;
    }

    const check = findPendingCheck(session, options.checkId ?? null);
    const checkId = check?.id ?? options.checkId ?? null;
    const resolved = await resolveSessionSource(actor, session);

    if (!resolved?.document) {
      ui.notifications?.error(`The source for ${session.name} could not be reconstructed.`);
      return false;
    }

    try {
      if (typeof actor.system?.castSpell === "function") {
        const spellUuid = session.spellUuid
          ?? getProperty(resolved.document, "system.spellUuid")
          ?? resolved.document.uuid;

        const config = {
          itemUuid: resolved.document.uuid,
          cast: { focus: true },
          [CONTEXT_KEY]: checkId
        };

        if (options.fastForward) {
          config.skipPrompt = true;
          config.fastForward = true;
        }

        return await actor.system.castSpell(spellUuid, config);
      }

      if (typeof actor.castSpell === "function") {
        return await actor.castSpell(resolved.document.id, {
          isFocusRoll: true,
          fastForward: Boolean(options.fastForward),
          [CONTEXT_KEY]: checkId
        });
      }

      ui.notifications?.error(`${MODULE_TITLE} | No compatible native Shadowdark Focus roll was found.`);
      return false;
    } finally {
      await cleanupTemporarySource(actor, resolved);
    }
  }

  async function openSessionSource(actor, sessionId = null) {
    const session = getSession(actor, sessionId);
    if (!session) return false;

    for (const uuid of [session.spellUuid, session.sourceItemUuid].filter(Boolean)) {
      try {
        const document = await fromUuid(uuid);
        if (document?.sheet) {
          document.sheet.render(true);
          return true;
        }
      } catch (_err) {
        // Continue to the fallback.
      }
    }

    const embedded = session.sourceItemId ? actor.items?.get(session.sourceItemId) : null;
    if (embedded?.sheet) {
      embedded.sheet.render(true);
      return true;
    }

    ui.notifications?.warn(`The original source for ${session.name} is no longer available.`);
    return false;
  }

  async function handleChatAction(event) {
    const button = event.currentTarget;
    const action = button.dataset.mkFocusAction;
    const actor = await resolveActor(button.dataset.actorUuid);
    const sessionId = button.dataset.sessionId || null;
    const checkId = button.dataset.checkId || null;
    if (!actor) return;

    if (action === "check") {
      await rollFocusCheck(actor, sessionId, {
        checkId,
        fastForward: Boolean(event.shiftKey)
      });
    } else if (action === "ignore") {
      await ignorePendingCheck(actor, sessionId, checkId);
    } else if (action === "end") {
      await endFocus(actor, sessionId, { reason: "manual" });
    } else if (action === "open") {
      await openSessionSource(actor, sessionId);
    }
  }

  function attachChatListeners(_message, html) {
    const root = getRootElement(html);
    if (!root?.querySelectorAll) return;

    root.querySelectorAll("[data-mk-focus-action]").forEach(button => {
      if (button.dataset.mkFocusBound === "true") return;
      button.dataset.mkFocusBound = "true";
      button.addEventListener("click", event => void handleChatAction(event));
    });
  }

  function summaryTooltip(session) {
    const pending = session.pendingChecks.length;
    const due = pending
      ? `${pending} check${pending === 1 ? "" : "s"} due`
      : "No check currently due";
    return `${session.name} - ${due}. Left-click to check, Shift-click to open, right-click to end.`;
  }

  function createSummaryChip(actor, session) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mk-focus-summary-chip";
    if (session.pendingChecks.length) button.classList.add("mk-focus-check-due");
    button.dataset.sessionId = session.id;
    button.title = summaryTooltip(session);
    button.setAttribute("aria-label", summaryTooltip(session));
    button.innerHTML = `<img class="mk-focus-summary-chip__icon" src="${FOCUS_ICON}" alt="" />`;

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) void openSessionSource(actor, session.id);
      else void rollFocusCheck(actor, session.id, { fastForward: false });
    });

    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      void endFocus(actor, session.id, { reason: "manual" });
    });

    return button;
  }

  function renderActorFocus(app, html) {
    if (!enabled() || !setting(SETTINGS.SUMMARY_BAR, true)) return;
    const root = getRootElement(html);
    const actor = app?.actor ?? app?.object;
    if (!root?.querySelector || !actor || actor.documentName !== "Actor") return;

    root.querySelectorAll(".mk-focus-summary-group, .mk-focus-summary-fallback").forEach(element => element.remove());

    const sessions = getSessions(actor);
    if (!sessions.length) return;

    const group = document.createElement("div");
    group.className = "mk-focus-summary-group";
    for (const session of sessions) group.append(createSummaryChip(actor, session));

    const existingBar = root.querySelector(".mk-character-sheet-bar__chips, .sdx-character-sheet-bar__chips");
    if (existingBar) {
      existingBar.append(group);
      return;
    }

    const fallback = document.createElement("div");
    fallback.className = "mk-focus-summary-fallback";
    fallback.append(group);

    const header = root.querySelector("header.SD-header");
    const nav = root.querySelector("nav.SD-nav");
    if (header) header.after(fallback);
    else if (nav) nav.before(fallback);
    else root.prepend(fallback);
  }

  function refreshActorUi(actor) {
    try {
      actor?.sheet?.render?.(false);
    } catch (_err) {
      // Sheet refresh is optional.
    }

    try {
      canvas?.tokens?.placeables
        ?.filter(token => token.actor?.uuid === actor?.uuid || token.actor?.id === actor?.id)
        ?.forEach(token => token.refresh?.());
      canvas?.hud?.token?.render?.();
    } catch (_err) {
      // Canvas refresh is optional.
    }
  }

  function isRelevantCombatChange(changes) {
    if (!changes || typeof changes !== "object") return false;
    return Object.prototype.hasOwnProperty.call(changes, "turn")
      || Object.prototype.hasOwnProperty.call(changes, "round")
      || Object.prototype.hasOwnProperty.call(changes, "combatantId");
  }

  async function handleCombatTurn(combat) {
    if (!enabled() || !setting(SETTINGS.TURN_REMINDERS, true)) return;
    const combatant = combat?.combatant;
    const actor = combatant?.actor;
    if (!actor || !isAuthority(actor)) return;

    const sessions = getSessions(actor);
    if (!sessions.length) return;

    const keyBase = `${combat.id}:${combat.round ?? 0}:${combat.turn ?? 0}:${combatant.id ?? actor.id}`;
    for (const session of sessions) {
      const combatKey = `${keyBase}:${session.id}`;
      if (session.lastTurnKey === combatKey) continue;
      await markCheckDue(actor, session.id, "turn", { combatKey });
    }
  }

  function onCombatUpdate(combat, changes) {
    if (!isRelevantCombatChange(changes)) return;
    window.setTimeout(() => void handleCombatTurn(combat), 0);
  }

  function makeDamagePayload(actor, amount) {
    return {
      type: "focus-hp-decrease",
      eventId: randomId(),
      actorUuid: actor.uuid,
      amount,
      senderId: game.user?.id ?? null,
      timestamp: Date.now()
    };
  }

  async function processDamagePayload(payload) {
    if (!payload?.eventId || processedSocketEvents.has(payload.eventId)) return;
    processedSocketEvents.add(payload.eventId);
    if (processedSocketEvents.size > 500) {
      const first = processedSocketEvents.values().next().value;
      processedSocketEvents.delete(first);
    }

    const actor = await resolveActor(payload.actorUuid);
    if (!actor || !isAuthority(actor)) return;
    if (!getSessions(actor).length) return;

    await markAllSessionsDue(actor, "damage", {
      damage: payload.amount,
      remind: true
    });
  }

  function dispatchDamagePayload(payload) {
    if (!payload) return;
    if (isAuthority()) {
      void processDamagePayload(payload);
      return;
    }

    try {
      game.socket?.emit(SOCKET_CHANNEL, payload);
    } catch (error) {
      warn("Could not emit damage Focus event", error);
    }
  }

  function onPreUpdateActor(actor, changes) {
    if (!enabled() || !setting(SETTINGS.DAMAGE_PROMPTS, true)) return;
    if (!getSessions(actor).length) return;

    const hp = getHp(actor);
    if (!hp) return;

    const nextRaw = changedValue(changes, hp.path);
    if (nextRaw === undefined) return;
    const next = Number(nextRaw);
    if (!Number.isFinite(next) || next >= hp.value) return;

    const amount = hp.value - next;
    const payload = makeDamagePayload(actor, amount);
    dispatchDamagePayload(payload);
  }

  function isFocusCheckOptions(options) {
    return Boolean(
      options?.isFocusRoll
      || options?.cast?.focus
      || options?.[CONTEXT_KEY]
    );
  }

  async function buildV3CastContext(actor, args) {
    const itemId = args[0];
    const options = args[1] ?? {};
    const sourceItem = actor?.items?.get(itemId) ?? null;
    if (!sourceItem) return null;

    return {
      generation: 3,
      actor,
      sourceItem,
      spell: sourceItem,
      isFocusSpell: focusDuration(sourceItem),
      isFocusCheck: isFocusCheckOptions(options),
      checkId: options?.[CONTEXT_KEY] ?? null,
      startedAt: Date.now(),
      messageIdsBefore: new Set(game.messages?.contents?.map(message => message.id) ?? [])
    };
  }

  async function buildV4CastContext(model, args) {
    const actor = model?.parent;
    const spellUuid = args[0];
    const config = args[1] ?? {};
    if (!actor || !spellUuid) return null;

    let spell = null;
    let sourceItem = null;
    try {
      spell = await fromUuid(spellUuid);
    } catch (_err) {
      // Leave unresolved.
    }
    if (config.itemUuid) {
      try {
        sourceItem = await fromUuid(config.itemUuid);
      } catch (_err) {
        // Leave unresolved.
      }
    }

    sourceItem ??= spell;

    return {
      generation: 4,
      actor,
      sourceItem,
      spell,
      isFocusSpell: focusDuration(spell) || focusDuration(sourceItem),
      isFocusCheck: isFocusCheckOptions(config),
      checkId: config?.[CONTEXT_KEY] ?? null,
      startedAt: Date.now(),
      messageIdsBefore: new Set(game.messages?.contents?.map(message => message.id) ?? [])
    };
  }

  function matchingNewRollMessage(context) {
    const messages = [...(game.messages?.contents ?? [])].reverse();
    for (const message of messages) {
      if (context.messageIdsBefore.has(message.id)) continue;
      const speakerActor = message.speaker?.actor;
      const actorMatch = speakerActor === context.actor.id
        || speakerActor === context.actor._id
        || String(message.content ?? "").includes(`data-actor-id=\"${context.actor.id}\"`)
        || String(message.content ?? "").includes(`data-actor-id="${context.actor.id}"`);
      if (!actorMatch) continue;

      const shadowdarkFlags = message.flags?.shadowdark;
      if (shadowdarkFlags?.isRoll || message.rolls?.length || shadowdarkFlags?.rolls) return message;
    }
    return null;
  }

  function digestV3Result(result, context) {
    if (!result) return { completed: false, success: null, critical: null };

    const main = result?.rolls?.main;
    const critical = main?.critical ?? null;
    if (main?.success === true) return { completed: true, success: true, critical };
    if (main?.success === false) return { completed: true, success: false, critical };

    const total = Number(main?.roll?.total ?? main?.total);
    const tier = Number(
      getProperty(result, "item.system.tier")
      ?? getProperty(context.sourceItem, "system.tier")
    );
    const baseDifficulty = Number(result?.baseDifficulty ?? 10);
    const target = Number.isFinite(tier) ? tier + baseDifficulty : null;

    if (Number.isFinite(total) && Number.isFinite(target)) {
      return { completed: true, success: total >= target, critical };
    }

    return { completed: Boolean(matchingNewRollMessage(context)), success: null, critical };
  }

  function digestV4Result(result, context) {
    const message = matchingNewRollMessage(context);
    if (result === true) return { completed: true, success: true, critical: null };
    if (result === false && message) {
      const flagSuccess = getProperty(message, "flags.shadowdark.success");
      const mainRoll = message.rolls?.find?.(roll => roll?.options?.type === "main") ?? message.rolls?.[0];
      const success = flagSuccess === true
        ? true
        : flagSuccess === false
          ? false
          : mainRoll?.success === true
            ? true
            : mainRoll?.success === false
              ? false
              : false;
      const critical = getProperty(message, "flags.shadowdark.critical")
        ?? (mainRoll?.criticalFailure === true
          ? "failure"
          : mainRoll?.criticalSuccess === true
            ? "success"
            : null);
      return { completed: true, success, critical };
    }
    return { completed: false, success: null, critical: null };
  }

  function isSpellDocument(document) {
    const type = String(document?.type ?? "").toLowerCase();
    let nativeSpell = false;
    try {
      nativeSpell = document?.isSpell?.() === true;
    } catch (_error) {
      nativeSpell = false;
    }
    return document?.system?.isSpell === true
      || nativeSpell
      || type === "spell"
      || type === "npc spell";
  }

  async function loseSpellUseForDay(context) {
    const sourceItem = context?.sourceItem;
    const spell = context?.spell;
    const spellUuid = spell?.uuid
      ?? getProperty(sourceItem, "system.spellUuid")
      ?? sourceItem?.uuid;

    try {
      if (sourceItem?.system?.isWand && typeof sourceItem.system.setSpellLost === "function") {
        await sourceItem.system.setSpellLost(spellUuid, true, true);
        return true;
      }

      const candidates = [sourceItem, spell].filter(Boolean);
      for (const candidate of candidates) {
        if (!isSpellDocument(candidate) || typeof candidate.update !== "function") continue;
        if (getProperty(candidate, "system.lost") !== true) {
          await candidate.update({ "system.lost": true });
        }
        return true;
      }
    } catch (error) {
      warn("Could not mark the critically failed Focus spell as lost", error);
      return false;
    }

    warn("Could not find a persistent spell use to mark as lost after a critical Focus failure");
    return false;
  }

  async function handleCastResult(context, result) {
    if (!enabled() || !context?.isFocusSpell) return;

    let digest = context.generation === 3
      ? digestV3Result(result, context)
      : digestV4Result(result, context);

    if (context.generation === 4 && result === false && !digest.completed) {
      await new Promise(resolve => window.setTimeout(resolve, 75));
      digest = digestV4Result(result, context);
    }

    if (!digest.completed || digest.success === null) return;

    if (!context.isFocusCheck) {
      if (digest.success) {
        await startFocusFromContext(context, digest.critical === "success");
      }
      return;
    }

    const state = getState(context.actor);
    let session = context.checkId
      ? state.sessions.find(entry => entry.pendingChecks.some(check => check.id === context.checkId))
      : null;

    session ??= state.sessions.find(entry => sessionMatchesContext(entry, context));

    if (!session && state.sessions.length === 1) session = state.sessions[0];

    if (!session) {
      if (digest.success) {
        const adopted = await startFocusFromContext(context, false);
        if (adopted) {
          await recordSuccessfulCheck(context.actor, adopted.id, context.checkId, {
            reason: "manual",
            critical: digest.critical
          });
        }
      }
      return;
    }

    if (digest.success) {
      await recordSuccessfulCheck(context.actor, session.id, context.checkId, {
        reason: "manual",
        critical: digest.critical
      });
    } else {
      const criticalFailure = digest.critical === "failure";
      if (criticalFailure) await loseSpellUseForDay(context);
      await endFocus(context.actor, session.id, {
        reason: criticalFailure ? "criticalFailure" : "failure"
      });
    }
  }

  function capacityReachedForInitialCast(context) {
    if (!context?.isFocusSpell || context.isFocusCheck) return false;
    const sessions = getSessions(context.actor);
    return sessions.length >= getActorCapacity(context.actor);
  }

  function blockCapacityNotice(context) {
    const capacity = getActorCapacity(context.actor);
    ui.notifications?.warn(
      `${context.actor.name} cannot cast another Focus spell while maintaining ${capacity} Focus spell${capacity === 1 ? "" : "s"}.`
    );
  }

  function wrapCastMethod(prototype, methodName, generation) {
    if (!prototype || typeof prototype[methodName] !== "function") return false;
    const original = prototype[methodName];
    if (original[WRAPPED]) return false;

    const wrapped = async function(...args) {
      let context = null;
      try {
        context = generation === 3
          ? await buildV3CastContext(this, args)
          : await buildV4CastContext(this, args);
      } catch (error) {
        warn("Could not build native cast context", error);
      }

      if (enabled() && capacityReachedForInitialCast(context)) {
        blockCapacityNotice(context);
        return false;
      }

      const result = await original.apply(this, args);

      try {
        await handleCastResult(context, result);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not process native Focus result`, error);
      }

      return result;
    };

    Object.defineProperty(wrapped, WRAPPED, { value: true });
    Object.defineProperty(wrapped, "name", { value: original.name, configurable: true });
    prototype[methodName] = wrapped;
    log(`Wrapped ${generation === 3 ? "Actor" : "Actor system"}.${methodName}`);
    return true;
  }

  function installV3Wrapper() {
    const prototype = CONFIG.Actor?.documentClass?.prototype;
    const player = wrapCastMethod(prototype, "castSpell", 3);
    const npc = wrapCastMethod(prototype, "castNPCSpell", 3);
    return player || npc;
  }

  function collectV4ModelPrototypes() {
    const prototypes = new Set();

    const dataModels = CONFIG.Actor?.dataModels;
    if (dataModels && typeof dataModels === "object") {
      for (const modelClass of Object.values(dataModels)) {
        if (modelClass?.prototype) prototypes.add(modelClass.prototype);
      }
    }

    for (const actor of game.actors ?? []) {
      if (actor?.system?.constructor?.prototype) prototypes.add(actor.system.constructor.prototype);
    }

    for (const token of canvas?.tokens?.placeables ?? []) {
      if (token.actor?.system?.constructor?.prototype) prototypes.add(token.actor.system.constructor.prototype);
    }

    return prototypes;
  }

  function installV4Wrappers() {
    let installed = false;
    for (const prototype of collectV4ModelPrototypes()) {
      installed = wrapCastMethod(prototype, "castSpell", 4) || installed;
    }
    return installed;
  }

  function installNativeAdapters() {
    if (game.system?.id !== "shadowdark") return;
    const v3 = installV3Wrapper();
    const v4 = installV4Wrappers();
    log("Native adapters installed", { v3, v4, systemVersion: game.system.version });
  }

  function exposeApi() {
    const module = game.modules.get(MODULE_ID);
    if (!module) return;

    module.api ??= {};
    module.api.focus = {
      getSessions: actor => clone(getSessions(actor)),
      getCapacity: actor => getActorCapacity(actor),
      setCapacity: (actor, capacity) => setActorCapacity(actor, capacity),
      startFocus: (actor, itemOrSpell, options = {}) => startFocus(actor, itemOrSpell, options),
      endFocus: (actor, sessionId = null, options = {}) => endFocus(actor, sessionId, options),
      rollFocusCheck: (actor, sessionId = null, options = {}) => rollFocusCheck(actor, sessionId, options),
      markCheckDue: (actor, sessionId, reason = "distraction", details = {}) => markCheckDue(actor, sessionId, reason, details),
      openSource: (actor, sessionId = null) => openSessionSource(actor, sessionId),
      syncTokenIcons: () => syncAllFocusStatusEffects()
    };
  }

  Hooks.once("init", () => {
    exposeApi();
    log("Initialized");
  });

  Hooks.once("ready", () => {
    if (game.system?.id !== "shadowdark") {
      warn("Disabled because the active system is not Shadowdark.");
      return;
    }

    installNativeAdapters();
    exposeApi();
    void syncAllFocusStatusEffects();

    game.socket?.on(SOCKET_CHANNEL, payload => {
      if (payload?.type === "focus-hp-decrease") void processDamagePayload(payload);
    });

    log("Ready", { foundry: game.version, shadowdark: game.system.version });
  });

  const actorRenderHooks = [
    "renderActorSheet",
    "renderActorSheetSD",
    "renderPlayerSheetSD",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  for (const hook of actorRenderHooks) {
    Hooks.on(hook, (app, html) => {
      installV4Wrappers();
      renderActorFocus(app, html);
      window.setTimeout(() => renderActorFocus(app, html), 0);
      window.setTimeout(() => renderActorFocus(app, html), 125);
    });
  }

  Hooks.on("renderChatMessage", (message, html) => attachChatListeners(message, html));
  Hooks.on("updateCombat", (combat, changes) => onCombatUpdate(combat, changes));
  Hooks.on("preUpdateActor", (actor, changes) => onPreUpdateActor(actor, changes));
  Hooks.on("createActor", actor => {
    installV4Wrappers();
    if (isAuthority(actor)) void syncFocusStatusEffect(actor);
  });
  Hooks.on("canvasReady", () => {
    installV4Wrappers();
    void syncAllFocusStatusEffects();
  });
})();
