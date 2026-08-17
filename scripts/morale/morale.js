import { PREDEFINED_EFFECT_KEYS } from "../libs/predefined-effects.js";

// MK-Shadowdark - Morale Automation
// Tracks all hostile NPC combatants as one force for Shadowdark morale.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Morale";
  const STATE_FLAG = "moraleState";
  const TOKEN_FLAG = "morale";
  const STATE_VERSION = 3;
  const MORALE_DC = 15;
  const FORCE_KEY = "hostile-force";
  const FLEEING_STATUS_ID = "mk-shadowdark-fleeing";
  const FLEEING_STATUS_NAME = "Fleeing";
  const FLEEING_STATUS_ICON = "icons/svg/terror.svg";

  const SETTINGS = Object.freeze({
    ENABLED: "moraleEnabled",
    VISIBILITY: "moraleVisibility",
    TOKEN_HUD: "moraleTokenHudControls",
    DEBUG: "moraleDebug"
  });

  const internalCombatUpdates = new Set();

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function setting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key) ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function enabled() {
    return game.system?.id === "shadowdark" && setting(SETTINGS.ENABLED, true);
  }

  function log(...args) {
    if (!setting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
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
    const disposition = Number(combatant.token?.disposition);
    const hostile = Number(CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1);
    return Number.isFinite(disposition) ? disposition === hostile : true;
  }

  function sameInitiative(left, right) {
    const a = Number(left?.initiative);
    const b = Number(right?.initiative);
    return Number.isFinite(a) && Number.isFinite(b) && a === b;
  }

  function turnsArray(combat) {
    if (Array.isArray(combat?.turns)) return combat.turns;
    return [];
  }

  function currentCombatant(combat) {
    const turn = Number(combat?.turn);
    if (!Number.isInteger(turn) || turn < 0) return null;
    return turnsArray(combat)[turn] ?? null;
  }

  function isEnemyTurnStart(combat) {
    if (!isStartedCombat(combat)) return false;
    const turn = Number(combat.turn);
    if (!Number.isInteger(turn) || turn < 0) return false;

    const turns = turnsArray(combat);
    const current = turns[turn];
    if (!isHostileCombatant(current)) return false;

    const previous = turn > 0 ? turns[turn - 1] : null;
    return !(isHostileCombatant(previous) && sameInitiative(previous, current));
  }

  function actorEffectValue(actor, effectKey) {
    const key = String(effectKey ?? "");
    const flagPrefix = `flags.${MODULE_ID}.`;
    const flagPath = key.startsWith(flagPrefix) ? key.slice(flagPrefix.length) : null;

    if (flagPath) {
      try {
        const value = actor?.getFlag?.(MODULE_ID, flagPath);
        if (value !== undefined) return value;
      } catch (_error) {
        // Fall through to prepared/source data.
      }
    }

    return getProperty(actor, key) ?? getProperty(actor?._source, key);
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
    if (tokenMoraleData(combatant.token).immune === true) return true;
    return actorEffectValue(combatant.actor, PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE) === true;
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
      return Math.floor((base + (Number.isFinite(bonus) ? bonus : 0) - 10) / 2);
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
    if (combatant.defeated === true || combatant.isDefeated === true) return true;

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

  function memberSnapshot(combatant) {
    const hp = getHp(combatant.actor);
    return {
      combatantId: combatant.id,
      actorId: combatant.actorId ?? combatant.actor?.id ?? null,
      tokenId: combatant.tokenId ?? combatant.token?.id ?? null,
      actorUuid: combatant.actor?.uuid ?? null,
      name: combatant.name ?? combatant.actor?.name ?? "NPC",
      maxHp: hp?.max ?? null
    };
  }

  function buildSnapshot(combat) {
    const members = combatantsArray(combat)
      .filter(isHostileCombatant)
      .map(memberSnapshot);

    const initialCount = members.length;
    return {
      version: STATE_VERSION,
      initializedAt: Date.now(),
      combatId: combat.id,
      force: {
        key: FORCE_KEY,
        name: "Enemies",
        initialCount,
        threshold: initialCount > 1 ? initialCount / 2 : null,
        checked: false,
        result: null,
        members
      }
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (Number(raw.version) !== STATE_VERSION || !raw.force) return null;
    const state = deepClone(raw);
    state.version = STATE_VERSION;
    state.force.members = Array.isArray(state.force.members) ? state.force.members : [];
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
    internalCombatUpdates.add(combat.id);
    try {
      await combat.update({ [`flags.${MODULE_ID}.${STATE_FLAG}`]: state });
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

  function livingMembers(combat, force) {
    return (force?.members ?? [])
      .map(member => getCombatant(combat, member.combatantId))
      .filter(combatant => combatant && !combatantDefeated(combatant));
  }

  function moraleEligibleMembers(combat, force) {
    return livingMembers(combat, force).filter(combatant => !isMoraleImmune(combatant));
  }

  function livingLeader(combat, force) {
    return moraleEligibleMembers(combat, force).find(isExplicitLeader) ?? null;
  }

  function moraleTrigger(combat, force) {
    if (!force || force.checked === true || force.initialCount <= 0) return null;

    if (force.initialCount === 1) {
      const member = force.members?.[0];
      const combatant = member ? getCombatant(combat, member.combatantId) : null;
      if (!combatant || combatantDefeated(combatant) || isMoraleImmune(combatant)) return null;

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

    const current = livingMembers(combat, force).length;
    const threshold = Number(force.threshold ?? (force.initialCount / 2));
    if (current > 0 && current <= threshold) {
      return {
        type: "group",
        current,
        initial: force.initialCount,
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

  async function applyFleeing(combatant) {
    const actor = combatant?.actor;
    if (!actor) return false;

    const existing = actorEffects(actor).find(effect => effectHasStatus(effect, FLEEING_STATUS_ID));
    if (existing) {
      if (existing.img !== FLEEING_STATUS_ICON && typeof existing.update === "function") {
        await existing.update({ img: FLEEING_STATUS_ICON });
      }
      return true;
    }

    try {
      if (typeof actor.toggleStatusEffect === "function") {
        await actor.toggleStatusEffect(FLEEING_STATUS_ID, { active: true });
        return true;
      }

      if (typeof actor.createEmbeddedDocuments === "function") {
        await actor.createEmbeddedDocuments("ActiveEffect", [{
          name: FLEEING_STATUS_NAME,
          img: FLEEING_STATUS_ICON,
          statuses: [FLEEING_STATUS_ID],
          disabled: false,
          changes: [],
          flags: {
            core: { statusId: FLEEING_STATUS_ID },
            [MODULE_ID]: { moraleFleeing: true }
          }
        }]);
        return true;
      }
    } catch (error) {
      warn(`Could not apply Fleeing to ${combatant.name ?? actor.name}`, error);
    }

    return false;
  }

  function registerFleeingStatus() {
    CONFIG.statusEffects ??= [];
    const existing = CONFIG.statusEffects.find(status => status.id === FLEEING_STATUS_ID);
    if (existing) {
      existing.name = FLEEING_STATUS_NAME;
      existing.img = FLEEING_STATUS_ICON;
      return;
    }

    CONFIG.statusEffects.push({
      id: FLEEING_STATUS_ID,
      name: FLEEING_STATUS_NAME,
      img: FLEEING_STATUS_ICON
    });
  }

  async function createMoraleMessage({ trigger, mode, leader = null, entries = [], rolls = [] }) {
    const failing = entries.filter(entry => !entry.success);
    const header = mode === "leader" ? "LEADER MORALE CHECK" : "INDIVIDUAL MORALE CHECKS";

    let body = "";
    if (mode === "leader") {
      const entry = entries[0];
      const consequence = entry.success
        ? "The enemy force holds its nerve."
        : "The remaining enemy force is marked Fleeing.";
      body = `
        <div>WIS ${escapeHtml(signed(entry.modifier))} vs DC ${MORALE_DC}</div>
        <div style="font-size:0.9em; opacity:0.8;">Using ${escapeHtml(leader?.name ?? leader?.actor?.name ?? "Leader")}</div>
        <div style="font-size:1.08em; margin-top:0.2rem;"><strong>${entry.success ? "✓ MORALE HOLDS" : "✘ MORALE FAILED"}</strong>: ${escapeHtml(String(entry.total))}</div>
        <div>${escapeHtml(consequence)}</div>`;
    } else {
      const rows = entries.map(entry => `
        <div style="display:grid; grid-template-columns:1fr auto; gap:0.6rem; align-items:center; padding:0.15rem 0;">
          <span>${escapeHtml(entry.name)} | WIS ${escapeHtml(signed(entry.modifier))}</span>
          <strong>${escapeHtml(String(entry.total))} ${entry.success ? "✓" : "✘ Fleeing"}</strong>
        </div>`).join("");
      body = `${rows}<div style="margin-top:0.35rem;">${failing.length} of ${entries.length} remaining enemies failed morale.</div>`;
    }

    const content = `
      <div class="mk-morale-card" data-mk-morale-force="${FORCE_KEY}">
        <header style="border-bottom:1px solid var(--color-border-light-2, #777); margin-bottom:0.45rem; padding-bottom:0.3rem;">
          <strong>☠ ${header}</strong>
        </header>
        <div style="display:grid; gap:0.25rem;">
          <div>${escapeHtml(triggerDescription(trigger))}</div>
          ${body}
        </div>
      </div>`;

    const messageData = {
      speaker: ChatMessage.getSpeaker?.({ actor: leader?.actor ?? entries[0]?.combatant?.actor }) ?? {},
      style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.ROLL ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.ROLL ?? 5,
      content,
      rolls
    };

    const whisper = whisperIds();
    if (whisper.length) messageData.whisper = whisper;
    await ChatMessage.create(messageData);
  }

  async function rollMorale(combatant) {
    const modifier = getWisMod(combatant.actor);
    const roll = await new Roll(`1d20 + ${modifier}`).evaluate();
    return {
      combatant,
      name: combatant.name ?? combatant.actor?.name ?? "NPC",
      modifier,
      roll,
      total: Number(roll.total),
      success: Number(roll.total) >= MORALE_DC
    };
  }

  async function executeMoraleCheck(combat, state, trigger) {
    const force = state.force;
    if (!force || force.checked === true) return false;

    force.checked = true;
    force.result = {
      checkedAt: Date.now(),
      round: Number(combat.round ?? 0),
      turn: Number(combat.turn ?? 0),
      trigger: deepClone(trigger),
      mode: null,
      entries: [],
      fleeingCombatantIds: []
    };
    await setState(combat, state);

    try {
      const eligible = moraleEligibleMembers(combat, force);
      if (!eligible.length) {
        force.result.mode = "none";
        await setState(combat, state);
        log("morale threshold reached; no morale-eligible survivors", force.result);
        return true;
      }

      const leader = livingLeader(combat, force);
      if (leader) {
        const entry = await rollMorale(leader);
        force.result.mode = "leader";
        force.result.entries = [{
          combatantId: entry.combatant.id,
          name: entry.name,
          modifier: entry.modifier,
          total: entry.total,
          success: entry.success
        }];

        if (!entry.success) {
          for (const combatant of eligible) {
            if (await applyFleeing(combatant)) {
              force.result.fleeingCombatantIds.push(combatant.id);
            }
          }
        }

        await createMoraleMessage({
          trigger,
          mode: "leader",
          leader,
          entries: [entry],
          rolls: [entry.roll]
        });
      } else {
        const entries = [];
        for (const combatant of eligible) {
          const entry = await rollMorale(combatant);
          entries.push(entry);
          if (!entry.success && await applyFleeing(combatant)) {
            force.result.fleeingCombatantIds.push(combatant.id);
          }
        }

        force.result.mode = "individual";
        force.result.entries = entries.map(entry => ({
          combatantId: entry.combatant.id,
          name: entry.name,
          modifier: entry.modifier,
          total: entry.total,
          success: entry.success
        }));

        await createMoraleMessage({
          trigger,
          mode: "individual",
          entries,
          rolls: entries.map(entry => entry.roll)
        });
      }

      await setState(combat, state);
      log("morale check", force.result);
      return true;
    } catch (error) {
      force.checked = false;
      force.result = null;
      await setState(combat, state);
      console.error(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} | Morale roll failed`, error);
      ui.notifications?.error("MK-Shadowdark | Could not resolve morale.");
      return false;
    }
  }

  async function evaluateCombat(combat, { requireEnemyTurnStart = true } = {}) {
    if (!enabled() || !isAuthority() || !isStartedCombat(combat)) return false;
    if (requireEnemyTurnStart && !isEnemyTurnStart(combat)) return false;

    const state = await ensureSnapshot(combat);
    if (!state?.force || state.force.checked === true) return false;

    const trigger = moraleTrigger(combat, state.force);
    if (!trigger) return false;
    return executeMoraleCheck(combat, state, trigger);
  }

  async function onCombatUpdated(combat, changes) {
    if (!enabled() || !isAuthority() || internalCombatUpdates.has(combat.id)) return;

    const turnChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "turn");
    const roundChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "round");
    const activeChanged = Object.prototype.hasOwnProperty.call(changes ?? {}, "active");
    if (!turnChanged && !roundChanged && !activeChanged) return;
    if (!isStartedCombat(combat)) return;

    await ensureSnapshot(combat);
    if (isEnemyTurnStart(combat)) {
      await evaluateCombat(combat, { requireEnemyTurnStart: true });
    }
  }

  async function resetCombat(combat = game.combat) {
    if (!combat || !isAuthority()) return false;
    await clearState(combat);
    if (isStartedCombat(combat)) {
      await ensureSnapshot(combat, { force: true });
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

  async function writeTokenMoraleData(doc, next) {
    if (!doc?.setFlag) return false;
    await doc.setFlag(MODULE_ID, TOKEN_FLAG, next);
    return true;
  }

  async function setLeader(token, leader = true) {
    if (!game.user?.isGM) return false;
    const doc = tokenDocument(token);
    if (!doc) return false;

    if (leader === true && isStartedCombat(game.combat)) {
      for (const combatant of combatantsArray(game.combat)) {
        if (!isHostileCombatant(combatant)) continue;
        const other = combatant.token;
        if (!other || other.id === doc.id) continue;
        const otherData = tokenMoraleData(other);
        if (otherData.leader === true) {
          await writeTokenMoraleData(other, { ...otherData, leader: false });
        }
      }
    }

    const current = tokenMoraleData(doc);
    await writeTokenMoraleData(doc, { ...current, leader: leader === true });
    return true;
  }

  async function setImmune(token, immune = true) {
    if (!game.user?.isGM) return false;
    const doc = tokenDocument(token);
    if (!doc) return false;
    const current = tokenMoraleData(doc);
    await writeTokenMoraleData(doc, { ...current, immune: immune === true });
    return true;
  }

  function renderTokenHud(app, html) {
    if (!enabled() || !game.user?.isGM || !setting(SETTINGS.TOKEN_HUD, true)) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelector) return;

    const right = root.querySelector(".col.right");
    if (!right || right.querySelector(".mk-morale-leader-control")) return;

    const doc = tokenDocument(app?.object);
    if (!doc || !isNpc(doc.actor)) return;
    const data = tokenMoraleData(doc);

    const leaderControl = document.createElement("div");
    leaderControl.className = `control-icon mk-morale-leader-control${data.leader === true ? " active" : ""}`;
    leaderControl.title = data.leader === true ? "Morale Leader (click to clear)" : "Mark as Morale Leader";
    leaderControl.innerHTML = '<i class="fas fa-crown"></i>';
    leaderControl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void setLeader(doc, data.leader !== true).then(() => app.render?.(false));
    });

    right.append(leaderControl);
  }

  function exposeApi() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = mod.api ?? {};
    mod.api.morale = {
      getState,
      snapshot: combat => ensureSnapshot(combat ?? game.combat, { force: false }),
      evaluate: combat => evaluateCombat(combat ?? game.combat, { requireEnemyTurnStart: false }),
      reset: combat => resetCombat(combat ?? game.combat),
      setLeader,
      setImmune,
      applyFleeing,
      isEnemyTurnStart: combat => isEnemyTurnStart(combat ?? game.combat)
    };
  }

  Hooks.once("init", registerFleeingStatus);

  Hooks.once("ready", () => {
    exposeApi();
    if (!enabled() || !isAuthority()) return;
    for (const combat of game.combats ?? []) {
      if (isStartedCombat(combat)) void ensureSnapshot(combat);
    }
  });

  Hooks.on("createCombatant", combatant => {
    log("combatant added; baseline unchanged", combatant?.name ?? combatant?.id);
  });

  Hooks.on("deleteCombatant", combatant => {
    log("combatant removed; baseline remains based on combat start", combatant?.name ?? combatant?.id);
  });

  Hooks.on("combatStart", combat => {
    if (!enabled() || !isAuthority()) return;
    void ensureSnapshot(combat, { force: true }).then(async () => {
      if (isEnemyTurnStart(combat)) {
        await evaluateCombat(combat, { requireEnemyTurnStart: true });
      }
    });
  });

  Hooks.on("updateCombat", (combat, changes) => {
    void onCombatUpdated(combat, changes);
  });

  Hooks.on("renderTokenHUD", (app, html) => renderTokenHud(app, html));
})();