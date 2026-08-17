import test from "node:test";
import assert from "node:assert/strict";

import {
  animateDisplayObject,
  shakeTokenVisual
} from "../scripts/auto-damage/token-shake.js";

function makePoint(x = 100, y = 200) {
  const writes = [];
  const point = {
    x,
    y,
    set(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
      writes.push([nextX, nextY]);
    }
  };
  return { point, writes };
}

function makeDisplay(x = 100, y = 200) {
  const { point: position, writes } = makePoint(x, y);
  return { display: { position }, writes };
}

test("visual shake offsets and restores the PIXI position", async () => {
  const { display, writes } = makeDisplay();
  const randomValues = [1, 0, 0.75, 0.25];
  let index = 0;

  const result = await animateDisplayObject(display, {
    gridSize: 100,
    distanceFactor: 0.1,
    steps: 2,
    stepDuration: 0,
    random: () => randomValues[index++]
  });

  assert.equal(result, true);
  assert.deepEqual(writes, [
    [110, 190],
    [105, 195],
    [100, 200]
  ]);
  assert.deepEqual([display.position.x, display.position.y], [100, 200]);
});

test("visual shake restores position even when animation sleep fails", async () => {
  const { display } = makeDisplay(40, 60);

  await assert.rejects(
    animateDisplayObject(display, {
      gridSize: 100,
      steps: 1,
      stepDuration: 1,
      random: () => 1,
      sleepFn: async () => {
        throw new Error("animation interrupted");
      }
    }),
    /animation interrupted/
  );

  assert.deepEqual([display.position.x, display.position.y], [40, 60]);
});

test("shakeTokenVisual uses the Foundry token mesh without document updates", async () => {
  const { point: position, writes } = makePoint(450, 550);
  const display = { position };
  const tokenDocument = {
    uuid: "Scene.scene.Token.token",
    x: 400,
    y: 500,
    update() {
      throw new Error("TokenDocument.update must not be called by visual shake");
    }
  };
  const placeable = {
    document: tokenDocument,
    mesh: display,
    _refreshPosition() {
      display.position.set(this.document.x + 50, this.document.y + 50);
    }
  };
  tokenDocument.object = placeable;

  const result = await shakeTokenVisual(tokenDocument, {
    steps: 1,
    stepDuration: 0,
    random: () => 1
  });

  assert.equal(result, true);
  assert.deepEqual(writes, [
    [460, 560],
    [450, 550]
  ]);
  assert.deepEqual([display.position.x, display.position.y], [450, 550]);
  assert.deepEqual([tokenDocument.x, tokenDocument.y], [400, 500]);
});

test("shake restoration does not overwrite a newer Foundry mesh position", async () => {
  const { point: position } = makePoint(50, 50);
  const display = { position };
  const tokenDocument = { x: 0, y: 0 };
  const placeable = {
    document: tokenDocument,
    mesh: display,
    _refreshPosition() {
      display.position.set(this.document.x + 50, this.document.y + 50);
    }
  };

  const result = await animateDisplayObject(display, {
    gridSize: 100,
    steps: 1,
    stepDuration: 1,
    random: () => 1,
    sleepFn: async () => {
      tokenDocument.x = 100;
      tokenDocument.y = 200;
    },
    restoreFn: () => placeable._refreshPosition()
  });

  assert.equal(result, true);
  assert.deepEqual([display.position.x, display.position.y], [150, 250]);
});

test("visual shake is a no-op when the token is not rendered", async () => {
  const result = await shakeTokenVisual({ uuid: "Scene.scene.Token.hidden" }, {
    steps: 1,
    stepDuration: 0
  });
  assert.equal(result, false);
});
