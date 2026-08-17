function toFiniteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeGridSize(gridSize) {
  const size = toFiniteNumber(gridSize, 100);
  return size > 0 ? size : 100;
}

function getFootprintBottomCenterPosition(state, gridSize = 100) {
  const size = normalizeGridSize(gridSize);
  const width = toFiniteNumber(state?.width, 1);
  const height = toFiniteNumber(state?.height, 1);
  const pixelWidth = toFiniteNumber(
    state?.footprintPixelWidth ?? state?.pixelWidth,
    width * size
  );
  const pixelHeight = toFiniteNumber(
    state?.footprintPixelHeight ?? state?.pixelHeight,
    height * size
  );

  return {
    x: toFiniteNumber(state?.x, 0) + (pixelWidth / 2),
    y: toFiniteNumber(state?.y, 0) + pixelHeight
  };
}

function getRenderedBottomCenterPosition(state, gridSize = 100) {
  const size = normalizeGridSize(gridSize);
  const width = toFiniteNumber(state?.width, 1);
  const height = toFiniteNumber(state?.height, 1);
  const pixelWidth = toFiniteNumber(state?.renderedPixelWidth, width * size);
  const pixelHeight = toFiniteNumber(state?.renderedPixelHeight, height * size);

  return {
    x: toFiniteNumber(state?.x, 0) + (pixelWidth / 2),
    y: toFiniteNumber(state?.y, 0) + pixelHeight
  };
}

function getTopLeftForFootprintBottomCenter(bottomCenter, width, height, gridSize = 100) {
  const size = normalizeGridSize(gridSize);
  return {
    x: toFiniteNumber(bottomCenter?.x, 0) - ((toFiniteNumber(width, 1) * size) / 2),
    y: toFiniteNumber(bottomCenter?.y, 0) - (toFiniteNumber(height, 1) * size)
  };
}

function getTopLeftForVisualBottomCenter(
  bottomCenter,
  width,
  height,
  scaleY,
  yOffset = 0,
  imageAlphaBounds = null,
  gridSize = 100
) {
  const size = normalizeGridSize(gridSize);
  const footprintPixelHeight = toFiniteNumber(height, 1) * size;
  const visualPixelHeight = footprintPixelHeight * toFiniteNumber(scaleY, 1);
  const centeredTopPadding = (footprintPixelHeight - visualPixelHeight) / 2;
  const opaqueBottomRatio = clampNumber(imageAlphaBounds?.opaqueBottomRatio, 0, 1, 1);
  const opaqueBottomFromDocumentTop = centeredTopPadding + (visualPixelHeight * opaqueBottomRatio);

  return {
    x: toFiniteNumber(bottomCenter?.x, 0) - ((toFiniteNumber(width, 1) * size) / 2),
    y: toFiniteNumber(bottomCenter?.y, 0) - opaqueBottomFromDocumentTop + toFiniteNumber(yOffset, 0)
  };
}

function getFullTextureBottomCenterForTopLeft(topLeft, width, height, scaleY, gridSize = 100) {
  const size = normalizeGridSize(gridSize);
  const footprintPixelWidth = toFiniteNumber(width, 1) * size;
  const footprintPixelHeight = toFiniteNumber(height, 1) * size;
  const visualPixelHeight = footprintPixelHeight * toFiniteNumber(scaleY, 1);

  return {
    x: toFiniteNumber(topLeft?.x, 0) + (footprintPixelWidth / 2),
    y: toFiniteNumber(topLeft?.y, 0) + (footprintPixelHeight / 2) + (visualPixelHeight / 2)
  };
}

function getOpaqueBottomCenterForTopLeft(
  topLeft,
  width,
  height,
  scaleY,
  imageAlphaBounds = null,
  gridSize = 100
) {
  const size = normalizeGridSize(gridSize);
  const footprintPixelWidth = toFiniteNumber(width, 1) * size;
  const footprintPixelHeight = toFiniteNumber(height, 1) * size;
  const visualPixelHeight = footprintPixelHeight * toFiniteNumber(scaleY, 1);
  const centeredTopPadding = (footprintPixelHeight - visualPixelHeight) / 2;
  const opaqueBottomRatio = clampNumber(imageAlphaBounds?.opaqueBottomRatio, 0, 1, 1);

  return {
    x: toFiniteNumber(topLeft?.x, 0) + (footprintPixelWidth / 2),
    y: toFiniteNumber(topLeft?.y, 0) + centeredTopPadding + (visualPixelHeight * opaqueBottomRatio)
  };
}

function getVisualBottomCenterForTopLeft(
  topLeft,
  width,
  height,
  scaleY,
  imageAlphaBounds = null,
  gridSize = 100
) {
  return getOpaqueBottomCenterForTopLeft(
    topLeft,
    width,
    height,
    scaleY,
    imageAlphaBounds,
    gridSize
  );
}

export {
  clampNumber,
  getFootprintBottomCenterPosition,
  getFullTextureBottomCenterForTopLeft,
  getOpaqueBottomCenterForTopLeft,
  getRenderedBottomCenterPosition,
  getTopLeftForFootprintBottomCenter,
  getTopLeftForVisualBottomCenter,
  getVisualBottomCenterForTopLeft,
  normalizeGridSize,
  toFiniteNumber
};
