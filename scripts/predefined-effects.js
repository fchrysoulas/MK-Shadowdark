// MK-Shadowdark - Additional Shadowdark predefined effects
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Predefined Effects";

  const MORALE_IMMUNE_EFFECT_ID = "moraleImmune";
  const MORALE_IMMUNE_EFFECT_KEY = `flags.${MODULE_ID}.encounter.moraleImmune`;
  const MORALE_IMMUNE_NAME_KEY = `SHADOWDARK.item.effect.predefined_effect.${MORALE_IMMUNE_EFFECT_ID}`;
  const MORALE_IMMUNE_ICON = "icons/svg/shield.svg";

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function registerPredefinedEffects() {
    const config = CONFIG.SHADOWDARK;
    if (!config?.PREDEFINED_EFFECTS) {
      warn("Shadowdark predefined effects are unavailable.");
      return;
    }

    config.PREDEFINED_EFFECTS[MORALE_IMMUNE_EFFECT_ID] ??= {
      defaultValue: true,
      effectKey: MORALE_IMMUNE_EFFECT_KEY,
      img: MORALE_IMMUNE_ICON,
      name: MORALE_IMMUNE_NAME_KEY,
      mode: "CONST.ACTIVE_EFFECT_MODES.CUSTOM",
      transfer: true
    };

    config.EFFECT_TRANSLATIONS ??= {};
    config.EFFECT_TRANSLATIONS[MORALE_IMMUNE_EFFECT_KEY] = MORALE_IMMUNE_NAME_KEY;
  }

  Hooks.on("applyActiveEffect", (_actor, change, _current, _delta, changes) => {
    if (change?.key !== MORALE_IMMUNE_EFFECT_KEY) return;

    const rawValue = String(change.value ?? "").trim().toLowerCase();
    const immune = change.value === true
      || change.value === 1
      || ["true", "1", "yes", "on"].includes(rawValue);

    if (immune) changes[MORALE_IMMUNE_EFFECT_KEY] = true;
  });

  Hooks.once("init", registerPredefinedEffects);
})();
