import {
  GROUP_ACTIVITY_COLUMNS_DEFAULT,
  GROUP_ASSIGNED_TOKEN_SIZE_DEFAULT,
  GROUP_SETTING_ACTIVITY_COLUMNS,
  GROUP_MEMBER_PORTRAIT_SIZE_DEFAULT,
  GROUP_SETTING_ASSIGNED_TOKEN_SIZE,
  GROUP_SETTING_MEMBER_PORTRAIT_SIZE,
  GROUP_SETTING_TAB_BACKGROUND_CAMPING,
  GROUP_SETTING_TAB_BACKGROUND_HIRELINGS,
  GROUP_SETTING_TAB_BACKGROUND_INVENTORY,
  GROUP_SETTING_TAB_BACKGROUND_MOUNTS,
  GROUP_SETTING_TAB_BACKGROUND_TRAVELING,
  GROUP_SETTING_TRAVEL_PROGRESS_DURATION_MS,
  GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS,
  MODULE_ID,
} from "./constants.js";
import { clampNumber, settingExists } from "./utils.js";
function getSettingValue(key, fallback) {
  try {
    if (!settingExists(key)) return fallback;
    return game.settings.get(MODULE_ID, key);
  } catch (_error) {
    return fallback;
  }
}

function getAssignedTokenSizeSetting() {
  return clampNumber(
    getSettingValue(GROUP_SETTING_ASSIGNED_TOKEN_SIZE, GROUP_ASSIGNED_TOKEN_SIZE_DEFAULT),
    GROUP_ASSIGNED_TOKEN_SIZE_DEFAULT,
    20,
    64
  );
}

function getMemberPortraitSizeSetting() {
  return clampNumber(
    getSettingValue(GROUP_SETTING_MEMBER_PORTRAIT_SIZE, GROUP_MEMBER_PORTRAIT_SIZE_DEFAULT),
    GROUP_MEMBER_PORTRAIT_SIZE_DEFAULT,
    96,
    260
  );
}

function getActivityColumnsSetting() {
  return Math.round(clampNumber(
    getSettingValue(GROUP_SETTING_ACTIVITY_COLUMNS, GROUP_ACTIVITY_COLUMNS_DEFAULT),
    GROUP_ACTIVITY_COLUMNS_DEFAULT,
    1,
    6
  ));
}

function getTravelProgressDurationMs() {
  return clampNumber(
    getSettingValue(GROUP_SETTING_TRAVEL_PROGRESS_DURATION_MS, GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS),
    GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS,
    1000,
    60000
  );
}

function getBackgroundImageSetting(key) {
  const path = String(getSettingValue(key, "") ?? "").trim();
  if (!path) return "none";

  const escapedPath = path
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, "");
  return `url("${escapedPath}")`;
}

function getGroupSheetTabBackgrounds() {
  return {
    traveling: String(getSettingValue(GROUP_SETTING_TAB_BACKGROUND_TRAVELING, "") ?? "").trim(),
    camping: String(getSettingValue(GROUP_SETTING_TAB_BACKGROUND_CAMPING, "") ?? "").trim(),
    inventory: String(getSettingValue(GROUP_SETTING_TAB_BACKGROUND_INVENTORY, "") ?? "").trim(),
    hirelings: String(getSettingValue(GROUP_SETTING_TAB_BACKGROUND_HIRELINGS, "") ?? "").trim(),
    mounts: String(getSettingValue(GROUP_SETTING_TAB_BACKGROUND_MOUNTS, "") ?? "").trim(),
  };
}

function buildGroupSheetStyle() {
  const tokenSize = getAssignedTokenSizeSetting();
  const portraitSize = Math.max(12, tokenSize - 6);
  const memberPortraitSize = getMemberPortraitSizeSetting();
  const memberCardMinWidth = Math.max(160, memberPortraitSize + 24);
  const activityColumns = getActivityColumnsSetting();

  return [
    `--mk-member-portrait-size: ${memberPortraitSize}px`,
    `--mk-member-card-min-width: ${memberCardMinWidth}px`,
    `--mk-camping-assigned-token-size: ${tokenSize}px`,
    `--mk-camping-assigned-portrait-size: ${portraitSize}px`,
    `--mk-group-activity-columns: ${activityColumns}`,
    `--mk-group-tab-background-traveling: ${getBackgroundImageSetting(GROUP_SETTING_TAB_BACKGROUND_TRAVELING)}`,
    `--mk-group-tab-background-camping: ${getBackgroundImageSetting(GROUP_SETTING_TAB_BACKGROUND_CAMPING)}`,
    `--mk-group-tab-background-inventory: ${getBackgroundImageSetting(GROUP_SETTING_TAB_BACKGROUND_INVENTORY)}`,
    `--mk-group-tab-background-hirelings: ${getBackgroundImageSetting(GROUP_SETTING_TAB_BACKGROUND_HIRELINGS)}`,
    `--mk-group-tab-background-mounts: ${getBackgroundImageSetting(GROUP_SETTING_TAB_BACKGROUND_MOUNTS)}`,
  ].join("; ");
}
export {
  getSettingValue,
  getAssignedTokenSizeSetting,
  getMemberPortraitSizeSetting,
  getActivityColumnsSetting,
  getGroupSheetTabBackgrounds,
  getTravelProgressDurationMs,
  buildGroupSheetStyle,
};
