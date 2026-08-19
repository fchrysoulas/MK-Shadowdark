import { APP_ID } from "./gm-screen.js";
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

  collapse.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    application.partyRailCollapsed = application.partyRailCollapsed !== true;
    applyRailState(application, root);
    collapse.title = application.partyRailCollapsed ? "Show Active Party rail" : "Hide Active Party rail";
    collapse.setAttribute("aria-label", collapse.title);
    collapse.innerHTML = `<i class="fas ${application.partyRailCollapsed ? "fa-table-columns" : "fa-angles-left"}"></i>`;
  });

  reset.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    const confirmed = await confirmGmDialog({
      title: "Reset GM Screen Presentation",
      content: "<p>Reset the current GM Screen workspace, selected Group, and party-rail presentation?</p>",
      yes: { label: "Reset" },
      no: { label: "Cancel", default: true },
    });
    if (!confirmed) return;

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

function decoratePresentation(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  applyRailState(application, root);
  bindPresentationButtons(application, root);
  return true;
}

function registerGmScreenPresentationControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decoratePresentation(application, element);
  });
}

registerGmScreenPresentationControls();

export {
  gmScreenApplication,
  applyRailState,
  createHeaderButton,
  bindPresentationButtons,
  decoratePresentation,
  registerGmScreenPresentationControls,
};