const SPELL_EFFECT_UUID_PATTERN = /@UUID\[([^\]]+)\]/g;

function cloneData(value) {
  if (value === undefined || value === null) return value;

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function extractSpellEffectUuids(descriptions) {
  const values = Array.isArray(descriptions) ? descriptions : [descriptions];
  const uuids = [];

  for (const description of values) {
    if (typeof description !== "string") continue;

    SPELL_EFFECT_UUID_PATTERN.lastIndex = 0;
    for (const match of description.matchAll(SPELL_EFFECT_UUID_PATTERN)) {
      uuids.push(match[1]);
    }
  }

  return uniqueStrings(uuids);
}

export async function resolveSpellEffectItems(spell, resolver = globalThis.fromUuid) {
  if (!spell || typeof resolver !== "function") return [];

  const descriptions = [
    spell.system?.description,
    spell.system?.description?.value,
    spell.description
  ];
  const items = [];

  for (const uuid of extractSpellEffectUuids(descriptions)) {
    try {
      const item = await resolver(uuid);
      if (item?.type === "Effect") items.push(item);
    } catch (_error) {
      // A missing or inaccessible optional effect should not block other effects.
    }
  }

  return items;
}

export function spellTargetUuids(config) {
  if (Array.isArray(config?.targetUuids) && config.targetUuids.length) {
    return uniqueStrings(config.targetUuids);
  }

  return uniqueStrings([config?.targetUuid]);
}

export function captureSpellEffectLink(message, config) {
  const castId = message?.uuid ?? message?.id ?? null;
  if (!castId) return { castId: null, targetUuids: [] };

  return {
    castId: String(castId),
    targetUuids: spellTargetUuids(config)
  };
}

export function isSpellRollConfig(config) {
  const type = String(config?.type ?? "").trim().toLowerCase();
  return type === "spell" || Boolean(config?.cast?.spellUuid);
}

export function shouldApplySpellEffects(config, mainRoll, isFocusCheck = false) {
  return !isFocusCheck
    && isSpellRollConfig(config)
    && mainRoll?.success === true
    && mainRoll?.criticalFailure !== true;
}

export function buildTargetEffectItemData(sourceItem, {
  castId,
  sourceSpellUuid,
  moduleId = "mk-shadowdark"
} = {}) {
  const source = sourceItem?.toObject?.() ?? sourceItem;
  if (!source || typeof source !== "object" || source.type !== "Effect") return null;

  const data = cloneData(source);
  delete data._id;
  delete data.id;

  if (data.flags?.shadowdark && typeof data.flags.shadowdark === "object") {
    // ItemSD._preCreate writes a fresh start marker for the target copy.
    delete data.flags.shadowdark.start;
  }

  data.flags ??= {};
  data.flags[moduleId] = {
    ...(data.flags[moduleId] ?? {}),
    targetedSpellEffect: {
      castId: String(castId ?? ""),
      sourceSpellUuid: String(sourceSpellUuid ?? ""),
      sourceEffectUuid: String(sourceItem.uuid ?? source._id ?? source.id ?? "")
    }
  };

  if (Array.isArray(data.effects)) {
    data.effects = data.effects.map(effect => {
      const copy = cloneData(effect);
      delete copy._id;
      delete copy.id;
      return copy;
    });
  }

  return data;
}

export function targetedSpellEffectMarker(item, moduleId = "mk-shadowdark") {
  try {
    const marker = item?.getFlag?.(moduleId, "targetedSpellEffect");
    if (marker && typeof marker === "object") return marker;
  } catch (_error) {
    // Fall through to the raw document data used during create/update hooks.
  }

  return item?.flags?.[moduleId]?.targetedSpellEffect
    ?? item?._source?.flags?.[moduleId]?.targetedSpellEffect
    ?? null;
}

export function matchesTargetedSpellEffect(item, {
  castId,
  sourceSpellUuid = null
} = {}, moduleId = "mk-shadowdark") {
  const marker = targetedSpellEffectMarker(item, moduleId);
  if (!marker || marker.castId !== String(castId ?? "")) return false;
  if (sourceSpellUuid && marker.sourceSpellUuid !== String(sourceSpellUuid)) return false;
  return true;
}

export function hasTargetedSpellEffect(items, { castId, sourceEffectUuid }, moduleId = "mk-shadowdark") {
  const expectedCastId = String(castId ?? "");
  const expectedSourceUuid = String(sourceEffectUuid ?? "");

  return Array.from(items ?? []).some(item => {
    const marker = targetedSpellEffectMarker(item, moduleId);
    return marker?.castId === expectedCastId
      && marker?.sourceEffectUuid === expectedSourceUuid;
  });
}
