const MODULE_ID = "mk-shadowdark";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_TYPE = "autoDamageShake";
let socketInstalled = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setPoint(point, x, y) {
  if (typeof point?.set === "function") {
    point.set(x, y);
    return;
  }
  point.x = x;
  point.y = y;
}

function tokenDocument(token) {
  return token?.document ?? token ?? null;
}

function tokenPlaceable(token) {
  return token?.object
    ?? token?.document?.object
    ?? (token?.mesh ? token : null);
}

function tokenDisplayObject(placeable) {
  // Foundry v13+ PlaceableObjects are not PIXI containers themselves. The
  // visible Token sprite lives on mesh, while a raw display object already
  // exposes position directly (useful for compatibility and focused tests).
  if (placeable?.mesh?.position) return placeable.mesh;
  return placeable?.position ? placeable : null;
}

function refreshTokenPosition(placeable) {
  if (typeof placeable?._refreshPosition === "function") {
    placeable._refreshPosition();
    return true;
  }
  if (typeof placeable?.renderFlags?.set === "function") {
    placeable.renderFlags.set({ refreshPosition: true });
    return true;
  }
  return false;
}

function tokenUuid(token) {
  return tokenDocument(token)?.uuid ?? null;
}

function gridSize() {
  const value = Number(
    globalThis.canvas?.grid?.size
      ?? globalThis.canvas?.dimensions?.size
  );
  return Number.isFinite(value) && value > 0 ? value : 100;
}

async function animateDisplayObject(displayObject, {
  gridSize: size = 100,
  distanceFactor = 0.1,
  steps = 6,
  stepDuration = 50,
  random = Math.random,
  sleepFn = sleep,
  restoreFn = null
} = {}) {
  const position = displayObject?.position;
  if (!position) return false;

  const baseX = Number(position.x) || 0;
  const baseY = Number(position.y) || 0;
  const maxOffset = Math.max(0, Number(size) || 0) * Math.max(0, Number(distanceFactor) || 0);
  const count = Math.max(0, Math.floor(Number(steps) || 0));
  const duration = Math.max(0, Number(stepDuration) || 0);

  try {
    for (let i = 0; i < count; i++) {
      const dx = (random() * 2 - 1) * maxOffset;
      const dy = (random() * 2 - 1) * maxOffset;
      setPoint(position, baseX + dx, baseY + dy);
      if (duration > 0) await sleepFn(duration);
    }
  } finally {
    let restored = false;
    try {
      restored = typeof restoreFn === "function" && restoreFn() !== false;
    } finally {
      if (!restored) setPoint(position, baseX, baseY);
    }
  }

  return true;
}

async function shakeTokenVisual(token, options = {}) {
  const placeable = tokenPlaceable(token);
  const displayObject = tokenDisplayObject(placeable ?? token);
  if (!displayObject) return false;
  return animateDisplayObject(displayObject, {
    gridSize: gridSize(),
    ...options,
    restoreFn: () => refreshTokenPosition(placeable)
  });
}

async function shakeTokenUuid(uuid, options = {}) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return false;
  try {
    const document = await globalThis.fromUuid(uuid);
    if (!document) return false;
    return await shakeTokenVisual(document, options);
  } catch (_error) {
    return false;
  }
}

function installTokenShakeSocket() {
  const game = globalThis.game;
  if (socketInstalled || !game?.socket?.on) return;
  socketInstalled = true;

  game.socket.on(SOCKET_CHANNEL, payload => {
    if (payload?.type !== SOCKET_TYPE) return;
    if (payload.senderId && payload.senderId === game.user?.id) return;
    void shakeTokenUuid(payload.tokenUuid, payload.options ?? {});
  });
}

async function broadcastTokenShake(token, options = {}) {
  const game = globalThis.game;
  const uuid = tokenUuid(token);
  if (uuid && game?.socket?.emit) {
    game.socket.emit(SOCKET_CHANNEL, {
      type: SOCKET_TYPE,
      tokenUuid: uuid,
      options,
      senderId: game.user?.id ?? null
    });
  }

  return shakeTokenVisual(token, options);
}

export {
  animateDisplayObject,
  broadcastTokenShake,
  installTokenShakeSocket,
  shakeTokenVisual,
  shakeTokenUuid
};
