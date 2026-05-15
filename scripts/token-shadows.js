/*
 * Shadowdark Extras - Token Shadows
 * Foundry VTT v12
 *
 * Draws configurable blurred oval shadows under tokens.
 * Settings are registered in scripts/settings.js.
 */

(() => {
  const MODULE_ID = "shadowdark-extras";
  const MODULE_VERSION = "1.0.0";
  const SUBMODULE = "TokenShadows";

  const SHADOW_PROP = "_sdeTokenShadow";
  const SHADOW_FILTER_PROP = "_sdeTokenShadowBlurFilter";
  const SHADOW_NAME = "sde-token-shadow";

  function log(...args) {
    console.log(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} |`, ...args);
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function getSetting(key, fallback) {
    try {
      if (!game.settings?.settings?.has(`${MODULE_ID}.${key}`)) return fallback;
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
  }

  function getBlurFilterClass() {
    return PIXI.filters?.BlurFilter ?? PIXI.BlurFilter ?? null;
  }

  function refreshTokenShadowsNow() {
    if (!canvas?.ready || !canvas.tokens) return;

    for (const token of canvas.tokens.placeables ?? []) {
      refreshTokenShadow(token);
    }
  }

  function removeTokenShadow(token) {
    if (!token) return;

    const shadow = token[SHADOW_PROP];

    if (shadow && !shadow.destroyed) {
      if (shadow.parent) shadow.parent.removeChild(shadow);

      shadow.filters = null;

      if (shadow[SHADOW_FILTER_PROP]?.destroy) {
        try {
          shadow[SHADOW_FILTER_PROP].destroy();
        } catch (_err) {
          // Ignore filter cleanup errors.
        }
      }

      shadow[SHADOW_FILTER_PROP] = null;

      shadow.destroy({
        children: true,
        texture: false,
        baseTexture: false
      });
    }

    token[SHADOW_PROP] = null;
  }

  function ensureTokenShadow(token) {
    if (!token || token.destroyed) return null;

    let shadow = token[SHADOW_PROP];

    if (shadow && !shadow.destroyed) {
      return shadow;
    }

    shadow = new PIXI.Graphics();
    shadow.name = SHADOW_NAME;
    shadow.interactive = false;
    shadow.interactiveChildren = false;
    shadow.eventMode = "none";

    token[SHADOW_PROP] = shadow;

    try {
      token.addChildAt(shadow, 0);
    } catch (_err) {
      token.addChild(shadow);
    }

    return shadow;
  }

  function drawTokenShadow(token) {
    if (!token || token.destroyed) return;

    const enabled = Boolean(getSetting("tokenShadowsEnabled", true));

    if (!enabled) {
      removeTokenShadow(token);
      return;
    }

    const shadow = ensureTokenShadow(token);
    if (!shadow) return;

    const gridSize = canvas?.grid?.size ?? 100;

    const tokenW = token.w ?? gridSize;
    const tokenH = token.h ?? gridSize;

    const widthFactor = clampNumber(
      getSetting("tokenShadowWidthFactor", 0.5),
      0.1,
      2,
      0.5
    );

    const heightGridFactor = clampNumber(
      getSetting("tokenShadowHeightGridFactor", 0.05),
      0.01,
      1,
      0.05
    );

    const offsetYFactor = clampNumber(
      getSetting("tokenShadowOffsetYFactor", 0.3),
      -1,
      2,
      0.3
    );

    const alpha = clampNumber(
      getSetting("tokenShadowAlpha", 0.7),
      0,
      1,
      0.7
    );

    const blurStrength = clampNumber(
      getSetting("tokenShadowBlur", 8),
      0,
      40,
      8
    );

    const blurQuality = clampNumber(
      getSetting("tokenShadowBlurQuality", 2),
      1,
      4,
      2
    );

    const radiusX = Math.max(2, tokenW * widthFactor);
    const radiusY = Math.max(1, gridSize * heightGridFactor);

    const x = tokenW / 2;
    const y = tokenH - radiusY * offsetYFactor;

    shadow.clear();

    if (alpha <= 0) {
      shadow.visible = false;
      shadow.filters = null;
      return;
    }

    shadow.visible = true;
    shadow.alpha = 1;

    shadow.beginFill(0x000000, alpha);
    shadow.drawEllipse(x, y, radiusX, radiusY);
    shadow.endFill();

    applyBlurToShadow(shadow, blurStrength, blurQuality);
  }

  function applyBlurToShadow(shadow, blurStrength, blurQuality) {
    if (!shadow || shadow.destroyed) return;

    if (blurStrength <= 0) {
      shadow.filters = null;
      return;
    }

    const BlurFilter = getBlurFilterClass();

    if (!BlurFilter) {
      shadow.filters = null;
      warn("PIXI BlurFilter was not found. Blur disabled.");
      return;
    }

    try {
      let blurFilter = shadow[SHADOW_FILTER_PROP];

      if (!blurFilter) {
        blurFilter = new BlurFilter();
        shadow[SHADOW_FILTER_PROP] = blurFilter;
      }

      if ("blur" in blurFilter) blurFilter.blur = blurStrength;
      if ("blurX" in blurFilter) blurFilter.blurX = blurStrength;
      if ("blurY" in blurFilter) blurFilter.blurY = blurStrength;
      if ("quality" in blurFilter) blurFilter.quality = blurQuality;

      blurFilter.padding = Math.ceil(blurStrength * 3);

      shadow.filters = [blurFilter];
    } catch (err) {
      shadow.filters = null;
      warn("Could not apply blur filter.", err);
    }
  }

  function refreshTokenShadow(token) {
    if (!canvas?.ready) return;
    if (!token || token.destroyed) return;

    drawTokenShadow(token);
  }

  function refreshTokenShadowFromDocument(tokenDocument) {
    const token = tokenDocument?.object;
    if (!token) return;

    refreshTokenShadow(token);
  }

  Hooks.once("ready", () => {
    log("ready");

    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.refreshTokenShadows = refreshTokenShadowsNow;
      mod.api.removeTokenShadow = removeTokenShadow;
    }

    if (canvas?.ready) {
      refreshTokenShadowsNow();
    }
  });

  Hooks.on("canvasReady", () => {
    refreshTokenShadowsNow();
  });

  Hooks.on("drawToken", token => {
    refreshTokenShadow(token);
  });

  Hooks.on("refreshToken", token => {
    refreshTokenShadow(token);
  });

  Hooks.on("updateToken", tokenDocument => {
    refreshTokenShadowFromDocument(tokenDocument);
  });

  Hooks.on("createToken", tokenDocument => {
    window.setTimeout(() => {
      refreshTokenShadowFromDocument(tokenDocument);
    }, 50);
  });

  Hooks.on("deleteToken", tokenDocument => {
    const token = tokenDocument?.object;
    if (token) removeTokenShadow(token);
  });
})();