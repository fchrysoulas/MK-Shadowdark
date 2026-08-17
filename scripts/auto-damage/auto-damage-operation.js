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
  const rolledAmount = Math.max(0, Number(amount) || 0);

  if (operation === "healing") {
    const maximum = Number(maxHP);
    const upperBound = Number.isFinite(maximum) ? Math.max(current, maximum) : Infinity;
    const newHP = Math.min(upperBound, current + rolledAmount);
    return {
      newHP,
      appliedAmount: Math.max(0, newHP - current)
    };
  }

  const newHP = Math.max(0, current - rolledAmount);
  return {
    newHP,
    appliedAmount: Math.max(0, current - newHP)
  };
}
