import { SheetRenderCoordinator } from "./sheet-render-coordinator.js";

const MODULE_ID = "mk-shadowdark";
const SUBMODULE = "Sheet Render Adapter";

const CHARACTER_SHEET_RENDER_HOOKS = Object.freeze([
  "renderActorSheet",
  "renderActorSheetSD",
  "renderPlayerSheetSD",
  "renderShadowdarkActorSheet",
  "renderShadowdarkActorSheetV2",
  "renderActorSheetShadowdark"
]);

function scheduleNextFrame(callback) {
  if (typeof window?.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }
  return window.setTimeout(callback, 0);
}

const coordinator = new SheetRenderCoordinator({
  schedule: scheduleNextFrame,
  onError(error, entry) {
    console.error(`${MODULE_ID} | ${SUBMODULE} | ${entry.name} render error`, error);
  }
});

let hooksInstalled = false;

function installCharacterSheetRenderHooks() {
  if (hooksInstalled || !globalThis.Hooks?.on) return false;
  hooksInstalled = true;

  for (const hookName of CHARACTER_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html, data) => {
      if (globalThis.game?.system?.id !== "shadowdark") return;
      coordinator.queue(app, html, data, hookName);
    });
  }

  return true;
}

function onCharacterSheetRender(name, callback, options = {}) {
  installCharacterSheetRenderHooks();
  return coordinator.register(name, callback, options);
}

installCharacterSheetRenderHooks();

export {
  CHARACTER_SHEET_RENDER_HOOKS,
  installCharacterSheetRenderHooks,
  onCharacterSheetRender
};
