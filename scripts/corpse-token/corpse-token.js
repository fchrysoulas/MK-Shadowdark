import { isCorpseLifecycleActive } from "./corpse-token-state.js";

const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Corpse Token";
const FLAG_KEY = "corpseToken";

const HP_PATH = "system.attributes.hp.value";

const SETTINGS = {
  enabled: "corpseTokenEnabled",
  corpseImage: "corpseTokenImage",
  onlyNpcs: "corpseTokenOnlyNpcs",
  width: "corpseTokenWidth",
  height: "corpseTokenHeight",
  scale: "corpseTokenScale",
  postChatMessage: "corpseTokenPostChatMessage",
  scanOnCanvasReady: "corpseTokenScanOnCanvasReady",
  autoRestoreWhenHealed: "corpseTokenAutoRestoreWhenHealed",
  alignVisualBottom: "corpseTokenAlignVisualBottom",
  yOffset: "corpseTokenYOffset",
  applyDelayMs: "corpseTokenApplyDelayMs"
};

const DEFAULTS = {
  [SETTINGS.enabled]: true,
  [SETTINGS.corpseImage]: "",
  [SETTINGS.onlyNpcs]: true,
  [SETTINGS.width]: 1,
  [SETTINGS.height]: 1,
  [SETTINGS.scale]: 0.7,
  [SETTINGS.postChatMessage]: false,
  [SETTINGS.scanOnCanvasReady]: false,
  [SETTINGS.autoRestoreWhenHealed]: false,
  [SETTINGS.alignVisualBottom]: true,
  [SETTINGS.yOffset]: 0,
  [SETTINGS.applyDelayMs]: 750
};

const NPC_TYPES = ["NPC", "npc"];
const DEATH_POSITION_CACHE_TTL_MS = 10_000;

let scanTimer = null;
let updateInProgress = false;
let missingCorpseImageWarningShown = false;
const deathPositionCache = new Map();
const imageAlphaBoundsCache = new Map();
const actorProcessingTimers = new Map();
const tokenProcessingTimers = new Map();

function log(...args) {
  console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
}

function getModuleVersion() {
  const mod = game.modules.get(MODULE_ID);
  return mod?.version ?? mod?.data?.version ?? "unknown";
}

function warn(...args) {
  console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
}

function error(...args) {
  console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getSetting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch (_err) {
    return DEFAULTS[key];
  }
}

function getCorpseImageSetting() {
  return String(getSetting(SETTINGS.corpseImage) ?? "").trim();
}

function hasConfiguredCorpseImage({ notify = true } = {}) {
  const corpseImage = getCorpseImageSetting();
  if (corpseImage) return true;

  if (!missingCorpseImageWarningShown) {
    missingCorpseImageWarningShown = true;
    const message = "Corpse Token image is not configured. Select an image in the MK-Shadowdark module settings.";
    warn(message);
    if (notify) ui?.notifications?.warn?.(message);
  }

  return false;
}

function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getHp(actor) {
  const value = foundry.utils.getProperty(actor, HP_PATH);
  const hp = Number(value);
  return Number.isFinite(hp) ? hp : null;
}

function isNpc(actor) {
  return NPC_TYPES.includes(actor?.type);
}

function shouldProcessActor(actor) {
  if (!actor) return false;
  if (getSetting(SETTINGS.onlyNpcs) && !isNpc(actor)) return false;
  return true;
}

function tokenName(tokenOrDocument) {
  return tokenOrDocument?.name
    ?? tokenOrDocument?.actor?.name
    ?? tokenOrDocument?.document?.name
    ?? "Unknown Token";
}

function getGridSize() {
  const size = canvas?.grid?.size
    ?? canvas?.dimensions?.size
    ?? canvas?.scene?.grid?.size
    ?? game.scenes?.current?.grid?.size
    ?? 100;

  return toFiniteNumber(size, 100) > 0 ? Number(size) : 100;
}

function getTokenDocument(tokenOrDocument) {
  return tokenOrDocument?.document ?? tokenOrDocument;
}

function getTokenObject(tokenOrDocument) {
  return tokenOrDocument?.object ?? tokenOrDocument;
}

function tokenDocumentUuid(document) {
  return document?.uuid ?? document?._source?.uuid ?? null;
}

function sameTokenDocument(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;

  const aUuid = tokenDocumentUuid(a);
  const bUuid = tokenDocumentUuid(b);
  if (aUuid && bUuid && aUuid === bUuid) return true;

  return Boolean(a.id && b.id && a.id === b.id && a.parent?.id && b.parent?.id && a.parent.id === b.parent.id);
}

function isPlacedTokenDocument(document) {
  if (!document) return false;
  if (document.documentName && document.documentName !== "Token") return false;
  return Boolean(document.parent?.documentName === "Scene" || document.parent?.tokens || document.parent?.grid);
}

function getActorTokenDocuments(actor, { includeActiveFallback = true } = {}) {
  const documents = [];

  const addDocument = (candidate) => {
    const document = getTokenDocument(candidate);
    if (!document) return;
    if (!documents.some((existing) => sameTokenDocument(existing, document))) documents.push(document);
  };

  // Synthetic actors created from unlinked tokens usually keep their exact placed TokenDocument here.
  // When it exists, this is the only correct automation reference for an HP update.
  const actorTokenDocument = getTokenDocument(actor?.token);
  if (isPlacedTokenDocument(actorTokenDocument)) {
    addDocument(actorTokenDocument);
    if (!includeActiveFallback) return documents;
  }

  // Some updates expose the rendered token object through the synthetic actor.
  const actorTokenObjectDocument = getTokenDocument(actor?.token?.object);
  if (isPlacedTokenDocument(actorTokenObjectDocument)) {
    addDocument(actorTokenObjectDocument);
    if (!includeActiveFallback) return documents;
  }

  if (!includeActiveFallback) return documents;

  // Linked actor fallback only. This is not selected or targeted tokens.
  // It is used only when Foundry does not expose the exact synthetic token document.
  try {
    const activeTokens = actor?.getActiveTokens?.(true, true) ?? actor?.getActiveTokens?.() ?? [];
    for (const token of activeTokens) addDocument(token);
  } catch (err) {
    warn("Could not read active tokens for actor", actor?.name, err);
  }

  return documents;
}

function getSourceProperty(document, path, fallback) {
  const value = foundry.utils.getProperty(document, path);
  if (value !== undefined) return value;
  const sourceValue = foundry.utils.getProperty(document?._source, path);
  return sourceValue !== undefined ? sourceValue : fallback;
}

function getTokenState(tokenOrDocument) {
  const document = getTokenDocument(tokenOrDocument);
  const token = getTokenObject(tokenOrDocument);
  const gridSize = getGridSize();

  const x = toFiniteNumber(getSourceProperty(document, "x", 0), 0);
  const y = toFiniteNumber(getSourceProperty(document, "y", 0), 0);
  const width = toFiniteNumber(getSourceProperty(document, "width", 1), 1);
  const height = toFiniteNumber(getSourceProperty(document, "height", 1), 1);
  const texture = getSourceProperty(document, "texture.src", "");
  const scaleX = toFiniteNumber(getSourceProperty(document, "texture.scaleX", 1), 1);
  const scaleY = toFiniteNumber(getSourceProperty(document, "texture.scaleY", 1), 1);

  // Footprint dimensions are the actual grid space the token occupies.
  // These are the values used for the fall point, because the corpse should land
  // where the creature's base/feet touched the ground, not where the rendered mesh ends.
  const footprintPixelWidth = width * gridSize;
  const footprintPixelHeight = height * gridSize;

  // Rendered dimensions are debug-only. They can differ because of texture scale or image ratio.
  const renderedPixelWidth = toFiniteNumber(
    token?.w ?? token?.bounds?.width ?? token?.mesh?.width,
    footprintPixelWidth
  );

  const renderedPixelHeight = toFiniteNumber(
    token?.h ?? token?.bounds?.height ?? token?.mesh?.height,
    footprintPixelHeight
  );

  return {
    texture,
    x,
    y,
    width,
    height,
    gridSize,
    pixelWidth: footprintPixelWidth,
    pixelHeight: footprintPixelHeight,
    footprintPixelWidth,
    footprintPixelHeight,
    renderedPixelWidth,
    renderedPixelHeight,
    scaleX,
    scaleY
  };
}


function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function getApplyDelayMs() {
  return Math.round(clampNumber(getSetting(SETTINGS.applyDelayMs), 0, 5000, DEFAULTS[SETTINGS.applyDelayMs]));
}

function getRealignmentDelaysMs() {
  const baseDelay = getApplyDelayMs();

  // These passes happen after the corpse has been applied. They are intentionally
  // later than common hit-shake/return animations, so if another module restores
  // token x/y after damage, the corpse is moved back to the saved fall point.
  return [
    150,
    Math.max(350, Math.round(baseDelay / 2)),
    Math.max(850, baseDelay + 250)
  ];
}

function defaultImageAlphaBounds(src, reason = "not-read") {
  return {
    src,
    available: false,
    reason,
    width: null,
    height: null,
    opaqueTopRatio: 0,
    opaqueBottomRatio: 1,
    opaqueLeftRatio: 0,
    opaqueRightRatio: 1
  };
}

function shouldUseCrossOrigin(src) {
  try {
    const url = new URL(src, window.location.href);
    return url.origin !== window.location.origin;
  } catch (_err) {
    return false;
  }
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error("No image source provided."));
      return;
    }

    const image = new Image();
    if (shouldUseCrossOrigin(src)) image.crossOrigin = "anonymous";

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load image: ${src}`));
    image.src = src;
  });
}

async function getImageAlphaBounds(src) {
  if (!src) return defaultImageAlphaBounds(src, "empty-src");
  if (imageAlphaBoundsCache.has(src)) return imageAlphaBoundsCache.get(src);

  const promise = (async () => {
    try {
      const image = await loadImageElement(src);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;

      if (!width || !height) return defaultImageAlphaBounds(src, "no-natural-size");

      const canvasElement = document.createElement("canvas");
      canvasElement.width = width;
      canvasElement.height = height;

      const context = canvasElement.getContext("2d", { willReadFrequently: true });
      if (!context) return defaultImageAlphaBounds(src, "no-2d-context");

      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const alpha = pixels[((y * width + x) * 4) + 3];
          if (alpha <= 8) continue;

          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      if (maxX < 0 || maxY < 0) return defaultImageAlphaBounds(src, "no-opaque-pixels");

      return {
        src,
        available: true,
        reason: "alpha-scan",
        width,
        height,
        opaqueTop: minY,
        opaqueBottom: maxY,
        opaqueLeft: minX,
        opaqueRight: maxX,
        opaqueTopRatio: minY / height,
        opaqueBottomRatio: (maxY + 1) / height,
        opaqueLeftRatio: minX / width,
        opaqueRightRatio: (maxX + 1) / width
      };
    } catch (err) {
      warn("Could not read corpse image alpha bounds. Falling back to full image bounds.", err);
      return defaultImageAlphaBounds(src, "alpha-read-failed");
    }
  })();

  imageAlphaBoundsCache.set(src, promise);
  return promise;
}

function getFootprintBottomCenterPosition(state) {
  const pixelWidth = toFiniteNumber(state?.footprintPixelWidth ?? state?.pixelWidth, toFiniteNumber(state?.width, 1) * getGridSize());
  const pixelHeight = toFiniteNumber(state?.footprintPixelHeight ?? state?.pixelHeight, toFiniteNumber(state?.height, 1) * getGridSize());

  return {
    x: toFiniteNumber(state?.x, 0) + (pixelWidth / 2),
    y: toFiniteNumber(state?.y, 0) + pixelHeight
  };
}

function getRenderedBottomCenterPosition(state) {
  const pixelWidth = toFiniteNumber(state?.renderedPixelWidth, toFiniteNumber(state?.width, 1) * getGridSize());
  const pixelHeight = toFiniteNumber(state?.renderedPixelHeight, toFiniteNumber(state?.height, 1) * getGridSize());

  return {
    x: toFiniteNumber(state?.x, 0) + (pixelWidth / 2),
    y: toFiniteNumber(state?.y, 0) + pixelHeight
  };
}

function getTopLeftForFootprintBottomCenter(bottomCenter, width, height) {
  const gridSize = getGridSize();
  return {
    x: bottomCenter.x - ((width * gridSize) / 2),
    y: bottomCenter.y - (height * gridSize)
  };
}

function getTopLeftForVisualBottomCenter(bottomCenter, width, height, scaleY, yOffset = 0, imageAlphaBounds = null) {
  const gridSize = getGridSize();
  const footprintPixelHeight = height * gridSize;
  const visualPixelHeight = footprintPixelHeight * scaleY;
  const centeredTopPadding = (footprintPixelHeight - visualPixelHeight) / 2;

  // Use the actual opaque bottom of the corpse PNG, not the token document footprint and not
  // the full transparent texture rectangle. This fixes corpse images that have transparent
  // canvas padding below or above the visible body.
  const opaqueBottomRatio = clampNumber(imageAlphaBounds?.opaqueBottomRatio, 0, 1, 1);
  const opaqueBottomFromDocumentTop = centeredTopPadding + (visualPixelHeight * opaqueBottomRatio);

  return {
    x: bottomCenter.x - ((width * gridSize) / 2),
    y: bottomCenter.y - opaqueBottomFromDocumentTop + yOffset
  };
}

function getFullTextureBottomCenterForTopLeft(topLeft, width, height, scaleY) {
  const gridSize = getGridSize();
  const footprintPixelWidth = width * gridSize;
  const footprintPixelHeight = height * gridSize;
  const visualPixelHeight = footprintPixelHeight * scaleY;

  return {
    x: topLeft.x + (footprintPixelWidth / 2),
    y: topLeft.y + (footprintPixelHeight / 2) + (visualPixelHeight / 2)
  };
}

function getOpaqueBottomCenterForTopLeft(topLeft, width, height, scaleY, imageAlphaBounds = null) {
  const gridSize = getGridSize();
  const footprintPixelWidth = width * gridSize;
  const footprintPixelHeight = height * gridSize;
  const visualPixelHeight = footprintPixelHeight * scaleY;
  const centeredTopPadding = (footprintPixelHeight - visualPixelHeight) / 2;
  const opaqueBottomRatio = clampNumber(imageAlphaBounds?.opaqueBottomRatio, 0, 1, 1);

  return {
    x: topLeft.x + (footprintPixelWidth / 2),
    y: topLeft.y + centeredTopPadding + (visualPixelHeight * opaqueBottomRatio)
  };
}

function getVisualBottomCenterForTopLeft(topLeft, width, height, scaleY, imageAlphaBounds = null) {
  return getOpaqueBottomCenterForTopLeft(topLeft, width, height, scaleY, imageAlphaBounds);
}

function readStoredValue(document, key) {
  return document?.flags?.[MODULE_ID]?.[FLAG_KEY]?.[key]
    ?? document?._source?.flags?.[MODULE_ID]?.[FLAG_KEY]?.[key]
    // Macro fallback from earlier versions, kept so previously changed tokens can still restore.
    ?? document?.flags?.world?.mkCorpseToken?.[key]
    ?? document?._source?.flags?.world?.mkCorpseToken?.[key]
    // Legacy macro fallback. Do not use getFlag() for this inactive scope.
    ?? document?.flags?.["mk-corpse-token"]?.[key]
    ?? document?._source?.flags?.["mk-corpse-token"]?.[key];
}

function hasStoredCorpseData(document) {
  return Boolean(readStoredValue(document, "originalTexture"));
}

function hasActiveCorpseData(document) {
  return isCorpseLifecycleActive({
    applied: readStoredValue(document, "applied"),
    hasStoredData: hasStoredCorpseData(document),
    matchesCorpseAppearance: isAlreadyCorpse(document)
  });
}

function getPreviousStoredState(document) {
  // Retained post-revival flags are historical only. Reusing them would move a
  // living token back to its prior death position on a later HP change/death.
  if (!hasActiveCorpseData(document)) return {};

  return {
    originalTexture: readStoredValue(document, "originalTexture"),
    originalX: readStoredValue(document, "originalX"),
    originalY: readStoredValue(document, "originalY"),
    originalWidth: readStoredValue(document, "originalWidth"),
    originalHeight: readStoredValue(document, "originalHeight"),
    originalScaleX: readStoredValue(document, "originalScaleX"),
    originalScaleY: readStoredValue(document, "originalScaleY"),
    originalBottomCenterX: readStoredValue(document, "originalBottomCenterX"),
    originalBottomCenterY: readStoredValue(document, "originalBottomCenterY")
  };
}

function buildStoredFlags(original, fallPoint, previous = {}, debugData = {}) {
  const now = Date.now();

  return {
    [`flags.${MODULE_ID}.${FLAG_KEY}.applied`]: true,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalTexture`]: previous.originalTexture ?? original.texture,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalX`]: previous.originalX ?? original.x,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalY`]: previous.originalY ?? original.y,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalWidth`]: previous.originalWidth ?? original.width,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalHeight`]: previous.originalHeight ?? original.height,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalScaleX`]: previous.originalScaleX ?? original.scaleX,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalScaleY`]: previous.originalScaleY ?? original.scaleY,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalBottomCenterX`]: previous.originalBottomCenterX ?? fallPoint.x,
    [`flags.${MODULE_ID}.${FLAG_KEY}.originalBottomCenterY`]: previous.originalBottomCenterY ?? fallPoint.y,
    [`flags.${MODULE_ID}.${FLAG_KEY}.changedAt`]: now,
    [`flags.${MODULE_ID}.${FLAG_KEY}.debug`]: {
      version: getModuleVersion(),
      changedAt: now,
      fallPoint: {
        x: fallPoint.x,
        y: fallPoint.y,
        label: "original standing footprint bottom-center"
      },
      ...debugData
    }
  };
}

function getOwnValue(target, key) {
  if (!target || typeof target !== "object") return { exists: false, value: undefined };

  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) return { exists: false, value: undefined };

  // Important: do not invoke migrated getters on Foundry documents.
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    return { exists: false, value: undefined };
  }

  return { exists: true, value: descriptor.value };
}

function hasOwnUpdatePath(data, path) {
  if (!data || typeof data !== "object") return false;

  const flat = getOwnValue(data, path);
  if (flat.exists) return true;

  const parts = String(path).split(".");
  let current = data;

  for (const part of parts) {
    const result = getOwnValue(current, part);
    if (!result.exists) return false;
    current = result.value;
  }

  return true;
}

function getOwnUpdateValue(data, path) {
  if (!data || typeof data !== "object") return undefined;

  const flat = getOwnValue(data, path);
  if (flat.exists) return flat.value;

  const parts = String(path).split(".");
  let current = data;

  for (const part of parts) {
    const result = getOwnValue(current, part);
    if (!result.exists) return undefined;
    current = result.value;
  }

  return current;
}

function updateHasAnyPath(changed, paths) {
  return paths.some((path) => hasOwnUpdatePath(changed, path));
}

function hpWasChangedInActorUpdate(changed) {
  return updateHasAnyPath(changed, [
    "system.attributes.hp.value",
    "system.attributes.hp",
    "system.attributes"
  ]);
}

function hpWasChangedInTokenUpdate(changed) {
  return updateHasAnyPath(changed, [
    // Synthetic token actor data lives under delta.
    "delta.system.attributes.hp.value",
    "delta.system.attributes.hp",
    "delta.system.attributes",

    // Older or module-generated update payloads can still arrive with flattened keys.
    // These are safe because getOwnValue does not invoke TokenDocument#actorData getters.
    "actorData.system.attributes.hp.value",
    "actorData.system.attributes.hp",
    "actorData.system.attributes",

    // If a plain own actorData object is passed, this remains supported without getters.
    "actorData.system.attributes.hp.value",

    // Linked token / fallback update shape.
    "system.attributes.hp.value",
    "system.attributes.hp",
    "system.attributes"
  ]);
}

function getChangedHpValue(changed, paths) {
  for (const path of paths) {
    const value = getOwnUpdateValue(changed, path);
    if (value === undefined) continue;

    if (value && typeof value === "object") {
      const nested = getOwnUpdateValue(value, "value");
      const nestedNumber = Number(nested);
      if (Number.isFinite(nestedNumber)) return nestedNumber;
    }

    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getChangedHpFromActorUpdate(changed) {
  return getChangedHpValue(changed, [
    "system.attributes.hp.value",
    "system.attributes.hp"
  ]);
}

function getChangedHpFromTokenUpdate(changed) {
  return getChangedHpValue(changed, [
    "delta.system.attributes.hp.value",
    "delta.system.attributes.hp",
    "actorData.system.attributes.hp.value",
    "actorData.system.attributes.hp",
    "system.attributes.hp.value",
    "system.attributes.hp"
  ]);
}

function getCacheKeysForTokenDocument(document) {
  const keys = [];
  const add = (value) => {
    if (value && !keys.includes(value)) keys.push(value);
  };

  add(document?.uuid);
  add(tokenDocumentUuid(document));
  if (document?.id && document?.parent?.id) add(`scene:${document.parent.id}:token:${document.id}`);
  if (document?.id) add(`token:${document.id}`);
  add(document?.actor?.uuid);
  if (document?.actor?.id) add(`actor:${document.actor.id}`);

  return keys;
}

function pruneDeathPositionCache() {
  const now = Date.now();

  for (const [key, value] of deathPositionCache.entries()) {
    if (!value?.timestamp || now - value.timestamp > DEATH_POSITION_CACHE_TTL_MS) {
      deathPositionCache.delete(key);
    }
  }
}

function captureTokenPositionForDeath(tokenOrDocument, source) {
  const document = getTokenDocument(tokenOrDocument);
  if (!document) return null;

  const token = getTokenObject(tokenOrDocument);
  const actor = document?.actor ?? token?.actor;
  if (actor && !shouldProcessActor(actor)) return null;

  const state = getTokenState(tokenOrDocument);
  const fallPoint = getFootprintBottomCenterPosition(state);
  const renderedBottomCenter = getRenderedBottomCenterPosition(state);

  const payload = {
    source,
    timestamp: Date.now(),
    tokenId: document.id,
    tokenUuid: tokenDocumentUuid(document),
    actorId: actor?.id ?? null,
    actorUuid: actor?.uuid ?? null,
    state,
    bottomCenter: fallPoint,
    fallPoint,
    renderedBottomCenter
  };

  for (const key of getCacheKeysForTokenDocument(document)) {
    deathPositionCache.set(key, payload);
  }

  log(`Cached death fall point for ${tokenName(document)} from ${source}:`, {
    x: fallPoint.x,
    y: fallPoint.y,
    topLeft: { x: state.x, y: state.y },
    footprint: { width: state.width, height: state.height, pixelWidth: state.footprintPixelWidth, pixelHeight: state.footprintPixelHeight },
    rendered: { pixelWidth: state.renderedPixelWidth, pixelHeight: state.renderedPixelHeight }
  });

  return payload;
}

function getCachedDeathPosition(tokenOrDocument) {
  pruneDeathPositionCache();

  const document = getTokenDocument(tokenOrDocument);
  if (!document) return null;

  for (const key of getCacheKeysForTokenDocument(document)) {
    const value = deathPositionCache.get(key);
    if (value) return value;
  }

  return null;
}

function takeCachedDeathPosition(tokenOrDocument) {
  const cached = getCachedDeathPosition(tokenOrDocument);
  const document = getTokenDocument(tokenOrDocument);

  if (document) {
    for (const key of getCacheKeysForTokenDocument(document)) deathPositionCache.delete(key);
  }

  return cached;
}

function cacheActorDeathPositions(actor, source) {
  if (!shouldProcessActor(actor)) return;

  const documents = getActorTokenDocuments(actor, { includeActiveFallback: false });
  for (const document of documents) captureTokenPositionForDeath(document, source);
}

function tokenCoordinateReport(tokenOrDocument) {
  const document = getTokenDocument(tokenOrDocument);
  const token = getTokenObject(tokenOrDocument);
  const actor = document?.actor ?? token?.actor;
  const current = getTokenState(tokenOrDocument);
  const currentFallPoint = getFootprintBottomCenterPosition(current);
  const currentRenderedBottomCenter = getRenderedBottomCenterPosition(current);
  const debug = readStoredValue(document, "debug") ?? {};
  const cached = getCachedDeathPosition(document);

  return {
    name: tokenName(document),
    tokenId: document?.id ?? null,
    actorName: actor?.name ?? null,
    actorType: actor?.type ?? null,
    hp: actor ? getHp(actor) : null,
    current: {
      texture: current.texture,
      x: current.x,
      y: current.y,
      width: current.width,
      height: current.height,
      pixelWidth: current.pixelWidth,
      pixelHeight: current.pixelHeight,
      footprintPixelWidth: current.footprintPixelWidth,
      footprintPixelHeight: current.footprintPixelHeight,
      renderedPixelWidth: current.renderedPixelWidth,
      renderedPixelHeight: current.renderedPixelHeight,
      scaleX: current.scaleX,
      scaleY: current.scaleY,
      fallPoint: currentFallPoint,
      renderedBottomCenter: currentRenderedBottomCenter
    },
    savedOriginal: {
      texture: readStoredValue(document, "originalTexture"),
      x: readStoredValue(document, "originalX"),
      y: readStoredValue(document, "originalY"),
      width: readStoredValue(document, "originalWidth"),
      height: readStoredValue(document, "originalHeight"),
      scaleX: readStoredValue(document, "originalScaleX"),
      scaleY: readStoredValue(document, "originalScaleY"),
      bottomCenter: {
        x: readStoredValue(document, "originalBottomCenterX"),
        y: readStoredValue(document, "originalBottomCenterY")
      }
    },
    lastCorpseDebug: debug,
    cachedDeathPosition: cached ? {
      source: cached.source,
      timestamp: cached.timestamp,
      state: cached.state,
      fallPoint: cached.fallPoint ?? cached.bottomCenter,
      renderedBottomCenter: cached.renderedBottomCenter
    } : null
  };
}

async function debugSelectedTokenCoordinates() {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only the GM can debug corpse token coordinates.");
    return [];
  }

  if (!canvas?.ready) {
    ui.notifications.warn("The canvas is not ready.");
    return [];
  }

  const selected = canvas.tokens?.controlled ?? [];
  if (selected.length === 0) {
    ui.notifications.warn("Select one or more tokens first.");
    return [];
  }

  const reports = selected.map((token) => tokenCoordinateReport(token));

  console.group(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | Coordinate Debug`);
  for (const report of reports) {
    log(report.name, report);
    log(`Coordinate Debug JSON | ${report.name}\n${JSON.stringify(report, null, 2)}`);
  }
  console.groupEnd();

  ui.notifications.info(`Wrote coordinate debug for ${reports.length} selected token(s) to the console.`);

  return reports;
}

function isAlreadyCorpse(tokenOrDocument) {
  const state = getTokenState(tokenOrDocument);
  const corpseImage = getCorpseImageSetting();
  if (!corpseImage) return false;
  const corpseWidth = toFiniteNumber(getSetting(SETTINGS.width), 1);
  const corpseHeight = toFiniteNumber(getSetting(SETTINGS.height), 1);
  const corpseScale = toFiniteNumber(getSetting(SETTINGS.scale), 0.7);

  return state.texture === corpseImage
    && state.width === corpseWidth
    && state.height === corpseHeight
    && state.scaleX === corpseScale
    && state.scaleY === corpseScale;
}

async function getCorpsePlacementForFallPoint(fallPoint) {
  const corpseImage = getCorpseImageSetting();
  if (!corpseImage) throw new Error("Corpse Token image is not configured.");
  const corpseWidth = toFiniteNumber(getSetting(SETTINGS.width), 1);
  const corpseHeight = toFiniteNumber(getSetting(SETTINGS.height), 1);
  const corpseScale = toFiniteNumber(getSetting(SETTINGS.scale), 0.7);
  const alignVisualBottom = Boolean(getSetting(SETTINGS.alignVisualBottom));
  const corpseYOffset = toFiniteNumber(getSetting(SETTINGS.yOffset), 0);
  const corpseImageAlphaBounds = alignVisualBottom ? await getImageAlphaBounds(corpseImage) : defaultImageAlphaBounds(corpseImage, "disabled");

  const corpseTopLeft = alignVisualBottom
    ? getTopLeftForVisualBottomCenter(fallPoint, corpseWidth, corpseHeight, corpseScale, corpseYOffset, corpseImageAlphaBounds)
    : (() => {
      const topLeft = getTopLeftForFootprintBottomCenter(fallPoint, corpseWidth, corpseHeight);
      return { x: topLeft.x, y: topLeft.y + corpseYOffset };
    })();

  const corpseVisualBottomCenter = getVisualBottomCenterForTopLeft(corpseTopLeft, corpseWidth, corpseHeight, corpseScale, corpseImageAlphaBounds);
  const corpseFullTextureBottomCenter = getFullTextureBottomCenterForTopLeft(corpseTopLeft, corpseWidth, corpseHeight, corpseScale);
  const corpseFootprintBottomCenter = getFootprintBottomCenterPosition({
    x: corpseTopLeft.x,
    y: corpseTopLeft.y,
    width: corpseWidth,
    height: corpseHeight,
    footprintPixelWidth: corpseWidth * getGridSize(),
    footprintPixelHeight: corpseHeight * getGridSize()
  });

  return {
    corpseImage,
    corpseWidth,
    corpseHeight,
    corpseScale,
    alignVisualBottom,
    corpseYOffset,
    corpseImageAlphaBounds,
    corpseTopLeft,
    corpseVisualBottomCenter,
    corpseFullTextureBottomCenter,
    corpseFootprintBottomCenter
  };
}

function savedFallPointForDocument(document) {
  const originalBottomCenterX = toFiniteNumber(readStoredValue(document, "originalBottomCenterX"), undefined);
  const originalBottomCenterY = toFiniteNumber(readStoredValue(document, "originalBottomCenterY"), undefined);

  if (originalBottomCenterX !== undefined && originalBottomCenterY !== undefined) {
    return { x: originalBottomCenterX, y: originalBottomCenterY };
  }

  return getFootprintBottomCenterPosition(getTokenState(document));
}

function scheduleCorpseRealignment(document, fallPoint) {
  if (!document) return;

  const documentUuid = tokenDocumentUuid(document) ?? document.id ?? crypto.randomUUID?.() ?? String(Date.now());

  for (const delay of getRealignmentDelaysMs()) {
    window.setTimeout(async () => {
      try {
        const liveDocument = fromUuidSync?.(documentUuid) ?? document;
        if (!liveDocument) return;
        if (!isAlreadyCorpse(liveDocument)) return;

        const actor = liveDocument.actor;
        if (actor && getHp(actor) !== null && getHp(actor) > 0) return;

        const savedFallPoint = fallPoint ?? savedFallPointForDocument(liveDocument);
        const placement = await getCorpsePlacementForFallPoint(savedFallPoint);
        const currentState = getTokenState(liveDocument);
        const dx = Math.abs(currentState.x - placement.corpseTopLeft.x);
        const dy = Math.abs(currentState.y - placement.corpseTopLeft.y);

        if (dx < 0.1 && dy < 0.1) return;

        await liveDocument.update({
          x: placement.corpseTopLeft.x,
          y: placement.corpseTopLeft.y,
          [`flags.${MODULE_ID}.${FLAG_KEY}.debug.lastRealignAt`]: Date.now(),
          [`flags.${MODULE_ID}.${FLAG_KEY}.debug.lastRealignDelayMs`]: delay,
          [`flags.${MODULE_ID}.${FLAG_KEY}.debug.lastRealignFrom`]: { x: currentState.x, y: currentState.y },
          [`flags.${MODULE_ID}.${FLAG_KEY}.debug.lastRealignTo`]: { x: placement.corpseTopLeft.x, y: placement.corpseTopLeft.y }
        });

        log(`Realigned corpse token ${tokenName(liveDocument)} after ${delay}ms`, {
          fallPoint: savedFallPoint,
          from: { x: currentState.x, y: currentState.y },
          to: placement.corpseTopLeft
        });
      } catch (err) {
        warn("Could not realign corpse token after delayed pass", err);
      }
    }, delay);
  }
}

async function applyCorpseToToken(tokenOrDocument) {
  const document = getTokenDocument(tokenOrDocument);
  const token = getTokenObject(tokenOrDocument);
  const actor = document?.actor ?? token?.actor;

  if (!document || !actor) return false;
  if (!hasConfiguredCorpseImage()) return false;
  if (!shouldProcessActor(actor)) return false;

  const hp = getHp(actor);
  if (hp === null || hp > 0) return false;
  if (isAlreadyCorpse(document)) return false;

  const cachedDeathPosition = takeCachedDeathPosition(document);
  const original = cachedDeathPosition?.state ?? getTokenState(document);
  const fallPoint = cachedDeathPosition?.fallPoint ?? cachedDeathPosition?.bottomCenter ?? getFootprintBottomCenterPosition(original);

  const placement = await getCorpsePlacementForFallPoint(fallPoint);
  const {
    corpseImage,
    corpseWidth,
    corpseHeight,
    corpseScale,
    alignVisualBottom,
    corpseYOffset,
    corpseImageAlphaBounds,
    corpseTopLeft,
    corpseVisualBottomCenter,
    corpseFullTextureBottomCenter,
    corpseFootprintBottomCenter
  } = placement;
  const previous = getPreviousStoredState(document);

  const intendedCorpse = {
    texture: corpseImage,
    x: corpseTopLeft.x,
    y: corpseTopLeft.y,
    width: corpseWidth,
    height: corpseHeight,
    pixelWidth: corpseWidth * getGridSize(),
    pixelHeight: corpseHeight * getGridSize(),
    scaleX: corpseScale,
    scaleY: corpseScale,
    alignVisualBottom,
    yOffset: corpseYOffset,
    fallPoint,
    corpseVisualBottomCenter,
    corpseFullTextureBottomCenter,
    corpseFootprintBottomCenter,
    corpseImageAlphaBounds
  };

  await document.update({
    "texture.src": corpseImage,
    "texture.scaleX": corpseScale,
    "texture.scaleY": corpseScale,
    x: corpseTopLeft.x,
    y: corpseTopLeft.y,
    width: corpseWidth,
    height: corpseHeight,
    ...buildStoredFlags(original, fallPoint, previous, {
      source: cachedDeathPosition?.source ?? "applyCorpseToToken-current-token-state",
      initial: original,
      intendedCorpse
    })
  });

  scheduleCorpseRealignment(document, fallPoint);

  return true;
}

async function restoreCorpseToken(tokenOrDocument) {
  const document = getTokenDocument(tokenOrDocument);
  if (!document) return false;
  if (!hasActiveCorpseData(document)) return false;

  const originalTexture = readStoredValue(document, "originalTexture");
  const originalX = toFiniteNumber(readStoredValue(document, "originalX"), undefined);
  const originalY = toFiniteNumber(readStoredValue(document, "originalY"), undefined);
  const originalWidth = toFiniteNumber(readStoredValue(document, "originalWidth"), undefined);
  const originalHeight = toFiniteNumber(readStoredValue(document, "originalHeight"), undefined);
  const originalScaleX = toFiniteNumber(readStoredValue(document, "originalScaleX"), undefined);
  const originalScaleY = toFiniteNumber(readStoredValue(document, "originalScaleY"), undefined);

  if (!originalTexture) return false;

  const updateData = {
    "texture.src": originalTexture,
    [`flags.${MODULE_ID}.${FLAG_KEY}.applied`]: false,
    [`flags.${MODULE_ID}.${FLAG_KEY}.restoredAt`]: Date.now()
  };

  if (originalWidth !== undefined) updateData.width = originalWidth;
  if (originalHeight !== undefined) updateData.height = originalHeight;
  if (originalScaleX !== undefined) updateData["texture.scaleX"] = originalScaleX;
  if (originalScaleY !== undefined) updateData["texture.scaleY"] = originalScaleY;

  if (originalX !== undefined && originalY !== undefined) {
    updateData.x = originalX;
    updateData.y = originalY;
  } else if (originalWidth !== undefined && originalHeight !== undefined) {
    const currentFallPoint = getFootprintBottomCenterPosition(getTokenState(document));
    const restoredTopLeft = getTopLeftForFootprintBottomCenter(currentFallPoint, originalWidth, originalHeight);
    updateData.x = restoredTopLeft.x;
    updateData.y = restoredTopLeft.y;
  }

  await document.update(updateData);
  return true;
}

async function restoreSelectedCorpseTokens() {
  if (!canvas?.ready) {
    ui.notifications.warn("The canvas is not ready.");
    return [];
  }

  const restored = [];

  for (const token of canvas.tokens?.controlled ?? []) {
    try {
      const didRestore = await restoreCorpseToken(token);
      if (didRestore) restored.push(tokenName(token));
    } catch (err) {
      error("Failed to restore token", token, err);
    }
  }

  if (restored.length > 0) {
    ui.notifications.info(`Restored ${restored.length} corpse token(s).`);
  } else {
    ui.notifications.warn("No selected corpse token had saved restore data.");
  }

  return restored;
}

async function maybeRestoreHealedToken(tokenOrDocument) {
  if (!getSetting(SETTINGS.autoRestoreWhenHealed)) return false;

  const document = getTokenDocument(tokenOrDocument);
  const token = getTokenObject(tokenOrDocument);
  const actor = document?.actor ?? token?.actor;

  if (!document || !actor) return false;
  if (!shouldProcessActor(actor)) return false;
  if (!hasActiveCorpseData(document)) return false;

  const hp = getHp(actor);
  if (hp === null || hp <= 0) return false;

  return restoreCorpseToken(document);
}

async function postCorpseChatMessage(changed) {
  if (!getSetting(SETTINGS.postChatMessage) || changed.length === 0) return;

  const content = `
    <div class="mk-shadowdark-corpse-token-chat">
      <p><strong>Corpse token applied</strong></p>
      <ul>${changed.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>
    </div>
  `;

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content
  });
}

async function scanSceneForDeadTokens() {
  if (!game.user?.isGM) return [];
  if (!canvas?.ready) return [];
  if (!getSetting(SETTINGS.enabled)) return [];
  if (updateInProgress) return [];

  updateInProgress = true;
  const changed = [];

  try {
    for (const token of canvas.tokens?.placeables ?? []) {
      try {
        const restored = await maybeRestoreHealedToken(token);
        if (restored) continue;

        const didChange = await applyCorpseToToken(token);
        if (didChange) changed.push(tokenName(token));
      } catch (err) {
        error("Failed to process token", token, err);
      }
    }
  } finally {
    updateInProgress = false;
  }

  if (changed.length > 0) {
    ui.notifications.info(`Changed ${changed.length} dead NPC token(s) to corpse image.`);
    await postCorpseChatMessage(changed);
  }

  return changed;
}

async function processActorHpUpdate(actor) {
  if (!game.user?.isGM) return [];
  if (!canvas?.ready) return [];
  if (!getSetting(SETTINGS.enabled)) return [];
  if (!shouldProcessActor(actor)) return [];
  if (updateInProgress) return [];

  const documents = getActorTokenDocuments(actor, { includeActiveFallback: false });
  if (documents.length === 0) {
    warn(`No active token document found for actor ${actor?.name ?? "Unknown Actor"}. Corpse token not applied.`);
    return [];
  }

  updateInProgress = true;
  const changed = [];

  try {
    for (const document of documents) {
      try {
        const restored = await maybeRestoreHealedToken(document);
        if (restored) continue;

        const didChange = await applyCorpseToToken(document);
        if (didChange) changed.push(tokenName(document));
      } catch (err) {
        error("Failed to process actor token document", document, err);
      }
    }
  } finally {
    updateInProgress = false;
  }

  if (changed.length > 0) {
    ui.notifications.info(`Changed ${changed.length} dead NPC token(s) to corpse image.`);
    await postCorpseChatMessage(changed);
  }

  return changed;
}

function scheduleSceneScan() {
  if (!game.user?.isGM) return;
  if (!getSetting(SETTINGS.enabled)) return;

  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanSceneForDeadTokens();
  }, 150);
}

async function checkSingleToken(tokenOrDocument) {
  if (!game.user?.isGM) return false;
  if (!canvas?.ready) return false;
  if (!getSetting(SETTINGS.enabled)) return false;
  if (updateInProgress) return false;

  updateInProgress = true;

  try {
    const restored = await maybeRestoreHealedToken(tokenOrDocument);
    if (restored) return true;

    const didChange = await applyCorpseToToken(tokenOrDocument);

    if (didChange) {
      const name = tokenName(tokenOrDocument);
      ui.notifications.info(`Changed ${name} to corpse image.`);
      await postCorpseChatMessage([name]);
    }

    return didChange;
  } catch (err) {
    error("Failed to process token", tokenOrDocument, err);
    return false;
  } finally {
    updateInProgress = false;
  }
}

function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: "Corpse Token: Enabled",
    hint: "Automatically changes NPC tokens to a corpse image when their Shadowdark HP reaches 0 or lower.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.enabled]
  });

  game.settings.register(MODULE_ID, SETTINGS.corpseImage, {
    name: "Corpse Token: Image",
    hint: "Select the image used for dead NPC tokens. No corpse token is applied until an image is selected.",
    scope: "world",
    config: false,
    type: String,
    filePicker: "image",
    default: DEFAULTS[SETTINGS.corpseImage],
    onChange: () => {
      missingCorpseImageWarningShown = false;
      imageAlphaBoundsCache.clear();
    }
  });

  game.settings.register(MODULE_ID, SETTINGS.onlyNpcs, {
    name: "Corpse Token: NPCs Only",
    hint: "Only NPC actor tokens are changed. Player character tokens are ignored.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.onlyNpcs]
  });

  game.settings.register(MODULE_ID, SETTINGS.width, {
    name: "Corpse Token: Width",
    hint: "Token width after corpse conversion.",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0.25, max: 6, step: 0.25 },
    default: DEFAULTS[SETTINGS.width]
  });

  game.settings.register(MODULE_ID, SETTINGS.height, {
    name: "Corpse Token: Height",
    hint: "Token height after corpse conversion.",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0.25, max: 6, step: 0.25 },
    default: DEFAULTS[SETTINGS.height]
  });

  game.settings.register(MODULE_ID, SETTINGS.scale, {
    name: "Corpse Token: Texture Scale",
    hint: "Texture scale for the corpse image. 0.7 means 70% of the 1x1 token space.",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0.1, max: 2, step: 0.05 },
    default: DEFAULTS[SETTINGS.scale]
  });

  game.settings.register(MODULE_ID, SETTINGS.alignVisualBottom, {
    name: "Corpse Token: Align Opaque Image Bottom",
    hint: "When enabled, the actual opaque bottom of the corpse PNG is placed on the original standing/falling point. This compensates for texture scale and transparent image padding.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.alignVisualBottom]
  });

  game.settings.register(MODULE_ID, SETTINGS.yOffset, {
    name: "Corpse Token: Vertical Offset",
    hint: "Fine-tunes corpse placement in pixels. Positive values move the corpse down; negative values move it up. Use this if the corpse image itself has transparent padding.",
    scope: "world",
    config: false,
    type: Number,
    range: { min: -200, max: 200, step: 1 },
    default: DEFAULTS[SETTINGS.yOffset]
  });

  game.settings.register(MODULE_ID, SETTINGS.applyDelayMs, {
    name: "Corpse Token: Apply Delay (ms)",
    hint: "Waits this many milliseconds after HP reaches 0 before replacing the token. This lets damage shake/return animations finish so they cannot move the corpse upward afterward.",
    scope: "world",
    config: false,
    type: Number,
    range: { min: 0, max: 5000, step: 50 },
    default: DEFAULTS[SETTINGS.applyDelayMs]
  });

  game.settings.register(MODULE_ID, SETTINGS.postChatMessage, {
    name: "Corpse Token: Post Chat Message",
    hint: "Posts a small chat message when tokens are changed to corpse images.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.postChatMessage]
  });

  game.settings.register(MODULE_ID, SETTINGS.scanOnCanvasReady, {
    name: "Corpse Token: Scan Scene On Load",
    hint: "When enabled, the GM scans the active scene for already-dead NPC tokens whenever the canvas is ready.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.scanOnCanvasReady]
  });

  game.settings.register(MODULE_ID, SETTINGS.autoRestoreWhenHealed, {
    name: "Corpse Token: Auto Restore When Healed",
    hint: "When enabled, a corpse token is restored if its NPC HP rises above 0. Disabled by default.",
    scope: "world",
    config: false,
    type: Boolean,
    default: DEFAULTS[SETTINGS.autoRestoreWhenHealed]
  });
}

function attachApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;

  const api = module.api ?? {};

  api.corpseToken = {
    applyCorpseToToken,
    restoreCorpseToken,
    restoreSelectedCorpseTokens,
    scanSceneForDeadTokens,
    processActorHpUpdate,
    debugSelectedTokenCoordinates
  };

  module.api = api;
}

function scheduleActorProcessing(actor) {
  const key = actor?.uuid ?? actor?.id ?? actor?.name ?? "unknown-actor";
  const existing = actorProcessingTimers.get(key);
  if (existing) window.clearTimeout(existing);

  const timer = window.setTimeout(() => {
    actorProcessingTimers.delete(key);
    processActorHpUpdate(actor);
  }, getApplyDelayMs());

  actorProcessingTimers.set(key, timer);
}

function scheduleTokenProcessing(tokenDocument) {
  const key = tokenDocumentUuid(tokenDocument) ?? tokenDocument?.id ?? "unknown-token";
  const existing = tokenProcessingTimers.get(key);
  if (existing) window.clearTimeout(existing);

  const timer = window.setTimeout(() => {
    tokenProcessingTimers.delete(key);
    checkSingleToken(tokenDocument?.object ?? tokenDocument);
  }, getApplyDelayMs());

  tokenProcessingTimers.set(key, timer);
}

function registerHooks() {
  if (!game.user?.isGM) {
    log("Automation disabled for this client because the current user is not a GM.");
    return;
  }

  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!getSetting(SETTINGS.enabled)) return;
    if (!hpWasChangedInActorUpdate(changed)) return;

    const newHp = getChangedHpFromActorUpdate(changed);
    if (newHp !== null && newHp > 0) return;

    // Capture the standing fall point before the HP update and before other modules
    // can shake or move the token after damage.
    cacheActorDeathPositions(actor, "preUpdateActor-hp-change");
  });

  Hooks.on("preUpdateToken", (tokenDocument, changed) => {
    if (!getSetting(SETTINGS.enabled)) return;
    if (!hpWasChangedInTokenUpdate(changed)) return;

    const newHp = getChangedHpFromTokenUpdate(changed);
    if (newHp !== null && newHp > 0) return;

    // Capture the exact token document from the HP update. Never use selected or targeted tokens.
    captureTokenPositionForDeath(tokenDocument, "preUpdateToken-hp-change");
  });

  Hooks.on("updateActor", (actor, changed) => {
    if (!getSetting(SETTINGS.enabled)) return;
    if (!hpWasChangedInActorUpdate(changed)) return;

    scheduleActorProcessing(actor);
  });

  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!getSetting(SETTINGS.enabled)) return;
    if (!hpWasChangedInTokenUpdate(changed)) return;

    scheduleTokenProcessing(tokenDocument);
  });

  Hooks.on("canvasReady", () => {
    if (getSetting(SETTINGS.scanOnCanvasReady)) scheduleSceneScan();
  });

  log("Automation registered.");
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  attachApi();
  registerHooks();
});
