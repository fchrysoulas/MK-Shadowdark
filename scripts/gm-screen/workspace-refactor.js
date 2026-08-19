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

  const form = input.form ?? root?.querySelector?.("form") ?? root;
  const group = input.closest?.(".form-group");

  // Preserve the legacy value in form submission for backwards compatibility,
  // while removing every user-visible Profile control.
  input.type = "hidden";
  input.hidden = true;
  input.setAttribute?.("aria-hidden", "true");
  form?.append?.(input);
  group?.remove?.();
  return true;
}

function hideLegacyProfileSetting() {
  for (const key of ["encounterEngineDefaultProfile", "encounterEngineProfiles"]) {
    const definition = globalThis.game?.settings?.settings?.get?.(`${MODULE_ID}.${key}`);
    if (definition) definition.config = false;
  }
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
