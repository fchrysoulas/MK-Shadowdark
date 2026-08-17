import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Equipment Hands";

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  const MODE_WARN = "warn";
  const MODE_BLOCK = "block";

  const LAST_WARNING_KEY = "__mkEquipmentHandsLastWarning";
  const CHECK_TIMEOUT_KEY = "__mkEquipmentHandsTimeout";

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

  function normalize(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }

  function toBool(value) {
    if (value === true || value === false) return value;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      if (["true", "1", "yes", "on"].includes(v)) return true;
      if (["false", "0", "no", "off", ""].includes(v)) return false;
    }
    return Boolean(value);
  }

  function getProperty(object, path) {
    try {
      return foundry.utils.getProperty(object, path);
    } catch (_err) {
      return undefined;
    }
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object ?? {}, key);
  }

  function hasChanged(changes, path) {
    if (!changes) return false;
    if (hasOwn(changes, path)) return true;

    try {
      if (foundry.utils.hasProperty(changes, path)) return true;
    } catch (_err) {
      // Fall through.
    }

    // Very defensive fallback. Some sheet actions may pass nested data,
    // flattened data, or an actor-level embedded item update shape.
    const leaf = path.split(".").pop();
    try {
      return JSON.stringify(changes).includes(`"${leaf}"`);
    } catch (_err) {
      return false;
    }
  }

  function hasAnyRelevantChange(changes) {
    if (!changes) return false;

    const paths = [
      "system.equipped",
      "system.stashed",
      "system.handedness",
      "system.properties",
      "system.damage.oneHanded",
      "system.damage.twoHanded"
    ];

    return paths.some(path => hasChanged(changes, path));
  }

  function getChangedValue(changes, path, fallback) {
    if (!changes) return fallback;
    if (hasOwn(changes, path)) return changes[path];

    try {
      const value = foundry.utils.getProperty(changes, path);
      return value === undefined ? fallback : value;
    } catch (_err) {
      return fallback;
    }
  }

  function isTargetItem(item, proposed) {
    if (!item || !proposed?.item) return false;
    return item.id === proposed.item.id;
  }

  function getEffective(item, path, proposed, fallback = undefined) {
    if (isTargetItem(item, proposed) && hasChanged(proposed.changes, path)) {
      return getChangedValue(proposed.changes, path, fallback);
    }

    const value = getProperty(item, path);
    return value === undefined ? fallback : value;
  }

  function isOwnedActorItem(item) {
    return item?.parent?.documentName === "Actor";
  }

  function isEquipped(item, proposed = null) {
    return toBool(getEffective(item, "system.equipped", proposed, false));
  }

  function isStashed(item, proposed = null) {
    return toBool(getEffective(item, "system.stashed", proposed, false));
  }

  function itemType(item) {
    return String(item?.type ?? "").trim().toLowerCase();
  }

  function isWeapon(item) {
    return itemType(item) === "weapon";
  }

  function isArmor(item) {
    return itemType(item) === "armor";
  }

  function getEffectiveProperties(item, proposed = null) {
    const props = getEffective(item, "system.properties", proposed, item?.system?.properties ?? []);
    return Array.isArray(props) ? props : [];
  }

  function collectPropertyNames(item, proposed = null) {
    const names = [];

    const propertyNames = getEffective(item, "system.propertyNames", proposed, item?.system?.propertyNames);
    if (Array.isArray(propertyNames)) names.push(...propertyNames);

    const props = getEffectiveProperties(item, proposed);

    for (const prop of props) {
      if (!prop) continue;

      if (typeof prop === "string") {
        names.push(prop);

        try {
          const doc = fromUuidSync?.(prop);
          if (doc?.name) names.push(doc.name);
          if (doc?.slug) names.push(doc.slug);
        } catch (_err) {
          // Ignore UUID lookup failures.
        }

        continue;
      }

      if (typeof prop === "object") {
        if (prop.name) names.push(prop.name);
        if (prop.slug) names.push(prop.slug);
        if (prop.id) names.push(prop.id);
        if (prop._id) names.push(prop._id);
      }
    }

    return names.filter(Boolean);
  }

  function hasProperty(item, wantedNames, proposed = null) {
    const wanted = Array.isArray(wantedNames) ? wantedNames : [wantedNames];
    const wantedSet = new Set(wanted.map(normalize).filter(Boolean));
    if (!wantedSet.size) return false;

    // Use Shadowdark's own helper when there is no proposed in-flight change.
    if (!proposed && typeof item?.system?.hasProperty === "function") {
      for (const name of wanted) {
        try {
          if (item.system.hasProperty(name)) return true;
        } catch (_err) {
          // Continue to manual check.
        }
      }
    }

    const names = collectPropertyNames(item, proposed).map(normalize);
    return names.some(name => wantedSet.has(name));
  }

  function getHandedness(item, proposed = null) {
    return String(getEffective(item, "system.handedness", proposed, item?.system?.handedness ?? "") ?? "")
      .trim()
      .toLowerCase();
  }

  function hasOnlyTwoHandedDamage(item, proposed = null) {
    const oneHanded = String(getEffective(item, "system.damage.oneHanded", proposed, item?.system?.damage?.oneHanded ?? "") ?? "").trim();
    const twoHanded = String(getEffective(item, "system.damage.twoHanded", proposed, item?.system?.damage?.twoHanded ?? "") ?? "").trim();

    // This mirrors Shadowdark's WeaponSD default handedness rule.
    return oneHanded === "" && twoHanded !== "";
  }

  function isTwoHandedWeapon(item, proposed = null) {
    if (!isWeapon(item)) return false;

    const handedness = normalize(getHandedness(item, proposed));

    if (["2h", "2hand", "2hands", "twohand", "twohands", "twohanded"].includes(handedness)) {
      return true;
    }

    if (hasProperty(item, ["two-handed", "two handed", "twohanded"], proposed)) {
      return true;
    }

    if (hasOnlyTwoHandedDamage(item, proposed)) {
      return true;
    }

    return false;
  }

  function isOneHandedWeapon(item, proposed = null) {
    if (!isWeapon(item)) return false;
    return !isTwoHandedWeapon(item, proposed);
  }

  function itemNameLooksLikeShield(item) {
    return /\bshield\b/i.test(String(item?.name ?? ""));
  }

  function isShield(item, proposed = null) {
    if (!item) return false;

    const systemShield = getEffective(item, "system.isAShield", proposed, item?.system?.isAShield);
    if (systemShield === true) return true;

    if (isArmor(item) && hasProperty(item, ["shield"], proposed)) return true;

    // Fallback for imported/custom shield items that lost the property UUID.
    return isArmor(item) && itemNameLooksLikeShield(item);
  }

  function occupiesOneHand(item, proposed = null) {
    return hasProperty(item, [
      "occupies one hand",
      "occupies-one-hand",
      "occupiesonehand"
    ], proposed);
  }

  function getItemHandUse(item, proposed = null) {
    if (!item) return null;
    if (!isEquipped(item, proposed)) return null;
    if (ignoreStashedItems() && isStashed(item, proposed)) return null;

    if (isWeapon(item)) {
      const hands = isTwoHandedWeapon(item, proposed) ? 2 : 1;
      return {
        item,
        id: item.id,
        name: item.name,
        type: item.type,
        category: hands === 2 ? "two-handed weapon" : "one-handed weapon",
        hands,
        isWeapon: true,
        isShield: false,
        isTwoHanded: hands === 2
      };
    }

    if (isShield(item, proposed)) {
      return {
        item,
        id: item.id,
        name: item.name,
        type: item.type,
        category: "shield",
        hands: 1,
        isWeapon: false,
        isShield: true,
        isTwoHanded: false
      };
    }

    if (occupiesOneHand(item, proposed)) {
      return {
        item,
        id: item.id,
        name: item.name,
        type: item.type,
        category: "hand item",
        hands: 1,
        isWeapon: false,
        isShield: false,
        isTwoHanded: false
      };
    }

    return null;
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

    if (once) {
      const sig = reportSignature(report);
      if (report.actor?.[LAST_WARNING_KEY] === sig) return;
      if (report.actor) report.actor[LAST_WARNING_KEY] = sig;
    }

    ui.notifications?.warn?.(message);
  }

  function shouldCheckUpdate(item, changes) {
    if (!isOwnedActorItem(item)) return false;
    return hasAnyRelevantChange(changes);
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

    if (actor[CHECK_TIMEOUT_KEY]) window.clearTimeout(actor[CHECK_TIMEOUT_KEY]);

    actor[CHECK_TIMEOUT_KEY] = window.setTimeout(() => {
      actor[CHECK_TIMEOUT_KEY] = null;
      log("scheduled check", reason, actor.name);
      checkActorHands(actor, { notify: true, mode: MODE_WARN, once });
    }, delay);
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
      if (!hasAnyRelevantChange(changes)) return;

      scheduleActorCheck(item.parent, { reason: "updateItem", once: true });
    } catch (err) {
      warn("updateItem error", err);
    }
  });

  // Fallback for sheets/systems that update embedded item data through actor-level changes.
  Hooks.on("updateActor", (actor, changes) => {
    try {
      if (!isEnabled()) return;
      if (game.system?.id !== "shadowdark") return;
      if (!canCheckActor(actor)) return;
      if (!hasAnyRelevantChange(changes)) return;

      scheduleActorCheck(actor, { reason: "updateActor", once: true });
    } catch (err) {
      warn("updateActor error", err);
    }
  });

  // Fallback for UI-driven equip buttons: after the sheet re-renders, check final state.
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
