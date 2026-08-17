const MODULE_ID = "mk-shadowdark";

const ENVIRONMENT_SCENE_FLAG = "encounterContext";
const ENVIRONMENT_PROFILE_SCHEMA = 2;
const ENVIRONMENT_DEFAULT_PROFILE_ID = "default";
const ENVIRONMENT_CHANGED_HOOK = "mkShadowdarkEnvironmentChanged";

const ENVIRONMENT_SETTINGS = Object.freeze({
  defaultTable: "encounterEngineDefaultTableUuid",
  profiles: "encounterEngineProfiles",
  defaultProfile: "encounterEngineDefaultProfile",
});

const DEFAULT_ENVIRONMENT_PROFILES = Object.freeze({
  default: {
    profileSchema: ENVIRONMENT_PROFILE_SCHEMA,
    rulesMode: "shadowdark",
    name: "Shadowdark Core",
    dayStart: 6,
    nightStart: 18,
    defaultTerrain: "Default",
    defaultDangerLevel: "unsafe",
    defaultNumberAppearing: "1",
    terrains: {
      Default: {
        any: "",
        day: "",
        night: "",
      },
    },
    dangerLevels: {
      unsafe: { label: "Unsafe", interval: 3, formula: "1d6", encounterOn: [1] },
      risky: { label: "Risky", interval: 2, formula: "1d6", encounterOn: [1] },
      deadly: { label: "Deadly", interval: 1, formula: "1d6", encounterOn: [1] },
    },
    optionalProcedures: {
      intent: false,
      surpriseDice: false,
    },
    auxiliaryTables: {
      distance: "",
      activity: "",
      reaction: "",
      intent: "",
      treasure: "",
      surprise: "",
    },
    outcomes: {
      distance: {
        formula: "1d6",
        results: [
          { min: 1, max: 1, label: "Close" },
          { min: 2, max: 4, label: "Near" },
          { min: 5, max: 6, label: "Far" },
        ],
      },
      activity: {
        formula: "2d6",
        results: [
          { min: 2, max: 4, label: "Hunting" },
          { min: 5, max: 6, label: "Eating" },
          { min: 7, max: 8, label: "Building or nesting" },
          { min: 9, max: 10, label: "Socializing or playing" },
          { min: 11, max: 11, label: "Guarding" },
          { min: 12, max: 12, label: "Sleeping" },
        ],
      },
      reaction: {
        formula: "2d6",
        results: [
          { min: -99, max: 6, label: "Hostile", disposition: "hostile" },
          { min: 7, max: 8, label: "Suspicious", disposition: "neutral" },
          { min: 9, max: 9, label: "Neutral", disposition: "neutral" },
          { min: 10, max: 11, label: "Curious", disposition: "neutral" },
          { min: 12, max: 99, label: "Friendly", disposition: "friendly" },
        ],
      },
      intent: {
        formula: "1d8",
        results: [
          { min: 1, max: 1, label: "Drive the party away" },
          { min: 2, max: 2, label: "Observe from a safe position" },
          { min: 3, max: 3, label: "Protect territory or companions" },
          { min: 4, max: 4, label: "Pass without conflict" },
          { min: 5, max: 5, label: "Demand tribute or information" },
          { min: 6, max: 6, label: "Trade, bargain, or seek aid" },
          { min: 7, max: 7, label: "Lure the party elsewhere" },
          { min: 8, max: 8, label: "Exploit the party's distraction" },
        ],
      },
      treasure: {
        formula: "1d6",
        results: [
          { min: 1, max: 3, label: "No treasure", present: false },
          { min: 4, max: 6, label: "Treasure present", present: true },
        ],
      },
    },
    awareness: {
      default: "determine",
      options: {
        determine: "Determine during play",
        bothAware: "Both sides aware",
        partyUndetected: "Party undetected",
        creaturesUndetected: "Creatures undetected",
        neitherAware: "Neither side aware",
      },
    },
    surprise: {
      formula: "1d6",
      surprisedOn: [1],
    },
    morale: {
      dc: 15,
      ability: "wis",
    },
  },
});

function deepClone(value) {
  if (value === undefined || value === null) return value;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mergeObject(original, other) {
  if (globalThis.foundry?.utils?.mergeObject) {
    return foundry.utils.mergeObject(original, other, {
      inplace: false,
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true,
    });
  }

  const result = deepClone(original ?? {});
  for (const [key, value] of Object.entries(other ?? {})) {
    if (
      value
      && typeof value === "object"
      && !Array.isArray(value)
      && result[key]
      && typeof result[key] === "object"
      && !Array.isArray(result[key])
    ) {
      result[key] = mergeObject(result[key], value);
    } else {
      result[key] = deepClone(value);
    }
  }
  return result;
}

function slug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || ENVIRONMENT_DEFAULT_PROFILE_ID;
}

function settingExists(key) {
  return globalThis.game?.settings?.settings?.has?.(`${MODULE_ID}.${key}`) ?? false;
}

function setting(key, fallback) {
  try {
    if (!settingExists(key)) return fallback;
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = undefined) {
  if (!scene) return fallback;
  try {
    const current = scene.getFlag?.(MODULE_ID, key);
    return current === undefined ? rawSceneFlag(scene, key) ?? fallback : current;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function normalizeEnvironmentProfiles(rawValue) {
  let parsed = rawValue;
  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue || "{}");
    } catch (error) {
      console.warn(`${MODULE_ID} | Environment Context | Invalid profile JSON. Using defaults.`, error);
      parsed = {};
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};

  const normalized = {};
  const source = Object.keys(parsed).length ? parsed : DEFAULT_ENVIRONMENT_PROFILES;

  for (const [profileId, rawProfile] of Object.entries(source)) {
    const id = slug(profileId);
    let profileValue = rawProfile ?? {};

    const isLegacyDefault = id === ENVIRONMENT_DEFAULT_PROFILE_ID
      && Number(profileValue?.profileSchema ?? 1) < ENVIRONMENT_PROFILE_SCHEMA
      && String(profileValue?.name ?? "Default") === "Default";

    if (isLegacyDefault) {
      const preservedAuxiliary = deepClone(profileValue.auxiliaryTables ?? {});
      delete preservedAuxiliary.morale;
      profileValue = mergeObject(DEFAULT_ENVIRONMENT_PROFILES.default, {
        name: "Shadowdark Core",
        dayStart: profileValue.dayStart ?? DEFAULT_ENVIRONMENT_PROFILES.default.dayStart,
        nightStart: profileValue.nightStart ?? DEFAULT_ENVIRONMENT_PROFILES.default.nightStart,
        defaultTerrain: profileValue.defaultTerrain ?? DEFAULT_ENVIRONMENT_PROFILES.default.defaultTerrain,
        defaultNumberAppearing: profileValue.defaultNumberAppearing ?? DEFAULT_ENVIRONMENT_PROFILES.default.defaultNumberAppearing,
        terrains: deepClone(profileValue.terrains ?? DEFAULT_ENVIRONMENT_PROFILES.default.terrains),
        auxiliaryTables: preservedAuxiliary,
        outcomes: {
          intent: deepClone(profileValue.outcomes?.intent ?? DEFAULT_ENVIRONMENT_PROFILES.default.outcomes.intent),
        },
      });
    }

    normalized[id] = mergeObject(DEFAULT_ENVIRONMENT_PROFILES.default, profileValue);
    normalized[id].profileSchema = ENVIRONMENT_PROFILE_SCHEMA;
    normalized[id].name = String(profileValue?.name ?? profileId ?? "Shadowdark Core");
  }

  if (!Object.keys(normalized).length) {
    normalized[ENVIRONMENT_DEFAULT_PROFILE_ID] = deepClone(DEFAULT_ENVIRONMENT_PROFILES.default);
  }

  return normalized;
}

function getEnvironmentProfiles() {
  return normalizeEnvironmentProfiles(
    setting(
      ENVIRONMENT_SETTINGS.profiles,
      JSON.stringify(DEFAULT_ENVIRONMENT_PROFILES, null, 2)
    )
  );
}

function getDefaultEnvironmentProfileId(profiles = getEnvironmentProfiles()) {
  const requested = slug(setting(ENVIRONMENT_SETTINGS.defaultProfile, ENVIRONMENT_DEFAULT_PROFILE_ID));
  if (profiles[requested]) return requested;
  return Object.keys(profiles)[0] ?? ENVIRONMENT_DEFAULT_PROFILE_ID;
}

function getEnvironmentProfile(profileId, profiles = getEnvironmentProfiles()) {
  const fallbackId = getDefaultEnvironmentProfileId(profiles);
  const requested = slug(profileId || fallbackId);
  const id = profiles[requested] ? requested : fallbackId;

  return {
    id,
    data: profiles[id] ?? deepClone(DEFAULT_ENVIRONMENT_PROFILES.default),
  };
}

function worldHour(worldTime = Number(globalThis.game?.time?.worldTime ?? 0)) {
  const secondsInDay = 24 * 60 * 60;
  const normalized = ((Number(worldTime || 0) % secondsInDay) + secondsInDay) % secondsInDay;
  return Math.floor(normalized / 3600);
}

function determineEnvironmentPeriod(profile, requestedPeriod = "auto", worldTime = undefined) {
  if (["day", "night"].includes(requestedPeriod)) return requestedPeriod;

  const hour = worldHour(worldTime);
  const dayStart = Number(profile?.dayStart ?? 6);
  const nightStart = Number(profile?.nightStart ?? 18);

  if (dayStart === nightStart) return "day";
  if (dayStart < nightStart) return hour >= dayStart && hour < nightStart ? "day" : "night";
  return hour >= dayStart || hour < nightStart ? "day" : "night";
}

function normalizeSceneEnvironmentContext(rawContext, profiles = getEnvironmentProfiles()) {
  const stored = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext)
    ? rawContext
    : {};
  const fallbackProfileId = getDefaultEnvironmentProfileId(profiles);
  const requestedProfileId = slug(stored.profileId);
  const profileId = profiles[requestedProfileId] ? requestedProfileId : fallbackProfileId;
  const profile = profiles[profileId] ?? DEFAULT_ENVIRONMENT_PROFILES.default;
  const requestedDanger = String(stored.dangerLevel ?? profile.defaultDangerLevel ?? "unsafe");
  const dangerLevel = profile.dangerLevels?.[requestedDanger]
    ? requestedDanger
    : String(profile.defaultDangerLevel ?? "unsafe");

  return {
    profileId,
    terrain: String(
      stored.terrain
      ?? profile.defaultTerrain
      ?? Object.keys(profile.terrains ?? {})[0]
      ?? "Default"
    ),
    dangerLevel,
    period: ["auto", "day", "night"].includes(stored.period) ? stored.period : "auto",
    tableUuid: String(stored.tableUuid ?? ""),
  };
}

function getSceneEnvironmentContext(scene = currentScene()) {
  const profiles = getEnvironmentProfiles();
  const stored = getSceneFlag(scene, ENVIRONMENT_SCENE_FLAG, {}) ?? {};
  return normalizeSceneEnvironmentContext(stored, profiles);
}

function terrainNames(profile) {
  const names = Object.keys(profile?.terrains ?? {});
  if (profile?.defaultTerrain && !names.includes(profile.defaultTerrain)) names.unshift(profile.defaultTerrain);
  return names.length ? names : ["Default"];
}

function tableUuidForEnvironmentContext(profile, terrain, period, explicitUuid = "") {
  if (explicitUuid) return explicitUuid;

  const terrainData = profile?.terrains?.[terrain]
    ?? profile?.terrains?.[profile?.defaultTerrain]
    ?? {};

  return String(
    terrainData?.[period]
    || terrainData?.any
    || setting(ENVIRONMENT_SETTINGS.defaultTable, "")
    || ""
  );
}

function normalizeDangerDefinition(profile, dangerLevel) {
  const source = profile?.dangerLevels?.[dangerLevel]
    ?? DEFAULT_ENVIRONMENT_PROFILES.default.dangerLevels.unsafe;
  const encounterOn = Array.isArray(source?.encounterOn)
    ? [...new Set(source.encounterOn.map(Number).filter(Number.isFinite))]
    : [1];

  return {
    id: dangerLevel,
    label: String(source?.label ?? dangerLevel),
    interval: Math.max(1, Math.floor(Number(source?.interval ?? 1) || 1)),
    formula: String(source?.formula ?? "1d6"),
    encounterOn: encounterOn.length ? encounterOn : [1],
  };
}

function resolveEnvironmentContext(rawContext, {
  scene = null,
  profiles = getEnvironmentProfiles(),
  worldTime = undefined,
} = {}) {
  const context = normalizeSceneEnvironmentContext(rawContext, profiles);
  const profileRef = getEnvironmentProfile(context.profileId, profiles);
  const resolvedPeriod = determineEnvironmentPeriod(profileRef.data, context.period, worldTime);
  const danger = normalizeDangerDefinition(profileRef.data, context.dangerLevel);
  const effectiveTableUuid = tableUuidForEnvironmentContext(
    profileRef.data,
    context.terrain,
    resolvedPeriod,
    context.tableUuid
  );

  return {
    sceneId: String(scene?.id ?? ""),
    sceneUuid: String(scene?.uuid ?? ""),
    sceneName: String(scene?.name ?? ""),
    profileId: profileRef.id,
    profile: profileRef.data,
    terrain: context.terrain,
    dangerLevel: context.dangerLevel,
    danger,
    requestedPeriod: context.period,
    period: resolvedPeriod,
    explicitTableUuid: context.tableUuid,
    tableUuid: effectiveTableUuid,
    encounter: {
      interval: danger.interval,
      formula: danger.formula,
      encounterOn: [...danger.encounterOn],
    },
  };
}

function resolveSceneEnvironmentContext(scene = currentScene(), options = {}) {
  return resolveEnvironmentContext(getSceneEnvironmentContext(scene), {
    ...options,
    scene,
  });
}

async function setSceneEnvironmentContext(context, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change the Scene environment context.");
    return null;
  }

  const profiles = getEnvironmentProfiles();
  const normalized = normalizeSceneEnvironmentContext(context, profiles);
  await scene.setFlag(MODULE_ID, ENVIRONMENT_SCENE_FLAG, normalized);
  return normalized;
}

function exposeEnvironmentContextApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.environment = {
    sceneFlag: ENVIRONMENT_SCENE_FLAG,
    changedHook: ENVIRONMENT_CHANGED_HOOK,
    getProfiles: getEnvironmentProfiles,
    getProfile: getEnvironmentProfile,
    getSceneContext: getSceneEnvironmentContext,
    resolveSceneContext: resolveSceneEnvironmentContext,
    setSceneContext: setSceneEnvironmentContext,
  };

  return module.api.environment;
}

function isActiveScene(scene) {
  const active = currentScene();
  if (!active || !scene) return false;
  return active === scene || active.id === scene.id || active.uuid === scene.uuid;
}

function environmentFlagChanged(changes) {
  if (!changes || typeof changes !== "object") return false;
  const directKey = `flags.${MODULE_ID}.${ENVIRONMENT_SCENE_FLAG}`;
  if (Object.prototype.hasOwnProperty.call(changes, directKey)) return true;

  const moduleFlags = changes.flags?.[MODULE_ID];
  return Boolean(
    moduleFlags
    && typeof moduleFlags === "object"
    && Object.prototype.hasOwnProperty.call(moduleFlags, ENVIRONMENT_SCENE_FLAG)
  );
}

function emitEnvironmentChanged(scene) {
  const context = resolveSceneEnvironmentContext(scene);
  globalThis.Hooks?.callAll?.(ENVIRONMENT_CHANGED_HOOK, scene, context);
  return context;
}

function registerEnvironmentContextService() {
  globalThis.Hooks?.once?.("ready", () => {
    exposeEnvironmentContextApi();
  });

  globalThis.Hooks?.on?.("canvasReady", canvas => {
    const scene = canvas?.scene ?? currentScene();
    if (scene) emitEnvironmentChanged(scene);
  });

  globalThis.Hooks?.on?.("updateScene", (scene, changes) => {
    if (!isActiveScene(scene) || !environmentFlagChanged(changes)) return;
    emitEnvironmentChanged(scene);
  });
}

export {
  MODULE_ID,
  ENVIRONMENT_SCENE_FLAG,
  ENVIRONMENT_PROFILE_SCHEMA,
  ENVIRONMENT_DEFAULT_PROFILE_ID,
  ENVIRONMENT_CHANGED_HOOK,
  ENVIRONMENT_SETTINGS,
  DEFAULT_ENVIRONMENT_PROFILES,
  normalizeEnvironmentProfiles,
  getEnvironmentProfiles,
  getDefaultEnvironmentProfileId,
  getEnvironmentProfile,
  determineEnvironmentPeriod,
  normalizeSceneEnvironmentContext,
  getSceneEnvironmentContext,
  terrainNames,
  tableUuidForEnvironmentContext,
  normalizeDangerDefinition,
  resolveEnvironmentContext,
  resolveSceneEnvironmentContext,
  setSceneEnvironmentContext,
  exposeEnvironmentContextApi,
  environmentFlagChanged,
  emitEnvironmentChanged,
  registerEnvironmentContextService,
};
