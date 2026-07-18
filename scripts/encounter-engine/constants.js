export const MODULE_ID = "mk-shadowdark";
export const SUBMODULE = "EncounterEngine";
export const CHAT_FLAG = "encounterEngine";
export const SCENE_FLAG = "encounterContext";
export const WRAPPED_TIME_PASSES = Symbol.for("mk-shadowdark.encounter-engine.time-passes-wrapped");
export const CARD_SELECTOR = ".mk-sd-encounter-card";

export const SETTINGS = Object.freeze({
  enabled: "encounterEngineEnabled",
  autoTimePasses: "encounterEngineAutoTimePasses",
  defaultTable: "encounterEngineDefaultTableUuid",
  profiles: "encounterEngineProfiles",
  whisper: "encounterEngineWhisperToGm",
  showDice3d: "encounterEngineShowDice3d",
  defaultProfile: "encounterEngineDefaultProfile",
});

export const DEFAULT_PROFILE_ID = "default";
export const PROFILE_SCHEMA = 2;

export const DEFAULT_PROFILES = Object.freeze({
  default: {
    profileSchema: PROFILE_SCHEMA,
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
