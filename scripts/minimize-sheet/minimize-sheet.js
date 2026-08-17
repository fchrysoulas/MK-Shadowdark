import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Minimize Sheet";
  const sheetHeightStates = new WeakMap();

  Hooks.once("init", () => log("initialized"));

  onCharacterSheetRender("Minimize Sheet", onRenderActorSheet, { priority: 40 });

  function onRenderActorSheet(app, html) {
    const root = getRootElement(html);
    if (!root?.querySelector || !isShadowdarkPlayerSheet(app, root)) return;

    const windowEl = getWindowElement(app, root);
    const bar = findSummaryBar(root, windowEl);
    if (!bar) {
      removeSheetHeightToggle(app, windowEl, { restore: true });
      return;
    }

    setupSheetHeightToggle(app, windowEl, bar);
  }

  function isShadowdarkPlayerSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor" || isGroupActor(actor)) return false;

    const type = String(actor.type ?? "").toLowerCase();
    const appClasses = Array.from(app?.options?.classes ?? []).join(" ").toLowerCase();
    const isPlayer = type === "player" || appClasses.includes("player");
    if (!isPlayer) return false;

    return Boolean(
      root.matches?.(".shadowdark.sheet")
      || root.querySelector?.(".shadowdark.sheet")
      || root.querySelector?.("header.SD-header")
    );
  }

  function isGroupActor(actor) {
    try {
      if (actor.getFlag?.(MODULE_ID, "isGroup")) return true;
    } catch (_error) {
      // Inactive legacy flag scopes can throw when read through getFlag.
    }

    return Boolean(actor?._source?.flags?.[MODULE_ID]?.isGroup);
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getWindowElement(app, root) {
    const appElement = getRootElement(app?.element);
    if (appElement?.querySelector?.(".window-header")) return appElement;
    return root.closest?.(".window-app, .application, .app") ?? root;
  }

  function findSummaryBar(root, windowEl) {
    return root.querySelector?.(".mk-character-sheet-bar")
      ?? windowEl?.querySelector?.(".mk-character-sheet-bar")
      ?? null;
  }

  function setupSheetHeightToggle(app, windowEl, bar) {
    if (!app || !windowEl?.querySelector || !bar) return;

    const header = windowEl.querySelector(".window-header");
    if (!header) return;

    let state = sheetHeightStates.get(app);
    if (!state) {
      state = {
        collapsed: false,
        collapsedHeight: null,
        expandedHeight: getCurrentSheetHeight(app, windowEl),
        timer: null,
        bar: null,
        windowEl: null,
        button: null
      };
      sheetHeightStates.set(app, state);
    }

    state.bar = bar;
    state.windowEl = windowEl;

    let button = header.querySelector(".mk-sheet-height-toggle");
    const delegatedClasses = ["header-button", "control", "window-header-button"];
    if (button && (
      button.tagName !== "BUTTON"
      || delegatedClasses.some(className => button.classList.contains(className))
    )) {
      button.remove();
      button = null;
    }

    if (!button) {
      const reference = header.querySelector(".header-button, .window-header-button, .control, [data-action='close'], .close");
      button = document.createElement("button");
      button.type = "button";
      button.className = "mk-sheet-height-toggle";
      button.innerHTML = '<i class="fas fa-chevron-up" aria-hidden="true"></i>';

      if (reference) reference.before(button);
      else header.append(button);
    }

    state.button = button;
    button.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      toggleSheetHeight(app);
    };
    updateSheetHeightButton(state);

    if (state.collapsed) scheduleCollapsedSheetHeight(app, state);
  }

  function toggleSheetHeight(app) {
    const state = sheetHeightStates.get(app);
    if (!state?.windowEl || !state.bar) return;

    if (state.collapsed) {
      expandSheetHeight(app, state);
      return;
    }

    const currentHeight = getCurrentSheetHeight(app, state.windowEl);
    if (Number.isFinite(currentHeight) && currentHeight > 0) {
      state.expandedHeight = currentHeight;
    }
    collapseSheetHeight(app, state);
  }

  function scheduleCollapsedSheetHeight(app, state) {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      state.timer = null;
      if (!state.bar?.isConnected || !state.windowEl?.isConnected) return;
      collapseSheetHeight(app, state);
    }, 0);
  }

  function collapseSheetHeight(app, state) {
    const height = calculateCollapsedSheetHeight(app, state.windowEl, state.bar);
    state.collapsed = true;
    state.collapsedHeight = height;

    setApplicationHeight(app, state.windowEl, height);
    state.windowEl.style.setProperty("--mk-sheet-collapsed-height", `${height}px`);
    state.windowEl.classList.add("mk-sheet-height-collapsed");
    updateSheetHeightButton(state);
  }

  function expandSheetHeight(app, state) {
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    state.collapsed = false;
    state.windowEl.classList.remove("mk-sheet-height-collapsed");
    state.windowEl.style.removeProperty("--mk-sheet-collapsed-height");

    const height = Number(state.expandedHeight);
    if (Number.isFinite(height) && height > 0) {
      setApplicationHeight(app, state.windowEl, height);
    }
    updateSheetHeightButton(state);
  }

  function removeSheetHeightToggle(app, windowEl, { restore = false } = {}) {
    const state = sheetHeightStates.get(app);
    if (state?.timer) window.clearTimeout(state.timer);
    if (restore && state?.collapsed) expandSheetHeight(app, state);

    windowEl?.querySelector?.(".mk-sheet-height-toggle")?.remove();
    windowEl?.classList?.remove("mk-sheet-height-collapsed");
    windowEl?.style?.removeProperty("--mk-sheet-collapsed-height");
    sheetHeightStates.delete(app);
  }

  function calculateCollapsedSheetHeight(app, windowEl, bar) {
    const scale = getSheetScale(app);
    const windowRect = windowEl.getBoundingClientRect?.();
    const barRect = bar.getBoundingClientRect?.();
    const measured = windowRect && barRect
      ? (barRect.bottom - windowRect.top) / scale + 10
      : 170;
    return Math.ceil(Math.max(150, measured));
  }

  function getCurrentSheetHeight(app, windowEl) {
    const positioned = Number(app?.position?.height);
    if (Number.isFinite(positioned) && positioned > 0) return positioned;

    const measured = Number(windowEl?.getBoundingClientRect?.().height);
    return Number.isFinite(measured) && measured > 0
      ? measured / getSheetScale(app)
      : null;
  }

  function getSheetScale(app) {
    const scale = Number(app?.position?.scale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function setApplicationHeight(app, windowEl, height) {
    try {
      if (typeof app?.setPosition === "function") {
        app.setPosition({ height });
        return;
      }
    } catch (error) {
      console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | setPosition fallback`, error);
    }
    windowEl.style.height = `${height}px`;
  }

  function updateSheetHeightButton(state) {
    const button = state?.button;
    if (!button) return;

    const collapsed = state.collapsed === true;
    const title = collapsed ? "Expand character sheet" : "Minimize character sheet to the Summary Bar";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.setAttribute("aria-expanded", String(!collapsed));
    button.classList.toggle("active", collapsed);

    const icon = button.querySelector("i");
    if (icon) icon.className = `fas ${collapsed ? "fa-chevron-down" : "fa-chevron-up"}`;
  }

  function getModuleVersion() {
    return game.modules?.get(MODULE_ID)?.version ?? "?";
  }

  function log(...args) {
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }
})();
