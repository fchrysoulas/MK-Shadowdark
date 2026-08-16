// MK-Shadowdark — Morale Automation
// Automates Shadowdark morale checks for hostile NPC combatants.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Morale";
  const STATE_FLAG = "moraleState";
  const TOKEN_FLAG = "morale";
  const STATE_VERSION = 1;
  const MORALE_DC = 15;
  const FEATURE_SETTINGS_TEMPLATE = `modules/${MODULE_ID}/templates/feature-settings.hbs`;

  const SETTINGS = Object.freeze({
    ENABLED: "moraleEnabled",
    AUTO_GROUP: "moraleAutoGroupIdentical",
    VISIBILITY: "moraleVisibility",
    TOKEN_HUD: "moraleTokenHudControls",
    DEBUG: "moraleDebug"
  });

  const evaluationTimers = new Map();
  const internalCombatUpdates = new Set();

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function log(...args) {
    if (!setting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function setting(key, fallback) {
    try {
      const value = game.settings.get(MODULE_ID, key);
      return value ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function enabled() {
    return game.system?.id === "shadowdark" && setting(SETTINGS.ENABLED, true);
  }

  function getProperty(object, path) {
    if (globalThis.foundry?.utils?.getProperty) {
      return globalThis.foundry.utils.getProperty(object, path);
    }
    return String(path).split(".").reduce((current, key) => current?.[key], object);
  }

  function deepClone(value) {
    if (globalThis.foundry?.utils?.deepClone) {
      return globalThis.foundry.utils.deepClone(value);
    }
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    const text = String(value ?? "");
    if (globalThis.foundry?.utils?.escapeHTML) {
      return globalThis.foundry.utils.escapeHTML(text);
    }
    return text.replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function randomId() {
    if (globalThis.foundry?.utils?.randomID) return globalThis.foundry.utils.randomID();
    return Math.random().toString(36).slice(2, 14);
  }

  function slug(value) {
    const text = String(value ?? "").trim().toLowerCase();
    if (typeof text.slugify === "function") return text.slugify();
    return text
      .normalize?.("NFKD")
      ?.replace(/[\u0300-\u036f]/g, "")
      ?.replace(/[^a-z0-9]+/g, "-")
      ?.replace(/^-+|-+$/g, "") || randomId();
  }

  function getPrimaryActiveGM() {
    return game.users
      ?.filter(user => user.active && user.isGM)
      ?.sort((left, right) => String(left.id).localeCompare(String(right.id)))[0] ?? null;
  }

  function isAuthority() {
    const gm = getPrimaryActiveGM();
    return Boolean(gm && game.user?.id === gm.id);
  }

  function isStartedCombat(combat) {
    if (!combat) return false;
    if (combat.started !== undefined) return combat.started === true;
    return Number(combat.round ?? 0) > 0;
  }

  function isNpc(actor) {
    return String(actor?.type ?? "").toLowerCase() === "npc";
  }

  function isHostileCombatant(combatant) {
    if (!combatant || !isNpc(combatant.actor)) return false;

    const token = combatant.token;
    const disposition = Number(token?.disposition ?? combatant.token?.disposition);
    const hostile = CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1;
    return Number.isFinite(disposition) ? disposition === hostile : true;
  }

  function actorEncounterFlag(actor, key) {
    try {
      const data = actor?.getFlag?.(MODULE_ID, "encounter");
      if (data && Object.prototype.hasOwnProperty.call(data, key)) return data[key];
    } catch (_error) {
      // Fall through to source data.
    }
    return getProperty(actor, `flags.${MODULE_ID}.encounter.${key}`)
      ?? getProperty(actor?._source, `flags.${MODULE_ID}.encounter.${key}`);
  }

  function tokenMoraleData(tokenDoc) {
    try {
      const value = tokenDoc?.getFlag?.(MODULE_ID, TOKEN_FLAG);
      if (value && typeof value === "object") return value;
    } catch (_error) {
      // Fall through to source data.
    }
    return getProperty(tokenDoc, `flags.${MODULE_ID}.${TOKEN_FLAG}`)
      ?? getProperty(tokenDoc?._source, `flags.${MODULE_ID}.${TOKEN_FLAG}`)
      ?? {};
  }

  function isMoraleImmune(combatant) {
    if (!combatant) return true;
    const tokenData = tokenMoraleData(combatant.token);
    if (tokenData.immune === true) return true;
    return actorEncounterFlag(combatant.actor, "moraleImmune") === true;
  }

  function getExplicitGroup(combatant) {
    const value = tokenMoraleData(combatant?.token).group;
    const text = String(value ?? "").trim();
    return text || null;
  }

  function isExplicitLeader(combatant) {
    return tokenMoraleData(combatant?.token).leader === true;
  }

  function getWisMod(actor) {
    const candidates = [
      "system.abilities.wis.mod",
      "system.abilities.wis.modifier",
      "system.abilities.wis.bonus",
      "system.stats.wis.mod",
      "system.wis.mod"
    ];

    for (const path of candidates) {
      const value = Number(getProperty(actor, path));
      if (Number.isFinite(value)) return value;
    }

    const base = Number(getProperty(actor, "system.abilities.wis.base"));
    const bonus = Number(getProperty(actor, "system.abilities.wis.bonus"));
    if (Number.isFinite(base)) {
      const total = base + (Number.isFinite(bonus) ? bonus : 0);
      return Math.floor((total - 10) / 2);
    }

    return 0;
  }

  function getHp(actor) {
    if (!actor) return null;
    const valueCandidates = [
      "system.attributes.hp.value",
      "system.hp.value",
      "system.hp"
    ];
    const maxCandidates = [
      "system.attributes.hp.max",
      "system.hp.max",
      "system.attributes.hp.base"
    ];

    let value = null;
    let max = null;
    for (const path of valueCandidates) {
      const candidate = Number(getProperty(actor, path));
      if (Number.isFinite(candidate)) {
        value = candidate;
        break;
      }
    }
    for (const path of maxCandidates) {
      const candidate = Number(getProperty(actor, path));
      if (Number.isFinite(candidate) && candidate >= 0) {
        max = candidate;
        break;
      }
    }

    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
    return { value, max };
  }

  function combatantDefeated(combatant) {
    if (!combatant) return true;
    if (combatant.defeated === true) return true;

    const hp = getHp(combatant.actor);
    if (hp && hp.value <= 0) return true;

    try {
      const defeatedStatus = CONFIG.specialStatusEffects?.DEFEATED;
      if (defeatedStatus && combatant.token?.hasStatusEffect?.(defeatedStatus)) return true;
    } catch (_error) {
      // Defeated flag and HP are sufficient fallbacks.
    }

    return false;
  }

  function combatantsArray(combat) {
    if (!combat?.combatants) return [];
    if (Array.isArray(combat.combatants)) return combat.combatants;
    if (Array.isArray(combat.combatants.contents)) return combat.combatants.contents;
    if (typeof combat.combatants.values === "function") return [...combat.combatants.values()];
    return [];
  }

  function getCombatant(combat, id) {
    if (!combat || !id) return null;
    return combat.combatants?.get?.(id)
      ?? combatantsArray(combat).find(combatant => combatant.id === id)
      ?? null;
  }

  function buildGroupIdentity(combatant) {
    const explicit = getExplicitGroup(combatant);
    if (explicit) {
      return {
        key: `explicit:${slug(explicit)}`,
        name: explicit,
        mode: "explicit"
      };
    }

    if (setting(SETTINGS.AUTO_GROUP, true) && combatant.actorId) {
      return {
        key: `actor:${combatant.actorId}`,
        name: combatant.actor?.name ?? combatant.name ?? "NPC Group",
        mode: "actor"
      };
    }

    return {
      key: `solo:${combatant.id}`,
      name: combatant.name ?? combatant.actor?.name ?? "NPC",
      mode: "solo"
    };
  }

  function memberSnapshot(combatant) {
    const hp = getHp(combatant.actor);
    return {
      combatantId: combatant.id,
      actorId: combatant.actorId ?? combatant.actor?.id ?? null,
      tokenId: combatant.tokenId ?? combatant.token?.id ?? null,
      actorUuid: combatant.actor?.uuid ?? null,
      name: combatant.name ?? combatant.actor?.name ?? "NPC",
      wisMod: getWisMod(combatant.actor),
      maxHp: hp?.max ?? null
    };
  }

  function buildSnapshot(combat) {
    const groups = {};

    for (const combatant of combatantsArray(combat)) {
      if (!isHostileCombatant(combatant) || isMoraleImmune(combatant)) continue;

      const identity = buildGroupIdentity(combatant);
      const group = groups[identity.key] ??= {
        key: identity.key,
        name: identity.name,
        mode: identity.mode,
        initialCount: 0,
        threshold: 0,
        checked: false,
        result: null,
        members: []
      };

      group.members.push(memberSnapshot(combatant));
      group.initialCount += 1;
    }

    for (const group of Object.values(groups)) {
      group.threshold = group.initialCount > 1
        ? Math.floor(group.initialCount / 2)
        : null;
    }

    return {
      version: STATE_VERSION,
      initializedAt: Date.now(),
      combatId: combat.id,
      groups
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const state = deepClone(raw);
    state.version = STATE_VERSION;
    state.groups = state.groups && typeof state.groups === "object" ? state.groups : {};
    return state;
  }

  function getState(combat) {
    if (!combat) return null;
    try {
      return normalizeState(combat.getFlag?.(MODULE_ID, STATE_FLAG));
    } catch (_error) {
      return normalizeState(getProperty(combat, `flags.${MODULE_ID}.${STATE_FLAG}`));
    }
  }

  async function setState(combat, state) {
    if (!combat) return false;
    const path = `flags.${MODULE_ID}.${STATE_FLAG}`;
    internalCombatUpdates.add(combat.id);
    try {
      await combat.update({ [path]: state });
      return true;
    } finally {
      window.setTimeout(() => internalCombatUpdates.delete(combat.id), 0);
    }
  }

  async function clearState(combat) {
    if (!combat) return false;
    internalCombatUpdates.add(combat.id);
    try {
      if (combat.unsetFlag) await combat.unsetFlag(MODULE_ID, STATE_FLAG);
      else await combat.update({ [`flags.${MODULE_ID}.-=${STATE_FLAG}`]: null });
      return true;
    } finally {
      window.setTimeout(() => internalCombatUpdates.delete(combat.id), 0);
    }
  }

  async function ensureSnapshot(combat, { force = false } = {}) {
    if (!enabled() || !isAuthority() || !isStartedCombat(combat)) return getState(combat);
    const current = getState(combat);
    if (current && !force) return current;

    const next = buildSnapshot(combat);
    await setState(combat, next);
    log("snapshot", combat.name ?? combat.id, next);
    return next;
  }

  function livingMembers(combat, group) {
    return (group.members ?? [])
      .map(member => getCombatant(combat, member.combatantId))
      .filter(combatant => combatant && !combatantDefeated(combatant));
  }

  function selectMoraleSource(combat, group) {
    const living = livingMembers(combat, group);
    if (!living.length) return null;

    const leader = living.find(isExplicitLeader);
    if (leader) {
      return {
        combatant: leader,
        actor: leader.actor,
        modifier: getWisMod(leader.actor),
        reason: "leader"
      };
    }

    const byModifier = new Map();
    for (const combatant of living) {
      const modifier = getWisMod(combatant.actor);
      const bucket = byModifier.get(modifier) ?? [];
      bucket.push(combatant);
      byModifier.set(modifier, bucket);
    }

    const ranked = [...byModifier.entries()].sort((left, right) => {
      const countDifference = right[1].length - left[1].length;
      if (countDifference !== 0) return countDifference;
      // A mixed group with no clear majority does not receive the best WIS by default.
      return left[0] - right[0];
    });

    const [modifier, candidates] = ranked[0];
    const combatant = candidates[0];
    return {
      combatant,
      actor: combatant.actor,
      modifier,
      reason: "majority"
    };
  }

  function moraleTrigger(combat, group) {
    if (!group || group.checked === true) return null;

    if (group.initialCount <= 1) {
      const member = group.members?.[0];
      const combatant = member ? getCombatant(combat, member.combatantId) : null;
      if (!combatant || combatantDefeated(combatant)) return null;

      const hp = getHp(combatant.actor);
      const maxHp = Number(member?.maxHp ?? hp?.max);
      if (!hp || !Number.isFinite(maxHp) || maxHp <= 0) return null;

      const threshold = maxHp / 2;
      if (hp.value > 0 && hp.value <= threshold) {
        return {
          type: "solo",
          currentHp: hp.value,
          maxHp,
          threshold
        };
      }
      return null;
    }

    const living = livingMembers(combat, group);
    const current = living.length;
    const threshold = Number(group.threshold ?? Math.floor(group.initialCount / 2));
    if (current > 0 && current <= threshold) {
      return {
        type: "group",
        current,
        initial: group.initialCount,
        threshold
      };
    }

    return null;
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number >= 0 ? `+${number}` : String(number);
  }

  function whisperIds() {
    if (setting(SETTINGS.VISIBILITY, "public") !== "gm") return [];
    return game.users?.filter(user => user.isGM).map(user => user.id) ?? [];
  }

  function triggerDescription(trigger) {
    if (trigger.type === "solo") {
      const threshold = Number.isInteger(trigger.threshold)
        ? trigger.threshold
        : trigger.threshold.toFixed(1);
      return `${trigger.currentHp} / ${trigger.maxHp} HP (half HP: ${threshold})`;
    }
    return `${trigger.current} / ${trigger.initial} enemies remain`;
  }

  async function postMoraleRoll(combat, group, trigger, source, roll) {
    const success = Number(roll.total) >= MORALE_DC;
    const resultLabel = success ? "MORALE HOLDS" : "MORALE FAILED";
    const resultIcon = success ? "✓" : "✘";
    const consequence = success
      ? "The enemies maintain their nerve."
      : "The enemies attempt to flee. The GM decides how they escape, surrender, or otherwise react to the fiction.";
    const sourceLabel = source.reason === "leader"
      ? `${source.combatant?.name ?? source.actor?.name ?? "Leader"} (leader)`
      : `${source.combatant?.name ?? source.actor?.name ?? "Group"} (group WIS)`;

    const content = `
      <div class="mk-morale-card" data-mk-morale-group="${escapeHtml(group.key)}">
        <header style="border-bottom:1px solid var(--color-border-light-2, #777); margin-bottom:0.45rem; padding-bottom:0.3rem;">
          <strong>☠ MORALE CHECK — ${escapeHtml(group.name)}</strong>
        </header>
        <div style="display:grid; gap:0.25rem;">
          <div>${escapeHtml(triggerDescription(trigger))}</div>
          <div>WIS ${escapeHtml(signed(source.modifier))} vs DC ${MORALE_DC}</div>
          <div style="font-size:0.9em; opacity:0.8;">Using ${escapeHtml(sourceLabel)}</div>
          <div style="font-size:1.08em; margin-top:0.2rem;"><strong>${resultIcon} ${resultLabel}</strong> — ${escapeHtml(String(roll.total))}</div>
          <div>${escapeHtml(consequence)}</div>
        </div>
      </div>`;

    const messageData = {
      speaker: ChatMessage.getSpeaker?.({ actor: source.actor }) ?? {},
      style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.ROLL ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5,
      content,
      rolls: [roll]
    };

    const whisper = whisperIds();
    if (whisper.length) messageData.whisper = whisper;
    await ChatMessage.create(messageData);
    return success;
  }

  async function executeMoraleCheck(combat, state, group, trigger) {
    const source = selectMoraleSource(combat, group);
    if (!source?.actor) return false;

    group.checked = true;
    group.result = {
      checkedAt: Date.now(),
      trigger: deepClone(trigger),
      modifier: source.modifier,
      sourceCombatantId: source.combatant?.id ?? null,
      sourceReason: source.reason,
      total: null,
      success: null
    };

    await setState(combat, state);

    try {
      const roll = await new Roll(`1d20 + ${Number(source.modifier) || 0}`).evaluate();
      const success = await postMoraleRoll(combat, group, trigger, source, roll);
      group.result.total = Number(roll.total);
      group.result.success = success;
      await setState(combat, state);
      log("morale check", group.name, group.result);
      return true;
    } catch (error) {
      group.checked = false;
      group.result = null;
      await setState(combat, state);
      console.error(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} | Morale roll failed`, error);
      ui.notifications?.error(`MK-Shadowdark | Could not roll morale for ${group.name}.`);
      return false;
    }
  }

  async function evaluateCombat(combat) {
    if (!enabled() || !isAuthority() || !isStartedCombat(combat)) return false;

    const state = await ensureSnapshot(combat);
    if (!state) return false;

    for (const group of Object.values(state.groups ?? {})) {
      if (group.checked === true) continue;
      const trigger = moraleTrigger(combat, group);
      if (!trigger) continue;
      await executeMoraleCheck(combat, state, group, trigger);
    }

    return true;
  }

  function scheduleEvaluation(combat, delay = 80) {
    if (!combat?.id || !enabled()) return;
    const existing = evaluationTimers.get(combat.id);
    if (existing) window.clearTimeout(existing);

    const timer = window.setTimeout(() => {
      evaluationTimers.delete(combat.id);
      void evaluateCombat(combat);
    }, delay);
    evaluationTimers.set(combat.id, timer);
  }

  function combatsContainingActor(actor) {
    if (!actor) return [];
    return [...(game.combats ?? [])].filter(combat => {
      if (!isStartedCombat(combat)) return false;
      return combatantsArray(combat).some(combatant => {
        if (!combatant.actor) return false;
        if (combatant.actor.uuid && actor.uuid) return combatant.actor.uuid === actor.uuid;
        return combatant.actorId === actor.id;
      });
    });
  }

  function changedValue(changes, path) {
    if (!changes || typeof changes !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(changes, path)) return changes[path];
    return getProperty(changes, path);
  }

  function onActorUpdated(actor, changes) {
    if (!enabled() || !isAuthority()) return;
    const hpChanged = changedValue(changes, "system.attributes.hp.value") !== undefined
      || changedValue(changes, "system.hp.value") !== undefined
      || changedValue(changes, "system.hp") !== undefined;
    if (!hpChanged) return;

    for (const combat of combatsContainingActor(actor)) scheduleEvaluation(combat);
  }

  function onCombatantChanged(combatant) {
    if (!enabled() || !isAuthority()) return;
    const combat = combatant?.parent;
    if (combat) scheduleEvaluation(combat);
  }

  function onCombatUpdated(combat, changes) {
    if (!enabled() || !isAuthority() || internalCombatUpdates.has(combat.id)) return;
    const relevant = Object.prototype.hasOwnProperty.call(changes ?? {}, "round")
      || Object.prototype.hasOwnProperty.call(changes ?? {}, "turn")
      || Object.prototype.hasOwnProperty.call(changes ?? {}, "active");
    if (!relevant) return;

    if (isStartedCombat(combat)) {
      void ensureSnapshot(combat).then(() => scheduleEvaluation(combat, 0));
    }
  }

  async function resetCombat(combat = game.combat) {
    if (!combat || !isAuthority()) return false;
    await clearState(combat);
    if (isStartedCombat(combat)) {
      await ensureSnapshot(combat, { force: true });
      scheduleEvaluation(combat, 0);
    }
    ui.notifications?.info("MK-Shadowdark | Morale strength reset for this combat.");
    return true;
  }

  function tokenDocument(value) {
    if (!value) return null;
    if (value.documentName === "Token") return value;
    if (value.document?.documentName === "Token") return value.document;
    if (value.object?.documentName === "Token") return value.object;
    return value.document ?? null;
  }

  function tokenDocsFromInput(tokens) {
    const values = Array.isArray(tokens) ? tokens : [tokens];
    return values.map(tokenDocument).filter(Boolean);
  }

  async function setGroup(tokens, groupName) {
    if (!game.user?.isGM) return false;
    const docs = tokenDocsFromInput(tokens);
    if (!docs.length) return false;
    const group = String(groupName ?? "").trim();

    for (const doc of docs) {
      const current = tokenMoraleData(doc);
      const next = { ...current };
      if (group) next.group = group;
      else delete next.group;
      await doc.setFlag(MODULE_ID, TOKEN_FLAG, next);
    }

    if (isStartedCombat(game.combat)) {
      await resetCombat(game.combat);
    }
    return true;
  }

  async function setLeader(token, leader = true) {
    if (!game.user?.isGM) return false;
    const doc = tokenDocument(token);
    if (!doc) return false;
    const current = tokenMoraleData(doc);
    await doc.setFlag(MODULE_ID, TOKEN_FLAG, { ...current, leader: leader === true });
    scheduleEvaluation(game.combat, 0);
    return true;
  }

  async function setImmune(token, immune = true) {
    if (!game.user?.isGM) return false;
    const doc = tokenDocument(token);
    if (!doc) return false;
    const current = tokenMoraleData(doc);
    await doc.setFlag(MODULE_ID, TOKEN_FLAG, { ...current, immune: immune === true });
    if (isStartedCombat(game.combat)) await resetCombat(game.combat);
    return true;
  }

  function getHudTokenDocs(app) {
    const hudDoc = tokenDocument(app?.object);
    const controlled = canvas?.tokens?.controlled?.map(token => token.document).filter(Boolean) ?? [];
    if (hudDoc && !controlled.some(doc => doc.id === hudDoc.id)) controlled.push(hudDoc);
    return controlled.length ? controlled : (hudDoc ? [hudDoc] : []);
  }

  function openGroupDialog(app) {
    const docs = getHudTokenDocs(app);
    if (!docs.length) return;
    const existingGroups = [...new Set(docs.map(doc => String(tokenMoraleData(doc).group ?? "").trim()))];
    const initial = existingGroups.length === 1 ? existingGroups[0] : "";

    const content = `
      <form class="mk-morale-group-form">
        <div class="form-group">
          <label>Morale Group</label>
          <input type="text" name="group" value="${escapeHtml(initial)}" placeholder="e.g. Black Fang Tribe" />
          <p class="hint">Selected tokens with the same group name make one morale unit. Leave blank to return to automatic grouping.</p>
        </div>
      </form>`;

    const apply = html => {
      const root = html?.[0] ?? html;
      const group = root?.querySelector?.('input[name="group"]')?.value ?? "";
      void setGroup(docs, group);
    };

    if (globalThis.Dialog) {
      new Dialog({
        title: "MK-Shadowdark | Morale Group",
        content,
        buttons: {
          apply: { label: "Apply", callback: apply },
          cancel: { label: "Cancel" }
        },
        default: "apply"
      }).render(true);
    }
  }

  function renderTokenHud(app, html) {
    if (!enabled() || !game.user?.isGM || !setting(SETTINGS.TOKEN_HUD, true)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelector) return;

    const right = root.querySelector(".col.right");
    if (!right || right.querySelector(".mk-morale-group-control")) return;

    const doc = tokenDocument(app?.object);
    if (!doc || !isNpc(doc.actor)) return;
    const data = tokenMoraleData(doc);

    const groupControl = document.createElement("div");
    groupControl.className = "control-icon mk-morale-group-control";
    groupControl.title = data.group ? `Morale Group: ${data.group}` : "Set Morale Group";
    groupControl.innerHTML = '<i class="fas fa-users"></i>';
    groupControl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openGroupDialog(app);
    });

    const leaderControl = document.createElement("div");
    leaderControl.className = `control-icon mk-morale-leader-control${data.leader === true ? " active" : ""}`;
    leaderControl.title = data.leader === true ? "Morale Leader (click to clear)" : "Mark as Morale Leader";
    leaderControl.innerHTML = '<i class="fas fa-crown"></i>';
    leaderControl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void setLeader(doc, data.leader !== true).then(() => app.render?.(false));
    });

    const resetControl = document.createElement("div");
    resetControl.className = "control-icon mk-morale-reset-control";
    resetControl.title = "Reset Morale Strength for Current Combat";
    resetControl.innerHTML = '<i class="fas fa-rotate"></i>';
    resetControl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void resetCombat(game.combat);
    });

    right.append(groupControl, leaderControl, resetControl);
  }

  function registerSettings() {
    const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication;
    const useMenu = Boolean(FormApplicationBase);

    const definitions = {
      [SETTINGS.ENABLED]: {
        name: "Morale | Enabled",
        hint: "Automatically rolls Shadowdark morale checks for hostile NPCs at half strength or, for a solo enemy, at half HP.",
        scope: "world",
        type: Boolean,
        default: true
      },
      [SETTINGS.AUTO_GROUP]: {
        name: "Morale | Auto-group Identical NPCs",
        hint: "NPC combatants created from the same Actor automatically share one morale group unless a manual token group is assigned.",
        scope: "world",
        type: Boolean,
        default: true
      },
      [SETTINGS.VISIBILITY]: {
        name: "Morale | Roll Visibility",
        hint: "Choose whether morale results are public or whispered to GMs.",
        scope: "world",
        type: String,
        default: "public",
        choices: {
          public: "Public",
          gm: "GM only"
        }
      },
      [SETTINGS.TOKEN_HUD]: {
        name: "Morale | Token HUD Controls",
        hint: "Adds GM Token HUD buttons for assigning a manual morale group and marking a morale leader.",
        scope: "world",
        type: Boolean,
        default: true
      },
      [SETTINGS.DEBUG]: {
        name: "Morale | Debug Mode",
        hint: "Logs morale snapshots, triggers, and rolls to the browser console.",
        scope: "world",
        type: Boolean,
        default: false
      }
    };

    for (const [key, definition] of Object.entries(definitions)) {
      if (game.settings.settings.has(`${MODULE_ID}.${key}`)) continue;
      game.settings.register(MODULE_ID, key, {
        ...definition,
        config: !useMenu
      });
    }

    if (!useMenu) return;

    function descriptor(key) {
      const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
      const value = game.settings.get(MODULE_ID, key);
      const choices = typeof definition.choices === "function" ? definition.choices() : definition.choices;
      return {
        key,
        name: String(definition.name).replace(/^.*?(?:\s\|\s|:\s*)/, ""),
        hint: String(definition.hint ?? ""),
        value,
        isBoolean: definition.type === Boolean,
        isNumber: definition.type === Number,
        isSelect: Boolean(choices && Object.keys(choices).length),
        isRange: false,
        isFilePicker: false,
        isTextarea: false,
        isColor: false,
        inputType: definition.type === Number ? "number" : "text",
        dataType: definition.type === Number ? "Number" : "String",
        range: {},
        options: choices
          ? Object.entries(choices).map(([optionValue, label]) => ({
              value: optionValue,
              label,
              selected: String(optionValue) === String(value)
            }))
          : []
      };
    }

    class MoraleSettingsForm extends FormApplicationBase {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: `${MODULE_ID}-morale-settings`,
          title: "MK-Shadowdark | Morale",
          template: FEATURE_SETTINGS_TEMPLATE,
          width: 680,
          height: "auto",
          resizable: true,
          closeOnSubmit: true
        });
      }

      getData() {
        return {
          title: "Morale",
          hint: "Automate Shadowdark DC 15 WIS morale checks while leaving flee and surrender behavior to the GM.",
          sections: [
            {
              title: "Automation",
              settings: [descriptor(SETTINGS.ENABLED), descriptor(SETTINGS.AUTO_GROUP)]
            },
            {
              title: "Presentation and Controls",
              settings: [descriptor(SETTINGS.VISIBILITY), descriptor(SETTINGS.TOKEN_HUD), descriptor(SETTINGS.DEBUG)]
            }
          ]
        };
      }

      async _updateObject(_event, formData) {
        for (const key of Object.values(SETTINGS)) {
          const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
          if (!definition) continue;
          let value = formData[key];
          if (definition.type === Boolean) value = value === true || value === "true" || value === "on" || value === 1;
          else if (definition.type === Number) value = Number(value);
          else value = String(value ?? "");
          await game.settings.set(MODULE_ID, key, value);
        }
      }
    }

    game.settings.registerMenu(MODULE_ID, "moraleSettings", {
      name: "Morale",
      label: "Configure",
      hint: "Configure automatic Shadowdark morale checks, grouping, visibility, and Token HUD controls.",
      icon: "fas fa-flag",
      type: MoraleSettingsForm,
      restricted: true
    });
  }

  function exposeApi() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = mod.api ?? {};
    mod.api.morale = {
      getState,
      snapshot: combat => ensureSnapshot(combat ?? game.combat, { force: false }),
      evaluate: combat => evaluateCombat(combat ?? game.combat),
      reset: combat => resetCombat(combat ?? game.combat),
      setGroup,
      setLeader,
      setImmune
    };
  }

  Hooks.once("init", () => {
    registerSettings();
  });

  Hooks.once("ready", () => {
    exposeApi();
    if (!enabled() || !isAuthority()) return;
    for (const combat of game.combats ?? []) {
      if (isStartedCombat(combat)) {
        void ensureSnapshot(combat).then(() => scheduleEvaluation(combat, 0));
      }
    }
  });

  Hooks.on("updateActor", (actor, changes) => onActorUpdated(actor, changes));
  Hooks.on("updateCombatant", combatant => onCombatantChanged(combatant));
  Hooks.on("deleteCombatant", combatant => onCombatantChanged(combatant));
  Hooks.on("createCombatant", combatant => {
    // Reinforcements do not alter the combat-start baseline automatically.
    // They become part of morale only when the GM explicitly resets morale strength.
    log("combatant added; baseline unchanged", combatant?.name ?? combatant?.id);
  });
  Hooks.on("combatStart", combat => {
    if (!enabled() || !isAuthority()) return;
    void ensureSnapshot(combat, { force: true }).then(() => scheduleEvaluation(combat, 0));
  });
  Hooks.on("updateCombat", (combat, changes) => onCombatUpdated(combat, changes));
  Hooks.on("deleteCombat", combat => {
    const timer = evaluationTimers.get(combat?.id);
    if (timer) window.clearTimeout(timer);
    evaluationTimers.delete(combat?.id);
  });
  Hooks.on("renderTokenHUD", (app, html) => renderTokenHud(app, html));
})();
