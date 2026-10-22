import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BOARD_SIZE, MIN_BOARD_SIZE, MAX_BOARD_SIZE, FEET_PER_CELL, createLayout, readLayout, project, cellCenter, pointToCell,
  cellDistance, rangeBand, tokenCell, tokenPosition, tokenBase, tokenTop, measureBasePath,
  normalizeBoardSize, readBoardSize, validCell, tokenFootprintSize, tokenFootprint, footprintCells,
  footprintCenter, footprintAnchor, footprintDistance, validFootprint, pointToTokenCell, normalizeTilt, normalizeRotation, normalizeOffset, normalizeScale
} from "../scripts/isometric-board/geometry.js";
import { IsometricBoardOverlay, registerIsometricBoard } from "../scripts/isometric-board/isometric-board.js";

class Element {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; } };
    this.classList = { toggle() {}, remove() {} };
    this.listeners = new Map();
    this.listenerOptions = new Map();
    this.capturedPointers = new Set();
  }
  append(...children) { for (const child of children) child.parentElement = this; this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback, options) { this.listeners.set(key, callback); this.listenerOptions.set(key, options); }
  removeEventListener(key) { this.listeners.delete(key); this.listenerOptions.delete(key); }
  setPointerCapture(id) { this.capturedPointers.add(id); }
  hasPointerCapture(id) { return this.capturedPointers.has(id); }
  releasePointerCapture(id) { this.capturedPointers.delete(id); this.listeners.get("lostpointercapture")?.({ pointerId: id }); }
  remove() { this.removed = true; }
  closest(selector) { return selector === this.tagName.toLowerCase() ? this : this.parentElement?.closest(selector) ?? null; }
  getBoundingClientRect() { return { left: 10, top: 20, width: 1000, height: 800 }; }
}

function harness({ gm = true, enabled = true, paused = false, opacity = 20, gridless = false,
  reducedMotion = false, photosensitive = false } = {}) {
  let flag = { enabled };
  let savedOpacity = opacity;
  const hooks = new Map();
  const calls = { moves: [], warnings: [], errors: [], flags: [], frames: [], settings: [], gridRenders: 0 };
  const scene = {
    id: "scene", grid: { size: 100, isGridless: gridless }, width: 4000, height: 3000,
    getFlag: () => flag,
    async setFlag(scope, key, value) {
      assert.equal(scope, "mk-shadowdark");
      assert.equal(key, "isometricBoard");
      calls.flags.push(structuredClone(value));
      flag = value;
    }
  };
  class TokenDocument {
    constructor({ id = "hero", owner = true, hidden = false, cell = { column: 5, row: 5 }, parent = scene,
      width = 1, height = 1, disposition = 1 } = {}) {
      Object.assign(this, { id, isOwner: owner, hidden, parent, elevation: 0, width, height, disposition });
      Object.assign(this, tokenPosition(this, createLayout(scene), cell));
    }
    getSize(data = {}) { return { width: (data.width ?? this.width) * 100, height: (data.height ?? this.height) * 100 }; }
    getCenterPoint(data = {}) {
      const size = this.getSize(data);
      return { x: (data.x ?? this.x) + size.width / 2, y: (data.y ?? this.y) + size.height / 2 };
    }
    getSnappedPosition(data) { return { native: true, ...data }; }
    canUserModify(user) { return user.isGM || this.isOwner; }
    async move(position, options) { calls.moves.push({ document: this, position, options }); Object.assign(this, position); return true; }
  }
  class Token {
    constructor() {
      this.children = [];
      this.border = { visible: false };
      this.controlled = true;
      this.layer = { active: true };
      this.renderFlags = { set: flags => { if (flags.refreshState) this._refreshState(); } };
    }
    addChild(child) { this.children.push(child); child.parent = this; return child; }
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parent = null; }
    _refreshState() {
      this.border.visible = !this.document.isSecret && Boolean(this.controlled || this.hover || this.layer.highlightObjects);
      this.nameplateVisible = !this.document.isSecret;
      this.targetArrowsVisible = !this.document.isSecret;
      return "native-state";
    }
    _getDragOrigin() { return this.document.getCenterPoint(this.document._source ?? {}); }
    _getDragWaypointPosition(current, changes, { snap = false } = {}) {
      const position = { x: Math.round(changes.x ?? current.x), y: Math.round(changes.y ?? current.y),
        elevation: changes.elevation ?? current.elevation };
      return snap ? this.document.getSnappedPosition(position) : position;
    }
    dragTo(point, { snap = true } = {}) {
      const origin = this._getDragOrigin();
      const source = this.document._source ?? this.document;
      const position = { x: source.x + point.x - origin.x, y: source.y + point.y - origin.y };
      return this._getDragWaypointPosition(source, position, { snap: snap && !scene.grid.isGridless });
    }
  }
  const token = Object.assign(new Token(), { document: new TokenDocument(), name: "Adventurer", visible: true,
    isVisible: true, checkCollision: () => false });
  token.document.object = token;
  class Container {
    constructor() { this.children = []; this.x = 0; this.y = 0; }
    addChild(child) { this.children.push(child); child.parent = this; return child; }
    addChildAt(child) { return this.addChild(child); }
    removeChild(child) { this.children = this.children.filter(c => c !== child); child.parent = null; }
    destroy(options = {}) {
      this.destroyed = true;
      if (options.children) for (const child of this.children) child.destroy(options);
    }
  }
  class Graphics extends Container {
    clear() {
      this.polygons = 0; this.polygonPoints = []; this.lineAlphas = []; this.fillAlphas = [];
      this.lineColors = []; this.fillColors = []; this.starts = []; this.ends = [];
    }
    lineStyle(_width, color, alpha) { this.lineAlphas.push(alpha); this.lineColors.push(color); }
    beginFill(color, alpha) { this.fillAlphas.push(alpha); this.fillColors.push(color); }
    endFill() {}
    moveTo(x, y) { this.starts.push({ x, y }); }
    lineTo(x, y) { this.ends.push({ x, y }); }
    drawPolygon(points) { this.polygons++; this.polygonPoints.push(points); }
  }
  class Primary extends Container {
    static SORT_LAYERS = { SCENE: 0, TILES: 500, TOKENS: 700 };
  }
  const primary = new Primary();
  primary.background = primary.addChild(Object.assign(new Container(), { elevation: 0, sortLayer: 0 }));
  token.mesh = primary.addChild(Object.assign(new Container(), { elevation: 0, sortLayer: 700 }));
  const dom = new Element();
  dom.body = new Element();
  dom.createElement = tagName => new Element(tagName);
  const view = new Element();
  const module = { api: { existingFeature: true } };
  class NativeRuler {
    constructor(token) { this.token = token; this.visible = true; }
    refresh(data) { this.received = data; }
    _onVisibleChange() {}
    _getWaypointStyle() { return { radius: 6 }; }
    _getSegmentStyle() { return { width: 4 }; }
    _getGridHighlightStyle() { return { alpha: 0.5 }; }
    _getWaypointLabelContext(waypoint) {
      return { position: this.token.document.getCenterPoint(waypoint), cost: { total: "native" } };
    }
    clear() { this.cleared = true; }
    destroy() { this.destroyed = true; }
  }
  const environment = {
    matchMedia: () => ({ matches: reducedMotion }),
    game: { user: { id: "local", isGM: gm }, paused, modules: new Map([["mk-shadowdark", module]]), settings: {
      get(scope, key) {
        if (scope === "core") { assert.equal(key, "photosensitiveMode"); return photosensitive; }
        assert.equal(scope, "mk-shadowdark");
        assert.equal(key, "isometricBoardOpacity");
        return savedOpacity;
      },
      async set(scope, key, value) {
        assert.equal(scope, "mk-shadowdark");
        assert.equal(key, "isometricBoardOpacity");
        calls.settings.push(value);
        savedOpacity = value;
        return value;
      }
    }, i18n: {
      localize: key => key.split(".").at(-1),
      format: (key, data) => `${key.split(".").at(-1)}:${Object.values(data).join("|")}`
    } },
    canvas: {
      ready: true, scene, dimensions: { sceneRect: { x: 0, y: 0, width: 4000, height: 3000 } },
      controls: new Container(), primary, interface: { grid: { visible: true } },
      app: { canvas: view, screen: { width: 1000, height: 800 }, ticker: {
        listeners: new Map(), deltaMS: 0, adds: 0,
        add(callback, context) { this.adds++; this.listeners.set(callback, context); },
        remove(callback, context) { if (this.listeners.get(callback) === context) this.listeners.delete(callback); },
        tick(elapsed) {
          this.deltaMS = elapsed;
          for (const [callback, context] of [...this.listeners]) callback.call(context, elapsed / (1000 / 60));
        }
      } },
      stage: { toLocal: point => point }, tokens: { controlled: [token], placeables: [token] }
    },
    Hooks: {
      on(name, fn) { hooks.set(name, [...(hooks.get(name) ?? []), fn]); },
      once(name, fn) { this.on(name, fn); }
    },
    CONFIG: { Token: { documentClass: TokenDocument, objectClass: Token, rulerClass: NativeRuler } },
    PIXI: { Container, Graphics }, document: dom,
    requestAnimationFrame(fn) { calls.frames.push(fn); return calls.frames.length; },
    cancelAnimationFrame() {},
    ui: { notifications: { warn: message => calls.warnings.push(message) }, controls: { render(options) { calls.gridRenders++; calls.controlOptions = options; } } }
  };
  return { environment, calls, token, scene, TokenDocument, hooks, module, setFlag(value) { flag = value; } };
}

function dragRulerData(waypoints, history = []) {
  return {
    passedWaypoints: history, pendingWaypoints: [],
    plannedMovement: { local: { history, foundPath: waypoints, unreachableWaypoints: [], hidden: false } }
  };
}

test("all 324 isometric cell centers round-trip, including scene padding and fractional sizes", () => {
  for (const rectangle of [
    { x: 350, y: 250, width: 2100, height: 1600 },
    { x: -230, y: 80, width: 8300, height: 1200 },
    { x: 600, y: 420, width: 900, height: 7400 },
    { x: 50.5, y: 70.25, width: 1500.75, height: 1500.75 }
  ]) {
    const layout = createLayout({}, rectangle);
    let count = 0;
    for (let row = 0; row < BOARD_SIZE; row++) for (let column = 0; column < BOARD_SIZE; column++) {
      const cell = { column, row };
      assert.deepEqual(pointToCell(layout, cellCenter(layout, cell)), cell);
      count++;
    }
    assert.equal(count, 324);
    assert.equal(pointToCell(layout, project(layout, -0.5, 0.5)), null);
    assert.equal(pointToCell(layout, project(layout, 18.5, 0.5)), null);
    assert.equal(pointToCell(layout, { x: NaN, y: 1 }), null);
  }
});

function assertBoardEdges(layout, rectangle) {
  const { x, y, width, height } = rectangle;
  const size = layout.size;
  const tips = [
    [project(layout, 0, 0), { x: x + width / 2, y }],
    [project(layout, size, 0), { x: x + width, y: y + height / 2 }],
    [project(layout, size, size), { x: x + width / 2, y: y + height }],
    [project(layout, 0, size), { x, y: y + height / 2 }]
  ];
  for (const [actual, expected] of tips) {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-7);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-7);
  }
}

test("board dimensions follow the full Scene width and height independently of the native grid", () => {
  for (const rectangle of [
    { x: 0, y: 0, width: 4000, height: 3000 },
    { x: 500, y: 300, width: 10000, height: 1200 },
    { x: -80, y: 200, width: 800, height: 7200 }
  ]) {
    let expected;
    for (const size of [0, 25, 100, 300, 1000]) {
      const layout = createLayout({ grid: { size } }, rectangle);
      assertBoardEdges(layout, rectangle);
      assert.equal(layout.cellWidth, rectangle.width / BOARD_SIZE);
      assert.equal(layout.cellHeight, rectangle.height / BOARD_SIZE);
      if (expected) assert.deepEqual(layout, expected);
      expected = layout;
    }
    const scene = { width: rectangle.width, height: rectangle.height,
      get grid() { throw new Error("Layout must not read native grid settings"); } };
    assertBoardEdges(createLayout(scene), { ...rectangle, x: 0, y: 0 });
  }
});

test("tilt and rotation fit inside the Scene, preserve its center, and round-trip every cell", () => {
  for (const rectangle of [
    { x: 250, y: 175, width: 4000, height: 3000 },
    { x: -180, y: 300, width: 7200, height: 1200 }
  ]) for (const tilt of [null, 5, 30, 60, 85]) for (const rotation of [-180, -90, -35, 0, 45, 90, 180]) {
    const layout = createLayout({}, rectangle, { tilt, rotation });
    const center = project(layout, 9, 9);
    assert.ok(Math.abs(center.x - (rectangle.x + rectangle.width / 2)) < 1e-7);
    assert.ok(Math.abs(center.y - (rectangle.y + rectangle.height / 2)) < 1e-7);
    const corners = [[0, 0], [18, 0], [18, 18], [0, 18]].map(([column, row]) => project(layout, column, row));
    for (const point of corners) {
      assert.ok(point.x >= rectangle.x - 1e-7 && point.x <= rectangle.x + rectangle.width + 1e-7);
      assert.ok(point.y >= rectangle.y - 1e-7 && point.y <= rectangle.y + rectangle.height + 1e-7);
    }
    const width = Math.max(...corners.map(p => p.x)) - Math.min(...corners.map(p => p.x));
    const height = Math.max(...corners.map(p => p.y)) - Math.min(...corners.map(p => p.y));
    assert.ok(Math.abs(width - rectangle.width) < 1e-7 || Math.abs(height - rectangle.height) < 1e-7);
    if (tilt !== null) assert.ok(Math.abs(layout.cellHeight / layout.cellWidth - Math.tan(tilt * Math.PI / 180)) < 1e-7);
    for (let row = 0; row < 18; row++) for (let column = 0; column < 18; column++) {
      const cell = { column, row };
      assert.deepEqual(pointToCell(layout, cellCenter(layout, cell)), cell);
    }
  }
  assert.equal(normalizeTilt(undefined), null);
  assert.equal(normalizeTilt(" "), null);
  assert.equal(normalizeTilt(0), 5);
  assert.equal(normalizeTilt(90), 85);
  assert.equal(normalizeTilt("30.4"), 30);
  assert.equal(normalizeRotation(undefined), 0);
  assert.equal(normalizeRotation(-270), -180);
  assert.equal(normalizeRotation(270), 180);
});

function gridPointer(board, x, y, options = {}) {
  return {
    target: board.view, clientX: x, clientY: y, button: 0, pointerId: 1,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }, ...options
  };
}

test("saved offsets translate every tilted and rotated cell without changing tile size, ignoring obsolete top limits", () => {
  for (const value of [undefined, null, "", " ", "invalid", NaN, Infinity, false]) assert.equal(normalizeOffset(value), 0);
  assert.equal(normalizeOffset("350.6"), 351);
  assert.equal(normalizeOffset(-120.4), -120);
  for (const rect of [{ x: 350, y: 250, width: 4000, height: 3000 }, { x: -100, y: 175, width: 7200, height: 1200 }]) {
    for (const size of [6, 18]) for (const tilt of [null, 30, 70]) for (const rotation of [0, -35, 90]) {
      const original = createLayout({}, rect, { boardSize: size, tilt, rotation });
      const layout = createLayout({}, rect, { boardSize: size, offsetX: -340, offsetY: 220, topLimit: 1000, tilt, rotation });
      assert.equal(layout.offsetX, -340);
      assert.equal(layout.offsetY, 220);
      assert.equal(layout.topLimit, undefined);
      assert.equal(layout.cellWidth, original.cellWidth);
      assert.equal(layout.cellHeight, original.cellHeight);
      if (tilt === null && rotation === 0) assertBoardEdges(layout, { ...rect, x: rect.x - 340, y: rect.y + 220 });
      for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
        const cell = { column, row };
        const from = cellCenter(original, cell);
        const to = cellCenter(layout, cell);
        assert.ok(Math.abs(to.x - from.x + 340) < 1e-7);
        assert.ok(Math.abs(to.y - from.y - 220) < 1e-7);
        assert.deepEqual(pointToCell(layout, to), cell);
      }
    }
  }
});

test("independent width and height preserve cell mapping, square count and legacy proportional sizes", () => {
  for (const value of [undefined, null, "", " ", "bad", false, NaN, Infinity]) assert.equal(normalizeScale(value), 1);
  assert.equal(normalizeScale(-3), 0.1);
  assert.equal(normalizeScale(9), 4);
  assert.equal(normalizeScale("0.75"), 0.75);
  for (const size of [6, 18]) for (const tilt of [null, 20, 70]) for (const rotation of [0, -35, 90]) {
    const rect = { x: 350, y: 200, width: 4000, height: 3000 };
    const original = createLayout({}, rect, { boardSize: size, tilt, rotation, offsetX: 100, offsetY: -70 });
    const layout = createLayout({}, rect, { boardSize: size, tilt, rotation, offsetX: 100, offsetY: -70, scale: 0.65 });
    assert.equal(layout.size, size);
    assert.equal(layout.scaleX, 0.65);
    assert.equal(layout.scaleY, 0.65);
    assert.equal(layout.centerX, original.centerX);
    assert.equal(layout.centerY, original.centerY);
    assert.ok(Math.abs(layout.cellWidth / original.cellWidth - 0.65) < 1e-10);
    assert.ok(Math.abs(layout.cellHeight / original.cellHeight - 0.65) < 1e-10);
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      assert.deepEqual(pointToCell(layout, cellCenter(layout, { column, row })), { column, row });
    }
    const stretched = createLayout({}, rect, { boardSize: size, tilt, rotation, scale: 0.65, scaleX: 0.4, scaleY: 1.4 });
    assert.ok(Math.abs(stretched.cellWidth / original.cellWidth - 0.4) < 1e-10);
    assert.ok(Math.abs(stretched.cellHeight / original.cellHeight - 1.4) < 1e-10);
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      assert.deepEqual(pointToCell(stretched, cellCenter(stretched, { column, row })), { column, row });
    }
  }
});

test("all four frame corners resize width and height independently through rotation and camera zoom", async () => {
  for (const size of [6, 18]) for (const rotation of [0, -35, 90]) for (let corner = 0; corner < 4; corner++)
  for (const [ratioX, ratioY] of [[1.25, 1.15], [1.25, 1], [1, 1.25]]) {
    const { environment, hooks, scene, token, calls, setFlag, module } = harness({ opacity: 0 });
    setFlag({ enabled: true, boardSize: size, rotation, tilt: 30, scale: 0.8, offsetX: 80, offsetY: -30, custom: true });
    const zoom = 0.4;
    const pan = { x: -250, y: 150 };
    environment.canvas.app.canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 500, height: 400 });
    environment.canvas.stage.toLocal = point => ({ x: point.x / zoom + pan.x, y: point.y / zoom + pan.y });
    const board = registerIsometricBoard(environment);
    Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 2, row: 2 }));
    const position = { x: token.document.x, y: token.document.y };
    hooks.get("ready")[0]();
    board.setGridMoveMode(true);
    assert.equal(board.gridHandles.parent, environment.canvas.controls);
    assert.equal(board.gridHandles.polygons, 6);
    assert.ok(board.gridHandles.fillAlphas.every(alpha => alpha === 1));
    const pointer = point => gridPointer(board, 10 + (point.x - pan.x) * zoom / 2, 20 + (point.y - pan.y) * zoom / 2);
    const layout = board.layout;
    const tips = board.gridResizeCorners();
    const tip = tips[corner];
    const fixed = tips[(corner + 2) % 4];
    const widthDelta = (corner === 1 || corner === 2 ? 1 : -1) * size * layout.cellWidth * (ratioX - 1);
    const heightDelta = (corner >= 2 ? 1 : -1) * size * layout.cellHeight * (ratioY - 1);
    const destination = { x: tip.x + widthDelta * layout.cos - heightDelta * layout.sin,
      y: tip.y + widthDelta * layout.sin + heightDelta * layout.cos };
    board.handlePointerMove(pointer(tip));
    assert.equal(board.gridResizeCorner, corner);
    board.handlePointerDown(pointer(tip));
    assert.equal(board.gridDrag.corner, corner);
    board.handleGridPointerMove(pointer(destination));
    board.draw();
    assert.equal(calls.flags.length, 0);
    assert.equal(scene.getFlag().scale, 0.8);
    assert.ok(Math.abs(board.scaleX - 0.8 * ratioX) < 1e-10);
    assert.ok(Math.abs(board.scaleY - 0.8 * ratioY) < 1e-10);
    const pinned = board.gridResizeCorners()[(corner + 2) % 4];
    assert.ok(Math.abs(pinned.x - fixed.x) <= 0.501);
    assert.ok(Math.abs(pinned.y - fixed.y) <= 0.501);
    assert.ok(Math.abs(board.layout.cellWidth / layout.cellWidth - ratioX) < 1e-10);
    assert.ok(Math.abs(board.layout.cellHeight / layout.cellHeight - ratioY) < 1e-10);
    assert.equal(board.layout.size, size);
    assert.equal(board.graphics.polygons, size * size);
    assert.notEqual(await board.finishGridDrag(pointer(destination)), false);
    assert.equal(calls.flags.length, 1);
    assert.equal(scene.getFlag().boardSize, size);
    assert.equal(scene.getFlag().custom, true);
    assert.equal(module.api.isometricBoard.scaleX, board.scaleX);
    assert.equal(module.api.isometricBoard.scaleY, board.scaleY);
    assert.equal(new IsometricBoardOverlay(environment).scaleX, board.scaleX);
    assert.equal(new IsometricBoardOverlay(environment).scaleY, board.scaleY);
    assert.equal(board.rotation, rotation);
    assert.equal(board.tilt, 30);
    assert.equal(board.feetPerCell, 5);
    assert.equal(calls.moves.length, 0);
    assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
    const target = { column: 3, row: 3 };
    const snap = board.snap(token.document, tokenPosition(token.document, board.layout, target));
    assert.deepEqual(tokenCell(token.document, board.layout, snap), target);
    const next = tokenPosition(token.document, board.layout, { column: 4, row: 3 });
    assert.deepEqual(measureBasePath(token.document, board.layout, [snap, next]), { total: 5, delta: 5 });
    board.setGridMoveMode(false);
    assert.equal(board.gridHandles, null);
    assert.equal(environment.canvas.controls.children.length, 0);
  }
});

test("corner drags shrink one axis without jumping when grabbed off-center, and cannot invert either dimension", async () => {
  const { environment, hooks, calls } = harness();
  environment.canvas.tokens.placeables = [];
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  board.setGridMoveMode(true);
  const fixed = board.gridResizeCorners()[2];
  const grab = gridPointer(board, 14, 24);
  board.handlePointerDown(grab);
  assert.equal(board.gridDrag.corner, 0);
  assert.equal(await board.finishGridDrag(grab), false);
  assert.equal(calls.flags.length, 0);
  board.handlePointerDown(grab);
  const drop = gridPointer(board, 14, 624);
  board.handleGridPointerMove(drop);
  assert.equal(board.scaleX, 1);
  assert.equal(board.scaleY, 0.8);
  assert.deepEqual(board.gridResizeCorners()[2], fixed);
  assert.notEqual(await board.finishGridDrag(drop), false);
  assert.equal(board.boardSize, 18);
  assert.equal(calls.flags.length, 1);
  const tip = board.gridResizeCorners()[0];
  board.handlePointerDown(gridPointer(board, tip.x + 10, tip.y + 20));
  board.handleGridPointerMove(gridPointer(board, fixed.x + 2010, fixed.y + 2020));
  assert.equal(board.scaleX, 0.1);
  assert.equal(board.scaleY, 0.1);
  assert.ok(board.layout.cellWidth > 0 && board.layout.cellHeight > 0);
  board.onKeyDown({ key: "Escape" });
  assert.equal(board.scaleX, 1);
  assert.equal(board.scaleY, 0.8);
  assert.equal(board.gridHandles, null);
});

test("shrinking from a corner rejects partly clipped Large bases without changing the saved board", async () => {
  const { environment, token, hooks, calls } = harness();
  const board = registerIsometricBoard(environment);
  Object.assign(token.document, { width: 2, height: 2 });
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 0, row: 0 }));
  hooks.get("ready")[0]();
  board.setGridMoveMode(true);
  board.handlePointerDown(gridPointer(board, 10, 20));
  const drop = gridPointer(board, 10, 120);
  board.handleGridPointerMove(drop);
  assert.equal(board.scaleX, 1);
  assert.ok(board.scaleY < 1);
  assert.equal(await board.finishGridDrag(drop), false);
  assert.equal(board.scaleX, 1);
  assert.equal(board.scaleY, 1);
  assert.equal(board.offsetX, 0);
  assert.equal(board.offsetY, 0);
  assert.deepEqual(calls.warnings, ["viewOccupied"]);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
});

test("corner resizing preserves its scale through grid-count and Scene changes, and Fit scene restores the default size", async () => {
  const { environment, scene, hooks, calls, setFlag } = harness();
  setFlag({ enabled: true, boardSize: 12, scale: 0.9, scaleX: 0.65, scaleY: 1.3, offsetX: 120, offsetY: -80 });
  environment.canvas.tokens.placeables = [];
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const bounds = board.gridCorners();
  assert.equal(await board.setBoardSize(6), 6);
  assert.deepEqual(board.gridCorners(), bounds);
  scene.getDimensions = () => ({ sceneRect: { x: 400, y: 250, width: 6000, height: 4200 } });
  hooks.get("updateScene")[0](scene);
  assert.equal(board.scaleX, 0.65);
  assert.equal(board.scaleY, 1.3);
  assert.equal(board.layout.centerX, 3520);
  assert.equal(board.layout.centerY, 2270);
  assert.equal(board.layout.cellWidth, 650);
  assert.equal(board.layout.cellHeight, 910);
  assert.equal(calls.flags.length, 1);
  await board.resetView();
  assert.equal(board.scaleX, 1);
  assert.equal(board.scaleY, 1);
  assert.equal(board.boardSize, 6);
  assertBoardEdges(board.layout, scene.getDimensions().sceneRect);
});

test("corner resize cancellation, failed saves and overlapping token bases restore the saved size", async () => {
  for (const ending of ["escape", "cancel", "capture", "scene", "permission", "failure", "overlap"]) {
    const { environment, scene, hooks, calls, token, TokenDocument } = harness();
    const board = registerIsometricBoard(environment);
    if (ending === "overlap") {
      // Adjacent original cells merge into one larger cell after doubling the board.
      Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 5, row: 4 }));
      const other = new TokenDocument({ id: "other", cell: { column: 6, row: 4 } });
      scene.tokens = { contents: [token.document, other] };
    }
    hooks.get("ready")[0]();
    board.setGridMoveMode(true);
    const tip = board.gridResizeCorners()[0];
    const destination = { x: tip.x - 3990, y: tip.y - 3000 };
    const down = gridPointer(board, tip.x + 10, tip.y + 20);
    const up = gridPointer(board, destination.x, destination.y + 20);
    board.handlePointerDown(down);
    board.handleGridPointerMove(up);
    assert.equal(board.scaleX, 2);
    assert.equal(board.scaleY, 2);
    if (ending === "escape") board.onKeyDown({ key: "Escape" });
    if (ending === "cancel") environment.document.listeners.get("pointercancel")({ pointerId: 1 });
    if (ending === "capture") board.view.releasePointerCapture(1);
    if (ending === "scene") hooks.get("updateScene")[0](scene);
    if (ending === "permission") environment.game.user.isGM = false;
    if (ending === "failure") {
      scene.setFlag = async () => { throw new Error("save failed"); };
      await assert.rejects(board.finishGridDrag(up), /save failed/);
    } else assert.equal(await board.finishGridDrag(up), false);
    assert.equal(board.scaleX, 1);
    assert.equal(board.scaleY, 1);
    assert.equal(board.positionPreview, null);
    assert.equal(board.gridDrag, null);
    assert.equal(board.view.hasPointerCapture(1), false);
    assert.equal(board.gridSaving, false);
    assert.equal(calls.flags.length, 0);
    assert.equal(calls.moves.length, 0);
    if (ending === "overlap") assert.deepEqual(calls.warnings, ["viewOccupied"]);
  }
});

test("resize handles keep a consistent screen size across zoom and reject players", () => {
  const { environment, calls, hooks } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  board.setGridMoveMode(true);
  const width = () => board.gridHandles.polygonPoints[2][2] - board.gridHandles.polygonPoints[2][0];
  assert.equal(width(), 14);
  environment.canvas.stage.toLocal = point => ({ x: point.x * 2 + 100, y: point.y * 2 + 200 });
  hooks.get("canvasPan")[0]();
  calls.frames.at(-1)();
  assert.equal(width(), 28);
  environment.game.user.isGM = false;
  board.draw();
  assert.equal(board.gridHandles, null);
  board.destroy();
  assert.equal(environment.canvas.controls.children.length, 0);
});

test("Move Grid captures canvas drags, previews camera-aware offsets, saves once on release, and leaves tokens in place", async () => {
  const { environment, hooks, scene, token, module, calls, setFlag } = harness();
  setFlag({ enabled: true, offsetX: 40, offsetY: -20, topLimit: 900, custom: true });
  environment.canvas.stage.toLocal = point => ({ x: point.x * 2 + 100, y: point.y * 2 + 200 });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const position = { x: token.document.x, y: token.document.y };
  const cellWidth = board.layout.cellWidth;
  assert.equal(board.gridMoveButton.textContent, "moveGrid");
  assert.equal(board.topLimitInput, undefined);
  assert.equal(module.api.isometricBoard.setTopLimit, undefined);
  assert.equal(await board.setMoveMode(true), true);
  board.gridMoveButton.listeners.get("click")();
  assert.equal(board.gridMoveMode, true);
  assert.equal(board.moveMode, false);
  assert.equal(board.gridMoveButton.textContent, "finishGridMove");
  assert.equal(board.gridMoveButton.attributes["aria-pressed"], "true");
  assert.equal(environment.document.listenerOptions.get("pointermove"), true);
  const down = gridPointer(board, 210, 220);
  environment.document.listeners.get("pointerdown")(down);
  assert.equal(down.prevented && down.stopped, true);
  assert.equal(board.view.hasPointerCapture(1), true);
  const move = gridPointer(board, 240, 260);
  environment.document.listeners.get("pointermove")(move);
  board.draw();
  assert.deepEqual(board.positionPreview, { offsetX: 100, offsetY: 60 });
  assert.equal(board.layout.cellWidth, cellWidth);
  assert.equal(scene.getFlag().offsetX, 40);
  assert.equal(calls.flags.length, 0);
  assert.equal(move.prevented && move.stopped, true);
  assert.equal(await board.moveSelected({ column: 8, row: 8 }), false);
  assert.equal(board.allowMovement(token.document, { method: "keyboard" }), false);
  const up = gridPointer(board, 240, 260, { target: new Element() });
  assert.deepEqual(await board.finishGridDrag(up), { offsetX: 100, offsetY: 60 });
  assert.equal(up.prevented && up.stopped, true);
  assert.equal(board.view.hasPointerCapture(1), false);
  assert.equal(calls.flags.length, 1);
  assert.equal(scene.getFlag().custom, true);
  assert.equal(module.api.isometricBoard.offsetX, 100);
  assert.equal(module.api.isometricBoard.offsetY, 60);
  assert.equal(new IsometricBoardOverlay(environment).offsetX, 100);
  assert.equal(board.positionPreview, null);
  assert.equal(board.gridMoveButton.disabled, false);
  board.gridMoveButton.listeners.get("click")();
  assert.equal(board.gridMoveMode, false);
  assert.equal(environment.document.listeners.has("pointermove"), false);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
  await board.resetView();
  assert.equal(board.offsetX, 0);
  assert.equal(board.offsetY, 0);
  assertBoardEdges(board.layout, environment.canvas.dimensions.sceneRect);
});

test("saved grid offsets follow fresh resized Scene dimensions without rewriting flags or using old top limits", () => {
  const { environment, scene, hooks, setFlag, calls } = harness();
  setFlag({ enabled: true, topLimit: 1200, offsetX: 240, offsetY: -80 });
  scene.getDimensions = () => ({ sceneRect: { x: 350, y: 250, width: scene.width, height: scene.height } });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  assert.deepEqual(project(board.layout, 9, 9), { x: 2590, y: 1670 });
  scene.width = 6400;
  scene.height = 4200;
  hooks.get("updateScene")[0](scene);
  assert.deepEqual(project(board.layout, 9, 9), { x: 3790, y: 2270 });
  assert.equal(scene.getFlag().topLimit, 1200);
  assert.equal(board.offsetX, 240);
  assert.equal(board.offsetY, -80);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
});

test("grid position changes reject partially clipped creature bases and roll back the drag preview", async () => {
  const { environment, token, hooks, calls, scene } = harness();
  const board = registerIsometricBoard(environment);
  Object.assign(token.document, { width: 2, height: 4 });
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 0, row: 0 }));
  hooks.get("ready")[0]();
  board.setGridMoveMode(true);
  board.handlePointerDown(gridPointer(board, 110, 120));
  board.handleGridPointerMove(gridPointer(board, 110, 220));
  assert.equal(board.offsetY, 100);
  assert.equal(await board.finishGridDrag(gridPointer(board, 110, 220)), false);
  assert.equal(board.offsetX, 0);
  assert.equal(board.offsetY, 0);
  assert.equal(board.positionPreview, null);
  assert.equal(scene.getFlag().offsetY, undefined);
  assert.deepEqual(calls.warnings, ["viewOccupied"]);
  assert.equal(calls.moves.length, 0);
});

test("Escape, pointer cancellation, lost capture, blur and teardown cancel unfinished grid drags", () => {
  for (const ending of ["escape", "cancel", "capture", "blur", "destroy", "scene"]) {
    const { environment, calls, scene, hooks, setFlag } = harness();
    const windowEvents = new Map();
    environment.addEventListener = (type, handler) => windowEvents.set(type, handler);
    environment.removeEventListener = type => windowEvents.delete(type);
    setFlag({ enabled: true, offsetX: 20, offsetY: 30 });
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    board.setGridMoveMode(true);
    const view = board.view;
    board.handlePointerDown(gridPointer(board, 110, 120));
    board.handleGridPointerMove(gridPointer(board, 180, 190));
    if (ending === "escape") board.onKeyDown({ key: "Escape" });
    if (ending === "cancel") environment.document.listeners.get("pointercancel")({ pointerId: 1 });
    if (ending === "capture") view.releasePointerCapture(1);
    if (ending === "blur") windowEvents.get("blur")();
    if (ending === "destroy") board.destroy();
    if (ending === "scene") hooks.get("updateScene")[0](scene);
    assert.equal(board.gridDrag, null, ending);
    assert.equal(board.positionPreview, null, ending);
    assert.equal(board.offsetX, 20, ending);
    assert.equal(board.offsetY, 30, ending);
    assert.equal(view.hasPointerCapture(1), false, ending);
    assert.equal(calls.flags.length, 0, ending);
    assert.equal(calls.moves.length, 0, ending);
    board.destroy();
    assert.equal(windowEvents.size, 0, ending);
    assert.equal(environment.document.listeners.size, 0, ending);
    assert.equal(view.listeners.size, 0, ending);
  }
});

test("grid drags ignore other pointers and recover from a failed save without persisting or moving tokens", async () => {
  const { environment, scene, calls } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  board.setGridMoveMode(true);
  board.handlePointerDown(gridPointer(board, 110, 120));
  board.handleGridPointerMove(gridPointer(board, 180, 190, { pointerId: 2 }));
  assert.equal(board.positionPreview, null);
  assert.equal(await board.finishGridDrag(gridPointer(board, 180, 190, { pointerId: 2 })), false);
  assert.equal(board.view.hasPointerCapture(1), true);
  scene.setFlag = async () => { throw new Error("save rejected"); };
  await assert.rejects(board.finishGridDrag(gridPointer(board, 150, 160)), /save rejected/);
  assert.equal(board.offsetX, 0);
  assert.equal(board.offsetY, 0);
  assert.equal(board.positionPreview, null);
  assert.equal(board.gridSaving, false);
  assert.equal(board.gridMoveButton.disabled, false);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
  assert.equal(board.view.hasPointerCapture(1), false);
});

test("grid saving blocks duplicate drags and mode changes until the shared position is committed", async () => {
  const { environment, scene, calls } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  let release;
  const save = scene.setFlag;
  scene.setFlag = (...args) => new Promise(resolve => { release = async () => { await save(...args); resolve(); }; });
  board.setGridMoveMode(true);
  board.handlePointerDown(gridPointer(board, 110, 120));
  const pending = board.finishGridDrag(gridPointer(board, 140, 150));
  assert.equal(board.gridSaving, true);
  assert.equal(board.gridMoveButton.disabled, true);
  assert.equal(board.setGridMoveMode(true), false);
  const down = gridPointer(board, 120, 130);
  board.handlePointerDown(down);
  assert.equal(down.prevented && down.stopped, true);
  assert.equal(board.gridDrag, null);
  assert.equal(await board.moveSelected({ column: 8, row: 8 }), false);
  await release();
  assert.deepEqual(await pending, { offsetX: 30, offsetY: 30 });
  assert.equal(calls.flags.length, 1);
  assert.equal(board.gridSaving, false);
  assert.equal(board.gridMoveButton.disabled, false);
  assert.equal(board.offsetX, 30);
  assert.equal(board.offsetY, 30);
  assert.equal(calls.moves.length, 0);
});

test("changing scenes, losing GM permission or leaving Token Controls cancels grid dragging before a save", async () => {
  for (const ending of ["scene", "permission", "layer"]) {
    const { environment, scene, hooks, calls } = harness();
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    board.setGridMoveMode(true);
    const view = board.view;
    board.handlePointerDown(gridPointer(board, 110, 120));
    if (ending === "scene") environment.canvas.scene = { ...scene, id: "other-scene" };
    if (ending === "permission") environment.game.user.isGM = false;
    if (ending === "layer") hooks.get("deactivateTokenLayer")[0]();
    assert.equal(await board.finishGridDrag(gridPointer(board, 170, 180)), false);
    assert.equal(board.positionPreview, null);
    assert.equal(board.gridDrag, null);
    assert.equal(view.hasPointerCapture(1), false);
    assert.equal(calls.flags.length, 0);
    assert.equal(calls.moves.length, 0);
  }
});

test("grid-line colors preview locally, persist per Scene, normalize safely, and preserve range fills and opacity", async () => {
  const { environment, hooks, scene, token, calls, module, setFlag } = harness();
  setFlag({ enabled: true, topLimit: 300, custom: true });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const fills = [...board.graphics.fillColors];
  const alphas = [...board.graphics.lineAlphas];
  const position = { x: token.document.x, y: token.document.y };
  assert.equal(board.gridColorInput.value, "#c8bda4");
  board.gridColorInput.value = "#0055ff";
  board.gridColorInput.listeners.get("input")();
  calls.frames.at(-1)();
  assert.equal(scene.getFlag().gridColor, undefined);
  assert.equal(board.gridColorOutput.textContent, "#0055ff");
  assert.ok(board.graphics.lineColors.every(color => color === 0x0055ff));
  assert.deepEqual(board.graphics.fillColors, fills);
  assert.deepEqual(board.graphics.lineAlphas, alphas);
  board.gridColorInput.listeners.get("change")();
  await Promise.resolve();
  assert.equal(scene.getFlag().gridColor, "#0055ff");
  assert.equal(module.api.isometricBoard.gridColor, "#0055ff");
  assert.equal(new IsometricBoardOverlay(environment).gridColor, "#0055ff");
  await board.resetView();
  assert.equal(board.gridColor, "#0055ff");
  assert.equal(await module.api.isometricBoard.setGridColor("#AbC"), "#aabbcc");
  assert.equal(await board.setGridColor("#000"), "#000000");
  assert.ok(board.graphics.lineColors.every(color => color === 0));
  assert.equal(await board.setGridColor("invalid"), "#c8bda4");
  assert.equal(scene.getFlag().custom, true);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
});

test("players read the shared grid position and color but cannot reposition the board", async () => {
  const { environment, setFlag, scene } = harness({ gm: false });
  setFlag({ enabled: true, offsetX: 150, offsetY: -200, gridColor: "#abcdef" });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(board.offsetX, 150);
  assert.equal(board.offsetY, -200);
  assert.equal(board.gridMoveButton, null);
  assert.equal(board.setGridMoveMode(true), false);
  assert.equal(board.gridColorInput.value, "#abcdef");
  assert.equal(board.gridColorInput.disabled, true);
  assert.equal(await board.setPosition(50, 50), false);
  assert.equal(await board.setGridColor("#112233"), false);
  assert.equal(scene.getFlag().offsetX, 150);
  assert.equal(scene.getFlag().offsetY, -200);
  assert.equal(scene.getFlag().gridColor, "#abcdef");
});

test("tilted and rotated footprint anchors preserve all creature sizes and the Large forward offset", () => {
  const { TokenDocument } = harness();
  for (const boardSize of [6, 18]) for (const [tilt, rotation] of [[5, -35], [30, 90], [60, -90], [85, 45], [45, 180]]) {
    const layout = createLayout({}, { x: 300, y: 200, width: 4000, height: 3000 }, { boardSize, tilt, rotation });
    for (const width of [1, 2, 3, 4]) {
      const document = new TokenDocument({ width, height: width * 2 });
      for (const cell of [{ column: 0, row: 0 }, { column: boardSize - width, row: boardSize - width }]) {
        const position = tokenPosition(document, layout, cell);
        const feet = tokenBase(document, position);
        const anchor = footprintAnchor(layout, cell, width);
        assert.deepEqual(tokenCell(document, layout, position), cell);
        assert.deepEqual(pointToTokenCell(document, layout, anchor), cell);
        assert.ok(Math.abs(feet.x - anchor.x) <= 0.5);
        assert.ok(Math.abs(feet.y - anchor.y) <= 0.5);
        if (width === 2) {
          const center = footprintCenter(layout, cell, width);
          assert.ok(Math.abs(Math.hypot(anchor.x - center.x, anchor.y - center.y) - layout.cellHeight / 2) < 1e-7);
          const tip = project(layout, cell.column + 2, cell.row + 2);
          assert.ok(Math.abs(anchor.x - (center.x + tip.x) / 2) < 1e-7);
          assert.ok(Math.abs(anchor.y - (center.y + tip.y) / 2) < 1e-7);
        }
      }
    }
  }
});

test("GM angle controls save shared tilt and rotation and Fit scene restores automatic full coverage", async () => {
  const { environment, scene, token, hooks, module, calls, setFlag } = harness();
  setFlag({ enabled: true, feetPerCell: 10, custom: true });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const source = { x: token.document.x, y: token.document.y };
  assert.equal(board.tiltInput.min, "5");
  assert.equal(board.tiltInput.max, "85");
  assert.equal(board.rotationInput.min, "-180");
  assert.equal(board.rotationInput.max, "180");
  assert.equal(board.tiltOutput.textContent, "autoAngle");
  board.tiltInput.value = "25";
  board.tiltInput.listeners.get("input")();
  board.draw();
  assert.equal(board.tiltInput.value, "25");
  assert.equal(board.tiltOutput.textContent, "angleValue:25");
  assert.equal(board.layout.autoTilt, true);
  board.tiltInput.listeners.get("change")();
  await Promise.resolve();
  assert.equal(scene.getFlag().tilt, 25);
  assert.equal(board.tilt, 25);
  board.rotationInput.value = "45";
  board.rotationInput.listeners.get("input")();
  board.draw();
  assert.equal(board.rotationInput.value, "45");
  assert.equal(board.rotation, 0);
  board.rotationInput.listeners.get("change")();
  await Promise.resolve();
  assert.equal(module.api.isometricBoard.rotation, 45);
  assert.equal(await module.api.isometricBoard.setTilt(30), 30);
  assert.equal(await module.api.isometricBoard.setRotation(-60), -60);
  assert.equal(new IsometricBoardOverlay(environment).rotation, -60);
  assert.equal(await module.api.isometricBoard.setBoardSize(6), 6);
  assert.equal(board.graphics.polygons, 36);
  await board.toggle();
  await board.toggle();
  assert.equal(board.tilt, 30);
  assert.equal(board.rotation, -60);
  assert.equal(scene.getFlag().custom, true);
  assert.equal(board.feetPerCell, 5);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, source);
  board.fitButton.listeners.get("click")();
  await Promise.resolve();
  assert.equal(board.layout.autoTilt, true);
  assert.equal(board.rotation, 0);
  assert.equal(board.tiltOutput.textContent, "autoAngle");
  assertBoardEdges(board.layout, environment.canvas.dimensions.sceneRect);
});

test("players see shared angles but cannot change the view or reset it", async () => {
  const { environment, setFlag } = harness({ gm: false });
  setFlag({ enabled: true, tilt: 30, rotation: 45 });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(board.tiltInput.value, "30");
  assert.equal(board.rotationInput.value, "45");
  assert.equal(board.tiltInput.disabled, true);
  assert.equal(board.rotationInput.disabled, true);
  assert.equal(board.fitButton, null);
  assert.equal(await board.setTilt(50), false);
  assert.equal(await board.setRotation(-45), false);
  assert.equal(await board.resetView(), false);
  assert.equal(board.tilt, 30);
  assert.equal(board.rotation, 45);
});

test("angle changes that would put part of a base outside the board are rejected without moving tokens", async () => {
  const { environment, token, calls } = harness();
  Object.assign(token.document, { width: 4, height: 4, x: 1685, y: 1100 });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(await board.setTilt(85), false);
  assert.equal(board.layout.autoTilt, true);
  assert.equal(board.tiltOutput.textContent, "autoAngle");
  assert.deepEqual(calls.warnings, ["viewOccupied"]);
  assert.equal(calls.moves.length, 0);
});

test("native dragging, Board Move, rulers, and collisions agree on a tilted rotated board", async () => {
  const context = harness({ gridless: true });
  const { environment, token, hooks, setFlag } = context;
  setFlag({ enabled: true, boardSize: 12, tilt: 25, rotation: 35, offsetX: 120, offsetY: 80 });
  usePaddedArtwork(token, environment);
  Object.assign(token.document, { width: 2, height: 4 });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 1, row: 1 }, {}, environment));
  addOccupant(context, { column: 9, row: 8 }, { width: 3, height: 4 });
  const first = { x: token.document.x, y: token.document.y, width: 2, height: 4 };
  const target = { column: 6, row: 5 };
  const anchor = footprintAnchor(board.layout, target, 2);
  const drag = token.dragTo(anchor);
  assert.deepEqual(tokenCell(token.document, board.layout, drag, environment), target);
  board.eventPoint = () => anchor;
  board.handlePointerMove({});
  board.draw();
  assert.equal(board.graphics.polygons, board.boardSize ** 2);
  assert.deepEqual(board.graphics.ends, []);
  assert.equal(await board.moveSelected(target), true);
  assert.equal(token.document.x, drag.x);
  assert.equal(token.document.y, drag.y);
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  const second = { ...drag, width: 2, height: 4 };
  ruler.refresh(dragRulerData([first, second]));
  assert.deepEqual(ruler.basePath.ends, [tokenBase(token.document, second, environment)]);
  assert.deepEqual(ruler.basePath.polygonPoints, [board.polygon(target, board.layout, 2)]);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first, index: 1 }, {}).cost.total, "25");
  const blocked = { column: 8, row: 7 };
  assert.equal(await board.moveSelected(blocked), false);
  assert.equal(token.dragTo(footprintAnchor(board.layout, blocked, 2)).x, token.document.x);
});

test("layout always derives its center from scene bounds instead of legacy saved positions", () => {
  const base = { grid: { size: 100 }, width: 4000, height: 3000 };
  assert.deepEqual(readLayout({ ...base, getFlag: () => ({ cellWidth: -5, originX: NaN }) }), createLayout(base));
  assert.deepEqual(readLayout({ ...base, getFlag: () => ({ cellWidth: 200, originX: 10, originY: 20 }) }), createLayout(base));
  for (const rect of [
    { x: 400, y: 300, width: 5000, height: 3400 },
    { x: 180, y: 720, width: 1200, height: 900 },
    { x: -120, y: 60, width: 7200, height: 1800 }
  ]) {
    const layout = readLayout(base, rect);
    assert.deepEqual(project(layout, BOARD_SIZE / 2, BOARD_SIZE / 2), { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  }
});

test("scene resizing recenters the live board before cached canvas dimensions catch up", () => {
  const { environment, scene, hooks, calls, setFlag } = harness();
  scene.getDimensions = () => ({ sceneRect: { x: 350, y: 250, width: scene.width, height: scene.height } });
  setFlag({ enabled: true, originX: 1, originY: 2, cellWidth: 50 });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  assert.deepEqual(project(board.layout, 9, 9), { x: 2350, y: 1750 });
  assertBoardEdges(board.layout, scene.getDimensions().sceneRect);
  scene.width = 6400;
  scene.height = 4200;
  hooks.get("updateScene")[0](scene);
  assert.deepEqual(project(board.layout, 9, 9), { x: 3550, y: 2350 });
  assertBoardEdges(board.layout, scene.getDimensions().sceneRect);
  assert.equal(environment.canvas.dimensions.sceneRect.width, 4000);
  const resizedLayout = board.layout;
  scene.grid.size = 250;
  hooks.get("updateScene")[0](scene);
  assert.deepEqual(board.layout, resizedLayout);
  assert.equal(board.graphics.polygons, 324);
  assert.equal(calls.moves.length, 0);
});

test("Close, Near, and Beyond Near use board coordinates with 5-foot diagonals", () => {
  const from = { column: 7, row: 7 };
  assert.equal(rangeBand(from, from), "self");
  assert.equal(rangeBand(from, { column: 8, row: 8 }), "close");
  assert.equal(rangeBand(from, { column: 13, row: 1 }), "near");
  assert.equal(rangeBand(from, { column: 14, row: 7 }), "far");
  assert.equal(cellDistance(from, { column: 13, row: 1 }), 6);
});

test("the fixed 5-foot scale keeps Close at one space and Near at six spaces", () => {
  const from = { column: 7, row: 7 };
  assert.equal(FEET_PER_CELL, 5);
  assert.equal(rangeBand(from, { column: 8, row: 7 }), "close");
  assert.equal(rangeBand(from, { column: 9, row: 7 }), "near");
  assert.equal(rangeBand(from, { column: 13, row: 7 }), "near");
  assert.equal(rangeBand(from, { column: 14, row: 7 }), "far");
});

test("GMs and players have no cell-distance control or setter and ignore legacy scene scales without moving tokens", () => {
  for (const gm of [false, true]) for (const feetPerCell of [undefined, 5, 10, "10", 20]) {
    const { environment, scene, token, setFlag, hooks, module, calls } = harness({ gm });
    setFlag({ enabled: true, feetPerCell, custom: true });
    const position = { x: token.document.x, y: token.document.y };
    const layout = createLayout(scene);
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    const elements = [];
    const visit = element => { elements.push(element); for (const child of element.children) visit(child); };
    visit(board.hud);
    assert.equal(elements.some(element => element.id === "mk-isometric-board-grid-size"), false);
    assert.equal(board.feetPerCell, 5);
    assert.equal(module.api.isometricBoard.feetPerCell, 5);
    assert.equal(module.api.isometricBoard.setFeetPerCell, undefined);
    assert.match(board.scaleLabel.textContent, /^scale:18\|5$/);
    assert.deepEqual(board.layout, layout);
    assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
    assert.equal(calls.moves.length, 0);
    assert.equal(scene.getFlag().feetPerCell, feetPerCell);
    assert.equal(scene.getFlag().custom, true);
    const restored = new IsometricBoardOverlay(environment);
    restored.refresh();
    assert.equal(restored.feetPerCell, 5);
    assert.match(restored.scaleLabel.textContent, /^scale:18\|5$/);
  }
});

test("grid sizes 6 through 18 fill the same bounds and reject cells beyond the selected edge", () => {
  const rectangle = { x: 240, y: 160, width: 5327, height: 3243 };
  for (let size = MIN_BOARD_SIZE; size <= MAX_BOARD_SIZE; size++) {
    const layout = createLayout({ getFlag: () => ({ boardSize: size }) }, rectangle);
    assert.equal(layout.size, size);
    assertBoardEdges(layout, rectangle);
    let count = 0;
    for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
      const cell = { column, row };
      assert.deepEqual(pointToCell(layout, cellCenter(layout, cell)), cell);
      count++;
    }
    assert.equal(count, size * size);
    assert.equal(validCell({ column: size, row: 0 }, size), false);
    assert.equal(pointToCell(layout, project(layout, size + 0.5, 0.5)), null);
  }
  assert.equal(normalizeBoardSize(2), 6);
  assert.equal(normalizeBoardSize(30), 18);
  assert.equal(normalizeBoardSize("12"), 12);
  assert.equal(normalizeBoardSize(9.7), 10);
  for (const value of [null, undefined, "", NaN, Infinity, false]) assert.equal(normalizeBoardSize(value), 18);
});

test("GM grid-size control saves 6–18 cells per side without changing distance or token positions", async () => {
  const { environment, scene, token, calls, setFlag, hooks, module } = harness();
  setFlag({ enabled: true, feetPerCell: 10, custom: true });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const position = { x: token.document.x, y: token.document.y };
  assert.equal(board.boardSizeInput.min, "6");
  assert.equal(board.boardSizeInput.max, "18");
  assert.equal(board.boardSizeInput.step, "1");
  assert.equal(board.boardSizeInput.value, "18");
  board.boardSizeInput.value = "6";
  board.boardSizeInput.listeners.get("input")();
  board.draw();
  assert.equal(board.boardSizeInput.value, "6");
  assert.equal(readBoardSize(scene), 18);
  board.boardSizeInput.listeners.get("change")();
  await Promise.resolve();
  assert.equal(module.api.isometricBoard.boardSize, 6);
  assert.equal(board.graphics.polygons, 36);
  assert.equal(board.boardSizeInput.value, "6");
  assert.match(board.scaleLabel.textContent, /6\|5/);
  assert.equal(scene.getFlag().custom, true);
  assert.equal(board.feetPerCell, 5);
  assert.equal(calls.moves.length, 0);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
  assert.equal(new IsometricBoardOverlay(environment).boardSize, 6);
  assert.equal(await module.api.isometricBoard.setBoardSize(12), 12);
  assert.equal(board.graphics.polygons, 144);
  await board.toggle();
  await board.toggle();
  assert.equal(board.boardSize, 12);
});

test("players read the shared grid size but cannot change it, with snapping and ruler bounds matching the size", async () => {
  const { environment, hooks, token, setFlag } = harness({ gm: false, gridless: true });
  setFlag({ enabled: true, boardSize: 6, feetPerCell: 10 });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  assert.equal(board.boardSizeInput.value, "6");
  assert.equal(board.boardSizeInput.disabled, true);
  assert.equal(await board.setBoardSize(18), false);
  assert.equal(await board.moveSelected({ column: 6, row: 1 }), false);
  const cell = { column: 5, row: 5 };
  const position = token.dragTo(project(board.layout, 5.8, 5.2));
  assert.deepEqual(tokenCell(token.document, board.layout, position), cell);
  assert.equal(await board.moveSelected(cell), true);
  const first = tokenPosition(token.document, board.layout, { column: 3, row: 3 });
  const second = tokenPosition(token.document, board.layout, { column: 4, row: 3 });
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first }, {}).cost.total, "5");
});

test("legacy 10-foot scenes use 5-foot native drag labels and paths for players without updating a hidden HUD", () => {
  const { environment, hooks, token, scene, setFlag } = harness({ gm: false });
  setFlag({ enabled: true, feetPerCell: 10 });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  assert.equal(board.feetPerCell, 5);
  assert.equal(scene.getFlag().feetPerCell, 10);
  const first = tokenPosition(token.document, board.layout, { column: 3, row: 3 });
  const second = tokenPosition(token.document, board.layout, { column: 4, row: 3 });
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first }, {}).cost.total, "5");
  assert.deepEqual(measureBasePath(token.document, board.layout, [first, second], environment), { total: 5, delta: 5 });
  board.hover = { column: 6, row: 5 };
  board.draw();
  assert.equal(board.hud.hidden, true);
  assert.equal(board.status.textContent, undefined);
});

test("native token bases, including resized tokens, align to the destination cell", () => {
  const { token, scene } = harness();
  const layout = createLayout(scene);
  const cell = { column: 13, row: 2 };
  const data = { width: 2, height: 3 };
  const position = tokenPosition(token.document, layout, cell, data);
  assert.deepEqual(tokenCell(token.document, layout, { ...data, ...position }), cell);
  const base = tokenBase(token.document, { ...data, ...position });
  const center = footprintAnchor(layout, cell, 2);
  // Foundry stores integer token coordinates, so fractional centers round to a pixel.
  assert.ok(Math.abs(base.x - center.x) <= 0.5);
  assert.ok(Math.abs(base.y - center.y) <= 0.5);
  assert.notDeepEqual(token.document.getCenterPoint({ ...data, ...position }), cellCenter(layout, cell));
});

test("token width determines a square base from Small/Medium through Gargantuan, independently of artwork height or scale", () => {
  for (const [width, expected] of [[0.5, 1], [1, 1], [2, 2], [3, 3], [4, 4], [6, 4], [1.5, 2], [0, 1], [NaN, 1]]) {
    assert.equal(tokenFootprintSize({ width, height: 10, texture: { scaleX: 4, scaleY: 4 } }), expected);
  }
  assert.equal(tokenFootprintSize({}), 1);
  assert.equal(tokenFootprintSize({ width: 1 }, { width: 3, height: 1 }), 3);
});

test("every creature size snaps its visible base to its placement anchor and occupies the correct cells", () => {
  const { TokenDocument, environment } = harness();
  for (const boardSize of [6, 12, 18]) for (const width of [1, 2, 3, 4]) {
    const layout = createLayout({ getFlag: () => ({ boardSize }) }, { x: 275, y: 185, width: 5327, height: 3243 });
    const document = new TokenDocument({ width, height: width * 2 });
    for (const cell of [{ column: 0, row: 0 }, { column: boardSize - width, row: boardSize - width }]) {
      const position = tokenPosition(document, layout, cell);
      const base = tokenBase(document, position);
      const center = footprintAnchor(layout, cell, width);
      assert.ok(Math.abs(base.x - center.x) <= 0.5);
      assert.ok(Math.abs(base.y - center.y) <= 0.5);
      assert.deepEqual(tokenCell(document, layout, position), cell);
      const footprint = tokenFootprint(document, layout, position);
      assert.deepEqual(footprint, { ...cell, size: width });
      const cells = footprintCells(footprint);
      assert.equal(cells.length, width * width);
      assert.ok(cells.every(occupied => rangeBand(footprint, occupied) === "self"));
      assert.equal(validFootprint(footprint, width, boardSize), true);
      assert.equal(validFootprint({ column: boardSize - width + 1, row: 0 }, width, boardSize), false);
    }
  }
});

test("Large feet sit toward the bottom of their 2x2 base while previously centered tokens keep their occupied cells", () => {
  const { TokenDocument } = harness();
  for (const rectangle of [
    { x: 250, y: 180, width: 5327, height: 3243 },
    { x: 0, y: 0, width: 4000, height: 3000 },
    { x: 70, y: 90, width: 1000, height: 7200 }
  ]) for (const boardSize of [6, 12, 18]) {
    const layout = createLayout({ getFlag: () => ({ boardSize }) }, rectangle);
    const document = new TokenDocument({ width: 2, height: 4 });
    for (let row = 0; row < boardSize - 1; row++) for (let column = 0; column < boardSize - 1; column++) {
      const cell = { column, row };
      const center = footprintCenter(layout, cell, 2);
      const bottom = project(layout, column + 2, row + 2);
      const position = tokenPosition(document, layout, cell);
      const feet = tokenBase(document, position);
      assert.ok(Math.abs(feet.x - center.x) <= 0.5);
      assert.ok(Math.abs(feet.y - (center.y + layout.cellHeight / 2)) <= 0.5);
      assert.ok(feet.y > center.y && feet.y < bottom.y);
      assert.deepEqual(tokenCell(document, layout, position), cell);
      const legacyPosition = { x: Math.round(center.x - 100), y: Math.round(center.y - 400) };
      assert.deepEqual(tokenCell(document, layout, legacyPosition), cell);
    }
    for (const size of [1, 3, 4]) {
      assert.deepEqual(footprintAnchor(layout, { column: 1, row: 1 }, size),
        footprintCenter(layout, { column: 1, row: 1 }, size));
    }
  }
});

test("Large placement, destination outlines, native rulers, and collisions share the lower artwork anchor", async () => {
  const { environment, token, hooks } = harness();
  usePaddedArtwork(token, environment);
  Object.assign(token.document, { width: 2, height: 4 });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  board.setMoveMode(true);
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 3, row: 3 }, {}, environment));
  const first = { x: token.document.x, y: token.document.y, width: 2, height: 4 };
  const target = { column: 9, row: 8 };
  const anchor = footprintAnchor(board.layout, target, 2);
  const drag = token.dragTo(anchor);
  assert.deepEqual(tokenCell(token.document, board.layout, drag, environment), target);
  board.eventPoint = () => anchor;
  board.handlePointerMove({});
  assert.deepEqual(board.hover, target);
  board.draw();
  assert.equal(board.graphics.polygons, board.boardSize ** 2);
  assert.deepEqual(board.graphics.ends, []);
  assert.equal(await board.moveSelected(target), true);
  assert.equal(token.document.x, drag.x);
  assert.equal(token.document.y, drag.y);
  const second = { ...drag, width: 2, height: 4 };
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  ruler.refresh(dragRulerData([first, second]));
  const feet = tokenBase(token.document, second, environment);
  assert.deepEqual(ruler.basePath.ends, [feet]);
  assert.deepEqual(ruler.basePath.polygonPoints, [board.polygon(target, board.layout, 2)]);
  assert.ok(Math.abs(feet.x - anchor.x) <= 0.5);
  assert.ok(Math.abs(feet.y - anchor.y) <= 0.5);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first, index: 1 }, {}).cost.total, "30");
  const other = { id: "other", width: 1 };
  for (const cell of footprintCells({ ...target, size: 2 })) assert.equal(board.isOccupied(other, cell), true);
  assert.equal(board.isOccupied(other, { column: 11, row: 9 }), false);
});

test("odd and even creature bases clamp inside board edges and Board Move agrees with native dragging", async () => {
  for (const width of [2, 3, 4]) {
    const { environment, hooks, token, setFlag, calls } = harness({ gridless: true });
    setFlag({ enabled: true, boardSize: 6 });
    Object.assign(token.document, { width, height: width + 2 });
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    board.setMoveMode(true);
    Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 0, row: 0 }));
    for (const [pointer, expected] of [
      [project(board.layout, 0.1, 0.1), { column: 0, row: 0 }],
      [project(board.layout, 5.9, 5.9), { column: 6 - width, row: 6 - width }]
    ]) {
      const position = token.dragTo(pointer);
      assert.deepEqual(tokenCell(token.document, board.layout, position), expected);
      assert.deepEqual(pointToTokenCell(token.document, board.layout, pointer), expected);
      board.eventPoint = () => pointer;
      board.handlePointerMove({});
      assert.deepEqual(board.hover, expected);
      assert.equal(await board.moveSelected(board.hover), true);
      assert.deepEqual(calls.moves.at(-1).position, { x: position.x, y: position.y });
    }
    assert.equal(await board.moveSelected({ column: 5, row: 5 }), false);
    assert.equal(calls.warnings.at(-1), "footprintOutside");
  }
});

test("ranges and selected highlights use the full base and nearest occupied edges", async () => {
  const context = harness();
  const { environment, token } = context;
  Object.assign(token.document, { width: 3, height: 5 });
  const board = new IsometricBoardOverlay(environment);
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 4, row: 4 }));
  addOccupant(context, { column: 7, row: 6 }, { width: 2, height: 3 });
  board.refresh();
  board.setSettingsVisible(true);
  board.draw();
  assert.equal(board.graphics.fillAlphas.filter(alpha => alpha === 0.6 * 0.2).length, 9);
  assert.match(board.status.textContent, /selectedSized:Adventurer\|E5\|3/);
  assert.match(board.ranges.textContent, /close\|5/);
  assert.equal(footprintDistance({ column: 4, row: 4, size: 3 }, { column: 7, row: 6, size: 2 }), 1);
  assert.equal(rangeBand({ column: 4, row: 4, size: 3 }, { column: 8, row: 6, size: 4 }), "near");
  board.hover = { column: 10, row: 8 };
  board.draw();
  assert.equal(board.graphics.polygons, board.boardSize ** 2);
  assert.deepEqual(board.graphics.ends, []);
});

test("Close enemies turn red, including diagonals, and legacy 10-foot scales do not change highlights", () => {
  const context = harness();
  const { environment, hooks, calls, setFlag } = context;
  const enemy = addOccupant(context, { column: 6, row: 5 }, { id: "enemy", disposition: -1 });
  addOccupant(context, { column: 4, row: 4 }, { id: "diagonal-enemy", disposition: -1 });
  addOccupant(context, { column: 5, row: 6 }, { id: "ally", disposition: 1 });
  addOccupant(context, { column: 4, row: 5 }, { id: "neutral", disposition: 0 });
  addOccupant(context, { column: 7, row: 5 }, { id: "distant-enemy", disposition: -1 });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
  assert.deepEqual(redCells(), [4 * 18 + 4, 5 * 18 + 6]);
  assert.equal(board.graphics.fillColors[5 * 18 + 5], 0x8bcbd7);
  for (const index of [5 * 18 + 4, 6 * 18 + 5, 6 * 18 + 6]) assert.equal(board.graphics.fillColors[index], 0xdbab58);
  assert.equal(board.graphics.fillColors[5 * 18 + 7], 0x4ea9cb);
  assert.ok(board.rangeLegend.children.some(child => child.dataset.band === "enemyClose"));
  setFlag({ enabled: true, feetPerCell: 10 });
  board.refresh();
  assert.deepEqual(redCells(), [4 * 18 + 4, 5 * 18 + 6]);
  Object.assign(enemy.document, tokenPosition(enemy.document, board.layout, { column: 9, row: 9 }));
  hooks.get("updateToken")[0](enemy.document);
  calls.frames.at(-1)();
  assert.deepEqual(redCells(), [4 * 18 + 4]);
  environment.canvas.tokens.controlled = [];
  hooks.get("controlToken")[0]();
  calls.frames.at(-1)();
  assert.deepEqual(redCells(), []);
  assert.equal(calls.moves.length, 0);
});

test("red enemies follow the snapped drag endpoint and restore the actual position on cancel or drop", () => {
  const context = harness({ gm: false });
  const { environment, hooks, calls, token } = context;
  addOccupant(context, { column: 6, row: 5 }, { id: "origin-enemy", disposition: -1 });
  addOccupant(context, { column: 12, row: 10 }, { id: "destination-enemy", disposition: -1 });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
  const redraw = () => calls.frames.at(-1)();
  const origin = Object.freeze({ x: token.document.x, y: token.document.y });
  const near = Object.freeze(token.dragTo(cellCenter(board.layout, { column: 11, row: 10 })));
  const far = token.dragTo(cellCenter(board.layout, { column: 8, row: 10 }));
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  // The native plan is authoritative even when the cursor/hover has already moved.
  board.hover = { column: 1, row: 1 };
  ruler.refresh(dragRulerData([origin, near]));
  redraw();
  assert.deepEqual(redCells(), [10 * 18 + 12]);
  assert.equal(board.graphics.fillColors[5 * 18 + 5], 0x8bcbd7);
  ruler.refresh(dragRulerData([origin, near, far]));
  redraw();
  assert.deepEqual(redCells(), []);
  ruler.clear();
  redraw();
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, origin);
  assert.equal(calls.moves.length, 0);
  ruler.refresh(dragRulerData([origin, near]));
  redraw();
  Object.assign(token.document, near);
  ruler.refresh({ passedWaypoints: [origin, near], pendingWaypoints: [near], plannedMovement: {} });
  redraw();
  assert.deepEqual(redCells(), [10 * 18 + 12]);
  ruler.destroy();
  redraw();
  assert.deepEqual(redCells(), [10 * 18 + 12]);
});

test("dragging previews Close between full sized bases on transformed grids using artwork anchors", async () => {
  for (const view of [{}, { tilt: 25, rotation: 35, offsetX: 120, offsetY: 80 }]) for (const size of [1, 2, 3, 4]) {
    const context = harness({ gm: false });
    const { environment, hooks, token, calls, setFlag } = context;
    setFlag({ enabled: true, ...view });
    usePaddedArtwork(token, environment);
    Object.assign(token.document, { width: size, height: size + 2 });
    const board = registerIsometricBoard(environment);
    Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 2, row: 2 }, {}, environment));
    const enemyCell = { column: 8 + size, row: 8 + size - 1 };
    addOccupant(context, enemyCell, { width: 2, height: 3, disposition: -1 });
    hooks.get("setup")[0]();
    hooks.get("ready")[0]();
    const preview = Object.assign(new token.constructor(), { document: token.document, _original: token, isPreview: true });
    const ruler = new environment.CONFIG.Token.rulerClass(preview);
    const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
    assert.deepEqual(redCells(), []);
    const endpoint = token.dragTo(footprintAnchor(board.layout, { column: 8, row: 8 }, size));
    ruler.refresh(dragRulerData([token.document, endpoint]));
    calls.frames.at(-1)();
    const expected = footprintCells({ ...enemyCell, size: 2 }).map(cell => cell.row * board.boardSize + cell.column);
    assert.deepEqual(redCells(), expected);
    await board.setOpacity(0, { persist: false });
    calls.frames.at(-1)();
    assert.ok(expected.every(index => board.graphics.fillAlphas[index] === 0));
    setFlag({ enabled: true, feetPerCell: 10, ...view });
    board.draw();
    assert.deepEqual(redCells(), expected);
    assert.equal(calls.moves.length, 0);
  }
});

test("drag highlights ignore remote, unreachable and retained paths and clear when previews become unavailable", () => {
  const context = harness({ gm: false });
  const { environment, hooks, token, calls, TokenDocument } = context;
  addOccupant(context, { column: 6, row: 5 }, { id: "origin-enemy", disposition: -1 });
  addOccupant(context, { column: 12, row: 10 }, { id: "destination-enemy", disposition: -1 });
  addOccupant(context, { column: 11, row: 11 }, { id: "hidden-enemy", disposition: -1, hidden: true });
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
  const redraw = () => calls.frames.at(-1)();
  const endpoint = tokenPosition(token.document, board.layout, { column: 11, row: 10 });
  const local = { foundPath: [token.document, endpoint], hidden: true };
  for (const data of [
    { plannedMovement: { stranger: local } },
    { passedWaypoints: [endpoint], pendingWaypoints: [endpoint], plannedMovement: {} },
    { plannedMovement: { local: { foundPath: [token.document], unreachableWaypoints: [endpoint] } } },
    dragRulerData([{ x: -10000, y: -10000 }])
  ]) {
    ruler.refresh(data);
    redraw();
    assert.deepEqual(redCells(), [5 * 18 + 6]);
  }
  const data = { plannedMovement: { local } };
  ruler.refresh(data);
  redraw();
  assert.deepEqual(redCells(), [10 * 18 + 12]);
  ruler.visible = false;
  ruler._onVisibleChange();
  redraw();
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  ruler.visible = true;
  ruler._onVisibleChange();
  redraw();
  assert.deepEqual(redCells(), [10 * 18 + 12]);
  ruler.destroy();
  redraw();
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  const other = Object.assign(new token.constructor(), { document: new TokenDocument({ id: "another-token" }), visible: true });
  const otherRuler = new environment.CONFIG.Token.rulerClass(other);
  otherRuler.refresh(data);
  redraw();
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  assert.equal(calls.moves.length, 0);
});

test("Close enemy highlights cover the whole sized base on transformed grids and obey opacity without changing grid colors", async () => {
  for (const view of [{}, { tilt: 25, rotation: 35, offsetX: 120, offsetY: 80 }]) {
    for (const sourceSize of [1, 3]) for (const enemySize of [1, 2, 4]) {
      const context = harness();
      const { environment, token, setFlag, scene } = context;
      setFlag({ enabled: true, gridColor: "#123456", ...view });
      Object.assign(token.document, { width: sourceSize, height: sourceSize + 1 });
      Object.assign(token.document, tokenPosition(token.document, createLayout(scene), { column: 2, row: 2 }));
      const cell = { column: 2 + sourceSize, row: 2 + sourceSize - 1 };
      addOccupant(context, cell, { width: enemySize, height: enemySize + 2, disposition: -1 });
      const board = new IsometricBoardOverlay(environment);
      board.refresh();
      const expected = footprintCells({ ...cell, size: enemySize }).map(p => p.row * board.boardSize + p.column);
      const actual = board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
      assert.deepEqual(actual, expected);
      for (const index of actual) assert.equal(board.graphics.fillAlphas[index], 0.6 * 0.2);
      assert.ok(board.graphics.lineColors.every(color => color === 0x123456));
      await board.setOpacity(0, { persist: false });
      board.draw();
      assert.ok(board.graphics.fillAlphas.every(alpha => alpha === 0));
    }
  }
});

test("enemy highlighting follows opposing dispositions when a hostile token is selected", () => {
  const context = harness();
  const { environment, hooks, calls, token } = context;
  environment.CONST = { TOKEN_DISPOSITIONS: { HOSTILE: -1, FRIENDLY: 1 } };
  token.document.disposition = -1;
  addOccupant(context, { column: 6, row: 5 }, { id: "friendly", disposition: 1 });
  addOccupant(context, { column: 5, row: 6 }, { id: "hostile", disposition: -1 });
  addOccupant(context, { column: 4, row: 5 }, { id: "neutral", disposition: 0 });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  token.document.disposition = 0;
  hooks.get("updateToken")[0](token.document);
  calls.frames.at(-1)();
  assert.deepEqual(redCells(), [6 * 18 + 5]);
});

test("enemy highlights do not reveal hidden, invisible, secret, preview, destroyed or off-scene tokens", () => {
  const context = harness({ gm: false });
  const { environment } = context;
  addOccupant(context, { column: 6, row: 5 }, { id: "visible", disposition: -1 });
  const hidden = addOccupant(context, { column: 5, row: 6 }, { id: "hidden", disposition: -1, hidden: true });
  hidden.visible = hidden.isVisible = true;
  const invisible = addOccupant(context, { column: 4, row: 5 }, { id: "invisible", disposition: -1 });
  invisible.isVisible = false;
  const secret = addOccupant(context, { column: 4, row: 4 }, { id: "secret", disposition: -1 });
  secret.document.isSecret = true;
  const preview = addOccupant(context, { column: 5, row: 4 }, { id: "preview", disposition: -1 });
  preview.isPreview = true;
  const destroyed = addOccupant(context, { column: 6, row: 4 }, { id: "destroyed", disposition: -1 });
  destroyed.destroyed = true;
  const offScene = addOccupant(context, { column: 6, row: 6 }, { id: "off-scene", disposition: -1 });
  offScene.document.parent = { id: "other-scene" };
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  const redCells = () => board.graphics.fillColors.flatMap((color, index) => color === 0xd95858 ? [index] : []);
  assert.deepEqual(redCells(), [5 * 18 + 6]);
  environment.game.user.isGM = true;
  board.draw();
  assert.deepEqual(redCells(), [5 * 18 + 6, 6 * 18 + 5]);
});

test("scene toggle is GM-only, persists board state, and never moves tokens", async () => {
  for (const gm of [false, true]) {
    const { environment, calls, scene } = harness({ gm, enabled: false });
    const board = new IsometricBoardOverlay(environment);
    assert.equal(await board.toggle(), gm);
    assert.equal(Boolean(scene.getFlag().enabled), gm);
    assert.equal(calls.moves.length, 0);
    if (gm) {
      assert.equal(board.graphics.polygons, 324);
      assert.equal(environment.canvas.interface.grid.visible, false);
      await board.toggle();
      assert.equal(environment.canvas.interface.grid.visible, true);
      assert.equal(board.root, null);
      assert.equal(calls.controlOptions.reset, true);
    }
  }
});

test("Board Move updates the selected scene TokenDocument through native movement", async () => {
  const { environment, calls, token } = harness({ gm: false });
  const board = new IsometricBoardOverlay(environment);
  assert.equal(await board.moveSelected({ column: 9, row: 12 }), true);
  assert.equal(calls.moves[0].document, token.document);
  assert.deepEqual(calls.moves[0].options, { showRuler: false, "mk-shadowdark": { isometricBoardMove: true } });
  assert.deepEqual(tokenCell(token.document, board.layout), { column: 9, row: 12 });
});

test("grid, range highlights, and base paths render above the map and below native token artwork", () => {
  const { environment, hooks, token } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const primary = environment.canvas.primary;
  assert.equal(board.root.parent, primary);
  assert.equal(board.graphics.parent, board.root);
  assert.equal(board.root.elevation, primary.background.elevation);
  assert.ok(board.root.sortLayer > primary.background.sortLayer);
  assert.ok(board.root.sortLayer < token.mesh.sortLayer);
  assert.equal(primary.sortDirty, true);
  assert.equal(environment.canvas.controls.children.length, 0);
  assert.equal(board.root.eventMode, "none");
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  ruler.refresh(dragRulerData([token.document]));
  assert.equal(ruler.basePath.parent, board.root);
});

function usePaddedArtwork(token, environment) {
  token.mesh.texture = { width: 1000, height: 2000, valid: true };
  token.document.texture = { fit: "width", scaleX: 1.5, scaleY: 2, anchorX: 0.4, anchorY: 0.7 };
  environment.foundry = { canvas: { TextureLoader: {
    getTextureAlphaData(texture, resolution) {
      assert.equal(texture, token.mesh.texture);
      assert.equal(resolution, 0.25);
      return { width: 250, height: 500, minX: 50, maxX: 200, minY: 50, maxY: 450 };
    }
  } } };
}

test("base positions follow fitted artwork, texture scale, anchors, and transparent margins", () => {
  const { environment, token } = harness();
  usePaddedArtwork(token, environment);
  const document = token.document;
  Object.assign(document, { x: 700, y: 800 });
  // The visible image spans x=720..810 and y=610..930, inside a 150x400 sprite.
  const base = tokenBase(document, {}, environment);
  assert.ok(Math.abs(base.x - 765) < 1e-6);
  assert.ok(Math.abs(base.y - 930) < 1e-6);
  document.rotation = 90;
  const rotated = tokenBase(document, {}, environment);
  assert.ok(Math.abs(rotated.x - 830) < 1e-6);
  assert.ok(Math.abs(rotated.y - 910) < 1e-6);
  document.lockRotation = true;
  assert.deepEqual(tokenBase(document, {}, environment), base);
  document.texture.scaleX *= -1;
  assert.ok(Math.abs(tokenBase(document, {}, environment).x - 735) < 1e-6);
  token.hasDynamicRing = true;
  token.ring = { subjectScaleAdjustment: 2 };
  environment.CONFIG.Token.ring = { isGridFitMode: true };
  assert.ok(Math.abs(tokenBase(document, {}, environment).y - 1010) < 1e-6);
});

test("the selector's top anchor follows visible artwork bounds, rotation and missing-texture fallbacks", () => {
  const { environment, token } = harness();
  usePaddedArtwork(token, environment);
  Object.assign(token.document, { x: 700, y: 800 });
  let top = tokenTop(token.document, {}, environment);
  assert.ok(Math.abs(top.x - 765) < 1e-6);
  assert.ok(Math.abs(top.y - 610) < 1e-6);
  token.document.rotation = 90;
  top = tokenTop(token.document, {}, environment);
  assert.ok(Math.abs(top.x - 830) < 1e-6);
  assert.ok(Math.abs(top.y - 820) < 1e-6);
  token.document.lockRotation = true;
  top = tokenTop(token.document, {}, environment);
  assert.ok(Math.abs(top.x - 765) < 1e-6);
  assert.ok(Math.abs(top.y - 610) < 1e-6);
  token.mesh.texture.valid = false;
  assert.deepEqual(tokenTop(token.document, {}, environment), { x: 750, y: 800 });
});

test("fitting modes and missing textures retain a usable bottom anchor", () => {
  const { environment, token } = harness();
  Object.assign(token.document, { x: 0, y: 0 });
  token.mesh.texture = { width: 200, height: 100, valid: true };
  for (const [fit, expected] of [
    ["contain", { x: 50, y: 75 }], ["cover", { x: 50, y: 100 }],
    ["fill", { x: 50, y: 100 }], ["width", { x: 50, y: 75 }], ["height", { x: 50, y: 100 }]
  ]) {
    token.document.texture = { fit };
    assert.deepEqual(tokenBase(token.document, {}, environment), expected, fit);
  }
  environment.foundry = { canvas: { TextureLoader: { getTextureAlphaData() { throw new Error("unreadable texture"); } } } };
  assert.deepEqual(tokenBase(token.document, {}, environment), { x: 50, y: 100 });
  token.mesh.texture.valid = false;
  assert.deepEqual(tokenBase(token.document, {}, environment), { x: 50, y: 100 });
});

test("token creation uses already loaded artwork bounds before a token mesh exists", () => {
  const { environment, token } = harness();
  usePaddedArtwork(token, environment);
  const texture = token.mesh.texture;
  token.document.texture.src = "modules/mk-shadowdark/test-token.webp";
  environment.foundry.canvas.getTexture = source => {
    assert.equal(source, token.document.texture.src);
    return texture;
  };
  const expected = tokenBase(token.document, {}, environment);
  token.document.object = null;
  assert.deepEqual(tokenBase(token.document, {}, environment), expected);
});

test("drag previews, added waypoints, and Board Move share the artwork base and destination center", async () => {
  const { environment, hooks, token, calls, setFlag } = harness();
  usePaddedArtwork(token, environment);
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const destination = { column: 11, row: 8 };
  const point = cellCenter(board.layout, destination);
  const position = token.dragTo(point);
  assert.ok(Math.abs(position.x - (point.x - 65)) <= 0.5);
  assert.ok(Math.abs(position.y - (point.y - 130)) <= 0.5);
  assert.deepEqual(tokenCell(token.document, board.layout, position, environment), destination);
  const offCenterPoint = project(board.layout, destination.column + 0.8, destination.row + 0.7);
  const shifted = token.dragTo(offCenterPoint, { snap: false });
  assert.deepEqual(shifted, position);
  await board.moveSelected(destination);
  assert.deepEqual(calls.moves[0].position, { x: position.x, y: position.y });
  const first = Object.freeze({ ...position, width: 1, height: 1 });
  const second = Object.freeze({ ...tokenPosition(token.document, board.layout, { column: 12, row: 8 },
    { width: 2, height: 3 }, environment), width: 2, height: 3 });
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  ruler.refresh(dragRulerData([first, second]));
  assert.deepEqual(ruler.basePath.starts, [tokenBase(token.document, first, environment)]);
  assert.deepEqual(ruler.basePath.ends, [tokenBase(token.document, second, environment)]);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first, index: 1 }, {}).cost.total, "5");
  const original = Object.freeze({ x: token.document.x, y: token.document.y, width: 1, height: 1 });
  token.document._source = original;
  token.document.y += 300; // Animated document position must not shift the drag's origin.
  assert.deepEqual(token._getDragOrigin(), tokenBase(token.document, original, environment));
  token.document.parent = { id: "other-scene" };
  assert.deepEqual(token._getDragOrigin(), token.document.getCenterPoint(original));
  token.document.parent = environment.canvas.scene;
  setFlag({ enabled: false });
  assert.deepEqual(token._getDragOrigin(), token.document.getCenterPoint(original));
  assert.equal(token.document.getSnappedPosition(position).native, true);
});

test("native gridless and gridded drags snap anywhere in the destination diamond to its center", async () => {
  for (const gridless of [true, false]) for (const artwork of [false, true]) {
    const { environment, hooks, token, calls } = harness({ gridless });
    if (artwork) usePaddedArtwork(token, environment);
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    const cell = { column: 11, row: 8 };
    const center = cellCenter(board.layout, cell);
    for (const [columnOffset, rowOffset] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]]) {
      const pointer = project(board.layout, cell.column + columnOffset, cell.row + rowOffset);
      for (const snap of [false, true]) {
        const destination = token.dragTo(pointer, { snap });
        const base = tokenBase(token.document, destination, environment);
        assert.ok(Math.abs(base.x - center.x) <= 0.5);
        assert.ok(Math.abs(base.y - center.y) <= 0.5);
        assert.equal(destination.elevation, token.document.elevation);
      }
    }
    const dragPosition = token.dragTo(project(board.layout, cell.column + 0.2, cell.row + 0.8));
    await board.moveSelected(cell);
    assert.deepEqual(calls.moves[0].position, { x: dragPosition.x, y: dragPosition.y });
  }
});

test("native drag snapping honors fractional cell edges and restores native positions outside the board", () => {
  const { environment, hooks, token, setFlag } = harness({ gridless: true });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const cell = { column: 10, row: 8 };
  const justInside = project(board.layout, cell.column + 0.999, cell.row + 0.5);
  assert.deepEqual(tokenCell(token.document, board.layout, token.dragTo(justInside), environment), cell);
  const offBoard = project(board.layout, -2.5, 3.5);
  const free = token.dragTo(offBoard);
  const offBoardBase = tokenBase(token.document, free, environment);
  assert.ok(Math.abs(offBoardBase.x - offBoard.x) <= 0.5);
  assert.ok(Math.abs(offBoardBase.y - offBoard.y) <= 0.5);
  setFlag({ enabled: false });
  const inside = project(board.layout, 7.2, 6.8);
  const native = token.dragTo(inside);
  assert.deepEqual(token.document.getCenterPoint(native), { x: Math.round(inside.x), y: Math.round(inside.y) });
  assert.notDeepEqual(tokenBase(token.document, native), cellCenter(board.layout, { column: 7, row: 6 }));
});

test("unowned tokens, multiple selection, pause, walls, and off-board cells block Board Move", async () => {
  for (const reason of ["owner", "permission", "multi", "paused", "wall", "cell", "disabled", "staleScene"]) {
    const { environment, token, calls, setFlag } = harness({ gm: false });
    let cell = { column: 1, row: 1 };
    if (reason === "owner") token.document.isOwner = false;
    if (reason === "permission") token.document.canUserModify = () => false;
    if (reason === "multi") environment.canvas.tokens.controlled.push(token);
    if (reason === "paused") environment.game.paused = true;
    if (reason === "wall") token.checkCollision = () => true;
    if (reason === "cell") cell = { column: 18, row: 1 };
    if (reason === "disabled") setFlag({ enabled: false });
    if (reason === "staleScene") token.document.parent = { id: "old-scene" };
    const board = new IsometricBoardOverlay(environment);
    assert.equal(await board.moveSelected(cell), false, reason);
    assert.equal(calls.moves.length, 0, reason);
  }
});

test("pointer coordinates honor camera transforms and modifier clicks retain native targeting", () => {
  const { environment } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  environment.canvas.stage.toLocal = ({ x, y }) => ({ x: (x - 50) / 2, y: (y - 30) / 2 });
  assert.deepEqual(board.eventPoint({ clientX: 310, clientY: 220 }), { x: 125, y: 85 });
  board.setMoveMode(true);
  let moved = 0;
  let captured = 0;
  board.eventPoint = () => cellCenter(board.layout, { column: 4, row: 4 });
  board.moveSelected = async () => { moved++; return true; };
  const event = { button: 0, preventDefault() { captured++; }, stopImmediatePropagation() { captured++; } };
  const capturedHandler = environment.document.listeners.get("pointerdown");
  capturedHandler({ ...event, target: board.hud });
  capturedHandler({ ...event, target: board.view, ctrlKey: true });
  capturedHandler({ ...event, target: board.view, shiftKey: true });
  assert.equal(moved, 0);
  assert.equal(captured, 0);
  capturedHandler({ ...event, target: board.view });
  assert.equal(moved, 1);
  assert.equal(captured, 2);
});

test("movement lock prevents duplicate clicks and recovers after a rejected native move", async () => {
  const { environment, token } = harness();
  const board = new IsometricBoardOverlay(environment);
  let rejectMove;
  token.document.move = () => new Promise((_resolve, reject) => { rejectMove = reject; });
  const pending = board.moveSelected({ column: 4, row: 4 });
  assert.equal(await board.moveSelected({ column: 3, row: 3 }), false);
  rejectMove(new Error("permission changed"));
  await assert.rejects(pending, /permission changed/);
  assert.equal(board.moving, false);
  assert.equal(board.pendingDestinations.size, 0);
});

function addOccupant(context, cell, { id = "occupant", hidden = false, width = 1, height = 1, disposition = 0 } = {}) {
  const { environment, TokenDocument } = context;
  const other = Object.assign(new environment.CONFIG.Token.objectClass(), {
    document: new TokenDocument({ id, hidden, cell, width, height, disposition }), name: "Secret creature", visible: !hidden, isVisible: !hidden
  });
  other.document.object = other;
  environment.canvas.tokens.placeables.push(other);
  return other;
}

test("Board Move and drag previews cannot place two tokens in the same cell, including hidden tokens", async () => {
  for (const hidden of [false, true]) for (const boardSize of [6, 12, 18]) {
    const context = harness({ gm: false, gridless: true });
    const { environment, hooks, token, setFlag, calls } = context;
    setFlag({ enabled: true, boardSize });
    const cell = { column: 3, row: 4 };
    addOccupant(context, cell, { hidden });
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    assert.equal(await board.moveSelected(cell), false);
    assert.equal(calls.moves.length, 0);
    assert.deepEqual(calls.warnings, ["occupied"]);
    const destination = token.dragTo(cellCenter(board.layout, cell));
    assert.equal(destination.x, token.document.x);
    assert.equal(destination.y, token.document.y);
    const adjacent = { column: 4, row: 4 };
    assert.deepEqual(tokenCell(token.document, board.layout, token.dragTo(cellCenter(board.layout, adjacent))), adjacent);
    assert.equal(await board.moveSelected(adjacent), true);
    assert.equal(board.pendingDestinations.size, 0);
  }
});

test("every cell of a larger creature blocks smaller tokens, including the far corner", async () => {
  const context = harness({ gm: false, gridless: true });
  const { environment, hooks, token, calls } = context;
  addOccupant(context, { column: 6, row: 6 }, { width: 3, height: 5, hidden: true });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  for (const cell of footprintCells({ column: 6, row: 6, size: 3 })) {
    assert.equal(await board.moveSelected(cell), false);
    const drag = token.dragTo(cellCenter(board.layout, cell));
    assert.equal(drag.x, token.document.x);
    assert.equal(drag.y, token.document.y);
  }
  assert.equal(calls.moves.length, 0);
  assert.equal(await board.moveSelected({ column: 9, row: 8 }), true);
});

test("larger moving bases cannot overlap a smaller token beyond their anchor cell", async () => {
  const context = harness({ gridless: true });
  const { environment, hooks, token, calls } = context;
  Object.assign(token.document, { width: 4, height: 6 });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 10, row: 10 }));
  addOccupant(context, { column: 5, row: 5 });
  const target = { column: 2, row: 2 };
  assert.equal(await board.moveSelected(target), false);
  const drag = token.dragTo(footprintCenter(board.layout, target, 4));
  assert.equal(drag.x, token.document.x);
  assert.equal(drag.y, token.document.y);
  assert.equal(calls.moves.length, 0);
  assert.equal(await board.moveSelected({ column: 6, row: 2 }), true);
});

test("movement commits, creation batches, and reservations include all cells of a sized base", async () => {
  const context = harness();
  const { environment, hooks, token, TokenDocument } = context;
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  addOccupant(context, { column: 7, row: 7 });
  const position = tokenPosition(token.document, board.layout, { column: 5, row: 5 }, { width: 3, height: 3 });
  const guard = hooks.get("preMoveToken")[0];
  assert.equal(guard(token.document, { method: "config", destination: { ...position, width: 3, height: 3 } }, {}), false);
  const create = hooks.get("preCreateToken")[0];
  assert.equal(create(new TokenDocument({ id: "large", width: 3, cell: { column: 5, row: 5 } }), {}, {}), false);
  const operation = {};
  assert.equal(create(new TokenDocument({ id: "first", width: 2, cell: { column: 2, row: 2 } }), {}, operation), undefined);
  assert.equal(create(new TokenDocument({ id: "second", cell: { column: 3, row: 3 } }), {}, operation), false);
  Object.assign(token.document, { width: 3, height: 5 });
  let rejectMove;
  token.document.move = () => new Promise((_resolve, reject) => { rejectMove = reject; });
  const pending = board.moveSelected({ column: 10, row: 10 });
  const other = environment.canvas.tokens.placeables.at(-1).document;
  assert.equal(board.isOccupied(other, { column: 12, row: 12 }), true);
  assert.equal(board.isOccupied(other, { column: 13, row: 13 }), false);
  rejectMove(new Error("movement rejected"));
  await assert.rejects(pending, /movement rejected/);
  assert.equal(board.isOccupied(other, { column: 12, row: 12 }), false);
});

test("grid resizing rejects intersecting large bases even when their anchor cells remain distinct", async () => {
  const context = harness();
  const { environment, token } = context;
  const board = new IsometricBoardOverlay(environment);
  Object.assign(token.document, { width: 2, height: 3 });
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 3, row: 3 }));
  addOccupant(context, { column: 5, row: 5 }, { width: 2, height: 4 });
  assert.equal(await board.setBoardSize(6), false);
  assert.equal(board.boardSize, 18);
});

test("movement commits recheck occupancy and batch destinations without changing frozen native paths", () => {
  const context = harness();
  const { environment, token, hooks, setFlag } = context;
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const cell = { column: 9, row: 8 };
  const destination = Object.freeze(tokenPosition(token.document, board.layout, cell));
  const guard = hooks.get("preMoveToken")[0];
  const movement = Object.freeze({ method: "dragging", destination });
  assert.equal(guard(token.document, movement, {}), undefined);
  const other = addOccupant(context, cell);
  for (const method of ["dragging", "keyboard", "config"]) {
    assert.equal(guard(token.document, Object.freeze({ method, destination }), {}), false);
  }
  assert.equal(guard(token.document, { method: "api", destination }, { "mk-shadowdark": { isometricBoardMove: true } }), false);
  assert.equal(guard(token.document, { method: "api", destination }, {}), undefined);
  Object.assign(other.document, tokenPosition(other.document, board.layout, { column: 11, row: 11 }));
  assert.equal(guard(token.document, movement, {}), undefined);
  const operation = Object.freeze({ movement: Object.freeze({
    [other.document.id]: Object.freeze({ waypoints: Object.freeze([destination]) })
  }) });
  assert.equal(guard(token.document, movement, operation), false);
  environment.canvas.scene.tokens = { contents: [token.document, other.document] };
  environment.canvas.tokens.placeables = [token];
  Object.assign(other.document, destination);
  assert.equal(guard(token.document, movement, {}), false);
  setFlag({ enabled: false });
  assert.equal(guard(token.document, movement, {}), undefined);
});

test("in-flight Board Move destinations are reserved and released after rejection", async () => {
  const context = harness();
  const { environment, token } = context;
  const board = new IsometricBoardOverlay(environment);
  const cell = { column: 10, row: 8 };
  const other = addOccupant(context, { column: 3, row: 4 });
  let reject;
  token.document.move = () => new Promise((_resolve, rejectMove) => { reject = rejectMove; });
  const pending = board.moveSelected(cell);
  assert.equal(board.isOccupied(other.document, cell), true);
  reject(new Error("movement rejected"));
  await assert.rejects(pending, /movement rejected/);
  assert.equal(board.isOccupied(other.document, cell), false);
});

test("an animated token's saved destination stays occupied while its artwork is still in another cell", () => {
  const context = harness();
  const { environment, token } = context;
  const board = new IsometricBoardOverlay(environment);
  const destination = { column: 12, row: 8 };
  const other = addOccupant(context, { column: 9, row: 8 });
  other.document._source = Object.freeze({ ...tokenPosition(other.document, board.layout, destination), width: 1, height: 1 });
  assert.notDeepEqual(tokenCell(other.document, board.layout), destination);
  assert.equal(board.isOccupied(token.document, destination), true);
  assert.equal(board.isOccupied(token.document, { column: 9, row: 8 }), true);
});

test("creating tokens in occupied spaces or duplicate batch cells is blocked only on the enabled board", () => {
  const context = harness();
  const { environment, hooks, TokenDocument, setFlag } = context;
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const create = hooks.get("preCreateToken")[0];
  const cell = { column: 10, row: 8 };
  addOccupant(context, cell);
  assert.equal(create(new TokenDocument({ id: "new", cell }), {}, {}), false);
  const operation = {};
  const freeCell = { column: 8, row: 9 };
  assert.equal(create(new TokenDocument({ id: "first", cell: freeCell }), {}, operation), undefined);
  assert.equal(create(new TokenDocument({ id: "second", cell: freeCell }), {}, operation), false);
  assert.equal(create(new TokenDocument({ id: "elsewhere", cell, parent: { id: "other-scene" } }), {}, {}), undefined);
  setFlag({ enabled: false });
  assert.equal(create(new TokenDocument({ id: "disabled", cell }), {}, {}), undefined);
});

test("grid resizing cannot merge occupied cells and never moves existing tokens", async () => {
  const context = harness();
  const { environment, calls } = context;
  const other = addOccupant(context, { column: 4, row: 5 });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(await board.setBoardSize(6), false);
  assert.equal(board.boardSize, 18);
  assert.equal(board.boardSizeInput.value, "18");
  assert.deepEqual(calls.warnings, ["resizeOccupied"]);
  Object.assign(other.document, tokenPosition(other.document, board.layout, { column: 15, row: 15 }));
  assert.equal(await board.setBoardSize(6), 6);
  assert.equal(board.graphics.polygons, 36);
  assert.equal(calls.moves.length, 0);
});

test("a player's hidden settings panel performs no range-label work", () => {
  const { environment, TokenDocument } = harness({ gm: false });
  environment.canvas.tokens.placeables.push(
    { document: new TokenDocument({ id: "visible" }), name: "Visible Raider", visible: true, isVisible: true },
    { document: new TokenDocument({ id: "hidden", hidden: true }), name: "Hidden Raider", visible: true },
    { document: new TokenDocument({ id: "unseen" }), name: "Unseen Raider", isVisible: false },
    { document: new TokenDocument({ id: "preview" }), name: "Preview Raider", isPreview: true }
  );
  const board = new IsometricBoardOverlay(environment);
  let formats = 0;
  const format = environment.game.i18n.format;
  environment.game.i18n.format = (...args) => { if (args[0].endsWith(".range")) formats++; return format(...args); };
  board.refresh();
  board.draw();
  assert.equal(board.hud.hidden, true);
  assert.equal(board.ranges.textContent, undefined);
  assert.equal(formats, 0);
});

test("teardown restores original grid visibility, destroys graphics, and removes listeners", () => {
  const { environment } = harness();
  environment.canvas.interface.grid.visible = false;
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  const root = board.root;
  const hud = board.hud;
  const view = board.view;
  assert.equal(view.listeners.size, 2);
  assert.equal(environment.document.listeners.has("pointerdown"), true);
  board.destroy();
  assert.equal(root.destroyed, true);
  assert.equal(hud.removed, true);
  assert.equal(view.listeners.size, 0);
  assert.equal(environment.document.listeners.size, 0);
  assert.equal(environment.canvas.interface.grid.visible, false);
});

test("native snapping wrapper is scoped to the enabled scene and preserves the existing API", () => {
  const { environment, TokenDocument, hooks, module, setFlag } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  assert.equal(module.api.existingFeature, true);
  assert.equal(module.api.isometricBoard.enabled, true);
  const document = new TokenDocument();
  const position = tokenPosition(document, board.layout, { column: 4, row: 4 });
  const snapped = document.getSnappedPosition({ x: position.x + 3, y: position.y + 2, elevation: 12 });
  assert.equal(snapped.x, position.x);
  assert.equal(snapped.y, position.y);
  assert.equal(snapped.elevation, 12);
  const offScene = new TokenDocument({ parent: { id: "another-scene" } });
  assert.equal(offScene.getSnappedPosition({ x: 1, y: 1 }).native, true);
  setFlag({ enabled: false });
  assert.equal(document.getSnappedPosition(position).native, true);
});

test("a selected token uses an artwork-aligned arrow and its square border appears only during dragging", async () => {
  const { environment, token, hooks } = harness();
  usePaddedArtwork(token, environment);
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  assert.equal(token.border.visible, false);
  const arrow = token.children.find(child => child.name === "mk-shadowdark-selection-arrow");
  assert.ok(arrow);
  assert.equal(arrow.parent, token);
  assert.equal(arrow.eventMode, "none");
  assert.equal(arrow.visible, true);
  assert.equal(token._refreshState(), "native-state");
  token.hover = true;
  token.layer.highlightObjects = true;
  token._refreshState();
  assert.equal(token.border.visible, false);
  const top = tokenTop(token.document, { x: 0, y: 0 }, environment);
  assert.deepEqual(arrow.polygonPoints[0].slice(8, 10), [top.x, top.y - 10]);
  await board.setOpacity(0, { persist: false });
  assert.equal(arrow.visible, true);
  assert.deepEqual(arrow.fillAlphas, [1]);
  for (const ending of ["drop", "cancel"]) {
    token.isDragged = true;
    token._refreshState();
    assert.equal(token.border.visible, true, ending);
    assert.equal(arrow.visible, false, ending);
    const preview = Object.assign(new token.constructor(), { document: token.document, isPreview: true, _original: token });
    preview._refreshState();
    assert.equal(preview.border.visible, true);
    assert.equal(preview.children.length, 0);
    token.isDragged = false;
    token._refreshState();
    assert.equal(token.border.visible, false, ending);
    assert.equal(arrow.visible, true, ending);
    hooks.get("destroyToken")[0](preview);
  }
  token.document.rotation = 90;
  environment.canvas.dimensions.uiScale = 2;
  hooks.get("refreshToken")[0](token);
  const rotatedTop = tokenTop(token.document, { x: 0, y: 0 }, environment);
  assert.deepEqual(arrow.polygonPoints[0].slice(8, 10), [rotatedTop.x, rotatedTop.y - 20]);
});

test("selection arrows support multiple local selections and respect visibility, secrets and layer state", () => {
  const { environment, token, hooks, TokenDocument } = harness({ gm: false });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const other = Object.assign(new token.constructor(), { document: new TokenDocument({ id: "other" }),
    isVisible: true, visible: true, controlled: false, hover: true });
  environment.canvas.tokens.placeables.push(other);
  other._refreshState();
  assert.equal(other.border.visible, false);
  assert.equal(other.children.length, 0);
  other.controlled = true;
  environment.canvas.tokens.controlled.push(other);
  other._refreshState();
  assert.equal(board.selectedToken(), null);
  const arrow = board.tokenSelections.get(other).arrow;
  assert.equal(arrow.visible, true);
  assert.equal(board.tokenSelections.get(token).arrow.visible, true);
  for (const property of ["controlled", "isVisible"]) {
    other[property] = false;
    other._refreshState();
    assert.equal(arrow.visible, false);
    other[property] = true;
  }
  other.document.hidden = true;
  other._refreshState();
  assert.equal(arrow.visible, false);
  other.document.hidden = false;
  other.layer.active = false;
  other._refreshState();
  assert.equal(arrow.visible, false);
  other.layer.active = true;
  other.document.isSecret = true;
  other.isDragged = true;
  other._refreshState();
  assert.equal(arrow.visible, false);
  assert.equal(other.border.visible, false);
  assert.equal(other.nameplateVisible, false);
  assert.equal(other.targetArrowsVisible, false);
});

test("selection arrows bob smoothly with elapsed canvas time without moving tokens or redrawing the grid", () => {
  const { environment, token, hooks, calls } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const arrow = board.tokenSelections.get(token).arrow;
  const ticker = environment.canvas.app.ticker;
  const position = { x: token.document.x, y: token.document.y };
  const arrowPoints = arrow.polygonPoints[0];
  const gridPolygons = board.graphics.polygonPoints;
  assert.equal(ticker.listeners.size, 1);
  ticker.tick(400);
  assert.ok(Math.abs(arrow.y + 3) < 1e-9);
  ticker.tick(400);
  assert.equal(arrow.y, -6);
  ticker.tick(800);
  assert.ok(Math.abs(arrow.y) < 1e-9);
  environment.canvas.dimensions.uiScale = 2;
  ticker.tick(800);
  assert.equal(arrow.y, -12);
  assert.equal(arrow.polygonPoints[0], arrowPoints);
  assert.equal(board.graphics.polygonPoints, gridPolygons);
  assert.deepEqual({ x: token.document.x, y: token.document.y }, position);
  assert.equal(calls.moves.length, 0);
  board.destroy();
  assert.equal(ticker.listeners.size, 0);
});

test("one shared arrow animation stops on drag, deselection, deletion and board teardown without removing other tickers", async () => {
  const { environment, token, hooks, TokenDocument } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const ticker = environment.canvas.app.ticker;
  const other = Object.assign(new token.constructor(), { document: new TokenDocument({ id: "other" }),
    isVisible: true, visible: true });
  environment.canvas.tokens.placeables.push(other);
  other._refreshState();
  token._refreshState();
  assert.equal(ticker.adds, 1);
  assert.equal(ticker.listeners.size, 1);
  ticker.tick(800);
  assert.equal(board.tokenSelections.get(token).arrow.y, -6);
  assert.equal(board.tokenSelections.get(other).arrow.y, -6);
  other.controlled = false;
  other._refreshState();
  assert.equal(ticker.listeners.size, 1);
  const arrow = board.tokenSelections.get(token).arrow;
  for (const property of ["isDragged", "controlled", "isVisible"]) {
    const active = property === "isDragged";
    token[property] = active;
    token._refreshState();
    assert.equal(arrow.y, 0);
    assert.equal(arrow.visible, false);
    assert.equal(ticker.listeners.size, 0);
    token[property] = !active;
    token._refreshState();
    assert.equal(ticker.listeners.size, 1);
  }
  hooks.get("destroyToken")[0](token);
  assert.equal(ticker.listeners.size, 0);
  token._refreshState();
  assert.equal(ticker.listeners.size, 1);
  await board.toggle();
  assert.equal(ticker.listeners.size, 0);
  await board.toggle();
  assert.equal(ticker.listeners.size, 1);
  let nativeTicks = 0;
  const nativeTick = () => nativeTicks++;
  ticker.add(nativeTick, token);
  board.destroy();
  assert.equal(ticker.listeners.size, 1);
  ticker.tick(16);
  assert.equal(nativeTicks, 1);
  assert.equal(board.animatedArrows.size, 0);
});

test("reduced-motion preferences, photosensitivity and an unavailable ticker leave visible static selectors", () => {
  for (const preferences of [{ reducedMotion: true }, { photosensitive: true }, {}]) {
    const { environment, token, hooks } = harness(preferences);
    const ticker = environment.canvas.app.ticker;
    if (!Object.keys(preferences).length) environment.canvas.app.ticker = null;
    const board = registerIsometricBoard(environment);
    hooks.get("ready")[0]();
    const arrow = board.tokenSelections.get(token).arrow;
    assert.equal(arrow.visible, true);
    assert.equal(arrow.y, 0);
    assert.equal(ticker.listeners.size, 0);
    ticker.tick(800);
    assert.equal(arrow.y, 0);
    board.destroy();
  }
});

test("board toggles, off-scene tokens and teardown restore native borders and remove only module selectors", async () => {
  const { environment, token, hooks, TokenDocument } = harness({ enabled: false });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  const unrelated = token.addChild(new environment.PIXI.Graphics());
  token._refreshState();
  assert.equal(token.border.visible, true);
  assert.equal(board.tokenSelections.size, 0);
  for (let i = 0; i < 2; i++) {
    await board.toggle();
    const arrow = board.tokenSelections.get(token).arrow;
    assert.equal(token.border.visible, false);
    assert.equal(arrow.visible, true);
    await board.toggle();
    assert.equal(token.border.visible, true);
    assert.equal(arrow.destroyed, true);
    assert.equal(board.tokenSelections.size, 0);
    assert.deepEqual(token.children, [unrelated]);
  }
  await board.toggle();
  const otherScene = Object.assign(new token.constructor(), { document: new TokenDocument({ parent: { id: "other-scene" } }) });
  otherScene._refreshState();
  assert.equal(otherScene.border.visible, true);
  assert.equal(otherScene.children.length, 0);
  const arrow = board.tokenSelections.get(token).arrow;
  board.destroy();
  assert.equal(token.border.visible, true);
  assert.equal(arrow.destroyed, true);
  assert.deepEqual(token.children, [unrelated]);
  board.refresh();
  const replacement = board.tokenSelections.get(token).arrow;
  hooks.get("destroyToken")[0](token);
  assert.equal(replacement.destroyed, true);
  assert.equal(board.tokenSelections.has(token), false);
});

test("hover and Board Move show neither destination boxes nor lines, retaining native collision centers", async () => {
  const { environment, token, calls } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  board.setSettingsVisible(true);
  const destination = { column: 7, row: 8 };
  for (const moveMode of [false, true]) {
    board.setMoveMode(moveMode);
    board.hover = destination;
    board.draw();
    assert.deepEqual(board.graphics.starts, []);
    assert.deepEqual(board.graphics.ends, []);
    assert.equal(board.graphics.polygons, board.boardSize ** 2);
    assert.match(board.status.textContent, /nearMove|longMove/);
  }
  let collisionDestination;
  token.checkCollision = point => { collisionDestination = point; return false; };
  await board.moveSelected(destination);
  board.draw();
  assert.deepEqual(board.graphics.ends, []);
  assert.equal(board.graphics.polygons, board.boardSize ** 2);
  assert.deepEqual(collisionDestination, token.document.getCenterPoint(calls.moves[0].position));
  assert.notDeepEqual(collisionDestination, tokenBase(token.document));
});

test("native drag paths and labels use bases across token size changes without mutating waypoints", () => {
  const { environment, hooks, token } = harness();
  const centerMethod = token.document.getCenterPoint;
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const Ruler = environment.CONFIG.Token.rulerClass;
  const ruler = new Ruler(token);
  const first = Object.freeze({ ...tokenPosition(token.document, board.layout, { column: 4, row: 4 }), width: 1, height: 1 });
  const second = Object.freeze({ ...tokenPosition(token.document, board.layout, { column: 5, row: 4 }, { width: 2, height: 3 }), width: 2, height: 3 });
  const path = Object.freeze([first, second]);
  const data = Object.freeze(dragRulerData(path));
  ruler.refresh(data);
  assert.equal(ruler.received, data);
  assert.deepEqual(ruler.basePath.starts, [tokenBase(token.document, first)]);
  assert.deepEqual(ruler.basePath.ends, [tokenBase(token.document, second)]);
  assert.deepEqual(measureBasePath(token.document, board.layout, path), { total: 5, delta: 5 });
  const context = ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first, index: 1 }, {});
  assert.equal(context.cost.total, "5");
  assert.equal(context.cost.units, "ft");
  assert.deepEqual(context.position, { x: tokenBase(token.document, second).x, y: tokenBase(token.document, second).y + 16 });
  assert.equal(token.document.getCenterPoint, centerMethod);
  assert.equal(ruler._getSegmentStyle(second).width, 0);
  assert.equal(ruler._getWaypointStyle(second).radius, 0);
});

test("base rulers show only active drag routes and boxes, clearing both after drop or cancellation despite history", () => {
  const { environment, hooks, token } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  const past = tokenPosition(token.document, board.layout, { column: 2, row: 4 });
  const first = tokenPosition(token.document, board.layout, { column: 4, row: 4 });
  const second = tokenPosition(token.document, board.layout, { column: 6, row: 4 });
  const blocked = tokenPosition(token.document, board.layout, { column: 7, row: 4 });
  token.hover = true;
  token.showRuler = true;
  ruler.refresh({ passedWaypoints: [past, first], pendingWaypoints: [], plannedMovement: {} });
  assert.equal(ruler.basePath, undefined);
  for (const stage of ["passed", "pending"]) {
    assert.equal(ruler._getWaypointLabelContext({ ...second, stage, previous: first }, {}), undefined);
  }
  for (const pendingWaypoints of [[second], []]) {
    const drag = dragRulerData([first, second], [past]);
    drag.plannedMovement.local.unreachableWaypoints = [blocked];
    ruler.refresh(drag);
    assert.equal(ruler.basePath.visible, true);
    assert.deepEqual(ruler.basePath.starts, [tokenBase(token.document, first), tokenBase(token.document, second)]);
    assert.deepEqual(ruler.basePath.ends, [tokenBase(token.document, second), tokenBase(token.document, blocked)]);
    assert.deepEqual(ruler.basePath.polygonPoints, [board.polygon({ column: 6, row: 4 })]);
    assert.ok(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first }, {}));
    ruler.refresh({ passedWaypoints: [past, first, second], pendingWaypoints, plannedMovement: {} });
    assert.equal(ruler.basePath.visible, false);
    assert.deepEqual(ruler.basePath.starts, []);
    assert.deepEqual(ruler.basePath.ends, []);
    assert.deepEqual(ruler.basePath.polygonPoints, []);
    ruler._onVisibleChange();
    assert.equal(ruler.basePath.visible, false);
  }
});

test("drag selection boxes follow snapped waypoint footprints and angles instead of mouse hover", () => {
  for (const view of [{}, { tilt: 25, rotation: 35 }]) for (const size of [1, 2, 3, 4]) {
    const { environment, hooks, token, setFlag } = harness();
    setFlag({ enabled: true, ...view });
    usePaddedArtwork(token, environment);
    const board = registerIsometricBoard(environment);
    hooks.get("setup")[0]();
    hooks.get("ready")[0]();
    board.hover = { column: 1, row: 1 };
    board.draw();
    assert.equal(board.graphics.polygons, board.boardSize ** 2);
    const ruler = new environment.CONFIG.Token.rulerClass(token);
    const first = tokenPosition(token.document, board.layout, { column: 3, row: 3 }, {}, environment);
    const target = { column: 8, row: 7 };
    const dimensions = { width: size, height: size + 1 };
    const second = { ...tokenPosition(token.document, board.layout, target, dimensions, environment), ...dimensions };
    ruler.refresh(dragRulerData([first, second]));
    const expectedCorners = [[8, 7], [8 + size, 7], [8 + size, 7 + size], [8, 7 + size]]
      .flatMap(([column, row]) => {
        const point = project(board.layout, column, row);
        return [point.x, point.y];
      });
    assert.deepEqual(ruler.basePath.polygonPoints, [expectedCorners]);
    ruler.clear();
    assert.equal(ruler.basePath.visible, false);
    assert.deepEqual(ruler.basePath.polygonPoints, []);
  }
});

test("native rulers restore original behavior off-board and clean up base paths across toggles", async () => {
  const { environment, hooks, token, TokenDocument } = harness();
  const board = registerIsometricBoard(environment);
  const Original = environment.CONFIG.Token.rulerClass;
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const Ruler = environment.CONFIG.Token.rulerClass;
  const ruler = new Ruler(token);
  assert.ok(ruler instanceof Original);
  const waypoint = { ...tokenPosition(token.document, board.layout, { column: 3, row: 3 }) };
  const data = dragRulerData([waypoint]);
  ruler.refresh(data);
  const oldPath = ruler.basePath;
  await board.toggle();
  ruler.refresh(data);
  assert.equal(oldPath.destroyed, true);
  assert.equal(ruler._getSegmentStyle(waypoint).width, 4);
  assert.equal(ruler._getWaypointLabelContext(waypoint, {}).cost.total, "native");
  await board.toggle();
  ruler.refresh(data);
  assert.notEqual(ruler.basePath, oldPath);
  const other = new Ruler({ ...token, document: new TokenDocument({ parent: { id: "other-scene" } }) });
  assert.equal(other._getSegmentStyle(waypoint).width, 4);
  assert.equal(other._getWaypointLabelContext(waypoint, {}).cost.total, "native");
  ruler.clear();
  assert.equal(ruler.basePath.starts.length, 0);
  ruler.destroy();
  assert.equal(board.nativeRulers.has(ruler), false);
});

test("native base rulers preserve hidden movement privacy and obey zero opacity", async () => {
  const { environment, hooks, token } = harness({ gm: false });
  environment.game.user.id = "local";
  const board = registerIsometricBoard(environment);
  hooks.get("setup")[0]();
  hooks.get("ready")[0]();
  const ruler = new environment.CONFIG.Token.rulerClass(token);
  const first = tokenPosition(token.document, board.layout, { column: 3, row: 3 });
  const second = tokenPosition(token.document, board.layout, { column: 4, row: 3 });
  const movement = { history: [], foundPath: [first, second], hidden: true };
  const data = { passedWaypoints: [], pendingWaypoints: [], plannedMovement: { local: movement, stranger: movement } };
  ruler.refresh(data);
  assert.equal(ruler.basePath.starts.length, 1);
  assert.equal(ruler.basePath.polygons, 1);
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first, hidden: true, userId: "stranger" }, {}), undefined);
  await board.setOpacity(0, { persist: false });
  ruler.refresh(data);
  assert.ok(ruler.basePath.lineAlphas.every(alpha => alpha === 0));
  assert.equal(ruler._getWaypointLabelContext({ ...second, stage: "planned", previous: first }, {}), undefined);
  token.isVisible = false;
  ruler.refresh(data);
  assert.equal(ruler.basePath.visible, false);
});

test("unchanged refreshes reuse cell geometry and hover updates only the open settings panel", () => {
  const { environment, calls, token } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  if (board.frame !== null) calls.frames.at(-1)();
  let clears = 0;
  let polygons = 0;
  const clear = board.graphics.clear.bind(board.graphics);
  const polygon = board.polygon.bind(board);
  board.graphics.clear = () => { clears++; return clear(); };
  board.polygon = (...args) => { polygons++; return polygon(...args); };
  const frames = calls.frames.length;
  for (let i = 0; i < 100; i++) {
    board.draw();
    const point = cellCenter(board.layout, { column: 5 + i % 2, row: 5 });
    board.handlePointerMove(gridPointer(board, point.x + 10, point.y + 20));
  }
  assert.equal(clears, 0);
  assert.equal(polygons, 0);
  assert.equal(calls.frames.length, frames);
  assert.equal(board.hover, null);
  board.setSettingsVisible(true);
  const point = cellCenter(board.layout, { column: 6, row: 5 });
  board.handlePointerMove(gridPointer(board, point.x + 10, point.y + 20));
  calls.frames.at(-1)();
  assert.match(board.status.textContent, /nearMove:5\|G6/);
  assert.equal(clears, 0);
  assert.equal(polygons, 0);
  Object.assign(token.document, tokenPosition(token.document, board.layout, { column: 6, row: 5 }));
  board.draw();
  assert.equal(clears, 1);
  assert.equal(polygons, 0);
  assert.equal(board.graphics.fillColors[5 * 18 + 6], 0x8bcbd7);
});

test("cached cells update for enemies, opacity, color and layout changes and release on teardown", async () => {
  const context = harness();
  const { environment, token, setFlag } = context;
  const enemy = addOccupant(context, { column: 6, row: 5 }, { id: "enemy", disposition: -1 });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  const original = board.gridGeometry;
  const index = 5 * 18 + 6;
  assert.equal(board.graphics.fillColors[index], 0xd95858);
  enemy.document.isSecret = true;
  board.draw();
  assert.equal(board.graphics.fillColors[index], 0xdbab58);
  assert.equal(board.gridGeometry, original);
  await board.setOpacity(60, { persist: false });
  board.draw();
  assert.equal(board.graphics.lineAlphas[0], 0.6 * 0.6);
  await board.setGridColor("#123456", { persist: false });
  board.draw();
  assert.equal(board.graphics.lineColors[0], 0x123456);
  assert.equal(board.gridGeometry, original);
  setFlag({ enabled: true, rotation: 35, scaleX: 1.2, scaleY: 0.7, offsetY: 200 });
  board.draw();
  assert.notEqual(board.gridGeometry, original);
  assert.deepEqual(board.graphics.polygonPoints[0], board.polygon({ column: 0, row: 0 }));
  environment.canvas.tokens.controlled = [];
  board.draw();
  assert.ok(board.graphics.fillAlphas.every(alpha => alpha === 0));
  environment.canvas.tokens.controlled = [token];
  board.destroy();
  assert.equal(board.gridGeometry, null);
  assert.equal(board.gridDrawKey, null);
  board.refresh();
  assert.equal(board.graphics.polygons, 324);
});

test("collision scans calculate the board layout once while checking all live and saved bases", () => {
  const { environment, TokenDocument, token, scene } = harness();
  const documents = Array.from({ length: 100 }, (_, i) => {
    const document = new TokenDocument({ id: `other-${i}`, cell: { column: i % 18, row: Math.floor(i / 18) } });
    document._source = { x: document.x, y: document.y };
    return document;
  });
  scene.tokens = { contents: [token.document, ...documents] };
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  let reads = 0;
  const getFlag = scene.getFlag;
  scene.getFlag = (...args) => { reads++; return getFlag(...args); };
  assert.equal(board.isOccupied(token.document, { column: 17, row: 17 }), false);
  assert.equal(reads, 1);
  Object.assign(documents[0], tokenPosition(documents[0], board.layout, { column: 17, row: 17 }));
  assert.equal(board.isOccupied(token.document, { column: 17, row: 17 }), true);
});

test("hidden GM panel skips token-range formatting and fills current ranges when reopened", () => {
  const context = harness();
  const { environment, calls } = context;
  addOccupant(context, { column: 6, row: 5 }, { id: "visible" });
  addOccupant(context, { column: 7, row: 5 }, { id: "hidden", hidden: true });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  let ranges = 0;
  const format = environment.game.i18n.format;
  environment.game.i18n.format = (...args) => { if (args[0].endsWith(".range")) ranges++; return format(...args); };
  board.draw();
  assert.equal(ranges, 0);
  board.setSettingsVisible(true);
  calls.frames.at(-1)();
  assert.equal(ranges, 1);
  assert.match(board.ranges.textContent, /range:/);
  board.setSettingsVisible(false);
  ranges = 0;
  board.draw();
  assert.equal(ranges, 0);
});

function panelFixture({ storage = new Map(), userId = "local", blocked = false, gm = true } = {}) {
  const context = harness({ gm });
  const { environment } = context;
  const writes = [];
  const windowEvents = new Map();
  environment.game.user.id = userId;
  environment.innerWidth = 1200;
  environment.innerHeight = 800;
  environment.localStorage = {
    getItem(key) { if (blocked) throw new Error("blocked storage"); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error("blocked storage"); writes.push(key); storage.set(key, value); }
  };
  environment.addEventListener = (type, handler) => {
    if (!windowEvents.has(type)) windowEvents.set(type, new Set());
    windowEvents.get(type).add(handler);
  };
  environment.removeEventListener = (type, handler) => {
    windowEvents.get(type)?.delete(handler);
    if (!windowEvents.get(type)?.size) windowEvents.delete(type);
  };
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  board.hud.getBoundingClientRect = () => ({ left: Number.parseFloat(board.hud.style.left ?? "410"),
    top: Number.parseFloat(board.hud.style.top ?? "85"), width: Math.min(380, environment.innerWidth - 16),
    height: Math.min(500, environment.innerHeight - 16) });
  board.setSettingsVisible(true);
  return { ...context, board, storage, writes, windowEvents };
}

function panelPointer(board, clientX = 430, clientY = 100, extra = {}) {
  return { target: board.panelHeader, button: 0, pointerId: 7, clientX, clientY,
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
}

test("settings group layout and appearance controls without a token Move button, and close leaves the board active", () => {
  const { board, calls } = panelFixture();
  const elements = [];
  const visit = element => { elements.push(element); for (const child of element.children) visit(child); };
  visit(board.hud);
  assert.equal(elements.some(element => element.tagName === "BUTTON" && element.textContent === "move"), false);
  assert.equal(board.moveButton, undefined);
  assert.equal(board.boardSizeInput.parentElement.parentElement.dataset.section, "layoutSection");
  assert.equal(board.tiltInput.parentElement.parentElement.dataset.section, "layoutSection");
  assert.equal(board.rotationInput.parentElement.parentElement.dataset.section, "layoutSection");
  assert.equal(board.gridMoveButton.parentElement, board.fitButton.parentElement);
  assert.equal(board.opacityInput.parentElement.parentElement.dataset.section, "appearanceSection");
  assert.equal(board.gridColorInput.parentElement.parentElement.dataset.section, "appearanceSection");
  assert.equal(board.rangeLegend.parentElement.tagName, "DETAILS");
  const close = elements.find(element => element.attributes["aria-label"] === "closeSettings");
  close.listeners.get("click")();
  assert.equal(board.hud.hidden, true);
  assert.equal(board.enabled, true);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
});

test("header dragging tracks only its pointer, remembers a client/user position and never changes tokens or Scene settings", () => {
  const { board, calls, environment, storage, writes } = panelFixture();
  const originalCanvasListeners = new Map(environment.document.listeners);
  const down = panelPointer(board);
  board.panelHeader.listeners.get("pointerdown")(down);
  assert.ok(down.prevented && down.stopped);
  assert.equal(board.panelHeader.hasPointerCapture(7), true);
  board.panelHeader.listeners.get("pointermove")(panelPointer(board, 600, 200, { pointerId: 8 }));
  assert.deepEqual(board.panelPosition, { left: 410, top: 85 });
  board.panelHeader.listeners.get("pointermove")(panelPointer(board, 530, 160));
  assert.deepEqual(board.panelPosition, { left: 510, top: 145 });
  assert.equal(board.hud.style.left, "510px");
  assert.equal(writes.length, 0);
  board.panelHeader.listeners.get("pointerup")(panelPointer(board, 530, 160));
  assert.equal(board.panelDrag, null);
  assert.equal(board.panelHeader.hasPointerCapture(7), false);
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(storage.get(board.panelStorageKey)), { left: 510, top: 145 });
  board.setSettingsVisible(false);
  board.setSettingsVisible(true);
  board.refresh();
  assert.deepEqual(board.panelPosition, { left: 510, top: 145 });
  assert.deepEqual(environment.document.listeners, originalCanvasListeners);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
  board.destroy();
  const restored = panelFixture({ storage });
  assert.deepEqual(restored.board.panelPosition, { left: 510, top: 145 });
  restored.board.destroy();
  const otherUser = panelFixture({ storage, userId: "another-gm" });
  assert.deepEqual(otherUser.board.panelPosition, { left: 410, top: 85 });
  otherUser.board.destroy();
});

test("the dragged panel stays inside the viewport and remains reachable after window resizing", () => {
  const { board, environment, windowEvents } = panelFixture();
  board.startPanelDrag(panelPointer(board));
  board.movePanelDrag(panelPointer(board, -10000, -10000));
  assert.deepEqual(board.panelPosition, { left: 8, top: 8 });
  board.movePanelDrag(panelPointer(board, 10000, 10000));
  assert.deepEqual(board.panelPosition, { left: 812, top: 292 });
  board.finishPanelDrag(panelPointer(board));
  environment.innerWidth = 500;
  environment.innerHeight = 360;
  for (const handler of windowEvents.get("resize")) handler();
  assert.deepEqual(board.panelPosition, { left: 112, top: 8 });
  assert.equal(board.hud.hidden, false);
});

test("unfinished panel drags cancel on Escape, cancellation, lost capture, blur, closing, teardown and role changes", () => {
  for (const ending of ["escape", "cancel", "capture", "blur", "close", "destroy", "scene", "role"]) {
    const { board, environment, windowEvents, writes, calls, setFlag } = panelFixture();
    const header = board.panelHeader;
    board.startPanelDrag(panelPointer(board));
    board.movePanelDrag(panelPointer(board, 530, 160));
    if (ending === "escape") board.onKeyDown({ ...panelPointer(board), key: "Escape" });
    if (ending === "cancel") header.listeners.get("pointercancel")({ pointerId: 7 });
    if (ending === "capture") header.releasePointerCapture(7);
    if (ending === "blur") for (const handler of windowEvents.get("blur")) handler();
    if (ending === "close") board.setSettingsVisible(false);
    if (ending === "destroy") board.destroy();
    if (ending === "scene") { setFlag({ enabled: false }); board.refresh(); }
    if (ending === "role") { environment.game.user.isGM = false; board.draw(); }
    assert.equal(board.panelDrag, null, ending);
    assert.equal(header.hasPointerCapture(7), false, ending);
    assert.deepEqual(board.panelPosition, { left: 410, top: 85 }, ending);
    assert.equal(writes.length, 0, ending);
    assert.equal(calls.moves.length, 0, ending);
    assert.equal(calls.flags.length, 0, ending);
    board.destroy();
    assert.equal(windowEvents.size, 0, ending);
  }
});

test("panel keyboard movement is limited to its header and header buttons never start a drag", () => {
  const { board, calls } = panelFixture();
  board.handlePanelKeyDown({ ...panelPointer(board), key: "ArrowLeft" });
  board.handlePanelKeyDown({ ...panelPointer(board), key: "ArrowDown", shiftKey: true });
  assert.deepEqual(board.panelPosition, { left: 400, top: 125 });
  board.handlePanelKeyDown({ ...panelPointer(board), target: board.tiltInput, key: "ArrowLeft" });
  assert.deepEqual(board.panelPosition, { left: 400, top: 125 });
  const closeIcon = board.panelHeader.children.at(-1).children[0];
  for (const extra of [{ target: closeIcon }, { button: 2 }, { isPrimary: false }]) {
    board.startPanelDrag(panelPointer(board, 430, 100, extra));
    assert.equal(board.panelDrag, null);
  }
  assert.equal(calls.moves.length, 0);
  assert.equal(calls.flags.length, 0);
});

test("corrupt or blocked position storage does not break settings, and players cannot drag the panel", () => {
  const storage = new Map([["mk-shadowdark.isometricBoardPanelPosition.local", "{broken"]]);
  for (const options of [{ storage }, { blocked: true }]) {
    const { board } = panelFixture(options);
    assert.deepEqual(board.panelPosition, { left: 410, top: 85 });
    board.startPanelDrag(panelPointer(board));
    board.movePanelDrag(panelPointer(board, 530, 160));
    assert.equal(board.finishPanelDrag(panelPointer(board)), true);
    assert.deepEqual(board.panelPosition, { left: 510, top: 145 });
    board.destroy();
  }
  const { board } = panelFixture({ gm: false });
  board.startPanelDrag(panelPointer(board));
  assert.equal(board.panelDrag, null);
  assert.equal(board.hud.hidden, true);
});

test("board and settings tools are GM-only and replace stale Board Move controls", () => {
  for (const gm of [false, true]) for (const enabled of [false, true]) {
    const { environment } = harness({ gm, enabled });
    const board = new IsometricBoardOverlay(environment);
    const controls = { tokens: { tools: { "mk-isometric-board-move": {}, "mk-isometric-board-settings": {},
      "mk-isometric-board": {}, native: { name: "native" } } } };
    board.registerControls(controls);
    assert.equal(Boolean(controls.tokens.tools["mk-isometric-board"]), gm);
    assert.equal(Boolean(controls.tokens.tools["mk-isometric-board-settings"]), gm && enabled);
    assert.equal(controls.tokens.tools["mk-isometric-board-move"], undefined);
    assert.equal(controls.tokens.tools.native.name, "native");
    if (!gm) {
      board.refresh();
      assert.equal(board.setSettingsVisible(true), false);
      if (enabled) assert.equal(board.hud.hidden, true);
    }
  }
});

test("the GM settings tool toggles only its local panel and refreshes preserve an open panel", async () => {
  const { environment, calls, token } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  const controls = { tokens: { tools: {} } };
  board.registerControls(controls);
  const tool = controls.tokens.tools["mk-isometric-board-settings"];
  assert.equal(tool.active, false);
  assert.equal(board.hud.hidden, true);
  token.document.isOwner = false;
  environment.canvas.tokens.controlled = [];
  assert.equal(tool.onChange(null, true), true);
  assert.equal(board.hud.hidden, false);
  assert.equal(board.moveMode, false);
  board.registerControls(controls);
  assert.equal(controls.tokens.tools["mk-isometric-board-settings"].active, true);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
  await board.setGridColor("#abcdef");
  assert.equal(board.settingsVisible, true);
  assert.equal(board.hud.hidden, false);
  const writes = calls.flags.length;
  assert.equal(tool.onChange(null, false), false);
  assert.equal(board.hud.hidden, true);
  assert.equal(board.enabled, true);
  assert.equal(calls.flags.length, writes);
  assert.equal(board.graphics.polygons, 324);
  assert.equal(calls.moves.length, 0);
});

test("closing the settings panel cancels unfinished grid editing and click-to-move", () => {
  const { environment, calls, token } = harness();
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  board.setSettingsVisible(true);
  board.setGridMoveMode(true);
  board.handlePointerDown(gridPointer(board, 110, 120));
  board.handleGridPointerMove(gridPointer(board, 160, 180));
  assert.equal(board.offsetX, 50);
  assert.equal(board.offsetY, 60);
  board.setSettingsVisible(false);
  assert.equal(board.hud.hidden, true);
  assert.equal(board.gridMoveMode, false);
  assert.equal(board.gridDrag, null);
  assert.equal(board.positionPreview, null);
  assert.equal(board.gridHandles, null);
  assert.equal(board.view.hasPointerCapture(1), false);
  assert.equal(environment.document.listeners.has("pointermove"), false);
  assert.equal(board.offsetX, 0);
  assert.equal(board.offsetY, 0);
  assert.equal(board.allowMovement(token.document, { method: "keyboard", destination: token.document }), undefined);
  board.setSettingsVisible(true);
  board.setMoveMode(true);
  board.setSettingsVisible(false);
  assert.equal(board.moveMode, false);
  assert.equal(calls.flags.length, 0);
  assert.equal(calls.moves.length, 0);
});

test("settings close on board shutdown, Scene teardown and loss of GM visibility", async () => {
  const { environment, hooks } = harness();
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  board.setSettingsVisible(true);
  assert.equal(await board.toggle(), false);
  assert.equal(board.settingsVisible, false);
  assert.equal(board.hud, null);
  assert.equal(await board.toggle(), true);
  assert.equal(board.hud.hidden, true);
  board.setSettingsVisible(true);
  hooks.get("canvasTearDown")[0]();
  board.refresh();
  assert.equal(board.hud.hidden, true);
  board.setSettingsVisible(true);
  environment.game.user.isGM = false;
  board.draw();
  assert.equal(board.hud.hidden, true);
  assert.equal(board.setSettingsVisible(true), false);
  assert.equal(board.settingsVisible, false);
});

test("opacity slider previews grid and range changes live and saves only on release", () => {
  const { environment, calls } = harness({ gm: false });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(board.opacityInput.value, "20");
  assert.equal(board.opacityOutput.textContent, "20%");
  const initialGridAlpha = board.graphics.lineAlphas[0];
  const initialHighlightAlpha = Math.max(...board.graphics.fillAlphas);
  board.opacityInput.value = "80";
  board.opacityInput.listeners.get("input")();
  calls.frames.at(-1)();
  assert.equal(board.opacity, 80);
  assert.equal(board.opacityOutput.textContent, "80%");
  assert.equal(board.opacityInput.attributes["aria-valuetext"], "80%");
  assert.equal(board.graphics.lineAlphas[0], initialGridAlpha * 4);
  assert.equal(Math.max(...board.graphics.fillAlphas), initialHighlightAlpha * 4);
  assert.deepEqual(calls.settings, []);
  board.opacityInput.listeners.get("change")();
  assert.deepEqual(calls.settings, [80]);
  assert.equal(calls.moves.length, 0);
});

test("saved client opacity survives board recreation and zero leaves movement controls usable", async () => {
  const { environment, calls } = harness({ gm: false, opacity: 48 });
  const board = new IsometricBoardOverlay(environment);
  board.refresh();
  assert.equal(board.opacityInput.value, "48");
  await board.setOpacity(0);
  board.hover = { column: 4, row: 4 };
  board.draw();
  assert.ok(board.graphics.lineAlphas.every(alpha => alpha === 0));
  assert.ok(board.graphics.fillAlphas.every(alpha => alpha === 0));
  assert.equal(board.hud.hidden, true);
  assert.equal(await board.moveSelected({ column: 2, row: 2 }), true);
  assert.equal(calls.moves.length, 1);
  board.destroy();
  const restored = new IsometricBoardOverlay(environment);
  restored.refresh();
  assert.equal(restored.opacityInput.value, "0");
  assert.equal(restored.opacityOutput.textContent, "0%");
});

test("opacity normalizes invalid preferences and API updates keep the HUD synchronized", async () => {
  const { environment, hooks, module } = harness({ opacity: NaN });
  const board = registerIsometricBoard(environment);
  hooks.get("ready")[0]();
  assert.equal(module.api.isometricBoard.opacity, 20);
  await module.api.isometricBoard.setOpacity(-10, { persist: false });
  assert.equal(board.opacityInput.value, "0");
  await module.api.isometricBoard.setOpacity(180, { persist: false });
  assert.equal(board.opacityInput.value, "100");
  await module.api.isometricBoard.setOpacity("38.6", { persist: false });
  assert.equal(board.opacityOutput.textContent, "39%");
  await module.api.isometricBoard.setOpacity("invalid", { persist: false });
  assert.equal(module.api.isometricBoard.opacity, 20);
});

test("manifest and localized controls include the isometric board runtime", async () => {
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  const language = JSON.parse(await readFile(new URL("../lang/en.json", import.meta.url), "utf8"));
  assert.ok(manifest.esmodules.includes("scripts/isometric-board/isometric-board.js"));
  assert.ok(manifest.esmodules.includes("scripts/isometric-board/token-ruler.js"));
  assert.ok(manifest.styles.includes("styles/isometric-board.css"));
  assert.ok(language["MK_SHADOWDARK.isometricBoard.toggle"]);
  assert.ok(language["MK_SHADOWDARK.isometricBoard.settingsToggle"]);
  for (const key of ["gridSize", "gridSizeValue", "gridSizeHint", "topLimit", "topLimitPixels", "topLimitHint", "topLimitMax", "pixelValue"]) {
    assert.equal(language[`MK_SHADOWDARK.isometricBoard.${key}`], undefined);
  }
});
