export const DAMAGE_TRAITS_MIGRATION_SETTING = "damageTraitsMigrationVersion";
export const DAMAGE_TRAITS_MIGRATION_VERSION = 1;
export const DAMAGE_TRAIT_MODES = Object.freeze([
  "resistance",
  "immunity",
  "vulnerability"
]);

const DAMAGE_TRAIT_MODE_SET = new Set(DAMAGE_TRAIT_MODES);

export function normalizeDamageTraitMode(entry) {
  const mode = String(entry?.mode ?? "").trim().toLowerCase();
  if (DAMAGE_TRAIT_MODE_SET.has(mode)) return mode;
  if (mode === "nonmagical-immunity") return "immunity";

  if (["%", "&"].includes(String(entry?.reduction ?? "").trim())) return "resistance";
  return null;
}

export function normalizeDamageTraitRecords(value) {
  if (!Array.isArray(value)) return [];

  const records = new Map();
  for (const entry of value) {
    const uuid = typeof entry === "string" ? entry : entry?.uuid;
    if (!uuid) continue;

    const mode = normalizeDamageTraitMode(typeof entry === "string" ? {} : entry);
    if (!mode) continue;

    records.set(String(uuid), {
      uuid: String(uuid),
      mode
    });
  }

  return [...records.values()];
}

export function needsDamageTraitsMigration(storedVersion) {
  const version = Number(storedVersion);
  const normalized = Number.isFinite(version) ? Math.max(0, Math.floor(version)) : 0;
  return normalized < DAMAGE_TRAITS_MIGRATION_VERSION;
}
