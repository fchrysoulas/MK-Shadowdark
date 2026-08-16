// MK-Shadowdark — Grouped Enemy Initiative
// Players retain their individual native Shadowdark initiative rolls.
// Hostile NPCs roll once using the hostile creature with the highest DEX modifier.
(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Initiative";
  const FEATURE_SETTINGS_TEMPLATE = `modules/${MODULE_ID}/templates/feature-settings.hbs`;
  const PATCH_MARK = Symbol.for(`${MODULE_ID}.initiative.rollInitiativePatch`);

  const SETTINGS = Object.freeze({
    ENABLED: "initiativeGroupEnemies",
    DEBUG: "initiativeDebug"
  });

  function moduleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function setting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key) ?? fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function enabled() {
    return game.system?.id === "shadowdark" && setting(SETTINGS.ENABLED, true);
  }

  function log(...args) {
    if (!setting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function getProperty(object, path) {
    if (globalThis.foundry?.utils?.getProperty) {
      return globalThis.foundry.utils.getProperty(object, path);
    }
    return String(path).split(".").reduce((current, key) => current?.[key], object);
  }

  function combatantsArray(combat) {
    if (!combat?.combatants) return [];
    if (Array.isArray(combat.combatants)) return combat.combatants;
    if (Array.isArray(combat.combatants.contents)) return combat.combatants.contents;
    if (typeof combat.combatants.values === "function") return [...combat.combatants.values()];
    return [];
  }

  function getCombatant(combat, id) {
    return combat?.combatants?.get?.(id)
      ?? combatantsArray(combat).find(combatant => combatant.id === id)
      ?? null;
  }

  function isNpc(actor) {
    return String(actor?.type ?? "").toLowerCase() === "npc";
  }

  function isHostileNpc(combatant) {
    if (!combatant || !isNpc(combatant.actor)) return false;

    const disposition = Number(combatant.token?.disposition);
    const hostile = Number(CONST.TOKEN_DISPOSITIONS?.HOSTILE ?? -1);

    // If there is no usable Token disposition, treat an NPC as an enemy.
    return Number.isFinite(disposition) ? disposition === hostile : true;
  }

  function dexModifier(actor) {
    const value = Number(getProperty(actor, "system.abilities.dex.mod"));
    return Number.isFinite(value) ? value : 0;
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number >= 0 ? `+${number}` : String(number);
  }

  function enemyCombatants(combat) {
    return combatantsArray(combat).filter(isHostileNpc);
  }

  function hasAssignedLeader(combatant) {
    const token = combatant?.token;
    try {
      const morale = token?.getFlag?.(MODULE_ID, "morale");
      if (morale?.leader === true) return true;
    } catch (_error) {
      // Fall through to source data.
    }
    return token?.flags?.[MODULE_ID]?.morale?.leader === true
      || token?._source?.flags?.[MODULE_ID]?.morale?.leader === true;
  }

  function enemyLeaderSummary(enemies) {
    const leaders = enemies.filter(hasAssignedLeader);
    if (!leaders.length) return { leaders, label: "No assigned leader" };

    const names = leaders.map(combatant => combatant.name ?? combatant.actor?.name ?? "Unnamed leader");
    return {
      leaders,
      label: leaders.length === 1
        ? `Assigned leader: ${names[0]}`
        : `Assigned leaders: ${names.join(", ")}`
    };
  }

  function selectEnemyRoller(combat) {
    return enemyCombatants(combat)
      .sort((left, right) => {
        const dexDifference = dexModifier(right.actor) - dexModifier(left.actor);
        if (dexDifference !== 0) return dexDifference;
        return String(left.name ?? "").localeCompare(String(right.name ?? ""));
      })[0] ?? null;
  }

  function initiativeFormula(combatant) {
    const rollData = combatant?.actor?.getRollData?.() ?? {};
    const nativeFormula = String(rollData.initiative ?? "").trim();
    if (nativeFormula) return { formula: nativeFormula, rollData };

    const modifier = dexModifier(combatant?.actor);
    const formula = `1d20 ${signed(modifier)}`.replace(/\+\s*-/g, "-");
    return { formula, rollData };
  }

  function sortGroupedEnemyTie(left, right, nativeResult) {
    if (!enabled()) return nativeResult;

    const numericInitiative = value => {
      if (value === null || value === undefined || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };
    const leftInitiative = numericInitiative(left?.initiative);
    const rightInitiative = numericInitiative(right?.initiative);
    if (leftInitiative === null || rightInitiative === null) return nativeResult;
    if (leftInitiative !== rightInitiative) return nativeResult;

    const leftIsEnemy = isHostileNpc(left);
    const rightIsEnemy = isHostileNpc(right);
    if (leftIsEnemy === rightIsEnemy) return nativeResult;

    // Keep every member of a shared enemy initiative slot together so one GM
    // turn can advance past the whole group without landing on a tied PC.
    return leftIsEnemy ? -1 : 1;
  }

  function sameInitiative(left, right) {
    const leftValue = left?.initiative;
    const rightValue = right?.initiative;
    if (leftValue === null || leftValue === undefined || leftValue === "") return false;
    if (rightValue === null || rightValue === undefined || rightValue === "") return false;
    const leftInitiative = Number(leftValue);
    const rightInitiative = Number(rightValue);
    return Number.isFinite(leftInitiative)
      && Number.isFinite(rightInitiative)
      && leftInitiative === rightInitiative;
  }

  async function nextGroupedEnemyTurn(combat, originalNextTurn) {
    if (!enabled() || !game.user?.isGM || combat?.round === 0) {
      return originalNextTurn.call(combat);
    }

    const turn = combat.turn ?? -1;
    const current = combat.turns?.[turn];
    if (!isHostileNpc(current)) return originalNextTurn.call(combat);

    let nextTurn = turn + 1;
    while (nextTurn < combat.turns.length) {
      const candidate = combat.turns[nextTurn];
      if (isHostileNpc(candidate) && sameInitiative(current, candidate)) {
        nextTurn += 1;
        continue;
      }
      if (combat.settings?.skipDefeated && candidate?.isDefeated) {
        nextTurn += 1;
        continue;
      }
      break;
    }

    if (nextTurn >= combat.turns.length) return combat.nextRound();

    const advanceTime = combat.getTimeDelta(combat.round, combat.turn, combat.round, nextTurn);
    const updateData = { round: combat.round, turn: nextTurn };
    const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };
    Hooks.callAll("combatTurn", combat, updateData, updateOptions);
    await combat.update(updateData, updateOptions);
    return combat;
  }

  async function rollEnemySide(combat, options = {}) {
    if (!combat || !game.user?.isGM) return combat;

    const enemies = enemyCombatants(combat);
    if (!enemies.length) return combat;

    const roller = selectEnemyRoller(combat);
    if (!roller?.actor) return combat;
    const leaderSummary = enemyLeaderSummary(enemies);

    const { formula, rollData } = initiativeFormula(roller);
    const roll = await new Roll(formula, rollData).evaluate();
    const total = Number(roll.total) || 0;

    // Every hostile NPC receives the same result: one GM/enemy initiative slot.
    await combat.updateEmbeddedDocuments(
      "Combatant",
      enemies.map(combatant => ({ _id: combatant.id, initiative: total }))
    );

    const rollMode = options?.messageOptions?.rollMode ?? options?.rollMode;
    const messageOptions = rollMode ? { rollMode } : {};

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker?.({ actor: roller.actor }) ?? {},
      flavor: `Enemy Initiative — ${roller.name ?? roller.actor.name ?? "Enemies"} (highest DEX ${signed(dexModifier(roller.actor))}) | ${enemies.length} combatant${enemies.length === 1 ? "" : "s"} | ${leaderSummary.label}`
    }, messageOptions);

    log("enemy side rolled", {
      roller: roller.name ?? roller.actor.name,
      dex: dexModifier(roller.actor),
      formula,
      total,
      combatants: enemies.map(combatant => combatant.name),
      leaders: leaderSummary.leaders.map(combatant => combatant.name)
    });

    return combat;
  }

  function installPatch() {
    const CombatClass = CONFIG.Combat?.documentClass ?? globalThis.Combat;
    const prototype = CombatClass?.prototype;
    if (!prototype || typeof prototype.rollInitiative !== "function" || prototype[PATCH_MARK]) return;

    const originalRollInitiative = prototype.rollInitiative;
    const originalNextTurn = typeof prototype.nextTurn === "function"
      ? prototype.nextTurn
      : null;
    const originalSortCombatants = typeof prototype._sortCombatants === "function"
      ? prototype._sortCombatants
      : null;

    Object.defineProperty(prototype, PATCH_MARK, {
      value: { originalRollInitiative },
      configurable: true
    });

    prototype.rollInitiative = async function(ids, options = {}) {
      if (!enabled() || !game.user?.isGM) {
        return originalRollInitiative.call(this, ids, options);
      }

      const requestedIds = Array.isArray(ids) ? ids : ids ? [ids] : [];
      if (!requestedIds.length) {
        return originalRollInitiative.call(this, ids, options);
      }

      const requestedCombatants = requestedIds
        .map(id => getCombatant(this, id))
        .filter(Boolean);

      // Player characters and non-hostile NPCs remain completely native.
      if (!requestedCombatants.some(isHostileNpc)) {
        return originalRollInitiative.call(this, ids, options);
      }

      // If Roll All supplied a mixed set, roll PCs/allies normally first.
      // Foundry preserves their individual totals and descending initiative order.
      const nativeIds = requestedCombatants
        .filter(combatant => !isHostileNpc(combatant))
        .map(combatant => combatant.id);

      if (nativeIds.length) {
        await originalRollInitiative.call(this, nativeIds, options);
      }

      // Any hostile-NPC initiative request represents the GM/enemy slot and
      // rerolls every hostile NPC together.
      await rollEnemySide(this, options);
      return this;
    };

    if (originalNextTurn) {
      prototype.nextTurn = function() {
        return nextGroupedEnemyTurn(this, originalNextTurn);
      };
    }

    if (originalSortCombatants) {
      prototype._sortCombatants = function(left, right) {
        const nativeResult = originalSortCombatants.call(this, left, right);
        return sortGroupedEnemyTie(left, right, nativeResult);
      };
    }

    log("grouped enemy initiative patch installed", {
      groupedTieBreak: Boolean(originalSortCombatants),
      groupedTurnAdvance: Boolean(originalNextTurn)
    });
  }

  function registerSettings() {
    const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication;
    const definitions = {
      [SETTINGS.ENABLED]: {
        name: "Initiative | Group Enemy Initiative",
        hint: "Players keep their individual native initiative rolls. Hostile NPCs roll once using the hostile creature with the highest DEX modifier and all act in that shared enemy slot.",
        scope: "world",
        type: Boolean,
        default: true
      },
      [SETTINGS.DEBUG]: {
        name: "Initiative | Debug Mode",
        hint: "Logs grouped enemy initiative details to the browser console.",
        scope: "world",
        type: Boolean,
        default: false
      }
    };

    for (const [key, definition] of Object.entries(definitions)) {
      if (game.settings.settings.has(`${MODULE_ID}.${key}`)) continue;
      game.settings.register(MODULE_ID, key, {
        ...definition,
        config: !FormApplicationBase
      });
    }

    if (!FormApplicationBase) return;

    function descriptor(key) {
      const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
      const value = game.settings.get(MODULE_ID, key);
      return {
        key,
        name: String(definition.name).replace(/^.*?(?:\s\|\s|:\s*)/, ""),
        hint: String(definition.hint ?? ""),
        value,
        isBoolean: definition.type === Boolean,
        isNumber: false,
        isSelect: false,
        isRange: false,
        isFilePicker: false,
        isTextarea: false,
        isColor: false,
        inputType: "text",
        dataType: "String",
        range: {},
        options: []
      };
    }

    class InitiativeSettingsForm extends FormApplicationBase {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: `${MODULE_ID}-initiative-settings`,
          title: "MK-Shadowdark | Initiative",
          template: FEATURE_SETTINGS_TEMPLATE,
          width: 680,
          height: "auto",
          resizable: true,
          closeOnSubmit: true
        });
      }

      getData() {
        return {
          title: "Initiative",
          hint: "Keep player initiative individual while grouping hostile NPCs into one GM initiative slot.",
          sections: [{
            title: "Automation",
            settings: [descriptor(SETTINGS.ENABLED), descriptor(SETTINGS.DEBUG)]
          }]
        };
      }

      async _updateObject(_event, formData) {
        for (const key of Object.values(SETTINGS)) {
          const value = formData[key] === true
            || formData[key] === "true"
            || formData[key] === "on"
            || formData[key] === 1;
          await game.settings.set(MODULE_ID, key, value);
        }
      }
    }

    game.settings.registerMenu(MODULE_ID, "initiativeSettings", {
      name: "Initiative",
      label: "Configure",
      hint: "Configure grouped hostile-NPC initiative.",
      icon: "fas fa-list-ol",
      type: InitiativeSettingsForm,
      restricted: true
    });
  }

  function exposeApi() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api ??= {};
    mod.api.initiative = {
      rollEnemySide: combat => rollEnemySide(combat ?? game.combat),
      selectEnemyRoller: combat => selectEnemyRoller(combat ?? game.combat)
    };
  }

  Hooks.once("init", registerSettings);
  Hooks.once("ready", () => {
    installPatch();
    exposeApi();
  });
})();
