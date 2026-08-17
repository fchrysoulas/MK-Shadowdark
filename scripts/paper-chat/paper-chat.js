(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Paper Chat";
  const ENABLED_SETTING = "paperChatEnabled";
  const STYLE_SETTING = "paperChatStyle";
  const APPLY_TO_CHARACTER_SHEETS_SETTING = "paperChatApplyToCharacterSheets";
  const BODY_CLASS = "mk-paper-chat";
  const SHEET_CLASS = "mk-paper-chat-sheet";
  const DEFAULT_STYLE = "parchment-scroll";
  const STYLE_CLASSES = Object.freeze({
    "parchment-scroll": "mk-paper-chat--parchment-scroll",
    "clean-parchment": "mk-paper-chat--clean-parchment",
    "dark-grimoire": "mk-paper-chat--dark-grimoire",
    "torn-field-note": "mk-paper-chat--torn-field-note",
    "illuminated-manuscript": "mk-paper-chat--illuminated-manuscript",
    "dungeon-ledger": "mk-paper-chat--dungeon-ledger",
    "crimson-dispatch": "mk-paper-chat--crimson-dispatch",
    "moonlit-arcana": "mk-paper-chat--moonlit-arcana",
    "obsidian-sun": "mk-paper-chat--obsidian-sun",
    "tyrants-decree": "mk-paper-chat--tyrants-decree",
    "silt-sea-chart": "mk-paper-chat--silt-sea-chart",
    "bloodsand-arena": "mk-paper-chat--bloodsand-arena"
  });
  const ACTOR_SHEET_RENDER_HOOKS = Object.freeze([
    "renderActorSheet",
    "renderActorSheetSD",
    "renderPlayerSheetSD",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ]);

  globalThis.MKShadowdarkPaperChat = {
    applyPaperChat
  };

  Hooks.once("init", () => {
    applyPaperChat();
    log("initialized");
  });

  Hooks.once("ready", applyPaperChat);

  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      try {
        applyPaperThemeToCharacterSheet(app, html);
      } catch (error) {
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | character-sheet theme error`, error);
      }
    });
  }

  function applyPaperChat() {
    let enabled = true;
    let style = DEFAULT_STYLE;

    try {
      enabled = Boolean(game.settings.get(MODULE_ID, ENABLED_SETTING));
      style = String(game.settings.get(MODULE_ID, STYLE_SETTING) ?? DEFAULT_STYLE);
    } catch (_error) {
      // Keep the default until the setting has been registered.
    }

    if (!STYLE_CLASSES[style]) style = DEFAULT_STYLE;

    const body = document.body;
    if (!body) return;

    body.classList.toggle(BODY_CLASS, enabled);
    for (const className of Object.values(STYLE_CLASSES)) {
      body.classList.remove(className);
    }
    if (enabled) body.classList.add(STYLE_CLASSES[style]);
  }

  function applyPaperThemeToCharacterSheet(app, html) {
    const root = getRootElement(html);
    if (!root?.querySelector) return;

    const actor = app?.actor ?? app?.object;
    if (!isPlayerActor(actor)) return;

    const sheet = getSheetElement(root);
    if (!sheet) return;

    sheet.classList.remove(SHEET_CLASS, ...Object.values(STYLE_CLASSES));
    if (!getSetting(APPLY_TO_CHARACTER_SHEETS_SETTING, false)) return;

    const style = getCurrentStyle();
    sheet.classList.add(SHEET_CLASS, STYLE_CLASSES[style]);
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetElement(root) {
    if (root.matches?.(".shadowdark.sheet.player")) return root;
    return root.querySelector?.(".shadowdark.sheet.player")
      ?? root.querySelector?.("form.shadowdark.sheet");
  }

  function isPlayerActor(actor) {
    if (!actor || actor.documentName !== "Actor") return false;
    if (String(actor.type ?? "").toLowerCase() !== "player") return false;
    try {
      return !actor.getFlag?.(MODULE_ID, "isGroup");
    } catch (_error) {
      return !actor?._source?.flags?.[MODULE_ID]?.isGroup;
    }
  }

  function getCurrentStyle() {
    const style = String(getSetting(STYLE_SETTING, DEFAULT_STYLE) ?? DEFAULT_STYLE);
    return STYLE_CLASSES[style] ? style : DEFAULT_STYLE;
  }

  function getSetting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_error) {
      return fallback;
    }
  }

  function getModuleVersion() {
    const module = game.modules.get(MODULE_ID);
    return module?.version ?? module?.data?.version ?? "unknown";
  }

  function log(...args) {
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }
})();
