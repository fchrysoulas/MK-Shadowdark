import {
  rerollEncounterField,
  rerollEntireEncounter,
  revealEncounterMessage,
  stageEncounterMessage,
} from "../encounter-engine/chat.js";
import { APP_ID } from "./gm-screen.js";

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

function encounterMessage(messageId, messages = globalThis.game?.messages) {
  const id = String(messageId ?? "");
  if (!id) return null;
  return messages?.get?.(id)
    ?? messages?.contents?.find?.(message => String(message?.id ?? "") === id)
    ?? null;
}

async function executeEncounterAction(application, button, context) {
  if (!globalThis.game?.user?.isGM) return null;

  const messageId = String(
    button?.dataset?.messageId
    ?? context?.latestEncounter?.messageId
    ?? ""
  );
  const message = encounterMessage(messageId);
  if (!message) {
    globalThis.ui?.notifications?.warn?.("The source Group encounter message is no longer available.");
    return null;
  }

  const action = String(button?.dataset?.mkEncounterAction ?? "");
  let result = null;

  if (action === "reveal") {
    result = await revealEncounterMessage(message);
  } else if (action === "reroll-all") {
    result = await rerollEntireEncounter(message);
  } else if (action === "reroll-field") {
    result = await rerollEncounterField(message, String(button?.dataset?.field ?? ""));
  } else if (action === "stage") {
    result = await stageEncounterMessage(message);
  }

  if (result) await application.render({ force: true });
  return result;
}

function bindEncounterControls(application, element, context) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  if (!root) return false;

  const buttons = root.querySelectorAll("[data-mk-encounter-action]");
  for (const button of buttons) {
    if (button.dataset.mkEncounterBound === "true") continue;
    button.dataset.mkEncounterBound = "true";

    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      button.disabled = true;
      try {
        await executeEncounterAction(application, button, context);
      } catch (error) {
        console.error("mk-shadowdark | GM Screen Encounter | Action failed", error);
        globalThis.ui?.notifications?.error?.(`Encounter action failed: ${error.message}`);
      } finally {
        button.disabled = false;
      }
    });
  }

  return buttons.length > 0;
}

function registerGmScreenEncounterControls() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element, context) => {
    bindEncounterControls(application, element, context);
  });
}

registerGmScreenEncounterControls();

export {
  gmScreenApplication,
  encounterMessage,
  executeEncounterAction,
  bindEncounterControls,
  registerGmScreenEncounterControls,
};
