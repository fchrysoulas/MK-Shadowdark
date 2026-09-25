import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { buildGmScreenViewModel } from "./view-model.js";

const MODULE_ID = "mk-shadowdark";
const APP_ID = "mk-shadowdark-gm-screen";
const SETTINGS_APP_ID = "mk-shadowdark-gm-screen-settings";
const CONTROL_TOOL_ID = "mk-shadowdark-gm-screen";
const ACTIVE_PARTY_STATUS_RENDER_DELAY = 50;

let gmScreen = null;
let activePartyStatusRenderTimer = null;

function notifyGmOnly() {
  if (!isGmScreenEnabled()) return;
  globalThis.ui?.notifications?.warn?.("The MK-Shadowdark GM Screen is available to GMs only.");
}

function isGmScreenEnabled() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "gmScreenEnabled") !== false;
  } catch (_error) {
    return true;
  }
}

function canUseGmScreen() {
  return isGmScreenEnabled() && Boolean(globalThis.game?.user?.isGM);
}

function changesTouchPath(changes, path) {
  const targetPath = String(path ?? "").trim();
  if (!targetPath || !changes || typeof changes !== "object") return false;

  return Object.keys(changes).some(key => {
    const changedPath = String(key ?? "").trim();
    return changedPath === targetPath
      || changedPath.startsWith(`${targetPath}.`)
      || targetPath.startsWith(`${changedPath}.`);
  });
}

function actorUuidCandidates(actor) {
  return [
    actor?.uuid,
    actor?.baseActor?.uuid,
    actor?.parent?.uuid,
    actor?.id ? `Actor.${actor.id}` : "",
  ]
    .map(value => String(value ?? "").trim())
    .filter(Boolean);
}

function activePartyActorUuids(application = gmScreen) {
  const root = application?.element;
  const cards = root?.querySelectorAll?.("[data-actor-uuid]") ?? [];
  return new Set(Array.from(cards)
    .map(card => String(card?.dataset?.actorUuid ?? "").trim())
    .filter(Boolean));
}

function isActivePartyActor(actor, application = gmScreen) {
  const partyUuids = activePartyActorUuids(application);
  return actorUuidCandidates(actor).some(uuid => partyUuids.has(uuid));
}

function isLightSourceItem(item) {
  const light = item?.system?.light;
  return Boolean(light?.isSource === true && light?.active === true);
}

function itemActor(item) {
  return item?.actor ?? item?.parent ?? null;
}

function shouldRenderForActorUpdate(actor, changes, application = gmScreen) {
  return isGmScreenEnabled()
    && isActivePartyActor(actor, application)
    && changesTouchPath(changes, "system.attributes.hp");
}

function shouldRenderForTokenUpdate(token, changes, application = gmScreen) {
  const touchesHp = [
    "delta.system.attributes.hp",
    "actorData.system.attributes.hp",
    "system.attributes.hp",
  ].some(path => changesTouchPath(changes, path));

  return isGmScreenEnabled() && touchesHp && isActivePartyActor(token?.actor, application);
}

function shouldRenderForItemUpdate(item, changes, application = gmScreen) {
  return isGmScreenEnabled()
    && isActivePartyActor(itemActor(item), application)
    && changesTouchPath(changes, "system.light");
}

function shouldRenderForItemLifecycle(item, application = gmScreen) {
  return isGmScreenEnabled()
    && isActivePartyActor(itemActor(item), application)
    && isLightSourceItem(item);
}

function scheduleActivePartyStatusRender(application = gmScreen) {
  if (!isGmScreenEnabled()) return false;
  if (!application?.rendered || typeof application.render !== "function") return false;
  if (activePartyStatusRenderTimer !== null) return true;

  const schedule = globalThis.setTimeout;
  if (typeof schedule !== "function") {
    void application.render({ force: true });
    return true;
  }

  activePartyStatusRenderTimer = schedule(() => {
    activePartyStatusRenderTimer = null;
    if (!application.rendered) return;
    void Promise.resolve()
      .then(() => application.render({ force: true }))
      .catch(error => {
        console.error("mk-shadowdark | GM Screen | Active Party status refresh failed", error);
      });
  }, ACTIVE_PARTY_STATUS_RENDER_DELAY);
  return true;
}

function clearActivePartyStatusRenderTimer() {
  if (activePartyStatusRenderTimer === null) return;
  globalThis.clearTimeout?.(activePartyStatusRenderTimer);
  activePartyStatusRenderTimer = null;
}

function registerActivePartyStatusRefresh() {
  const hooks = globalThis.Hooks;
  if (typeof hooks?.on !== "function") return false;

  hooks.on("updateActor", (actor, changes) => {
    if (shouldRenderForActorUpdate(actor, changes)) scheduleActivePartyStatusRender();
  });

  hooks.on("updateToken", (token, changes) => {
    if (shouldRenderForTokenUpdate(token, changes)) scheduleActivePartyStatusRender();
  });

  hooks.on("createItem", item => {
    if (shouldRenderForItemLifecycle(item)) scheduleActivePartyStatusRender();
  });

  hooks.on("updateItem", (item, changes) => {
    if (shouldRenderForItemUpdate(item, changes)) scheduleActivePartyStatusRender();
  });

  hooks.on("deleteItem", item => {
    if (shouldRenderForItemLifecycle(item)) scheduleActivePartyStatusRender();
  });

  return true;
}

async function actionSelectGroup(_event, target) {
  const groupActorUuid = String(target?.value ?? target?.dataset?.groupUuid ?? "").trim();
  if (!groupActorUuid || groupActorUuid === this.groupActorUuid) return this;
  this.groupActorUuid = groupActorUuid;
  return this.render({ force: true });
}

async function actionCreateGroup() {
  if (!canUseGmScreen()) {
    notifyGmOnly();
    return null;
  }

  const createGroup = globalThis.game?.mkShadowdark?.createGroupActor
    ?? globalThis.game?.shadowdarkExtras?.createGroupActor;
  if (typeof createGroup !== "function") {
    globalThis.ui?.notifications?.warn?.("Group creation is unavailable.");
    return null;
  }

  const actor = await createGroup();
  if (actor) {
    this.groupActorUuid = String(actor.uuid ?? actor.id ?? "");
    await this.render?.({ force: true });
  }
  return actor ?? null;
}

async function actionOpenMember(_event, target) {
  const actor = await resolveActorFromUuid(String(target?.dataset?.actorUuid ?? ""));
  if (!actor) return null;
  actor.sheet?.render?.(true);
  return actor;
}

async function actionTimePasses(_event, target) {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.timePasses;
  const rollTimePasses = api?.roll ?? api?.timePasses;

  if (typeof rollTimePasses !== "function") {
    globalThis.ui?.notifications?.warn?.("Time Passes is unavailable.");
    return null;
  }

  return rollTimePasses();
}

async function actionToggleTables() {
  this.tablesCollapsed = !this.tablesCollapsed;
  await this.render?.({ force: true });
  return this.tablesCollapsed;
}

function bindActiveGroupSelector(application) {
  const select = application?.element?.querySelector?.("[data-mk-gm-active-group]");
  if (!select || select.dataset.mkGmActiveGroupBound === "true") return false;

  select.dataset.mkGmActiveGroupBound = "true";
  select.addEventListener("change", event => {
    void actionSelectGroup.call(application, event, select).catch(error => {
      console.error("mk-shadowdark | GM Screen | Active Group selection failed", error);
      globalThis.ui?.notifications?.error?.("Active Group selection failed: " + error.message);
    });
  });
  return true;
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

class MKGMscreen extends ApplicationBase {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["mk-shadowdark-gm-screen-window"],
    position: {
      width: 1180,
      height: 760,
    },
    window: {
      title: "MK-Shadowdark GM Screen",
      icon: "fa-solid fa-shield-halved",
      resizable: true,
    },
    actions: {
      selectGroup: actionSelectGroup,
      createGroup: actionCreateGroup,
      openMember: actionOpenMember,
      timePasses: actionTimePasses,
      toggleTables: actionToggleTables,
    },
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/gm-screen.hbs`,
    },
  };

  constructor(options = {}) {
    super(options);
    this.groupActorUuid = String(options.groupActorUuid ?? "");
    this.encounterZoneId = String(options.encounterZoneId ?? "");
    this.tablesCollapsed = false;
  }

  async _prepareContext(options) {
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};

    if (!canUseGmScreen()) return { ...context, denied: true };

    const view = await buildGmScreenViewModel({
      groupActorUuid: this.groupActorUuid,
    });

    this.groupActorUuid = view.groupActorUuid;

    return {
      ...context,
      ...view,
      tablesCollapsed: this.tablesCollapsed,
      denied: false,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    bindActiveGroupSelector(this);
  }
}

function getGmScreen() {
  return gmScreen;
}

function openGmScreen({ groupActorUuid = "" } = {}) {
  if (!canUseGmScreen()) {
    notifyGmOnly();
    return null;
  }

  if (!ApplicationV2 || !HandlebarsApplicationMixin) {
    globalThis.ui?.notifications?.error?.("Foundry ApplicationV2 is unavailable; the GM Screen cannot open.");
    return null;
  }

  if (!gmScreen) {
    gmScreen = new MKGMscreen({ groupActorUuid });
  } else {
    if (groupActorUuid) gmScreen.groupActorUuid = String(groupActorUuid);
  }

  gmScreen.render({ force: true });
  return gmScreen;
}

async function closeGmScreen() {
  if (!gmScreen) return null;
  clearActivePartyStatusRenderTimer();
  if (gmScreen.rendered && typeof gmScreen.close === "function") {
    await gmScreen.close();
  }
  return gmScreen;
}

async function toggleGmScreen(options = {}) {
  if (!canUseGmScreen()) {
    notifyGmOnly();
    return null;
  }

  if (gmScreen?.rendered) {
    await closeGmScreen();
    return gmScreen;
  }

  return openGmScreen(options);
}

function registerSceneControl() {
  globalThis.Hooks?.on?.("getSceneControlButtons", controls => {
    if (!canUseGmScreen()) return;

    const tokenControl = controls?.tokens;
    if (!tokenControl?.tools) return;

    tokenControl.tools[CONTROL_TOOL_ID] = {
      name: CONTROL_TOOL_ID,
      title: "MK-Shadowdark GM Screen",
      icon: "fa-solid fa-shield-halved",
      order: Object.keys(tokenControl.tools).length,
      button: true,
      visible: true,
      onChange: () => {
        void toggleGmScreen();
      },
    };
  });
}

function exposeGmScreenApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;

  module.api ??= {};
  module.api.gmScreen = {
    open: openGmScreen,
    close: closeGmScreen,
    toggle: toggleGmScreen,
    get application() {
      return getGmScreen();
    },
  };

  return module.api.gmScreen;
}

function registerGmScreen() {
  globalThis.Hooks?.once?.("init", () => {
    if (isGmScreenEnabled()) registerSceneControl();
  });

  globalThis.Hooks?.once?.("ready", () => {
    exposeGmScreenApi();
    if (isGmScreenEnabled()) registerActivePartyStatusRefresh();
  });
}

registerGmScreen();

export {
  changesTouchPath,
  isActivePartyActor,
  isLightSourceItem,
  shouldRenderForActorUpdate,
  shouldRenderForItemLifecycle,
  shouldRenderForItemUpdate,
  shouldRenderForTokenUpdate,
};

export {
  MODULE_ID,
  APP_ID,
  SETTINGS_APP_ID,
  CONTROL_TOOL_ID,
  MKGMscreen,
  canUseGmScreen,
  isGmScreenEnabled,
  getGmScreen,
  openGmScreen,
  closeGmScreen,
  toggleGmScreen,
  exposeGmScreenApi,
  registerGmScreen,
};
