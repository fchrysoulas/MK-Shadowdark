// MK-Shadowdark - Additional Shadowdark predefined effects
const MODULE_ID = "mk-shadowdark";

export const PREDEFINED_EFFECT_IDS = Object.freeze({
  ONLY_MAGICAL_DAMAGE_SOURCES: "onlyMagicalDamageSources",
  MAGICAL_ATTACKS: "magicalAttacks",
  TARGETED_SPELL_DC: "targetedSpellDc",
  MORALE_IMMUNE: "moraleImmune"
});

export const PREDEFINED_EFFECT_KEYS = Object.freeze({
  ONLY_MAGICAL_DAMAGE_SOURCES: "system.damage.immunity.nonmagical",
  MAGICAL_ATTACKS: "system.damage.source.magical",
  TARGETED_SPELL_DC: "system.roll.spell.dc",
  MORALE_IMMUNE: `flags.${MODULE_ID}.encounter.moraleImmune`
});

(() => {
  "use strict";

  const SUBMODULE = "Predefined Effects";

  const PREDEFINED_EFFECTS = Object.freeze({
    [PREDEFINED_EFFECT_IDS.ONLY_MAGICAL_DAMAGE_SOURCES]: {
      defaultValue: 1,
      effectKey: PREDEFINED_EFFECT_KEYS.ONLY_MAGICAL_DAMAGE_SOURCES,
      img: "modules/mk-shadowdark/assets/icons/effects/only-magical-damage.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    [PREDEFINED_EFFECT_IDS.MAGICAL_ATTACKS]: {
      defaultValue: 1,
      effectKey: PREDEFINED_EFFECT_KEYS.MAGICAL_ATTACKS,
      img: "modules/mk-shadowdark/assets/icons/effects/magical-attacks.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    [PREDEFINED_EFFECT_IDS.TARGETED_SPELL_DC]: {
      defaultValue: 18,
      effectKey: PREDEFINED_EFFECT_KEYS.TARGETED_SPELL_DC,
      img: "modules/mk-shadowdark/assets/icons/effects/targeted-spell-dc.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
      transfer: true
    },
    [PREDEFINED_EFFECT_IDS.MORALE_IMMUNE]: {
      defaultValue: true,
      effectKey: PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE,
      img: "icons/svg/shield.svg",
      mode: "CONST.ACTIVE_EFFECT_MODES.CUSTOM",
      transfer: true
    }
  });

  const EFFECT_TRANSLATIONS = Object.freeze({
    [PREDEFINED_EFFECT_KEYS.ONLY_MAGICAL_DAMAGE_SOURCES]: "Only Damaged by Magical Sources",
    [PREDEFINED_EFFECT_KEYS.MAGICAL_ATTACKS]: "Magical Attacks",
    [PREDEFINED_EFFECT_KEYS.TARGETED_SPELL_DC]: "Targeted Spell DC",
    [PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE]: "Immune to morale checks"
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
    if (change?.key !== PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE) return;
    if (isTruthy(change.value)) changes[PREDEFINED_EFFECT_KEYS.MORALE_IMMUNE] = true;
  });

  Hooks.once("init", registerPredefinedEffects);
})();
