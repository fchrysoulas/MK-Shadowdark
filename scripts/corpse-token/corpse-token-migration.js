const CORPSE_TOKEN_MIGRATION_VERSION = 1;

function asPlainFlagData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...value };
}

function buildMigratedCorpseFlagData({
  current,
  worldLegacy,
  moduleLegacy
} = {}) {
  const currentData = asPlainFlagData(current);
  const worldData = asPlainFlagData(worldLegacy);
  const moduleData = asPlainFlagData(moduleLegacy);
  const hasLegacy = Object.keys(worldData).length > 0 || Object.keys(moduleData).length > 0;

  return {
    hasLegacy,
    data: {
      ...moduleData,
      ...worldData,
      ...currentData
    }
  };
}

export {
  CORPSE_TOKEN_MIGRATION_VERSION,
  buildMigratedCorpseFlagData
};
