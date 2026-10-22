import { applyTargetsToRollConfig, collectValidTargets, isFocusCheckRoll } from "../targeting-assistant/targeting-state.js";
import { getSpellTemplate, spellRangeCells } from "./config.js";
import { aimDirection, createCoordinateFrame, footprintCenter, footprintIntersects, footprintRange, templateCells, validPath } from "./geometry.js";
import { describeTemplate, registerSpellTemplateSettings, templateText } from "./settings.js";
import { registerSpellAreaTiles, removeSpellAreaTilesForFocus } from "./area-tiles.js";
import { registerFireWallAnimations } from "./fire-animation.js";

const MODULE_ID = "mk-shadowdark";
const WRAPPED = Symbol.for(`${MODULE_ID}.spellTemplates.castSpell`);
const CHANGED = "mkShadowdarkSpellTemplateChanged";
const contexts = new WeakMap();
let active = null;

function enabled(environment) {
  try { return environment.game?.settings?.get?.(MODULE_ID, "targetingAssistantEnabled") !== false; }
  catch { return true; }
}

export function hasSpellTemplate(config) { return Boolean(config?.[MODULE_ID]?.spellTemplate); }
export function isAreaOnlySpellTemplate(config) { return config?.[MODULE_ID]?.spellTemplate?.areaOnly === true; }

export function spellTemplateCanCast(config) {
  const context = contexts.get(config);
  return Boolean(context?.confirmed && context.valid() && context.refreshCells() && context.inRange
    && (context.template.areaOnly ? validPath(context.cells, context.template.length, context.frame) : context.targets().length));
}

export function getSpellTemplateTargets(config) {
  const context = contexts.get(config);
  return context && !context.cancelled && context.confirmed ? context.targets() : [];
}

export function syncSpellTemplateTargets(config) {
  const context = contexts.get(config);
  return context && !context.cancelled && context.confirmed ? context.syncTargets() : [];
}

function tokenDocument(token) { return token?.document ?? token; }
function tokenUuid(token) { return tokenDocument(token)?.uuid; }

export function setSceneTargets(ids, environment = globalThis) {
  const desired = new Set(ids);
  const user = environment.game?.user;
  if (!user) return;
  // Token.setTarget is the supported targeting API on both Foundry v13 and v14.
  for (const token of [...(user.targets ?? [])]) {
    if (!desired.has(tokenDocument(token)?.id)) token.setTarget?.(false, { releaseOthers: false });
  }
  for (const token of environment.canvas?.tokens?.placeables ?? []) {
    if (desired.has(tokenDocument(token)?.id) && !user.targets?.has?.(token)) token.setTarget(true, { releaseOthers: false });
  }
}

export function visibleSceneToken(token, environment = globalThis) {
  const document = tokenDocument(token);
  return Boolean(token?.actor && document?.parent?.id === environment.canvas?.scene?.id
    && !token.destroyed && !token.isPreview && !document.isSecret && (environment.game?.user?.isGM
      || (!document.hidden && token.visible !== false && token.isVisible !== false)));
}

export function findCasterToken(actor, environment = globalThis) {
  const candidates = (environment.canvas?.tokens?.placeables ?? []).filter(token => visibleSceneToken(token, environment)
    && (token.actor === actor || token.actor?.uuid === actor?.uuid)
    && (environment.game?.user?.isGM || tokenDocument(token)?.isOwner));
  const selected = candidates.filter(token => token.controlled);
  if (selected.length === 1) return selected[0];
  return candidates.length === 1 ? candidates[0] : null;
}

export class SpellTemplatePlacement {
  constructor(spell, actor, config, environment = globalThis) {
    this.env = environment;
    this.spell = spell;
    this.actor = actor;
    this.config = config;
    this.template = getSpellTemplate(spell);
    this.caster = findCasterToken(actor, environment);
    this.frame = createCoordinateFrame(environment);
    this.excluded = new Set();
    this.direction = 0;
    this.directionOffset = 0;
    this.confirmed = false;
    this.cancelled = false;
    this.attempted = false;
    this.cells = [];
    this.path = [];
    this.pendingFrame = null;
    this.previous = [...(environment.game?.user?.targets ?? [])].map(token => tokenDocument(token)?.id).filter(Boolean);
    this.onMove = event => this.pointerMove(event);
    this.onDown = event => {
      if (event.target !== this.view || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || this.confirmed) return;
      event.preventDefault(); event.stopImmediatePropagation();
      this.pointerMove(event);
      if (this.template.shape === "path") { this.choosePathCell(this.anchor); this.redraw(); return; }
      this.redraw();
      this.accept();
    };
    this.onKey = event => {
      if (!this.resolve || event.target?.closest?.("input, select, textarea, [contenteditable='true']")) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); this.cancel(); }
      else if (event.key.toLowerCase() === "r") {
        event.preventDefault(); event.stopImmediatePropagation(); this.rotate(event.shiftKey ? -1 : 1);
      }
    };
  }

  text(key, values) { return templateText(key, values, this.env); }
  valid() {
    const frame = createCoordinateFrame(this.env);
    return !this.cancelled && this.env.canvas?.scene === this.frame?.scene && frame?.signature === this.frame?.signature
      && frame?.isometric === this.frame?.isometric && this.actor?.isOwner !== false
      && visibleSceneToken(this.caster, this.env);
  }

  targets() {
    if (!this.valid() || !this.refreshCells() || !this.inRange) return [];
    if (this.template.areaOnly) return [];
    return collectValidTargets((this.env.canvas.tokens?.placeables ?? []).filter(token => {
      if (!visibleSceneToken(token, this.env) || this.excluded.has(tokenUuid(token))) return false;
      if (this.template.excludeCaster && tokenDocument(token)?.id === tokenDocument(this.caster)?.id) return false;
      return footprintIntersects(this.cells, this.frame.footprint(tokenDocument(token)));
    }));
  }

  syncTargets() {
    const targets = this.confirmed || this.resolve ? this.targets() : [];
    const sceneTokens = new Map(this.env.canvas.tokens.placeables.map(token => [tokenUuid(token), tokenDocument(token)?.id]));
    const ids = targets.map(target => sceneTokens.get(target.uuid)).filter(Boolean);
    const current = [...(this.env.game.user.targets ?? [])].map(token => tokenDocument(token)?.id).sort().join("|");
    const selectionChanged = current !== [...ids].sort().join("|");
    if (selectionChanged) setSceneTargets(ids, this.env);
    const previous = (this.config.targetUuids ?? []).join("|");
    applyTargetsToRollConfig(this.config, targets);
    if (selectionChanged || previous !== this.config.targetUuids.join("|")) {
      this.env.Hooks?.callAll?.("mkShadowdarkTargetingChanged", this.config, targets);
      this.env.Hooks?.callAll?.(CHANGED, this.config);
    }
    return targets;
  }

  schedule() {
    if (this.pendingFrame !== null || this.cancelled) return;
    this.pendingFrame = this.env.requestAnimationFrame(() => { this.pendingFrame = null; this.redraw(); });
  }

  pointerMove(event) {
    if (this.confirmed || !this.resolve) return;
    const rect = this.view.getBoundingClientRect();
    const screen = this.env.canvas.app.screen ?? this.env.canvas.app.renderer?.screen;
    const point = this.env.canvas.stage.toLocal({ x: (event.clientX - rect.left) * (screen?.width ?? rect.width) / rect.width,
      y: (event.clientY - rect.top) * (screen?.height ?? rect.height) / rect.height });
    const coordinates = this.frame.coordinates(point);
    if (!Number.isFinite(coordinates?.column) || !Number.isFinite(coordinates?.row)) return;
    const previous = `${this.direction}|${this.anchor?.column},${this.anchor?.row}`;
    if (this.template.origin === "caster" && this.template.shape !== "circle") {
      this.direction = (aimDirection(footprintCenter(this.frame.footprint(tokenDocument(this.caster))), coordinates,
        this.template.shape === "cube") + this.directionOffset) % 8;
    } else this.anchor = { column: Math.floor(coordinates.column), row: Math.floor(coordinates.row) };
    if (previous !== `${this.direction}|${this.anchor?.column},${this.anchor?.row}`) this.schedule();
  }

  rotate(step) {
    if (this.confirmed || (!["line", "wall"].includes(this.template.shape)
      && !(this.template.shape === "cube" && this.template.origin === "caster"))) return;
    const amount = step * (this.template.shape === "cube" ? 2 : 1);
    this.directionOffset = (this.directionOffset + amount + 8) % 8;
    this.direction = (this.direction + amount + 8) % 8;
    this.schedule();
  }

  refreshCells() {
    const caster = this.frame.footprint(tokenDocument(this.caster));
    if (!caster) return false;
    this.anchor ??= { column: Math.floor(footprintCenter(caster).column), row: Math.floor(footprintCenter(caster).row) };
    if (this.template.shape === "path") {
      this.cells = this.path.map(cell => ({ ...cell }));
      this.inRange = this.cells.every(cell => footprintRange(caster, cell) <= spellRangeCells(this.spell));
      this.cellKey = `${JSON.stringify(this.cells)}|${this.anchor.column},${this.anchor.row}|${this.inRange}`;
      return true;
    }
    this.inRange = this.template.origin === "caster" || footprintRange(caster, this.anchor) <= spellRangeCells(this.spell);
    const key = `${this.direction}|${this.anchor.column},${this.anchor.row}|${JSON.stringify(caster)}|${this.inRange}`;
    if (key !== this.cellKey) {
      this.cells = templateCells(this.template, this.anchor, this.direction, caster, this.frame);
      this.cellKey = key;
    }
    return true;
  }

  choosePathCell(cell) {
    if (this.confirmed || !cell || !this.valid() || !this.pathCellAllowed(cell)) return false;
    const existing = this.path.findIndex(other => other.column === cell.column && other.row === cell.row);
    if (existing >= 0) this.path.length = existing + 1;
    else if (this.path.length < this.template.length) this.path.push({ ...cell });
    else return false;
    return true;
  }

  pathCellAllowed(cell) {
    const caster = this.frame.footprint(tokenDocument(this.caster));
    if (!caster || !Number.isInteger(cell?.column) || !Number.isInteger(cell?.row) || cell.column < 0 || cell.row < 0
      || cell.column >= this.frame.columns || cell.row >= this.frame.rows
      || footprintRange(caster, cell) > spellRangeCells(this.spell)) return false;
    if (this.path.some(other => other.column === cell.column && other.row === cell.row)) return true;
    const previous = this.path.at(-1);
    return this.path.length < this.template.length && (!previous
      || Math.abs(cell.column - previous.column) + Math.abs(cell.row - previous.row) === 1);
  }

  redraw() {
    if (!this.valid() || !this.refreshCells()) { this.cancel(); return; }
    const drawKey = this.cellKey;
    if (drawKey !== this.drawKey && this.graphics) {
      this.graphics.clear();
      const color = this.inRange ? Number.parseInt(this.template.color.slice(1), 16) : 0xcc5555;
      const preview = this.template.shape === "path" && this.anchor
        && !this.cells.some(cell => cell.column === this.anchor.column && cell.row === this.anchor.row)
        && this.anchor.column >= 0 && this.anchor.row >= 0
        && this.anchor.column < this.frame.columns && this.anchor.row < this.frame.rows ? this.anchor : null;
      for (const cell of [...this.cells, ...(preview ? [preview] : [])]) {
        const points = [[0, 0], [1, 0], [1, 1], [0, 1]].flatMap(([x, y]) => {
          const point = this.frame.project(cell.column + x, cell.row + y); return [point.x, point.y];
        });
        const cellColor = cell === preview && !this.pathCellAllowed(cell) ? 0xcc5555 : color;
        this.graphics.lineStyle(1, cellColor, 0.8);
        this.graphics.beginFill(cellColor, cell === preview ? 0.1 : 0.22);
        this.graphics.drawPolygon(points);
        this.graphics.endFill();
      }
      this.drawKey = drawKey;
    }
    const targets = this.syncTargets();
    if (this.status) this.status.textContent = this.template.areaOnly
      ? this.text("pathCount", { count: this.cells.length, length: this.template.length })
      : this.text(!this.inRange ? "outOfRange" : "targetCount", { count: targets.length });
    if (this.confirmButton) this.confirmButton.disabled = !this.inRange || (this.template.areaOnly
      ? !validPath(this.cells, this.template.length, this.frame) : !targets.length);
    if (this.targetList && !this.confirmed) this.renderTargetList();
  }

  renderTargetList() {
    const exclusions = this.excluded;
    this.excluded = new Set();
    const all = this.targets();
    this.excluded = exclusions;
    const signature = all.map(target => `${target.uuid}:${target.name}:${exclusions.has(target.uuid)}`).join("|");
    if (signature === this.listKey) return;
    this.listKey = signature;
    this.targetList.replaceChildren();
    for (const target of all) {
      const label = this.env.document.createElement("label");
      const input = this.env.document.createElement("input");
      input.type = "checkbox"; input.checked = !this.excluded.has(target.uuid);
      input.addEventListener("change", () => {
        if (input.checked) this.excluded.delete(target.uuid); else this.excluded.add(target.uuid);
        this.redraw();
      });
      const name = this.env.document.createElement("span");
      name.textContent = target.name;
      label.append(input, name); this.targetList.append(label);
    }
  }

  createControls() {
    const document = this.env.document;
    this.hud = document.createElement("aside");
    this.hud.id = "mk-spell-template-placement";
    this.hud.setAttribute("aria-label", this.text("placementTitle", { name: this.spell.name }));
    const heading = document.createElement("strong");
    heading.textContent = this.text("placementTitle", { name: this.spell.name });
    const hint = document.createElement("p");
    hint.textContent = this.text(this.template.areaOnly ? "pathHint" : "placementHint");
    const dimensions = document.createElement("p");
    dimensions.textContent = describeTemplate(this.template, this.env);
    this.status = document.createElement("p");
    this.status.setAttribute("aria-live", "polite");
    this.targetList = document.createElement("div");
    this.targetList.className = "mk-spell-template-targets";
    const targetHint = document.createElement("small");
    targetHint.textContent = this.text(this.template.areaOnly ? "tileHint" : "excludeHint");
    const actions = document.createElement("div");
    actions.className = "mk-spell-template-actions";
    const button = (key, action) => {
      const element = document.createElement("button"); element.type = "button";
      element.textContent = this.text(key); element.addEventListener("click", action); actions.append(element); return element;
    };
    if (["line", "wall"].includes(this.template.shape) || (this.template.shape === "cube" && this.template.origin === "caster")) {
      button("rotateLeft", () => this.rotate(-1)); button("rotateRight", () => this.rotate(1));
    }
    if (this.template.shape === "path") {
      button("undoCell", () => { this.path.pop(); this.redraw(); });
      button("clearPath", () => { this.path = []; this.redraw(); });
    }
    button("cancel", () => this.cancel());
    this.confirmButton = button("confirm", () => this.accept());
    this.hud.append(heading, dimensions, hint, this.status, this.targetList, targetHint, actions);
    document.body.append(this.hud);
  }

  async restoreSourceSheet() {
    const sheet = this.minimizedSheet;
    this.minimizedSheet = null;
    if (sheet?.rendered) {
      try { await sheet.maximize(); }
      catch (error) { this.env.console?.warn(`${MODULE_ID} | Could not restore caster sheet`, error); }
    }
  }

  async start() {
    if (!this.template || !this.caster || !this.frame || !this.env.canvas?.primary || !this.env.PIXI?.Graphics) {
      this.env.ui?.notifications?.warn(this.text("selectCaster")); return Promise.resolve(false);
    }
    if (this.template.areaOnly && !Array.from(this.env.game.users ?? []).some(user => user.active && user.isGM)) {
      this.env.ui?.notifications?.warn(this.text("gmRequired")); return false;
    }
    const sheet = this.actor.sheet;
    if (sheet?.rendered && !sheet.minimized && typeof sheet.minimize === "function" && typeof sheet.maximize === "function") {
      try { await sheet.minimize(); this.minimizedSheet = sheet; }
      catch (error) { this.env.console?.warn(`${MODULE_ID} | Could not minimize caster sheet`, error); }
    }
    if (!this.valid()) return false;
    this.env.game.modules?.get?.(MODULE_ID)?.api?.isometricBoard?.stopInteraction?.();
    this.graphics = new this.env.PIXI.Graphics();
    this.graphics.eventMode = "none";
    this.graphics.elevation = this.env.canvas.primary.background?.elevation ?? 0;
    this.graphics.sortLayer = (this.env.canvas.primary.constructor.SORT_LAYERS?.TOKENS ?? 700) - 0.5;
    this.env.canvas.primary.addChild(this.graphics); this.env.canvas.primary.sortDirty = true;
    this.view = this.env.canvas.app.canvas ?? this.env.canvas.app.view;
    this.createControls();
    this.env.document.addEventListener("pointerdown", this.onDown, true);
    this.view.addEventListener("pointermove", this.onMove);
    this.env.document.addEventListener("keydown", this.onKey, true);
    return new Promise(resolve => { this.resolve = resolve; this.redraw(); });
  }

  accept() {
    const valid = this.valid() && this.refreshCells();
    if (!this.resolve || !valid || !this.inRange || (this.template.areaOnly
      ? !validPath(this.cells, this.template.length, this.frame) : !this.targets().length)) {
      this.env.ui?.notifications?.warn(this.text(!this.inRange ? "outOfRange" : this.template.areaOnly ? "finishPath" : "noTargets",
        { length: this.template.length })); return false;
    }
    this.confirmed = true;
    this.config[MODULE_ID] ??= {};
    this.config[MODULE_ID].spellTemplate = { ...this.template, originCell: { ...this.anchor }, direction: this.direction,
      sceneId: this.frame.scene.id, confirmed: true };
    if (this.template.areaOnly) Object.assign(this.config[MODULE_ID].spellTemplate, {
      cells: this.cells.map(cell => ({ ...cell })), frameSignature: this.frame.signature, isometric: this.frame.isometric,
      casterTokenUuid: tokenUuid(this.caster) });
    this.syncTargets();
    this.stopPlacement();
    const resolve = this.resolve; this.resolve = null; resolve(true);
    return true;
  }

  stopPlacement() {
    this.env.document?.removeEventListener("pointerdown", this.onDown, true);
    this.view?.removeEventListener("pointermove", this.onMove);
    this.env.document?.removeEventListener("keydown", this.onKey, true);
    this.hud?.remove(); this.hud = null; this.status = null; this.confirmButton = null; this.targetList = null;
  }

  cancel() {
    this.cancelled = true;
    const resolve = this.resolve; this.resolve = null;
    if (this.config[MODULE_ID]?.spellTemplate) this.config[MODULE_ID].spellTemplate.confirmed = false;
    this.cleanup(true);
    resolve?.(false);
  }

  cleanup(restore = !this.attempted) {
    this.stopPlacement();
    if (this.pendingFrame !== null) this.env.cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = null;
    this.graphics?.parent?.removeChild(this.graphics);
    this.graphics?.destroy(); this.graphics = null;
    if (restore && this.frame?.scene && this.env.canvas?.scene === this.frame.scene) {
      const existing = new Set((this.env.canvas.tokens?.placeables ?? []).map(token => tokenDocument(token)?.id));
      setSceneTargets(this.previous.filter(id => existing.has(id)), this.env);
    }
  }
}

export function installSpellTemplates(environment = globalThis) {
  const prototypes = new Set(Object.values(environment.CONFIG?.Actor?.dataModels ?? {}).map(model => model?.prototype));
  for (const actor of environment.game?.actors ?? []) prototypes.add(actor.system?.constructor?.prototype);
  for (const prototype of prototypes) {
    const original = prototype?.castSpell;
    if (typeof original !== "function" || original[WRAPPED]) continue;
    const wrapped = async function(spellUuid, config = {}, ...args) {
      if (!enabled(environment) || isFocusCheckRoll(config)) return original.call(this, spellUuid, config, ...args);
      if (active) { environment.ui?.notifications?.warn(templateText("busy", undefined, environment)); return false; }
      const spell = await environment.fromUuid(spellUuid);
      if (active) { environment.ui?.notifications?.warn(templateText("busy", undefined, environment)); return false; }
      if (!getSpellTemplate(spell) || spell.system?.lost) return original.call(this, spellUuid, config, ...args);
      const context = new SpellTemplatePlacement(spell, this.parent, config, environment);
      active = context; contexts.set(config, context);
      try {
        const placed = await context.start();
        await context.restoreSourceSheet();
        if (!placed) return false;
        return await original.call(this, spellUuid, config, ...args);
      } finally {
        context.cleanup(); contexts.delete(config);
        if (active === context) active = null;
        await context.restoreSourceSheet();
      }
    };
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    prototype.castSpell = wrapped;
  }
}

export function registerSpellTemplates(environment = globalThis) {
  const hooks = environment.Hooks;
  registerSpellTemplateSettings(hooks);
  registerSpellAreaTiles(environment);
  registerFireWallAnimations(environment);
  hooks.once("ready", () => {
    if (environment.game?.system?.id !== "shadowdark") return;
    installSpellTemplates(environment);
    const module = environment.game.modules?.get?.(MODULE_ID);
    if (module) {
      module.api ??= {};
      module.api.spellTemplates = { get: getSpellTemplate, cancel: () => active?.cancel(),
        removeForFocus: options => removeSpellAreaTilesForFocus(options, environment),
        get placing() { return Boolean(active?.resolve); } };
    }
  });
  for (const name of ["updateToken", "deleteToken", "visibilityRefresh"]) hooks.on(name, () => active?.schedule());
  hooks.on("canvasTearDown", () => active?.cancel());
  hooks.on("updateScene", scene => { if (active?.frame?.scene?.id === scene?.id) active.cancel(); });
  for (const name of ["SD-Player-Spell", "SD-NPC-Spell-Cast"]) hooks.on(name, config => {
    const context = contexts.get(config);
    if (!context) return;
    context.syncTargets();
    if (!spellTemplateCanCast(config)) {
      environment.ui?.notifications?.warn(templateText(context.template.areaOnly ? "finishPath" : "noTargets",
        { length: context.template.length }, environment)); return false;
    }
    context.attempted = true;
  });
}

if (globalThis.Hooks) registerSpellTemplates();
