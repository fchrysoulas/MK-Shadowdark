/*
 * Shadowdark Extras - Luck Reroll
 * Foundry VTT v12
 *
 * Settings are registered in scripts/settings.js.
 */

(() => {
  // scripts/luck-reroll.js

  const MODULE_ID = "shadowdark-extras";
  const LUCK_BUTTON_LABEL = "Luck Reroll";

  Hooks.once("init", () => {
    console.log(`${MODULE_ID} | LuckReroll | init`);
  });

  Hooks.once("ready", () => {
    console.log(`${MODULE_ID} | LuckReroll | ready`);
  });

  /**
   * When any chat message is rendered, see if we should inject Luck buttons.
   */
  Hooks.on("renderChatMessage", (message, html, data) => {
    try {
      // module setting is registered in scripts/settings.js
      if (!game.settings.get(MODULE_ID, "enableLuckReroll")) return;
      if (game.system.id !== "shadowdark") return;

      addLuckButtons(message, html);
    } catch (err) {
      console.error(`${MODULE_ID} | renderChatMessage error`, err);
    }
  });

  /**
   * Resolve an Actor from ChatMessage speaker / flags.
   */
  function getActorFromMessage(message) {
    const speaker = message.speaker || {};
    let actor = null;

    // 1) Direct actor reference
    if (speaker.actor) {
      actor = game.actors?.get(speaker.actor) ?? null;
    }

    // 2) Token on a scene
    if (!actor && speaker.token) {
      const scene = speaker.scene
        ? game.scenes?.get(speaker.scene)
        : game.scenes?.current;
      const token = scene?.tokens?.get(speaker.token);
      actor = token?.actor ?? actor;
    }

    // 3) Some rolls put actorId into roll options
    if (!actor && message._roll?.options?.actorId) {
      actor = game.actors?.get(message._roll.options.actorId) ?? actor;
    }

    // 4) Shadowdark-specific flag, if present
    if (!actor) {
      const actorId = message.getFlag("shadowdark", "actorId");
      if (actorId) {
        actor = game.actors?.get(actorId) ?? actor;
      }
    }

    return actor;
  }

  /**
   * Does this actor still have Luck to spend?
   */
  function hasLuckAvailable(actor) {
    return !!actor?.system?.luck?.available;
  }

  /**
   * Disable every Luck button in the chat that belongs to a specific actor.
   */
  function disableLuckButtonsForActor(actorId) {
    const selector = `.sd-luck-reroll-button[data-actor-id="${actorId}"]`;
    document.querySelectorAll(selector).forEach((btn) => {
      btn.disabled = true;
      const wrapper = btn.closest(".sd-luck-reroll");
      if (wrapper) wrapper.classList.add("sd-luck-reroll--used");
    });
  }

  /**
   * Inject Luck buttons under each dice-roll box.
   * (So an attack card with attack + damage will get 2 buttons.)
   */
  function addLuckButtons(message, html) {
    const rollBoxes = html.find(".dice-roll");
    if (!rollBoxes.length) return;

    const actor = getActorFromMessage(message);
    if (!actor) return;

    const isOwner = actor.isOwner || game.user.isGM;
    if (!isOwner) return;

    const luckStillAvailable = hasLuckAvailable(actor);
    const luckAlreadyUsedOnMessage = message.getFlag(MODULE_ID, "luckUsed");

    // If the actor has no Luck and this message wasn't the one that used it,
    // don't clutter the chat with disabled buttons.
    if (!luckStillAvailable && !luckAlreadyUsedOnMessage) return;

    // Avoid duplication on re-render
    if (html.find(".sd-luck-reroll-button").length) return;

    rollBoxes.each((index, el) => {
      const $roll = $(el);
      const formula = $roll.find(".dice-formula").text().trim();
      if (!formula) return;

      const wrapper = $(`
        <div class="sd-luck-reroll">
          <button
            type="button"
            class="sd-luck-reroll-button"
            data-message-id="${message.id}"
            data-actor-id="${actor.id}"
            data-formula="${formula}"
          >
            ${LUCK_BUTTON_LABEL}
          </button>
        </div>
      `);

      // If we know Luck is already spent, render it disabled
      if (!luckStillAvailable || luckAlreadyUsedOnMessage) {
        wrapper.addClass("sd-luck-reroll--used");
        wrapper.find("button").prop("disabled", true);
      }

      // Put the button under this specific roll block (attack or damage)
      $roll.after(wrapper);
    });

    // Per-message click handler
    html.on("click", ".sd-luck-reroll-button", onLuckButtonClick);
  }

  /**
   * Click handler for Luck buttons.
   */
  async function onLuckButtonClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const button = event.currentTarget;
    if (!button || button.disabled) return;

    const $btn = $(button);
    const messageId = $btn.data("messageId");
    const actorId = $btn.data("actorId");
    const rawFormula = $btn.data("formula");
    const formula = String(rawFormula || "").trim();

    const actor = game.actors?.get(actorId);
    if (!actor) {
      ui.notifications?.error?.("Shadowdark Extras: Actor not found for Luck reroll.");
      return;
    }

    // Re-check Luck at click time (in case something else spent it)
    if (!hasLuckAvailable(actor)) {
      ui.notifications?.warn?.("Luck has already been used.");
      disableLuckButtonsForActor(actorId);
      return;
    }

    // Spend Luck immediately to avoid double-click or race conditions
    try {
      await actor.update({ "system.luck.available": false });
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to update actor Luck`, err);
      ui.notifications?.error?.("Shadowdark Extras: Failed to spend Luck.");
      return;
    }

    // Mark this message as the one that used Luck (for future re-renders)
    const message = game.messages?.get(messageId);
    if (message) {
      await message.setFlag(MODULE_ID, "luckUsed", true);
    }

    // Visually disable all Luck buttons for this actor
    disableLuckButtonsForActor(actorId);

    if (!formula) {
      console.warn(`${MODULE_ID} | Luck reroll had empty formula.`);
      return;
    }

    // Try to use Shadowdark's RollSD class if it exists, else core Roll
    let RollClass = Roll;
    try {
      if (CONFIG?.SHADOWDARK?.RollSD) {
        RollClass = CONFIG.SHADOWDARK.RollSD;
      } else if (CONFIG?.shadowdark?.RollSD) {
        RollClass = CONFIG.shadowdark.RollSD;
      }
    } catch (e) {
      // Ignore and just keep RollClass = Roll
    }

    let roll;
    try {
      const rollData = actor.getRollData ? actor.getRollData() : actor.system || {};
      roll = new RollClass(formula, rollData);
      await roll.evaluate({ async: true });
    } catch (err) {
      console.error(`${MODULE_ID} | Error evaluating Luck roll`, err);
      ui.notifications?.error?.("Shadowdark Extras: Failed to roll Luck reroll.");
      return;
    }

    // Flavor: mark it clearly as a Luck reroll, keep original flavor if present
    const speaker = ChatMessage.getSpeaker({ actor });
    const originalFlavor = message?.flavor || "";
    const luckLabel = "Luck Reroll";

    const flavor = originalFlavor
      ? `${originalFlavor} - ${luckLabel}`
      : luckLabel;

    await roll.toMessage({
      speaker,
      flavor,
      flags: {
        [MODULE_ID]: {
          luckReroll: true,
          sourceMessage: messageId
        }
      }
    });
  }

})();
