const MODULE_ID = "mk-shadowdark";
const SETTING_KEY = "gmScreenPresentationPreferences";
const WORKSPACES = Object.freeze([
  "overview",
  "exploration",
  "combat",
  "downtime",
  "tables",
  "session-log",
]);
const DEFAULT_PREFERENCES = Object.freeze({
  groupActorUuid: "",
  workspace: "overview",
  partyRailCollapsed: false,
});

function normalizeWorkspace(value) {
  const rawWorkspace = String(value ?? "overview").trim().toLowerCase();
  const workspace = rawWorkspace === "resting" ? "downtime" : rawWorkspace;
  return WORKSPACES.includes(workspace) ? workspace : "overview";
}

function normalizePreferences(value) {
  let source = value;
  if (typeof value === "string") {
    try {
      source = JSON.parse(value || "{}");
    } catch (_error) {
      source = {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) source = {};

  return {
    groupActorUuid: String(source.groupActorUuid ?? ""),
    workspace: normalizeWorkspace(source.workspace),
    partyRailCollapsed: source.partyRailCollapsed === true,
  };
}

function settingRegistered() {
  return globalThis.game?.settings?.settings?.has?.(`${MODULE_ID}.${SETTING_KEY}`) ?? false;
}

function getGmScreenPresentationPreferences() {
  try {
    if (!settingRegistered()) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(globalThis.game.settings.get(MODULE_ID, SETTING_KEY));
  } catch (_error) {
    return { ...DEFAULT_PREFERENCES };
  }
}

async function setGmScreenPresentationPreferences(value) {
  const next = normalizePreferences(value);
  if (!globalThis.game?.user?.isGM || !settingRegistered()) return next;
  await globalThis.game.settings.set(MODULE_ID, SETTING_KEY, JSON.stringify(next));
  return next;
}

async function patchGmScreenPresentationPreferences(patch = {}) {
  const current = getGmScreenPresentationPreferences();
  return setGmScreenPresentationPreferences({
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
  });
}

async function resetGmScreenPresentationPreferences() {
  return setGmScreenPresentationPreferences(DEFAULT_PREFERENCES);
}

function registerGmScreenPresentationPreferences() {
  globalThis.Hooks?.once?.("init", () => {
    globalThis.game?.settings?.register?.(MODULE_ID, SETTING_KEY, {
      name: "GM Screen Presentation Preferences",
      hint: "Client-only presentation state for the MK-Shadowdark GM Screen.",
      scope: "client",
      config: false,
      type: String,
      default: JSON.stringify(DEFAULT_PREFERENCES),
    });
  });
}

registerGmScreenPresentationPreferences();

export {
  MODULE_ID,
  SETTING_KEY,
  WORKSPACES,
  DEFAULT_PREFERENCES,
  normalizeWorkspace,
  normalizePreferences,
  getGmScreenPresentationPreferences,
  setGmScreenPresentationPreferences,
  patchGmScreenPresentationPreferences,
  resetGmScreenPresentationPreferences,
  registerGmScreenPresentationPreferences,
};
