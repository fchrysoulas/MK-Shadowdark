import { resolveActorFromUuid } from "../group-sheet/actors.js";
import {
  openExplorationEncounterContextDialog,
  processDueExplorationEncounters,
} from "../group-sheet/exploration-encounters.js";
import { openGroupMemberStatus } from "../group-sheet/member-status.js";
import { continueGroupRest } from "../group-sheet/rest-encounters.js";
import { openEncounterStagingDialog } from "../encounter-engine/staging.js";
import {
  buildGmScreenViewModel,
  findLatestEncounterMessage,
  normalizeWorkspace,
  resolveGmScreenGroup,
} from "./view-model.js";

const MODULE_ID = "mk-shadowdark";
const APP_ID = "mk-shadowdark-gm-screen";
const CONTROL_TOOL_ID = "mk-shadowdark-gm-screen";

let gmScreen = null;

function notifyGmOnly() {
  globalThis.ui?.notifications?.warn?.("The MK-Shadowdark GM Screen is available to GMs only.");
}

function canUseGmScreen() {
  return Boolean(globalThis.game?.user?.isGM);
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

async function actionRefresh() {
  return this.render({ force: true });
}

async function actionOpenGroup() {
  const group = await selectedGroup(this);
  if (!group) {
    globalThis.ui?.notifications?.warn?.("No MK-Shadowdark Group is available.");
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

async function actionConfigureEnvironment() {
  const group = await selectedGroup(this);
  if (!group) return null;
  const result = await openExplorationEncounterContextDialog(group);
  await this.render({ force: true });
  return result;
}

async function actionProcessDueEncounters() {
  const group = await selectedGroup(this);
  if (!group) return null;
  const result = await processDueExplorationEncounters(group);
  await this.render({ force: true });
  return result;
}

async function actionResumeRest() {
  const group = await selectedGroup(this);
  if (!group) return null;

  const confirmed = await Dialog.confirm({
    title: "Resume Interrupted Rest",
    content: "<p>Confirm that the interruption has been resolved and continue the existing Group rest from its current turn?</p>",
    yes: () => true,
    no: () => false,
    defaultYes: false,
  });
  if (!confirmed) return null;

  const result = await continueGroupRest(group);
  await this.render({ force: true });
  return result;
}

async function actionStageLatestEncounter() {
  const group = await selectedGroup(this);
  if (!group) return null;

  const latest = findLatestEncounterMessage(group);
  if (!latest?.data) {
    globalThis.ui?.notifications?.warn?.("No resolved Group encounter is available to stage.");
    return null;
  }

  const result = await openEncounterStagingDialog(latest.data, {
    sourceMessageId: String(latest.message?.id ?? ""),
  });
  await this.render({ force: true });
  return result;
}

async function actionOpenCombat() {
  const sidebar = globalThis.ui?.sidebar;
  if (typeof sidebar?.activateTab === "function") {
    await sidebar.activateTab("combat");
  }
  return globalThis.game?.combat ?? null;
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
      refresh: actionRefresh,
      openGroup: actionOpenGroup,
      openMember: actionOpenMember,
      inspectMember: actionInspectMember,
      configureEnvironment: actionConfigureEnvironment,
      processDueEncounters: actionProcessDueEncounters,
      resumeRest: actionResumeRest,
      stageLatestEncounter: actionStageLatestEncounter,
      openCombat: actionOpenCombat,
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

function refreshGmScreen() {
  if (!gmScreen?.rendered) return;
  gmScreen.render({ force: true });
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
    refresh: refreshGmScreen,
    get application() {
      return getGmScreen();
    },
  };

  return module.api.gmScreen;
}

function registerRefreshHooks() {
  const refreshHooks = [
    "updateActor",
    "updateScene",
    "canvasReady",
    "combatStart",
    "updateCombat",
    "createCombatant",
    "updateCombatant",
    "deleteCombatant",
    "mkShadowdarkGroupProcedureChanged",
    "mkShadowdarkGroupTimeAdvanced",
    "mkShadowdarkGroupTimeReset",
    "mkShadowdarkGroupAssignmentsChanged",
    "mkShadowdarkEnvironmentChanged",
    "mkShadowdarkGroupExplorationEncounter",
    "mkShadowdarkGroupRestWorkflow",
  ];

  for (const hook of refreshHooks) {
    globalThis.Hooks?.on?.(hook, refreshGmScreen);
  }
}

function registerGmScreen() {
  registerSceneControl();
  registerRefreshHooks();

  globalThis.Hooks?.once?.("ready", () => {
    exposeGmScreenApi();
  });
}

registerGmScreen();

export {
  APP_ID,
  CONTROL_TOOL_ID,
  MKGMscreen,
  canUseGmScreen,
  getGmScreen,
  openGmScreen,
  closeGmScreen,
  toggleGmScreen,
  refreshGmScreen,
  exposeGmScreenApi,
  registerGmScreen,
};
