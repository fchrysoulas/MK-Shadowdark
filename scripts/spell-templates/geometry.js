import { createLayout, project, unproject, tokenFootprint } from "../isometric-board/geometry.js";

export const DIRECTIONS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function validPath(cells, length, bounds) {
  if (!Array.isArray(cells) || cells.length !== length || length < 1 || length > 60) return false;
  const seen = new Set();
  return cells.every((cell, index) => {
    if (!Number.isInteger(cell?.column) || !Number.isInteger(cell?.row) || cell.column < 0 || cell.row < 0
      || cell.column >= bounds.columns || cell.row >= bounds.rows) return false;
    const key = `${cell.column},${cell.row}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const previous = cells[index - 1];
    return !previous || Math.abs(cell.column - previous.column) + Math.abs(cell.row - previous.row) === 1;
  });
}

export function aimDirection(from, to, cardinal = false) {
  const step = cardinal ? 2 : 1;
  const angle = Math.atan2(to.row - from.row, to.column - from.column);
  return ((Math.round(angle / (Math.PI / 4) / step) * step) % 8 + 8) % 8;
}

export function footprintCenter(footprint) {
  return { column: footprint.column + (footprint.width ?? footprint.size ?? 1) / 2,
    row: footprint.row + (footprint.height ?? footprint.size ?? 1) / 2 };
}

export function footprintRange(footprint, cell) {
  const width = footprint.width ?? footprint.size ?? 1;
  const height = footprint.height ?? footprint.size ?? 1;
  return Math.max(0, footprint.column - cell.column, cell.column - (footprint.column + width - 1),
    footprint.row - cell.row, cell.row - (footprint.row + height - 1));
}

export function templateCells(template, anchor, direction, caster, bounds) {
  if (!anchor || !caster) return [];
  const cells = new Map();
  const add = (column, row) => {
    if (column >= 0 && row >= 0 && column < bounds.columns && row < bounds.rows) {
      cells.set(`${column},${row}`, { column, row });
    }
  };
  const center = footprintCenter(caster);
  const length = template.length;
  const width = template.width;
  const [dc, dr] = DIRECTIONS[((direction % 8) + 8) % 8];
  if (template.shape === "cube") {
    let column = anchor.column - Math.floor((length - 1) / 2);
    let row = anchor.row - Math.floor((length - 1) / 2);
    if (template.origin === "caster") {
      column = Math.round(center.column - length / 2);
      row = Math.round(center.row - length / 2);
      if (dc > 0) column = Math.ceil(caster.column + (caster.width ?? caster.size ?? 1));
      if (dc < 0) column = Math.floor(caster.column) - length;
      if (dr > 0) row = Math.ceil(caster.row + (caster.height ?? caster.size ?? 1));
      if (dr < 0) row = Math.floor(caster.row) - length;
    }
    for (let y = 0; y < length; y++) for (let x = 0; x < length; x++) add(column + x, row + y);
  } else if (template.shape === "circle") {
    const origin = template.origin === "caster" ? center : { column: anchor.column + 0.5, row: anchor.row + 0.5 };
    const source = template.origin === "caster" ? { left: caster.column, top: caster.row,
      right: caster.column + (caster.width ?? caster.size ?? 1), bottom: caster.row + (caster.height ?? caster.size ?? 1) }
      : { left: origin.column, right: origin.column, top: origin.row, bottom: origin.row };
    for (let row = Math.max(0, Math.floor(source.top - length)); row < Math.min(bounds.rows, Math.ceil(source.bottom + length)); row++) {
      for (let column = Math.max(0, Math.floor(source.left - length)); column < Math.min(bounds.columns, Math.ceil(source.right + length)); column++) {
        const x = Math.max(column - source.right, source.left - column - 1, 0);
        const y = Math.max(row - source.bottom, source.top - row - 1, 0);
        if (x * x + y * y < length * length - 1e-8) add(column, row);
      }
    }
  } else {
    let start = { ...anchor };
    if (template.origin === "caster") {
      start = { column: dc > 0 ? Math.ceil(caster.column + (caster.width ?? caster.size ?? 1))
        : dc < 0 ? Math.floor(caster.column) - 1 : Math.floor(center.column),
      row: dr > 0 ? Math.ceil(caster.row + (caster.height ?? caster.size ?? 1))
        : dr < 0 ? Math.floor(caster.row) - 1 : Math.floor(center.row) };
    }
    for (let i = 0; i < length; i++) for (let j = 0; j < width; j++) {
      const offset = j - Math.floor((width - 1) / 2);
      add(start.column + dc * i - dr * offset, start.row + dr * i + dc * offset);
    }
  }
  return [...cells.values()];
}

export function footprintIntersects(cells, footprint) {
  if (!footprint) return false;
  const maxColumn = footprint.column + (footprint.width ?? footprint.size ?? 1);
  const maxRow = footprint.row + (footprint.height ?? footprint.size ?? 1);
  return cells.some(cell => cell.column + 1 > footprint.column + 1e-8 && cell.column < maxColumn - 1e-8
    && cell.row + 1 > footprint.row + 1e-8 && cell.row < maxRow - 1e-8);
}

export function createCoordinateFrame(environment = globalThis) {
  const canvas = environment.canvas;
  if (!canvas?.ready || !canvas.scene) return null;
  const board = environment.game?.modules?.get?.("mk-shadowdark")?.api?.isometricBoard;
  if (board?.enabled) {
    if (!board.project || !board.coordinates || !board.tokenFootprint) return null;
    return { isometric: true, scene: canvas.scene, columns: board.boardSize, rows: board.boardSize,
      signature: JSON.stringify(board.layout), project: (column, row) => board.project(column, row),
      coordinates: point => board.coordinates(point), footprint: document => board.tokenFootprint(document) };
  }
  const rect = canvas.scene.getDimensions?.()?.sceneRect ?? canvas.dimensions?.sceneRect;
  const gridSize = Number(canvas.dimensions?.size ?? canvas.grid?.size ?? canvas.scene.grid?.size);
  const gridDistance = Number(canvas.scene.grid?.distance ?? 5);
  const size = gridSize * 5 / gridDistance;
  if (!rect || !Number.isFinite(size) || size <= 0) return null;
  return { isometric: false, scene: canvas.scene, columns: Math.ceil(rect.width / size), rows: Math.ceil(rect.height / size),
    signature: JSON.stringify([rect.x, rect.y, rect.width, rect.height, size]),
    project: (column, row) => ({ x: rect.x + column * size, y: rect.y + row * size }),
    coordinates: point => ({ column: (point.x - rect.x) / size, row: (point.y - rect.y) / size }),
    footprint: document => {
      const source = document._source ?? document;
      const dimensions = document.getSize?.(source) ?? { width: document.width * gridSize, height: document.height * gridSize };
      return { column: (source.x - rect.x) / size, row: (source.y - rect.y) / size,
        width: dimensions.width / size, height: dimensions.height / size };
    } };
}

// The authoritative GM may be viewing a different Scene when a player's cast resolves.
export function createSceneCoordinateFrame(scene, environment = globalThis) {
  if (environment.canvas?.ready && environment.canvas.scene === scene) return createCoordinateFrame(environment);
  if (!scene) return null;
  if (scene.getFlag?.("mk-shadowdark", "isometricBoard")?.enabled) {
    const layout = createLayout(scene);
    return { isometric: true, scene, columns: layout.size, rows: layout.size, signature: JSON.stringify(layout),
      project: (column, row) => project(layout, column, row), coordinates: point => unproject(layout, point),
      footprint: document => tokenFootprint(document, layout, document._source ?? {}, environment) };
  }
  return createCoordinateFrame({ ...environment, canvas: { ready: true, scene,
    dimensions: { size: scene.grid?.size, sceneRect: scene.getDimensions?.()?.sceneRect
      ?? { x: scene.padding * scene.width || 0, y: scene.padding * scene.height || 0, width: scene.width, height: scene.height } } },
    game: { ...environment.game, modules: null } });
}
