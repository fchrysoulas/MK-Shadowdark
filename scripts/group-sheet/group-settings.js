import {
  GROUP_ASSIGNED_TOKEN_SIZE_DEFAULT,
  GROUP_MEMBER_PORTRAIT_SIZE_DEFAULT,
  GROUP_SETTING_ASSIGNED_TOKEN_SIZE,
  GROUP_SETTING_MEMBER_PORTRAIT_SIZE,
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

function getTravelProgressDurationMs() {
  return clampNumber(
    getSettingValue(GROUP_SETTING_TRAVEL_PROGRESS_DURATION_MS, GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS),
    GROUP_TRAVEL_PROGRESS_DURATION_DEFAULT_MS,
    1000,
    60000
  );
}

function buildGroupSheetStyle() {
  const tokenSize = getAssignedTokenSizeSetting();
  const portraitSize = Math.max(12, tokenSize - 6);
  const memberPortraitSize = getMemberPortraitSizeSetting();
  const memberCardMinWidth = Math.max(160, memberPortraitSize + 24);

  return [
    `--mk-member-portrait-size: ${memberPortraitSize}px`,
    `--mk-member-card-min-width: ${memberCardMinWidth}px`,
    `--mk-camping-assigned-token-size: ${tokenSize}px`,
    `--mk-camping-assigned-portrait-size: ${portraitSize}px`,
  ].join("; ");
}
export {
  getSettingValue,
  getAssignedTokenSizeSetting,
  getMemberPortraitSizeSetting,
  getTravelProgressDurationMs,
  buildGroupSheetStyle,
};
