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

  function adLog(...args) {
    console.log(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} |`, ...args);
  }

  function htmlToText(html) {
    if (!html) return "";
    html = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n</p>");

    const div = document.createElement("div");
    div.innerHTML = html;

    let text = div.textContent || div.innerText || "";
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n+/g, "\n");
    return text.trim();
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
    return isTerminalProcessingState(readProcessingState(message, MODULE_ID));
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

  function detectOutcomeFromFlags(message) {
    const flags = message?.flags?.shadowdark;
    if (!flags || typeof flags !== "object") return null;

    let outcome = null;

    function walk(obj) {
      if (!obj || typeof obj !== "object" || outcome) return;

      for (const [key, value] of Object.entries(obj)) {
        if (outcome) break;

        if (typeof value === "string") {
          const lower = value.toLowerCase();
          if (lower.includes("critical failure")) {
            outcome = "failure";
            break;
          }
          if (lower.includes("critical success")) {
            outcome = "success";
            break;
          }
          if (/\bsuccess\b/.test(lower)) outcome ??= "success";
          if (/\bfailure\b/.test(lower) || lower.includes("spell lost")) {
            outcome ??= "failure";
          }
        } else if (typeof value === "boolean" && key.toLowerCase().includes("success")) {
          outcome = value ? "success" : "failure";
        } else if (typeof value === "object") {
          walk(value);
        }
      }
    }

    walk(flags);
    return outcome;
  }

  function extractDamageAndOutcome(message) {
    const raw = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text = htmlToText(raw);
    const lower = text.toLowerCase();

    const debug = { text };
    let damageTotal = null;
    let damageSource = null;

    const messageRolls = Array.from(message?.rolls ?? []);
    const mainRoll = messageRolls.find(roll => roll?.options?.type === "main");
    const damageRoll = messageRolls.find(roll => roll?.options?.type === "damage");

    if (damageRoll) {
      const total = Number(damageRoll.total);
      if (Number.isFinite(total) && total > 0) {
        damageTotal = total;
        damageSource = "shadowdark-v4-damage-roll";
      }
    }

    const isWeaponCard = /Type:\s*(Melee|Ranged|Missile|Thrown)/i.test(text);
    debug.isWeaponCard = isWeaponCard;

    if (damageTotal == null && isWeaponCard) {
      const dmgIdx = text.indexOf("Damage");
      if (dmgIdx !== -1) {
        const segment = text.slice(dmgIdx);
        const nums = segment.match(/\b\d+\b/g);

        if (nums && nums.length) {
          const last = Number(nums[nums.length - 1]);
          if (Number.isFinite(last) && last > 0) {
            damageTotal = last;
            damageSource = "weapon-text-after-Damage";
            debug.damageSegment = segment;
            debug.parsedNumbers = nums;
          } else {
            debug.reason = "weapon damage segment numbers were non-positive/NaN";
            debug.damageSegment = segment;
            debug.parsedNumbers = nums;
          }
        } else {
          debug.reason = "weapon damage segment had no numbers";
          debug.damageSegment = segment;
        }
      } else {
        debug.reason = "weapon card had no 'Damage' label";
      }
    }

    let outcome = detectOutcomeFromFlags(message);

    if (!outcome && mainRoll) {
      if (mainRoll.success === true) outcome = "success";
      else if (mainRoll.success === false) outcome = "failure";
    }

    if (!outcome) {
      const hasSuccessWord =
        /\bsuccess\b/.test(lower) || lower.includes("critical success");
      const hasFailureWord =
        /\bfailure\b/.test(lower) ||
        lower.includes("critical failure") ||
        lower.includes("spell lost");

      if (hasSuccessWord && !hasFailureWord) outcome = "success";
      else if (hasFailureWord && !hasSuccessWord) outcome = "failure";
      else outcome = null;

      debug.hasSuccessWord = hasSuccessWord;
      debug.hasFailureWord = hasFailureWord;
    }

    if (damageTotal == null && !debug.reason) {
      debug.reason = "no weapon-style damage detected";
    }

    debug.damage = damageTotal;
    debug.outcome = outcome;
    debug.damageSource = damageSource;

    return { damage: damageTotal, outcome, debug };
  }

  async function rollFormulaForDamage(formula) {
    const cleanFormula = formula.trim();
    const roll = new Roll(cleanFormula);

    await roll.evaluate();

    if (!Number.isFinite(roll.total) || roll.total <= 0) return null;

    try {
      if (
        game.dice3d &&
        game.settings?.get(MODULE_ID, "autoDamageShowDice3D")
      ) {
        await game.dice3d.showForRoll(roll, game.user, true);
      }
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error showing 3D dice`,
        err
      );
    }

    const html = await roll.render();
    return {
      total: roll.total,
      formula: cleanFormula,
      html,
      roll
    };
  }

  async function rollDamageFromDealXdX(message) {
    const raw = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text = htmlToText(raw);

    let re = /\b(?:deal(?:s)?|dealing)\s+(\[\[(?:\/r\s*)?([^\]]+)\]\])\s+damage\b/i;
    let m = text.match(re);
    if (m) {
      let inner = m[2].trim();
      if (inner.startsWith("/r")) inner = inner.slice(2).trim();

      try {
        const rolled = await rollFormulaForDamage(inner);
        if (!rolled) return null;
        return {
          ...rolled,
          matchText: m[0],
          text
        };
      } catch (err) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error rolling formula "${inner}"`,
          err
        );
        return null;
      }
    }

    re = /\b(?:deal(?:s)?|dealing)\s+(\d+d\d+(?:\s*[+-]\s*\d+)*)\s+damage\b/i;
    m = text.match(re);
    if (m) {
      const inner = m[1].replace(/\s+/g, "");
      try {
        const rolled = await rollFormulaForDamage(inner);
        if (!rolled) return null;
        return {
          ...rolled,
          matchText: m[0],
          text
        };
      } catch (err) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error rolling formula "${inner}"`,
          err
        );
        return null;
      }
    }

    return null;
  }

  async function rollDamageFromInlineDamage(message) {
    const raw = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text = htmlToText(raw);

    const re = /\[\[(?:\/r\s*)?([^\]]+)\]\]\s+damage\b/i;
    const m = text.match(re);
    if (!m) return null;

    let inner = m[1].trim();
    if (inner.startsWith("/r")) inner = inner.slice(2).trim();

    try {
      const rolled = await rollFormulaForDamage(inner);
      if (!rolled) return null;
      return {
        ...rolled,
        matchText: m[0],
        text
      };
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error rolling inline formula "${inner}"`,
        err
      );
      return null;
    }
  }

  function resolveHpField(actor) {
    const paths = [
      ["system.hp.value", "system.hp.max"],
      ["system.hp.current", "system.hp.max"],
      ["system.hp", null],
      ["system.attributes.hp.value", "system.attributes.hp.max"],
      ["system.attributes.hp.hp", "system.attributes.hp.max"],
      ["system.attributes.hp", null]
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
      const { newHP, appliedAmount } = calculateHpChange(
        currentHP,
        maxHP,
        adjustedAmount,
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

  async function applyPlannedTarget(target) {
    const { token, actor } = await resolvePlannedTarget(target);

    adLog(
      `Token ${target.tokenId} (${target.actorName}): HP via "${target.hpPath}" ${target.beforeHp} -> ${target.afterHp} ` +
      (target.operation === "healing"
        ? `(healing ${target.amount}, applied ${target.appliedAmount})`
        : `(damage ${target.amount}, trait ${target.traitMode ?? "none"}, applied ${target.appliedAmount})`)
    );

    if (target.afterHp !== target.beforeHp) {
      await actor.update({ [target.hpPath]: target.afterHp });
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

  async function applyProcessingPlan(message, state) {
    const finalState = await runProcessingState(state, {
      readCurrentHp: readPlannedHp,
      applyTarget: applyPlannedTarget,
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
      try {
        await message.setFlag(MODULE_ID, "autoDamageProcessed", true);
      } catch (err) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not set legacy processed flag on message ${message.id}`,
          err
        );
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
      if (processingState) {
        adLog(`Message ${message.id}: resuming pending auto-damage processing state.`);
        processingState = await applyProcessingPlan(message, processingState);

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

      let damageDisplay = null;
      const operation = await resolveAutoDamageOperation(message);

      if (!operation) {
        adLog(`Message ${message.id}: spell damage type is none; not applying HP changes.`);
        return;
      }

      let { damage, outcome, debug } = extractDamageAndOutcome(message);

      if (damage == null) {
        const dealResult = await rollDamageFromDealXdX(message);
        if (dealResult) {
          damage = dealResult.total;
          damageDisplay = {
            total: dealResult.total,
            formula: dealResult.formula,
            html: dealResult.html
          };
          debug = {
            ...(debug || {}),
            text: dealResult.text,
            damage,
            damageSource: "deal-xdx",
            formula: dealResult.formula,
            matchText: dealResult.matchText
          };
        }
      }

      if (damage == null) {
        const inlineResult = await rollDamageFromInlineDamage(message);
        if (inlineResult) {
          damage = inlineResult.total;
          damageDisplay = {
            total: inlineResult.total,
            formula: inlineResult.formula,
            html: inlineResult.html
          };
          debug = {
            ...(debug || {}),
            text: inlineResult.text,
            damage,
            damageSource: "inline-damage",
            formula: inlineResult.formula,
            matchText: inlineResult.matchText
          };
        }
      }

      if (damage == null) {
        adLog(
          `Message ${message.id}: no ${operation} amount detected (${context.source ?? "unknown"});`,
          debug?.reason ?? "no reason",
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
        targetUuids,
        damageDisplay
      );

      // Persist the complete target plan before the first Actor HP update.
      await persistProcessingState(message, processingState);
      processingState = await applyProcessingPlan(message, processingState);

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

  Hooks.on("createChatMessage", (message, options, userId) => {
    void handleChatMessage(message, { source: "create", options, userId });
  });

  Hooks.on("updateChatMessage", (message, changes, options, userId) => {
    void handleChatMessage(message, { source: "update", changes, options, userId });
  });
})();
