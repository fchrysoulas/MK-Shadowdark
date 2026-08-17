export const MORALE_MIGRATION_SETTING = "moraleMigrationVersion";
export const MORALE_MIGRATION_VERSION = 1;

export function needsMoraleMigration(storedVersion) {
  const version = Number(storedVersion);
  const normalized = Number.isFinite(version) ? Math.max(0, Math.floor(version)) : 0;
  return normalized < MORALE_MIGRATION_VERSION;
}

export function hasLegacyTokenMoraleImmunity(value) {
  return Boolean(value && typeof value === "object" && value.immune === true);
}

export function hasLegacyTokenMoraleImmunityField(value) {
  return Boolean(
    value
    && typeof value === "object"
    && Object.prototype.hasOwnProperty.call(value, "immune")
  );
}

export function withoutLegacyTokenMoraleImmunity(value) {
  if (!value || typeof value !== "object") return {};
  const next = { ...value };
  delete next.immune;
  return next;
}
