function isCorpseLifecycleActive({
  applied,
  hasStoredData,
  matchesCorpseAppearance
} = {}) {
  if (!hasStoredData) return false;
  if (applied !== undefined && applied !== null) return applied === true;
  return Boolean(matchesCorpseAppearance);
}

export { isCorpseLifecycleActive };
