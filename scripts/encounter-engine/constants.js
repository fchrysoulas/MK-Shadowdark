import {
  DEFAULT_ENVIRONMENT_PROFILES,
  ENVIRONMENT_DEFAULT_PROFILE_ID,
  ENVIRONMENT_PROFILE_SCHEMA,
  ENVIRONMENT_SCENE_FLAG,
  ENVIRONMENT_SETTINGS,
} from "../libs/environment-context.js";

export const MODULE_ID = "mk-shadowdark";
export const SUBMODULE = "EncounterEngine";
export const CHAT_FLAG = "encounterEngine";
export const SCENE_FLAG = ENVIRONMENT_SCENE_FLAG;
export const WRAPPED_TIME_PASSES = Symbol.for("mk-shadowdark.encounter-engine.time-passes-wrapped");
export const CARD_SELECTOR = ".mk-sd-encounter-card";

export const SETTINGS = Object.freeze({
  enabled: "encounterEngineEnabled",
  autoTimePasses: "encounterEngineAutoTimePasses",
  defaultTable: ENVIRONMENT_SETTINGS.defaultTable,
  profiles: ENVIRONMENT_SETTINGS.profiles,
  whisper: "encounterEngineWhisperToGm",
  showDice3d: "encounterEngineShowDice3d",
  defaultProfile: ENVIRONMENT_SETTINGS.defaultProfile,
});

export const DEFAULT_PROFILE_ID = ENVIRONMENT_DEFAULT_PROFILE_ID;
export const PROFILE_SCHEMA = ENVIRONMENT_PROFILE_SCHEMA;
export const DEFAULT_PROFILES = DEFAULT_ENVIRONMENT_PROFILES;
