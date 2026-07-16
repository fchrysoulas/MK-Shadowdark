(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "AutoDamage";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function adLog(...args) {
    console.log(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} |`, ...args);
  }

  /* ---------------------------------------- */
  /* Small helpers                            */
  /* ---------------------------------------- */

  function htmlToText(html) {
    if (!html) return "";
    // Preserve line breaks from <br> and </p>
    html = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n</p>");

    const div = document.createElement("div");
    div.innerHTML = html;

    let text = div.textContent || div.innerText || "";
    // Collapse spaces, but KEEP newlines
    text = text.replace(/[ \t]+/g, " ");
    text = text.replace(/\n+/g, "\n");
    return text.trim();
  }

  /** Simple async sleep helper */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Keep auto-damage authoritative.
   * Only one active GM should process chat damage, otherwise players can hit
   * permission errors and multiple GMs can double-apply damage.
   */
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
    try {
      return message?.getFlag?.(MODULE_ID, "autoDamageProcessed") === true;
    } catch (_err) {
      return false;
    }
  }

  const PROCESSING_MESSAGES = new Set();

  /**
   * Gently scroll the chat to the bottom after a small delay,
   * so the new/expanded message is visible.
   */
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

  /**
   * Shake animation for a damaged token, synced for ALL clients by
   * updating the TokenDocument (position changes are broadcast).
   */
  async function shakeToken(token, {
    distanceFactor = 0.1, // fraction of grid size
    steps          = 6,
    stepDuration   = 50
  } = {}) {
    try {
      if (!canvas?.grid) return;

      // We always operate on the TokenDocument so updates are synced.
      const doc = token.document ?? token; // TokenMesh or TokenDocument
      if (!doc) return;

      const baseX = doc.x ?? 0;
      const baseY = doc.y ?? 0;
      const grid  = canvas.grid.size || 100;
      const maxOffset = grid * distanceFactor;

      const doMove = async (x, y) => {
        await doc.update(
          { x, y },
          { animate: true, duration: stepDuration }
        );
      };

      for (let i = 0; i < steps; i++) {
        const dx = (Math.random() * 2 - 1) * maxOffset;
        const dy = (Math.random() * 2 - 1) * maxOffset;
        await doMove(baseX + dx, baseY + dy);
      }

      // Return to original position
      await doMove(baseX, baseY);
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error shaking token`,
        err
      );
    }
  }

  /**
   * Try to infer success/failure from Shadowdark flags, if present.
   */
  function detectOutcomeFromFlags(message) {
    const flags = message?.flags?.shadowdark;
    if (!flags || typeof flags !== "object") return null;

    let outcome = null; // "success" | "failure" | null

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
          if (/\bsuccess\b/.test(lower)) {
            outcome ??= "success";
          }
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

  /**
   * Extract damage number and outcome info from a ChatMessage
   * for **weapon-style** cards.
   */
  function extractDamageAndOutcome(message) {
    const raw   = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text  = htmlToText(raw);
    const lower = text.toLowerCase();

    const debug = { text };
    let damageTotal  = null;
    let damageSource = null;

    // Shadowdark 4 stores evaluated main and damage rolls directly on the
    // message. Prefer that structured data over parsing localized chat HTML.
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

    // ---- Detect weapon card ----
    const isWeaponCard = /Type:\s*(Melee|Ranged|Missile|Thrown)/i.test(text);
    debug.isWeaponCard = isWeaponCard;

    if (damageTotal == null && isWeaponCard) {
      const dmgIdx = text.indexOf("Damage"); // capital D: property label
      if (dmgIdx !== -1) {
        const segment = text.slice(dmgIdx); // from "Damage" to end
        const nums = segment.match(/\b\d+\b/g);

        if (nums && nums.length) {
          const last = Number(nums[nums.length - 1]);
          if (Number.isFinite(last) && last > 0) {
            damageTotal  = last;
            damageSource = "weapon-text-after-Damage";
            debug.damageSegment   = segment;
            debug.parsedNumbers   = nums;
          } else {
            debug.reason          = "weapon damage segment numbers were non-positive/NaN";
            debug.damageSegment   = segment;
            debug.parsedNumbers   = nums;
          }
        } else {
          debug.reason        = "weapon damage segment had no numbers";
          debug.damageSegment = segment;
        }
      } else {
        debug.reason = "weapon card had no 'Damage' label";
      }
    }

    // ---- Outcome detection (independent of damage) ----
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

      if (hasSuccessWord && !hasFailureWord) {
        outcome = "success";
      } else if (hasFailureWord && !hasSuccessWord) {
        outcome = "failure";
      } else {
        outcome = null;
      }

      debug.hasSuccessWord  = hasSuccessWord;
      debug.hasFailureWord  = hasFailureWord;
    }

    if (damageTotal == null && !debug.reason) {
      debug.reason = "no weapon-style damage detected";
    }

    debug.damage       = damageTotal;
    debug.outcome      = outcome;
    debug.damageSource = damageSource;

    return { damage: damageTotal, outcome, debug };
  }

  /**
   * Helper to roll a damage formula, optionally showing it in Dice So Nice.
   * Returns { total, formula, html, roll } or null.
   */
  async function rollFormulaForDamage(formula) {
    const cleanFormula = formula.trim();
    const roll = new Roll(cleanFormula);

    await roll.evaluate();

    if (!Number.isFinite(roll.total) || roll.total <= 0) return null;

    // Dice So Nice support
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

  /**
   * Look for phrases like:
   *   "deal 2d6 damage"
   *   "deals 2d6+3 damage"
   *   "dealing [[/r 1d4]] damage"
   * and roll the dice expression.
   *
   * Returns:
   *    { total, formula, html, matchText, text } | null
   */
  async function rollDamageFromDealXdX(message) {
    const raw  = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text = htmlToText(raw);

    // 1) Inline roll version: dealing [[/r 1d4]] damage
    let re = /\b(?:deal(?:s)?|dealing)\s+(\[\[(?:\/r\s*)?([^\]]+)\]\])\s+damage\b/i;
    let m  = text.match(re);
    if (m) {
      let inner = m[2].trim(); // inner part of [[...]]
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

    // 2) Plain dice version: deal 2d6+3 damage
    re = /\b(?:deal(?:s)?|dealing)\s+(\d+d\d+(?:\s*[+-]\s*\d+)*)\s+damage\b/i;
    m  = text.match(re);
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

  /**
   * Fallback: look for "[[...]] damage" anywhere and roll that expression.
   * e.g.  "[[/r 1d4]] damage"
   *
   * Returns:
   *    { total, formula, html, matchText, text } | null
   */
  async function rollDamageFromInlineDamage(message) {
    const raw  = `${message.flavor ?? ""} ${message.content ?? ""}`;
    const text = htmlToText(raw);

    const re = /\[\[(?:\/r\s*)?([^\]]+)\]\]\s+damage\b/i;
    const m  = text.match(re);
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

  /**
   * Try to find a numeric HP field on the actor.
   */
  function resolveHpField(actor) {
    const paths = [
      "system.hp.value",            // Shadowdark PCs (and many NPCs)
      "system.hp.current",          // some systems
      "system.hp",                  // raw number
      "system.attributes.hp.value", // 5e-style
      "system.attributes.hp.hp",
      "system.attributes.hp"
    ];

    for (const path of paths) {
      let value = foundry.utils.getProperty(actor, path);
      if (typeof value === "string") {
        const num = Number(value);
        if (!Number.isNaN(num)) value = num;
      }

      if (typeof value === "number") {
        return { path, value };
      }
    }

    return null;
  }

  /**
   * Apply damage to all tokens targeted by the user that created the message.
   * This must be called only by the primary active GM.
   */
  async function applyDamageToTargets(message, damage) {
    const author = getMessageAuthor(message);
    if (!author) {
      adLog(`Message ${message.id}: no author found; cannot resolve targets.`);
      return;
    }

    const targets = Array.from(author.targets ?? []);
    if (!targets.length) {
      adLog(`Message ${message.id}: author ${author.name} has no targets; nothing to damage.`);
      return;
    }

    const shakeEnabled = game.settings.get(MODULE_ID, "autoDamageShakeTokens");

    for (const token of targets) {
      const actor = token.actor;
      if (!actor) continue;

      const hpInfo = resolveHpField(actor);

      if (!hpInfo) {
        adLog(
          `Token ${token.id} (${actor.name}): could not resolve numeric HP field; system.hp =`,
          actor.system?.hp
        );
        continue;
      }

      const { path: hpPath, value: currentHP } = hpInfo;
      const newHP = Math.max(0, currentHP - damage);

      adLog(
        `Token ${token.id} (${actor.name}): HP via "${hpPath}" ${currentHP} -> ${newHP} (damage ${damage})`
      );

      await actor.update({ [hpPath]: newHP });

      // Shake the token visually on damage (for everyone, via TokenDocument updates)
      if (shakeEnabled && newHP < currentHP) {
        await shakeToken(token);
      }
    }
  }

  /**
   * Append our damage display to the card using the actual dice HTML,
   * placing it **above the footer traits**.
   */
  async function appendDamageDisplayToMessage(message, { total, formula, html }) {
    try {
      const original = message.content ?? "";
      const wrapper = document.createElement("div");
      wrapper.innerHTML = original.trim();

      const card = wrapper.querySelector(".shadowdark.chat-card.item-card");

      const damageDiv = document.createElement("div");
      damageDiv.className = "sd-auto-damage";

      if (html) {
        damageDiv.innerHTML = `
          <div class="sd-auto-damage-label"><strong>Damage</strong></div>
          ${html}
        `;
      } else {
        damageDiv.innerHTML =
          `<strong>Damage</strong> ${formula ? `${formula} = ${total}` : total}`;
      }

      if (card) {
        // Insert damage block **before** the footer (traits row)
        const footer = card.querySelector(".card-footer");
        if (footer && footer.parentNode === card) {
          card.insertBefore(damageDiv, footer);
        } else {
          // Fallback if no footer: add after roll or content
          const anchor =
            card.querySelector(".d20-roll") ||
            card.querySelector(".card-content") ||
            card;
          anchor.parentNode.insertBefore(damageDiv, anchor.nextSibling);
        }

        await message.update({ content: wrapper.innerHTML });
      } else {
        // Fallback: just append under the message content
        await message.update({
          content: original +
            `
        <div class="sd-auto-damage">
          <strong>Damage</strong> ${formula ? `${formula} = ${total}` : total}
        </div>`
        });
      }

      // After the message grows, scroll chat to keep this in view
      scrollChatToBottom();
    } catch (err) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error appending damage display`,
        err
      );
    }
  }

  /**
   * Central handler used by both create & update hooks.
   */
  async function handleChatMessage(message, context) {
    try {
      // AutoDamage must be authoritative and permission-safe.
      // Only the primary active GM processes chat damage.
      if (!isPrimaryActiveGM()) return;

      if (!game.settings.get(MODULE_ID, "autoDamageEnabled")) return;
      if (!message?.id) return;
      if (PROCESSING_MESSAGES.has(message.id)) return;
      if (hasAutoDamageProcessed(message)) return;

      let damageDisplay = null;

      // 1) Try explicit weapon-style "Damage" block
      let { damage, outcome, debug } = extractDamageAndOutcome(message);

      // 2) If none, try spell-style "deal(s)/dealing XdY damage" (including [[/r 1d4]])
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

      // 3) If still none, try generic "[[...]] damage"
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
          `Message ${message.id}: no damage detected (${context.source});`,
          debug?.reason ?? "no reason",
          debug
        );
        return;
      }

      // Rule: "Apply damage on success / critical success"
      // Implementation: **skip only when we clearly see a FAILURE**.
      if (outcome === "failure") {
        adLog(
          `Message ${message.id}: damage found but roll looks like a FAILURE; not applying.`,
          debug
        );
        return;
      }

      PROCESSING_MESSAGES.add(message.id);

      try {
        await message.setFlag(MODULE_ID, "autoDamageProcessed", true);
      } catch (err) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not set processed flag on message ${message.id}`,
          err
        );
      }

      const delayMs = Number(game.settings.get(MODULE_ID, "autoDamageDelayMs")) || 0;
      if (delayMs > 0) {
        adLog(
          `Message ${message.id}: delaying auto-damage ${damage} by ${delayMs}ms`
        );
        await sleep(delayMs);
      }

      adLog(
        `Message ${message.id}: auto-applying damage ${damage} (outcome: ${
          outcome ?? "unknown/assumed success"
        })`,
        debug
      );

      await applyDamageToTargets(message, damage);

      // If damage came from a dice expression, show it on the card with full dice HTML.
      if (damageDisplay) {
        await appendDamageDisplayToMessage(message, damageDisplay);
      } else {
        // Weapons: still scroll so the player sees the updated HP / latest card.
        scrollChatToBottom();
      }
    } catch (err) {
      console.error(`${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Error in handleChatMessage`, err);
    } finally {
      if (message?.id) PROCESSING_MESSAGES.delete(message.id);
    }
  }

  /* ---------------------------------------- */
  /* Init + hooks                             */
  /* ---------------------------------------- */

  Hooks.once("init", () => {
    adLog("init (settings registered in settings.js)");
  });

  Hooks.once("ready", () => {
    adLog("ready; hooks active; primary active GM applies damage");
  });

  Hooks.on("createChatMessage", (message, options, userId) => {
    void handleChatMessage(message, { source: "create", options, userId });
  });

  Hooks.on("updateChatMessage", (message, changes, options, userId) => {
    void handleChatMessage(message, { source: "update", changes, options, userId });
  });

})();
