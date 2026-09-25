import {
  APP_ID,
  MODULE_ID,
  SETTINGS_APP_ID,
  canUseGmScreen,
} from "./gm-screen.js";
import {
  isQuickActionEnabled,
  setQuickActionEnabled,
} from "./overview-links.js";

// Every non-home feature tab declares its Home card and Quick Action toggle here so new settings features cannot omit visibility controls.
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
    overviewTool: "encounters",
    homeTitle: "Encounter Zones",
    homeDescription: "Configure named terrain grids and the three supporting RollTables used by Roll Encounter. Trap and Hazard tables are configured separately.",
  }),
  Object.freeze({
    id: "trap-generator",
    label: "Trap Generator",
    icon: "fa-spider",
    group: "GM Screen",
    overviewTool: "trap-generator",
    homeTitle: "Trap Generator",
    homeDescription: "Assign three Scene-owned RollTables for generating trap results independently from normal encounters.",
  }),
  Object.freeze({
    id: "hazard-generator",
    label: "Hazard Generator",
    icon: "fa-triangle-exclamation",
    group: "GM Screen",
    overviewTool: "hazard-generator",
    homeTitle: "Hazard Generator",
    homeDescription: "Assign three Scene-owned RollTables for generating hazard results independently from normal encounters.",
  }),
  Object.freeze({
    id: "compositions",
    label: "NPC Generator",
    icon: "fa-font",
    group: "GM Screen",
    overviewTool: "npc-generator",
    homeTitle: "NPC Generator",
    homeDescription: "Choose the RollTables used to build NPC names, identifiers, and traits for this Scene.",
  }),
  Object.freeze({
    id: "monster-generator",
    label: "Monster Generator",
    icon: "fa-skull-crossbones",
    group: "GM Screen",
    overviewTool: "monster-generator",
    homeTitle: "Monster Generator",
    homeDescription: "Choose the RollTables used to build monster combat traits, strengths, weaknesses, and mutations for this Scene.",
  }),
  Object.freeze({
    id: "magic-item-generator",
    label: "Magic Item Generator",
    icon: "fa-wand-sparkles",
    group: "GM Screen",
    overviewTool: "magic-item-generator",
    homeTitle: "Magic Item Generator",
    homeDescription: "Choose the RollTables used to build magic item types, qualities, and personalities for this Scene.",
  }),
  Object.freeze({
    id: "tavern-generator",
    label: "Tavern Generator",
    icon: "fa-beer-mug-empty",
    group: "GM Screen",
    overviewTool: "tavern-generator",
    homeTitle: "Tavern Generator",
    homeDescription: "Choose the RollTables used to build the tavern name, Wealth, Known For result, and tiered food and drink lists for this Scene.",
  }),
  Object.freeze({
    id: "shop-generator",
    label: "Shop Generator",
    icon: "fa-store",
    group: "GM Screen",
    overviewTool: "shop-generator",
    homeTitle: "Shop Generator",
    homeDescription: "Choose the RollTables used to roll shop quality, names, Known For results, and Interesting Customer results for this Scene.",
  }),
  Object.freeze({
    id: "location-generator",
    label: "Location Generator",
    icon: "fa-map-location-dot",
    group: "GM Screen",
    overviewTool: "location-generator",
    homeTitle: "Create Location",
    homeDescription: "Choose the RollTables used to build the Descriptor, Location, and Feature results for this Scene.",
  }),
]);

let gmScreenSettings = null;

function normalizeSettingsTab(value) {
  const tab = String(value ?? "home").trim().toLowerCase();
  return GM_SCREEN_SETTINGS_TABS.some(entry => entry.id === tab) ? tab : "home";
}

function buildSettingsViewModel(activeTab = "home", user = globalThis.game?.user) {
  const resolvedTab = normalizeSettingsTab(activeTab);
  return {
    activeTab: resolvedTab,
    tabs: GM_SCREEN_SETTINGS_TABS.map(tab => ({
      ...tab,
      active: tab.id === resolvedTab,
    })),
    homeFeatures: GM_SCREEN_SETTINGS_TABS
      .filter(tab => tab.id !== "home" && tab.overviewTool)
      .map(tab => ({
        ...tab,
        quickActionEnabled: isQuickActionEnabled(tab.overviewTool, user),
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
      ...buildSettingsViewModel(this.settingsTab, globalThis.game?.user),
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

function bindQuickActionToggles(application, element) {
  if (!isGmScreenSettingsApplication(application) || !canUseGmScreen()) return false;

  const root = element?.querySelector || element?.querySelectorAll
    ? element
    : element?.[0]?.querySelector
      ? element[0]
      : null;
  const toggles = root?.querySelectorAll?.("[data-mk-gm-quick-action-toggle]") ?? [];
  toggles.forEach(toggle => {
    if (toggle.dataset.mkGmQuickActionToggleBound === "true") return;
    toggle.dataset.mkGmQuickActionToggleBound = "true";
    toggle.addEventListener("change", async event => {
      const input = event.currentTarget ?? event.target;
      const id = String(input?.dataset?.mkGmQuickActionToggle ?? "").trim();
      const enabled = Boolean(input?.checked);
      if (!id) return;
      input.disabled = true;
      try {
        await setQuickActionEnabled(id, enabled);
      } catch (error) {
        input.checked = !enabled;
        globalThis.ui?.notifications?.error?.(`Quick Action visibility could not be saved: ${error.message}`);
      } finally {
        input.disabled = false;
      }
    });
  });
  return toggles.length > 0;
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
    bindQuickActionToggles(application, element);
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
  bindQuickActionToggles,
  bindSettingsLauncher,
  exposeGmScreenSettingsApi,
  registerGmScreenSettings,
};
