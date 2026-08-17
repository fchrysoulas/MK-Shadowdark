import test from "node:test";
import assert from "node:assert/strict";

import {
  animateDisplayObject,
  shakeTokenVisual
} from "../scripts/token-shake.js";

function makeDisplay(x = 100, y = 200) {
  const writes = [];
  const position = {
    x,
    y,
    set(nextX, nextY) {
      this.x = nextX;
      this.y = nextY;
      writes.push([nextX, nextY]);
    }
  };
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

test("shakeTokenVisual uses the rendered token object without document updates", async () => {
  const { display } = makeDisplay(10, 20);
  const tokenDocument = {
    uuid: "Scene.scene.Token.token",
    object: display,
    update() {
      throw new Error("TokenDocument.update must not be called by visual shake");
    }
  };

  const result = await shakeTokenVisual(tokenDocument, {
    steps: 1,
    stepDuration: 0,
    random: () => 0.5
  });

  assert.equal(result, true);
  assert.deepEqual([display.position.x, display.position.y], [10, 20]);
});

test("visual shake is a no-op when the token is not rendered", async () => {
  const result = await shakeTokenVisual({ uuid: "Scene.scene.Token.hidden" }, {
    steps: 1,
    stepDuration: 0
  });
  assert.equal(result, false);
});
