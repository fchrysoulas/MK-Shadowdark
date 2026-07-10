(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Settings";

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

    game.settings.register(MODULE_ID, key, data);
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

  function getRootElement(html) {
    if (!html) return null;
    if (html instanceof HTMLElement) return html;
    if (html[0] instanceof HTMLElement) return html[0];
    return null;
  }

  Hooks.once("init", () => {
    log("registering settings");

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
      name: "Death Timer | Enable Sheet Button",
      hint: "Injects a skull button into the Shadowdark actor sheet header.",
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
      hint: "Tooltip shown when hovering the Death Timer sheet button.",
      scope: "world",
      config: true,
      type: String,
      default: "Death Timer",
      onChange: refreshOpenActorSheets
    });

    registerSetting("deathTimerIcon", {
      name: "Death Timer | Icon Class",
      hint: "Font Awesome icon class for the sheet button. Example: fa-solid fa-skull.",
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
      hint: "Moves quickdraw-marked items to the top of inventory lists only.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("quickdrawLimit", {
      name: "Quickdraw | Limit",
      hint: "Maximum number of items a character may mark as Quickdraw.",
      scope: "world",
      config: true,
      type: Number,
      default: 3,
      range: {
        min: 0,
        max: 20,
        step: 1
      },
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

    registerSetting("characterSheetTweaksSummaryBar", {
      name: "Character Sheet | Summary Bar",
      hint: "Adds a compact floating summary bar to the Shadowdark player sheet.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksBarElements", {
      name: "Character Sheet | Bar Elements",
      hint: "Comma-separated list of bar elements, in display order. Available: LVL, HP, AC, XP, LUCK, SLOTS, STR, DEX, CON, INT, WIS, CHA. Use | to add a vertical divider.",
      scope: "world",
      config: true,
      type: String,
      default: "HP, LUCK,|,STR,DEX,CON,INT,WIS,CHA, SLOTS",
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksHighlightEquipped", {
      name: "Character Sheet | Highlight Quickdraw Items",
      hint: "Highlights Quickdraw rows in Shadowdark inventory lists. Equipped items are not highlighted unless they are also Quickdraw.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksFontScale", {
      name: "Character Sheet | Extra UI Font Scale",
      hint: "Adjusts only the MK-Shadowdark summary bar font size.",
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
      name: "Character Sheet | Bar Value Font Size",
      hint: "Font size in pixels for the value line inside each character sheet bar element.",
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
      name: "Character Sheet | Bar Button Radius",
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
      name: "Character Sheet | Bar Button Scale",
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
      name: "Character Sheet | Bar Position X",
      hint: "Horizontal offset in pixels for the floating character sheet bar. Negative moves left, positive moves right.",
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
      name: "Character Sheet | Bar Position Y",
      hint: "Vertical offset in pixels for the floating character sheet bar. Negative moves up, positive moves down.",
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

    registerSetting("characterSheetTweaksHideLogo", {
      name: "Character Sheet | Hide Shadowdark Logo",
      hint: "Removes the Shadowdark logo text from the top of player character sheets.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshOpenActorSheets
    });

    registerSetting("characterSheetTweaksHeaderBackgroundImage", {
      name: "Character Sheet | Header Background Image",
      hint: "Optional image path for the player sheet header background. File picker paths under images/ are read from the Foundry host root; bare filenames are read from modules/mk-shadowdark/assets/.",
      scope: "world",
      config: true,
      type: String,
      default: "",
      filePicker: "image",
      onChange: refreshOpenActorSheets
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
  });

  /* -------------------------------------------- */
  /* Settings Page Headers                        */
  /* -------------------------------------------- */

  Hooks.on("renderSettingsConfig", (_app, html) => {
    try {
      injectSettingHeaders(html);
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | settings header inject error`, err);
    }
  });

  function injectSettingHeaders(html) {
    const root = getRootElement(html);
    if (!root?.querySelector) return;
    if (root.querySelector(".sdx-setting-header")) return;

    const groups = [
      { title: "Auto Damage", firstKey: "autoDamageEnabled" },
      { title: "Token Shadows", firstKey: "tokenShadowsEnabled" },
      { title: "Death Timer", firstKey: "deathTimerEnabled" },
      { title: "Editable Quantity", firstKey: "editableQtyEnabled" },
      { title: "Quickdraw", firstKey: "quickdrawIconEnabled" },
      { title: "Character Sheet", firstKey: "characterSheetTweaksEnabled" },
      { title: "Equipment Hands", firstKey: "equipmentHandsEnabled" },
      { title: "Time Passes", firstKey: "timePassesEnabled" },
      { title: "Group Sheet", firstKey: "enableGroupActors" }
    ];

    for (const group of groups) {
      const settingGroup = findSettingFormGroup(root, group.firstKey);
      if (!settingGroup) continue;

      settingGroup.insertAdjacentHTML("beforebegin", `<h3 class="sdx-setting-header">${group.title}</h3>`);
    }
  }

  function findSettingFormGroup(root, key) {
    let el = root.querySelector(`[name="${MODULE_ID}.${key}"]`);
    if (el) return el.closest(".form-group");

    el = root.querySelector(`.form-group[data-setting-id="${MODULE_ID}.${key}"]`);
    if (el) return el;

    return null;
  }
})();
