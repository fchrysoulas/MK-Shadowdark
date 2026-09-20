import {
  buildTargetEffectItemData,
  hasTargetedSpellEffect,
  matchesTargetedSpellEffect,
  resolveSpellEffectItems,
  shouldApplySpellEffects,
  spellTargetUuids
} from "./spell-effects-logic.js";
import {
  getShadowdarkRoll,
  getShadowdarkRollConfig
} from "../auto-damage/auto-damage-operation.js";
import { isFocusCheckRoll } from "../targeting-assistant/targeting-state.js";

(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Spell Effects";
  const SOCKET_CHANNEL = `module.${MODULE_ID}`;
  const REMOVE_FOCUS_EFFECTS = "remove-focus-spell-effects";
  const PROCESSING_MESSAGES = new Set();
  const REMOVED_FOCUS_CASTS = new Set();

  function getModuleVersion() {
    const module = game.modules.get(MODULE_ID);
    return module?.version ?? module?.data?.version ?? "unknown";
  }

  function getPrimaryActiveGM() {
    return game.users
      .filter(user => user.active && user.isGM)
      .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
  }

  function isPrimaryActiveGM() {
    return game.user?.id === getPrimaryActiveGM()?.id;
  }

  function collectionValues(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return [...collection.values()];
    return [];
  }

  function resolveTargetActor(document) {
    if (document?.documentName === "Actor") return document;
    return document?.actor
      ?? document?.document?.actor
      ?? document?.object?.actor
      ?? null;
  }

  function sourceEffectUuid(effect) {
    return effect?.uuid ?? effect?._id ?? effect?.id ?? effect?.name ?? "";
  }

  async function applyEffectsToTarget(actor, effects, context) {
    if (!actor || typeof actor.createEmbeddedDocuments !== "function") return 0;

    const existingItems = collectionValues(actor.items);
    const effectData = [];

    for (const effect of effects) {
      const effectUuid = sourceEffectUuid(effect);
      if (!effectUuid) continue;

      if (hasTargetedSpellEffect(existingItems, {
        castId: context.castId,
        sourceEffectUuid: effectUuid
      }, MODULE_ID)) {
        continue;
      }

      const data = buildTargetEffectItemData(effect, {
        castId: context.castId,
        sourceSpellUuid: context.sourceSpellUuid,
        moduleId: MODULE_ID
      });
      if (data) effectData.push(data);
    }

    if (!effectData.length) return 0;
    await actor.createEmbeddedDocuments("Item", effectData);
    return effectData.length;
  }

  function rememberRemovedFocusCast(castId) {
    const normalized = String(castId ?? "").trim();
    if (!normalized) return;

    REMOVED_FOCUS_CASTS.add(normalized);
    if (REMOVED_FOCUS_CASTS.size > 500) {
      REMOVED_FOCUS_CASTS.delete(REMOVED_FOCUS_CASTS.values().next().value);
    }
  }

  async function removeFocusSpellEffects({ castId, targetUuids = [], sourceSpellUuid = null } = {}) {
    const normalizedCastId = String(castId ?? "").trim();
    const normalizedTargets = spellTargetUuids({ targetUuids });
    if (!normalizedCastId || !normalizedTargets.length) {
      return { removed: 0, queued: false };
    }

    if (!isPrimaryActiveGM()) {
      if (typeof game.socket?.emit !== "function") {
        return { removed: 0, queued: false };
      }

      try {
        game.socket.emit(SOCKET_CHANNEL, {
          type: REMOVE_FOCUS_EFFECTS,
          castId: normalizedCastId,
          targetUuids: normalizedTargets,
          sourceSpellUuid: sourceSpellUuid ? String(sourceSpellUuid) : null
        });
        return { removed: 0, queued: true };
      } catch (error) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not request Focus spell-effect cleanup.`,
          error
        );
        return { removed: 0, queued: false };
      }
    }

    rememberRemovedFocusCast(normalizedCastId);
    let removed = 0;

    for (const targetUuid of normalizedTargets) {
      let targetDocument;
      try {
        targetDocument = await globalThis.fromUuid?.(targetUuid);
      } catch (error) {
        console.warn(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not resolve Focus effect target ${targetUuid}.`,
          error
        );
        continue;
      }

      const actor = resolveTargetActor(targetDocument);
      if (!actor || typeof actor.deleteEmbeddedDocuments !== "function") continue;

      const matchingItems = collectionValues(actor.items).filter(item => (
        item?.type === "Effect"
        && matchesTargetedSpellEffect(item, {
          castId: normalizedCastId,
          sourceSpellUuid
        }, MODULE_ID)
      ));
      if (!matchingItems.length) continue;

      try {
        await actor.deleteEmbeddedDocuments("Item", matchingItems.map(item => item.id));
        removed += matchingItems.length;
      } catch (error) {
        console.error(
          `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not remove Focus spell effects from ${actor.name ?? targetUuid}.`,
          error
        );
      }
    }

    return { removed, queued: false };
  }

  async function applySpellEffects(message) {
    if (!isPrimaryActiveGM() || !message?.id) return;

    const config = getShadowdarkRollConfig(message);
    const mainRoll = getShadowdarkRoll(message, "main");
    if (!shouldApplySpellEffects(config, mainRoll, isFocusCheckRoll(config))) return;

    const sourceSpellUuid = config.cast?.spellUuid;
    if (!sourceSpellUuid) return;

    const targetUuids = spellTargetUuids(config);
    if (!targetUuids.length) return;

    const messageKey = message.uuid ?? message.id;
    if (PROCESSING_MESSAGES.has(messageKey)) return;
    if (REMOVED_FOCUS_CASTS.has(String(messageKey))) return;
    PROCESSING_MESSAGES.add(messageKey);

    try {
      const spell = await globalThis.fromUuid?.(sourceSpellUuid);
      const effects = await resolveSpellEffectItems(spell, globalThis.fromUuid);
      if (!effects.length) return;

      const context = {
        castId: messageKey,
        sourceSpellUuid
      };

      for (const targetUuid of targetUuids) {
        let targetDocument;
        try {
          targetDocument = await globalThis.fromUuid?.(targetUuid);
        } catch (error) {
          console.warn(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not resolve target ${targetUuid}.`,
            error
          );
          continue;
        }

        const actor = resolveTargetActor(targetDocument);
        if (!actor) {
          console.warn(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Target ${targetUuid} has no actor.`
          );
          continue;
        }

        try {
          await applyEffectsToTarget(actor, effects, context);
        } catch (error) {
          console.error(
            `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not apply spell effects to ${actor.name ?? targetUuid}.`,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        `${MODULE_ID} | ${SUBMODULE} v${getModuleVersion()} | Could not resolve spell effects for ${sourceSpellUuid}.`,
        error
      );
    } finally {
      PROCESSING_MESSAGES.delete(messageKey);
    }
  }

  function handleChatMessage(message) {
    void applySpellEffects(message);
  }

  function exposeApi() {
    const module = game.modules.get(MODULE_ID);
    if (!module) return;

    module.api ??= {};
    module.api.spellEffects = {
      removeForFocus: (options = {}) => removeFocusSpellEffects(options)
    };
  }

  Hooks.once("init", exposeApi);
  Hooks.once("ready", () => {
    exposeApi();
    game.socket?.on(SOCKET_CHANNEL, payload => {
      if (payload?.type !== REMOVE_FOCUS_EFFECTS || !isPrimaryActiveGM()) return;
      void removeFocusSpellEffects(payload);
    });
  });
  Hooks.on("createChatMessage", handleChatMessage);
  Hooks.on("updateChatMessage", handleChatMessage);
})();
