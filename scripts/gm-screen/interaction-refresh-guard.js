import { MKGMscreen } from "./gm-screen.js";

const INTERACTIVE_CONTROL_SELECTOR = [
  "select",
  "input",
  "textarea",
  '[contenteditable="true"]',
  '[role="combobox"]',
].join(", ");

const DEFERRED_RENDER_OPTIONS = "_mkDeferredInteractiveRenderOptions";
const FOCUSOUT_BOUND = "_mkInteractiveRefreshFocusoutBound";

function applicationRoot(application) {
  const element = application?.element;
  if (element?.querySelector) return element;
  if (element?.[0]?.querySelector) return element[0];
  return null;
}

function activeInteractiveControl(application, documentRef = globalThis.document) {
  const root = applicationRoot(application);
  const active = documentRef?.activeElement ?? null;
  if (!root?.contains?.(active) || typeof active?.matches !== "function") return null;
  return active.matches(INTERACTIVE_CONTROL_SELECTOR) ? active : null;
}

function shouldDeferGmScreenRender(application, documentRef = globalThis.document) {
  return Boolean(application?.rendered && activeInteractiveControl(application, documentRef));
}

function mergeDeferredRenderOptions(application, options = {}) {
  const previous = application?.[DEFERRED_RENDER_OPTIONS];
  const next = {
    ...(previous && typeof previous === "object" ? previous : {}),
    ...(options && typeof options === "object" ? options : {}),
  };
  if (application) application[DEFERRED_RENDER_OPTIONS] = next;
  return next;
}

function takeDeferredRenderOptions(application) {
  if (!application) return null;
  const options = application[DEFERRED_RENDER_OPTIONS] ?? null;
  application[DEFERRED_RENDER_OPTIONS] = null;
  return options;
}

function flushDeferredGmScreenRender(application, originalRender, documentRef = globalThis.document) {
  if (!application?.rendered || typeof originalRender !== "function") return false;
  if (!application[DEFERRED_RENDER_OPTIONS]) return false;
  if (shouldDeferGmScreenRender(application, documentRef)) return false;

  const options = takeDeferredRenderOptions(application) ?? { force: true };
  originalRender.call(application, options);
  return true;
}

function bindDeferredRefreshFlush(application, originalRender, element = applicationRoot(application)) {
  if (!element?.addEventListener || element[FOCUSOUT_BOUND]) return false;
  element[FOCUSOUT_BOUND] = true;

  element.addEventListener("focusout", () => {
    const flush = () => flushDeferredGmScreenRender(application, originalRender);
    if (typeof globalThis.setTimeout === "function") globalThis.setTimeout(flush, 0);
    else flush();
  });

  return true;
}

function installGmScreenInteractionRefreshGuard() {
  const prototype = MKGMscreen?.prototype;
  const originalRender = prototype?.render;
  if (typeof originalRender !== "function" || prototype._mkInteractionRefreshGuardInstalled) return false;

  Object.defineProperty(prototype, "_mkInteractionRefreshGuardInstalled", {
    value: true,
    configurable: true,
  });

  prototype.render = function guardedGmScreenRender(options = {}) {
    if (shouldDeferGmScreenRender(this)) {
      mergeDeferredRenderOptions(this, options);
      bindDeferredRefreshFlush(this, originalRender);
      return this;
    }

    takeDeferredRenderOptions(this);
    return originalRender.call(this, options);
  };

  const originalOnRender = prototype._onRender;
  prototype._onRender = function guardedGmScreenOnRender(context, options) {
    const result = originalOnRender?.call(this, context, options);
    bindDeferredRefreshFlush(this, originalRender);
    return result;
  };

  return true;
}

installGmScreenInteractionRefreshGuard();

export {
  INTERACTIVE_CONTROL_SELECTOR,
  DEFERRED_RENDER_OPTIONS,
  applicationRoot,
  activeInteractiveControl,
  shouldDeferGmScreenRender,
  mergeDeferredRenderOptions,
  takeDeferredRenderOptions,
  flushDeferredGmScreenRender,
  bindDeferredRefreshFlush,
  installGmScreenInteractionRefreshGuard,
};
