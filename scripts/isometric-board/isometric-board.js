import {
  MIN_BOARD_SIZE, MAX_BOARD_SIZE, FEET_PER_CELL, CLOSE_DISTANCE, NEAR_DISTANCE, readLayout, readBoardSize, normalizeBoardSize,
  MIN_TILT, MAX_TILT, normalizeTilt, normalizeRotation, normalizeOffset, normalizeScale, project,
  validCell, cellDistance, rangeBand, cellLabel, tokenCell, tokenPosition, tokenBase, tokenTop,
  tokenFootprintSize, tokenFootprint, footprintCells, footprintDistance, validFootprint, pointToTokenCell
} from "./geometry.js";
import { installBaseTokenRuler } from "./token-ruler.js";

const MODULE_ID = "mk-shadowdark";
const FLAG = "isometricBoard";
const TOOL = "mk-isometric-board";
const SETTINGS_TOOL = "mk-isometric-board-settings";
const COLORS = { grid: 0xc8bda4, near: 0x4ea9cb, close: 0xdbab58, self: 0x8bcbd7, enemyClose: 0xd95858 };
const OPACITY_SETTING = "isometricBoardOpacity";

function normalizeOpacity(value) {
  const number = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 20;
}

function normalizeGridColor(value) {
  const color = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) return `#${[...color.slice(1)].map(digit => digit.repeat(2)).join("")}`;
  return `#${COLORS.grid.toString(16).padStart(6, "0")}`;
}

export class IsometricBoardOverlay {
  constructor(environment = globalThis) {
    this.env = environment;
    this.root = null;
    this.hud = null;
    this.settingsVisible = false;
    this.frame = null;
    this.gridGeometry = null;
    this.gridDrawKey = null;
    this.hover = null;
    this.moveMode = false;
    this.gridMoveMode = false;
    this.gridDrag = null;
    this.gridResizeCorner = null;
    this.gridHandles = null;
    this.positionPreview = null;
    this.gridSaving = false;
    this.moving = false;
    this.toggling = false;
    this.gridState = null;
    this.view = null;
    this.opacityValue = null;
    this.gridColorPreview = null;
    this.nativeRulers = new Set();
    this.tokenSelections = new Map();
    this.animatedArrows = new Set();
    this.selectionTicker = null;
    this.selectionTime = 0;
    this.onSelectionTick = () => this.animateSelectionArrows();
    this.pendingDestinations = new Map();
    this.onPointerDown = event => { if (event.target === this.view) this.handlePointerDown(event); };
    this.onPointerMove = event => this.handlePointerMove(event);
    this.onPointerLeave = () => { this.hover = null; this.gridResizeCorner = null; this.syncGridMoveControls(); this.schedule(); };
    this.onGridPointerMove = event => this.handleGridPointerMove(event);
    this.onGridPointerUp = event => { void this.finishGridDrag(event).catch(error => this.reportError(error)); };
    this.onGridPointerCancel = event => { if (event.pointerId === this.gridDrag?.pointerId) this.cancelGridDrag(); };
    this.onGridBlur = () => this.cancelGridDrag();
    this.onKeyDown = event => {
      if (event.key === "Escape" && this.gridMoveMode) {
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        this.setGridMoveMode(false);
      }
      if (event.key === "Escape" && this.moveMode) this.setMoveMode(false);
    };
  }

  get canvas() { return this.env.canvas; }
  get game() { return this.env.game; }
  get enabled() {
    return Boolean(this.canvas?.ready && this.canvas.scene?.getFlag?.(MODULE_ID, FLAG)?.enabled);
  }
  get layout() {
    return readLayout(this.canvas?.scene, this.sceneBounds, this.positionPreview);
  }
  get sceneBounds() { return this.canvas?.scene?.getDimensions?.()?.sceneRect ?? this.canvas?.dimensions?.sceneRect; }
  get feetPerCell() { return FEET_PER_CELL; }
  get boardSize() { return readBoardSize(this.canvas?.scene); }
  get tilt() { return this.layout.tilt; }
  get rotation() { return this.layout.rotation; }
  get offsetX() { return this.layout.offsetX; }
  get offsetY() { return this.layout.offsetY; }
  get scaleX() { return this.layout.scaleX; }
  get scaleY() { return this.layout.scaleY; }
  get gridColor() {
    return this.gridColorPreview ?? normalizeGridColor(this.canvas?.scene?.getFlag?.(MODULE_ID, FLAG)?.gridColor);
  }

  async setBoardSize(value) {
    if (!this.game?.user?.isGM || !this.canvas?.ready || !this.canvas.scene) return false;
    const scene = this.canvas.scene;
    const boardSize = normalizeBoardSize(value);
    const current = this.layout;
    const layout = { ...current, size: boardSize,
      cellWidth: current.cellWidth * current.size / boardSize,
      cellHeight: current.cellHeight * current.size / boardSize };
    if (!this.checkLayout(layout, "resizeOccupied")) return false;
    await scene.setFlag(MODULE_ID, FLAG, { ...scene.getFlag(MODULE_ID, FLAG), boardSize });
    this.refresh();
    return boardSize;
  }

  checkLayout(layout, warning) {
    const occupied = new Set();
    for (const document of this.tokenDocuments()) {
      const footprint = tokenFootprint(document, layout, document._source ?? {}, this.env);
      const cells = footprintCells(footprint).filter(cell => validCell(cell, layout.size));
      if (!cells.length) continue;
      if (!validFootprint(footprint, footprint.size, layout.size)
        || cells.some(cell => occupied.has(`${cell.column},${cell.row}`))) {
        this.env.ui?.notifications?.warn(this.text(warning));
        this.syncGridSizeControls();
        return false;
      }
      for (const cell of cells) occupied.add(`${cell.column},${cell.row}`);
    }
    return true;
  }

  async setView(settings = {}) {
    if (!this.game?.user?.isGM || !this.canvas?.ready || !this.canvas.scene) return false;
    const scene = this.canvas.scene;
    const changes = {};
    if ("tilt" in settings) changes.tilt = normalizeTilt(settings.tilt);
    if ("rotation" in settings) changes.rotation = normalizeRotation(settings.rotation);
    for (const key of ["scaleX", "scaleY"]) if (key in settings) changes[key] = normalizeScale(settings[key]);
    for (const key of ["offsetX", "offsetY"]) if (key in settings) changes[key] = normalizeOffset(settings[key]);
    const layout = readLayout(scene, this.sceneBounds, changes);
    if (!this.checkLayout(layout, "viewOccupied")) return false;
    await scene.setFlag(MODULE_ID, FLAG, { ...scene.getFlag(MODULE_ID, FLAG), ...changes });
    this.refresh();
    return { tilt: layout.tilt, rotation: layout.rotation, offsetX: layout.offsetX, offsetY: layout.offsetY,
      scaleX: layout.scaleX, scaleY: layout.scaleY };
  }

  async setTilt(value) {
    const result = await this.setView({ tilt: value });
    return result === false ? false : result.tilt;
  }

  async setRotation(value) {
    const result = await this.setView({ rotation: value });
    return result === false ? false : result.rotation;
  }

  async setPosition(offsetX, offsetY) {
    const result = await this.setView({ offsetX, offsetY });
    return result === false ? false : { offsetX: result.offsetX, offsetY: result.offsetY };
  }

  resetView() { return this.setView({ tilt: null, rotation: 0, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }); }

  async setGridColor(value, { persist = true } = {}) {
    if (!this.game?.user?.isGM || !this.canvas?.ready || !this.canvas.scene) return false;
    const color = normalizeGridColor(value);
    if (persist) {
      const scene = this.canvas.scene;
      await scene.setFlag(MODULE_ID, FLAG, { ...scene.getFlag(MODULE_ID, FLAG), gridColor: color });
      this.refresh();
    } else {
      this.gridColorPreview = color;
      this.syncGridColorControls();
      this.schedule();
    }
    return color;
  }

  syncGridColorControls() {
    if (this.gridColorInput) {
      this.gridColorInput.value = this.gridColor;
      this.gridColorInput.disabled = !this.game?.user?.isGM;
    }
    if (this.gridColorOutput) this.gridColorOutput.textContent = this.gridColor;
  }

  syncGridSizeControls() {
    const distance = this.feetPerCell;
    const size = this.boardSize;
    if (this.scaleLabel) this.scaleLabel.textContent = this.text("scale", { size, distance });
    if (this.boardSizeInput) {
      this.boardSizeInput.value = String(size);
      this.boardSizeInput.disabled = !this.game?.user?.isGM;
      this.boardSizeInput.setAttribute("aria-valuetext", this.text("boardSizeValue", { size }));
    }
    if (this.boardSizeOutput) this.boardSizeOutput.textContent = this.text("boardSizeValue", { size });
    const layout = this.layout;
    for (const kind of ["tilt", "rotation"]) {
      const angle = Math.round(layout[kind]);
      const automatic = kind === "tilt" && layout.autoTilt;
      if (this[`${kind}Input`]) {
        this[`${kind}Input`].value = String(kind === "tilt" ? normalizeTilt(angle) : angle);
        this[`${kind}Input`].disabled = !this.game?.user?.isGM;
        this[`${kind}Input`].setAttribute("aria-valuetext", this.text(automatic ? "autoAngleLabel" : "angleValue", { angle }));
      }
      if (this[`${kind}Output`]) this[`${kind}Output`].textContent = automatic
        ? this.text("autoAngle") : this.text("angleValue", { angle });
    }
    if (this.fitButton) this.fitButton.disabled = !this.game?.user?.isGM;
    this.syncGridMoveControls();
    this.syncGridColorControls();
  }
  get opacity() {
    if (this.opacityValue !== null) return this.opacityValue;
    try {
      return normalizeOpacity(this.game?.settings?.get(MODULE_ID, OPACITY_SETTING));
    } catch (_error) {
      return 20;
    }
  }

  async setOpacity(value, { persist = true } = {}) {
    const opacity = normalizeOpacity(value);
    this.opacityValue = opacity;
    this.syncOpacityControls();
    this.refreshNativeTokens();
    this.schedule();
    if (persist) await this.game.settings.set(MODULE_ID, OPACITY_SETTING, opacity);
    return opacity;
  }

  syncOpacityControls() {
    const value = this.opacity;
    if (this.opacityInput) {
      this.opacityInput.value = String(value);
      this.opacityInput.setAttribute("aria-valuetext", `${value}%`);
    }
    if (this.opacityOutput) this.opacityOutput.textContent = `${value}%`;
  }

  text(key, data) {
    const id = `MK_SHADOWDARK.isometricBoard.${key}`;
    return data ? this.game.i18n.format(id, data) : this.game.i18n.localize(id);
  }

  canSee(token) {
    return Boolean(token && !token.destroyed && !token.isPreview && token.visible !== false
      && token.isVisible !== false && (!token.document?.hidden || this.game?.user?.isGM));
  }

  selectedToken() {
    const controlled = this.canvas?.tokens?.controlled ?? [];
    return controlled.length === 1 && this.canSee(controlled[0])
      && controlled[0].document?.parent?.id === this.canvas?.scene?.id ? controlled[0] : null;
  }

  canMove(token) {
    return Boolean(token && (this.game?.user?.isGM || token.document?.isOwner)
      && token.document?.canUserModify?.(this.game.user, "update") !== false);
  }

  async toggle() {
    if (!this.game?.user?.isGM || !this.canvas?.ready || !this.canvas.scene || this.toggling) return false;
    const scene = this.canvas.scene;
    const stored = scene.getFlag(MODULE_ID, FLAG) ?? {};
    this.toggling = true;
    try {
      await scene.setFlag(MODULE_ID, FLAG, {
        ...stored, boardSize: this.boardSize, enabled: !stored.enabled
      });
      this.refresh();
      return this.enabled;
    } finally {
      this.toggling = false;
    }
  }

  setMoveMode(enabled = !this.moveMode) {
    if (enabled && (!this.enabled || !this.canMove(this.selectedToken()))) {
      this.env.ui?.notifications?.warn(this.text("selectOwned"));
      this.refreshControls();
      return false;
    }
    if (enabled) this.setGridMoveMode(false);
    this.moveMode = Boolean(enabled);
    this.hover = null;
    this.view?.classList.toggle("mk-isometric-board-moving", this.moveMode);
    this.refreshControls();
    this.schedule();
    return this.moveMode;
  }

  syncGridMoveControls() {
    if (this.gridMoveButton) {
      this.gridMoveButton.textContent = this.text(this.gridMoveMode ? "finishGridMove" : "moveGrid");
      this.gridMoveButton.setAttribute("aria-pressed", String(this.gridMoveMode));
      this.gridMoveButton.disabled = this.gridSaving || this.moving || !this.game?.user?.isGM;
    }
    if (this.gridMoveHint) this.gridMoveHint.hidden = !this.gridMoveMode;
    this.view?.classList.toggle("mk-isometric-board-positioning", this.gridMoveMode);
    this.view?.classList.toggle("mk-isometric-board-position-dragging", Boolean(this.gridDrag));
    const corner = this.gridDrag?.corner ?? this.gridResizeCorner;
    const resizing = this.gridMoveMode && corner !== null && corner !== undefined;
    this.view?.classList.toggle("mk-isometric-board-resizing", resizing);
    if (resizing) {
      const layout = this.layout;
      const tip = this.gridResizeCorners(layout)[corner];
      const direction = Math.round(Math.atan2(tip.y - layout.centerY, tip.x - layout.centerX) / (Math.PI / 4));
      this.view?.style?.setProperty("--mk-isometric-board-resize-cursor", `${["ew", "nwse", "ns", "nesw"][(direction % 4 + 4) % 4]}-resize`);
    } else this.view?.style?.removeProperty("--mk-isometric-board-resize-cursor");
  }

  setGridMoveMode(enabled = !this.gridMoveMode) {
    if (enabled && (!this.enabled || !this.game?.user?.isGM || !this.view || this.gridSaving || this.moving)) return false;
    if (enabled && this.moveMode) this.setMoveMode(false);
    if (!enabled) this.cancelGridDrag();
    this.gridMoveMode = Boolean(enabled);
    if (!enabled) this.gridResizeCorner = null;
    const method = this.gridMoveMode ? "addEventListener" : "removeEventListener";
    for (const [type, handler] of [["pointermove", this.onGridPointerMove], ["pointerup", this.onGridPointerUp],
      ["pointercancel", this.onGridPointerCancel]]) this.env.document?.[method](type, handler, true);
    this.view?.[method]("lostpointercapture", this.onGridPointerCancel);
    this.env[method]?.("blur", this.onGridBlur);
    this.syncGridMoveControls();
    this.drawGridHandles();
    this.schedule();
    return this.gridMoveMode;
  }

  releaseGridPointer(drag) {
    if (drag && this.view?.hasPointerCapture?.(drag.pointerId)) this.view.releasePointerCapture(drag.pointerId);
  }

  cancelGridDrag() {
    const drag = this.gridDrag;
    this.gridDrag = null;
    this.positionPreview = null;
    this.gridResizeCorner = null;
    this.releaseGridPointer(drag);
    this.syncGridMoveControls();
    this.schedule();
  }

  startGridDrag(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.enabled || !this.game?.user?.isGM || this.gridSaving) return;
    const point = this.eventPoint(event);
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    const layout = this.layout;
    const corner = this.gridCornerAt(point, layout);
    const { offsetX, offsetY, scaleX, scaleY } = layout;
    this.gridDrag = { pointerId: event.pointerId, scene: this.canvas.scene, point, offsetX, offsetY, scaleX, scaleY, layout, corner };
    this.view?.setPointerCapture?.(event.pointerId);
    this.syncGridMoveControls();
  }

  handleGridPointerMove(event) {
    const drag = this.gridDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!this.enabled || !this.game?.user?.isGM || this.canvas.scene !== drag.scene) { this.cancelGridDrag(); return; }
    const point = this.eventPoint(event);
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    this.positionPreview = {
      offsetX: normalizeOffset(drag.offsetX + point.x - drag.point.x),
      offsetY: normalizeOffset(drag.offsetY + point.y - drag.point.y)
    };
    if (drag.corner !== null) {
      const { cos, sin, size, cellWidth, cellHeight } = drag.layout;
      const dx = point.x - drag.point.x;
      const dy = point.y - drag.point.y;
      const signX = [1, 2].includes(drag.corner) ? 1 : -1;
      const signY = drag.corner >= 2 ? 1 : -1;
      // Resize in the board's rotated frame, independently on each axis.
      const scaleX = normalizeScale(drag.scaleX * (1 + signX * (dx * cos + dy * sin) / (size * cellWidth)));
      const scaleY = normalizeScale(drag.scaleY * (1 + signY * (dy * cos - dx * sin) / (size * cellHeight)));
      const shiftX = signX * size * cellWidth * (scaleX / drag.scaleX - 1) / 2;
      const shiftY = signY * size * cellHeight * (scaleY / drag.scaleY - 1) / 2;
      this.positionPreview = {
        scaleX, scaleY,
        offsetX: normalizeOffset(drag.offsetX + shiftX * cos - shiftY * sin),
        offsetY: normalizeOffset(drag.offsetY + shiftX * sin + shiftY * cos)
      };
    }
    this.schedule();
  }

  async finishGridDrag(event) {
    const drag = this.gridDrag;
    if (!drag || event.pointerId !== drag.pointerId || event.button !== 0) return false;
    this.handleGridPointerMove(event);
    if (!this.gridDrag) return false;
    const position = this.positionPreview;
    this.gridDrag = null;
    this.releaseGridPointer(drag);
    if (!position || (position.offsetX === drag.offsetX && position.offsetY === drag.offsetY
      && (position.scaleX ?? drag.scaleX) === drag.scaleX && (position.scaleY ?? drag.scaleY) === drag.scaleY)) {
      this.cancelGridDrag();
      return false;
    }
    this.gridSaving = true;
    this.syncGridMoveControls();
    try {
      return drag.corner === null ? await this.setPosition(position.offsetX, position.offsetY) : await this.setView(position);
    } finally {
      this.gridSaving = false;
      this.positionPreview = null;
      this.gridResizeCorner = null;
      this.syncGridMoveControls();
      this.schedule();
    }
  }

  registerControls(controls) {
    const tokenTools = controls?.tokens?.tools;
    if (!tokenTools) return;
    // SceneControls may reuse a tool collection across refreshes and roles.
    for (const name of [TOOL, SETTINGS_TOOL, "mk-isometric-board-move"]) delete tokenTools[name];
    if (!this.canvas?.scene || !this.game?.user?.isGM) return;
    tokenTools[TOOL] = {
      name: TOOL, title: this.text("toggle"), icon: "fa-solid fa-chess-board",
      order: Object.keys(tokenTools).length, toggle: true, active: this.enabled,
      onChange: () => { void this.toggle().catch(error => this.reportError(error)); }
    };
    if (this.enabled) tokenTools[SETTINGS_TOOL] = {
      name: SETTINGS_TOOL, title: this.text("settingsToggle"), icon: "fa-solid fa-sliders",
      order: Object.keys(tokenTools).length, toggle: true, active: this.settingsVisible,
      onChange: (_event, active) => this.setSettingsVisible(typeof active === "boolean" ? active : !this.settingsVisible)
    };
  }

  setSettingsVisible(visible = !this.settingsVisible) {
    this.settingsVisible = Boolean(visible && this.enabled && this.game?.user?.isGM && this.hud);
    if (!this.settingsVisible) {
      this.setGridMoveMode(false);
      if (this.moveMode) this.setMoveMode(false);
    }
    this.syncSettingsPanel();
    if (this.settingsVisible) this.schedule();
    this.refreshControls();
    return this.settingsVisible;
  }

  syncSettingsPanel() {
    if (this.hud) this.hud.hidden = !(this.settingsVisible && this.enabled && this.game?.user?.isGM);
  }

  refreshControls() {
    // SceneControls caches tools in v13/v14; reset is required after a shared scene toggle.
    this.env.ui?.controls?.render?.({ reset: true });
  }

  refreshNativeTokens() {
    const tokens = new Set([...(this.canvas?.tokens?.placeables ?? []), ...(this.canvas?.tokens?.preview?.children ?? []),
      ...[...this.nativeRulers].map(ruler => ruler.token)]);
    for (const token of tokens) {
      if (!token.destroyed) token.renderFlags?.set({ refreshRuler: true, refreshState: true });
    }
  }

  clearTokenSelection(token, restoreBorder = true) {
    const state = this.tokenSelections.get(token);
    if (!state) return;
    if (restoreBorder && !state.border.destroyed) state.border.visible = state.visible;
    this.animatedArrows.delete(state.arrow);
    if (state.arrow && !state.arrow.destroyed) {
      state.arrow.parent?.removeChild(state.arrow);
      state.arrow.destroy();
    }
    this.tokenSelections.delete(token);
    this.syncSelectionAnimation();
  }

  stopSelectionAnimation() {
    this.selectionTicker?.remove(this.onSelectionTick, this);
    this.selectionTicker = null;
    this.selectionTime = 0;
    for (const arrow of this.animatedArrows) if (!arrow.destroyed) arrow.y = 0;
  }

  syncSelectionAnimation() {
    const candidate = this.canvas?.app?.ticker;
    const reducedMotion = this.animatedArrows.size && (this.env.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      || this.game?.settings?.get?.("core", "photosensitiveMode"));
    const ticker = this.enabled && this.root && this.animatedArrows.size && !reducedMotion
      && typeof candidate?.add === "function" && typeof candidate?.remove === "function" ? candidate : null;
    if (ticker === this.selectionTicker) return;
    this.stopSelectionAnimation();
    if (ticker) {
      this.selectionTicker = ticker;
      ticker.add(this.onSelectionTick, this);
    }
  }

  animateSelectionArrows() {
    if (!this.enabled || !this.root) { this.stopSelectionAnimation(); return; }
    const elapsed = Number(this.selectionTicker?.deltaMS);
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    this.selectionTime = (this.selectionTime + elapsed) % 1600;
    const offset = -3 * (this.canvas.dimensions?.uiScale ?? 1) * (1 - Math.cos(this.selectionTime / 1600 * Math.PI * 2));
    for (const arrow of this.animatedArrows) {
      if (arrow.destroyed || !arrow.visible) this.animatedArrows.delete(arrow);
      else arrow.y = offset;
    }
    if (!this.animatedArrows.size) this.stopSelectionAnimation();
  }

  refreshTokenSelection(token, nativeState = false) {
    if (!this.enabled || !this.root || token.destroyed || token.document?.parent?.id !== this.canvas?.scene?.id
      || !token.border || token.border.destroyed) {
      this.clearTokenSelection(token, !nativeState);
      return;
    }
    let state = this.tokenSelections.get(token);
    if (state && state.border !== token.border) {
      this.clearTokenSelection(token);
      state = null;
    }
    if (!state) {
      state = { border: token.border, visible: token.border.visible, arrow: null };
      this.tokenSelections.set(token, state);
    } else if (nativeState) state.visible = token.border.visible;
    const dragging = Boolean((token._original ?? token).isDragged);
    token.border.visible = state.visible && dragging;
    const showArrow = token.controlled && !dragging && !token.document.isSecret && token.layer?.active !== false && this.canSee(token);
    if (!showArrow) {
      if (state.arrow && !state.arrow.destroyed) { state.arrow.visible = false; state.arrow.y = 0; }
      this.animatedArrows.delete(state.arrow);
      this.syncSelectionAnimation();
      return;
    }
    if (!state.arrow || state.arrow.destroyed) {
      state.arrow = token.addChild(new this.env.PIXI.Graphics());
      state.arrow.name = `${MODULE_ID}-selection-arrow`;
      state.arrow.eventMode = "none";
      state.arrow.zIndex = Infinity;
    }
    const arrow = state.arrow;
    const scale = this.canvas.dimensions?.uiScale ?? 1;
    const top = tokenTop(token.document, { x: 0, y: 0 }, this.env);
    const tip = { x: top.x, y: top.y - 10 * scale };
    arrow.visible = true;
    arrow.clear();
    arrow.lineStyle(2 * scale, 0x191d23, 1);
    arrow.beginFill(0xffd782, 1);
    arrow.drawPolygon([[-5, -22], [5, -22], [5, -12], [11, -12], [0, 0], [-11, -12], [-5, -12]]
      .flatMap(([x, y]) => [tip.x + x * scale, tip.y + y * scale]));
    arrow.endFill();
    this.animatedArrows.add(arrow);
    this.syncSelectionAnimation();
  }

  reportError(error) {
    this.env.console?.error(`${MODULE_ID} | Isometric Board`, error);
    this.env.ui?.notifications?.error(this.text("error"));
  }

  refresh() {
    this.cancelGridDrag();
    this.gridColorPreview = null;
    if (!this.enabled) { this.destroy(); this.refreshNativeTokens(); this.refreshControls(); return; }
    const parent = this.canvas.primary;
    const PIXI = this.env.PIXI;
    if (!parent || !PIXI?.Container || !PIXI?.Graphics) return;
    if (!this.root || this.root.destroyed || this.root.parent !== parent) {
      this.destroy();
      this.root = new PIXI.Container();
      this.root.name = `${MODULE_ID}-isometric-board`;
      this.root.eventMode = "none";
      this.root.interactiveChildren = false;
      // Token artwork lives in Primary, below the controls/interface groups.
      this.root.elevation = parent.background?.elevation ?? 0;
      this.root.sortLayer = (parent.constructor.SORT_LAYERS?.TOKENS ?? 700) - 1;
      this.graphics = this.root.addChild(new PIXI.Graphics());
      parent.addChild(this.root);
      parent.sortDirty = true;
      // Keep the native grid document untouched and restore its local visibility on teardown.
      const grid = this.canvas.interface?.grid;
      if (grid) { this.gridState = { grid, visible: grid.visible }; grid.visible = false; }
      this.view = this.canvas.app?.canvas ?? this.canvas.app?.view;
      // Capture above the canvas: PIXI registers its own capturing pointerdown on the view.
      // A listener on the view would run too late to preserve the controlled token.
      this.env.document?.addEventListener("pointerdown", this.onPointerDown, true);
      this.view?.addEventListener("pointermove", this.onPointerMove);
      this.view?.addEventListener("pointerleave", this.onPointerLeave);
      this.env.document?.addEventListener("keydown", this.onKeyDown, true);
      this.createHud();
    }
    this.refreshControls();
    this.syncGridSizeControls();
    this.hover = null;
    this.draw();
    this.refreshNativeTokens();
  }

  createViewControl(kind, min, max) {
    const document = this.env.document;
    const control = document.createElement("div");
    control.className = "mk-isometric-board-view";
    control.dataset.control = kind;
    control.title = this.text(`${kind}Hint`);
    const label = document.createElement("label");
    label.htmlFor = `mk-isometric-board-${kind}`;
    label.textContent = this.text(kind);
    const input = this[`${kind}Input`] = document.createElement("input");
    input.id = label.htmlFor;
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    const output = this[`${kind}Output`] = document.createElement("output");
    output.setAttribute("for", input.id);
    input.addEventListener("input", () => {
      const angle = kind === "tilt" ? normalizeTilt(input.value) ?? MIN_TILT : normalizeRotation(input.value);
      input.value = String(angle);
      output.textContent = this.text("angleValue", { angle });
      input.setAttribute("aria-valuetext", output.textContent);
    });
    input.addEventListener("change", () => {
      void this.setView({ [kind]: input.value }).catch(error => {
        this.syncGridSizeControls();
        this.reportError(error);
      });
    });
    control.append(label, input, output);
    if (kind === "tilt") {
      this.fitButton = document.createElement("button");
      this.fitButton.type = "button";
      this.fitButton.textContent = this.text("fitScene");
      this.fitButton.title = this.text("fitSceneHint");
      this.fitButton.addEventListener("click", () => {
        void this.resetView().catch(error => this.reportError(error));
      });
      control.append(this.fitButton);
    }
    return control;
  }

  createGridColorControl() {
    const document = this.env.document;
    const control = document.createElement("label");
    control.className = "mk-isometric-board-color";
    control.htmlFor = "mk-isometric-board-color";
    control.title = this.text("gridColorHint");
    const label = document.createElement("span");
    label.textContent = this.text("gridColor");
    this.gridColorInput = document.createElement("input");
    this.gridColorInput.type = "color";
    this.gridColorInput.id = control.htmlFor;
    this.gridColorOutput = document.createElement("output");
    this.gridColorOutput.setAttribute("for", this.gridColorInput.id);
    this.gridColorInput.addEventListener("input", () => {
      void this.setGridColor(this.gridColorInput.value, { persist: false }).catch(error => this.reportError(error));
    });
    this.gridColorInput.addEventListener("change", () => {
      void this.setGridColor(this.gridColorInput.value).catch(error => {
        this.gridColorPreview = null;
        this.syncGridColorControls();
        this.schedule();
        this.reportError(error);
      });
    });
    control.append(label, this.gridColorInput, this.gridColorOutput);
    return control;
  }

  createHud() {
    const document = this.env.document;
    if (!document?.body) return;
    this.hud = document.createElement("aside");
    this.hud.id = "mk-isometric-board-hud";
    this.hud.hidden = true;
    this.hud.setAttribute("aria-label", this.text("title"));
    const heading = document.createElement("strong");
    heading.textContent = this.text("title");
    this.scaleLabel = document.createElement("span");
    this.scaleLabel.className = "mk-isometric-board-scale";
    this.moveButton = document.createElement("button");
    this.moveButton.type = "button";
    this.moveButton.textContent = this.text("move");
    this.moveButton.title = this.text("moveTitle");
    this.moveButton.addEventListener("click", () => this.setMoveMode());
    const positionControl = document.createElement("div");
    positionControl.className = "mk-isometric-board-position";
    positionControl.hidden = !this.game?.user?.isGM;
    if (this.game?.user?.isGM) {
      this.gridMoveButton = document.createElement("button");
      this.gridMoveButton.id = "mk-isometric-board-move-grid";
      this.gridMoveButton.type = "button";
      this.gridMoveButton.title = this.text("moveGridHint");
      this.gridMoveButton.addEventListener("click", () => this.setGridMoveMode());
      this.gridMoveHint = document.createElement("span");
      this.gridMoveHint.textContent = this.text("moveGridHint");
      positionControl.append(this.gridMoveButton, this.gridMoveHint);
    }
    const opacityControl = document.createElement("label");
    opacityControl.className = "mk-isometric-board-opacity";
    opacityControl.htmlFor = "mk-isometric-board-opacity";
    opacityControl.title = this.text("opacityHint");
    const opacityLabel = document.createElement("span");
    opacityLabel.textContent = this.text("opacity");
    this.opacityInput = document.createElement("input");
    this.opacityInput.id = "mk-isometric-board-opacity";
    this.opacityInput.type = "range";
    this.opacityInput.min = "0";
    this.opacityInput.max = "100";
    this.opacityInput.step = "1";
    this.opacityOutput = document.createElement("output");
    this.opacityOutput.setAttribute("for", this.opacityInput.id);
    this.opacityInput.addEventListener("input", () => {
      void this.setOpacity(this.opacityInput.value, { persist: false });
    });
    this.opacityInput.addEventListener("change", () => {
      void this.setOpacity(this.opacityInput.value).catch(error => this.reportError(error));
    });
    opacityControl.append(opacityLabel, this.opacityInput, this.opacityOutput);
    this.syncOpacityControls();
    const boardSizeControl = document.createElement("label");
    boardSizeControl.className = "mk-isometric-board-size";
    boardSizeControl.htmlFor = "mk-isometric-board-size";
    boardSizeControl.title = this.text("boardSizeHint");
    const boardSizeLabel = document.createElement("span");
    boardSizeLabel.textContent = this.text("boardSize");
    this.boardSizeInput = document.createElement("input");
    this.boardSizeInput.id = "mk-isometric-board-size";
    this.boardSizeInput.type = "range";
    this.boardSizeInput.min = String(MIN_BOARD_SIZE);
    this.boardSizeInput.max = String(MAX_BOARD_SIZE);
    this.boardSizeInput.step = "1";
    this.boardSizeOutput = document.createElement("output");
    this.boardSizeOutput.setAttribute("for", this.boardSizeInput.id);
    this.boardSizeInput.addEventListener("input", () => {
      const size = normalizeBoardSize(this.boardSizeInput.value);
      this.boardSizeInput.value = String(size);
      this.boardSizeOutput.textContent = this.text("boardSizeValue", { size });
      this.boardSizeInput.setAttribute("aria-valuetext", this.text("boardSizeValue", { size }));
    });
    this.boardSizeInput.addEventListener("change", () => {
      void this.setBoardSize(this.boardSizeInput.value).catch(error => {
        this.syncGridSizeControls();
        this.reportError(error);
      });
    });
    boardSizeControl.append(boardSizeLabel, this.boardSizeInput, this.boardSizeOutput);
    const tiltControl = this.createViewControl("tilt", MIN_TILT, MAX_TILT);
    const rotationControl = this.createViewControl("rotation", -180, 180);
    const colorControl = this.createGridColorControl();
    this.syncGridSizeControls();
    this.status = document.createElement("div");
    this.status.className = "mk-isometric-board-status";
    this.status.setAttribute("aria-live", "polite");
    this.ranges = document.createElement("div");
    this.ranges.className = "mk-isometric-board-ranges";
    const legend = document.createElement("div");
    legend.className = "mk-isometric-board-legend";
    for (const band of ["close", "near", "far", "enemyClose"]) {
      const label = document.createElement("span");
      label.dataset.band = band;
      label.textContent = this.text(`${band}Legend`);
      legend.append(label);
    }
    this.hud.append(heading, this.scaleLabel, this.moveButton, positionControl, opacityControl, colorControl, boardSizeControl,
      tiltControl, rotationControl, this.status, this.ranges, legend);
    document.body.append(this.hud);
    this.syncSettingsPanel();
  }

  schedule() {
    if (!this.enabled || this.frame !== null) return;
    this.frame = this.env.requestAnimationFrame(() => { this.frame = null; this.draw(); });
  }

  polygon(cell, layout = this.layout, size = 1) {
    const { column: c, row: r } = cell;
    return [[c, r], [c + size, r], [c + size, r + size], [c, r + size]]
      .flatMap(([column, row]) => { const p = project(layout, column, row); return [p.x, p.y]; });
  }

  gridCorners(layout = this.layout) {
    return [[0, 0], [layout.size, 0], [layout.size, layout.size], [0, layout.size]]
      .map(([column, row]) => project(layout, column, row));
  }

  gridResizeCorners(layout = this.layout) {
    const halfWidth = layout.size * layout.cellWidth / 2;
    const halfHeight = layout.size * layout.cellHeight / 2;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
      x: layout.centerX + x * halfWidth * layout.cos - y * halfHeight * layout.sin,
      y: layout.centerY + x * halfWidth * layout.sin + y * halfHeight * layout.cos
    }));
  }

  gridHandleUnit() {
    const bounds = this.view?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height || !this.canvas?.stage) return 1;
    const point = this.eventPoint({ clientX: bounds.left, clientY: bounds.top });
    const next = this.eventPoint({ clientX: bounds.left + 1, clientY: bounds.top });
    const unit = Math.hypot(next.x - point.x, next.y - point.y);
    return Number.isFinite(unit) && unit > 0 ? unit : 1;
  }

  gridCornerAt(point, layout = this.layout) {
    const radius = 14 * this.gridHandleUnit();
    const corners = this.gridResizeCorners(layout);
    const index = corners.findIndex(corner => Math.hypot(point.x - corner.x, point.y - corner.y) <= radius);
    return index < 0 ? null : index;
  }

  drawGridHandles(layout = this.layout) {
    if (!this.gridMoveMode || !this.enabled || !this.game?.user?.isGM || !this.root) {
      this.gridHandles?.parent?.removeChild(this.gridHandles);
      this.gridHandles?.destroy();
      this.gridHandles = null;
      return;
    }
    if (!this.gridHandles || this.gridHandles.destroyed) {
      this.gridHandles = (this.canvas.controls ?? this.root).addChild(new this.env.PIXI.Graphics());
      this.gridHandles.name = `${MODULE_ID}-grid-resize-handles`;
      this.gridHandles.eventMode = "none";
    }
    const graphics = this.gridHandles;
    const unit = this.gridHandleUnit();
    const radius = 7 * unit;
    graphics.clear();
    graphics.lineStyle(2 * unit, 0xffd782, 0.85);
    graphics.drawPolygon(this.polygon({ column: 0, row: 0 }, layout, layout.size));
    const corners = this.gridResizeCorners(layout);
    graphics.lineStyle(unit, 0xffd782, 0.5);
    graphics.drawPolygon(corners.flatMap(corner => [corner.x, corner.y]));
    for (const corner of corners) {
      graphics.lineStyle(2 * unit, 0x191d23, 1);
      graphics.beginFill(0xffd782, 1);
      graphics.drawPolygon([-1, -1, 1, -1, 1, 1, -1, 1]
        .map((value, index) => value * radius + (index % 2 ? corner.y : corner.x)));
      graphics.endFill();
    }
  }

  draggedFootprint(token, layout) {
    if (!token) return null;
    for (const ruler of this.nativeRulers) {
      if ((ruler.token._original ?? ruler.token) !== token) continue;
      const destination = ruler.localDragDestination;
      if (!destination) continue;
      const footprint = tokenFootprint(token.document, layout, destination, this.env);
      if (footprint && validFootprint(footprint, footprint.size, layout.size)) return footprint;
    }
    return null;
  }

  closeEnemyCells(token, footprint, layout) {
    const cells = new Set();
    if (!footprint) return cells;
    const dispositions = this.env.CONST?.TOKEN_DISPOSITIONS;
    const hostile = dispositions?.HOSTILE ?? -1;
    const friendly = dispositions?.FRIENDLY ?? 1;
    const enemyDisposition = Number(token.document.disposition) === hostile ? friendly : hostile;
    for (const other of this.canvas.tokens?.placeables ?? []) {
      if (other === token || !this.canSee(other) || other.document?.isSecret
        || other.document?.parent?.id !== this.canvas.scene.id || Number(other.document.disposition) !== enemyDisposition) continue;
      const cell = tokenCell(other.document, layout, {}, this.env);
      if (!cell) continue;
      const enemy = { ...cell, size: tokenFootprintSize(other.document) };
      if (footprintDistance(footprint, enemy) * FEET_PER_CELL > CLOSE_DISTANCE) continue;
      // Close is measured between bases; every square occupied by that enemy is highlighted.
      for (const occupied of footprintCells(enemy)) cells.add(occupied.row * layout.size + occupied.column);
    }
    return cells;
  }

  draw() {
    if (!this.enabled || !this.graphics || this.graphics.destroyed) return;
    const graphics = this.graphics;
    const layout = this.layout;
    const token = this.selectedToken();
    const from = token ? tokenCell(token.document, layout, {}, this.env) : null;
    const size = token ? tokenFootprintSize(token.document) : 1;
    const footprint = from ? { ...from, size } : null;
    const enemiesInClose = this.closeEnemyCells(token, this.draggedFootprint(token, layout) ?? footprint, layout);
    const opacity = this.opacity / 100;
    const gridColor = Number.parseInt(this.gridColor.slice(1), 16);
    if (!this.canMove(token) && this.moveMode) this.setMoveMode(false);
    const geometryKey = [layout.size, layout.originX, layout.originY, layout.cellWidth, layout.cellHeight,
      layout.centerX, layout.centerY, layout.cos, layout.sin].join("|");
    if (geometryKey !== this.gridGeometry?.key) {
      const cells = [];
      for (let row = 0; row < layout.size; row++) for (let column = 0; column < layout.size; column++) {
        const cell = { column, row };
        cells.push({ cell, polygon: this.polygon(cell, layout) });
      }
      this.gridGeometry = { key: geometryKey, cells };
    }
    // Hover, ruler and refreshToken events can repeat without changing any cell.
    const drawKey = [geometryKey, opacity, gridColor, from?.column, from?.row, size,
      [...enemiesInClose].sort((a, b) => a - b).join(",")].join("|");
    if (drawKey !== this.gridDrawKey) {
      graphics.clear();
      for (const [index, { cell, polygon }] of this.gridGeometry.cells.entries()) {
        const band = footprint ? rangeBand(footprint, cell) : null;
        const enemyClose = band !== "self" && enemiesInClose.has(index);
        graphics.lineStyle(1, gridColor, 0.6 * opacity);
        // Leave ordinary cells transparent; only the selected token's ranges tint the map.
        graphics.beginFill(enemyClose ? COLORS.enemyClose : COLORS[band] ?? COLORS.grid,
          (enemyClose || band === "self" ? 0.6 : band === "close" ? 0.3 : band === "near" ? 0.125 : 0) * opacity);
        graphics.drawPolygon(polygon);
        graphics.endFill();
      }
      this.gridDrawKey = drawKey;
    }
    this.drawGridHandles(layout);
    this.updateHud(token, from, layout);
  }

  updateHud(token, from, layout = this.layout) {
    if (!this.hud) return;
    this.syncSettingsPanel();
    if (this.hud.hidden) return;
    this.syncGridMoveControls();
    this.moveButton.disabled = this.moving || !this.canMove(token);
    this.moveButton.setAttribute("aria-pressed", String(this.moveMode));
    const status = !token ? this.text("selectToken") : !from ? this.text("outside", { name: token.name })
      : this.text(tokenFootprintSize(token.document) > 1 ? "selectedSized" : "selected",
        { name: token.name, cell: cellLabel(from), size: tokenFootprintSize(token.document) });
    let movement = "";
    if (from && this.hover) {
      const distance = cellDistance(from, this.hover) * this.feetPerCell;
      movement = this.text(distance <= NEAR_DISTANCE ? "nearMove" : "longMove", { distance, cell: cellLabel(this.hover) });
    } else if (this.moveMode) movement = this.text("moveHint");
    this.status.textContent = [status, movement].filter(Boolean).join(" · ");
    const labels = [];
    if (from) for (const other of this.canvas.tokens?.placeables ?? []) {
      if (other === token || !this.canSee(other)) continue;
      const to = tokenCell(other.document, layout, {}, this.env);
      if (!to) continue;
      const distance = footprintDistance({ ...from, size: tokenFootprintSize(token.document) },
        { ...to, size: tokenFootprintSize(other.document) }) * this.feetPerCell;
      const band = distance <= CLOSE_DISTANCE ? "close" : distance <= NEAR_DISTANCE ? "near" : "far";
      labels.push(this.text("range", { name: other.name, range: this.text(band), distance }));
    }
    this.ranges.textContent = labels.join(" · ");
    this.ranges.hidden = !labels.length;
  }

  eventPoint(event) {
    if (!this.view || !this.canvas?.stage) return null;
    const bounds = this.view.getBoundingClientRect();
    const screen = this.canvas.app.screen ?? this.canvas.app.renderer?.screen;
    const x = (event.clientX - bounds.left) * (screen?.width ?? bounds.width) / bounds.width;
    const y = (event.clientY - bounds.top) * (screen?.height ?? bounds.height) / bounds.height;
    return this.canvas.stage.toLocal({ x, y });
  }

  handlePointerMove(event) {
    if (this.gridMoveMode) {
      const point = this.eventPoint(event);
      if (!this.gridDrag && point) {
        const corner = this.gridCornerAt(point);
        if (corner !== this.gridResizeCorner) {
          this.gridResizeCorner = corner;
          this.syncGridMoveControls();
        }
      }
      return;
    }
    if (!this.settingsVisible && !this.moveMode) return;
    const token = this.selectedToken();
    if (!this.enabled || !token) return;
    const next = pointToTokenCell(token.document, this.layout, this.eventPoint(event));
    if (next?.column === this.hover?.column && next?.row === this.hover?.row) return;
    this.hover = next;
    this.schedule();
  }

  handlePointerDown(event) {
    if (this.gridMoveMode) { this.startGridDrag(event); return; }
    if (!this.enabled || !this.moveMode || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const token = this.selectedToken();
    if (!token) return;
    const cell = pointToTokenCell(token.document, this.layout, this.eventPoint(event));
    if (!cell) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void this.moveSelected(cell).catch(error => this.reportError(error));
  }

  async moveSelected(cell) {
    if (this.gridMoveMode || this.gridSaving) return false;
    const token = this.selectedToken();
    if (!this.enabled || !validCell(cell, this.boardSize) || !this.canMove(token) || this.moving) return false;
    if (this.game.paused && !this.game.user.isGM) {
      this.env.ui?.notifications?.warn(this.text("paused"));
      return false;
    }
    const source = token.document._source ?? {};
    const size = tokenFootprintSize(token.document, source);
    if (!validFootprint(cell, size, this.boardSize)) {
      this.env.ui?.notifications?.warn(this.text("footprintOutside"));
      return false;
    }
    if (this.isOccupied(token.document, cell, undefined, source)) {
      this.env.ui?.notifications?.warn(this.text("occupied"));
      return false;
    }
    const position = tokenPosition(token.document, this.layout, cell, source, this.env);
    const destination = token.document.getCenterPoint({ ...source, ...position });
    if (token.checkCollision?.(destination, { type: "move", mode: "any" })) {
      this.env.ui?.notifications?.warn(this.text("blocked"));
      return false;
    }
    this.moving = true;
    this.pendingDestinations.set(token.document.id, { ...cell, size });
    this.schedule();
    try {
      // Use Foundry's movement workflow for permissions, regions, animation, and combat links.
      return await token.document.move(position, { showRuler: false, [MODULE_ID]: { isometricBoardMove: true } });
    } finally {
      this.pendingDestinations.delete(token.document.id);
      this.moving = false;
      this.hover = null;
      this.schedule();
    }
  }

  tokenDocuments() {
    return this.canvas?.scene?.tokens?.contents
      ?? (this.canvas?.tokens?.placeables ?? []).filter(token => !token.isPreview && !token.destroyed).map(token => token.document);
  }

  isOccupied(document, cell, operation, dimensions = {}) {
    if (!cell) return false;
    const layout = this.layout;
    const candidate = { ...cell, size: tokenFootprintSize(document, dimensions) };
    const matches = other => other && footprintDistance(candidate, other) === 0;
    for (const other of this.tokenDocuments()) {
      if (other.id === document.id) continue;
      const planned = operation?.movement?.[other.id]?.waypoints?.at(-1);
      // During animation the document's rendered coordinates can lag its saved
      // destination. Keep that destination occupied until the next actual move.
      if ((other._source && matches(tokenFootprint(other, layout, other._source, this.env)))
        || matches(tokenFootprint(other, layout, {}, this.env))
        || (planned && matches(tokenFootprint(other, layout, { ...other._source, ...planned }, this.env)))) return true;
    }
    for (const [id, destination] of this.pendingDestinations) {
      if (id !== document.id && matches(destination)) return true;
    }
    return false;
  }

  allowMovement(document, movement, operation) {
    if (!this.enabled || document.parent?.id !== this.canvas.scene.id) return;
    // Check user movement before Foundry commits it; leave visual realignment
    // by corpse automation and other programmatic updates in their own workflow.
    if (!["dragging", "keyboard", "config"].includes(movement.method) && !operation?.[MODULE_ID]?.isometricBoardMove) return;
    if (this.gridMoveMode || this.gridSaving) return false;
    const footprint = tokenFootprint(document, this.layout, movement.destination, this.env);
    const onBoard = footprintCells(footprint).some(cell => validCell(cell, this.boardSize));
    if (!onBoard) return;
    if (!validFootprint(footprint, footprint.size, this.boardSize)) {
      this.env.ui?.notifications?.warn(this.text("footprintOutside"));
      return false;
    }
    if (this.isOccupied(document, footprint, operation, movement.destination)) {
      this.env.ui?.notifications?.warn(this.text("occupied"));
      return false;
    }
  }

  snap(document, data = {}) {
    if (!this.enabled || document.parent?.id !== this.canvas.scene.id) return null;
    const cell = pointToTokenCell(document, this.layout, tokenBase(document, data, this.env), data);
    if (!cell) return null;
    return { ...data, ...tokenPosition(document, this.layout, cell, data, this.env), elevation: data.elevation ?? document.elevation };
  }

  destroy() {
    this.settingsVisible = false;
    this.setGridMoveMode(false);
    this.animatedArrows.clear();
    this.stopSelectionAnimation();
    for (const token of this.tokenSelections.keys()) this.clearTokenSelection(token);
    if (this.frame !== null) this.env.cancelAnimationFrame(this.frame);
    this.frame = null;
    this.moveMode = false;
    this.hover = null;
    this.pendingDestinations.clear();
    this.view?.classList.remove("mk-isometric-board-moving");
    this.env.document?.removeEventListener("pointerdown", this.onPointerDown, true);
    this.view?.removeEventListener("pointermove", this.onPointerMove);
    this.view?.removeEventListener("pointerleave", this.onPointerLeave);
    this.env.document?.removeEventListener("keydown", this.onKeyDown, true);
    this.view = null;
    if (this.gridState && !this.gridState.grid.destroyed) this.gridState.grid.visible = this.gridState.visible;
    this.gridState = null;
    this.root?.parent?.removeChild(this.root);
    if (this.root && !this.root.destroyed) this.root.destroy({ children: true });
    this.root = null;
    this.graphics = null;
    this.gridGeometry = null;
    this.gridDrawKey = null;
    this.hud?.remove();
    this.hud = null;
    this.opacityInput = null;
    this.opacityOutput = null;
    this.scaleLabel = null;
    this.boardSizeInput = null;
    this.boardSizeOutput = null;
    this.tiltInput = null;
    this.tiltOutput = null;
    this.rotationInput = null;
    this.rotationOutput = null;
    this.fitButton = null;
    this.gridMoveButton = null;
    this.gridMoveHint = null;
    this.gridColorInput = null;
    this.gridColorOutput = null;
  }
}

export function registerIsometricBoard(environment = globalThis) {
  const board = new IsometricBoardOverlay(environment);
  const creatingCells = new WeakMap();
  const hooks = environment.Hooks;
  hooks.once("setup", () => installBaseTokenRuler(board, environment));
  hooks.on("getSceneControlButtons", controls => board.registerControls(controls));
  hooks.on("canvasReady", () => board.refresh());
  hooks.on("canvasPan", () => { if (board.gridMoveMode) board.schedule(); });
  hooks.on("canvasTearDown", () => board.destroy());
  hooks.on("updateScene", scene => { if (scene.id === board.canvas?.scene?.id) board.refresh(); });
  hooks.on("preMoveToken", (document, movement, operation) => board.allowMovement(document, movement, operation));
  hooks.on("preCreateToken", (document, _data, operation) => {
    if (!board.enabled || document.parent?.id !== board.canvas.scene.id) return;
    const footprint = tokenFootprint(document, board.layout, {}, environment);
    const cells = footprintCells(footprint).filter(cell => validCell(cell, board.boardSize));
    if (!cells.length) return;
    if (!validFootprint(footprint, footprint.size, board.boardSize)) {
      environment.ui?.notifications?.warn(board.text("footprintOutside"));
      return false;
    }
    const reserved = operation && creatingCells.get(operation);
    if (board.isOccupied(document, footprint) || cells.some(cell => reserved?.has(`${cell.column},${cell.row}`))) {
      environment.ui?.notifications?.warn(board.text("occupied"));
      return false;
    }
    if (operation) {
      const keys = cells.map(cell => `${cell.column},${cell.row}`);
      if (reserved) for (const key of keys) reserved.add(key);
      else creatingCells.set(operation, new Set(keys));
    }
  });
  hooks.on("refreshToken", token => { board.refreshTokenSelection(token); board.schedule(); });
  hooks.on("destroyToken", token => board.clearTokenSelection(token));
  for (const hook of ["controlToken", "createToken", "deleteToken", "updateToken", "sightRefresh", "targetToken"]) {
    hooks.on(hook, () => board.schedule());
  }
  hooks.on("activateTokenLayer", () => board.schedule());
  hooks.on("deactivateTokenLayer", () => { board.setMoveMode(false); board.setGridMoveMode(false); });
  hooks.once("ready", () => {
    const module = environment.game?.modules?.get(MODULE_ID);
    if (module) {
      module.api ??= {};
      module.api.isometricBoard = {
        toggle: () => board.toggle(), moveSelected: cell => board.moveSelected(cell),
        setOpacity: (value, options) => board.setOpacity(value, options),
        setBoardSize: value => board.setBoardSize(value),
        setTilt: value => board.setTilt(value), setRotation: value => board.setRotation(value),
        setPosition: (x, y) => board.setPosition(x, y), setGridColor: value => board.setGridColor(value),
        resetView: () => board.resetView(),
        get tilt() { return board.tilt; },
        get rotation() { return board.rotation; },
        get offsetX() { return board.offsetX; },
        get offsetY() { return board.offsetY; },
        get scaleX() { return board.scaleX; },
        get scaleY() { return board.scaleY; },
        get gridColor() { return board.gridColor; },
        get boardSize() { return board.boardSize; },
        get feetPerCell() { return board.feetPerCell; },
        get opacity() { return board.opacity; },
        get enabled() { return board.enabled; },
        get layout() { return board.layout; }
      };
    }
    const prototype = environment.CONFIG?.Token?.documentClass?.prototype;
    const original = prototype?.getSnappedPosition;
    if (original) {
      // The document method is used by both v13 and v14 native drag/drop previews.
      prototype.getSnappedPosition = function(data) { return board.snap(this, data) ?? original.call(this, data); };
    }
    const tokenPrototype = environment.CONFIG?.Token?.objectClass?.prototype;
    const refreshState = tokenPrototype?._refreshState;
    if (refreshState) {
      // Let Foundry compute privacy, bars, targeting and normal border state first.
      tokenPrototype._refreshState = function(...args) {
        const result = refreshState.apply(this, args);
        board.refreshTokenSelection(this, true);
        return result;
      };
    }
    const getDragWaypointPosition = tokenPrototype?._getDragWaypointPosition;
    if (getDragWaypointPosition) {
      // Gridless Scenes and Shift bypass the native getSnappedPosition call.
      // Snap before path planning so the preview, drop, and wall checks agree.
      tokenPrototype._getDragWaypointPosition = function(current, changes, options) {
        const source = this.document._source ?? this.document;
        const position = board.snap(this.document, {
          x: changes.x ?? current.x, y: changes.y ?? current.y,
          elevation: changes.elevation ?? current.elevation,
          width: source.width, height: source.height, shape: source.shape
        });
        if (position) {
          const cell = tokenCell(this.document, board.layout, position, environment);
          if (board.isOccupied(this.document, cell, undefined, position)) {
            return { ...position, x: current.x, y: current.y, elevation: current.elevation };
          }
          return position;
        }
        return getDragWaypointPosition.call(this, current, changes, options);
      };
    }
    const getDragOrigin = tokenPrototype?._getDragOrigin;
    if (getDragOrigin) {
      // Native dragging subtracts this point from the cursor for previews and
      // added waypoints. Changing only snapping leaves a half-token cursor offset.
      tokenPrototype._getDragOrigin = function(...args) {
        return board.enabled && this.document?.parent?.id === board.canvas?.scene?.id
          ? tokenBase(this.document, this.document._source ?? {}, environment) : getDragOrigin.apply(this, args);
      };
    }
    if (board.canvas?.ready) board.refresh();
  });
  return board;
}

if (globalThis.Hooks) registerIsometricBoard();
