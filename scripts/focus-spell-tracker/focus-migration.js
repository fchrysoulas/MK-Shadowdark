function hasValue(value) {
  return value !== undefined && value !== null;
}

function planLegacyFocusMigration({
  currentState,
  legacyState,
  currentCapacity,
  legacyCapacity
} = {}) {
  const hasLegacyState = hasValue(legacyState);
  const hasLegacyCapacity = hasValue(legacyCapacity);

  return {
    hasLegacy: hasLegacyState || hasLegacyCapacity,
    stateToWrite: !hasValue(currentState) && hasLegacyState ? legacyState : undefined,
    capacityToWrite: !hasValue(currentCapacity) && hasLegacyCapacity ? legacyCapacity : undefined,
    removeLegacyState: hasLegacyState,
    removeLegacyCapacity: hasLegacyCapacity
  };
}

export { planLegacyFocusMigration };
