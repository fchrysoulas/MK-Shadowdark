(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Sheet Style Editor";
  const EDITOR_SETTING = "sheetStyleEditorEnabled";
  const CSS_SETTING = "sheetStyleEditorCss";
  const TYPOGRAPHY_MIGRATION_SETTING = "sheetStyleEditorTypographyMigrated";
  const DEFAULTS_SEEDED_SETTING = "sheetStyleEditorDefaultsSeeded";
  const SUMMARY_CSS_SPLIT_SETTING = "sheetStyleEditorSummaryCssSplit";
  const HIDE_LOGO_SETTING = "characterSheetTweaksHideLogo";
  const HEADER_BACKGROUND_SETTING = "characterSheetTweaksHeaderBackgroundImage";
  const STYLE_ELEMENT_ID = "mk-shadowdark-global-sheet-styles";
  const RULE_MARKER_PREFIX = "mk-shadowdark-style-editor";
  const SETTING_MARKER_PREFIX = "mk-shadowdark-setting";
  const EDITABLE_DEFAULT_STYLESHEETS = Object.freeze([
    `modules/${MODULE_ID}/styles/character-sheet-tweaks.css`,
    `modules/${MODULE_ID}/styles/quickdraw-icons.css`
  ]);
  const LEGACY_TYPOGRAPHY_SETTINGS = Object.freeze({
    displayFont: "characterSheetTweaksDisplayFontFamily",
    sectionFont: "characterSheetTweaksSectionFontFamily",
    nameSize: "characterSheetTweaksNameFontSize",
    bannerSize: "characterSheetTweaksBannerFontSize",
    sectionSize: "characterSheetTweaksSectionFontSize",
    navigationSize: "characterSheetTweaksNavigationFontSize"
  });
  const ACTOR_SHEET_RENDER_HOOKS = [
    "renderActorSheet",
    "renderActorSheetSD",
    "renderPlayerSheetSD",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  let activeMenu = null;
  let cssUpdateQueue = Promise.resolve();

  globalThis.MKShadowdarkSheetStyleEditor = {
    applyCss,
    syncCharacterSheetSettings
  };

  Hooks.once("ready", async () => {
    applyCss(getSetting(CSS_SETTING, ""));
    removeDirectEditableStyleLinks();
    if (!game.user?.isGM) return;

    await runInitializationStep("Summary Bar CSS split migration", migrateSummaryBarCssSplit);
    await runInitializationStep("editable default CSS seed", seedEditableDefaultCss);
    await runInitializationStep("legacy typography migration", migrateLegacyTypographySettings);
    await runInitializationStep("managed setting CSS sync", syncCharacterSheetSettings);
  });

  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      try {
        onRenderActorSheet(app, html);
      } catch (error) {
        console.error(`${MODULE_ID} | ${SUBMODULE} | render error`, error);
      }
    });
  }

  document.addEventListener("pointerdown", event => {
    if (activeMenu && !activeMenu.contains(event.target)) closeContextMenu();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeContextMenu();
  });

  function onRenderActorSheet(app, html) {
    const root = getRootElement(html);
    if (!root?.querySelector || !isShadowdarkPlayerSheet(app, root)) return;

    root.querySelector(".sdx-style-editor-toolbar")?.remove();
    root.querySelectorAll(".sdx-has-style-editor-toolbar").forEach(element => {
      element.classList.remove("sdx-has-style-editor-toolbar");
    });
    root.classList.remove("sdx-style-edit-mode");
    if (!game.user?.isGM || !getSetting(EDITOR_SETTING, true)) return;

    injectEditModeButton(root);
  }

  function isShadowdarkPlayerSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor" || isGroupActor(actor)) return false;

    const type = String(actor.type ?? "").toLowerCase();
    const classes = Array.from(app?.options?.classes ?? []).join(" ").toLowerCase();
    if (type !== "player" && !classes.includes("player")) return false;

    return Boolean(
      root.matches?.(".shadowdark.sheet")
      || root.querySelector?.(".shadowdark.sheet")
      || root.querySelector?.("header.SD-header")
    );
  }

  function isGroupActor(actor) {
    try {
      return Boolean(actor?.getFlag?.(MODULE_ID, "isGroup"));
    } catch (_error) {
      return Boolean(actor?._source?.flags?.[MODULE_ID]?.isGroup);
    }
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function injectEditModeButton(root) {
    const toolbar = document.createElement("div");
    toolbar.className = "sdx-style-editor-toolbar";
    toolbar.innerHTML = `
      <button type="button" class="sdx-style-editor-toggle" title="Enable style editing">
        <i class="fas fa-paintbrush" aria-hidden="true"></i>
        <span>Edit Style</span>
      </button>
    `;

    const header = root.querySelector("header.SD-header") ?? root;
    header.classList.add("sdx-has-style-editor-toolbar");
    header.append(toolbar);

    const toggle = toolbar.querySelector(".sdx-style-editor-toggle");
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const enabled = !root.classList.contains("sdx-style-edit-mode");
      root.classList.toggle("sdx-style-edit-mode", enabled);
      toggle.classList.toggle("active", enabled);
      toggle.querySelector("span").textContent = enabled ? "Finish Editing" : "Edit Style";
      toggle.title = enabled ? "Disable style editing" : "Enable style editing";

      if (!enabled) {
        clearSelectedTarget(root);
        closeContextMenu();
      } else {
        ui.notifications?.info("Style edit mode enabled. Right-click a sheet element to edit it.");
      }
    });

    root.addEventListener("contextmenu", event => {
      if (!root.classList.contains("sdx-style-edit-mode")) return;

      const target = getEditableTarget(event.target, root);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      openContextMenu({ root, target, x: event.clientX, y: event.clientY });
    }, true);
  }

  function getEditableTarget(candidate, root) {
    if (!(candidate instanceof HTMLElement)) return null;
    if (candidate.closest(".sdx-style-editor-toolbar, .sdx-style-context-menu")) return null;
    if (candidate.closest(".sdx-character-sheet-bar")) return null;
    if (candidate === root) return null;
    return candidate;
  }

  function openContextMenu({ root, target, x, y }) {
    closeContextMenu();
    clearSelectedTarget(root);
    target.classList.add("sdx-style-selected-target");

    const selector = buildStableSelector(target, root);
    if (!selector) return;

    const cssText = String(getSetting(CSS_SETTING, "") ?? "");
    const existing = getGeneratedRuleStyles(cssText, selector);
    const computed = getComputedStyle(target);
    const fontWeight = existing.fontWeight ?? computed.fontWeight;
    const isBold = Number.parseInt(fontWeight, 10) >= 600 || String(fontWeight).toLowerCase() === "bold";
    const padding = existing.padding ?? [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft].join(" ");

    const menu = document.createElement("section");
    menu.className = "sdx-style-context-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Edit element style");
    menu.innerHTML = `
      <header>
        <strong>Element Style</strong>
        <button type="button" data-action="close" title="Close"><i class="fas fa-xmark"></i></button>
      </header>
      <p class="sdx-style-selector" title="${escapeHtml(selector)}">${escapeHtml(selector)}</p>
      <label>
        <span>Font family</span>
        <input type="text" data-field="fontFamily" value="${escapeHtml(existing.fontFamily ?? computed.fontFamily)}">
      </label>
      <label>
        <span>Font size</span>
        <input type="text" data-field="fontSize" value="${escapeHtml(existing.fontSize ?? computed.fontSize)}" placeholder="e.g. 18px or 1.2rem">
      </label>
      <label>
        <span>Weight</span>
        <select data-field="fontWeight">
          <option value="400"${isBold ? "" : " selected"}>Normal</option>
          <option value="700"${isBold ? " selected" : ""}>Bold</option>
        </select>
      </label>
      <label>
        <span>Padding</span>
        <input type="text" data-field="padding" value="${escapeHtml(padding)}" placeholder="e.g. 4px 8px">
      </label>
      <footer>
        <button type="button" data-action="reset"><i class="fas fa-rotate-left"></i> Reset</button>
        <button type="button" data-action="apply"><i class="fas fa-check"></i> Apply</button>
      </footer>
    `;

    document.body.append(menu);
    activeMenu = menu;
    positionContextMenu(menu, x, y);

    menu.addEventListener("contextmenu", event => event.preventDefault());
    menu.querySelector('[data-action="close"]').addEventListener("click", () => {
      clearSelectedTarget(root);
      closeContextMenu();
    });
    menu.querySelector('[data-action="apply"]').addEventListener("click", async () => {
      await applyMenuChanges({ root, selector, menu });
    });
    menu.querySelector('[data-action="reset"]').addEventListener("click", async () => {
      await resetElementRule({ root, selector });
      clearSelectedTarget(root);
      closeContextMenu();
    });
  }

  function positionContextMenu(menu, x, y) {
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - bounds.height - margin))}px`;
  }

  async function applyMenuChanges({ root, selector, menu }) {
    const fontFamily = menu.querySelector('[data-field="fontFamily"]').value.trim();
    const fontSize = menu.querySelector('[data-field="fontSize"]').value.trim();
    const fontWeight = menu.querySelector('[data-field="fontWeight"]').value;
    const padding = menu.querySelector('[data-field="padding"]').value.trim();

    if (fontFamily && globalThis.CSS?.supports && !CSS.supports("font-family", fontFamily)) {
      ui.notifications?.warn(`Invalid font family: ${fontFamily}`);
      return;
    }
    if (fontSize && globalThis.CSS?.supports && !CSS.supports("font-size", fontSize)) {
      ui.notifications?.warn(`Invalid font size: ${fontSize}`);
      return;
    }
    if (padding && globalThis.CSS?.supports && !CSS.supports("padding", padding)) {
      ui.notifications?.warn(`Invalid padding: ${padding}`);
      return;
    }

    await updateGlobalCss(currentCss => (
      upsertGeneratedRule(currentCss, selector, { fontFamily, fontSize, fontWeight, padding })
    ));
    clearSelectedTarget(root);
    closeContextMenu();
    ui.notifications?.info("Global sheet style saved and synchronized to all clients.");
  }

  async function resetElementRule({ root, selector }) {
    await updateGlobalCss(currentCss => removeGeneratedRule(currentCss, selector));
    clearSelectedTarget(root);
    ui.notifications?.info("Element style reset.");
  }

  function updateGlobalCss(transform) {
    const update = async () => {
      if (!game.user?.isGM) return String(getSetting(CSS_SETTING, "") ?? "");

      const currentCss = String(getSetting(CSS_SETTING, "") ?? "");
      const nextCss = String(await transform(currentCss) ?? "");
      if (nextCss !== currentCss) await game.settings.set(MODULE_ID, CSS_SETTING, nextCss);
      applyCss(nextCss);
      return nextCss;
    };

    cssUpdateQueue = cssUpdateQueue.then(update, update);
    return cssUpdateQueue;
  }

  function applyCss(cssText) {
    let style = document.getElementById(STYLE_ELEMENT_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      document.head.append(style);
    }
    style.textContent = String(cssText ?? "");
  }

  function removeDirectEditableStyleLinks() {
    const templateNames = EDITABLE_DEFAULT_STYLESHEETS.map(path => path.split("/").pop());
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(link => {
      const href = String(link.getAttribute("href") ?? "");
      if (templateNames.some(name => href.includes(`/styles/${name}`))) link.remove();
    });
  }

  async function runInitializationStep(label, callback) {
    try {
      await callback();
    } catch (error) {
      console.error(`${MODULE_ID} | ${SUBMODULE} | ${label} error`, error);
    }
  }

  async function seedEditableDefaultCss() {
    if (getSetting(DEFAULTS_SEEDED_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
  }

  async function migrateSummaryBarCssSplit() {
    if (getSetting(SUMMARY_CSS_SPLIT_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, SUMMARY_CSS_SPLIT_SETTING, true);
  }

  async function loadEditableDefaultCss() {
    const stylesheetTexts = await Promise.all(EDITABLE_DEFAULT_STYLESHEETS.map(async path => {
      const route = toFoundryRoute(path);
      const response = await fetch(route, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${route}: HTTP ${response.status}`);
      return (await response.text()).trim();
    }));
    const defaultCss = stylesheetTexts.filter(Boolean).join("\n\n");
    if (!defaultCss) throw new Error("Editable character-sheet default CSS is empty.");
    return defaultCss;
  }

  function syncCharacterSheetSettings() {
    return updateGlobalCss(currentCss => {
      const hideLogo = Boolean(getSetting(HIDE_LOGO_SETTING, true));
      const headerBackground = normalizeImagePath(getSetting(HEADER_BACKGROUND_SETTING, ""));
      let updatedCss = upsertManagedBlock(currentCss, "hide-shadowdark-logo", hideLogo ? buildHideLogoCss() : "");
      updatedCss = upsertManagedBlock(
        updatedCss,
        "header-background-image",
        headerBackground ? buildHeaderBackgroundCss(headerBackground) : ""
      );
      return updatedCss;
    });
  }

  async function migrateLegacyTypographySettings() {
    if (getSetting(TYPOGRAPHY_MIGRATION_SETTING, false)) return;

    const legacyValues = Object.fromEntries(
      Object.entries(LEGACY_TYPOGRAPHY_SETTINGS).map(([name, key]) => [name, getStoredWorldSetting(key)])
    );
    const migrationCss = buildLegacyTypographyCss(legacyValues);
    if (migrationCss) {
      await updateGlobalCss(currentCss => upsertManagedBlock(currentCss, "legacy-typography", migrationCss));
    }
    await game.settings.set(MODULE_ID, TYPOGRAPHY_MIGRATION_SETTING, true);
  }

  function buildHideLogoCss() {
    return `.shadowdark.sheet.player.sdx-character-sheet-tweaks .SD-header .shadowdark-logo {
  display: none !important;
}`;
  }

  function buildHeaderBackgroundCss(imagePath) {
    return `.shadowdark.sheet.player.sdx-character-sheet-tweaks .SD-header {
  background-image:
    linear-gradient(90deg, rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.12) 38%, rgba(0, 0, 0, 0.48)),
    linear-gradient(180deg, rgba(0, 0, 0, 0.20), rgba(0, 0, 0, 0.35)),
    url("${cssUrlEscape(imagePath)}") !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-size: cover !important;
}`;
  }

  function buildLegacyTypographyCss(values) {
    const rules = [];
    const displayFont = validCssValue("font-family", values.displayFont);
    const sectionFont = validCssValue("font-family", values.sectionFont);
    const nameSize = validCssValue("font-size", values.nameSize);
    const bannerSize = validCssValue("font-size", values.bannerSize);
    const sectionSize = validCssValue("font-size", values.sectionSize);
    const navigationSize = validCssValue("font-size", values.navigationSize);

    appendLegacyRule(rules, [
      ".shadowdark.sheet.player .SD-title input",
      ".shadowdark.sheet.player .SD-box .header label",
      ".shadowdark.sheet.player .SD-banner",
      ".shadowdark.sheet.player .SD-nav a"
    ], "font-family", displayFont);
    appendLegacyRule(rules, [".shadowdark.sheet.player h3"], "font-family", sectionFont);
    appendLegacyRule(rules, [".shadowdark.sheet.player .SD-title input"], "font-size", nameSize);
    appendLegacyRule(rules, [
      ".shadowdark.sheet.player .SD-box .header label",
      ".shadowdark.sheet.player .SD-banner"
    ], "font-size", bannerSize);
    appendLegacyRule(rules, [".shadowdark.sheet.player h3"], "font-size", sectionSize);
    appendLegacyRule(rules, [".shadowdark.sheet.player .SD-nav a"], "font-size", navigationSize);
    return rules.join("\n\n");
  }

  function appendLegacyRule(rules, selectors, property, value) {
    if (!value) return;
    rules.push(`${selectors.join(",\n")} {
  ${property}: ${value} !important;
}`);
  }

  function validCssValue(property, value) {
    const normalized = String(value ?? "").trim();
    if (!normalized) return "";
    if (globalThis.CSS?.supports && !CSS.supports(property, normalized)) return "";
    return normalized;
  }

  function upsertManagedBlock(cssText, key, content) {
    const withoutExisting = removeManagedBlock(cssText, key).trimEnd();
    const body = String(content ?? "").trim();
    if (!body) return withoutExisting;

    const block = `/* ${SETTING_MARKER_PREFIX}:start ${key} */\n${body}\n/* ${SETTING_MARKER_PREFIX}:end ${key} */`;
    return withoutExisting ? `${withoutExisting}\n\n${block}\n` : `${block}\n`;
  }

  function upsertManagedBlockAtStart(cssText, key, content) {
    const withoutExisting = removeManagedBlock(cssText, key).trimStart();
    const body = String(content ?? "").trim();
    if (!body) return withoutExisting;

    const block = `/* ${SETTING_MARKER_PREFIX}:start ${key} */\n${body}\n/* ${SETTING_MARKER_PREFIX}:end ${key} */`;
    return withoutExisting ? `${block}\n\n${withoutExisting}` : `${block}\n`;
  }

  function removeManagedBlock(cssText, key) {
    const escapedKey = escapeRegExp(key);
    const pattern = new RegExp(
      `\\s*\\/\\* ${SETTING_MARKER_PREFIX}:start ${escapedKey} \\*\\/[\\s\\S]*?\\/\\* ${SETTING_MARKER_PREFIX}:end ${escapedKey} \\*\\/\\s*`,
      "g"
    );
    return String(cssText ?? "").replace(pattern, "\n").trim();
  }

  function getGeneratedRuleStyles(cssText, selector) {
    const block = findGeneratedRuleBlock(cssText, selector);
    if (!block) return {};

    const declaration = document.createElement("div").style;
    declaration.cssText = block;
    return {
      fontFamily: declaration.getPropertyValue("font-family").trim(),
      fontSize: declaration.getPropertyValue("font-size").trim(),
      fontWeight: declaration.getPropertyValue("font-weight").trim(),
      padding: declaration.getPropertyValue("padding").trim()
    };
  }

  function upsertGeneratedRule(cssText, selector, styles) {
    const withoutExisting = removeGeneratedRule(cssText, selector).trimEnd();
    const token = encodeURIComponent(selector);
    const declarations = [
      ["font-family", styles.fontFamily],
      ["font-size", styles.fontSize],
      ["font-weight", styles.fontWeight],
      ["padding", styles.padding]
    ]
      .filter(([, value]) => String(value ?? "").trim())
      .map(([property, value]) => `  ${property}: ${String(value).trim()} !important;`)
      .join("\n");
    const block = `/* ${RULE_MARKER_PREFIX}:start ${token} */\n.shadowdark.sheet.player ${selector} {\n${declarations}\n}\n/* ${RULE_MARKER_PREFIX}:end ${token} */`;
    return withoutExisting ? `${withoutExisting}\n\n${block}\n` : `${block}\n`;
  }

  function removeGeneratedRule(cssText, selector) {
    const token = encodeURIComponent(selector);
    const escapedToken = escapeRegExp(token);
    const pattern = new RegExp(
      `\\s*\\/\\* ${RULE_MARKER_PREFIX}:start ${escapedToken} \\*\\/[\\s\\S]*?\\/\\* ${RULE_MARKER_PREFIX}:end ${escapedToken} \\*\\/\\s*`,
      "g"
    );
    return String(cssText ?? "").replace(pattern, "\n").trim();
  }

  function findGeneratedRuleBlock(cssText, selector) {
    const token = encodeURIComponent(selector);
    const escapedToken = escapeRegExp(token);
    const pattern = new RegExp(
      `\\/\\* ${RULE_MARKER_PREFIX}:start ${escapedToken} \\*\\/\\s*[^{}]+\\{([\\s\\S]*?)\\}\\s*\\/\\* ${RULE_MARKER_PREFIX}:end ${escapedToken} \\*\\/`
    );
    return String(cssText ?? "").match(pattern)?.[1] ?? "";
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function buildStableSelector(target, root) {
    const parts = [];
    let element = target;

    while (element && element !== root && parts.length < 8) {
      const part = selectorPart(element);
      parts.unshift(part);
      element = element.parentElement;
    }

    return parts.join(" > ");
  }

  function selectorPart(element) {
    const tag = element.tagName.toLowerCase();
    for (const attribute of ["data-tab", "data-action", "data-group", "data-category", "name"]) {
      const value = element.getAttribute(attribute);
      if (value) return `${tag}[${attribute}="${cssAttributeEscape(value)}"]`;
    }

    const classes = Array.from(element.classList)
      .filter(className => !isTransientClass(className))
      .slice(0, 3)
      .map(className => `.${cssEscape(className)}`)
      .join("");
    if (classes) return `${tag}${classes}`;

    const siblings = Array.from(element.parentElement?.children ?? []).filter(sibling => sibling.tagName === element.tagName);
    return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(element) + 1})` : tag;
  }

  function isTransientClass(className) {
    return /^(active|hover|selected|focus|is-|sdx-style-|ui-|window-|flex)/i.test(className);
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  }

  function cssAttributeEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function clearSelectedTarget(root) {
    root?.querySelectorAll?.(".sdx-style-selected-target")?.forEach(element => {
      element.classList.remove("sdx-style-selected-target");
    });
  }

  function closeContextMenu() {
    activeMenu?.remove();
    activeMenu = null;
    document.querySelectorAll(".sdx-style-selected-target").forEach(element => {
      element.classList.remove("sdx-style-selected-target");
    });
  }

  function getSetting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_error) {
      return fallback;
    }
  }

  function getStoredWorldSetting(key) {
    try {
      const record = game.settings.storage.get("world")?.get(`${MODULE_ID}.${key}`);
      return record?.value ?? record?._source?.value ?? "";
    } catch (_error) {
      return "";
    }
  }

  function normalizeImagePath(path) {
    const value = String(path ?? "").trim();
    if (!value || /^(https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;

    const clean = value.replace(/\\/g, "/").replace(/^\.\//, "");
    if (/^(modules|systems|worlds|icons|uploads)\//i.test(clean)) return toFoundryRoute(clean);
    if (clean.startsWith("assets/")) return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    if (clean.startsWith("images/")) return toFoundryRoute(clean);
    if (clean.includes("/")) return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    return toFoundryRoute(`modules/${MODULE_ID}/assets/${clean}`);
  }

  function toFoundryRoute(path) {
    const clean = String(path ?? "").replace(/^\/+/, "");
    try {
      if (foundry.utils.getRoute) return foundry.utils.getRoute(clean);
    } catch (_error) {
      // Use the host-root fallback.
    }
    return `/${clean}`;
  }

  function cssUrlEscape(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "");
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }
})();
