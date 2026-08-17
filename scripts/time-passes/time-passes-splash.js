import {
  createTimePassesSplashEvent,
  isTimePassesSplashEvent,
} from "./time-passes-socket.js";

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
  showSplash(event.payload);
  game.socket?.emit?.(SOCKET_CHANNEL, event);
  return true;
}

async function presentTimePasses(options = {}) {
  if (!game.user?.isGM) {
    ui?.notifications?.warn?.("Only the GM can trigger Time Passes.");
    return null;
  }

  if (!setting("timePassesEnabled", true)) return null;

  const payload = buildTimePassesPayload(options);
  const presented = await broadcastSplash(payload);

  return {
    presented: Boolean(presented),
    payload,
  };
}

// Compatibility alias for callers that used the old API. Time Passes is now
// presentation-only: it never rolls encounter dice and never mutates time.
const timePasses = presentTimePasses;

function exposeTimePassesApi() {
  const module = game.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.timePasses = {
    version: 2,
    presentationOnly: true,
    timePasses,
    present: presentTimePasses,
    showSplash,
    broadcastSplash,
    buildPayload: buildTimePassesPayload,
  };

  return module.api.timePasses;
}

function registerTimePasses() {
  Hooks.once("ready", () => {
    installSocketListenerOnce();
    exposeTimePassesApi();
    log("Ready (presentation only).");
  });
}

registerTimePasses();

export {
  MODULE_ID,
  SOCKET_CHANNEL,
  buildTimePassesPayload,
  showSplash,
  installSocketListenerOnce,
  broadcastSplash,
  presentTimePasses,
  timePasses,
  exposeTimePassesApi,
  registerTimePasses,
};
