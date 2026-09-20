import {
  findConfiguredStatus,
  setConfiguredStatus,
  statusLabel
} from "./death-status.js";
import { isPlayerAtZeroCon } from "./con-death.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Death Timer";
  const DEATH_TIMER_STATUS_ID = "mk-death-timer";
  const DEATH_TIMER_CHAT_ICON = "modules/mk-shadowdark/assets/icons/blood-drop-red.png";
  const MIN_DEATH_TIMER_TURNS = 1;
  const conDeathUpdates = new WeakSet();
  const damageTimerUpdateChains = new WeakMap();
  const damageContextsByActor = new WeakMap();
  const processedDamageContextsByActor = new WeakMap();
  const pendingCriticalDamageContexts = [];
  const ACTOR_DAMAGE_PATCH = Symbol("mkShadowdarkDeathTimerDamage");
  let actorDamageTrackingInstalled = false;

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function isDebugEnabled() {
    try {
      return Boolean(game.settings.get(MODULE_ID, "deathTimerDebug"));
    } catch (_error) {
      return false;
    }
  }

  function dtLog(...args) {
    if (!isDebugEnabled()) return;
    console.log(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} |`, ...args);
  }

  async function evaluateDeathTimerRoll(formula, data = {}) {
    const nativeRoll = globalThis.shadowdark?.dice?.roll;

    if (typeof nativeRoll === "function") {
      return await nativeRoll({ formula }, data);
    }

    const RollClass = globalThis.Roll;
    if (typeof RollClass !== "function") {
      throw new Error("No compatible dice roll implementation is available.");
    }

    const roll = new RollClass(formula, data);
    await roll.evaluate();
    return roll;
  }

  async function evaluateDeathCheckRoll(actor) {
    const nativeDice = globalThis.shadowdark?.dice;
    if (
      typeof nativeDice?.rollDialog !== "function" ||
      typeof nativeDice?.roll !== "function"
    ) {
      return await evaluateDeathTimerRoll("1d20");
    }

    const config = {
      type: "Death Check",
      heading: `Death Check for ${actor.name}`,
      rollMode: game.settings.get("core", "rollMode"),
      mainRoll: {
        type: "main",
        label: "Death Check",
        formula: "1d20",
        advantage: 0
      }
    };

    const prompt = await nativeDice.rollDialog(config);
    if (!prompt) return null;

    const rollData = typeof actor.getRollData === "function" ? actor.getRollData() : {};
    return await nativeDice.roll(config.mainRoll, rollData);
  }

  function getDamageContexts(actor, create = false) {
    if (!actor || (typeof actor !== "object" && typeof actor !== "function")) return null;

    let contexts = damageContextsByActor.get(actor);
    if (!contexts && create) {
      contexts = [];
      damageContextsByActor.set(actor, contexts);
    }
    return contexts;
  }

  function getProcessedDamageContexts(actor, create = false) {
    if (!actor || (typeof actor !== "object" && typeof actor !== "function")) return null;

    let contexts = processedDamageContextsByActor.get(actor);
    if (!contexts && create) {
      contexts = new Set();
      processedDamageContextsByActor.set(actor, contexts);
    }
    return contexts;
  }

  function removeDamageContext(entry) {
    if (!entry) return;

    if (entry.actor) {
      const contexts = getDamageContexts(entry.actor);
      const index = contexts?.indexOf(entry) ?? -1;
      if (index >= 0) contexts.splice(index, 1);
      if (contexts?.length === 0) damageContextsByActor.delete(entry.actor);
      return;
    }

    const index = pendingCriticalDamageContexts.indexOf(entry);
    if (index >= 0) pendingCriticalDamageContexts.splice(index, 1);
  }

  function addDamageContext(actor, context = {}) {
    const entry = {
      actor,
      critical: context.critical === true,
      sourceId: context.sourceId ?? null,
      deduplicate: context.deduplicate === true,
      dedupeKey: context.dedupeKey ?? null,
      consumed: false
    };

    if (actor) {
      getDamageContexts(actor, true).push(entry);
    }

    return entry;
  }

  function consumeDamageContext(actor) {
    const contexts = getDamageContexts(actor);
    if (contexts?.length) {
      const context = contexts.shift();
      context.consumed = true;
      if (!contexts.length) damageContextsByActor.delete(actor);
      dtLog("consumed Actor.applyDamage context:", {
        actor: actor?.name ?? actor?.id ?? "(unknown actor)",
        critical: context.critical === true,
        sourceId: context.sourceId,
        dedupeKey: context.dedupeKey
      });
      return context;
    }

    const now = Date.now();
    for (let index = pendingCriticalDamageContexts.length - 1; index >= 0; index -= 1) {
      if (pendingCriticalDamageContexts[index].expiresAt <= now) {
        pendingCriticalDamageContexts.splice(index, 1);
      }
    }

    const pendingIndex = pendingCriticalDamageContexts.findIndex(
      context => !context.actor || context.actor === actor
    );
    if (pendingIndex < 0) return null;
    const context = pendingCriticalDamageContexts.splice(pendingIndex, 1)[0];
    context.consumed = true;
    dtLog("consumed pending critical damage context:", {
      actor: actor?.name ?? actor?.id ?? "(unknown actor)",
      critical: context.critical === true,
      sourceId: context.sourceId,
      dedupeKey: context.dedupeKey
    });
    return context;
  }

  async function withDamageContext(actor, context, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("Death Timer damage context requires a callback.");
    }

    const entry = addDamageContext(actor, context);
    dtLog("queued damage context:", {
      actor: actor?.name ?? actor?.id ?? "(unknown actor)",
      critical: entry.critical,
      sourceId: entry.sourceId,
      dedupeKey: entry.dedupeKey
    });
    try {
      const result = await callback();
      if (!entry.consumed) {
        dtLog("Actor.applyDamage did not consume the context; using the fallback timer update:", {
          actor: actor?.name ?? actor?.id ?? "(unknown actor)",
          critical: entry.critical,
          sourceId: entry.sourceId,
          dedupeKey: entry.dedupeKey
        });
        await queueDeathTimerDamage(actor, entry);
      } else {
        dtLog("Actor.applyDamage consumed the context; skipping fallback timer update:", {
          actor: actor?.name ?? actor?.id ?? "(unknown actor)",
          critical: entry.critical,
          sourceId: entry.sourceId,
          dedupeKey: entry.dedupeKey
        });
      }
      return result;
    } finally {
      removeDamageContext(entry);
    }
  }

  function numOrNull(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function getDeathTimerIcon(turns) {
    const n = Number(turns) || 0;

    if (n <= 1) return "modules/mk-shadowdark/assets/icons/blood-drop-red-1.png";
    if (n === 2) return "modules/mk-shadowdark/assets/icons/blood-drop-red-2.png";
    if (n === 3) return "modules/mk-shadowdark/assets/icons/blood-drop-red-3.png";
    return "modules/mk-shadowdark/assets/icons/blood-drop-red-4.png";
  }

  function getConMod(actor) {
    const gp = foundry.utils.getProperty;

    const modCandidates = [
      gp(actor, "system.abilities.con.mod"),
      gp(actor, "system.abilities.con.modifier"),
      gp(actor, "system.abilities.con.bonus"),
      gp(actor, "system.attributes.con.mod"),
      gp(actor, "system.con.mod"),
      gp(actor, "system.conMod"),
    ].map(numOrNull).filter(v => v !== null);

    if (modCandidates.length) return modCandidates[0];

    const scoreCandidates = [
      gp(actor, "system.abilities.con.value"),
      gp(actor, "system.abilities.con.score"),
      gp(actor, "system.attributes.con.value"),
      gp(actor, "system.con.value"),
    ].map(numOrNull).filter(v => v !== null);

    if (scoreCandidates.length) {
      const score = scoreCandidates[0];
      return Math.floor((score - 10) / 2);
    }

    return 0;
  }

  function getHpPathAndValue(actor) {
    const gp = foundry.utils.getProperty;

    const candidates = [
      "system.attributes.hp.value",
      "system.attributes.hp.current",
      "system.hp.value",
      "system.hp.current",
      "system.hp",
    ];

    for (const path of candidates) {
      const v = numOrNull(gp(actor, path));
      if (v !== null) return { path, value: v };
    }

    return { path: null, value: null };
  }

  function getHpValueFromSource(source) {
    const gp = foundry.utils.getProperty;

    const candidates = [
      "system.attributes.hp.value",
      "system.attributes.hp.current",
      "system.hp.value",
      "system.hp.current",
      "system.hp",
    ];

    for (const path of candidates) {
      const v = numOrNull(gp(source, path));
      if (v !== null) return v;
    }

    return null;
  }

  async function setHp(actor, newValue) {
    const { path } = getHpPathAndValue(actor);
    if (!path) return false;
    await actor.update({ [path]: newValue });
    return true;
  }

  function ensureStylesOnce() {
    const id = "mk-death-timer-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      .mk-death-timer-chat-line {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 0.55rem;
        margin: 0.1rem 0;
      }

      .mk-death-timer-chat-icon {
        width: 34px;
        height: 34px;
        object-fit: contain;
        margin: 0;
        border: 0;
      }

      .mk-death-timer-chat-text {
        min-width: 0;
        line-height: 1.25;
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeHTML(value).replace(/"/g, "&quot;");
  }

  function renderChatIcon(src, label = "Death Timer") {
    if (!src) return "";

    const safeSrc = escapeAttribute(src);
    const safeLabel = escapeAttribute(label);
    return `<img class="mk-death-timer-chat-icon" src="${safeSrc}" alt="${safeLabel}" title="${safeLabel}">`;
  }

  function renderChatLine(src, label, content) {
    return `
      <div class="mk-death-timer-chat-line">
        ${renderChatIcon(src, label)}
        <div class="mk-death-timer-chat-text">${content}</div>
      </div>
    `;
  }

  function getBuiltInDeadStatus() {
    return findConfiguredStatus(CONFIG.statusEffects ?? [], "dead");
  }

  function getBuiltInDeadStatusId() {
    return getBuiltInDeadStatus()?.id ?? "dead";
  }

  function getBuiltInDeadStatusLabel() {
    return statusLabel(getBuiltInDeadStatus(), "Dead");
  }

  function getBuiltInDeadStatusIcon() {
    const status = getBuiltInDeadStatus();
    return status?.img ?? status?.icon ?? "icons/svg/skull.svg";
  }

  function refreshActorTokenEffects(actor) {
    window.setTimeout(() => {
      try {
        const tokens = actor?.getActiveTokens?.(true, true) ?? actor?.getActiveTokens?.() ?? [];

        for (const token of tokens) {
          if (typeof token.drawEffects === "function") {
            Promise.resolve(token.drawEffects()).catch(err => {
              console.warn(`${MODULE_ID} | ${SUBMODULE} token effect redraw error`, err);
            });
          } else if (typeof token.refresh === "function") {
            token.refresh();
          }
        }
      } catch (err) {
        console.warn(`${MODULE_ID} | ${SUBMODULE} token effect refresh error`, err);
      }
    }, 50);
  }

  function effectHasStatus(effect, statusId) {
    if (!effect) return false;
    if (effect.statuses?.has?.(statusId)) return true;
    if (Array.isArray(effect.statuses) && effect.statuses.includes(statusId)) return true;
    if (effect.getFlag?.("core", "statusId") === statusId) return true;
    if (effect.flags?.core?.statusId === statusId) return true;
    return false;
  }

  function findDeathTimerEffect(actor) {
    return actor.effects.find(e => e.getFlag(MODULE_ID, "isDeathTimer") === true)
      || actor.effects.find(e => effectHasStatus(e, DEATH_TIMER_STATUS_ID))
      || actor.effects.find(e => typeof e.name === "string" && e.name.startsWith("Death Timer ("));
  }

  function findDeadEffect(actor) {
    const statusId = getBuiltInDeadStatusId();
    const label = getBuiltInDeadStatusLabel().toUpperCase();

    return actor.effects.find(e => effectHasStatus(e, statusId))
      || actor.effects.find(e => e.getFlag(MODULE_ID, "isDeadCondition") === true)
      || actor.effects.find(e => typeof e.name === "string" && e.name.toUpperCase() === label)
      || actor.effects.find(e => typeof e.name === "string" && e.name.toUpperCase() === "DEAD");
  }

  function getDeathTimerTurns(actor) {
    const flagged = actor.getFlag(MODULE_ID, "deathTimer");
    if (flagged?.turns !== undefined && flagged?.turns !== null) return Number(flagged.turns);

    const eff = findDeathTimerEffect(actor);
    const t = eff?.getFlag(MODULE_ID, "turns");
    if (t !== undefined && t !== null) return Number(t);

    if (eff?.name) {
      const m = eff.name.match(/Death Timer\s*\((\d+)\)/i);
      if (m) return Number(m[1]);
    }

    return null;
  }

  async function upsertDeathTimerEffect(actor, turns) {
    const name = `Death Timer (${turns})`;
    const icon = getDeathTimerIcon(turns);

    const data = {
      name,
      img: icon,
      statuses: [DEATH_TIMER_STATUS_ID],
      disabled: false,
      changes: [],
      flags: {
        [MODULE_ID]: {
          isDeathTimer: true,
          turns
        },
        core: {
          statusId: DEATH_TIMER_STATUS_ID
        }
      }
    };

    const existing = findDeathTimerEffect(actor);
    if (existing) {
      await existing.update(data);
    } else {
      await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    }

    refreshActorTokenEffects(actor);
  }

  async function removeDeathTimerEffect(actor) {
    const effects = actor.effects.filter(e =>
      e.getFlag(MODULE_ID, "isDeathTimer") === true ||
      effectHasStatus(e, DEATH_TIMER_STATUS_ID) ||
      (typeof e.name === "string" && e.name.startsWith("Death Timer ("))
    );
    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
    refreshActorTokenEffects(actor);
  }

  async function upsertDeadEffect(actor) {
    const status = getBuiltInDeadStatus();
    if (!status?.id) {
      throw new Error("Foundry Dead status is not configured.");
    }

    await setConfiguredStatus(actor, CONFIG.statusEffects ?? [], status.id, true);
    refreshActorTokenEffects(actor);
  }

  async function removeDeadEffect(actor) {
    const status = getBuiltInDeadStatus();
    if (status?.id) {
      await setConfiguredStatus(actor, CONFIG.statusEffects ?? [], status.id, false);
    }

    // Clean up only MK-Shadowdark's legacy hand-built Dead effects if any
    // remain after the built-in status API has run.
    const legacyEffects = actor.effects.filter(
      effect => effect.getFlag(MODULE_ID, "isDeadCondition") === true
    );
    if (legacyEffects.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", legacyEffects.map(effect => effect.id));
    }

    refreshActorTokenEffects(actor);
  }

  async function clearAllDeathState(actor) {
    if (actor.isOwner) {
      await removeDeathTimerEffect(actor);
      if (!isPlayerAtZeroCon(actor)) await removeDeadEffect(actor);
      await actor.unsetFlag(MODULE_ID, "deathTimer");
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

  function isDeathAutomationAuthority(actor) {
    const activeGM = getPrimaryActiveGM();
    if (activeGM) return game.user?.id === activeGM.id;
    const activeOwner = getActiveOwners(actor)[0];
    return activeOwner ? game.user?.id === activeOwner.id : game.user?.isGM === true;
  }

  async function setDeathTimerFlag(actor, turns, conMod = null) {
    if (!actor.isOwner) return;
    await actor.setFlag(MODULE_ID, "deathTimer", {
      turns,
      conMod,
      updatedAt: Date.now()
    });
  }

  async function clearDeathTimerFlag(actor) {
    if (!actor.isOwner) return;
    await actor.unsetFlag(MODULE_ID, "deathTimer");
  }

  async function startDeathTimer(actor) {
    const conMod = getConMod(actor);

    const timerRoll = await evaluateDeathTimerRoll("1d4 + @con", { con: conMod });

    const turns = Math.max(MIN_DEATH_TIMER_TURNS, timerRoll.total ?? MIN_DEATH_TIMER_TURNS);

    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const sign = conMod >= 0 ? "+" : "-";
    const abs = Math.abs(conMod);

    await timerRoll.toMessage(
      {
        speaker,
        flavor: renderChatLine(
          DEATH_TIMER_CHAT_ICON,
          `Death Timer (${turns})`,
          `<b>${actor.name}</b> - Death Timer started: <b>${turns}</b> turn(s). <span style="opacity:0.85">(1d4 ${sign} ${abs}, minimum ${MIN_DEATH_TIMER_TURNS})</span>`
        )
      },
      { rollMode }
    );

    if (actor.isOwner) {
      await removeDeadEffect(actor);
      await upsertDeathTimerEffect(actor, turns);
      await setDeathTimerFlag(actor, turns, conMod);
    }

    return turns;
  }

  async function markDead(actor, speaker, rollMode, { announce = true } = {}) {
    if (actor.isOwner) {
      await removeDeathTimerEffect(actor);
      await clearDeathTimerFlag(actor);
      await upsertDeadEffect(actor);
    }

    if (!announce) return;

    await ChatMessage.create({
      speaker,
      content: renderChatLine(
        getBuiltInDeadStatusIcon(),
        "Dead",
        `<b>${actor.name}</b> is now <b>Dead</b>.`
      ),
      whisper: rollMode === "gmroll" ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined
    });
  }

  async function reduceDeathTimerOnDamage(actor, {
    critical = false,
    deduplicate = false,
    dedupeKey = null
  } = {}) {
    const actorLabel = actor?.name ?? actor?.id ?? "(unknown actor)";

    if (game.system?.id !== "shadowdark") {
      dtLog("damage ignored: unsupported game system", { actor: actorLabel, system: game.system?.id });
      return false;
    }

    if (!actor?.isOwner) {
      dtLog("damage ignored: current user is not the actor owner", { actor: actorLabel });
      return false;
    }

    if (!isDeathAutomationAuthority(actor)) {
      dtLog("damage ignored: current user is not Death Timer authority", {
        actor: actorLabel,
        user: game.user?.id,
        primaryGM: getPrimaryActiveGM()?.id ?? null
      });
      return false;
    }

    const currentTurns = getDeathTimerTurns(actor);
    if (!Number.isFinite(currentTurns)) {
      dtLog("damage ignored: actor has no active Death Timer", { actor: actorLabel });
      return false;
    }

    if (deduplicate && dedupeKey && getProcessedDamageContexts(actor)?.has(dedupeKey)) {
      dtLog("damage ignored: this Auto Damage source was already applied to the Death Timer", {
        actor: actorLabel,
        dedupeKey
      });
      return false;
    }

    const delta = critical ? 2 : 1;
    const nextTurns = Math.max(0, currentTurns - delta);
    dtLog("reducing Death Timer after damage:", {
      actor: actorLabel,
      currentTurns,
      delta,
      nextTurns,
      critical: critical === true,
      dedupeKey: deduplicate ? dedupeKey : null
    });
    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    if (nextTurns <= 0) {
      dtLog("Death Timer reached zero; applying Dead without a duplicate status message:", {
        actor: actorLabel
      });
      await markDead(actor, speaker, rollMode, { announce: false });
    } else if (actor.isOwner) {
      await upsertDeathTimerEffect(actor, nextTurns);
      await setDeathTimerFlag(actor, nextTurns);
    }

    const name = escapeHTML(actor.name);
    const hitText = critical ? "took a <b>critical hit</b>" : "took damage";
    const resultText = nextTurns <= 0
      ? "The character is now <b>Dead</b>."
      : `Death Timer is now <b>${nextTurns}</b> turn(s).`;

    await ChatMessage.create({
      speaker,
      content: renderChatLine(
        DEATH_TIMER_CHAT_ICON,
        `Death Timer (${nextTurns})`,
        `<b>${name}</b> ${hitText}. Death Timer reduced by <b>${delta}</b> ` +
        `(from <b>${currentTurns}</b> to <b>${nextTurns}</b> turn(s)). ${resultText}`
      ),
      whisper: rollMode === "gmroll" ? ChatMessage.getWhisperRecipients("GM").map(u => u.id) : undefined
    });

    dtLog("posted Death Timer damage result:", {
      actor: actorLabel,
      currentTurns,
      nextTurns,
      delta,
      critical: critical === true
    });

    if (deduplicate && dedupeKey) getProcessedDamageContexts(actor, true).add(dedupeKey);

    return { currentTurns, nextTurns, delta, critical };
  }

  function queueDeathTimerDamage(actor, context = {}) {
    if (!actor || (typeof actor !== "object" && typeof actor !== "function")) return Promise.resolve(false);

    dtLog("queued Death Timer damage update:", {
      actor: actor?.name ?? actor?.id ?? "(unknown actor)",
      critical: context.critical === true,
      sourceId: context.sourceId ?? null,
      dedupeKey: context.dedupeKey ?? null
    });
    const previous = damageTimerUpdateChains.get(actor) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => reduceDeathTimerOnDamage(actor, context));
    let tracked;
    tracked = next.finally(() => {
      if (damageTimerUpdateChains.get(actor) === tracked) damageTimerUpdateChains.delete(actor);
    });
    damageTimerUpdateChains.set(actor, tracked);
    return tracked;
  }

  function recordDamage(actor, context = {}) {
    dtLog("recording already-applied damage for Death Timer:", {
      actor: actor?.name ?? actor?.id ?? "(unknown actor)",
      critical: context.critical === true,
      sourceId: context.sourceId ?? null,
      dedupeKey: context.dedupeKey ?? null
    });
    return queueDeathTimerDamage(actor, context);
  }

  function damageAmountFromApplyDamage(damageAmount, multiplier) {
    const parsedAmount = Number.parseInt(damageAmount, 10);
    const parsedMultiplier = Number(multiplier ?? 1);
    if (!Number.isFinite(parsedAmount) || !Number.isFinite(parsedMultiplier)) return null;
    return Math.floor(parsedAmount * parsedMultiplier);
  }

  function installActorDamageTracking() {
    if (actorDamageTrackingInstalled) {
      dtLog("Actor.applyDamage tracking already installed.");
      return true;
    }

    const ActorClass = CONFIG?.Actor?.documentClass ?? globalThis.Actor;
    const prototype = ActorClass?.prototype;
    if (!prototype || typeof prototype.applyDamage !== "function") {
      dtLog("Actor.applyDamage tracking unavailable:", {
        actorClass: ActorClass?.name ?? null,
        hasPrototype: Boolean(prototype),
        hasApplyDamage: typeof prototype?.applyDamage === "function"
      });
      return false;
    }
    if (prototype.applyDamage[ACTOR_DAMAGE_PATCH]) {
      actorDamageTrackingInstalled = true;
      dtLog("Actor.applyDamage tracking was already patched by another Death Timer initialization.");
      return true;
    }

    const originalApplyDamage = prototype.applyDamage;
    const wrappedApplyDamage = async function(damageAmount, multiplier = 1) {
      const appliedAmount = damageAmountFromApplyDamage(damageAmount, multiplier);
      const takesDamage = appliedAmount !== null && appliedAmount > 0;
      const context = takesDamage ? consumeDamageContext(this) : null;
      dtLog("Actor.applyDamage intercepted:", {
        actor: this?.name ?? this?.id ?? "(unknown actor)",
        requestedAmount: damageAmount,
        multiplier,
        appliedAmount,
        takesDamage,
        critical: context?.critical === true,
        sourceId: context?.sourceId ?? null,
        dedupeKey: context?.dedupeKey ?? null
      });
      const result = await originalApplyDamage.call(this, damageAmount, multiplier);

      if (takesDamage) {
        try {
          await queueDeathTimerDamage(this, context ?? {});
        } catch (err) {
          console.error(`${MODULE_ID} | ${SUBMODULE} damage timer update error`, err);
        }
      }

      return result;
    };

    Object.defineProperty(wrappedApplyDamage, ACTOR_DAMAGE_PATCH, { value: true });
    prototype.applyDamage = wrappedApplyDamage;
    actorDamageTrackingInstalled = true;
    dtLog("installed Actor.applyDamage tracking:", { actorClass: ActorClass.name ?? "Actor" });
    return true;
  }

  function getShadowdarkMessageRoll(message, type) {
    try {
      const roll = message?.getRoll?.(type);
      if (roll) return roll;
    } catch (_err) {
      // Fall through to the persisted roll collection.
    }

    return Array.from(message?.rolls ?? [])
      .find(roll => roll?.options?.type === type) ?? null;
  }

  function getShadowdarkMessageRollConfig(message) {
    try {
      const flagged = message?.getFlag?.("shadowdark", "rollConfig");
      if (flagged && typeof flagged === "object") return flagged;
    } catch (_err) {
      // Fall through to the message source.
    }

    return message?.rollConfig
      ?? message?.flags?.shadowdark?.rollConfig
      ?? message?._source?.flags?.shadowdark?.rollConfig
      ?? null;
  }

  function getChatDamageActor(message, button) {
    const config = getShadowdarkMessageRollConfig(message);
    if (button?.dataset?.target === "target") {
      const target = globalThis.fromUuidSync?.(config?.targetUuid);
      return target?.actor
        ?? (target?.documentName === "Actor" ? target : null);
    }

    const controlled = globalThis.canvas?.tokens?.controlled;
    return controlled?.[0]?.actor ?? controlled?.first?.()?.actor ?? null;
  }

  function queueCriticalDamageContext(actor, context = {}) {
    const entry = addDamageContext(actor, context);
    entry.expiresAt = Date.now() + 5000;
    dtLog("queued critical damage context from native Shadowdark chat:", {
      actor: actor?.name ?? actor?.id ?? "(actor resolved on apply)",
      sourceId: entry.sourceId
    });
    if (!actor) pendingCriticalDamageContexts.push(entry);

    const timeout = globalThis.setTimeout?.(() => removeDamageContext(entry), 5000);
    timeout?.unref?.();
  }

  async function enforceZeroConDeath(actor) {
    if (
      game.system?.id !== "shadowdark"
      || !isDeathAutomationAuthority(actor)
      || !isPlayerAtZeroCon(actor)
      || findDeadEffect(actor)
      || conDeathUpdates.has(actor)
    ) return false;

    conDeathUpdates.add(actor);
    try {
      await markDead(
        actor,
        ChatMessage.getSpeaker({ actor }),
        game.settings.get("core", "rollMode")
      );
      dtLog("CON reached 0 - marked Dead:", actor.name);
      return true;
    } finally {
      conDeathUpdates.delete(actor);
    }
  }

  async function tickDeathTimer(actor, currentTurns) {
    const speaker = ChatMessage.getSpeaker({ actor });
    const rollMode = game.settings.get("core", "rollMode");

    const d20 = await evaluateDeathCheckRoll(actor);
    if (!d20) {
      dtLog("Death Check prompt was cancelled:", actor.name);
      return { done: false, cancelled: true, turns: currentTurns };
    }

    const roll = d20.total ?? 0;

    if (roll === 20) {
      const ok = await setHp(actor, 1);

      await d20.toMessage(
        {
          speaker,
          flavor: renderChatLine(
            DEATH_TIMER_CHAT_ICON,
            `Death Timer (${currentTurns})`,
            `<b>${actor.name}</b> - Death Check: <b>20</b>. <span style="opacity:0.9">You revive and gain <b>1 HP</b>${ok ? "" : " (HP field not found)"}. Death Timer removed.</span>`
          )
        },
        { rollMode }
      );

      await clearAllDeathState(actor);

      return { done: true, turns: null };
    }

    const delta = (roll === 1) ? 2 : 1;
    const nextTurns = Math.max(0, (Number(currentTurns) || 0) - delta);

    await d20.toMessage(
      {
        speaker,
        flavor: renderChatLine(
          DEATH_TIMER_CHAT_ICON,
          `Death Timer (${currentTurns})`,
          `<b>${actor.name}</b> - Death Check: <b>${roll}</b>. <span style="opacity:0.9">Timer reduced by <b>${delta}</b> - now <b>${nextTurns}</b> turn(s).</span>`
        )
      },
      { rollMode }
    );

    if (nextTurns <= 0) {
      await markDead(actor, speaker, rollMode);
      return { done: true, turns: 0 };
    }

    if (actor.isOwner) {
      await upsertDeathTimerEffect(actor, nextTurns);
      await setDeathTimerFlag(actor, nextTurns);
    }

    return { done: false, turns: nextTurns };
  }

  Hooks.once("init", () => {
    installActorDamageTracking();
    dtLog("init (settings registered in settings.js)");
  });

  Hooks.once("ready", async () => {
    installActorDamageTracking();
    ensureStylesOnce();
    dtLog("ready | system:", game.system?.id, "| built-in DEAD:", getBuiltInDeadStatus());
    for (const actor of game.actors ?? []) {
      try {
        await enforceZeroConDeath(actor);
      } catch (err) {
        console.error(`${MODULE_ID} | ${SUBMODULE} ready CON-death error`, actor?.name, err);
      }
    }
  });

  async function onSkullClick(actor) {
    const hpInfo = getHpPathAndValue(actor);
    const hpValue = hpInfo.value ?? null;

    if (findDeadEffect(actor)) {
      ui?.notifications?.warn?.("This actor is already Dead.");
      return;
    }

    if (hpValue === null || hpValue > 0) {
      ui?.notifications?.warn?.("Death Timer can be used only at 0 HP.");
      return;
    }

    const existingTurns = getDeathTimerTurns(actor);

    if (existingTurns === null || Number.isNaN(existingTurns)) {
      await startDeathTimer(actor);
      return;
    }

    await tickDeathTimer(actor, existingTurns);
  }

  Hooks.on("preUpdateActor", (actor, change, options) => {
    if (game.system?.id !== "shadowdark") return;
    options._mkPrevHp = getHpPathAndValue(actor).value;
  });

  Hooks.on("updateActor", async (actor, change, options) => {
    try {
      if (game.system?.id !== "shadowdark") return;

      await enforceZeroConDeath(actor);

      const hasDeathState =
        !!findDeathTimerEffect(actor) ||
        !!findDeadEffect(actor) ||
        !!actor.getFlag(MODULE_ID, "deathTimer");

      if (!hasDeathState) return;

      const prevHp = numOrNull(options?._mkPrevHp);
      const newHp = getHpPathAndValue(actor).value;
      const changedHp = getHpValueFromSource(change);

      const healed =
        prevHp !== null &&
        newHp !== null &&
        newHp > prevHp;

      const explicitPositiveHpSet =
        changedHp !== null &&
        changedHp > 0;

      if (healed || explicitPositiveHpSet) {
        await clearAllDeathState(actor);
        if (isPlayerAtZeroCon(actor)) {
          dtLog("HP gained - removed Death Timer but preserved Dead at 0 CON for", actor.name);
        } else {
          dtLog("HP gained - removed Death Timer / Dead from", actor.name);
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} updateActor cleanup error`, err);
    }
  });

  for (const hookName of ["createActiveEffect", "updateActiveEffect"]) {
    Hooks.on(hookName, async effect => {
      const actor = effect?.parent;
      if (actor?.documentName !== "Actor") return;
      try {
        await enforceZeroConDeath(actor);
      } catch (err) {
        console.error(`${MODULE_ID} | ${SUBMODULE} ${hookName} CON-death error`, actor?.name, err);
      }
    });
  }

  Hooks.on("renderChatMessage", (message, html) => {
    try {
      const mainRoll = getShadowdarkMessageRoll(message, "main");
      if (mainRoll?.criticalSuccess !== true) return;

      const rollConfig = getShadowdarkMessageRollConfig(message);
      if (rollConfig?.cast?.damageType === "healing") return;

      dtLog("found critical Shadowdark damage chat message:", { messageId: message?.id ?? null });

      html?.querySelectorAll?.('[data-action="apply-damage"]')?.forEach(button => {
        button.addEventListener("click", () => {
          queueCriticalDamageContext(
            getChatDamageActor(message, button),
            { critical: true, sourceId: message?.id ?? null }
          );
        }, { capture: true });
      });
    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} critical damage listener error`, err);
    }
  });

  const deathTimerApi = Object.freeze({
    activate: onSkullClick,
    getState: actor => ({
      dead: Boolean(findDeadEffect(actor)),
      turns: getDeathTimerTurns(actor)
    }),
    getTurns: getDeathTimerTurns,
    withDamageContext,
    recordDamage
  });

  globalThis.MKShadowdarkDeathTimer = deathTimerApi;

  const moduleRecord = globalThis.game?.modules?.get?.(MODULE_ID);
  if (moduleRecord) {
    moduleRecord.api = moduleRecord.api ?? {};
    moduleRecord.api.deathTimer = deathTimerApi;
  }
})();
