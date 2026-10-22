const MODULE_ID = "mk-shadowdark";
const THEME_SETTINGS = Object.freeze({ group: "groupSheetTheme", bastion: "bastionSheetTheme", boat: "boatSheetTheme" });

function themeLabel(key, fallback) {
  const translated = globalThis.game?.i18n?.localize?.(key);
  return translated && translated !== key ? translated : fallback;
}

function getSheetTheme(kind) {
  let value = "dark";
  try {
    if (Object.hasOwn(THEME_SETTINGS, kind)
      && globalThis.game?.settings?.get?.(MODULE_ID, THEME_SETTINGS[kind]) === "light") value = "light";
  } catch (_error) {
    // Sheets can prepare their initial data before client settings are available.
  }
  const isLight = value === "light";
  return {
    value,
    isLight,
    classes: ["mk-themed-sheet", `mk-sheet-theme-${value}`],
    className: `mk-themed-sheet mk-sheet-theme-${value}`,
    toggleIcon: isLight ? "fa-moon" : "fa-sun",
    toggleLabel: isLight
      ? themeLabel("MK_SHADOWDARK.sheetTheme.switchDark", "Switch to Dark theme")
      : themeLabel("MK_SHADOWDARK.sheetTheme.switchLight", "Switch to Light theme"),
  };
}

async function toggleSheetTheme(kind) {
  if (!Object.hasOwn(THEME_SETTINGS, kind)) throw new Error("Unknown sheet theme preference");
  const key = THEME_SETTINGS[kind];
  const value = getSheetTheme(kind).isLight ? "dark" : "light";
  await globalThis.game.settings.set(MODULE_ID, key, value);
  return value;
}

function bindSheetThemeToggle(html, kind) {
  const root = html?.nodeType === 1 ? html : html?.[0] ?? html;
  for (const button of root?.querySelectorAll?.("[data-action='toggle-sheet-theme']") ?? []) {
    // Appearance is a client preference and remains available on read-only actor sheets.
    button.disabled = false;
    button.removeAttribute?.("disabled");
    button.addEventListener?.("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try {
        await toggleSheetTheme(kind);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not change sheet theme`, error);
        globalThis.ui?.notifications?.error?.(themeLabel(
          "MK_SHADOWDARK.sheetTheme.failed", "Could not change the sheet theme."
        ));
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });
  }
}

export { getSheetTheme, toggleSheetTheme, bindSheetThemeToggle };
