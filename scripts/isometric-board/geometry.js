export const MIN_BOARD_SIZE = 6;
export const MAX_BOARD_SIZE = 18;
export const BOARD_SIZE = MAX_BOARD_SIZE;
export const FEET_PER_CELL = 5;
export const NEAR_CELLS = 6;
export const CLOSE_DISTANCE = 5;
export const NEAR_DISTANCE = 30;
export const MIN_TILT = 5;
export const MAX_TILT = 85;

export function normalizeTilt(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(MIN_TILT, Math.min(MAX_TILT, Math.round(number))) : null;
}

export function normalizeRotation(value) {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(-180, Math.min(180, Math.round(number))) : 0;
}

export function normalizeBoardSize(value) {
  const number = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(MIN_BOARD_SIZE, Math.min(MAX_BOARD_SIZE, Math.round(number))) : BOARD_SIZE;
}

export function readBoardSize(scene) {
  return normalizeBoardSize(scene?.getFlag?.("mk-shadowdark", "isometricBoard")?.boardSize);
}

function positiveDimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function normalizeOffset(value) {
  const number = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.round(number) : 0;
}

export function normalizeScale(value) {
  const number = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(0.1, Math.min(4, number)) : 1;
}

export function createLayout(scene, rectangle, overrides = {}) {
  const settings = { ...scene?.getFlag?.("mk-shadowdark", "isometricBoard"), ...overrides };
  const size = normalizeBoardSize(settings.boardSize);
  const rect = rectangle ?? scene?.getDimensions?.()?.sceneRect ?? { x: 0, y: 0, width: scene?.width, height: scene?.height };
  const width = positiveDimension(rect.width, BOARD_SIZE * 200);
  const height = positiveDimension(rect.height, BOARD_SIZE * 100);
  const offsetX = normalizeOffset(settings.offsetX);
  const offsetY = normalizeOffset(settings.offsetY);
  // Older Scenes stored a single proportional size; preserve it on both axes.
  const scaleX = normalizeScale(settings.scaleX ?? settings.scale);
  const scaleY = normalizeScale(settings.scaleY ?? settings.scale);
  const top = (Number(rect.y) || 0) + offsetY;
  const tilt = normalizeTilt(settings.tilt);
  const rotation = normalizeRotation(settings.rotation);
  const radians = rotation * Math.PI / 180;
  const clean = value => Math.abs(value) < 1e-12 ? 0 : value;
  const cos = clean(Math.cos(radians));
  const sin = clean(Math.sin(radians));
  const ratio = tilt === null ? height / width : Math.tan(tilt * Math.PI / 180);
  const fittedWidth = Math.min(width / (size * Math.max(Math.abs(cos), ratio * Math.abs(sin))),
    height / (size * Math.max(Math.abs(sin), ratio * Math.abs(cos))));
  const cellWidth = scaleX * (tilt === null && rotation === 0 ? width / size : fittedWidth);
  const cellHeight = scaleY * (tilt === null && rotation === 0 ? height / size : fittedWidth * ratio);
  const centerX = (Number(rect.x) || 0) + width / 2 + offsetX;
  const centerY = top + height / 2;
  return {
    size, offsetX, offsetY, scaleX, scaleY,
    centerX, centerY, cos, sin, rotation, autoTilt: tilt === null,
    tilt: tilt ?? Math.atan(ratio) * 180 / Math.PI,
    originX: centerX,
    originY: centerY - size * cellHeight / 2,
    cellWidth,
    cellHeight
  };
}

export function readLayout(scene, rectangle, overrides) {
  // Fit to current Scene dimensions, then apply the saved width, height and position.
  return createLayout(scene, rectangle, overrides);
}

export function project(layout, column, row) {
  const point = {
    x: layout.originX + (column - row) * layout.cellWidth / 2,
    y: layout.originY + (column + row) * layout.cellHeight / 2
  };
  if (!layout.rotation) return point;
  const x = point.x - layout.centerX;
  const y = point.y - layout.centerY;
  return { x: layout.centerX + x * layout.cos - y * layout.sin,
    y: layout.centerY + x * layout.sin + y * layout.cos };
}

export function cellCenter(layout, cell) {
  return project(layout, cell.column + 0.5, cell.row + 0.5);
}

function unproject(layout, point) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
  if (layout.rotation) {
    const x = point.x - layout.centerX;
    const y = point.y - layout.centerY;
    point = { x: layout.centerX + x * layout.cos + y * layout.sin,
      y: layout.centerY - x * layout.sin + y * layout.cos };
  }
  const x = (point.x - layout.originX) / (layout.cellWidth / 2);
  const y = (point.y - layout.originY) / (layout.cellHeight / 2);
  return { column: (x + y) / 2, row: (y - x) / 2 };
}

export function pointToCell(layout, point) {
  const coordinates = unproject(layout, point);
  if (!coordinates) return null;
  const cell = { column: Math.floor(coordinates.column), row: Math.floor(coordinates.row) };
  return validCell(cell, layout.size) ? cell : null;
}

export function validCell(cell, size = BOARD_SIZE) {
  return Number.isInteger(cell?.column) && Number.isInteger(cell?.row)
    && cell.column >= 0 && cell.column < size && cell.row >= 0 && cell.row < size;
}

export function cellDistance(from, to) {
  return Math.max(Math.abs(from.column - to.column), Math.abs(from.row - to.row));
}

export function tokenFootprintSize(document, position = {}) {
  const width = Number(position.width ?? document.width);
  return Number.isFinite(width) && width > 0 ? Math.max(1, Math.min(4, Math.ceil(width))) : 1;
}

export function footprintCells(cell, size = cell?.size ?? 1) {
  if (!cell) return [];
  const cells = [];
  for (let row = cell.row; row < cell.row + size; row++) {
    for (let column = cell.column; column < cell.column + size; column++) cells.push({ column, row });
  }
  return cells;
}

export function validFootprint(cell, size, boardSize = BOARD_SIZE) {
  return validCell(cell, boardSize) && cell.column + size <= boardSize && cell.row + size <= boardSize;
}

export function footprintCenter(layout, cell, size = cell?.size ?? 1) {
  return project(layout, cell.column + size / 2, cell.row + size / 2);
}

function footprintAnchorOffset(layout, size) {
  const distance = size === 2 ? layout.cellHeight / 2 : 0;
  return { x: -(layout.sin ?? 0) * distance, y: (layout.cos ?? 1) * distance };
}

export function footprintAnchor(layout, cell, size = cell?.size ?? 1) {
  const center = footprintCenter(layout, cell, size);
  const offset = footprintAnchorOffset(layout, size);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

export function footprintDistance(from, to) {
  const fromSize = from.size ?? 1;
  const toSize = to.size ?? 1;
  return Math.max(0,
    from.column - (to.column + toSize - 1), to.column - (from.column + fromSize - 1),
    from.row - (to.row + toSize - 1), to.row - (from.row + fromSize - 1));
}

function footprintAtPoint(layout, point, size) {
  const offset = footprintAnchorOffset(layout, size);
  const coordinates = unproject(layout, { x: point?.x - offset.x, y: point?.y - offset.y });
  if (!coordinates) return null;
  // Old centered Large tokens lie on a placement boundary. Ignore subpixel
  // rounding there so integer TokenDocument coordinates keep the same cells.
  const tolerance = size === 2 ? 0.5 * (Math.abs(layout.cos ?? 1) + Math.abs(layout.sin ?? 0))
    * (1 / layout.cellWidth + 1 / layout.cellHeight) + 1e-8 : 0;
  const index = value => Math.floor(Math.abs(value - Math.round(value)) <= tolerance ? Math.round(value) : value) || 0;
  return { column: index(coordinates.column - (size - 1) / 2),
    row: index(coordinates.row - (size - 1) / 2), size };
}

export function pointToTokenCell(document, layout, point, dimensions = {}) {
  if (!pointToCell(layout, point)) return null;
  const size = tokenFootprintSize(document, dimensions);
  const footprint = footprintAtPoint(layout, point, size);
  return { column: Math.max(0, Math.min(layout.size - size, footprint.column)),
    row: Math.max(0, Math.min(layout.size - size, footprint.row)) };
}

export function rangeBand(from, to) {
  const distance = footprintDistance(from, to) * FEET_PER_CELL;
  return distance === 0 ? "self" : distance <= CLOSE_DISTANCE ? "close" : distance <= NEAR_DISTANCE ? "near" : "far";
}

export function cellLabel(cell) {
  return `${String.fromCharCode(65 + cell.column)}${cell.row + 1}`;
}

function tokenBaseOffset(document, position, environment) {
  const size = document.getSize(position);
  const token = document.object;
  const source = position.texture?.src ?? document.texture?.src;
  const texture = token?.mesh?.texture ?? token?.texture
    ?? (source ? environment.foundry?.canvas?.getTexture?.(source) : null);
  if (!texture?.width || !texture?.height || texture.valid === false) return { x: size.width / 2, y: size.height, top: 0 };

  // Reproduce Foundry's mesh fit at the waypoint's dimensions rather than reading
  // animated mesh bounds, which can still describe a previous drag preview.
  const config = { ...document.texture, ...position.texture };
  let sx = size.width / texture.width;
  let sy = size.height / texture.height;
  switch (config.fit ?? "contain") {
    case "cover": sx = sy = Math.max(sx, sy); break;
    case "contain": sx = sy = Math.min(sx, sy); break;
    case "width": sy = sx; break;
    case "height": sx = sy; break;
  }
  const ringScale = token?.hasDynamicRing && environment.CONFIG?.Token?.ring?.isGridFitMode
    ? token.ring?.subjectScaleAdjustment ?? 1 : 1;
  sx *= (config.scaleX ?? 1) * ringScale;
  sy *= (config.scaleY ?? 1) * ringScale;

  let bounds;
  try {
    bounds = environment.foundry?.canvas?.TextureLoader?.getTextureAlphaData(texture, 0.25);
  } catch (_error) {
    // Unreadable or still-loading artwork falls back to its full texture bounds.
  }
  const trimmed = bounds?.width > 0 && bounds?.height > 0 && bounds.maxX > bounds.minX && bounds.maxY > bounds.minY;
  const left = trimmed ? bounds.minX / bounds.width : 0;
  const right = trimmed ? bounds.maxX / bounds.width : 1;
  const top = trimmed ? bounds.minY / bounds.height : 0;
  const bottom = trimmed ? bounds.maxY / bounds.height : 1;
  const angle = document.lockRotation ? 0 : (position.rotation ?? document.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => {
    x = (x - (config.anchorX ?? 0.5)) * texture.width * sx;
    y = (y - (config.anchorY ?? 0.5)) * texture.height * sy;
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  });
  return {
    x: size.width / 2 + (Math.min(...corners.map(p => p.x)) + Math.max(...corners.map(p => p.x))) / 2,
    y: size.height / 2 + Math.max(...corners.map(p => p.y)),
    top: size.height / 2 + Math.min(...corners.map(p => p.y))
  };
}

export function tokenBase(document, position = {}, environment = globalThis) {
  const offset = tokenBaseOffset(document, position, environment);
  return { x: (position.x ?? document.x) + offset.x, y: (position.y ?? document.y) + offset.y };
}

export function tokenTop(document, position = {}, environment = globalThis) {
  const offset = tokenBaseOffset(document, position, environment);
  return { x: (position.x ?? document.x) + offset.x, y: (position.y ?? document.y) + offset.top };
}

export function tokenCell(document, layout, position = {}, environment = globalThis) {
  const footprint = tokenFootprint(document, layout, position, environment);
  return footprint && validFootprint(footprint, footprint.size, layout.size)
    ? { column: footprint.column, row: footprint.row } : null;
}

export function tokenFootprint(document, layout, position = {}, environment = globalThis) {
  return footprintAtPoint(layout, tokenBase(document, position, environment), tokenFootprintSize(document, position));
}

export function tokenPosition(document, layout, cell, dimensions = {}, environment = globalThis) {
  const center = footprintAnchor(layout, cell, tokenFootprintSize(document, dimensions));
  const offset = tokenBaseOffset(document, dimensions, environment);
  return { x: Math.round(center.x - offset.x), y: Math.round(center.y - offset.y) };
}

export function measureBasePath(document, layout, waypoints, environment = globalThis) {
  let total = 0;
  let delta = 0;
  let previous = null;
  for (const waypoint of waypoints) {
    const cell = tokenCell(document, layout, waypoint, environment);
    if (!cell) return null;
    delta = previous ? cellDistance(previous, cell) * FEET_PER_CELL : 0;
    total += delta;
    previous = cell;
  }
  return { total, delta };
}
