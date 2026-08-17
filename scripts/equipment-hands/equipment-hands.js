import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import {
  equipmentChangeTouchesClassification,
  getItemHandUse as classifyItemHandUse,
  hasProperty,
  isOneHandedWeapon,
  isShield,
  isTwoHandedWeapon,
  occupiesOneHand
} from "../libs/equipment.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Equipment Hands";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  const MODE_WARN = "warn";
  const MODE_BLOCK = "block";
  const lastWarningSignatures = new WeakMap();
  const actorCheckTimeouts = new WeakMap();

  function log(...args) {
    if (!isDebugEnabled()) return;
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function setting(key, fallback) {
    try {
      if (!game.settings?.settings?.has(`${MODULE_ID}.${key}`)) return fallback;
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
  }

  function isDebugEnabled() {
    return Boolean(setting("equipmentHandsDebug", false));
  }

  function isEnabled() {
    return Boolean(setting("equipmentHandsEnabled", true));
  }

  function getMode() {
    const mode = String(setting("equipmentHandsMode", MODE_WARN) || MODE_WARN);
    return mode === MODE_BLOCK ? MODE_BLOCK : MODE_WARN;
  }

  function getMaxHands() {
    const n = Number(setting("equipmentHandsMaxHands", 2));
    return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 2;
  }

  function allowDualWielding() {
    return Boolean(setting("equipmentHandsAllowDualWield", true));
  }

  function ignoreStashedItems() {
    return Boolean(setting("equipmentHandsIgnoreStashed", true));
  }

  function isOwnedActorItem(item) {
    return item?.parent?.documentName === "Actor";
  }

  function getItemHandUse(item, proposed = null) {
    return classifyItemHandUse(item, proposed, { ignoreStashed: ignoreStashedItems() });
  }

  function buildHandsReport(actor, proposed = null) {
    const entries = [];
    const maxHands = getMaxHands();
    const dualWieldAllowed = allowDualWielding();

    for (const item of actor?.items ?? []) {
      const entry = getItemHandUse(item, proposed);
      if (entry) entries.push(entry);
    }

    const totalHands = entries.reduce((sum, entry) => sum + entry.hands, 0);
    const weapons = entries.filter(entry => entry.isWeapon);
    const twoHandedWeapons = weapons.filter(entry => entry.isTwoHanded);
    const problems = [];

    if (totalHands > maxHands) {
      problems.push(`uses ${totalHands}/${maxHands} hands`);
    }

    if (!dualWieldAllowed && weapons.length > 1) {
      problems.push("has more than one weapon equipped");
    }

    if (twoHandedWeapons.length && entries.length > 1) {
      problems.push("has a two-handed weapon equipped with another hand item");
    }

    return {
      actor,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "Unknown Actor",
      entries,
      totalHands,
      maxHands,
      weapons,
      twoHandedWeapons,
      dualWieldAllowed,
      problems,
      valid: problems.length === 0
    };
  }

  function formatEntry(entry) {
    const handLabel = entry.hands === 1 ? "1 hand" : `${entry.hands} hands`;
    return `${entry.name} (${entry.category}, ${handLabel})`;
  }

  function formatReport(report) {
    if (!report.entries.length) return "No hands occupied.";
    return report.entries.map(formatEntry).join(", ");
  }

  function reportSignature(report) {
    return [
      report.actorId,
      report.totalHands,
      report.maxHands,
      report.problems.join("|"),
      report.entries.map(entry => `${entry.id}:${entry.hands}`).join("|")
    ].join("::");
  }

  function notifyInvalid(report, mode = MODE_WARN, { once = false } = {}) {
    const action = mode === MODE_BLOCK ? "Cannot equip" : "Equipment Hands warning";
    const problems = report.problems.join("; ");
    const details = formatReport(report);
    const message = `${action}: ${report.actorName} ${problems}. ${details}`;

    if (once && report.actor) {
      const signature = reportSignature(report);
      if (lastWarningSignatures.get(report.actor) === signature) return;
      lastWarningSignatures.set(report.actor, signature);
    }

    ui.notifications?.warn?.(message);
  }

  function shouldCheckUpdate(item, changes) {
    if (!isOwnedActorItem(item)) return false;
    return equipmentChangeTouchesClassification(changes);
  }

  function canCheckActor(actor) {
    return !!actor && actor.documentName === "Actor" && (actor.isOwner || game.user?.isGM);
  }

  function checkActorHands(actor, { notify = true, mode = getMode(), proposed = null, once = false } = {}) {
    const report = buildHandsReport(actor, proposed);

    if (!report.valid && notify) {
      notifyInvalid(report, mode, { once });
    }

    log("checkActorHands", {
      actor: actor?.name,
      valid: report.valid,
      totalHands: report.totalHands,
      entries: report.entries.map(e => ({ name: e.name, hands: e.hands, category: e.category })),
      problems: report.problems
    });

    return report;
  }

  function scheduleActorCheck(actor, { reason = "unknown", delay = 75, once = true } = {}) {
    if (!isEnabled()) return;
    if (getMode() !== MODE_WARN) return;
    if (game.system?.id !== "shadowdark") return;
    if (!canCheckActor(actor)) return;

    const existingTimeout = actorCheckTimeouts.get(actor);
    if (existingTimeout) window.clearTimeout(existingTimeout);

    const timeout = window.setTimeout(() => {
      actorCheckTimeouts.delete(actor);
      log("scheduled check", reason, actor.name);
      checkActorHands(actor, { notify: true, mode: MODE_WARN, once });
    }, delay);

    actorCheckTimeouts.set(actor, timeout);
  }

  Hooks.on("preUpdateItem", (item, changes) => {
    try {
      if (!isEnabled()) return;
      if (getMode() !== MODE_BLOCK) return;
      if (game.system?.id !== "shadowdark") return;
      if (!shouldCheckUpdate(item, changes)) return;

      const actor = item.parent;
      if (!canCheckActor(actor)) return;

      const report = buildHandsReport(actor, { item, changes });

      if (!report.valid) {
        notifyInvalid(report, MODE_BLOCK);
        log("blocked invalid hand setup", report);
        return false;
      }
    } catch (err) {
      warn("preUpdateItem error", err);
    }
  });

  Hooks.on("updateItem", (item, changes) => {
    try {
      if (!isEnabled()) return;
      if (game.system?.id !== "shadowdark") return;
      if (!isOwnedActorItem(item)) return;
      if (!equipmentChangeTouchesClassification(changes)) return;

      scheduleActorCheck(item.parent, { reason: "updateItem", once: true });
    } catch (err) {
      warn("updateItem error", err);
    }
  });

  // UI-driven equipment buttons eventually resolve through item updates, but a
  // post-render check keeps warn mode aligned with the final visible sheet state.
  function onRenderActorSheet(app) {
    try {
      if (!isEnabled()) return;
      if (game.system?.id !== "shadowdark") return;
      scheduleActorCheck(app?.actor, { reason: "renderActorSheet", once: true });
    } catch (err) {
      warn("renderActorSheet error", err);
    }
  }

  onCharacterSheetRender("Equipment Hands", onRenderActorSheet, { priority: 60 });

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);

    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.equipmentHands = {
        checkActorHands,
        buildHandsReport,
        getItemHandUse,
        isOneHandedWeapon,
        isTwoHandedWeapon,
        isShield,
        occupiesOneHand,
        hasProperty
      };
    }

    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | ready`);
  });
})();
