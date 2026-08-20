import { resolveActorFromUuid } from "../group-sheet/actors.js";
import {
  getExplorationEncounterState,
  processDueExplorationEncounters,
} from "../group-sheet/exploration-encounters.js";
import { openGroupMemberStatus } from "../group-sheet/member-status.js";
import {
  GROUP_PROCEDURE_STATES,
  getGroupProcedureState,
  setGroupProcedureState,
} from "../group-sheet/procedure.js";
import { REST_TURN_SECONDS } from "../group-sheet/rest-encounters.js";
import { advanceGroupTime } from "../group-sheet/time.js";
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
const COMBAT_TURN_SECONDS = 6;
const GM_SCREEN_MANUAL_PROCEDURE_STATES = Object.freeze(
  GROUP_PROCEDURE_STATES.filter(state => state !== "resting")
);

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

function procedureLabel(procedure) {
  const value = String(procedure ?? "downtime");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function selectedGroup(app) {
  return resolveGmScreenGroup(app?.groupActorUuid ?? "");
}

function canonicalTurnSeconds(group, procedure) {
  if (!group) return null;
  if (procedure === "exploration") return getExplorationEncounterState(group).turnSeconds;
  if (procedure === "resting") return REST_TURN_SECONDS;
  if (procedure === "combat") return COMBAT_TURN_SECONDS;
  return null;
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

async function actionSelectProcedure(next) {
  const group = await selectedGroup(this);
  if (!group) {
    notifyNoGroup();
    return null;
  }

  const current = getGroupProcedureState(group);
  if (next === "resting") {
    globalThis.ui?.notifications?.info?.("Resting is controlled by the Group rest workflow. Start or resume the rest from Group Management.");
    return null;
  }
  if (!GM_SCREEN_MANUAL_PROCEDURE_STATES.includes(next) || next === current) return null;
  if (current === "resting") {
    globalThis.ui?.notifications?.info?.("Finish or resolve the active Group rest before changing procedure.");
    return null;
  }

  const result = await setGroupProcedureState(group, next, {
    reason: "gm-screen-top-bar",
  });
  await this.render({ force: true });
  return result;
}

async function actionAdvanceOneTurn() {
  const group = await selectedGroup(this);
  if (!group) {
    notifyNoGroup();
    return null;
  }

  const procedure = getGroupProcedureState(group);
  const seconds = canonicalTurnSeconds(group, procedure);
  if (!seconds) {
    globalThis.ui?.notifications?.info?.(`${procedureLabel(procedure)} has no canonical GM Screen turn duration.`);
    return null;
  }

  const result = await advanceGroupTime(group, seconds, {
    procedure,
    reason: "gm-screen-one-turn",
  });
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

function pressureCell(root, label) {
  const cells = root?.querySelectorAll?.(".mk-gm-pressure-strip > div") ?? [];
  return Array.from(cells).find(cell => (
    String(cell.querySelector?.("span")?.textContent ?? "").trim().toLowerCase() === label.toLowerCase()
  )) ?? null;
}

function procedureValueFromCell(cell) {
  const label = String(cell?.querySelector?.("strong")?.textContent ?? "")
    .trim()
    .toLowerCase();
  return GROUP_PROCEDURE_STATES.find(state => procedureLabel(state).toLowerCase() === label)
    ?? "downtime";
}

function installProcedureSelector(cell, {
  value = "downtime",
  disabled = false,
  onChange,
} = {}) {
  if (!cell || typeof onChange !== "function") return null;

  const labelElement = cell.querySelector?.("span");
  cell.replaceChildren();
  if (labelElement) cell.append(labelElement);

  const select = globalThis.document?.createElement?.("select");
  if (!select) return null;

  const restingActive = value === "resting";
  const states = restingActive ? ["resting"] : GM_SCREEN_MANUAL_PROCEDURE_STATES;

  select.name = "procedure";
  select.title = restingActive
    ? "Resting is controlled by the active Group rest workflow"
    : "Change Group procedure";
  select.setAttribute("aria-label", select.title);
  select.disabled = disabled || restingActive;

  for (const state of states) {
    const option = globalThis.document?.createElement?.("option");
    if (!option) continue;
    option.value = state;
    option.textContent = procedureLabel(state);
    option.selected = state === value;
    select.append(option);
  }

  select.addEventListener("change", async event => {
    event.stopPropagation();
    const next = String(event.currentTarget?.value ?? "");
    select.disabled = true;
    try {
      await onChange(next);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen | Procedure update failed", error);
      globalThis.ui?.notifications?.error?.(`Group procedure update failed: ${error.message}`);
      select.value = value;
      select.disabled = false;
    }
  });

  cell.append(select);
  return select;
}

function installPressureControl(cell, {
  label,
  title,
  icon,
  disabled = false,
  onClick,
}) {
  if (!cell || typeof onClick !== "function") return false;

  const value = String(cell.querySelector?.("strong")?.textContent ?? "").trim();
  const labelElement = cell.querySelector?.("span");
  cell.replaceChildren();
  if (labelElement) cell.append(labelElement);
  else {
    const span = globalThis.document?.createElement?.("span");
    if (span) {
      span.textContent = label;
      cell.append(span);
    }
  }

  const button = globalThis.document?.createElement?.("button");
  const strong = globalThis.document?.createElement?.("strong");
  const marker = globalThis.document?.createElement?.("i");
  if (!button || !strong || !marker) return false;

  button.type = "button";
  button.className = "mk-gm-pressure-control";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.disabled = disabled;
  button.style.display = "flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "space-between";
  button.style.gap = "6px";
  button.style.width = "100%";
  button.style.minWidth = "0";
  button.style.padding = "0";
  button.style.border = "0";
  button.style.background = "transparent";
  button.style.textAlign = "left";

  strong.textContent = value;
  strong.style.minWidth = "0";
  marker.className = icon;
  marker.style.flex = "0 0 auto";
  marker.style.fontSize = "10px";
  marker.style.color = "var(--mk-gm-muted)";

  button.append(strong, marker);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) void onClick();
  });
  cell.append(button);
  return true;
}

function bindPressureControls(app) {
  const root = app?.element?.querySelector ? app.element : app?.element?.[0];
  if (!root?.querySelector) return false;

  const procedure = pressureCell(root, "Procedure");
  const elapsed = pressureCell(root, "Elapsed");
  const currentProcedure = procedureValueFromCell(procedure);

  installProcedureSelector(procedure, {
    value: currentProcedure,
    disabled: !app?.groupActorUuid,
    onChange: next => actionSelectProcedure.call(app, next),
  });

  const hasTurn = ["exploration", "resting", "combat"].includes(currentProcedure);
  installPressureControl(elapsed, {
    label: "Elapsed",
    title: hasTurn
      ? `Advance ${procedureLabel(currentProcedure)} by 1 turn`
      : "Downtime has no canonical turn duration",
    icon: "fas fa-forward-step",
    disabled: !app?.groupActorUuid || !hasTurn,
    onClick: () => actionAdvanceOneTurn.call(app),
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
      workspace: actionWorkspace,
      selectGroup: actionSelectGroup,
      openGroup: actionOpenGroup,
      openMember: actionOpenMember,
      inspectMember: actionInspectMember,
      processDueEncounters: actionProcessDueEncounters,
      stageLatestEncounter: actionStageLatestEncounter,
      openCombat: actionOpenCombat,
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
    bindPressureControls(this);
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
  CONTROL_TOOL_ID,
  COMBAT_TURN_SECONDS,
  GM_SCREEN_MANUAL_PROCEDURE_STATES,
  MKGMscreen,
  canUseGmScreen,
  procedureLabel,
  canonicalTurnSeconds,
  actionSelectProcedure,
  actionAdvanceOneTurn,
  procedureValueFromCell,
  installProcedureSelector,
  installPressureControl,
  bindPressureControls,
  getGmScreen,
  openGmScreen,
  closeGmScreen,
  toggleGmScreen,
  exposeGmScreenApi,
  registerGmScreen,
};