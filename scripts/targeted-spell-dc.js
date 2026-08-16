// Applies target-owned Active Effect spell DC overrides before Shadowdark opens
// its spellcasting dialog.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Targeted Spell DC";
  const EFFECT_KEY = "system.roll.spell.dc";
  const WRAPPED = Symbol.for(`${MODULE_ID}.targetedSpellDc.wrappedPrepareContext`);
  const ORIGINAL_HEADING = Symbol.for(`${MODULE_ID}.targetedSpellDc.originalHeading`);

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

  function applyTargetSpellDc(config) {
    if (config?.type !== "spell" || !config.mainRoll) return;

    const candidates = [];
    for (const token of game.user?.targets ?? []) {
      const actor = token.actor ?? token.document?.actor;
      if (!actor) continue;

      for (const override of spellDcOverrides(actor)) {
        candidates.push({ ...override, actor });
      }
    }

    if (!candidates.length) return;

    // A spell aimed at several protected targets uses the most demanding
    // applicable DC. This avoids weakening any target's ward.
    candidates.sort((left, right) => right.dc - left.dc);
    const applied = candidates[0];
    config.mainRoll.dc = applied.dc;

    config[ORIGINAL_HEADING] ??= String(config.heading ?? "Spellcasting Check").trim();
    config.heading = `${config[ORIGINAL_HEADING]} - DC ${applied.dc}`;

    const tooltip = `${applied.source}: spell DC ${applied.dc}`;
    config.mainRoll.tooltips = [config.mainRoll.tooltips, tooltip]
      .filter(Boolean)
      .join(", ");
  }

  function install() {
    const prototype = globalThis.shadowdark?.apps?.RollDialogSD?.prototype;
    if (!prototype || typeof prototype._prepareContext !== "function") {
      console.warn(`${MODULE_ID} | ${SUBMODULE} could not find Shadowdark's roll dialog class.`);
      return false;
    }

    const original = prototype._prepareContext;
    if (original[WRAPPED]) return true;

    const wrapped = async function(...args) {
      try {
        applyTargetSpellDc(this.config);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not apply a targeted spell DC`, error);
      }

      return original.apply(this, args);
    };

    Object.defineProperty(wrapped, WRAPPED, { value: true });
    Object.defineProperty(wrapped, "name", { value: original.name, configurable: true });
    prototype._prepareContext = wrapped;
    log("Installed target-aware spell DC support");
    return true;
  }

  Hooks.once("ready", () => {
    if (game.system?.id !== "shadowdark") return;
    install();
  });
})();
