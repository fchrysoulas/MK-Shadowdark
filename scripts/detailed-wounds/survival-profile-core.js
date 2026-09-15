const SURVIVAL_WOUND_PROFILES = Object.freeze({
  DISABLED: "disabled",
  MK_DETAILED_WOUNDS: "mk-detailed-wounds",
  ENDURING_WOUNDS_ROLLTABLE: "enduring-wounds-rolltable"
});

function normalizeSurvivalWoundProfile(value) {
  const profile = String(value ?? "").trim().toLowerCase();
  if (profile === SURVIVAL_WOUND_PROFILES.DISABLED) return SURVIVAL_WOUND_PROFILES.DISABLED;
  if (profile === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE) {
    return SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE;
  }
  return SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS;
}

function survivalWoundProfileEnabled(profile, {
  detailedWoundsEnabled = true
} = {}) {
  const normalized = normalizeSurvivalWoundProfile(profile);
  if (normalized === SURVIVAL_WOUND_PROFILES.DISABLED) return false;
  if (normalized === SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS) {
    return detailedWoundsEnabled !== false;
  }
  return true;
}

function survivalWoundProfileLabel(profile) {
  const normalized = normalizeSurvivalWoundProfile(profile);
  if (normalized === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE) {
    return "Enduring Wounds RollTable";
  }
  if (normalized === SURVIVAL_WOUND_PROFILES.DISABLED) return "Disabled";
  return "MK Detailed Wounds";
}

export {
  SURVIVAL_WOUND_PROFILES,
  normalizeSurvivalWoundProfile,
  survivalWoundProfileEnabled,
  survivalWoundProfileLabel
};
