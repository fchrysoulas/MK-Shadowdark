import { APP_ID } from "./gm-screen.js";
import { ensureActionRow } from "./exploration-creation-controls.js";
import {
  createSourceDrivenShop,
  createSourceDrivenTavern,
} from "./tavern-shop-generator.js";

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

function createButton({ kind, label, icon, title }) {
  const button = globalThis.document?.createElement?.("button");
  if (!button) return null;
  button.type = "button";
  button.dataset.mkExplorationCreate = kind;
  button.dataset.mkExplorationCreateBound = "source-establishment";
  button.title = title;
  button.innerHTML = `<i class="fas ${icon}"></i> ${label}`;
  return button;
}

function bindButton(button, create) {
  if (!button || button.dataset.mkSourceEstablishmentBound === "true") return;
  button.dataset.mkSourceEstablishmentBound = "true";
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void create();
  });
}

function decorateTavernShopCreationControls(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const workspace = root?.querySelector?.('[data-workspace-panel="downtime"]');
  if (!workspace) return false;
  const actions = ensureActionRow(workspace);
  if (!actions) return false;

  let tavern = actions.querySelector('[data-mk-exploration-create="tavern"]');
  if (!tavern) {
    tavern = createButton({
      kind: "tavern",
      label: "Create Tavern",
      icon: "fa-beer-mug-empty",
      title: "Roll the Core Shadowdark Tavern procedure and create a Journal",
    });
    if (tavern) actions.append(tavern);
  }
  bindButton(tavern, createSourceDrivenTavern);

  let shop = actions.querySelector('[data-mk-exploration-create="shop"]');
  if (!shop) {
    shop = createButton({
      kind: "shop",
      label: "Create Shop",
      icon: "fa-store",
      title: "Roll the Core Shadowdark Shop procedure and create a Journal",
    });
    if (shop) actions.append(shop);
  }
  bindButton(shop, createSourceDrivenShop);
  return Boolean(tavern || shop);
}

function registerTavernShopCreationControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    decorateTavernShopCreationControls(application, element);
  });
}

registerTavernShopCreationControls();

export {
  gmScreenApplication,
  createButton,
  bindButton,
  decorateTavernShopCreationControls,
  registerTavernShopCreationControls,
};