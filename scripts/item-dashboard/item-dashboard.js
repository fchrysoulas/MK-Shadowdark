(() => {
  const MODULE_ID = "mk-shadowdark";
  const SHEET_LABEL = "MK-Shadowdark: Dashboard Item Sheet";

  Hooks.once("init", () => {
    if (game.system?.id !== "shadowdark") return;

    const native = game.system?.sheets?.ItemSheetSD ?? globalThis.shadowdark?.sheets?.ItemSheetSD;
    const items = globalThis.foundry?.documents?.collections?.Items;
    if (!native || typeof items?.registerSheet !== "function") {
      console.warn(MODULE_ID + " | Shadowdark item sheet is unavailable.");
      return;
    }

    class MKDashboardItemSheet extends native {
      static get defaultOptions() {
        const baseOptions = super.defaultOptions ?? {};
        return foundry.utils.mergeObject(baseOptions, {
          classes: ["shadowdark", "sheet", "item", "mk-dashboard-item-sheet"],
          width: 720,
          height: 680,
          resizable: true
        });
      }
    }

    items.registerSheet(MODULE_ID, MKDashboardItemSheet, {
      makeDefault: true,
      label: game.i18n?.localize?.("MK_SHADOWDARK.dashboard.itemSheetName") || SHEET_LABEL
    });
  });
})();
