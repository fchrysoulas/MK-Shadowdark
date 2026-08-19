const MODULE_ID = "mk-shadowdark";

function rootElement(value) {
  if (!value) return null;
  if (value.querySelector) return value;
  if (value[0]?.querySelector) return value[0];
  return null;
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

function registerWorkspaceRefactor() {
  // This file is now compatibility-only. The GM Screen template itself owns the
  // eight-workspace layout; no GM Screen, Group Sheet, or chat DOM is rewritten here.
  globalThis.Hooks?.once?.("init", hideLegacyProfileSetting);

  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    hideLegacyProfileControl(application, element);
  });

  globalThis.Hooks?.on?.("renderApplication", (application, element) => {
    hideLegacyProfileControl(application, element);
  });
}

registerWorkspaceRefactor();

export {
  MODULE_ID,
  rootElement,
  hideLegacyProfileControl,
  hideLegacyProfileSetting,
  registerWorkspaceRefactor,
};