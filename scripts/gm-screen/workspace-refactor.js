const MODULE_ID = "mk-shadowdark";
const GM_SCREEN_APP_ID = "mk-shadowdark-gm-screen";
const ENCOUNTER_FLAG = "encounterEngine";
const SCENE_CONTEXT_FLAG = "encounterContext";

function rootElement(value) {
  if (!value) return null;
  if (value.querySelector) return value;
  if (value[0]?.querySelector) return value[0];
  return null;
}

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === GM_SCREEN_APP_ID
      || application.options?.id === GM_SCREEN_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === GM_SCREEN_APP_ID
    )
  );
}

function workspaceShell(root) {
  return root?.querySelector?.(".mk-gm-workspace-body") ?? null;
}

function ensureWorkspace(root, id, html) {
  const body = workspaceShell(root);
  if (!body) return null;

  let panel = body.querySelector(`[data-workspace-panel="${id}"]`);
  if (panel) return panel;

  const wrapper = globalThis.document?.createElement?.("div");
  if (!wrapper) return null;
  wrapper.innerHTML = html.trim();
  panel = wrapper.firstElementChild;
  if (!panel) return null;
  body.append(panel);
  return panel;
}

function prepareOverviewSceneContext(root) {
  const overview = root?.querySelector?.('[data-workspace-panel="overview"]');
  const panel = overview?.querySelector?.(".mk-gm-panel");
  if (!panel) return null;

  if (!panel.hasAttribute("data-mk-gm-overview-scene-context")) {
    panel.setAttribute("data-mk-gm-overview-scene-context", "true");
    panel.innerHTML = `
      <header><i class="fas fa-mountain-sun"></i><span>Scene Context</span></header>
      <div class="mk-gm-empty">Loading Scene Context…</div>
    `;
  }

  const pressureButton = overview.querySelector('[data-action="processDueEncounters"]');
  if (pressureButton) pressureButton.innerHTML = '<i class="fas fa-dice"></i> Process Due Checks';
  return panel;
}

function prepareAdditionalWorkspaces(root) {
  root?.querySelector?.('[data-workspace-panel="encounter"]')?.remove?.();
  root?.querySelector?.('[data-workspace-panel="environment"]')?.remove?.();

  ensureWorkspace(root, "downtime", `
    <section class="mk-gm-workspace" data-workspace-panel="downtime">
      <article class="mk-gm-panel is-wide">
        <header><i class="fas fa-coins"></i><span>Downtime</span></header>
        <p class="mk-gm-secondary">Settlement-facing generators and downtime tools.</p>
        <div class="mk-gm-panel-actions"></div>
      </article>
    </section>
  `);

  ensureWorkspace(root, "session-log", `
    <section class="mk-gm-workspace" data-workspace-panel="session-log">
      <article class="mk-gm-panel is-wide">
        <header><i class="fas fa-book-open"></i><span>Session Log</span></header>
        <div class="mk-gm-empty">No session records yet.</div>
      </article>
    </section>
  `);
}

function removeLegacySceneContextButtons(root) {
  root?.querySelectorAll?.('[data-action="configureEnvironment"]')?.forEach?.(button => button.remove());
}

function prepareGmScreen(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = rootElement(element);
  if (!root) return false;

  prepareAdditionalWorkspaces(root);
  prepareOverviewSceneContext(root);
  removeLegacySceneContextButtons(root);
  return true;
}

function removeGroupTravelContextButton(_application, html) {
  const root = rootElement(html);
  root?.querySelector?.('[data-action="configure-exploration-encounters"]')?.remove?.();
}

function encounterData(message) {
  try {
    return message?.getFlag?.(MODULE_ID, ENCOUNTER_FLAG)
      ?? message?.flags?.[MODULE_ID]?.[ENCOUNTER_FLAG]
      ?? null;
  } catch (_error) {
    return message?.flags?.[MODULE_ID]?.[ENCOUNTER_FLAG] ?? null;
  }
}

function removeEncounterProfilePresentation(message, html) {
  const data = encounterData(message);
  if (!data) return false;
  const root = rootElement(html);
  const footer = root?.querySelector?.(".mk-sd-encounter-card .mk-sd-encounter-footer");
  if (!footer) return false;

  const sceneName = String(data.sceneName ?? "").trim();
  if (sceneName) footer.textContent = sceneName;
  else footer.remove();
  return true;
}

function hideLegacyProfileControl(application, element) {
  const id = String(application?.id ?? application?.options?.id ?? "");
  if (!id.includes("mk-shadowdark-encounterEngine-settings")) return false;
  const root = rootElement(element);
  const input = root?.querySelector?.('[name="encounterEngineDefaultProfile"]');
  if (!input) return false;
  input.closest?.(".form-group")?.remove?.();
  return true;
}

function hideLegacyProfileSetting() {
  const definition = globalThis.game?.settings?.settings?.get?.(`${MODULE_ID}.encounterEngineDefaultProfile`);
  if (definition) definition.config = false;
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function sceneContextValue(value = {}) {
  const period = String(value?.period ?? "auto");
  return {
    terrain: String(value?.terrain ?? "Default"),
    dangerLevel: String(value?.dangerLevel ?? "unsafe"),
    period: ["auto", "day", "night"].includes(period) ? period : "auto",
    tableUuid: String(value?.tableUuid ?? ""),
  };
}

function redirectLegacyConfigureApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return false;
  let patched = false;

  const exploration = module.api?.groupExplorationEncounters;
  if (exploration && typeof exploration === "object") {
    exploration.configure = async () => {
      module.api?.gmScreen?.open?.({ workspace: "overview" });
      return null;
    };
    patched = true;
  }

  const environment = module.api?.environment;
  if (environment && typeof environment === "object") {
    const originalGetSceneContext = environment.getSceneContext;
    if (typeof originalGetSceneContext === "function") {
      environment.getSceneContext = (...args) => sceneContextValue(originalGetSceneContext(...args));
    }

    environment.setSceneContext = async (context, scene = currentScene(), {
      user = globalThis.game?.user,
    } = {}) => {
      const next = sceneContextValue(context);
      if (!scene?.setFlag) return null;
      if (!user?.isGM) {
        globalThis.ui?.notifications?.warn?.("Only the GM can change the Scene context.");
        return null;
      }
      await scene.setFlag(MODULE_ID, SCENE_CONTEXT_FLAG, next);
      return next;
    };
    patched = true;
  }

  return patched;
}

function registerWorkspaceRefactor() {
  globalThis.Hooks?.once?.("init", hideLegacyProfileSetting);

  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    prepareGmScreen(application, element);
    hideLegacyProfileControl(application, element);
  });

  globalThis.Hooks?.on?.("renderApplication", (application, element) => {
    hideLegacyProfileControl(application, element);
  });

  globalThis.Hooks?.on?.("renderActorSheet", removeGroupTravelContextButton);
  globalThis.Hooks?.on?.("renderChatMessage", removeEncounterProfilePresentation);

  globalThis.Hooks?.once?.("ready", redirectLegacyConfigureApi);
}

registerWorkspaceRefactor();

export {
  MODULE_ID,
  GM_SCREEN_APP_ID,
  SCENE_CONTEXT_FLAG,
  rootElement,
  gmScreenApplication,
  ensureWorkspace,
  prepareOverviewSceneContext,
  prepareAdditionalWorkspaces,
  removeLegacySceneContextButtons,
  prepareGmScreen,
  removeGroupTravelContextButton,
  removeEncounterProfilePresentation,
  hideLegacyProfileControl,
  hideLegacyProfileSetting,
  currentScene,
  sceneContextValue,
  redirectLegacyConfigureApi,
  registerWorkspaceRefactor,
};