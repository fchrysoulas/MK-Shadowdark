const MODULE_ID = "mk-shadowdark";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_TYPE = "autoDamageShake";
let socketInstalled = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setPosition(position, x, y) {
  if (typeof position?.set === "function") {
    position.set(x, y);
    return;
  }
  position.x = x;
  position.y = y;
}

function tokenDocument(token) {
  return token?.document ?? token ?? null;
}

function tokenPlaceable(token) {
  return token?.object
    ?? token?.document?.object
    ?? (token?.position ? token : null);
}

function tokenUuid(token) {
  return tokenDocument(token)?.uuid ?? null;
}

function gridSize() {
  const value = Number(canvas?.grid?.size ?? canvas?.dimensions?.size);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

async function animateDisplayObject(displayObject, {
  gridSize: size = 100,
  distanceFactor = 0.1,
  steps = 6,
  stepDuration = 50,
  random = Math.random,
  sleepFn = sleep
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
      setPosition(position, baseX + dx, baseY + dy);
      if (duration > 0) await sleepFn(duration);
    }
  } finally {
    setPosition(position, baseX, baseY);
  }

  return true;
}

async function shakeTokenVisual(token, options = {}) {
  const placeable = tokenPlaceable(token);
  if (!placeable) return false;
  return animateDisplayObject(placeable, {
    gridSize: gridSize(),
    ...options
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
  if (socketInstalled || !game?.socket?.on) return;
  socketInstalled = true;

  game.socket.on(SOCKET_CHANNEL, payload => {
    if (payload?.type !== SOCKET_TYPE) return;
    if (payload.senderId && payload.senderId === game.user?.id) return;
    void shakeTokenUuid(payload.tokenUuid, payload.options ?? {});
  });
}

async function broadcastTokenShake(token, options = {}) {
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
