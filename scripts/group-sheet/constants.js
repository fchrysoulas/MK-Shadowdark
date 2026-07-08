// scripts/group-sheet/constants.js

export const MODULE_ID = "mk-shadowdark";
export const LEGACY_MODULE_ID = "shadowdark-extras";
export const SHEET_ID = `${MODULE_ID}.SDXGroupSheet`;
export const LEGACY_SHEET_ID = `${LEGACY_MODULE_ID}.SDXGroupSheet`;
export const GROUP_HP_DEFAULT = 1;
export const GROUP_HP_VALUE_PATH = "system.attributes.hp.value";
export const GROUP_HP_MAX_PATH = "system.attributes.hp.max";
export const CAMPING_MEMBER_DRAG_TYPE = "application/x-mk-shadowdark-camping-member";
export const GROUP_SETTING_ASSIGNED_TOKEN_SIZE = "groupSheetAssignedTokenSize";
export const GROUP_ASSIGNED_TOKEN_SIZE_DEFAULT = 28;
export const GROUP_SETTING_MEMBER_PORTRAIT_SIZE = "groupSheetMemberPortraitSize";
export const GROUP_MEMBER_PORTRAIT_SIZE_DEFAULT = 176;
export const GROUP_SETTING_CAMPING_FOOD_KEYWORDS = "groupSheetCampingFoodKeywords";
export const GROUP_CAMPING_FOOD_KEYWORDS_DEFAULT = "ration,rations,food";
export const GROUP_SETTING_CAMPING_TORCH_KEYWORDS = "groupSheetCampingTorchKeywords";
export const GROUP_CAMPING_TORCH_KEYWORDS_DEFAULT = "torch,torches";
export const GROUP_SETTING_CAMPING_WATER_KEYWORDS = "groupSheetCampingWaterKeywords";
export const GROUP_CAMPING_WATER_KEYWORDS_DEFAULT = "water,waterskin,waterskins";
export const GROUP_SETTING_TRAVEL_PREP_DURATION_MS = "groupSheetTravelPrepDurationMs";
export const GROUP_TRAVEL_PREP_DURATION_DEFAULT_MS = 10000;
export const GROUP_SETTING_TRAVEL_PROGRESS_DURATION_MS = "groupSheetTravelProgressDurationMs";
export const GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS = 8000;
export const GROUP_SHEET_SOCKET_FEATURE = "groupSheet";
export const GROUP_SHEET_SOCKET_ASSIGN_TRAVEL = "assignTravelActivity";
export const GROUP_SHEET_SOCKET_PROMPT_TRAVEL = "promptTravelRolls";
export const GROUP_SHEET_SOCKET_PLAYER_TRAVEL_ROLL = "playerTravelRoll";
export const GROUP_SHEET_SOCKET_UPDATE_TRAVEL = "updateTravelRolls";
export const GROUP_SHEET_CHAT_FLAG_TRAVEL_PROMPT = "groupSheetTravelPrompt";
export const ACTIVITY_KIND_TRAVEL = "travel";
export const ACTIVITY_KIND_CAMPING = "camping";
export const ACTIVITY_KINDS = [ACTIVITY_KIND_TRAVEL, ACTIVITY_KIND_CAMPING];
export const TRAVEL_PROMPT_ELEMENT_ID = "sdx-travel-roll-prompt";
export const TRAVEL_PROMPT_BODY_CLASS = "sdx-travel-prompt-open";
export const TRAVEL_PROMPT_AUTO_CLOSE_MS = 20000;
export const TRAVEL_ROLL_RESULT_TIMEOUT_MS = 30000;
export const TRAVEL_AUTO_ROLL_RESULT_TIMEOUT_MS = 8000;
export const TRAVEL_DEFAULT_ACTIVITY_KEY = "lookout";

export const ABILITIES = [
  ["str", "STR"],
  ["dex", "DEX"],
  ["con", "CON"],
  ["int", "INT"],
  ["wis", "WIS"],
  ["cha", "CHA"],
];

export const SPEED_OPTIONS = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

export const WEATHER_OPTIONS = [
  { value: "clear", label: "Clear" },
  { value: "normal", label: "Normal" },
  { value: "rain", label: "Rain" },
  { value: "storm", label: "Storm" },
  { value: "heat", label: "Heat" },
  { value: "cold", label: "Cold" },
];

export const campingIcon = fileName => `modules/${MODULE_ID}/assets/icons/camping/${fileName}.svg`;

export const TRAVEL_ACTIVITIES = [
  {
    key: "pathfind",
    name: "Pathfind",
    dc: 12,
    abilities: ["wis"],
    abilityLabel: "WIS",
    icon: campingIcon("predict"),
    description: "Keep the route, read landmarks, and navigate difficult terrain.",
  },
  {
    key: "march",
    name: "March",
    dc: 12,
    abilities: ["con"],
    abilityLabel: "CON",
    icon: campingIcon("hunt"),
    description: "Set the pace, carry burdens, and help the group endure the day's travel.",
  },
  {
    key: "lookout",
    name: "Lookout",
    dc: 12,
    abilities: ["wis"],
    abilityLabel: "WIS",
    icon: campingIcon("keep-watch"),
    description: "Watch for danger, tracks, ambushes, and useful landmarks.",
  },
  {
    key: "scavenge",
    name: "Scavenge",
    dc: 12,
    abilities: ["int"],
    abilityLabel: "INT",
    icon: campingIcon("scavenge"),
    description: "Gather useful materials, water, or edible supplies during the journey.",
  },
];

export const CAMPING_ACTIVITIES = [
  {
    key: "battenDown",
    name: "Bed Down",
    dc: 12,
    abilities: ["wis", "con"],
    abilityLabel: "WIS / CON",
    icon: campingIcon("bed-down"),
    description: "You do not need to make checks to benefit from rest if your sleep is interrupted during this rest.",
  },
  {
    key: "cook",
    name: "Cook",
    dc: 12,
    abilities: ["int", "wis"],
    abilityLabel: "INT / WIS",
    icon: campingIcon("cook"),
    description: "Each PC who consumes a ration gains +2 temporary HP that lasts 1 day.",
  },
  {
    key: "craft",
    name: "Craft",
    dc: 12,
    abilities: ["dex"],
    abilityLabel: "DEX",
    icon: campingIcon("craft"),
    description: "Create an item or repair a broken piece of mundane gear.",
  },
  {
    key: "entertain",
    name: "Entertain",
    dc: 12,
    abilities: ["cha"],
    abilityLabel: "CHA",
    icon: campingIcon("entertain"),
    description: "Grant 1 luck token to another PC.",
  },
  {
    key: "firewood",
    name: "Scavenge",
    dc: 12,
    abilities: ["str", "con"],
    abilityLabel: "STR / CON",
    icon: campingIcon("scavenge"),
    description: "Make one free campfire this rest without expending torches.",
  },
  {
    key: "hunt",
    name: "Hunt",
    dc: 12,
    abilities: ["str", "dex"],
    abilityLabel: "STR / DEX",
    icon: campingIcon("hunt"),
    description: "Find 1d4 rations. You cannot hunt if you pushed during today's travel.",
  },
  {
    key: "keepWatch",
    name: "Keep Watch",
    dc: 12,
    abilities: ["wis"],
    abilityLabel: "WIS",
    icon: campingIcon("keep-watch"),
    description: "You cannot be surprised during one half of the rest (you choose which).",
  },
  {
    key: "predict",
    name: "Predict",
    dc: 12,
    abilities: ["int", "wis"],
    abilityLabel: "INT / WIS",
    icon: campingIcon("predict"),
    description: "You may force a re-roll of tomorrow's weather after learning the result.",
  },
];
