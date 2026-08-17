import test from "node:test";
import assert from "node:assert/strict";

import {
  getFootprintBottomCenterPosition,
  getOpaqueBottomCenterForTopLeft,
  getRenderedBottomCenterPosition,
  getTopLeftForFootprintBottomCenter,
  getTopLeftForVisualBottomCenter
} from "../scripts/corpse-token/corpse-token-placement.js";

test("footprint bottom center uses token footprint rather than rendered mesh", () => {
  const state = {
    x: 200,
    y: 300,
    width: 2,
    height: 3,
    renderedPixelWidth: 120,
    renderedPixelHeight: 160
  };

  assert.deepEqual(getFootprintBottomCenterPosition(state, 100), {
    x: 300,
    y: 600
  });

  assert.deepEqual(getRenderedBottomCenterPosition(state, 100), {
    x: 260,
    y: 460
  });
});

test("footprint placement preserves a saved fall point", () => {
  const fallPoint = { x: 300, y: 600 };
  const topLeft = getTopLeftForFootprintBottomCenter(fallPoint, 1, 1, 100);

  assert.deepEqual(topLeft, { x: 250, y: 500 });
  assert.deepEqual(getFootprintBottomCenterPosition({
    ...topLeft,
    width: 1,
    height: 1
  }, 100), fallPoint);
});

test("visual-bottom placement accounts for scale, alpha padding, and y offset", () => {
  const fallPoint = { x: 300, y: 600 };
  const alphaBounds = { opaqueBottomRatio: 0.9 };
  const topLeft = getTopLeftForVisualBottomCenter(
    fallPoint,
    1,
    1,
    0.7,
    5,
    alphaBounds,
    100
  );

  assert.deepEqual(topLeft, { x: 250, y: 527 });
  assert.deepEqual(
    getOpaqueBottomCenterForTopLeft(topLeft, 1, 1, 0.7, alphaBounds, 100),
    { x: 300, y: 605 }
  );
});

test("invalid grid sizes fall back to 100 pixels", () => {
  assert.deepEqual(
    getTopLeftForFootprintBottomCenter({ x: 50, y: 100 }, 1, 1, 0),
    { x: 0, y: 0 }
  );
});
