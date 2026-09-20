const SPELL_DAMAGE_TYPES = new Set(["damage", "healing", "none"]);

export function getShadowdarkRollConfig(message) {
  if (message?.rollConfig && typeof message.rollConfig === "object") {
    return message.rollConfig;
  }

  try {
    const flagged = message?.getFlag?.("shadowdark", "rollConfig");
    if (flagged && typeof flagged === "object") return flagged;
  } catch (_error) {
    // Fall through to the source flags used while a ChatMessage is being created.
  }

  return message?.flags?.shadowdark?.rollConfig
    ?? message?._source?.flags?.shadowdark?.rollConfig
    ?? null;
}

export function getShadowdarkRoll(message, type) {
  try {
    if (typeof message?.getRoll === "function") {
      const roll = message.getRoll(type);
      if (roll) return roll;
    }
  } catch (_error) {
    // Fall through to the persisted roll collection.
  }

  return Array.from(message?.rolls ?? [])
    .find(roll => roll?.options?.type === type) ?? null;
}

export function hasShadowdarkDamageApplied(message) {
  try {
    if (message?.getFlag?.("shadowdark", "damageApplied") === true) return true;
  } catch (_error) {
    // Fall through to raw source data.
  }

  return message?.flags?.shadowdark?.damageApplied === true
    || message?._source?.flags?.shadowdark?.damageApplied === true;
}

export function extractNativeDamage(message) {
  const mainRoll = getShadowdarkRoll(message, "main");
  const damageRoll = getShadowdarkRoll(message, "damage");
  const total = Number(damageRoll?.total);
  const damage = Number.isFinite(total) && total >= 0 ? total : null;
  const outcome = mainRoll?.success === true
    ? "success"
    : mainRoll?.success === false
      ? "failure"
      : null;
  const critical = mainRoll?.criticalSuccess === true;

  return {
    damage,
    outcome,
    critical,
    debug: {
      damage,
      outcome,
      critical,
      damageSource: damage === null ? null : "shadowdark-native-damage-roll",
      hasMainRoll: Boolean(mainRoll),
      hasDamageRoll: Boolean(damageRoll)
    }
  };
}

export function normalizeSpellDamageType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SPELL_DAMAGE_TYPES.has(normalized) ? normalized : null;
}

export async function resolveAutoDamageOperation(message, resolveUuid = globalThis.fromUuid) {
  const rollConfig = getShadowdarkRollConfig(message);
  const configuredType = normalizeSpellDamageType(rollConfig?.cast?.damageType);

  if (configuredType) return configuredType === "none" ? null : configuredType;

  const isSpell = rollConfig?.type === "spell" || Boolean(rollConfig?.cast?.spellUuid);
  if (!isSpell) return "damage";

  const spellUuid = rollConfig?.cast?.spellUuid ?? rollConfig?.itemUuid;
  if (spellUuid && typeof resolveUuid === "function") {
    try {
      const spell = await resolveUuid(spellUuid);
      const itemType = normalizeSpellDamageType(spell?.system?.damageType);
      if (itemType) return itemType === "none" ? null : itemType;
    } catch (_error) {
      // Preserve historical damage behavior if an old chat message references a missing spell.
    }
  }

  return "damage";
}

export function calculateHpChange(currentHP, maxHP, amount, operation) {
  const current = Number(currentHP);
  const rolledAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const maximum = Number(maxHP);
  const upperBound = maxHP === null || maxHP === undefined || maxHP === ""
    ? Infinity
    : Number.isFinite(maximum)
      ? maximum
      : Infinity;
  const rawHP = operation === "healing"
    ? current + rolledAmount
    : current - rolledAmount;
  const newHP = Math.min(Math.max(0, rawHP), upperBound);

  if (operation === "healing") {
    return {
      newHP,
      appliedAmount: Math.max(0, newHP - current)
    };
  }

  return {
    newHP,
    appliedAmount: Math.max(0, current - newHP)
  };
}
