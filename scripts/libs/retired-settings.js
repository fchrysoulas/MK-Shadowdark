const MODULE_ID = "mk-shadowdark";
const RETIRED_SETTINGS = Object.freeze([
  "autoDamageGMOnly"
]);

function retireSetting(moduleId, key) {
  const settings = globalThis.game?.settings;
  if (!settings) return false;

  const fullKey = `${moduleId}.${key}`;
  let removed = false;

  if (typeof settings.unregister === "function") {
    try {
      settings.unregister(moduleId, key);
      removed = true;
    } catch (_error) {
      // Fall back to removing only the runtime registration below.
    }
  }

  if (settings.settings?.has?.(fullKey)) {
    settings.settings.delete(fullKey);
    removed = true;
  }

  return removed;
}

function retireLegacySettings() {
  for (const key of RETIRED_SETTINGS) retireSetting(MODULE_ID, key);
}

globalThis.Hooks?.once?.("init", retireLegacySettings);

export {
  RETIRED_SETTINGS,
  retireLegacySettings,
  retireSetting
};
