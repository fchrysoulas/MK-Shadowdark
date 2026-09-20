import {
  resolveTargetDocuments,
  snapshotTargetUuids,
  storedTargetUuids
} from "./auto-damage-targets.js";
import {
  broadcastTokenShake,
  installTokenShakeSocket
} from "./token-shake.js";
import {
  calculateHpChange,
  extractNativeDamage,
  hasShadowdarkDamageApplied,
  resolveAutoDamageOperation
} from "./auto-damage-operation.js";
import {
  createProcessingState,
  hasLegacyProcessed,
  isTerminalProcessingState,
  readProcessingState,
  runProcessingState
} from "./auto-damage-processing-state.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Auto Damage";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function isDebugEnabled() {
    try {
      return Boolean(game.settings.get(MODULE_ID, "autoDamageDebug"));
    } catch (_error) {
      return false;
    }
  }

  function adLog(...args) {
    if (!isDebugEnabled()) return;
    console.log(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} |`, ...args);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getPrimaryActiveGM() {
    return game.users
      .filter(user => user.active && user.isGM)
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  }

  function isPrimaryActiveGM() {
    return game.user?.id === getPrimaryActiveGM()?.id;
  }

  function getMessageAuthor(message) {
    return message?.author ?? game.users.get(message?._source?.user) ?? null;
  }

  function hasAutoDamageProcessed(message) {
    if (hasLegacyProcessed(message, MODULE_ID)) return true;
    if (hasShadowdarkDamageApplied(message)) return true;
    return isTerminalProcessingState(readProcessingState(message, MODULE_ID));
  }

  const AUTO_DAMAGE_LOCK_CLASS = "mk-auto-damage-locked";

  function isAutoDamageEnabled() {
    try {
      return game.settings.get(MODULE_ID, "autoDamageEnabled") === true;
    } catch (_error) {
      return false;
    }
  }

  function shouldLockNativeApplyControls(message) {
    if (!isAutoDamageEnabled()) return false;
    if (hasLegacyProcessed(message)) return true;

    const state = readProcessingState(message, MODULE_ID);
    return state?.status === "pending" || state?.status === "complete";
  }

  function renderRoot(html) {
    return html?.[0] ?? html;
  }

  function syncNativeApplyControls(message, html) {
    const root = renderRoot(html);
    if (!root?.querySelectorAll) return;

    const locked = shouldLockNativeApplyControls(message);
    for (const button of root.querySelectorAll('[data-action="apply-damage"], .apply-damage')) {
      if (!locked) {
        button.classList.remove(AUTO_DAMAGE_LOCK_CLASS);
        button.removeAttribute("aria-disabled");
        button.removeAttribute("disabled");
        if ("disabled" in button) button.disabled = false;
        if (button.dataset.mkAutoDamageOriginalTooltip !== undefined) {
          const originalTooltip = button.dataset.mkAutoDamageOriginalTooltip;
          if (originalTooltip) button.dataset.tooltip = originalTooltip;
          else button.removeAttribute("data-tooltip");
          delete button.dataset.mkAutoDamageOriginalTooltip;
        }
        if (button.dataset.mkAutoDamageOriginalTitle !== undefined) {
          const originalTitle = button.dataset.mkAutoDamageOriginalTitle;
          if (originalTitle) button.title = originalTitle;
          else button.removeAttribute("title");
          delete button.dataset.mkAutoDamageOriginalTitle;
        }
        if (button.dataset.mkAutoDamageOriginalTabIndex !== undefined) {
          const originalTabIndex = button.dataset.mkAutoDamageOriginalTabIndex;
          if (originalTabIndex) button.setAttribute("tabindex", originalTabIndex);
          else button.removeAttribute("tabindex");
          delete button.dataset.mkAutoDamageOriginalTabIndex;
        }
        delete button.dataset.mkAutoDamageLocked;
        continue;
      }

      if (button.dataset.mkAutoDamageOriginalTooltip === undefined) {
        button.dataset.mkAutoDamageOriginalTooltip = button.dataset.tooltip ?? "";
      }
      if (button.dataset.mkAutoDamageOriginalTitle === undefined) {
        button.dataset.mkAutoDamageOriginalTitle = button.getAttribute("title") ?? "";
      }
      if (button.dataset.mkAutoDamageOriginalTabIndex === undefined) {
        button.dataset.mkAutoDamageOriginalTabIndex = button.getAttribute("tabindex") ?? "";
      }

      button.classList.add(AUTO_DAMAGE_LOCK_CLASS);
      button.dataset.mkAutoDamageLocked = "true";
      button.setAttribute("aria-disabled", "true");
      button.dataset.tooltip = "Auto Damage has already handled this roll.";
      button.title = "Auto Damage has already handled this roll.";
      button.setAttribute("tabindex", "-1");
      if ("disabled" in button) button.disabled = true;

      if (button.dataset.mkAutoDamageGuard === "true") continue;
      button.dataset.mkAutoDamageGuard = "true";
      button.addEventListener("click", event => {
        if (button.dataset.mkAutoDamageLocked !== "true") return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true });
    }
  }

  const PROCESSING_MESSAGES = new Set();
  const TARGET_SNAPSHOTS = new WeakMap();

  function getTargetSnapshot(message) {
    const persisted = storedTargetUuids(message, MODULE_ID);
    if (persisted !== null) return persisted;

    if (TARGET_SNAPSHOTS.has(message)) {
      return TARGET_SNAPSHOTS.get(message);
    }

    const snapshot = snapshotTargetUuids(message, getMessageAuthor(message));
    TARGET_SNAPSHOTS.set(message, snapshot);
    return snapshot;
  }

  async function persistTargetSnapshot(message, targetUuids) {
    if (storedTargetUuids(message, MODULE_ID) !== null) return;

    try {
      await message.setFlag(MODULE_ID, "autoDamageTargetUuids", Array.from(targetUuids ?? []));
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not persist target snapshot on message ${message.id}`,
        err
      );
    }
  }

  async function persistProcessingState(message, state) {
    await message.setFlag(MODULE_ID, "autoDamageProcessing", state);
  }

  function scrollChatToBottom(delay = 75) {
    try {
      setTimeout(() => {
        try {
          const chat = ui?.chat;
          if (!chat) return;

          if (typeof chat.scrollBottom === "function") {
            chat.scrollBottom();
          } else if (chat.element?.length) {
            const el = chat.element[0];
            el.scrollTop = el.scrollHeight;
          }
        } catch (err) {
          console.error(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error scrolling chat`,
            err
          );
        }
      }, delay);
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error scheduling chat scroll`,
        err
      );
    }
  }

  async function shakeToken(token, options = {}) {
    try {
      await broadcastTokenShake(token, options);
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error shaking token`,
        err
      );
    }
  }

  function resolveHpField(actor) {
    const paths = [
      ["system.attributes.hp.value", "system.attributes.hp.max"],
      ["system.attributes.hp.hp", "system.attributes.hp.max"],
      ["system.attributes.hp", null],
      ["system.hp.value", "system.hp.max"],
      ["system.hp.current", "system.hp.max"],
      ["system.hp", null]
    ];

    for (const [path, maxPath] of paths) {
      let value = foundry.utils.getProperty(actor, path);
      if (typeof value === "string") {
        const num = Number(value);
        if (!Number.isNaN(num)) value = num;
      }

      if (typeof value === "number") {
        let max = maxPath ? foundry.utils.getProperty(actor, maxPath) : null;
        if (typeof max === "string") max = Number(max);
        return {
          path,
          value,
          max: Number.isFinite(max) ? max : null
        };
      }
    }

    return null;
  }

  async function buildProcessingPlan(message, amount, operation, sourceContext = {}, targetUuids = [], display = null) {
    const damageTraitsApi = game.modules.get(MODULE_ID)?.api?.damageTraits;
    const sourceProperties = Array.from(sourceContext?.properties ?? []);
    const targets = [];

    for (const uuid of targetUuids) {
      const [token] = await resolveTargetDocuments([uuid]);
      const actor = token?.actor ?? token?.document?.actor;
      const tokenId = token?.id ?? token?.document?.id ?? "unknown";

      if (!token || !actor) {
        targets.push({
          uuid,
          state: "conflict",
          conflictReason: "target-unavailable",
          operation,
          amount
        });
        continue;
      }

      const hpInfo = resolveHpField(actor);
      if (!hpInfo) {
        adLog(
          `Token ${tokenId} (${actor.name}): could not resolve numeric HP field; system.hp =`,
          actor.system?.hp
        );
        targets.push({
          uuid,
          state: "conflict",
          conflictReason: "hp-unavailable",
          actorName: actor.name,
          tokenId,
          operation,
          amount
        });
        continue;
      }

      let reduction = 0;
      let damageIncrease = 0;
      let traitMode = null;
      let reducedDamage = null;
      let reductionProperties = [];
      if (operation === "damage" && typeof damageTraitsApi?.resolveReduction === "function") {
        try {
          const resolved = await damageTraitsApi.resolveReduction(actor, sourceProperties, amount, sourceContext);
          reduction = Math.max(0, Number(resolved?.reduction) || 0);
          damageIncrease = Math.max(0, Number(resolved?.increase) || 0);
          traitMode = resolved?.mode ?? null;
          reducedDamage = Number.isFinite(Number(resolved?.appliedDamage))
            ? Math.max(0, Number(resolved.appliedDamage))
            : null;
          reductionProperties = Array.from(resolved?.propertyNames ?? []);
        } catch (error) {
          console.error(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not resolve damage traits for ${actor.name}`,
            error
          );
        }
      }

      const { path: hpPath, value: currentHP, max: maxHP } = hpInfo;
      const adjustedAmount = operation === "damage"
        ? reducedDamage ?? Math.max(0, amount - reduction)
        : amount;
      const effectiveAmount = Math.max(0, Math.floor(Number(adjustedAmount) || 0));
      const { newHP, appliedAmount } = calculateHpChange(
        currentHP,
        maxHP,
        effectiveAmount,
        operation
      );

      targets.push({
        uuid,
        state: "planned",
        hpPath,
        beforeHp: currentHP,
        afterHp: newHP,
        appliedAmount,
        operation,
        actorName: actor.name,
        tokenId,
        amount,
        effectiveAmount,
        reduction,
        damageIncrease,
        traitMode,
        propertyNames: reductionProperties
      });
    }

    return createProcessingState({ operation, amount, display, targets });
  }

  async function resolvePlannedTarget(target) {
    const [token] = await resolveTargetDocuments([target.uuid]);
    const actor = token?.actor ?? token?.document?.actor;
    if (!token || !actor) throw new Error(`Target ${target.uuid} is unavailable.`);
    return { token, actor };
  }

  async function readPlannedHp(target) {
    const { actor } = await resolvePlannedTarget(target);
    let value = foundry.utils.getProperty(actor, target.hpPath);
    if (typeof value === "string") value = Number(value);
    if (!Number.isFinite(value)) throw new Error(`Target ${target.uuid} no longer has numeric HP.`);
    return value;
  }

  async function waitForPlannedHp(actor, target, attempts = 40, delayMs = 25) {
    // Shadowdark's Actor.applyDamage starts Actor.update without awaiting it.
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let value = foundry.utils.getProperty(actor, target.hpPath);
      if (typeof value === "string") value = Number(value);
      if (value === target.afterHp) return true;
      await sleep(delayMs);
    }
    return false;
  }

  function getDeathTimerApi() {
    return game.modules.get(MODULE_ID)?.api?.deathTimer
      ?? globalThis.MKShadowdarkDeathTimer;
  }

  function getDeathTimerDamageContext(message, target, critical) {
    return {
      critical,
      sourceId: message.id,
      deduplicate: true,
      dedupeKey: `${message.id}:${target.uuid}`
    };
  }

  async function recoverPromotedDeathTimerDamage(message, target, critical) {
    if (target.operation !== "damage" || target.effectiveAmount <= 0) return;

    const { actor } = await resolvePlannedTarget(target);
    const deathTimerApi = getDeathTimerApi();
    if (typeof deathTimerApi?.recordDamage !== "function") {
      adLog(`Message ${message.id}: Death Timer recovery API unavailable for promoted target ${target.uuid}.`);
      return;
    }

    adLog(`Message ${message.id}: recovering Death Timer damage for promoted target ${target.uuid}.`);
    await deathTimerApi.recordDamage(actor, getDeathTimerDamageContext(message, target, critical));
  }

  async function applyPlannedTarget(target, damageContext = {}) {
    const { token, actor } = await resolvePlannedTarget(target);

    adLog(
      `Token ${target.tokenId} (${target.actorName}): HP via "${target.hpPath}" ${target.beforeHp} -> ${target.afterHp} ` +
      (target.operation === "healing"
        ? `(healing ${target.amount}, native ${target.effectiveAmount}, applied ${target.appliedAmount})`
        : `(damage ${target.amount}, native ${target.effectiveAmount}, trait ${target.traitMode ?? "none"}, applied ${target.appliedAmount})`)
    );

    if (target.effectiveAmount > 0) {
      if (typeof actor.applyDamage !== "function") {
        throw new Error(`Target ${target.uuid} does not expose Shadowdark applyDamage.`);
      }

      const nativeAmount = target.operation === "healing"
        ? -target.effectiveAmount
        : target.effectiveAmount;
      const applyDamage = () => actor.applyDamage(nativeAmount);

      if (target.operation === "damage") {
        const deathTimerApi = getDeathTimerApi();
        if (typeof deathTimerApi?.withDamageContext === "function") {
          await deathTimerApi.withDamageContext(actor, damageContext, applyDamage);
        } else {
          adLog(
            `Death Timer API unavailable while applying damage to ${target.uuid} ` +
            `(source ${damageContext.sourceId ?? "unknown"}).`
          );
          await applyDamage();
        }
      } else {
        await applyDamage();
      }

      // Do not promote the retry record until the native document update is visible.
      if (!(await waitForPlannedHp(actor, target))) {
        throw new Error(`Target ${target.uuid} did not reach planned HP ${target.afterHp}.`);
      }
    }

    if (game.settings.get(MODULE_ID, "autoDamageShakeTokens") && target.afterHp < target.beforeHp) {
      await shakeToken(token);
    }
  }

  function processingResults(state) {
    return Array.from(state?.targets ?? [])
      .filter(target => target.state === "applied")
      .map(target => ({
        actorName: target.actorName,
        tokenId: target.tokenId,
        operation: target.operation,
        damage: target.operation === "damage" ? target.amount : 0,
        healing: target.operation === "healing" ? target.amount : 0,
        reduction: target.reduction,
        damageIncrease: target.damageIncrease,
        traitMode: target.traitMode,
        appliedDamage: target.operation === "damage" ? target.appliedAmount : 0,
        appliedHealing: target.operation === "healing" ? target.appliedAmount : 0,
        propertyNames: target.propertyNames,
        currentHP: target.beforeHp,
        newHP: target.afterHp
      }));
  }

  async function applyProcessingPlan(message, state, { critical = false } = {}) {
    const finalState = await runProcessingState(state, {
      readCurrentHp: readPlannedHp,
      applyTarget: target => applyPlannedTarget(target, {
        ...getDeathTimerDamageContext(message, target, critical)
      }),
      onPromoted: target => recoverPromotedDeathTimerDamage(message, target, critical),
      persistState: nextState => persistProcessingState(message, nextState),
      onConflict: async target => {
        const hpDetail = Number.isFinite(target.observedHp) ? ` Current HP is ${target.observedHp}.` : "";
        const label = target.actorName || target.uuid;
        console.warn(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Auto Damage conflict for ${label}: ${target.conflictReason}.${hpDetail}`
        );
        ui.notifications?.warn?.(
          `Auto Damage conflict for ${label}. HP was not changed automatically.${hpDetail}`
        );
      }
    });

    if (finalState.status === "complete") {
      let moduleFlagWritten = false;
      try {
        await message.setFlag(MODULE_ID, "autoDamageProcessed", true);
        moduleFlagWritten = true;
      } catch (err) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not set legacy processed flag on message ${message.id}`,
          err
        );
      }

      if (moduleFlagWritten) {
        try {
          await message.setFlag("shadowdark", "damageApplied", true);
        } catch (err) {
          console.error(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not set Shadowdark damage-applied flag on message ${message.id}`,
            err
          );
        }
      }
    }

    return finalState;
  }

  async function appendDamageReductionDisplay(message, results) {
    const adjusted = Array.from(results ?? []).filter(result => result.traitMode);
    if (!adjusted.length) return;

    try {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = String(message.content ?? "").trim();
      wrapper.querySelector(".mk-damage-traits-result")?.remove();

      const summary = document.createElement("div");
      summary.className = "mk-damage-traits-result";
      summary.innerHTML = `
        <strong><i class="fas fa-scale-balanced"></i> Damage Trait</strong>
        ${adjusted.map(result => {
          const properties = result.propertyNames.length
            ? ` (${result.propertyNames.map(escapeHtml).join(", ")})`
            : "";
          const calculation = result.traitMode === "resistance"
            ? `${result.damage} &times; &frac12; = <strong>${result.appliedDamage}</strong>`
            : result.traitMode === "nonmagical-immunity"
              ? `${result.damage} &rarr; <strong>0</strong> (nonmagical source)`
              : result.traitMode === "immunity"
                ? `${result.damage} &rarr; <strong>0</strong>`
                : result.traitMode === "vulnerability"
                  ? `${result.damage} &times; 2 = <strong>${result.appliedDamage}</strong>`
                  : `${result.damage} (Resistance + Vulnerability) = <strong>${result.appliedDamage}</strong>`;
          return `
            <div class="mk-damage-traits-result-row">
              <span>${escapeHtml(result.actorName)}${properties}</span>
              <span>${calculation}</span>
            </div>
          `;
        }).join("")}
      `;

      const card = wrapper.querySelector(".shadowdark.chat-card, .shadowdark.chat-card.item-card");
      if (card) {
        const footer = card.querySelector(".card-footer");
        if (footer?.parentNode === card) card.insertBefore(summary, footer);
        else card.appendChild(summary);
      } else {
        wrapper.appendChild(summary);
      }

      await message.update({ content: wrapper.innerHTML });
      scrollChatToBottom();
    } catch (error) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not append damage reduction summary`,
        error
      );
    }
  }

  async function appendDamageDisplayToMessage(message, { total, formula, html }, operation = "damage") {
    try {
      const original = message.content ?? "";
      const wrapper = document.createElement("div");
      wrapper.innerHTML = original.trim();

      const card = wrapper.querySelector(".shadowdark.chat-card.item-card");
      const damageDiv = document.createElement("div");
      damageDiv.className = "sd-auto-damage";
      const label = operation === "healing" ? "Healing" : "Damage";

      if (html) {
        damageDiv.innerHTML = `
          <div class="sd-auto-damage-label"><strong>${label}</strong></div>
          ${html}
        `;
      } else {
        damageDiv.innerHTML =
          `<strong>${label}</strong> ${formula ? `${formula} = ${total}` : total}`;
      }

      if (card) {
        const footer = card.querySelector(".card-footer");
        if (footer && footer.parentNode === card) {
          card.insertBefore(damageDiv, footer);
        } else {
          const anchor =
            card.querySelector(".d20-roll") ||
            card.querySelector(".card-content") ||
            card;
          anchor.parentNode.insertBefore(damageDiv, anchor.nextSibling);
        }

        await message.update({ content: wrapper.innerHTML });
      } else {
        await message.update({
          content: original +
            `
        <div class="sd-auto-damage">
          <strong>${label}</strong> ${formula ? `${formula} = ${total}` : total}
        </div>`
        });
      }

      scrollChatToBottom();
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error appending damage display`,
        err
      );
    }
  }

  async function handleChatMessage(message, context = {}) {
    try {
      if (!isPrimaryActiveGM()) return;
      if (!game.settings.get(MODULE_ID, "autoDamageEnabled")) return;
      if (!message?.id) return;
      if (PROCESSING_MESSAGES.has(message.id)) return;
      if (hasAutoDamageProcessed(message)) return;

      PROCESSING_MESSAGES.add(message.id);

      const targetUuids = getTargetSnapshot(message);
      await persistTargetSnapshot(message, targetUuids);

      let processingState = readProcessingState(message, MODULE_ID);
      const nativeDamage = extractNativeDamage(message);
      if (processingState) {
        adLog(`Message ${message.id}: resuming pending auto-damage processing state.`);
        processingState = await applyProcessingPlan(message, processingState, {
          critical: nativeDamage.critical
        });

        if (processingState.display) {
          await appendDamageDisplayToMessage(message, processingState.display, processingState.operation);
        } else {
          scrollChatToBottom();
        }

        if (processingState.operation === "damage") {
          await appendDamageReductionDisplay(message, processingResults(processingState));
        }
        return;
      }

      const operation = await resolveAutoDamageOperation(message);

      if (!operation) {
        adLog(`Message ${message.id}: spell damage type is none; not applying HP changes.`);
        return;
      }

      const { damage, outcome, critical, debug } = nativeDamage;

      if (damage == null) {
        adLog(
          `Message ${message.id}: no native Shadowdark ${operation} roll detected (${context.source ?? "unknown"});`,
          debug
        );
        return;
      }

      if (outcome === "failure") {
        adLog(
          `Message ${message.id}: ${operation} found but roll looks like a FAILURE; not applying.`,
          debug
        );
        return;
      }

      const delayMs = Number(game.settings.get(MODULE_ID, "autoDamageDelayMs")) || 0;
      if (delayMs > 0) {
        adLog(
          `Message ${message.id}: delaying auto-${operation} ${damage} by ${delayMs}ms`
        );
        await sleep(delayMs);
      }

      adLog(
        `Message ${message.id}: auto-applying ${operation} ${damage} (outcome: ${
          outcome ?? "unknown/assumed success"
        })`,
        debug
      );

      const damageTraitsEnabled = operation === "damage"
        && game.settings.get(MODULE_ID, "damageTraitsEnabled");
      const damageTraitsApi = damageTraitsEnabled
        ? game.modules.get(MODULE_ID)?.api?.damageTraits
        : null;
      let sourceContext = {
        properties: [],
        isWeapon: false,
        isMagicalWeapon: false,
        isMagicalSource: false,
        magicSource: null
      };

      if (typeof damageTraitsApi?.getSourceContext === "function") {
        try {
          sourceContext = await damageTraitsApi.getSourceContext(message);
        } catch (error) {
          console.error(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not resolve source damage context`,
            error
          );
        }
      }

      processingState = await buildProcessingPlan(
        message,
        damage,
        operation,
        sourceContext,
        targetUuids
      );

      // Persist the complete target plan before the first Actor HP update.
      await persistProcessingState(message, processingState);
      processingState = await applyProcessingPlan(message, processingState, { critical });

      if (processingState.display) {
        await appendDamageDisplayToMessage(message, processingState.display, operation);
      } else {
        scrollChatToBottom();
      }

      if (operation === "damage") {
        await appendDamageReductionDisplay(message, processingResults(processingState));
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error in handleChatMessage`, err);
    } finally {
      if (message?.id) PROCESSING_MESSAGES.delete(message.id);
    }
  }

  async function resumePendingProcessing() {
    if (!isPrimaryActiveGM()) return;
    if (!game.settings.get(MODULE_ID, "autoDamageEnabled")) return;

    const messages = Array.isArray(game.messages?.contents)
      ? [...game.messages.contents]
      : Array.from(game.messages ?? []);

    for (const message of messages) {
      if (hasLegacyProcessed(message, MODULE_ID)) continue;
      if (hasShadowdarkDamageApplied(message)) continue;
      const state = readProcessingState(message, MODULE_ID);
      if (state?.status !== "pending") continue;
      await handleChatMessage(message, { source: "ready-resume" });
    }
  }

  Hooks.once("init", () => {
    adLog("init (settings registered in settings.js)");
  });

  Hooks.once("ready", () => {
    installTokenShakeSocket();
    adLog("ready; hooks active; primary active GM applies damage");
    void resumePendingProcessing();
  });

  Hooks.on("renderChatMessage", (message, html) => {
    syncNativeApplyControls(message, html);
  });

  Hooks.on("createChatMessage", (message, options, userId) => {
    void handleChatMessage(message, { source: "create", options, userId });
  });

  Hooks.on("updateChatMessage", (message, changes, options, userId) => {
    void handleChatMessage(message, { source: "update", changes, options, userId });
  });
})();
