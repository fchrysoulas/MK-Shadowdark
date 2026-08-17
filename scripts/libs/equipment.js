export const EQUIPMENT_CLASSIFICATION_PATHS = Object.freeze([
  "system.equipped",
  "system.stashed",
  "system.handedness",
  "system.properties",
  "system.propertyNames",
  "system.isAShield",
  "system.damage.oneHanded",
  "system.damage.twoHanded"
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function toEquipmentBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

function getProperty(object, path) {
  if (!object) return undefined;
  if (hasOwn(object, path)) return object[path];

  try {
    const value = globalThis.foundry?.utils?.getProperty?.(object, path);
    if (value !== undefined) return value;
  } catch (_error) {
    // Fall through to the plain-object path reader.
  }

  return String(path).split(".").reduce((current, key) => current?.[key], object);
}

export function hasEquipmentPathChange(changes, path) {
  if (!changes) return false;
  if (hasOwn(changes, path)) return true;

  try {
    if (globalThis.foundry?.utils?.hasProperty?.(changes, path)) return true;
  } catch (_error) {
    // Fall through to the plain-object path check.
  }

  const parts = String(path).split(".");
  let current = changes;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !hasOwn(current, part)) return false;
    current = current[part];
  }

  return true;
}

export function equipmentChangeTouchesClassification(changes) {
  return EQUIPMENT_CLASSIFICATION_PATHS.some(path => hasEquipmentPathChange(changes, path));
}

function changedValue(changes, path, fallback) {
  if (!changes) return fallback;
  if (hasOwn(changes, path)) return changes[path];
  const value = getProperty(changes, path);
  return value === undefined ? fallback : value;
}

function isTargetItem(item, proposed) {
  return Boolean(item?.id && proposed?.item?.id && item.id === proposed.item.id);
}

function effectiveValue(item, path, proposed, fallback = undefined) {
  if (isTargetItem(item, proposed) && hasEquipmentPathChange(proposed.changes, path)) {
    return changedValue(proposed.changes, path, fallback);
  }

  const value = getProperty(item, path);
  return value === undefined ? fallback : value;
}

export function isEquipped(item, proposed = null) {
  return toEquipmentBoolean(effectiveValue(item, "system.equipped", proposed, false));
}

export function isStashed(item, proposed = null) {
  return toEquipmentBoolean(effectiveValue(item, "system.stashed", proposed, false));
}

export function itemType(item) {
  return String(item?.type ?? "").trim().toLowerCase();
}

export function isWeapon(item) {
  return itemType(item) === "weapon";
}

export function isArmor(item) {
  return itemType(item) === "armor";
}

function effectiveProperties(item, proposed = null) {
  const properties = effectiveValue(item, "system.properties", proposed, item?.system?.properties ?? []);
  return Array.isArray(properties) ? properties : [];
}

export function collectPropertyNames(item, proposed = null) {
  const names = [];
  const propertyNames = effectiveValue(item, "system.propertyNames", proposed, item?.system?.propertyNames);
  if (Array.isArray(propertyNames)) names.push(...propertyNames);

  for (const property of effectiveProperties(item, proposed)) {
    if (!property) continue;

    if (typeof property === "string") {
      names.push(property);
      try {
        const document = globalThis.fromUuidSync?.(property);
        if (document?.name) names.push(document.name);
        if (document?.slug) names.push(document.slug);
      } catch (_error) {
        // Broken or unavailable property UUIDs are handled by the stored value.
      }
      continue;
    }

    if (typeof property === "object") {
      if (property.name) names.push(property.name);
      if (property.slug) names.push(property.slug);
      if (property.id) names.push(property.id);
      if (property._id) names.push(property._id);
    }
  }

  return names.filter(Boolean);
}

export function hasProperty(item, wantedNames, proposed = null) {
  const wanted = Array.isArray(wantedNames) ? wantedNames : [wantedNames];
  const wantedSet = new Set(wanted.map(normalize).filter(Boolean));
  if (!wantedSet.size) return false;

  if (!proposed && typeof item?.system?.hasProperty === "function") {
    for (const name of wanted) {
      try {
        if (item.system.hasProperty(name)) return true;
      } catch (_error) {
        // Continue to the normalized property-name fallback.
      }
    }
  }

  return collectPropertyNames(item, proposed)
    .map(normalize)
    .some(name => wantedSet.has(name));
}

export function getHandedness(item, proposed = null) {
  return String(effectiveValue(item, "system.handedness", proposed, item?.system?.handedness ?? "") ?? "")
    .trim()
    .toLowerCase();
}

function hasOnlyTwoHandedDamage(item, proposed = null) {
  const oneHanded = String(effectiveValue(
    item,
    "system.damage.oneHanded",
    proposed,
    item?.system?.damage?.oneHanded ?? ""
  ) ?? "").trim();
  const twoHanded = String(effectiveValue(
    item,
    "system.damage.twoHanded",
    proposed,
    item?.system?.damage?.twoHanded ?? ""
  ) ?? "").trim();

  return oneHanded === "" && twoHanded !== "";
}

export function isTwoHandedWeapon(item, proposed = null) {
  if (!isWeapon(item)) return false;

  const handedness = normalize(getHandedness(item, proposed));
  if (["2h", "2hand", "2hands", "twohand", "twohands", "twohanded"].includes(handedness)) {
    return true;
  }

  if (hasProperty(item, ["two-handed", "two handed", "twohanded"], proposed)) return true;
  return hasOnlyTwoHandedDamage(item, proposed);
}

export function isOneHandedWeapon(item, proposed = null) {
  return isWeapon(item) && !isTwoHandedWeapon(item, proposed);
}

function itemNameLooksLikeShield(item) {
  return /\bshield\b/i.test(String(item?.name ?? ""));
}

export function isShield(item, proposed = null) {
  if (!item) return false;

  const systemShield = effectiveValue(item, "system.isAShield", proposed, item?.system?.isAShield);
  if (systemShield === true) return true;
  if (isArmor(item) && hasProperty(item, ["shield"], proposed)) return true;

  // Preserve support for imported/custom shield items that lost the property UUID.
  return isArmor(item) && itemNameLooksLikeShield(item);
}

export function occupiesOneHand(item, proposed = null) {
  return hasProperty(item, [
    "occupies one hand",
    "occupies-one-hand",
    "occupiesonehand"
  ], proposed);
}

export function getItemHandUse(item, proposed = null, { ignoreStashed = true } = {}) {
  if (!item || !isEquipped(item, proposed)) return null;
  if (ignoreStashed && isStashed(item, proposed)) return null;

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
