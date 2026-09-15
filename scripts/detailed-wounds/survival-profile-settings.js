import {
  SURVIVAL_WOUND_PROFILES,
  normalizeSurvivalWoundProfile
} from "./survival-profile-core.js";

const MODULE_ID = "mk-shadowdark";
const PROFILE_SETTING = "detailedWoundsSurvivalProfile";
const TABLE_SETTING = "enduringWoundsTableUuid";
const TEMPLATE = `modules/${MODULE_ID}/templates/survival-wound-profile-settings.hbs`;

const PROFILE_SETTING_DEFINITION = Object.freeze({
  name: "Survival Wounds | Profile",
  hint: "Choose the wound source used after a failed survival CON check. The Enduring Wounds option draws only from the RollTable supplied by the GM and never changes MK Detailed Wounds v3 data.",
  scope: "world",
  config: true,
  type: String,
  default: SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS,
  choices: Object.freeze({
    [SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS]: "MK Detailed Wounds",
    [SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE]: "Enduring Wounds RollTable",
    [SURVIVAL_WOUND_PROFILES.DISABLED]: "Disabled"
  })
});

const TABLE_SETTING_DEFINITION = Object.freeze({
  name: "Survival Wounds | Enduring Wounds RollTable UUID",
  hint: "World or compendium RollTable UUID supplied by the GM. MK-Shadowdark does not include, copy, interpret, or map the table's results.",
  scope: "world",
  config: true,
  type: String,
  default: ""
});

const PROFILE_MENU_DEFINITION = Object.freeze({
  name: "Survival Wound Profile",
  label: "Configure",
  hint: "Choose whether surviving 0 HP uses MK Detailed Wounds, an external Enduring Wounds RollTable, or no wound profile.",
  icon: "fas fa-notes-medical",
  restricted: true
});

function getSurvivalWoundProfileSettingsClass() {
  const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication;
  if (!FormApplicationBase) return null;

  return class SurvivalWoundProfileSettings extends FormApplicationBase {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: `${MODULE_ID}-survival-wound-profile-settings`,
        title: "MK-Shadowdark | Survival Wound Profile",
        template: TEMPLATE,
        width: 680,
        height: "auto",
        resizable: true,
        closeOnSubmit: true
      });
    }

    getData() {
      const profile = normalizeSurvivalWoundProfile(
        game.settings.get(MODULE_ID, PROFILE_SETTING)
      );
      return {
        profile,
        tableUuid: game.settings.get(MODULE_ID, TABLE_SETTING),
        profiles: [
          {
            value: SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS,
            label: "MK Detailed Wounds",
            selected: profile === SURVIVAL_WOUND_PROFILES.MK_DETAILED_WOUNDS
          },
          {
            value: SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE,
            label: "Enduring Wounds RollTable",
            selected: profile === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE
          },
          {
            value: SURVIVAL_WOUND_PROFILES.DISABLED,
            label: "Disabled",
            selected: profile === SURVIVAL_WOUND_PROFILES.DISABLED
          }
        ],
        showTableUuid: profile === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE
      };
    }

    activateListeners(html) {
      super.activateListeners(html);
      const profileSelect = html.find?.(`[name="${PROFILE_SETTING}"]`);
      const tableRow = html.find?.("[data-enduring-wounds-table-row]");
      profileSelect?.on?.("change", event => {
        const show = event.currentTarget.value === SURVIVAL_WOUND_PROFILES.ENDURING_WOUNDS_ROLLTABLE;
        tableRow?.toggle?.(show);
      });
    }

    async _updateObject(_event, formData) {
      const profile = normalizeSurvivalWoundProfile(formData[PROFILE_SETTING]);
      const tableUuid = String(formData[TABLE_SETTING] ?? "").trim();
      await game.settings.set(MODULE_ID, PROFILE_SETTING, profile);
      await game.settings.set(MODULE_ID, TABLE_SETTING, tableUuid);
    }
  };
}

export {
  PROFILE_MENU_DEFINITION,
  PROFILE_SETTING,
  PROFILE_SETTING_DEFINITION,
  TABLE_SETTING,
  TABLE_SETTING_DEFINITION,
  getSurvivalWoundProfileSettingsClass
};
