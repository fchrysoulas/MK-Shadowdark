(() => {
  const MODULE_ID = "mk-shadowdark";
  const SHEET_LABEL = "MK-Shadowdark: Dashboard Item Sheet";
  let nativeItemSheet;
  let itemCollection;
  let dashboardItemSheet;
  let registered = false;

  function characterDashboardEnabled() {
    try {
      const value = globalThis.game?.settings?.get?.(MODULE_ID, "characterDashboardEnabled");
      return value !== false;
    } catch (_error) {
      return true;
    }
  }

  function registerDashboardItemSheet() {
    if (registered || !itemCollection || !nativeItemSheet) return;

    dashboardItemSheet = class MKDashboardItemSheet extends nativeItemSheet {
      static get defaultOptions() {
        const baseOptions = super.defaultOptions ?? {};
        return foundry.utils.mergeObject(baseOptions, {
          classes: ["shadowdark", "sheet", "item", "mk-dashboard-item-sheet"],
          width: 720,
          height: 680,
          resizable: true
        });
      }
    };

    itemCollection.registerSheet(MODULE_ID, dashboardItemSheet, {
      makeDefault: true,
      label: game.i18n?.localize?.("MK_SHADOWDARK.dashboard.itemSheetName") || SHEET_LABEL
    });
    registered = true;
  }

  function unregisterDashboardItemSheet() {
    if (!registered || !itemCollection || !dashboardItemSheet) return;
    if (typeof itemCollection.unregisterSheet !== "function") {
      console.warn(MODULE_ID + " | Foundry cannot unregister the dashboard item sheet at runtime.");
      return;
    }

    itemCollection.unregisterSheet(MODULE_ID, dashboardItemSheet);
    registered = false;
    dashboardItemSheet = null;
  }

  function closeOpenItemSheets() {
    try {
      for (const app of Object.values(globalThis.ui?.windows ?? {})) {
        if (app?.object?.documentName !== "Item") continue;
        void app.close?.();
      }
    } catch (error) {
      console.warn(MODULE_ID + " | Unable to refresh open item sheets after dashboard toggle.", error);
    }
  }

  function setDashboardItemSheetEnabled(enabled) {
    const shouldRegister = enabled !== false;
    if (shouldRegister) registerDashboardItemSheet();
    else unregisterDashboardItemSheet();
    closeOpenItemSheets();
  }

  Hooks.once("init", () => {
    if (game.system?.id !== "shadowdark") return;

    nativeItemSheet = game.system?.sheets?.ItemSheetSD ?? globalThis.shadowdark?.sheets?.ItemSheetSD;
    itemCollection = globalThis.foundry?.documents?.collections?.Items;
    if (!nativeItemSheet || typeof itemCollection?.registerSheet !== "function") {
      console.warn(MODULE_ID + " | Shadowdark item sheet is unavailable.");
      return;
    }

    globalThis.MKShadowdarkItemDashboard = {
      setEnabled: setDashboardItemSheetEnabled,
      isEnabled: () => registered
    };
    setDashboardItemSheetEnabled(characterDashboardEnabled());
  });
})();
