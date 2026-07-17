(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Time Passes Splash";
  const FLAG_KEY = "timePassesSplash";
  const HOOK_FLAG = "__sdxTimePassesSplashHookInstalled";
  const SEEN_FLAG = "__sdxTimePassesSplashSeenIds";

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

    // Remove existing splash
    const old = document.getElementById("sdx-time-passes-splash");
    if (old) old.remove();

    const wrap = document.createElement("div");
    wrap.id = "sdx-time-passes-splash";
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

    // Title line as flex row so skull stays on the same line
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

    // Progress bar (optional)
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

  function installChatListenerOnce() {
    if (window[HOOK_FLAG]) return;
    window[HOOK_FLAG] = true;
    window[SEEN_FLAG] = window[SEEN_FLAG] ?? new Set();

    Hooks.on("createChatMessage", (msg) => {
      try {
        if (!msg) return;
        const payload = msg.getFlag?.(MODULE_ID, FLAG_KEY);
        if (!payload) return;

        const seen = window[SEEN_FLAG];
        if (seen.has(msg.id)) return;
        seen.add(msg.id);

        showSplash(payload);
      } catch (e) {
        console.error(`${MODULE_ID} | ${SUBMODULE} | handler error:`, e);
      }
    });

    log("Chat listener installed.");
  }

  async function broadcastSplash(payload) {
    // helper message to deliver flags to all clients
    const msg = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      content: `<span style="display:none">sdx-time-passes</span>`,
      flags: { [MODULE_ID]: { [FLAG_KEY]: payload } }
    });

    // clean up
    setTimeout(() => {
      msg?.delete?.().catch(() => {});
    }, 3000);
  }

  // Encounter rule: any d6 showing 1 triggers
  function rollHasAnyDieResult(roll, faces, target) {
    try {
      const DieTerm = foundry?.dice?.terms?.Die;
      for (const term of (roll?.terms ?? [])) {
        const isDie = DieTerm ? (term instanceof DieTerm) : (term?.results && Number.isFinite(term?.faces));
        if (!isDie) continue;

        const f = Number(term.faces);
        if (f !== Number(faces)) continue;

        for (const r of (term.results ?? [])) {
          const val = Number(r?.result);
          if (val === Number(target)) return true;
        }
      }
    } catch (_e) {
      // ignore
    }
    return false;
  }

  /**
   * GM trigger. Reads settings by default, but can be overridden by opts.
   * opts can include:
   *  preText, encounterText, preDurationMs, encounterDurationMs, preShowProgress,
   *  rollFormula, rollFlavor,
   *  fontFamily, titleFontSizePx,
   *  encounterShowSkull, skullPath, skullSizePx
   */
  async function timePasses(opts = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn("Only the GM can trigger Time Passes.");
      return;
    }

    if (!setting("timePassesEnabled", true)) return;

    const preText = opts.preText ?? setting("timePassesPreText", "time passes...");
    const encounterText = opts.encounterText ?? setting("timePassesEncounterText", "ENCOUNTER!");

    const preDurationMs = Number(opts.preDurationMs ?? setting("timePassesPreDurationMs", 2000));
    const encounterDurationMs = Number(opts.encounterDurationMs ?? setting("timePassesEncounterDurationMs", 2000));
    const preShowProgress = Boolean(opts.preShowProgress ?? setting("timePassesPreShowProgress", true));

    const rollFormula = String(opts.rollFormula ?? setting("timePassesRollFormula", "1d6")).trim() || "1d6";
    const rollFlavor = String(opts.rollFlavor ?? setting("timePassesRollFlavor", "⏳"));

    const fontFamily = String(opts.fontFamily ?? setting("timePassesFontFamily", "var(--font-primary, serif)")) || "var(--font-primary, serif)";
    const titleFontSizePx = Number(opts.titleFontSizePx ?? setting("timePassesTitleFontSizePx", 44)) || 44;

    const encounterShowSkull = Boolean(opts.encounterShowSkull ?? setting("timePassesEncounterShowSkull", true));
    const skullPath = String(opts.skullPath ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg"));
    const skullSizePx = Number(opts.skullSizePx ?? setting("timePassesSkullSizePx", 34)) || 34;

    // 1) pre-splash
    await broadcastSplash({
      title: preText,
      durationMs: preDurationMs,
      showProgress: preShowProgress,
      fontFamily,
      titleFontSizePx,
      showSkull: false
    });

    // 2) wait for bar
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, preDurationMs)));

    // 3) roll publicly (3D dice)
    const roll = await (new Roll(rollFormula)).evaluate();

    const PUBLIC = CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
    await roll.toMessage(
      { speaker: ChatMessage.getSpeaker(), flavor: rollFlavor },
      { rollMode: PUBLIC }
    );

    // 4) encounter: any d6 showing 1
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
        skullSizePx
      });
    }

    return { roll, isEncounter };
  }

  Hooks.once("ready", () => {
    installChatListenerOnce();

    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.timePasses = { timePasses, showSplash, broadcastSplash };
    }

    log("Ready.");
  });

})();
