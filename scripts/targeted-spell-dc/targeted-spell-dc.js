import { selectHighestSpellDcCandidate } from "./targeted-spell-dc-logic.js";

// Applies target-owned Active Effect spell DC overrides to Shadowdark spell
// configs. Live target changes update the open roll dialog through the MK
// targeting hook, while Shadowdark's public spell hooks guarantee the final
// config is correct immediately before the roll resolves.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Targeted Spell DC";
  const EFFECT_KEY = "system.roll.spell.dc";
  const TARGETS_CHANGED_HOOK = "mkShadowdarkTargetingChanged";
  const ORIGINAL_HEADING = Symbol.for(`${MODULE_ID}.targetedSpellDc.originalHeading`);
  const ORIGINAL_DC = Symbol.for(`${MODULE_ID}.targetedSpellDc.originalDc`);
  const ORIGINAL_TOOLTIPS = Symbol.for(`${MODULE_ID}.targetedSpellDc.originalTooltips`);

  function log(...args) {
    const version = game.modules.get(MODULE_ID)?.version ?? "unknown";
    console.log(`${MODULE_ID} v${version} | ${SUBMODULE} |`, ...args);
  }

  function collectionValues(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return [...collection.values()];
    return Array.from(collection);
  }

  function activeEffects(actor) {
    const effects = new Set();
    const addEffects = collection => {
      for (const effect of collectionValues(collection)) effects.add(effect);
    };

    addEffects(actor?.appliedEffects);
    addEffects(actor?.effects);

    try {
      addEffects(actor?.allApplicableEffects?.());
    } catch (_error) {
      // Older Foundry releases do not expose allApplicableEffects consistently.
    }

    // On Foundry v13, a manually created Active Effect inside a Shadowdark
    // Effect item may have transfer disabled. The custom target-DC key is still
    // intentional, so read it directly from items embedded on this actor.
    for (const item of collectionValues(actor?.items)) addEffects(item?.effects);

    return [...effects];
  }

  function resolveNumber(value, actor) {
    let resolved = value;
    try {
      resolved = Roll.replaceFormulaData(String(value ?? ""), actor?.getRollData?.() ?? {});
    } catch (_error) {
      // A literal value does not need formula resolution.
    }

    const number = Number(resolved);
    return Number.isFinite(number) ? number : null;
  }

  function spellDcOverrides(actor) {
    const overrides = [];

    for (const effect of activeEffects(actor)) {
      if (effect.disabled || effect.isSuppressed) continue;

      for (const change of effect.changes ?? []) {
        if (change.key !== EFFECT_KEY) continue;

        const dc = resolveNumber(change.value, actor);
        if (dc === null || dc < 0) continue;

        overrides.push({
          dc,
          source: effect.parent?.name || effect.name || actor.name || "Target effect"
        });
      }
    }

    return overrides;
  }

  function collectTargetSpellDcCandidates() {
    const candidates = [];

    for (const token of game.user?.targets ?? []) {
      const actor = token.actor ?? token.document?.actor;
      if (!actor) continue;

      for (const override of spellDcOverrides(actor)) {
        candidates.push({ ...override, actor });
      }
    }

    return candidates;
  }

  function applyTargetSpellDc(config) {
    if (config?.type !== "spell" || !config.mainRoll) return null;

    config[ORIGINAL_HEADING] ??= String(config.heading ?? "Spellcasting Check").trim();
    if (!(ORIGINAL_DC in config)) config[ORIGINAL_DC] = config.mainRoll.dc;
    if (!(ORIGINAL_TOOLTIPS in config)) config[ORIGINAL_TOOLTIPS] = config.mainRoll.tooltips;

    // Always restore the native values first so changing or clearing targets in
    // a live dialog cannot leave a previous target's ward behind.
    config.heading = config[ORIGINAL_HEADING];
    config.mainRoll.dc = config[ORIGINAL_DC];
    config.mainRoll.tooltips = config[ORIGINAL_TOOLTIPS];

    const applied = selectHighestSpellDcCandidate(collectTargetSpellDcCandidates());
    if (!applied) return null;

    config.mainRoll.dc = applied.dc;
    config.heading = `${config[ORIGINAL_HEADING]} - DC ${applied.dc}`;

    const tooltip = `${applied.source}: spell DC ${applied.dc}`;
    config.mainRoll.tooltips = [config.mainRoll.tooltips, tooltip]
      .filter(Boolean)
      .join(", ");

    return applied;
  }

  function applyBeforeShadowdarkSpellRoll(config) {
    try {
      applyTargetSpellDc(config);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not apply a targeted spell DC`, error);
    }
  }

  Hooks.once("ready", () => {
    if (game.system?.id !== "shadowdark") return;

    // MK's Targeting Assistant calls this while the roll dialog is open and
    // again immediately before submit, so the visible heading and live config
    // follow target changes.
    Hooks.on(TARGETS_CHANGED_HOOK, config => applyBeforeShadowdarkSpellRoll(config));

    // Shadowdark 4.0.6 public spell hooks run after its roll dialog closes and
    // immediately before rollFromConfig(). These are the authoritative final
    // application points, including skip-prompt/fast-forward spell casts.
    Hooks.on("SD-Player-Spell", config => applyBeforeShadowdarkSpellRoll(config));
    Hooks.on("SD-NPC-Spell-Cast", config => applyBeforeShadowdarkSpellRoll(config));

    log("Installed target-aware spell DC support through public spell hooks");
  });
})();
