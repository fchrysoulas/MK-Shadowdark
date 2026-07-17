import "./summary-bar.js";
import "./sheet-style-editor.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Core";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function log(...args) {
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function ensureApiNamespace() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return null;

    mod.api = mod.api ?? {};
    mod.api.version = getModuleVersion();
    return mod.api;
  }

  Hooks.once("init", () => {
    log("init");
  });

  Hooks.once("ready", () => {
    const api = ensureApiNamespace();

    if (api) {
      // Base Management was removed from mk-shadowdark.
      // Keep a harmless compatibility stub so old macros/modules that call it
      // fail gracefully instead of trying to create the removed dotted actor type.
      api.createBaseActor = async () => {
        ui.notifications.warn(
          "Base Management has been removed from MK-Shadowdark. Use the separate bases module instead."
        );
        return null;
      };
    }

    log("ready");
  });
})();
