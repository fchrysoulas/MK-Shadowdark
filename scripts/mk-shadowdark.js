/*
 * MK-Shadowdark - Core
 * Foundry VTT v12
 *
 * Shared module boot file.
 * Feature logic lives in separate feature files.
 */

import { registerBaseActorFeature } from "./base-actor.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const MODULE_VERSION = "1.0.0";
  const SUBMODULE = "Core";

  function log(...args) {
    console.log(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} |`, ...args);
  }

  function ensureApiNamespace() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return null;

    mod.api = mod.api ?? {};
    mod.api.version = MODULE_VERSION;
    return mod.api;
  }

  Hooks.once("init", () => {
    log("init");

    registerBaseActorFeature();
  });

  Hooks.once("ready", () => {
    const api = ensureApiNamespace();

    if (api) {
      api.createBaseActor = async (name = "New Base") => {
        return Actor.create({
          name,
          type: `${MODULE_ID}.Base`,
          img: `modules/${MODULE_ID}/assets/base-management/base.svg`,
        });
      };
    }

    log("ready");
  });
})();
