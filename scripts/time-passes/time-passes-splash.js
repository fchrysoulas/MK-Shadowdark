const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Time Passes Splash";
const FLAG_KEY = "timePassesSplash";

let chatListenerInstalled = false;
const seenMessageIds = new Set();

function log(...args) {
  console.log(`${MODULE_ID} | ${SUBMODULE} |`, ...args);
}

function setting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

function buildTimePassesPayload(options = {}) {
  const title = String(
    options.title
    ?? options.preText
    ?? setting("timePassesPreText", "time passes...")
  );
  const durationMs = Math.max(
    200,
    Number(
      options.durationMs
      ?? options.preDurationMs
      ?? setting("timePassesPreDurationMs", 2000)
    ) || 2000
  );
  const showProgress = Boolean(
    options.showProgress
    ?? options.preShowProgress
    ?? setting("timePassesPreShowProgress", true)
  );
  const fontFamily = String(
    options.fontFamily
    ?? setting("timePassesFontFamily", "var(--font-primary, serif)")
  ) || "var(--font-primary, serif)";
  const titleFontSizePx = Number(
    options.titleFontSizePx
    ?? setting("timePassesTitleFontSizePx", 44)
  ) || 44;
  const showSkull = Boolean(options.showSkull ?? false);
  const skullPath = String(
    options.skullPath
    ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg")
  );
  const skullSizePx = Number(
    options.skullSizePx
    ?? setting("timePassesSkullSizePx", 34)
  ) || 34;

  return {
    title,
    durationMs,
    showProgress,
    fontFamily,
    titleFontSizePx,
    showSkull,
    skullPath,
    skullSizePx,
  };
}

function showSplash(payload = {}) {
  const title = String(payload.title ?? "");
  const durationMs = Math.max(200, Number(payload.durationMs ?? 2000) || 2000);
  const showProgress = Boolean(payload.showProgress ?? false);
  const fontFamily = String(
    payload.fontFamily
    ?? setting("timePassesFontFamily", "var(--font-primary, serif)")
  ) || "var(--font-primary, serif)";
  const titleFontSizePx = Number(
    payload.titleFontSizePx
    ?? setting("timePassesTitleFontSizePx", 44)
  ) || 44;
  const showSkull = Boolean(payload.showSkull ?? false);
  const skullPath = String(
    payload.skullPath
    ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg")
  );
  const skullSizePx = Number(
    payload.skullSizePx
    ?? setting("timePassesSkullSizePx", 34)
  ) || 34;

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
    const progress = document.createElement("div");
    progress.style.cssText = `
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

    progress.appendChild(fill);
    card.appendChild(progress);
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

  return wrap;
}

function installChatListenerOnce() {
  if (chatListenerInstalled || !globalThis.Hooks?.on) return;
  chatListenerInstalled = true;

  Hooks.on("createChatMessage", message => {
    try {
      const payload = message?.getFlag?.(MODULE_ID, FLAG_KEY);
      if (!payload) return;
      if (message.id && seenMessageIds.has(message.id)) return;
      if (message.id) seenMessageIds.add(message.id);
      showSplash(payload);
    } catch (handlerError) {
      console.error(`${MODULE_ID} | ${SUBMODULE} | chat handler error:`, handlerError);
    }
  });

  log("Chat listener installed.");
}

async function broadcastSplash(payload) {
  if (!game.user?.isGM) {
    ui?.notifications?.warn?.("Only the GM can broadcast Time Passes.");
    return false;
  }

  const message = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER
      ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER
      ?? 0,
    content: '<span style="display:none">mk-time-passes</span>',
    flags: { [MODULE_ID]: { [FLAG_KEY]: payload } },
  });

  setTimeout(() => {
    message?.delete?.().catch(() => {});
  }, 3000);
  return true;
}

function normalizeDiceCount(value, fallback = 1) {
  const count = Number(value);
  if (Number.isInteger(count) && count >= 1 && count <= 3) return count;
  return Math.min(3, Math.max(1, Number(fallback) || 1));
}

function configuredDiceCount() {
  const match = String(setting("timePassesRollFormula", "1d6")).match(/^([123])d6$/i);
  return normalizeDiceCount(match?.[1], 1);
}

function rollContainsResult(roll, faces, target) {
  try {
    const DieTerm = globalThis.foundry?.dice?.terms?.Die;
    for (const term of roll?.terms ?? []) {
      const isDie = DieTerm
        ? term instanceof DieTerm
        : Array.isArray(term?.results) && Number.isFinite(Number(term?.faces));
      if (!isDie || Number(term.faces) !== Number(faces)) continue;
      if (term.results.some(result => Number(result?.result) === Number(target))) return true;
    }
  } catch (_error) {
  }
  return false;
}

function buildEncounterCuePayload(options = {}) {
  return {
    title: String(
      options.encounterText
      ?? setting("timePassesEncounterText", "ENCOUNTER!")
    ),
    durationMs: Math.max(
      200,
      Number(
        options.encounterDurationMs
        ?? setting("timePassesEncounterDurationMs", 2000)
      ) || 2000
    ),
    showProgress: false,
    fontFamily: String(
      options.fontFamily
      ?? setting("timePassesFontFamily", "var(--font-primary, serif)")
    ) || "var(--font-primary, serif)",
    titleFontSizePx: Number(
      options.titleFontSizePx
      ?? setting("timePassesTitleFontSizePx", 44)
    ) || 44,
    showSkull: Boolean(
      options.encounterShowSkull
      ?? setting("timePassesEncounterShowSkull", true)
    ),
    skullPath: String(
      options.skullPath
      ?? setting("timePassesSkullIconPath", "icons/svg/skull.svg")
    ),
    skullSizePx: Number(
      options.skullSizePx
      ?? setting("timePassesSkullSizePx", 34)
    ) || 34,
  };
}

async function promptDiceCount(defaultCount = configuredDiceCount()) {
  const selected = normalizeDiceCount(defaultCount, 1);
  return Dialog.wait({
    title: "Time Passes - Dice",
    content: `
      <form>
        <p>How many d6 should be rolled as time passes?</p>
        <p class="notes">A result of 1 shows the encounter cue, but never automates an encounter.</p>
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

async function timePasses(options = {}) {
  if (!game.user?.isGM) {
    ui?.notifications?.warn?.("Only the GM can trigger Time Passes.");
    return null;
  }

  if (!setting("timePassesEnabled", true)) return null;

  let diceCount = options.diceCount;
  if (diceCount === undefined) {
    diceCount = await promptDiceCount(configuredDiceCount());
    if (!diceCount) return null;
  }
  diceCount = normalizeDiceCount(diceCount, configuredDiceCount());

  const payload = buildTimePassesPayload(options);
  const presented = await broadcastSplash(payload);
  await new Promise(resolve => setTimeout(resolve, payload.durationMs));

  const roll = await new Roll(`${diceCount}d6`).evaluate();
  const rollMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
  const flavor = String(options.rollFlavor ?? setting("timePassesRollFlavor", "⏳"));
  await roll.toMessage(
    { speaker: ChatMessage.getSpeaker(), flavor },
    { rollMode }
  );

  const encounterCueShown = rollContainsResult(roll, 6, 1);
  if (encounterCueShown) {
    await broadcastSplash(buildEncounterCuePayload(options));
  }

  return {
    presented: Boolean(presented),
    payload,
    roll,
    diceCount,
    encounterCueShown,
  };
}

function exposeTimePassesApi() {
  const module = game.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.timePasses = {
    version: 3,
    standaloneRoll: true,
    encounterLinked: false,
    timePasses,
    roll: timePasses,
    showSplash,
    broadcastSplash,
    buildPayload: buildTimePassesPayload,
    buildEncounterCuePayload,
    promptDiceCount,
  };

  return module.api.timePasses;
}

function registerTimePasses() {
  Hooks.once("ready", () => {
    installChatListenerOnce();
    exposeTimePassesApi();
    log("Ready (standalone roll; encounter-independent).");
  });
}

registerTimePasses();

export {
  MODULE_ID,
  FLAG_KEY,
  buildTimePassesPayload,
  showSplash,
  installChatListenerOnce,
  broadcastSplash,
  normalizeDiceCount,
  rollContainsResult,
  buildEncounterCuePayload,
  promptDiceCount,
  timePasses,
  exposeTimePassesApi,
  registerTimePasses,
};
