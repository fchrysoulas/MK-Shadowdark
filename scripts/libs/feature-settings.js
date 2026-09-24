import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILES
} from "../group-sheet/encounters/constants.js";

const MODULE_ID = "mk-shadowdark";
const FEATURE_SETTINGS_TEMPLATE = `modules/${MODULE_ID}/templates/feature-settings.hbs`;

const FEATURE_MENUS = Object.freeze([
  {
    key: "detailedWounds",
    title: "Detailed Wounds",
    hint: "Configure body-location wound tracking on Shadowdark player sheets.",
    icon: "fas fa-heart-crack",
    settings: ["detailedWoundsEnabled"]
  },
  {
    key: "initiative",
    title: "Initiative",
    hint: "Configure grouped hostile-NPC initiative.",
    icon: "fas fa-list-ol",
    settings: ["initiativeGroupEnemies", "initiativeDebug"]
  },
  {
    key: "morale",
    title: "Morale",
    hint: "Configure automatic hostile-force morale checks, visibility, and Token HUD controls.",
    icon: "fas fa-flag",
    settings: ["moraleEnabled", "moraleVisibility", "moraleTokenHudControls", "moraleDebug"]
  }
]);

function settingExists(key) {
  return game.settings?.settings?.has(`${MODULE_ID}.${key}`) ?? false;
}

function registerSetting(key, definition) {
  if (settingExists(key)) return;
  const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication;
  game.settings.register(MODULE_ID, key, {
    ...definition,
    config: FormApplicationBase ? false : definition.config
  });
}

function settingDescriptor(key) {
  const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
  if (!definition) return null;
  const value = game.settings.get(MODULE_ID, key);
  const choices = typeof definition.choices === "function" ? definition.choices() : definition.choices;
  const isBoolean = definition.type === Boolean;
  const isNumber = definition.type === Number;
  const isSelect = Boolean(choices && Object.keys(choices).length);
  return {
    key,
    name: String(definition.name ?? key).replace(/^.*?(?:\s\|\s|:\s*)/, ""),
    hint: String(definition.hint ?? ""),
    value,
    isBoolean,
    isNumber,
    isSelect,
    isRange: isNumber && Boolean(definition.range),
    isFilePicker: Boolean(definition.filePicker),
    isTextarea: false,
    isColor: false,
    filePickerType: definition.filePicker,
    inputType: isNumber ? "number" : "text",
    dataType: isNumber ? "Number" : "String",
    range: definition.range ?? {},
    options: isSelect
      ? Object.entries(choices).map(([optionValue, label]) => ({
          value: optionValue,
          label,
          selected: String(optionValue) === String(value)
        }))
      : []
  };
}

function registerMenus() {
  const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication;
  if (!FormApplicationBase) return;

  for (const feature of FEATURE_MENUS) {
    class FeatureSettingsForm extends FormApplicationBase {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: `${MODULE_ID}-${feature.key}-settings`,
          title: `MK-Shadowdark | ${feature.title}`,
          template: FEATURE_SETTINGS_TEMPLATE,
          width: 680,
          height: "auto",
          resizable: true,
          closeOnSubmit: true
        });
      }

      getData() {
        return {
          title: feature.title,
          hint: feature.hint,
          sections: [{
            title: "",
            settings: feature.settings.map(settingDescriptor).filter(Boolean)
          }]
        };
      }

      async _updateObject(_event, formData) {
        for (const key of feature.settings) {
          const definition = game.settings.settings.get(`${MODULE_ID}.${key}`);
          if (!definition) continue;
          let value = formData[key];
          if (definition.type === Boolean) value = value === true || value === "true" || value === "on" || value === 1;
          else if (definition.type === Number) value = Number(value);
          else value = String(value ?? "");
          await game.settings.set(MODULE_ID, key, value);
        }
      }
    }

    game.settings.registerMenu(MODULE_ID, `${feature.key}Settings`, {
      name: feature.title,
      label: "Configure",
      hint: feature.hint,
      icon: feature.icon,
      type: FeatureSettingsForm,
      restricted: true
    });
  }
}

Hooks.once("init", () => {
  registerSetting("detailedWoundsEnabled", {
    name: "Detailed Wounds | Enabled",
    hint: "Adds an active-wounds summary below Stats on Shadowdark player character sheets and opens the six-zone, location-specific severity board in a separate window.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      for (const app of Object.values(ui.windows ?? {})) {
        if (app?.actor || app?.object?.documentName === "Actor") app.render(false);
      }
    }
  });
  registerSetting("detailedWoundsMigrationVersion", {
    name: "Detailed Wounds Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });
  registerSetting("damageTraitsMigrationVersion", {
    name: "Damage Traits Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  registerSetting("initiativeGroupEnemies", {
    name: "Initiative | Group Enemy Initiative",
    hint: "Players keep their individual native initiative rolls. Hostile NPCs roll once using the hostile creature with the highest DEX modifier and all act in that shared enemy slot.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("initiativeDebug", {
    name: "Initiative | Debug Mode",
    hint: "Logs grouped enemy initiative details to the browser console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  registerSetting("moraleEnabled", {
    name: "Morale | Enabled",
    hint: "Tracks all hostile NPCs as one combat-start force. Morale is checked only at the start of the enemies' turn. At half strength, a living leader rolls once for the force; without a leader, each remaining NPC checks individually. Solo enemies check at half HP.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("moraleVisibility", {
    name: "Morale | Roll Visibility",
    hint: "Choose whether morale results are public or whispered to GMs.",
    scope: "world",
    config: true,
    type: String,
    default: "public",
    choices: {
      public: "Public",
      gm: "GM only"
    }
  });
  registerSetting("moraleTokenHudControls", {
    name: "Morale | Token HUD Controls",
    hint: "Adds a GM Token HUD button for marking the force leader.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("moraleDebug", {
    name: "Morale | Debug Mode",
    hint: "Logs morale snapshots, enemy-turn triggers, rolls, and Fleeing applications to the browser console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  registerSetting("moraleMigrationVersion", {
    name: "Morale Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  registerSetting("corpseTokenEnabled", {
    name: "Corpse Token: Enabled",
    hint: "Automatically changes NPC tokens to a corpse image when their Shadowdark HP reaches 0 or lower.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("corpseTokenImage", {
    name: "Corpse Token: Image",
    hint: "Select the image used for dead NPC tokens. No corpse token is applied until an image is selected.",
    scope: "world",
    config: true,
    type: String,
    filePicker: "image",
    default: "",
    onChange: value => Hooks.callAll("mkShadowdarkCorpseImageSettingChanged", value)
  });
  registerSetting("corpseTokenOnlyNpcs", {
    name: "Corpse Token: NPCs Only",
    hint: "Only NPC actor tokens are changed. Player character tokens are ignored.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("corpseTokenWidth", {
    name: "Corpse Token: Width",
    hint: "Token width after corpse conversion.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.25, max: 6, step: 0.25 },
    default: 1
  });
  registerSetting("corpseTokenHeight", {
    name: "Corpse Token: Height",
    hint: "Token height after corpse conversion.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.25, max: 6, step: 0.25 },
    default: 1
  });
  registerSetting("corpseTokenScale", {
    name: "Corpse Token: Texture Scale",
    hint: "Texture scale for the corpse image. 0.7 means 70% of the 1x1 token space.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0.1, max: 2, step: 0.05 },
    default: 0.7
  });
  registerSetting("corpseTokenAlignVisualBottom", {
    name: "Corpse Token: Align Opaque Image Bottom",
    hint: "When enabled, the actual opaque bottom of the corpse PNG is placed on the original standing/falling point. This compensates for texture scale and transparent image padding.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("corpseTokenYOffset", {
    name: "Corpse Token: Vertical Offset",
    hint: "Fine-tunes corpse placement in pixels. Positive values move the corpse down; negative values move it up.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: -200, max: 200, step: 1 },
    default: 0
  });
  registerSetting("corpseTokenApplyDelayMs", {
    name: "Corpse Token: Apply Delay (ms)",
    hint: "Waits this many milliseconds after HP reaches 0 before replacing the token, allowing the HP/death update cycle to settle first.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 5000, step: 50 },
    default: 750
  });
  registerSetting("corpseTokenPostChatMessage", {
    name: "Corpse Token: Post Chat Message",
    hint: "Posts a small chat message when tokens are changed to corpse images.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  registerSetting("corpseTokenScanOnCanvasReady", {
    name: "Corpse Token: Scan Scene On Load",
    hint: "When enabled, the GM scans the active scene for already-dead NPC tokens whenever the canvas is ready.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  registerSetting("corpseTokenAutoRestoreWhenHealed", {
    name: "Corpse Token: Auto Restore When Healed",
    hint: "When enabled, a corpse token is restored if its NPC HP rises above 0.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  registerSetting("corpseTokenDebug", {
    name: "Corpse Token: Debug Mode",
    hint: "Logs detailed Corpse Token processing information to the browser console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
  registerSetting("corpseTokenMigrationVersion", {
    name: "Corpse Token Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  registerSetting("encounterEngineEnabled", {
    name: "Legacy Group Encounters | Enabled",
    hint: "Compatibility setting for legacy Group encounter APIs; it does not schedule encounter checks.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
  registerSetting("encounterEngineDefaultTableUuid", {
    name: "Legacy Group Encounters | Default Table UUID",
    hint: "Compatibility fallback for legacy Group encounter APIs.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  registerSetting("encounterEngineDefaultProfile", {
    name: "Legacy Group Encounter Rules ID",
    hint: "Deprecated internal compatibility storage for older encounter records.",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_PROFILE_ID
  });
  registerSetting("encounterEngineWhisperToGm", {
    name: "Legacy Group Encounters | GM-only Chat Card",
    hint: "Compatibility presentation setting for legacy Group encounter cards.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });
  registerSetting("encounterEngineShowDice3d", {
    name: "Legacy Group Encounters | Show 3D Dice",
    hint: "Compatibility presentation setting for legacy Group encounter cards.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
  registerSetting("encounterEngineProfiles", {
    name: "Legacy Group Encounter Rules Storage",
    hint: "Deprecated internal compatibility storage for older encounter records.",
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(DEFAULT_PROFILES, null, 2)
  });
  registerMenus();
});
