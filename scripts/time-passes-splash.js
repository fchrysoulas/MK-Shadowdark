import {
  createTimePassesSplashEvent,
  isTimePassesSplashEvent
} from "./time-passes-socket.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Time Passes Splash";
  const SOCKET_CHANNEL = `module.${MODULE_ID}`;
  let socketListenerInstalled = false;

  function log(...args) {
    console.log(`${MODULE_ID} | ${SUBMODULE} |`, ...args);
  }

  function setting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_e) {
      return fallback;
    }
  }

  function showSplash(payload = {}) {
    const title = payload.title ?? "";
    const durationMs = Math.max(200, Number(payload.durationMs ?? 2000));
    const showProgress = Boolean(payload.showProgress ?? false);

    const fontFamily =
      String(payload.fontFamily ?? setting("timePassesFontFamily", "var(--font-primary, serif)")) ||
      "var(--font-primary, serif)";
    const titleFontSizePx = Number(payload.titleFontSizePx ?? setting("timePassesTitleFontSizePx", 44)) || 44;

    const showSkull = Boolean(payload.showSkull ?? false);
    const skullPath = String(payload.skullPath ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg"));
    const skullSizePx = Number(payload.skullSizePx ?? setting("timePassesSkullSizePx", 34)) || 34;

    const old = document.getElementById("mk-time-passes-splash");
    if (old) old.remove();

    const wrap = document.createElement("div");
    wrap.id = "mk-time-passes-splash";
    wrap.style.cssText = `
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.75);
      z-index: 100000;
      opacity: 0;
      transition: opacity 180ms ease;
      pointer-events: none;
    `;

    const card = document.createElement("div");
    card.style.cssText = `
      max-width: 900px;
      padding: 26px 34px 22px 34px;
      border: 2px solid var(--color-border-dark, #3a3a3a);
      border-radius: 16px;
      background: rgba(20,20,20,0.92);
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      text-align: center;
      font-family: ${fontFamily};
    `;

    const titleRow = document.createElement("div");
    titleRow.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: ${showProgress ? "12px" : "0px"};
    `;

    const titleText = document.createElement("span");
    titleText.textContent = title;
    titleText.style.cssText = `
      font-size: ${titleFontSizePx}px;
      letter-spacing: 2px;
      color: var(--color-text-light-highlight, #f2f2f2);
      text-shadow: 0 2px 8px rgba(0,0,0,0.9);
      text-transform: none;
      line-height: 1.1;
    `;
    titleRow.appendChild(titleText);

    if (showSkull) {
      const img = document.createElement("img");
      img.src = skullPath;
      img.alt = "skull";
      img.style.cssText = `
        width: ${skullSizePx}px;
        height: ${skullSizePx}px;
        vertical-align: middle;
        filter: drop-shadow(0 2px 10px rgba(0,0,0,0.85));
        opacity: 0.95;
      `;
      titleRow.appendChild(img);
    }

    card.appendChild(titleRow);

    let fill = null;
    if (showProgress) {
      const prog = document.createElement("div");
      prog.style.cssText = `
        width: 420px;
        max-width: 70vw;
        height: 6px;
        margin: 0 auto;
        background: rgba(255,255,255,0.14);
        border-radius: 999px;
        overflow: hidden;
      `;

      fill = document.createElement("div");
      fill.style.cssText = `
        height: 100%;
        width: 0%;
        background: rgba(255,255,255,0.78);
        border-radius: 999px;
        transition: width ${durationMs}ms linear;
      `;

      prog.appendChild(fill);
      card.appendChild(prog);
    }

    wrap.appendChild(card);
    document.body.appendChild(wrap);

    requestAnimationFrame(() => {
      wrap.style.opacity = "1";
      if (fill) fill.style.width = "100%";
    });

    setTimeout(() => {
      wrap.style.opacity = "0";
      setTimeout(() => wrap.remove(), 220);
    }, durationMs);
  }

  function installSocketListenerOnce() {
    if (socketListenerInstalled || !game?.socket?.on) return;
    socketListenerInstalled = true;

    game.socket.on(SOCKET_CHANNEL, event => {
      try {
        if (!isTimePassesSplashEvent(event)) return;
        if (event.senderId && event.senderId === game.user?.id) return;
        showSplash(event.payload);
      } catch (handlerError) {
        console.error(`${MODULE_ID} | ${SUBMODULE} | socket handler error:`, handlerError);
      }
    });

    log("Socket listener installed.");
  }

  async function broadcastSplash(payload) {
    if (!game.user?.isGM) {
      ui?.notifications?.warn?.("Only the GM can broadcast Time Passes.");
      return false;
    }

    const event = createTimePassesSplashEvent(payload, game.user?.id ?? null);

    // Render immediately for the sender, then notify every other connected client.
    showSplash(event.payload);
    game.socket?.emit?.(SOCKET_CHANNEL, event);
    return true;
  }

  function rollHasAnyDieResult(roll, faces, target) {
    try {
      const DieTerm = globalThis.foundry?.dice?.terms?.Die;
      for (const term of roll?.terms ?? []) {
        const isDie = DieTerm ? term instanceof DieTerm : term?.results && Number.isFinite(term?.faces);
        if (!isDie || Number(term.faces) !== Number(faces)) continue;

        for (const result of term.results ?? []) {
          if (Number(result?.result) === Number(target)) return true;
        }
      }
    } catch (_error) {
    }
    return false;
  }

  async function promptDiceCount(defaultCount = 1) {
    const selected = Math.min(3, Math.max(1, Number(defaultCount) || 1));
    return Dialog.wait({
      title: "Time Passes - Encounter Dice",
      content: `
        <form>
          <p>How many d6 should be rolled for the Time Passes encounter check?</p>
          <p class="notes">An encounter occurs if any die shows 1.</p>
        </form>
      `,
      buttons: {
        one: {
          icon: '<i class="fas fa-dice-one"></i>',
          label: "1d6",
          callback: () => 1,
        },
        two: {
          icon: '<i class="fas fa-dice-two"></i>',
          label: "2d6",
          callback: () => 2,
        },
        three: {
          icon: '<i class="fas fa-dice-three"></i>',
          label: "3d6",
          callback: () => 3,
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => null,
        },
      },
      default: selected === 3 ? "three" : selected === 2 ? "two" : "one",
      close: () => null,
    }, { width: 430 });
  }

  async function timePasses(opts = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can trigger Time Passes.");
      return null;
    }

    if (!setting("timePassesEnabled", true)) return null;

    const preText = opts.preText ?? setting("timePassesPreText", "time passes...");
    const encounterText = opts.encounterText ?? setting("timePassesEncounterText", "ENCOUNTER!");
    const preDurationMs = Number(opts.preDurationMs ?? setting("timePassesPreDurationMs", 2000));
    const encounterDurationMs = Number(opts.encounterDurationMs ?? setting("timePassesEncounterDurationMs", 2000));
    const preShowProgress = Boolean(opts.preShowProgress ?? setting("timePassesPreShowProgress", true));

    let diceCount = opts.diceCount;
    if (!opts.rollFormula && diceCount === undefined) {
      const configured = String(setting("timePassesRollFormula", "1d6")).match(/^([123])d6$/i)?.[1] ?? 1;
      diceCount = await promptDiceCount(configured);
      if (!diceCount) return null;
    }
    diceCount = Math.min(3, Math.max(1, Number(diceCount) || 1));
    const rollFormula = String(opts.rollFormula ?? `${diceCount}d6`).trim() || `${diceCount}d6`;
    const rollFlavor = String(opts.rollFlavor ?? setting("timePassesRollFlavor", "⏳"));

    const fontFamily = String(opts.fontFamily ?? setting("timePassesFontFamily", "var(--font-primary, serif)")) || "var(--font-primary, serif)";
    const titleFontSizePx = Number(opts.titleFontSizePx ?? setting("timePassesTitleFontSizePx", 44)) || 44;
    const encounterShowSkull = Boolean(opts.encounterShowSkull ?? setting("timePassesEncounterShowSkull", true));
    const skullPath = String(opts.skullPath ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg"));
    const skullSizePx = Number(opts.skullSizePx ?? setting("timePassesSkullSizePx", 34)) || 34;

    await broadcastSplash({
      title: preText,
      durationMs: preDurationMs,
      showProgress: preShowProgress,
      fontFamily,
      titleFontSizePx,
      showSkull: false,
    });

    await new Promise(resolve => setTimeout(resolve, Math.max(0, preDurationMs)));

    const roll = await new Roll(rollFormula).evaluate();
    const publicMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
    await roll.toMessage(
      { speaker: ChatMessage.getSpeaker(), flavor: rollFlavor },
      { rollMode: publicMode }
    );

    const isEncounter = rollHasAnyDieResult(roll, 6, 1);
    if (isEncounter) {
      await broadcastSplash({
        title: encounterText,
        durationMs: encounterDurationMs,
        showProgress: false,
        fontFamily,
        titleFontSizePx,
        showSkull: encounterShowSkull,
        skullPath,
        skullSizePx,
      });
    }

    return { roll, isEncounter, diceCount };
  }

  Hooks.once("ready", () => {
    installSocketListenerOnce();

    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api ??= {};
      mod.api.timePasses = { timePasses, showSplash, broadcastSplash, promptDiceCount };
    }

    log("Ready.");
  });
})();
