import { resolveActorFromUuid } from "../group-sheet/actors.js";
import { openGroupMemberStatus } from "../group-sheet/member-status.js";
import {
  buildGmScreenViewModel,
  normalizeWorkspace,
  resolveGmScreenGroup,
} from "./view-model.js";

const MODULE_ID = "mk-shadowdark";
const APP_ID = "mk-shadowdark-gm-screen";
const SETTINGS_APP_ID = "mk-shadowdark-gm-screen-settings";
const CONTROL_TOOL_ID = "mk-shadowdark-gm-screen";

let gmScreen = null;

function notifyGmOnly() {
  globalThis.ui?.notifications?.warn?.("The MK-Shadowdark GM Screen is available to GMs only.");
}

function canUseGmScreen() {
  return Boolean(globalThis.game?.user?.isGM);
}

function notifyNoGroup() {
  globalThis.ui?.notifications?.warn?.("No MK-Shadowdark Group is available.");
}

async function selectedGroup(app) {
  return resolveGmScreenGroup(app?.groupActorUuid ?? "");
}

async function actionWorkspace(_event, target) {
  this.workspace = normalizeWorkspace(target?.dataset?.workspace);
  return this.render({ force: true });
}

async function actionSelectGroup(_event, target) {
  this.groupActorUuid = String(target?.dataset?.groupUuid ?? "");
  this.workspace = "overview";
  return this.render({ force: true });
}

async function actionOpenGroup() {
  const group = await selectedGroup(this);
  if (!group) {
    notifyNoGroup();
    return null;
  }
  group.sheet?.render?.(true);
  return group;
}

async function actionOpenMember(_event, target) {
  const actor = await resolveActorFromUuid(String(target?.dataset?.actorUuid ?? ""));
  if (!actor) return null;
  actor.sheet?.render?.(true);
  return actor;
}

async function actionInspectMember(_event, target) {
  return openGroupMemberStatus(String(target?.dataset?.actorUuid ?? ""));
}

async function actionTimePasses(_event, target) {
  const selector = target?.closest?.(".mk-gm-time-passes")
    ?.querySelector?.("[data-time-passes-dice]");
  const diceCount = Math.min(3, Math.max(1, Number(selector?.value) || 1));
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.timePasses;
  const rollTimePasses = api?.roll ?? api?.timePasses;

  if (typeof rollTimePasses !== "function") {
    globalThis.ui?.notifications?.warn?.("Time Passes is unavailable.");
    return null;
  }

  return rollTimePasses({ diceCount });
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
      workspace: actionWorkspace,
      selectGroup: actionSelectGroup,
      openGroup: actionOpenGroup,
      openMember: actionOpenMember,
      inspectMember: actionInspectMember,
      timePasses: actionTimePasses,
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
    this.workspace = normalizeWorkspace(options.workspace ?? "overview");
  }

  async _prepareContext(options) {
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};

    if (!canUseGmScreen()) return { ...context, denied: true };

    const view = await buildGmScreenViewModel({
      groupActorUuid: this.groupActorUuid,
      workspace: this.workspace,
    });

    this.groupActorUuid = view.groupActorUuid;
    this.workspace = view.workspace;

    return {
      ...context,
      ...view,
      denied: false,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
  }
}

function getGmScreen() {
  return gmScreen;
}

function openGmScreen({ groupActorUuid = "", workspace = "overview" } = {}) {
  if (!canUseGmScreen()) {
    notifyGmOnly();
    return null;
  }

  if (!ApplicationV2 || !HandlebarsApplicationMixin) {
    globalThis.ui?.notifications?.error?.("Foundry ApplicationV2 is unavailable; the GM Screen cannot open.");
    return null;
  }

  if (!gmScreen) {
    gmScreen = new MKGMscreen({ groupActorUuid, workspace });
  } else {
    if (groupActorUuid) gmScreen.groupActorUuid = String(groupActorUuid);
    gmScreen.workspace = normalizeWorkspace(workspace ?? gmScreen.workspace);
  }

  gmScreen.render({ force: true });
  return gmScreen;
}

async function closeGmScreen() {
  if (!gmScreen) return null;
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
  registerSceneControl();

  globalThis.Hooks?.once?.("ready", () => {
    exposeGmScreenApi();
  });
}

registerGmScreen();

export {
  MODULE_ID,
  APP_ID,
  SETTINGS_APP_ID,
  CONTROL_TOOL_ID,
  MKGMscreen,
  canUseGmScreen,
  getGmScreen,
  openGmScreen,
  closeGmScreen,
  toggleGmScreen,
  exposeGmScreenApi,
  registerGmScreen,
};
