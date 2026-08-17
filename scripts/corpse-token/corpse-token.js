import { isCorpseLifecycleActive } from "./corpse-token-state.js";
import {
  clampNumber,
  getFootprintBottomCenterPosition,
  getFullTextureBottomCenterForTopLeft,
  getRenderedBottomCenterPosition,
  getTopLeftForFootprintBottomCenter,
  getTopLeftForVisualBottomCenter,
  getVisualBottomCenterForTopLeft,
  normalizeGridSize,
  toFiniteNumber
} from "./corpse-token-placement.js";
import {
  CORPSE_TOKEN_MIGRATION_VERSION,
  buildMigratedCorpseFlagData
} from "./corpse-token-migration.js";

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
  applyDelayMs: "corpseTokenApplyDelayMs",
  migrationVersion: "corpseTokenMigrationVersion"
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
  [SETTINGS.applyDelayMs]: 750,
  [SETTINGS.migrationVersion]: 0
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

function getModuleVersion() {
  const mod = game.modules.get(MODULE_ID);
  return mod?.version ?? mod?.data?.version ?? "unknown";
}

function log(...args) {
  console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
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
  return normalizeGridSize(
    canvas?.grid?.size
      ?? canvas?.dimensions?.size
      ?? canvas?.scene?.grid?.size
      ?? game.scenes?.current?.grid?.size
      ?? 100
  );
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

  return Boolean(
    a.id
    && b.id
    && a.id === b.id
    && a.parent?.id
    && b.parent?.id
    && a.parent.id === b.parent.id
  );
}

function isPlacedTokenDocument(document) {
  if (!document) return false;
  if (document.documentName && document.documentName !== "Token") return false;
  return Boolean(
    document.parent?.documentName === "Scene"
    || document.parent?.tokens
    || document.parent?.grid
  );
}

function getActorTokenDocuments(actor, { includeActiveFallback = true } = {}) {
  const documents = [];

  const addDocument = (candidate) => {
    const document = getTokenDocument(candidate);
    if (!document) return;
    if (!documents.some((existing) => sameTokenDocument(existing, document))) documents.push(document);
  };

  const actorTokenDocument = getTokenDocument(actor?.token);
  if (isPlacedTokenDocument(actorTokenDocument)) {
    addDocument(actorTokenDocument);
    if (!includeActiveFallback) return documents;
  }

  const actorTokenObjectDocument = getTokenDocument(actor?.token?.object);
  if (isPlacedTokenDocument(actorTokenObjectDocument)) {
    addDocument(actorTokenObjectDocument);
    if (!includeActiveFallback) return documents;
  }

  if (!includeActiveFallback) return documents;

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
  const footprintPixelWidth = width * gridSize;
  const footprintPixelHeight = height * gridSize;
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

function getApplyDelayMs() {
  return Math.round(
    clampNumber(
      getSetting(SETTINGS.applyDelayMs),
      0,
      5000,
      DEFAULTS[SETTINGS.applyDelayMs]
    )
  );
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

function readFlagObject(document, scope, key) {
  const live = document?.flags?.[scope]?.[key];
  if (live && typeof live === "object" && !Array.isArray(live)) return live;

  const source = document?._source?.flags?.[scope]?.[key];
  if (source && typeof source === "object" && !Array.isArray(source)) return source;

  return null;
}

function readStoredValue(document, key) {
  return readFlagObject(document, MODULE_ID, FLAG_KEY)?.[key];
}

function hasStoredCorpseData(document) {
  return Boolean(readStoredValue(document, "originalTexture"));
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

function hasActiveCorpseData(document) {
  return isCorpseLifecycleActive({
    applied: readStoredValue(document, "applied"),
    hasStoredData: hasStoredCorpseData(document),
    matchesCorpseAppearance: isAlreadyCorpse(document)
  });
}

function getPreviousStoredState(document) {
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

async function migrateLegacyCorpseTokenFlags() {
  if (!game.user?.isGM) return { migrated: 0, errors: 0, skipped: true };

  const currentVersion = Number(getSetting(SETTINGS.migrationVersion)) || 0;
  if (currentVersion >= CORPSE_TOKEN_MIGRATION_VERSION) {
    return { migrated: 0, errors: 0, skipped: true };
  }

  let migrated = 0;
  let errors = 0;

  for (const scene of game.scenes ?? []) {
    const updates = [];

    for (const tokenDocument of scene.tokens ?? []) {
      const result = buildMigratedCorpseFlagData({
        current: readFlagObject(tokenDocument, MODULE_ID, FLAG_KEY),
        worldLegacy: readFlagObject(tokenDocument, "world", "mkCorpseToken"),
        moduleLegacy: readFlagObject(tokenDocument, "mk-corpse-token", FLAG_KEY)
          ?? tokenDocument?.flags?.["mk-corpse-token"]
          ?? tokenDocument?._source?.flags?.["mk-corpse-token"]
      });

      if (!result.hasLegacy) continue;

      updates.push({
        _id: tokenDocument.id,
        [`flags.${MODULE_ID}.${FLAG_KEY}`]: result.data,
        "flags.world.-=mkCorpseToken": null,
        "flags.-=mk-corpse-token": null
      });
    }

    if (updates.length === 0) continue;

    try {
      await scene.updateEmbeddedDocuments("Token", updates);
      migrated += updates.length;
    } catch (err) {
      errors += updates.length;
      error(`Failed to migrate legacy Corpse Token flags in scene ${scene.name ?? scene.id}`, err);
    }
  }

  if (errors === 0) {
    await game.settings.set(MODULE_ID, SETTINGS.migrationVersion, CORPSE_TOKEN_MIGRATION_VERSION);
    if (migrated > 0) log(`Migrated ${migrated} legacy Corpse Token flag set(s).`);
  } else {
    warn(`Corpse Token migration left ${errors} token(s) pending. It will retry on the next GM ready.`);
  }

  return { migrated, errors, skipped: false };
}

function getOwnValue(target, key) {
  if (!target || typeof target !== "object") return { exists: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!descriptor) return { exists: false, value: undefined };
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
    "delta.system.attributes.hp.value",
    "delta.system.attributes.hp",
    "delta.system.attributes",
    "actorData.system.attributes.hp.value",
    "actorData.system.attributes.hp",
    "actorData.system.attributes",
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
  const gridSize = getGridSize();
  const fallPoint = getFootprintBottomCenterPosition(state, gridSize);
  const renderedBottomCenter = getRenderedBottomCenterPosition(state, gridSize);
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
    footprint: {
      width: state.width,
      height: state.height,
      pixelWidth: state.footprintPixelWidth,
      pixelHeight: state.footprintPixelHeight
    }
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
  const gridSize = getGridSize();
  const currentFallPoint = getFootprintBottomCenterPosition(current, gridSize);
  const currentRenderedBottomCenter = getRenderedBottomCenterPosition(current, gridSize);
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

async function getCorpsePlacementForFallPoint(fallPoint) {
  const corpseImage = getCorpseImageSetting();
  if (!corpseImage) throw new Error("Corpse Token image is not configured.");

  const gridSize = getGridSize();
  const corpseWidth = toFiniteNumber(getSetting(SETTINGS.width), 1);
  const corpseHeight = toFiniteNumber(getSetting(SETTINGS.height), 1);
  const corpseScale = toFiniteNumber(getSetting(SETTINGS.scale), 0.7);
  const alignVisualBottom = Boolean(getSetting(SETTINGS.alignVisualBottom));
  const corpseYOffset = toFiniteNumber(getSetting(SETTINGS.yOffset), 0);
  const corpseImageAlphaBounds = alignVisualBottom
    ? await getImageAlphaBounds(corpseImage)
    : defaultImageAlphaBounds(corpseImage, "disabled");

  const corpseTopLeft = alignVisualBottom
    ? getTopLeftForVisualBottomCenter(
      fallPoint,
      corpseWidth,
      corpseHeight,
      corpseScale,
      corpseYOffset,
      corpseImageAlphaBounds,
      gridSize
    )
    : (() => {
      const topLeft = getTopLeftForFootprintBottomCenter(
        fallPoint,
        corpseWidth,
        corpseHeight,
        gridSize
      );
      return { x: topLeft.x, y: topLeft.y + corpseYOffset };
    })();

  const corpseVisualBottomCenter = getVisualBottomCenterForTopLeft(
    corpseTopLeft,
    corpseWidth,
    corpseHeight,
    corpseScale,
    corpseImageAlphaBounds,
    gridSize
  );
  const corpseFullTextureBottomCenter = getFullTextureBottomCenterForTopLeft(
    corpseTopLeft,
    corpseWidth,
    corpseHeight,
    corpseScale,
    gridSize
  );
  const corpseFootprintBottomCenter = getFootprintBottomCenterPosition({
    x: corpseTopLeft.x,
    y: corpseTopLeft.y,
    width: corpseWidth,
    height: corpseHeight
  }, gridSize);

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

  const gridSize = getGridSize();
  const cachedDeathPosition = takeCachedDeathPosition(document);
  const original = cachedDeathPosition?.state ?? getTokenState(document);
  const fallPoint = cachedDeathPosition?.fallPoint
    ?? cachedDeathPosition?.bottomCenter
    ?? getFootprintBottomCenterPosition(original, gridSize);
  const placement = await getCorpsePlacementForFallPoint(fallPoint);
  const previous = getPreviousStoredState(document);

  const intendedCorpse = {
    texture: placement.corpseImage,
    x: placement.corpseTopLeft.x,
    y: placement.corpseTopLeft.y,
    width: placement.corpseWidth,
    height: placement.corpseHeight,
    pixelWidth: placement.corpseWidth * gridSize,
    pixelHeight: placement.corpseHeight * gridSize,
    scaleX: placement.corpseScale,
    scaleY: placement.corpseScale,
    alignVisualBottom: placement.alignVisualBottom,
    yOffset: placement.corpseYOffset,
    fallPoint,
    corpseVisualBottomCenter: placement.corpseVisualBottomCenter,
    corpseFullTextureBottomCenter: placement.corpseFullTextureBottomCenter,
    corpseFootprintBottomCenter: placement.corpseFootprintBottomCenter,
    corpseImageAlphaBounds: placement.corpseImageAlphaBounds
  };

  await document.update({
    "texture.src": placement.corpseImage,
    "texture.scaleX": placement.corpseScale,
    "texture.scaleY": placement.corpseScale,
    x: placement.corpseTopLeft.x,
    y: placement.corpseTopLeft.y,
    width: placement.corpseWidth,
    height: placement.corpseHeight,
    ...buildStoredFlags(original, fallPoint, previous, {
      source: cachedDeathPosition?.source ?? "applyCorpseToToken-current-token-state",
      initial: original,
      intendedCorpse
    })
  });

  return true;
}

async function restoreCorpseToken(tokenOrDocument) {
  const document = getTokenDocument(tokenOrDocument);
  if (!document || !hasActiveCorpseData(document)) return false;

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
    const currentFallPoint = getFootprintBottomCenterPosition(getTokenState(document), getGridSize());
    const restoredTopLeft = getTopLeftForFootprintBottomCenter(
      currentFallPoint,
      originalWidth,
      originalHeight,
      getGridSize()
    );
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
      if (await restoreCorpseToken(token)) restored.push(tokenName(token));
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
  if (!game.user?.isGM || !canvas?.ready) return [];
  if (!getSetting(SETTINGS.enabled) || updateInProgress) return [];

  updateInProgress = true;
  const changed = [];

  try {
    for (const token of canvas.tokens?.placeables ?? []) {
      try {
        if (await maybeRestoreHealedToken(token)) continue;
        if (await applyCorpseToToken(token)) changed.push(tokenName(token));
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
  if (!game.user?.isGM || !canvas?.ready) return [];
  if (!getSetting(SETTINGS.enabled) || !shouldProcessActor(actor) || updateInProgress) return [];

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
        if (await maybeRestoreHealedToken(document)) continue;
        if (await applyCorpseToToken(document)) changed.push(tokenName(document));
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
  if (!game.user?.isGM || !getSetting(SETTINGS.enabled)) return;
  if (scanTimer) clearTimeout(scanTimer);

  scanTimer = setTimeout(() => {
    scanTimer = null;
    scanSceneForDeadTokens();
  }, 150);
}

async function checkSingleToken(tokenOrDocument) {
  if (!game.user?.isGM || !canvas?.ready) return false;
  if (!getSetting(SETTINGS.enabled) || updateInProgress) return false;

  updateInProgress = true;
  try {
    if (await maybeRestoreHealedToken(tokenOrDocument)) return true;
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
    debugSelectedTokenCoordinates,
    migrateLegacyCorpseTokenFlags
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
    if (!getSetting(SETTINGS.enabled) || !hpWasChangedInActorUpdate(changed)) return;
    const newHp = getChangedHpFromActorUpdate(changed);
    if (newHp !== null && newHp > 0) return;
    cacheActorDeathPositions(actor, "preUpdateActor-hp-change");
  });

  Hooks.on("preUpdateToken", (tokenDocument, changed) => {
    if (!getSetting(SETTINGS.enabled) || !hpWasChangedInTokenUpdate(changed)) return;
    const newHp = getChangedHpFromTokenUpdate(changed);
    if (newHp !== null && newHp > 0) return;
    captureTokenPositionForDeath(tokenDocument, "preUpdateToken-hp-change");
  });

  Hooks.on("updateActor", (actor, changed) => {
    if (!getSetting(SETTINGS.enabled) || !hpWasChangedInActorUpdate(changed)) return;
    scheduleActorProcessing(actor);
  });

  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!getSetting(SETTINGS.enabled) || !hpWasChangedInTokenUpdate(changed)) return;
    scheduleTokenProcessing(tokenDocument);
  });

  Hooks.on("canvasReady", () => {
    if (getSetting(SETTINGS.scanOnCanvasReady)) scheduleSceneScan();
  });

  log("Automation registered.");
}

Hooks.on("mkShadowdarkCorpseImageSettingChanged", () => {
  missingCorpseImageWarningShown = false;
  imageAlphaBoundsCache.clear();
});

Hooks.once("ready", async () => {
  await migrateLegacyCorpseTokenFlags();
  attachApi();
  registerHooks();
});
