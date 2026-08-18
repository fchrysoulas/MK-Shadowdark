import { APP_ID } from "./gm-screen.js";
import { createSourceDrivenNpc } from "./npc-generator.js";

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

function replaceNpcCreationButton(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const existing = root?.querySelector?.('[data-mk-exploration-create="npc"]');
  if (!existing) return false;

  const button = existing.cloneNode(true);
  button.dataset.mkExplorationCreateBound = "source-npc";
  button.title = "Roll a Core Shadowdark NPC profile and create a native NPC Actor";
  button.innerHTML = '<i class="fas fa-user-plus"></i> Create NPC';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void createSourceDrivenNpc();
  });
  existing.replaceWith(button);
  return true;
}

function registerNpcCreationControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    replaceNpcCreationButton(application, element);
  });
}

registerNpcCreationControls();

export {
  gmScreenApplication,
  replaceNpcCreationButton,
  registerNpcCreationControls,
};
