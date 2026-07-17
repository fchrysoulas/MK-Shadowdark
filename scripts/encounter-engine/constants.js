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

export const DEFAULT_PROFILES = Object.freeze({
  default: {
    name: "Default",
    dayStart: 6,
    nightStart: 18,
    defaultTerrain: "Default",
    defaultNumberAppearing: "1",
    defaultMorale: 7,
    terrains: {
      Default: {
        any: "",
        day: "",
        night: "",
      },
    },
    auxiliaryTables: {
      distance: "",
      activity: "",
      reaction: "",
      intent: "",
      morale: "",
      surprise: "",
    },
    outcomes: {
      distance: {
        formula: "1d6",
        results: [
          { min: 1, max: 2, label: "Close" },
          { min: 3, max: 5, label: "Near" },
          { min: 6, max: 6, label: "Far" },
        ],
      },
      activity: {
        formula: "1d12",
        results: [
          { min: 1, max: 1, label: "Resting or recovering" },
          { min: 2, max: 2, label: "Searching the area" },
          { min: 3, max: 3, label: "Hunting or tracking prey" },
          { min: 4, max: 4, label: "Guarding territory" },
          { min: 5, max: 5, label: "Traveling with purpose" },
          { min: 6, max: 6, label: "Foraging or scavenging" },
          { min: 7, max: 7, label: "Investigating a disturbance" },
          { min: 8, max: 8, label: "Hiding from another threat" },
          { min: 9, max: 9, label: "Arguing or reorganizing" },
          { min: 10, max: 10, label: "Preparing an ambush" },
          { min: 11, max: 11, label: "Carrying loot or a captive" },
          { min: 12, max: 12, label: "Wounded and seeking safety" },
        ],
      },
      reaction: {
        formula: "2d6",
        results: [
          { min: 2, max: 2, label: "Attacks immediately", disposition: "hostile" },
          { min: 3, max: 5, label: "Hostile", disposition: "hostile" },
          { min: 6, max: 8, label: "Suspicious", disposition: "neutral" },
          { min: 9, max: 9, label: "Neutral", disposition: "neutral" },
          { min: 10, max: 11, label: "Curious", disposition: "neutral" },
          { min: 12, max: 12, label: "Friendly", disposition: "friendly" },
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
      morale: {
        formula: "1d4+5",
        results: [],
      },
    },
    surprise: {
      formula: "1d6",
      surprisedOn: [1],
    },
  },
});
