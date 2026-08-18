import { APP_ID } from "./gm-screen.js";
import {
  getGmScreenPresentationPreferences,
  patchGmScreenPresentationPreferences,
  resetGmScreenPresentationPreferences,
} from "./presentation-preferences.js";
import { confirmGmDialog } from "../libs/dialog-v2.js";

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function applyRailState(application, root) {
  const collapsed = application.partyRailCollapsed === true;
  root?.classList?.toggle?.("is-party-rail-collapsed", collapsed);
  return collapsed;
}

async function saveCurrentPresentation(application, patch = {}) {
  return patchGmScreenPresentationPreferences({
    groupActorUuid: String(application?.groupActorUuid ?? ""),
    workspace: String(application?.workspace ?? "overview"),
    partyRailCollapsed: application?.partyRailCollapsed === true,
    ...patch,
  });
}

function restorePresentationOnce(application) {
  if (application._mkPresentationRestored === true) return false;
  application._mkPresentationRestored = true;

  const saved = getGmScreenPresentationPreferences();
  const currentGroup = String(application.groupActorUuid ?? "");
  const currentWorkspace = String(application.workspace ?? "overview");
  const nextGroup = saved.groupActorUuid || currentGroup;
  const nextWorkspace = saved.workspace || currentWorkspace;
  const changed = nextGroup !== currentGroup
    || nextWorkspace !== currentWorkspace
    || saved.partyRailCollapsed === true;

  application.groupActorUuid = nextGroup;
  application.workspace = nextWorkspace;
  application.partyRailCollapsed = saved.partyRailCollapsed === true;

  if (changed) application.render({ force: true });
  return changed;
}

function bindSelectionPersistence(application, root) {
  root.querySelectorAll('[data-action="workspace"][data-workspace]').forEach(button => {
    button.addEventListener("click", () => {
      void saveCurrentPresentation(application, {
        workspace: String(button.dataset.workspace ?? "overview"),
      });
    });
  });

  root.querySelectorAll('[data-action="selectGroup"][data-group-uuid]').forEach(button => {
    button.addEventListener("click", () => {
      void saveCurrentPresentation(application, {
        groupActorUuid: String(button.dataset.groupUuid ?? ""),
        workspace: "overview",
      });
    });
  });
}

function createHeaderButton({ title, icon, action }) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.dataset.mkPresentationAction = action;
  button.innerHTML = `<i class="fas ${icon}"></i>`;
  return button;
}

function bindPresentationButtons(application, root) {
  const actions = root.querySelector(".mk-gm-header-actions");
  if (!actions || actions.querySelector("[data-mk-presentation-action]")) return false;

  const collapse = createHeaderButton({
    title: application.partyRailCollapsed ? "Show Active Party rail" : "Hide Active Party rail",
    icon: application.partyRailCollapsed ? "fa-table-columns" : "fa-angles-left",
    action: "toggle-rail",
  });
  const reset = createHeaderButton({
    title: "Reset GM Screen presentation",
    icon: "fa-arrow-rotate-left",
    action: "reset",
  });

  collapse.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    application.partyRailCollapsed = application.partyRailCollapsed !== true;
    applyRailState(application, root);
    collapse.title = application.partyRailCollapsed ? "Show Active Party rail" : "Hide Active Party rail";
    collapse.setAttribute("aria-label", collapse.title);
    collapse.innerHTML = `<i class="fas ${application.partyRailCollapsed ? "fa-table-columns" : "fa-angles-left"}"></i>`;
    await saveCurrentPresentation(application);
  });

  reset.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const confirmed = await confirmGmDialog({
      title: "Reset GM Screen Presentation",
      content: "<p>Reset the saved GM Screen workspace, selected Group, and party-rail presentation for this browser?</p>",
      yes: { label: "Reset" },
      no: { label: "Cancel", default: true },
    });
    if (!confirmed) return;

    await resetGmScreenPresentationPreferences();
    application.groupActorUuid = "";
    application.workspace = "overview";
    application.partyRailCollapsed = false;
    application.encounterMessageId = "";
    application.render({ force: true });
  });

  actions.prepend(reset);
  actions.prepend(collapse);
  return true;
}

async function decoratePresentation(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  if (restorePresentationOnce(application)) return true;

  applyRailState(application, root);
  bindSelectionPersistence(application, root);
  bindPresentationButtons(application, root);

  const saved = getGmScreenPresentationPreferences();
  const current = {
    groupActorUuid: String(application.groupActorUuid ?? ""),
    workspace: String(application.workspace ?? "overview"),
    partyRailCollapsed: application.partyRailCollapsed === true,
  };
  if (
    saved.groupActorUuid !== current.groupActorUuid
    || saved.workspace !== current.workspace
    || saved.partyRailCollapsed !== current.partyRailCollapsed
  ) {
    await saveCurrentPresentation(application);
  }

  return true;
}

function registerGmScreenPresentationControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decoratePresentation(application, element);
  });
}

registerGmScreenPresentationControls();

export {
  gmScreenApplication,
  applyRailState,
  saveCurrentPresentation,
  restorePresentationOnce,
  bindSelectionPersistence,
  bindPresentationButtons,
  decoratePresentation,
  registerGmScreenPresentationControls,
};
