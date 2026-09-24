import {
  APP_ID,
  MODULE_ID,
  SETTINGS_APP_ID,
  canUseGmScreen,
} from "./gm-screen.js";
import {
  overviewToolUuid,
} from "./overview-links.js";

const GM_SCREEN_SETTINGS_TABS = Object.freeze([
  Object.freeze({
    id: "home",
    label: "Home",
    icon: "fa-house",
    group: "GM Screen",
  }),
  Object.freeze({
    id: "encounters",
    label: "Encounters",
    icon: "fa-dice-d20",
    group: "GM Screen",
  }),
  Object.freeze({
    id: "compositions",
    label: "NPC Generator",
    icon: "fa-font",
    group: "GM Screen",
  }),
  Object.freeze({
    id: "tavern-generator",
    label: "Tavern Generator",
    icon: "fa-beer-mug-empty",
    group: "GM Screen",
  }),
]);

let gmScreenSettings = null;

function normalizeSettingsTab(value) {
  const tab = String(value ?? "home").trim().toLowerCase();
  return GM_SCREEN_SETTINGS_TABS.some(entry => entry.id === tab) ? tab : "home";
}

function buildSettingsViewModel(activeTab = "home") {
  const resolvedTab = normalizeSettingsTab(activeTab);
  return {
    activeTab: resolvedTab,
    tabs: GM_SCREEN_SETTINGS_TABS.map(tab => ({
      ...tab,
      active: tab.id === resolvedTab,
    })),
  };
}

async function actionSettingsTab(_event, target) {
  this.settingsTab = normalizeSettingsTab(target?.dataset?.settingsTab);
  return this.render({ force: true });
}

function applicationClasses() {
  const api = globalThis.foundry?.applications?.api;
  return {
    ApplicationV2: api?.ApplicationV2,
    HandlebarsApplicationMixin: api?.HandlebarsApplicationMixin,
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = applicationClasses();
const ApplicationBase = ApplicationV2 && HandlebarsApplicationMixin
  ? HandlebarsApplicationMixin(ApplicationV2)
  : class {};

class MKGMscreenSettings extends ApplicationBase {
  static DEFAULT_OPTIONS = {
    id: SETTINGS_APP_ID,
    classes: ["mk-shadowdark-gm-screen-settings-window"],
    position: {
      width: 980,
      height: 700,
    },
    window: {
      title: "GM Screen Settings",
      icon: "fa-solid fa-cog",
      resizable: true,
    },
    actions: {
      settingsTab: actionSettingsTab,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/gm-screen-settings.hbs`,
    },
  };

  constructor(options = {}) {
    super(options);
    this.settingsTab = normalizeSettingsTab(options.settingsTab ?? "home");
  }

  async _prepareContext(options) {
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};

    if (!canUseGmScreen()) return { ...context, denied: true };

    return {
      ...context,
      ...buildSettingsViewModel(this.settingsTab),
      denied: false,
    };
  }
}

function getGmScreenSettings() {
  return gmScreenSettings;
}

function openGmScreenSettings({ settingsTab = null } = {}) {
  if (!canUseGmScreen()) {
    globalThis.ui?.notifications?.warn?.("GM Screen Settings are available to GMs only.");
    return null;
  }

  if (!ApplicationV2 || !HandlebarsApplicationMixin) {
    globalThis.ui?.notifications?.error?.("Foundry ApplicationV2 is unavailable; GM Screen Settings cannot open.");
    return null;
  }

  if (!gmScreenSettings) {
    gmScreenSettings = new MKGMscreenSettings({
      settingsTab: settingsTab ?? "home",
    });
  } else if (settingsTab !== null && settingsTab !== undefined) {
    gmScreenSettings.settingsTab = normalizeSettingsTab(settingsTab);
  }

  gmScreenSettings.render({ force: true });
  return gmScreenSettings;
}

async function closeGmScreenSettings() {
  if (!gmScreenSettings) return null;
  if (gmScreenSettings.rendered && typeof gmScreenSettings.close === "function") {
    await gmScreenSettings.close();
  }
  return gmScreenSettings;
}

async function toggleGmScreenSettings(options = {}) {
  if (!canUseGmScreen()) {
    globalThis.ui?.notifications?.warn?.("GM Screen Settings are available to GMs only.");
    return null;
  }

  if (gmScreenSettings?.rendered) {
    await closeGmScreenSettings();
    return gmScreenSettings;
  }

  return openGmScreenSettings(options);
}

function isGmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function isGmScreenSettingsApplication(application) {
  return Boolean(
    application
    && (
      application.id === SETTINGS_APP_ID
      || application.options?.id === SETTINGS_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === SETTINGS_APP_ID
    )
  );
}

function bindOverviewToolSources(_application, element) {
  if (!canUseGmScreen()) return false;

  const root = element?.querySelector || element?.querySelectorAll
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const buttons = root?.querySelectorAll?.("[data-mk-gm-overview-tool]") ?? [];
  buttons.forEach(button => {
    if (button.dataset.mkGmOverviewToolBound === "true") return;
    button.dataset.mkGmOverviewToolBound = "true";
    button.addEventListener("dragstart", event => {
      const uuid = overviewToolUuid(button.dataset.mkGmOverviewTool);
      if (!uuid || !event.dataTransfer) return;
      const payload = JSON.stringify({
        uuid,
        type: "mk-shadowdark.gm-screen-tool",
      });
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", payload);
      event.dataTransfer.setData("application/json", payload);
      event.dataTransfer.setData("text/uri-list", uuid);
    });
  });
  return buttons.length > 0;
}

function bindSettingsLauncher(application, element) {
  if (!isGmScreenApplication(application) || !canUseGmScreen()) return false;

  const actions = element?.querySelector?.(".mk-gm-header-actions");
  if (!actions || actions.querySelector?.("[data-mk-gm-open-settings]")) return false;

  const document = actions.ownerDocument ?? globalThis.document;
  const button = document?.createElement?.("button");
  if (!button) return false;

  button.type = "button";
  button.className = "mk-gm-settings-launcher";
  button.dataset.mkGmOpenSettings = "true";
  button.title = "Open GM Screen Settings";
  button.setAttribute("aria-label", "Open GM Screen Settings");
  button.innerHTML = '<i class="fas fa-cog" aria-hidden="true"></i>';
  button.addEventListener("click", () => {
    openGmScreenSettings();
  });
  actions.append(button);
  return true;
}

function exposeGmScreenSettingsApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.gmScreen ??= {};
  module.api.gmScreen.settings = {
    open: openGmScreenSettings,
    close: closeGmScreenSettings,
    toggle: toggleGmScreenSettings,
    get application() {
      return getGmScreenSettings();
    },
  };

  return module.api.gmScreen.settings;
}

function registerGmScreenSettings() {
  const bindRenderedSettings = (application, element) => {
    bindSettingsLauncher(application, element);
    bindOverviewToolSources(application, element);
  };
  globalThis.Hooks?.on?.("renderApplicationV2", bindRenderedSettings);
  globalThis.Hooks?.on?.("renderApplication", bindRenderedSettings);

  globalThis.Hooks?.once?.("ready", () => {
    exposeGmScreenSettingsApi();
  });
}

registerGmScreenSettings();

export {
  GM_SCREEN_SETTINGS_TABS,
  SETTINGS_APP_ID,
  MKGMscreenSettings,
  normalizeSettingsTab,
  buildSettingsViewModel,
  getGmScreenSettings,
  openGmScreenSettings,
  closeGmScreenSettings,
  toggleGmScreenSettings,
  isGmScreenApplication,
  isGmScreenSettingsApplication,
  bindOverviewToolSources,
  bindSettingsLauncher,
  exposeGmScreenSettingsApi,
  registerGmScreenSettings,
};
