// MK-Shadowdark - Additional Shadowdark predefined effects
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Predefined Effects";

  const EFFECT_KEYS = Object.freeze({
    onlyMagicalDamageSources: "system.damage.immunity.nonmagical",
    magicalAttacks: "system.damage.source.magical",
    targetedSpellDc: "system.roll.spell.dc",
    moraleImmune: `flags.${MODULE_ID}.encounter.moraleImmune`
  });

  const PREDEFINED_EFFECTS = Object.freeze({
    onlyMagicalDamageSources: {
      defaultValue: 1,
      effectKey: EFFECT_KEYS.onlyMagicalDamageSources,
      img: "modules/mk-shadowdark/assets/icons/effects/only-magical-damage.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    magicalAttacks: {
      defaultValue: 1,
      effectKey: EFFECT_KEYS.magicalAttacks,
      img: "modules/mk-shadowdark/assets/icons/effects/magical-attacks.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    targetedSpellDc: {
      defaultValue: 18,
      effectKey: EFFECT_KEYS.targetedSpellDc,
      img: "modules/mk-shadowdark/assets/icons/effects/targeted-spell-dc.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    moraleImmune: {
      defaultValue: true,
      effectKey: EFFECT_KEYS.moraleImmune,
      img: "icons/svg/shield.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.CUSTOM",
      transfer: true
    }
  });

  const EFFECT_TRANSLATIONS = Object.freeze({
    [EFFECT_KEYS.onlyMagicalDamageSources]: "Only Damaged by Magical Sources",
    [EFFECT_KEYS.magicalAttacks]: "Magical Attacks",
    [EFFECT_KEYS.targetedSpellDc]: "Targeted Spell DC",
    [EFFECT_KEYS.moraleImmune]: "Immune to morale checks"
  });

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function effectNameKey(id) {
    return `SHADOWDARK.item.effect.predefined_effect.${id}`;
  }

  function isTruthy(value) {
    if (value === true || value === 1) return true;
    return ["true", "1", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
  }

  function registerPredefinedEffects() {
    const config = CONFIG.SHADOWDARK;
    if (!config?.PREDEFINED_EFFECTS) {
      warn("Shadowdark predefined effects are unavailable.");
      return;
    }

    for (const [id, definition] of Object.entries(PREDEFINED_EFFECTS)) {
      config.PREDEFINED_EFFECTS[id] ??= {
        ...definition,
        name: effectNameKey(id)
      };
    }

    config.EFFECT_TRANSLATIONS ??= {};
    Object.assign(config.EFFECT_TRANSLATIONS, EFFECT_TRANSLATIONS);
  }

  Hooks.on("applyActiveEffect", (_actor, change, _current, _delta, changes) => {
    if (change?.key !== EFFECT_KEYS.moraleImmune) return;
    if (isTruthy(change.value)) changes[EFFECT_KEYS.moraleImmune] = true;
  });

  Hooks.once("init", registerPredefinedEffects);
})();
