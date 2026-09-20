import {
  applyTargetsToRollConfig,
  collectValidTargets,
  findSelfTarget,
  isAttackOrSpellRoll,
  isSelfRangeSpell
} from "./targeting-state.js";

(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Targeting Assistant";
  const TARGETS_CHANGED_HOOK = "mkShadowdarkTargetingChanged";
  const WRAPPED_RENDER = Symbol.for(`${MODULE_ID}.targetingAssistant.wrappedRender`);
  const WRAPPED_SUBMIT = Symbol.for(`${MODULE_ID}.targetingAssistant.wrappedSubmit`);
  const ACTIVE_DIALOGS = new Set();
  const PROMPTED_DIALOGS = new WeakSet();
  const CLOSE_LISTENER_INSTALLED = new WeakSet();

  function log(...args) {
    const version = game.modules.get(MODULE_ID)?.version ?? "unknown";
    console.log(`${MODULE_ID} v${version} | ${SUBMODULE} |`, ...args);
  }

  function localize(key, fallback) {
    const value = game.i18n?.localize?.(key);
    return value && value !== key ? value : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function selectedTargets() {
    return collectValidTargets(game.user?.targets ?? []);
  }

  function actorIdFromUuid(uuid) {
    const parts = String(uuid ?? "").trim().split(".");
    return parts.length ? parts[parts.length - 1] : "";
  }

  function selfTarget(config) {
    const actorUuid = String(config?.actorUuid ?? "").trim();
    const actorId = actorIdFromUuid(actorUuid);
    const configuredActor = game.actors?.get?.(actorId);
    const character = game.user?.character;
    const actor = configuredActor
      ?? (character && (!actorUuid || character.uuid === actorUuid || character.id === actorId)
        ? character
        : null);
    const activeTokens = actor?.getActiveTokens?.(true, true)
      ?? actor?.getActiveTokens?.()
      ?? [];
    const placeableTokens = globalThis.canvas?.tokens?.placeables ?? [];
    const tokens = [];
    const seen = new Set();

    for (const token of [...activeTokens, ...Array.from(placeableTokens)]) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
    }

    return findSelfTarget(tokens, actorUuid || character?.uuid, actor?.id || actorId);
  }

  function canAssist(config) {
    return isAttackOrSpellRoll(config)
      && Boolean(globalThis.canvas?.ready)
      && Boolean(game.user);
  }

  function targetPanelHtml(targets, { self = false } = {}) {
    const title = self
      ? localize("MK_SHADOWDARK.targeting.self", "Self")
      : localize("MK_SHADOWDARK.targeting.targets", "Targets");

    if (!targets.length) {
      if (self) {
        const prompt = localize(
          "MK_SHADOWDARK.targeting.selfDescription",
          "This spell targets the caster automatically."
        );
        return `
          <section class="mk-targeting-assistant is-ready is-self" aria-live="polite">
            <div class="mk-targeting-assistant-heading">
              <i class="fa-solid fa-user" aria-hidden="true"></i>
              <strong>${escapeHtml(title)}</strong>
            </div>
            <p>${escapeHtml(prompt)}</p>
          </section>
        `;
      }

      const prompt = localize(
        "MK_SHADOWDARK.targeting.choose",
        "Choose at least one target on the canvas with the Target tool (T)."
      );
      return `
        <section class="mk-targeting-assistant is-empty" aria-live="polite">
          <div class="mk-targeting-assistant-heading">
            <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
            <strong>${escapeHtml(title)}</strong>
          </div>
          <p>${escapeHtml(prompt)}</p>
        </section>
      `;
    }

    const primaryLabel = self
      ? localize("MK_SHADOWDARK.targeting.caster", "Caster")
      : localize("MK_SHADOWDARK.targeting.primary", "Primary");
    const targetCards = targets.map((target, index) => `
      <div class="mk-targeting-assistant-target" title="${escapeHtml(target.name)}">
        <img src="${escapeHtml(target.img)}" alt="">
        <span>${escapeHtml(target.name)}</span>
        ${index === 0 ? `<small>${escapeHtml(primaryLabel)}</small>` : ""}
      </div>
    `).join("");

    const headingText = self ? title : `${title} (${targets.length})`;

    return `
      <section class="mk-targeting-assistant is-ready" aria-live="polite">
        <div class="mk-targeting-assistant-heading">
          <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
          <strong>${escapeHtml(headingText)}</strong>
        </div>
        <div class="mk-targeting-assistant-list">${targetCards}</div>
      </section>
    `;
  }

  function updateDialogTargets(dialog, { prompt = false } = {}) {
    if (!canAssist(dialog?.config) || !dialog?.element) return [];

    const self = isSelfRangeSpell(dialog.config);
    const casterTarget = self ? selfTarget(dialog.config) : null;
    const targets = self ? (casterTarget ? [casterTarget] : []) : selectedTargets();
    applyTargetsToRollConfig(dialog.config, targets);
    Hooks.callAll(TARGETS_CHANGED_HOOK, dialog.config, targets);

    let panel = dialog.element.querySelector(".mk-targeting-assistant");
    const panelWrapper = document.createElement("div");
    panelWrapper.innerHTML = targetPanelHtml(targets, { self }).trim();
    const replacement = panelWrapper.firstElementChild;

    if (panel) panel.replaceWith(replacement);
    else {
      const footer = dialog.element.querySelector(".roll-footer");
      if (footer) footer.before(replacement);
      else dialog.element.append(replacement);
    }

    const submit = dialog.element.querySelector('button[type="submit"]');
    if (submit) {
      const requiresTarget = !self;
      submit.disabled = requiresTarget && targets.length === 0;
      submit.setAttribute("aria-disabled", String(requiresTarget && targets.length === 0));
    }

    const heading = dialog.element.querySelector("h2");
    if (heading && dialog.config.heading) heading.textContent = dialog.config.heading;

    if (prompt && !self && !targets.length && !PROMPTED_DIALOGS.has(dialog)) {
      PROMPTED_DIALOGS.add(dialog);
      ui.notifications?.warn?.(localize(
        "MK_SHADOWDARK.targeting.warning",
        "Choose a valid target before rolling. Your selected targets will appear in the roll window."
      ));
    }

    return targets;
  }

  function install() {
    const prototype = globalThis.shadowdark?.apps?.RollDialogSD?.prototype;
    if (!prototype || typeof prototype._onRender !== "function" || typeof prototype._onSubmit !== "function") {
      console.warn(`${MODULE_ID} | ${SUBMODULE} could not find Shadowdark's roll dialog class.`);
      return false;
    }

    const originalRender = prototype._onRender;
    if (!originalRender[WRAPPED_RENDER]) {
      const wrappedRender = function(...args) {
        const result = originalRender.apply(this, args);
        if (!canAssist(this.config)) return result;

        ACTIVE_DIALOGS.add(this);
        if (!CLOSE_LISTENER_INSTALLED.has(this)) {
          CLOSE_LISTENER_INSTALLED.add(this);
          this.addEventListener("close", () => ACTIVE_DIALOGS.delete(this), { once: true });
        }
        updateDialogTargets(this, { prompt: true });
        return result;
      };

      Object.defineProperty(wrappedRender, WRAPPED_RENDER, { value: true });
      Object.defineProperty(wrappedRender, "name", { value: originalRender.name, configurable: true });
      prototype._onRender = wrappedRender;
    }

    const originalSubmit = prototype._onSubmit;
    if (!originalSubmit[WRAPPED_SUBMIT]) {
      const wrappedSubmit = function(event) {
        if (canAssist(this.config)) {
          const targets = updateDialogTargets(this);
          if (!targets.length && !isSelfRangeSpell(this.config)) {
            event.preventDefault();
            ui.notifications?.warn?.(localize(
              "MK_SHADOWDARK.targeting.warning",
              "Choose a valid target before rolling. Your selected targets will appear in the roll window."
            ));
            return;
          }
        }

        return originalSubmit.call(this, event);
      };

      Object.defineProperty(wrappedSubmit, WRAPPED_SUBMIT, { value: true });
      Object.defineProperty(wrappedSubmit, "name", { value: originalSubmit.name, configurable: true });
      prototype._onSubmit = wrappedSubmit;
    }

    Hooks.on("targetToken", user => {
      if (user?.id !== game.user?.id) return;
      setTimeout(() => {
        for (const dialog of ACTIVE_DIALOGS) {
          if (!dialog.element?.isConnected) {
            ACTIVE_DIALOGS.delete(dialog);
            continue;
          }
          updateDialogTargets(dialog);
        }
      }, 0);
    });

    log("Installed live attack and spell targeting prompts");
    return true;
  }

  Hooks.once("ready", () => {
    if (game.system?.id !== "shadowdark") return;
    install();
  });
})();
