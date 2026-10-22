import { getShadowdarkRoll, getShadowdarkRollConfig } from "../auto-damage/auto-damage-operation.js";
import { isFocusCheckRoll } from "../targeting-assistant/targeting-state.js";
import { getSpellTemplate, spellRangeCells } from "./config.js";
import { createSceneCoordinateFrame, footprintRange, validPath } from "./geometry.js";
import { templateText } from "./settings.js";

const MODULE_ID = "mk-shadowdark";
const TILE_FLAG = "spellAreaTile";
const REMOVE_FOCUS_AREA = "remove-focus-spell-area";
const processing = new Set();
const endedByGame = new WeakMap();
const removalsByGame = new WeakMap();

function values(collection) {
  return Array.from(collection?.contents ?? collection?.values?.() ?? collection ?? []);
}

function authoritative(environment) {
  const gm = values(environment.game?.users).filter(user => user.active && user.isGM)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  return Boolean(gm && gm.id === environment.game?.user?.id);
}

function focusSessions(actor, environment) {
  const api = environment.game.modules?.get?.(MODULE_ID)?.api?.focus;
  return api?.getSessions?.(actor) ?? actor?.getFlag?.(MODULE_ID, "focusTracker")?.sessions
    ?? actor?.flags?.[MODULE_ID]?.focusTracker?.sessions ?? [];
}

function endedCasts(environment) {
  const game = environment.game;
  if (!endedByGame.has(game)) endedByGame.set(game, new Set());
  return endedByGame.get(game);
}

function endedKey(actorUuid, castId) { return `${actorUuid}|${castId}`; }

export async function removeSpellAreaTilesForFocus({ actorUuid, castId } = {}, environment = globalThis) {
  if (typeof actorUuid !== "string" || !actorUuid.trim() || typeof castId !== "string" || !castId.trim()) {
    return { removed: 0, queued: false };
  }
  if (!authoritative(environment)) {
    if (!environment.game?.socket?.emit) return { removed: 0, queued: false };
    environment.game.socket.emit(`module.${MODULE_ID}`, { type: REMOVE_FOCUS_AREA, actorUuid, castId });
    return { removed: 0, queued: true };
  }
  const actor = await environment.fromUuid?.(actorUuid);
  if (!actor || focusSessions(actor, environment).some(session => session.effectCastId === castId)) {
    return { removed: 0, queued: false };
  }
  let removals = removalsByGame.get(environment.game);
  if (!removals) { removals = new Map(); removalsByGame.set(environment.game, removals); }
  const key = endedKey(actorUuid, castId);
  if (removals.has(key)) return removals.get(key);
  const task = (async () => {
    const message = environment.game.messages?.get?.(castId.replace(/^ChatMessage\./, ""));
    const config = getShadowdarkRollConfig(message);
    const sourceMatches = config?.actorUuid === actorUuid && config?.[MODULE_ID]?.spellTemplate?.areaOnly;
    const matches = [];
    for (const scene of values(environment.game.scenes)) {
      const tiles = values(scene.tiles).filter(tile => {
        const area = tile.flags?.[MODULE_ID]?.[TILE_FLAG];
        return area?.castId === castId && area.focusManaged !== false
          && (area.actorUuid === actorUuid || (!area.actorUuid && sourceMatches));
      });
      if (tiles.length) matches.push({ scene, tiles });
    }
    if (!sourceMatches && !matches.length) return { removed: 0, queued: false };
    const ended = endedCasts(environment);
    ended.add(key);
    if (ended.size > 500) ended.delete(ended.values().next().value);
    // Mark the cast before deleting: a slow tile creation must not resurrect an ended spell.
    if (sourceMatches && message?.setFlag) {
      try { await message.setFlag(MODULE_ID, TILE_FLAG, { ...message.flags?.[MODULE_ID]?.[TILE_FLAG], ended: true }); }
      catch (error) { environment.console?.warn(`${MODULE_ID} | Could not record ended area spell`, error); }
    }
    let removed = 0;
    for (const { scene, tiles } of matches) {
      await scene.deleteEmbeddedDocuments("Tile", tiles.map(tile => tile.id));
      removed += tiles.length;
    }
    return { removed, queued: false };
  })();
  removals.set(key, task);
  try { return await task; } finally { if (removals.get(key) === task) removals.delete(key); }
}

export async function reconcileFocusAreaTiles(environment = globalThis) {
  if (!authoritative(environment)) return;
  const casts = new Map();
  for (const scene of values(environment.game.scenes)) for (const tile of values(scene.tiles)) {
    const area = tile.flags?.[MODULE_ID]?.[TILE_FLAG];
    if (area?.focusManaged && area.actorUuid && area.castId) casts.set(endedKey(area.actorUuid, area.castId), area);
  }
  for (const area of casts.values()) await removeSpellAreaTilesForFocus({ actorUuid: area.actorUuid, castId: area.castId }, environment);
}

export function areaTileGeometry(cells, frame) {
  const polygons = cells.map(cell => [[0, 0], [1, 0], [1, 1], [0, 1]]
    .map(([column, row]) => frame.project(cell.column + column, cell.row + row)));
  const points = polygons.flat();
  if (!points.length || points.some(point => !Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return null;
  const x = Math.floor(Math.min(...points.map(point => point.x))) - 2;
  const y = Math.floor(Math.min(...points.map(point => point.y))) - 2;
  return { x, y, width: Math.ceil(Math.max(...points.map(point => point.x))) - x + 2,
    height: Math.ceil(Math.max(...points.map(point => point.y))) - y + 2, polygons };
}

export function areaTileTexture(geometry, color, environment = globalThis) {
  const image = environment.document.createElement("canvas");
  const scale = Math.min(1, 2048 / Math.max(geometry.width, geometry.height));
  image.width = Math.max(1, Math.ceil(geometry.width * scale));
  image.height = Math.max(1, Math.ceil(geometry.height * scale));
  const context = image.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.scale(scale, scale);
  context.translate(-geometry.x, -geometry.y);
  const fill = context.createLinearGradient(geometry.x, geometry.y, geometry.x, geometry.y + geometry.height);
  fill.addColorStop(0, "#ffe184"); fill.addColorStop(0.45, color); fill.addColorStop(1, "#b92208");
  context.fillStyle = fill;
  context.strokeStyle = "#ffdf8d";
  context.lineWidth = 2 / scale;
  for (const polygon of geometry.polygons) {
    context.beginPath();
    polygon.forEach((point, index) => context[index ? "lineTo" : "moveTo"](point.x, point.y));
    context.closePath(); context.fill(); context.stroke();
  }
  // Core TextureData accepts inline PNGs and persists them as world media files.
  return image.toDataURL("image/png");
}

export async function createSpellAreaTile(message, environment = globalThis) {
  if (!authoritative(environment) || !message?.id) return null;
  const config = getShadowdarkRollConfig(message);
  const area = config?.[MODULE_ID]?.spellTemplate;
  if (!area?.confirmed || !area.areaOnly || isFocusCheckRoll(config) || message.getFlag?.(MODULE_ID, TILE_FLAG)
    || message.flags?.[MODULE_ID]?.[TILE_FLAG]) return null;
  const roll = getShadowdarkRoll(message, "main");
  if (roll?.success !== true || roll.criticalFailure === true) return null;
  const castId = message.uuid ?? message.id;
  if (processing.has(castId)) return null;
  processing.add(castId);
  try {
    const spell = await environment.fromUuid?.(config.cast?.spellUuid);
    const template = getSpellTemplate(spell);
    const scene = environment.game.scenes?.get?.(area.sceneId);
    const caster = await environment.fromUuid?.(area.casterTokenUuid);
    const author = message.author ?? environment.game.users?.get?.(message._source?.user);
    if (!template?.areaOnly || !scene || caster?.parent?.id !== scene.id || caster.actor?.uuid !== config.actorUuid
      || !author || (!author.isGM && !caster.actor?.testUserPermission?.(author, "OWNER"))) return null;
    if (endedCasts(environment).has(endedKey(config.actorUuid, castId))) return null;
    const frame = createSceneCoordinateFrame(scene, environment);
    if (!frame || frame.signature !== area.frameSignature || frame.isometric !== area.isometric
      || !validPath(area.cells, template.length, frame)) return null;
    const footprint = frame.footprint(caster);
    if (!footprint || area.cells.some(cell => footprintRange(footprint, cell) > spellRangeCells(spell))) return null;
    const existing = values(scene.tiles).find(tile => tile.flags?.[MODULE_ID]?.[TILE_FLAG]?.castId === castId);
    if (existing) {
      await message.setFlag(MODULE_ID, TILE_FLAG, { sceneId: scene.id, tileId: existing.id });
      return existing;
    }
    const geometry = areaTileGeometry(area.cells, frame);
    if (!geometry) return null;
    const texture = areaTileTexture(geometry, template.color, environment);
    const data = { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height,
      texture: { src: texture }, rotation: 0, alpha: 0.7, hidden: false, locked: false,
      elevation: Number(caster.elevation) || 0,
      flags: { [MODULE_ID]: { [TILE_FLAG]: { castId, sourceSpellUuid: spell.uuid, casterTokenUuid: caster.uuid,
        actorUuid: config.actorUuid, focusManaged: String(spell.system?.duration?.type ?? spell.system?.duration ?? "").toLowerCase() === "focus",
        animation: template.animate ? "fire" : null, color: template.color,
        name: spell.name, cells: area.cells.map(cell => ({ ...cell })) } } } };
    // v14 moved the Tile origin to its configurable anchor; use an explicit top-left origin.
    if (Number(environment.game.release?.generation ?? environment.game.version?.split(".")[0]) >= 14) {
      data.anchorX = 0; data.anchorY = 0;
    }
    const [tile] = await scene.createEmbeddedDocuments("Tile", [data]);
    if (endedCasts(environment).has(endedKey(config.actorUuid, castId)) || message.flags?.[MODULE_ID]?.[TILE_FLAG]?.ended) {
      await removeSpellAreaTilesForFocus({ actorUuid: config.actorUuid, castId }, environment);
      return null;
    }
    if (tile) await message.setFlag(MODULE_ID, TILE_FLAG, { sceneId: scene.id, tileId: tile.id });
    return tile ?? null;
  } finally { processing.delete(castId); }
}

export function registerSpellAreaTiles(environment = globalThis) {
  const cleanupError = error => {
    environment.console?.error(`${MODULE_ID} | Could not remove ended spell area`, error);
    environment.ui?.notifications?.error?.(templateText("tileCleanupError", undefined, environment));
  };
  const handle = message => {
    void createSpellAreaTile(message, environment).catch(error => {
      environment.console?.error(`${MODULE_ID} | Could not create spell area tile`, error);
      environment.ui?.notifications?.error?.(templateText("tileError", undefined, environment));
    });
  };
  environment.Hooks?.on?.("createChatMessage", handle);
  environment.Hooks?.on?.("updateChatMessage", handle);
  environment.Hooks?.once?.("ready", () => {
    environment.game?.socket?.on?.(`module.${MODULE_ID}`, payload => {
      if (payload?.type === REMOVE_FOCUS_AREA && authoritative(environment)) {
        void removeSpellAreaTilesForFocus(payload, environment).catch(cleanupError);
      }
    });
    void reconcileFocusAreaTiles(environment).catch(cleanupError);
  });
  environment.Hooks?.on?.("userConnected", (user, connected) => {
    if (user?.isGM && connected) void reconcileFocusAreaTiles(environment).catch(cleanupError);
  });
}
