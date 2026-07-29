(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Settings";
  const FEATURE_SETTINGS_TEMPLATE = `modules/${MODULE_ID}/templates/feature-settings.hbs`;

  const FEATURE_SETTINGS = [
    {
      key: "autoDamage",
      title: "Auto Damage",
      hint: "Configure automatic damage application, timing, dice, and token feedback.",
      icon: "fas fa-heart-crack",
      settings: ["autoDamageEnabled", "autoDamageGMOnly", "autoDamageShowDice3D", "autoDamageShakeTokens", "autoDamageDelayMs"]
    },
    {
      key: "tokenShadows",
      title: "Token Shadows",
      hint: "Configure token shadow dimensions, position, opacity, and blur.",
      icon: "fas fa-circle-half-stroke",
      settings: ["tokenShadowsEnabled", "tokenShadowWidthFactor", "tokenShadowHeightGridFactor", "tokenShadowOffsetYFactor", "tokenShadowAlpha", "tokenShadowBlur", "tokenShadowBlurQuality"]
    },
    {
      key: "deathTimer",
      title: "Death Timer",
      hint: "Configure the character-sheet death timer button and its effect.",
      icon: "fas fa-hourglass-half",
      settings: ["deathTimerEnabled", "deathTimerMinTurns", "deathTimerTooltip", "deathTimerIcon"]
    },
    {
      key: "editableQuantity",
      title: "Editable Quantity",
      hint: "Configure direct inventory quantity editing.",
      icon: "fas fa-pen-to-square",
      settings: ["editableQtyEnabled"]
    },
    {
      key: "quickdraw",
      title: "Quickdraw",
      hint: "Configure Quickdraw toggles, sorting, limits, and diagnostics.",
      icon: "fas fa-bolt",
      settings: ["quickdrawIconEnabled", "quickdrawAutoSort", "quickdrawLimit", "characterSheetTweaksHighlightEquipped", "debug"]
    },
    {
      key: "characterSheet",
      title: "Character Sheet Tweaks",
      hint: "Configure global sheet styling, imagery, visual tweaks, and diagnostics.",
      icon: "fas fa-address-card",
      width: 850,
      height: 720,
      settings: [
        "characterSheetTweaksEnabled", "attackWeaponPropertiesEnabled", "sheetStyleEditorEnabled", "sheetStyleEditorCss",
        "characterSheetTweaksHideLogo", "characterSheetTweaksHeaderBackgroundImage", "characterSheetTweaksDebug"
      ],
      sections: [
        {
          title: "General",
          settings: ["characterSheetTweaksEnabled", "attackWeaponPropertiesEnabled", "sheetStyleEditorEnabled"]
        },
        {
          title: "Appearance",
          settings: ["characterSheetTweaksHideLogo", "characterSheetTweaksHeaderBackgroundImage"]
        },
        {
          title: "Advanced",
          settings: ["sheetStyleEditorCss", "characterSheetTweaksDebug"]
        }
      ]
    },
    {
      key: "paperChat",
      title: "Paper Chat",
      hint: "Configure chat-message themes and the GM visual style editor.",
      icon: "fas fa-scroll",
      width: 850,
      height: 660,
      settings: [
        "paperChatEnabled", "paperChatStyle", "paperChatApplyToCharacterSheets",
        "paperChatStyleEditorEnabled", "paperChatEditorCss"
      ],
      sections: [
        {
          title: "General",
          settings: [
            "paperChatEnabled", "paperChatStyle", "paperChatApplyToCharacterSheets",
            "paperChatStyleEditorEnabled"
          ]
        },
        {
          title: "Advanced",
          settings: ["paperChatEditorCss"]
        }
      ]
    },
    {
      key: "summaryBar",
      title: "Summary Bar",
      hint: "Configure the independent character summary bar, its contents, appearance, position, and diagnostics.",
      icon: "fas fa-chart-simple",
      settings: [
        "characterSheetTweaksSummaryBar", "characterSheetTweaksBarElements", "characterSheetTweaksRestMode",
        "characterSheetTweaksFontScale",
        "characterSheetTweaksBarValueFontSize", "characterSheetTweaksBarButtonRadius", "characterSheetTweaksBarButtonScale",
        "characterSheetTweaksBarPositionX", "characterSheetTweaksBarPositionY", "summaryBarDebug"
      ]
    },
    {
      key: "focusTracker",
      title: "Focus Tracker",
      hint: "Configure Focus spell tracking, maintenance reminders, displays, and capacity.",
      icon: "fas fa-brain",
      settings: [
        "focusTrackerEnabled", "focusTrackerTurnReminders", "focusTrackerDamagePrompts",
        "focusTrackerSummaryBar", "focusTrackerTokenHud", "focusTrackerDefaultCapacity", "focusTrackerDebug"
      ],
      sections: [
        {
          title: "Automation",
          settings: ["focusTrackerEnabled", "focusTrackerTurnReminders", "focusTrackerDamagePrompts"]
        },
        {
          title: "Display",
          settings: ["focusTrackerSummaryBar", "focusTrackerTokenHud"]
        },
        {
          title: "Capacity and Diagnostics",
          settings: ["focusTrackerDefaultCapacity", "focusTrackerDebug"]
        }
      ]
    },
    {
      key: "equipmentHands",
      title: "Equipment Hands",
      hint: "Configure equipped-hand rules, limits, dual wielding, and diagnostics.",
      icon: "fas fa-hand",
      settings: ["equipmentHandsEnabled", "equipmentHandsMode", "equipmentHandsMaxHands", "equipmentHandsAllowDualWield", "equipmentHandsIgnoreStashed", "equipmentHandsDebug"]
    },
    {
      key: "tokenEquipment",
      title: "Token Equipment Display",
      hint: "Show held and Quickdraw item icons around player tokens and configure their visibility, interaction, size, anchor, and position.",
      icon: "fas fa-hand-holding",
      width: 760,
      height: 760,
      settings: [
        "tokenEquipmentEnabled", "tokenEquipmentVisibility", "tokenEquipmentClickAction", "tokenEquipmentShowQuickdraw",
        "tokenEquipmentBorderEnabled", "tokenEquipmentBorderWidth",
        "tokenEquipmentHeldBorderColor", "tokenEquipmentQuickdrawBorderColor",
        "tokenEquipmentHeldScale", "tokenEquipmentHeldOpacity", "tokenEquipmentHeldAnchor",
        "tokenEquipmentHeldOffsetX", "tokenEquipmentHeldOffsetY",
        "tokenEquipmentQuickdrawScale", "tokenEquipmentQuickdrawOpacity",
        "tokenEquipmentQuickdrawPadding", "tokenEquipmentQuickdrawAnchor",
        "tokenEquipmentQuickdrawOffsetX", "tokenEquipmentQuickdrawOffsetY", "tokenEquipmentDebug"
      ],
      sections: [
        {
          title: "General",
          settings: [
            "tokenEquipmentEnabled", "tokenEquipmentVisibility",
            "tokenEquipmentClickAction", "tokenEquipmentShowQuickdraw"
          ]
        },
        {
          title: "Icon Frames",
          settings: [
            "tokenEquipmentBorderEnabled", "tokenEquipmentBorderWidth",
            "tokenEquipmentHeldBorderColor", "tokenEquipmentQuickdrawBorderColor"
          ]
        },
        {
          title: "Held Items",
          settings: [
            "tokenEquipmentHeldScale", "tokenEquipmentHeldOpacity",
            "tokenEquipmentHeldAnchor",
            "tokenEquipmentHeldOffsetX", "tokenEquipmentHeldOffsetY"
          ]
        },
        {
          title: "Quickdraw Items",
          settings: [
            "tokenEquipmentQuickdrawScale", "tokenEquipmentQuickdrawOpacity",
            "tokenEquipmentQuickdrawPadding",
            "tokenEquipmentQuickdrawAnchor",
            "tokenEquipmentQuickdrawOffsetX", "tokenEquipmentQuickdrawOffsetY"
          ]
        },
        {
          title: "Diagnostics",
          settings: ["tokenEquipmentDebug"]
        }
      ]
    },
    {
      key: "timePasses",
      title: "Time Passes",
      hint: "Configure the Time Passes splash, encounter presentation, and roll.",
      icon: "fas fa-clock",
      settings: [
        "timePassesEnabled", "timePassesPreText", "timePassesEncounterText", "timePassesPreDurationMs",
        "timePassesEncounterDurationMs", "timePassesPreShowProgress", "timePassesRollFormula", "timePassesRollFlavor",
        "timePassesFontFamily", "timePassesTitleFontSizePx", "timePassesEncounterShowSkull", "timePassesSkullIconPath",
        "timePassesSkullSizePx"
      ]
    },
    {
      key: "encounterEngine",
      title: "Encounter Engine",
      hint: "Configure encounter resolution, table selection, Time Passes integration, and GM presentation.",
      icon: "fas fa-dice-d20",
      settings: [
        "encounterEngineEnabled", "encounterEngineAutoTimePasses", "encounterEngineDefaultProfile",
        "encounterEngineDefaultTableUuid", "encounterEngineWhisperToGm", "encounterEngineShowDice3d"
      ],
      sections: [
        {
          title: "General",
          settings: ["encounterEngineEnabled", "encounterEngineAutoTimePasses"]
        },
        {
          title: "Table Selection",
          settings: ["encounterEngineDefaultProfile", "encounterEngineDefaultTableUuid"]
        },
        {
          title: "Presentation",
          settings: ["encounterEngineWhisperToGm", "encounterEngineShowDice3d"]
        }
      ]
    },
    {
      key: "groupSheet",
      title: "Group Sheet",
      hint: "Configure Group actors, member presentation, camping supplies, and travel progress.",
      icon: "fas fa-users",
      settings: [
        "enableGroupActors", "groupSheetAssignedTokenSize", "groupSheetMemberPortraitSize", "groupSheetCampingFoodKeywords",
        "groupSheetCampingTorchKeywords", "groupSheetCampingWaterKeywords", "groupSheetTravelProgressDurationMs"
      ]
    },
    {
      key: "corpseToken",
      title: "Corpse Token",
      hint: "Configure automatic corpse images, placement, timing, restoration, and scene scanning.",
      icon: "fas fa-skull",
      settings: [
        "corpseTokenEnabled", "corpseTokenImage", "corpseTokenOnlyNpcs", "corpseTokenWidth", "corpseTokenHeight",
        "corpseTokenScale", "corpseTokenAlignVisualBottom", "corpseTokenYOffset", "corpseTokenApplyDelayMs",
        "corpseTokenPostChatMessage", "corpseTokenScanOnCanvasReady", "corpseTokenAutoRestoreWhenHealed"
      ]
    }
  ];

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function log(...args) {
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function settingExists(key) {
    return game.settings?.settings?.has(`${MODULE_ID}.${key}`);
  }

  function registerSetting(key, data) {
    if (settingExists(key)) {
      console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | Setting already registered: ${key}`);
      return;
    }

    game.settings.register(MODULE_ID, key, {
      ...data,
      // Keep the native settings visible if no compatible submenu application
      // class is available. This prevents a failed custom UI from hiding every
      // module setting.
      config: FeatureSettingsForm ? false : data.config
    });
  }

  function localize(value) {
    return game.i18n?.localize?.(value) ?? String(value ?? "");
  }

  function settingLabel(setting) {
    const name = localize(setting.name);
    return name.replace(/^.*?(?:\s\|\s|:\s*)/, "");
  }

  function settingDescriptor(key) {
    const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
    if (!setting) return null;

    const value = game.settings.get(MODULE_ID, key);
    const choices = typeof setting.choices === "function" ? setting.choices() : setting.choices;
    const isBoolean = setting.type === Boolean;
    const isNumber = setting.type === Number;
    const isColor = ["tokenEquipmentHeldBorderColor", "tokenEquipmentQuickdrawBorderColor"].includes(key);
    const isSelect = Boolean(choices && Object.keys(choices).length);
    const options = isSelect
      ? Object.entries(choices).map(([optionValue, optionLabel]) => ({
          value: optionValue,
          label: localize(optionLabel),
          selected: String(optionValue) === String(value)
        }))
      : [];

    return {
      key,
      name: settingLabel(setting),
      hint: localize(setting.hint),
      value,
      isBoolean,
      isNumber,
      isSelect,
      isRange: isNumber && Boolean(setting.range),
      isFilePicker: Boolean(setting.filePicker),
      isTextarea: ["sheetStyleEditorCss", "paperChatEditorCss"].includes(key),
      isColor,
      filePickerType: setting.filePicker,
      inputType: isColor ? "color" : isNumber ? "number" : "text",
      dataType: isNumber ? "Number" : "String",
      range: setting.range ?? {},
      options
    };
  }

  function featureSections(feature) {
    const sections = Array.isArray(feature.sections) && feature.sections.length
      ? feature.sections
      : [{ title: "", settings: feature.settings }];

    return sections.map(section => ({
      title: section.title ?? "",
      settings: section.settings.map(settingDescriptor).filter(Boolean)
    }));
  }

  const FormApplicationBase = globalThis.foundry?.appv1?.api?.FormApplication
    // Foundry v12 exposes FormApplication as a legacy global binding which is
    // not guaranteed to also be a property of globalThis.
    ?? (typeof FormApplication === "function" ? FormApplication : globalThis.FormApplication);

  const FeatureSettingsForm = FormApplicationBase ? class extends FormApplicationBase {
    static feature = null;

    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: `${MODULE_ID}-${this.feature.key}-settings`,
        title: `${MODULE_ID} | ${this.feature.title}`,
        template: FEATURE_SETTINGS_TEMPLATE,
        width: this.feature.width ?? 680,
        height: this.feature.height ?? "auto",
        resizable: true,
        closeOnSubmit: true
      });
    }

    getData() {
      const feature = this.constructor.feature;
      return {
        title: feature.title,
        hint: feature.hint,
        sections: featureSections(feature)
      };
    }

    activateListeners(html) {
      super.activateListeners(html);
      html.find('input[type="range"]').on("input", event => {
        event.currentTarget.closest(".mk-range-control")?.querySelector(".range-value")?.replaceChildren(event.currentTarget.value);
      });
    }

    async _updateObject(_event, formData) {
      const feature = this.constructor.feature;

      for (const key of feature.settings) {
        const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
        if (!setting) continue;

        let value = formData[key];
        if (setting.type === Boolean) value = value === true || value === "true" || value === "on" || value === 1;
        else if (setting.type === Number) value = Number(value);
        else value = String(value ?? "");

        await game.settings.set(MODULE_ID, key, value);
      }
    }
  } : null;

  function registerFeatureMenus() {
    if (!FeatureSettingsForm) {
      console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | FormApplication unavailable; using native settings controls.`);
      return;
    }

    const sortedFeatures = [...FEATURE_SETTINGS].sort((left, right) => (
      left.title.localeCompare(right.title, game.i18n?.lang, { sensitivity: "base" })
    ));

    for (const feature of sortedFeatures) {
      class FeatureMenu extends FeatureSettingsForm {}
      FeatureMenu.feature = feature;

      game.settings.registerMenu(MODULE_ID, `${feature.key}Settings`, {
        name: feature.title,
        label: "Configure",
        hint: feature.hint,
        icon: feature.icon,
        type: FeatureMenu,
        restricted: true
      });
    }
  }

  function refreshTokenShadowsNow() {
    try {
      if (!canvas?.ready || !canvas.tokens) return;

      const apiRefresh = game.modules.get(MODULE_ID)?.api?.refreshTokenShadows;
      if (typeof apiRefresh === "function") {
        apiRefresh();
        return;
      }

      canvas.tokens.placeables.forEach(token => token.refresh());
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | refreshTokenShadowsNow error`, err);
    }
  }

  function refreshOpenActorSheets() {
    try {
      for (const app of Object.values(ui.windows ?? {})) {
        if (app?.actor || app?.object?.documentName === "Actor") {
          app.render(false);
        }
      }
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | refreshOpenActorSheets error`, err);
    }
  }

  function refreshFocusTrackerUi() {
    refreshOpenActorSheets();
    try {
      void game.modules.get(MODULE_ID)?.api?.focus?.syncTokenIcons?.();
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | refreshFocusTrackerUi error`, err);
    }
  }

  function refreshTokenEquipmentUi() {
    try {
      game.modules.get(MODULE_ID)?.api?.tokenEquipment?.refreshAll?.();
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | refreshTokenEquipmentUi error`, err);
    }
  }

  function refreshPaperChat() {
    globalThis.MKShadowdarkPaperChat?.applyPaperChat?.();
    globalThis.MKShadowdarkChatStyleEditor?.syncAvailability?.();
    refreshOpenActorSheets();
  }

  Hooks.once("init", () => {
    log("registering settings");

    /* -------------------- */
    /* Paper Chat           */
    /* -------------------- */

    registerSetting("paperChatEnabled", {
      name: "Paper Chat | Enabled",
      hint: "Styles chat messages using the selected paper-inspired theme.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshPaperChat
    });

    registerSetting("paperChatStyle", {
      name: "Paper Chat | Style",
      hint: "Select the texture and color treatment used for chat messages.",
      scope: "world",
      config: true,
      type: String,
      default: "parchment-scroll",
      choices: {
        "parchment-scroll": "Parchment Scroll",
        "clean-parchment": "Clean Parchment",
        "dark-grimoire": "Dark Grimoire",
        "torn-field-note": "Torn Field Note",
        "illuminated-manuscript": "Illuminated Manuscript",
        "dungeon-ledger": "Dungeon Ledger",
        "crimson-dispatch": "Crimson Dispatch",
        "moonlit-arcana": "Moonlit Arcana",
        "obsidian-sun": "Obsidian Sun",
        "tyrants-decree": "Tyrant's Decree",
        "silt-sea-chart": "Silt Sea Chart",
        "bloodsand-arena": "Bloodsand Arena"
      },
      onChange: refreshPaperChat
    });

    registerSetting("paperChatStyleEditorEnabled", {
      name: "Paper Chat | GM Style Editor",
      hint: "Adds a GM-only paintbrush control. While editing, right-click a chat element to customize it for the selected theme.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshPaperChat
    });

    registerSetting("paperChatApplyToCharacterSheets", {
      name: "Paper Chat | Apply Theme to Character Sheets",
      hint: "Applies the selected Paper Chat background and supporting palette below the tabs in player sheets. The active tab matches the body; the header and other navigation remain unchanged.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: refreshPaperChat
    });

    registerSetting("paperChatEditorCss", {
      name: "Paper Chat | Global Style CSS",
      hint: "Theme-specific world CSS generated by the visual editor. Saving synchronizes it to every connected client.",
      scope: "world",
      config: true,
      type: String,
      default: "",
      onChange: value => {
        globalThis.MKShadowdarkChatStyleEditor?.applyCss?.(value);
      }
    });

    /* -------------------- */
    /* Auto Damage          */
    /* -------------------- */

    registerSetting("autoDamageEnabled", {
      name: "Auto Damage | Enabled",
      hint: "Automatically subtract damage from targeted tokens when an attack or spell roll shows damage.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("autoDamageGMOnly", {
      name: "Auto Damage | GM Only",
      hint: "If enabled, only the GM client applies automatic damage.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("autoDamageShowDice3D", {
      name: "Auto Damage | Show 3D Dice",
      hint: "If Dice So Nice is installed, show a 3D roll for auto-generated damage dice.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("autoDamageShakeTokens", {
      name: "Auto Damage | Shake Damaged Tokens",
      hint: "When a token takes auto-applied damage, briefly shake it on the canvas.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("autoDamageDelayMs", {
      name: "Auto Damage | Delay (ms)",
      hint: "Wait this many milliseconds after a successful hit before auto-applying damage. 0 means no delay.",
      scope: "world",
      config: true,
      type: Number,
      default: 400,
      range: {
        min: 0,
        max: 5000,
        step: 50
      }
    });

    /* -------------------- */
    /* Token Shadows        */
    /* -------------------- */

    registerSetting("tokenShadowsEnabled", {
      name: "Token Shadows | Enabled",
      hint: "Draw a shadow under tokens.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowWidthFactor", {
      name: "Token Shadows | Width Factor",
      hint: "Controls the shadow width relative to the token width. Default 0.75.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.75,
      range: {
        min: 0.1,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowHeightGridFactor", {
      name: "Token Shadows | Height Grid Factor",
      hint: "Controls the shadow height relative to the grid size. Default 0.12.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.12,
      range: {
        min: 0.01,
        max: 1,
        step: 0.01
      },
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowOffsetYFactor", {
      name: "Token Shadows | Y Offset Factor",
      hint: "Controls how high the shadow sits under the token. Higher values move it higher. Default 1.1.",
      scope: "world",
      config: true,
      type: Number,
      default: 1.1,
      range: {
        min: -1,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowAlpha", {
      name: "Token Shadows | Opacity",
      hint: "Shadow opacity. 0 is invisible, 1 is fully opaque. Default 0.55.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.55,
      range: {
        min: 0,
        max: 1,
        step: 0.05
      },
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowBlur", {
      name: "Token Shadows | Blur Strength",
      hint: "Controls how soft or blurry the token shadow appears. Set to 0 for a hard shadow. Default 5.",
      scope: "world",
      config: true,
      type: Number,
      default: 5,
      range: {
        min: 0,
        max: 40,
        step: 1
      },
      onChange: refreshTokenShadowsNow
    });

    registerSetting("tokenShadowBlurQuality", {
      name: "Token Shadows | Blur Quality",
      hint: "Controls blur smoothness. Higher values look smoother but cost more performance. Default 2.",
      scope: "world",
      config: true,
      type: Number,
      default: 2,
      range: {
        min: 1,
        max: 4,
        step: 1
      },
      onChange: refreshTokenShadowsNow
    });

    /* -------------------- */
    /* Death Timer          */
    /* -------------------- */

    registerSetting("deathTimerEnabled", {
      name: "Death Timer | Enable Death Timer",
      hint: "Shows the DT control in the Summary Bar when a player character is at 0 HP.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("deathTimerMinTurns", {
      name: "Death Timer | Minimum Turns",
      hint: "Minimum number of turns a new Death Timer can start with.",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
      range: {
        min: 1,
        max: 10,
        step: 1
      }
    });

    registerSetting("deathTimerTooltip", {
      name: "Death Timer | Tooltip Text",
      hint: "Tooltip shown when hovering the DT Summary Bar control.",
      scope: "world",
      config: true,
      type: String,
      default: "Death Timer",
      onChange: refreshOpenActorSheets
    });

    registerSetting("deathTimerIcon", {
      name: "Death Timer | Icon Class",
      hint: "Font Awesome icon class for the DT Summary Bar control. Example: fa-solid fa-skull.",
      scope: "world",
      config: true,
      type: String,
      default: "fa-solid fa-skull",
      onChange: refreshOpenActorSheets
    });

    /* -------------------- */
    /* Editable Quantity    */
    /* -------------------- */

    registerSetting("editableQtyEnabled", {
      name: "Inventory Quantity | Editable Qty Field",
      hint: "Allows item quantities on actor sheets to be edited directly from the carried gear list.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    /* -------------------- */
    /* Quickdraw            */
    /* -------------------- */

    registerSetting("quickdrawIconEnabled", {
      name: "Quickdraw | Enable Toggles",
      hint: "Adds a clickable Quickdraw icon to eligible inventory rows only: Weapon, Basic, Armor, Potion, Wand, Scroll.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("quickdrawAutoSort", {
      name: "Quickdraw | Auto-sort Items",
      hint: "Sorts every inventory group with Quickdraw items first, followed by all remaining items alphabetically.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("quickdrawLimit", {
      name: "Quickdraw | Limit Expression",
      hint: "Maximum Quickdraw items per character. Examples: 3; max(1, @dex.mod); max(1, @dex.mod + gear(\"bandolier\", 2)). The optional second gear() value is the slots granted per carried item quantity. 0 means unlimited.",
      scope: "world",
      config: true,
      type: String,
      default: "3",
      onChange: refreshOpenActorSheets
    });

    registerSetting("debug", {
      name: "Quickdraw | Debug Mode",
      hint: "Logs Quickdraw debug information to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    /* -------------------- */
    /* Focus Tracker        */
    /* -------------------- */

    registerSetting("focusTrackerEnabled", {
      name: "Focus Tracker | Enabled",
      hint: "Track active Focus spells and their maintenance checks.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshFocusTrackerUi
    });

    registerSetting("focusTrackerTurnReminders", {
      name: "Focus Tracker | Start-of-Turn Reminders",
      hint: "Whisper a Focus-check reminder when combat reaches the caster's turn.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("focusTrackerDamagePrompts", {
      name: "Focus Tracker | Damage Prompts",
      hint: "Prompt for an immediate Focus check when the caster's HP decreases.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("focusTrackerSummaryBar", {
      name: "Focus Tracker | Actor Sheet Display",
      hint: "Show active Focus spells in the MK-Shadowdark summary bar, with a sheet-header fallback.",
      scope: "client",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshFocusTrackerUi
    });

    registerSetting("focusTrackerTokenHud", {
      name: "Focus Tracker | Token Status Icon",
      hint: "Show the Focus icon with the token's conditions and effects while the actor maintains Focus.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshFocusTrackerUi
    });

    registerSetting("focusTrackerDefaultCapacity", {
      name: "Focus Tracker | Default Focus Capacity",
      hint: "Maximum simultaneous Focus spells unless an actor-specific capacity overrides it.",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
      range: { min: 1, max: 4, step: 1 },
      onChange: refreshFocusTrackerUi
    });

    registerSetting("focusTrackerDebug", {
      name: "Focus Tracker | Debug Logging",
      hint: "Write Focus Tracker diagnostics to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });



    /* -------------------- */
    /* Character Sheet      */
    /* -------------------- */

    registerSetting("characterSheetTweaksEnabled", {
      name: "Character Sheet | Enable Tweaks",
      hint: "Adds MK-Shadowdark controls and styling to Shadowdark player character sheets.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("attackWeaponPropertiesEnabled", {
      name: "Character Sheet | Weapon Properties on New Line",
      hint: "Displays weapon properties on a separate line beneath each attack on the Abilities tab.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksSummaryBar", {
      name: "Summary Bar | Enabled",
      hint: "Adds an independent compact summary bar to the Shadowdark player sheet.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarElements", {
      name: "Summary Bar | Elements",
      hint: "Comma-separated list of bar elements, in display order. Available: LVL, HP, DT, AC, XP, LUCK, REST, SLOTS, STR, DEX, CON, INT, WIS, CHA. DT is the Death Timer and appears only at 0 HP. Use | to add a vertical divider.",
      scope: "world",
      config: true,
      type: String,
      default: "HP, DT, LUCK, REST,|,STR,DEX,CON,INT,WIS,CHA, SLOTS",
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksRestMode", {
      name: "Summary Bar | Rest Mode",
      hint: "Normal restores all HP, class abilities, and spells. Grinder restores class abilities, 1d4 lost spells, and HP equal to one class hit die.",
      scope: "world",
      config: true,
      type: String,
      default: "normal",
      choices: {
        normal: "Normal",
        grinder: "Grinder"
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksHighlightEquipped", {
      name: "Quickdraw | Highlight Items",
      hint: "Highlights Quickdraw rows in Shadowdark inventory lists. Equipped items are not highlighted unless they are also Quickdraw.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("sheetStyleEditorEnabled", {
      name: "Character Sheet | GM Style Editor",
      hint: "Adds a GM-only Edit Style mode. While enabled, right-click a sheet element to change its font, size, weight, and padding globally.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("sheetStyleEditorCss", {
      name: "Character Sheet | Global Style CSS",
      hint: "Editable world-level CSS for Character Sheet Tweaks, Quickdraw, managed visual settings, and Edit Style rules. Saving synchronizes it to all connected clients.",
      scope: "world",
      config: true,
      type: String,
      default: "",
      onChange: value => {
        globalThis.MKShadowdarkSheetStyleEditor?.applyCss?.(value);
      }
    });

    registerSetting("sheetStyleEditorTypographyMigrated", {
      name: "Character Sheet | Typography Migration Complete",
      hint: "Internal migration state for legacy typography settings.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorMkPrefixMigrated", {
      name: "Character Sheet | MK CSS Prefix Migration Complete",
      hint: "Internal migration state for renaming legacy module CSS identifiers to mk.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorDefaultsSeeded", {
      name: "Character Sheet | Editable Defaults Seeded",
      hint: "Internal migration state for the editable character-sheet default CSS.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorSummaryCssSplit", {
      name: "Character Sheet | Summary Bar CSS Split Complete",
      hint: "Internal migration state for separating Summary Bar CSS from Character Sheet CSS.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorQuickdrawStylesExtracted", {
      name: "Character Sheet | Quickdraw Styles Extraction Complete",
      hint: "Internal migration state for moving all Quickdraw styling out of editable Global Style CSS.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorExpandedControls", {
      name: "Character Sheet | Expanded Style Controls Migration Complete",
      hint: "Internal migration state for the color, background image, margin, and style-source controls.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorSolidNavigationBackground", {
      name: "Character Sheet | Solid Navigation Background Migration Complete",
      hint: "Internal migration state for replacing the navigation gradient with a solid background.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorUiStylesExtracted", {
      name: "Character Sheet | Fixed Style Editor CSS Migration Complete",
      hint: "Internal migration state for moving the Style Editor interface out of editable character-sheet CSS.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorContextMenuStylesExtracted", {
      name: "Character Sheet | Fixed Context Menu CSS Migration Complete",
      hint: "Internal migration state for replacing the editable context-menu override with the fixed Quickdraw fallback.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("sheetStyleEditorAttackPropertiesStylesExtracted", {
      name: "Character Sheet | Fixed Attack Properties CSS Migration Complete",
      hint: "Internal migration state for moving weapon attack property styles out of editable character-sheet CSS.",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    registerSetting("characterSheetTweaksFontScale", {
      name: "Summary Bar | Font Scale",
      hint: "Adjusts the Summary Bar font size.",
      scope: "world",
      config: true,
      type: Number,
      default: 120,
      range: {
        min: 80,
        max: 130,
        step: 5
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarValueFontSize", {
      name: "Summary Bar | Value Font Size",
      hint: "Font size in pixels for the value line inside each Summary Bar element.",
      scope: "world",
      config: true,
      type: Number,
      default: 13,
      range: {
        min: 8,
        max: 24,
        step: 1
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarButtonRadius", {
      name: "Summary Bar | Button Radius",
      hint: "Corner radius in pixels for each bar element. Use 0 for square, 6-12 for rounded boxes, or 999 for pill/circle style.",
      scope: "world",
      config: true,
      type: Number,
      default: 8,
      range: {
        min: 0,
        max: 20,
        step: 1,
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarButtonScale", {
      name: "Summary Bar | Button Scale",
      hint: "Scales only the pushable buttons in the floating bar, such as Luck and ability checks.",
      scope: "world",
      config: true,
      type: Number,
      default: 100,
      range: {
        min: 70,
        max: 140,
        step: 5
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarPositionX", {
      name: "Summary Bar | Position X",
      hint: "Horizontal offset in pixels for the Summary Bar. Negative moves left, positive moves right.",
      scope: "world",
      config: true,
      type: Number,
      default: 20,
      range: {
        min: -250,
        max: 250,
        step: 1
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarPositionY", {
      name: "Summary Bar | Position Y",
      hint: "Vertical offset in pixels for the Summary Bar. Negative moves up, positive moves down.",
      scope: "world",
      config: true,
      type: Number,
      default: 8,
      range: {
        min: -150,
        max: 150,
        step: 1
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("summaryBarDebug", {
      name: "Summary Bar | Debug Mode",
      hint: "Logs Summary Bar diagnostics to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    registerSetting("characterSheetTweaksHideLogo", {
      name: "Character Sheet | Hide Shadowdark Logo",
      hint: "Removes the Shadowdark logo from player sheets through a managed rule in Global Style CSS.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: () => {
        globalThis.MKShadowdarkSheetStyleEditor?.syncCharacterSheetSettings?.();
        refreshOpenActorSheets();
      }
    });

    registerSetting("characterSheetTweaksHeaderBackgroundImage", {
      name: "Character Sheet | Header Background Image",
      hint: "Sets the player-sheet header image through a managed rule in Global Style CSS. File picker paths under images/ use the Foundry host root; bare filenames use modules/mk-shadowdark/assets/.",
      scope: "world",
      config: true,
      type: String,
      default: "",
      filePicker: "image",
      onChange: () => {
        globalThis.MKShadowdarkSheetStyleEditor?.syncCharacterSheetSettings?.();
        refreshOpenActorSheets();
      }
    });

    registerSetting("characterSheetTweaksDebug", {
      name: "Character Sheet | Debug Mode",
      hint: "Logs Character Sheet Tweaks debug information to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    /* -------------------- */
    /* Equipment Hands      */
    /* -------------------- */

    registerSetting("equipmentHandsEnabled", {
      name: "Equipment Hands | Enabled",
      hint: "Checks equipped weapons, shields, and hand-occupying items against available hand slots.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("equipmentHandsMode", {
      name: "Equipment Hands | Mode",
      hint: "Warn only allows the equip action but shows a warning. Block invalid equipment prevents illegal hand combinations.",
      scope: "world",
      config: true,
      type: String,
      default: "warn",
      choices: {
        warn: "Warn only",
        block: "Block invalid equipment"
      }
    });

    registerSetting("equipmentHandsMaxHands", {
      name: "Equipment Hands | Hand Slots",
      hint: "How many hands a character can use. Default 2.",
      scope: "world",
      config: true,
      type: Number,
      default: 2,
      range: {
        min: 1,
        max: 6,
        step: 1
      }
    });

    registerSetting("equipmentHandsAllowDualWield", {
      name: "Equipment Hands | Allow Dual Wielding",
      hint: "If enabled, two one-handed weapons are allowed as long as total hand slots are not exceeded.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("equipmentHandsIgnoreStashed", {
      name: "Equipment Hands | Ignore Stashed Items",
      hint: "If enabled, stashed items do not occupy hands even if marked equipped.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("equipmentHandsDebug", {
      name: "Equipment Hands | Debug Mode",
      hint: "Logs Equipment Hands debug information to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    /* -------------------- */
    /* Token Equipment      */
    /* -------------------- */

    registerSetting("tokenEquipmentEnabled", {
      name: "Token Equipment Display | Enabled",
      hint: "Shows held items and optional Quickdraw items around player tokens.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentVisibility", {
      name: "Token Equipment Display | Visibility",
      hint: "Choose who can see token equipment icons. Owner visibility also includes GMs.",
      scope: "world",
      config: true,
      type: String,
      default: "everyone",
      choices: {
        everyone: "Everyone",
        owner: "Actor owners and GMs",
        gm: "GMs only"
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentClickAction", {
      name: "Token Equipment Display | Click Action",
      hint: "Open the item sheet, use or roll the item using Shadowdark rules, or make icons display-only. Hold Shift while using an item to skip supported prompts.",
      scope: "world",
      config: true,
      type: String,
      default: "open",
      choices: {
        open: "Open item sheet",
        use: "Use or roll item",
        none: "No left-click action"
      }
    });

    registerSetting("tokenEquipmentShowQuickdraw", {
      name: "Token Equipment Display | Show Quickdraw Items",
      hint: "Shows carried Quickdraw items as a smaller row. Held and stashed items are omitted from this row.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentBorderEnabled", {
      name: "Token Equipment Display | Show Icon Frames",
      hint: "Draws a dark frame and colored border around held and Quickdraw icons. Disable this to show the item artwork without frame padding.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentBorderWidth", {
      name: "Token Equipment Display | Border Thickness",
      hint: "Border thickness as a fraction of the icon size.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.055,
      range: {
        min: 0.01,
        max: 0.15,
        step: 0.005
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldBorderColor", {
      name: "Token Equipment Display | Held Border Color",
      hint: "Border color used for equipped hand-item icons.",
      scope: "world",
      config: true,
      type: String,
      default: "#f1dfaa",
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawBorderColor", {
      name: "Token Equipment Display | Quickdraw Border Color",
      hint: "Border color used for smaller Quickdraw icons.",
      scope: "world",
      config: true,
      type: String,
      default: "#d9bd70",
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldScale", {
      name: "Token Equipment Display | Held Icon Size",
      hint: "Held icon size as a fraction of one grid space.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.38,
      range: {
        min: 0.15,
        max: 0.8,
        step: 0.01
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldOpacity", {
      name: "Token Equipment Display | Held Icon Opacity",
      hint: "Controls the transparency of held item artwork and its optional frame.",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
      range: {
        min: 0.1,
        max: 1,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldAnchor", {
      name: "Token Equipment Display | One-Handed Vertical Anchor",
      hint: "Places left- and right-hand icons near the top, middle, or bottom of the token sides.",
      scope: "world",
      config: true,
      type: String,
      default: "center",
      choices: {
        top: "Top",
        center: "Middle",
        bottom: "Bottom"
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldOffsetX", {
      name: "Token Equipment Display | Held Horizontal Offset",
      hint: "Moves all held icons horizontally in grid-space units.",
      scope: "world",
      config: true,
      type: Number,
      default: 0,
      range: {
        min: -2,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentHeldOffsetY", {
      name: "Token Equipment Display | Held Vertical Offset",
      hint: "Moves all held icons vertically in grid-space units.",
      scope: "world",
      config: true,
      type: Number,
      default: 0,
      range: {
        min: -2,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawScale", {
      name: "Token Equipment Display | Quickdraw Icon Size",
      hint: "Quickdraw icon size as a fraction of one grid space.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.22,
      range: {
        min: 0.1,
        max: 0.55,
        step: 0.01
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawOpacity", {
      name: "Token Equipment Display | Quickdraw Icon Opacity",
      hint: "Controls the transparency of Quickdraw item artwork and its optional frame.",
      scope: "world",
      config: true,
      type: Number,
      default: 1,
      range: {
        min: 0.1,
        max: 1,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawPadding", {
      name: "Token Equipment Display | Quickdraw Icon Padding",
      hint: "Adds space between neighboring Quickdraw icons as a fraction of the icon size.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.1,
      range: {
        min: 0,
        max: 1.5,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawAnchor", {
      name: "Token Equipment Display | Quickdraw Anchor",
      hint: "Anchors the Quickdraw row above, below, to the left, or to the right of the token.",
      scope: "world",
      config: true,
      type: String,
      default: "bottom",
      choices: {
        top: "Above token",
        bottom: "Below token",
        left: "Left of token",
        right: "Right of token"
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawOffsetX", {
      name: "Token Equipment Display | Quickdraw Horizontal Offset",
      hint: "Moves the Quickdraw row horizontally in grid-space units.",
      scope: "world",
      config: true,
      type: Number,
      default: 0,
      range: {
        min: -2,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentQuickdrawOffsetY", {
      name: "Token Equipment Display | Quickdraw Vertical Offset",
      hint: "Moves the Quickdraw row vertically in grid-space units.",
      scope: "world",
      config: true,
      type: Number,
      default: 0.08,
      range: {
        min: -2,
        max: 2,
        step: 0.05
      },
      onChange: refreshTokenEquipmentUi
    });

    registerSetting("tokenEquipmentDebug", {
      name: "Token Equipment Display | Debug Mode",
      hint: "Logs token equipment rendering and refresh details to the browser console.",
      scope: "world",
      config: true,
      type: Boolean,
      default: false
    });

    /* -------------------- */
    /* Time Passes          */
    /* -------------------- */

    registerSetting("timePassesEnabled", {
      name: "Time Passes | Enabled",
      hint: "If enabled, the GM can trigger a time passes splash and roll for an encounter.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("timePassesPreText", {
      name: "Time Passes | Text",
      hint: "Text shown on the first splash screen.",
      scope: "world",
      config: true,
      type: String,
      default: "time passes..."
    });

    registerSetting("timePassesEncounterText", {
      name: "Time Passes | Encounter Text",
      hint: "Text shown on the encounter splash screen when the roll triggers an encounter.",
      scope: "world",
      config: true,
      type: String,
      default: "ENCOUNTER!"
    });

    registerSetting("timePassesPreDurationMs", {
      name: "Time Passes | Duration (ms)",
      hint: "Duration of the first splash screen in milliseconds.",
      scope: "world",
      config: true,
      type: Number,
      default: 2000,
      range: {
        min: 200,
        max: 10000,
        step: 100
      }
    });

    registerSetting("timePassesEncounterDurationMs", {
      name: "Time Passes | Encounter Duration (ms)",
      hint: "Duration of the encounter splash screen in milliseconds.",
      scope: "world",
      config: true,
      type: Number,
      default: 2000,
      range: {
        min: 200,
        max: 10000,
        step: 100
      }
    });

    registerSetting("timePassesPreShowProgress", {
      name: "Time Passes | Show Progress Bar",
      hint: "If enabled, the first splash screen shows a progress bar.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("timePassesRollFormula", {
      name: "Time Passes | Roll Formula",
      hint: "Dice formula to roll after the progress bar completes. Default 1d6.",
      scope: "world",
      config: true,
      type: String,
      default: "1d6"
    });

    registerSetting("timePassesRollFlavor", {
      name: "Time Passes | Roll Flavor",
      hint: "Flavor text shown with the roll in chat.",
      scope: "world",
      config: true,
      type: String,
      default: "⏳"
    });

    registerSetting("timePassesFontFamily", {
      name: "Time Passes | Font Family",
      hint: "CSS font-family for the splash text.",
      scope: "world",
      config: true,
      type: String,
      default: "var(--font-primary, serif)"
    });

    registerSetting("timePassesTitleFontSizePx", {
      name: "Time Passes | Title Font Size (px)",
      hint: "Font size of splash titles. Default 44.",
      scope: "world",
      config: true,
      type: Number,
      default: 44,
      range: {
        min: 12,
        max: 120,
        step: 1
      }
    });

    registerSetting("timePassesEncounterShowSkull", {
      name: "Time Passes | Encounter Shows Skull Icon",
      hint: "If enabled, the encounter splash includes a skull icon inline with the text.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("timePassesSkullIconPath", {
      name: "Time Passes | Skull Icon Path",
      hint: "File path for the skull icon.",
      scope: "world",
      config: true,
      type: String,
      filePicker: "image",
      default: "icons/svg/skull.svg"
    });

    registerSetting("timePassesSkullSizePx", {
      name: "Time Passes | Skull Icon Size (px)",
      hint: "Pixel size of the skull icon. Default 34.",
      scope: "world",
      config: true,
      type: Number,
      default: 34,
      range: {
        min: 8,
        max: 128,
        step: 1
      }
    });

    /* -------------------- */
    /* Group Sheet          */
    /* -------------------- */

    registerSetting("enableGroupActors", {
      name: "Enable Group Actors",
      hint: "Adds a MK-Shadowdark group actor sheet for party members, group inventory, travel and camping task assignments, and group notes.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    registerSetting("groupSheetAssignedTokenSize", {
      name: "Group Sheet | Assigned Token Size",
      hint: "Pixel size for assigned member portrait tokens in Travel and Camping task cards.",
      scope: "world",
      config: true,
      type: Number,
      default: 28,
      range: {
        min: 20,
        max: 64,
        step: 1
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("groupSheetMemberPortraitSize", {
      name: "Group Sheet | Member Portrait Size",
      hint: "Minimum portrait width and height for character cards in the Group Sheet Members tab.",
      scope: "world",
      config: true,
      type: Number,
      default: 176,
      range: {
        min: 96,
        max: 260,
        step: 1
      },
      onChange: refreshOpenActorSheets
    });

    registerSetting("groupSheetCampingFoodKeywords", {
      name: "Group Sheet | Camping Food Keywords",
      hint: "Comma-separated item name keywords counted as food or rations in the Camping campfire summary.",
      scope: "world",
      config: true,
      type: String,
      default: "ration,rations,food",
      onChange: refreshOpenActorSheets
    });

    registerSetting("groupSheetCampingTorchKeywords", {
      name: "Group Sheet | Camping Torch Keywords",
      hint: "Comma-separated item name keywords counted as torches in the Camping campfire summary.",
      scope: "world",
      config: true,
      type: String,
      default: "torch,torches",
      onChange: refreshOpenActorSheets
    });

    registerSetting("groupSheetCampingWaterKeywords", {
      name: "Group Sheet | Camping Water Keywords",
      hint: "Comma-separated item name keywords counted as water in the Camping campfire summary.",
      scope: "world",
      config: true,
      type: String,
      default: "water,waterskin,waterskins",
      onChange: refreshOpenActorSheets
    });

    registerSetting("groupSheetTravelProgressDurationMs", {
      name: "Group Sheet | Travelling Progress Duration (ms)",
      hint: "Total Travelling splash progress duration after every traveller has rolled. Results reveal as the bar reaches Pathfind, March, Lookout, and Scavenge.",
      scope: "world",
      config: true,
      type: Number,
      default: 8000,
      range: {
        min: 1000,
        max: 60000,
        step: 500
      }
    });

    registerFeatureMenus();
  });
})();
