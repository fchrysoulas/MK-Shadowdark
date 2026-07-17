(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Sheet Style Editor";
  const EDITOR_SETTING = "sheetStyleEditorEnabled";
  const CSS_SETTING = "sheetStyleEditorCss";
  const TYPOGRAPHY_MIGRATION_SETTING = "sheetStyleEditorTypographyMigrated";
  const MK_PREFIX_MIGRATION_SETTING = "sheetStyleEditorMkPrefixMigrated";
  const DEFAULTS_SEEDED_SETTING = "sheetStyleEditorDefaultsSeeded";
  const SUMMARY_CSS_SPLIT_SETTING = "sheetStyleEditorSummaryCssSplit";
  const QUICKDRAW_CSS_FIXED_SETTING = "sheetStyleEditorQuickdrawStylesExtracted";
  const EXPANDED_CONTROLS_SETTING = "sheetStyleEditorExpandedControls";
  const SOLID_NAVIGATION_SETTING = "sheetStyleEditorSolidNavigationBackground";
  const FIXED_EDITOR_CSS_SETTING = "sheetStyleEditorUiStylesExtracted";
  const FIXED_CONTEXT_MENU_CSS_SETTING = "sheetStyleEditorContextMenuStylesExtracted";
  const FIXED_ATTACK_PROPERTIES_CSS_SETTING = "sheetStyleEditorAttackPropertiesStylesExtracted";
  const HIDE_LOGO_SETTING = "characterSheetTweaksHideLogo";
  const HEADER_BACKGROUND_SETTING = "characterSheetTweaksHeaderBackgroundImage";
  const STYLE_ELEMENT_ID = "mk-shadowdark-global-sheet-styles";
  const RULE_MARKER_PREFIX = "mk-shadowdark-style-editor";
  const SETTING_MARKER_PREFIX = "mk-shadowdark-setting";
  const EDITABLE_DEFAULT_STYLESHEETS = Object.freeze([
    `modules/${MODULE_ID}/styles/character-sheet-tweaks.css`
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
  let editableTemplateCssPromise = null;
  const renderedSheetRoots = new WeakMap();

  globalThis.MKShadowdarkSheetStyleEditor = {
    applyCss,
    syncCharacterSheetSettings
  };

  Hooks.once("ready", async () => {
    applyCss(getSetting(CSS_SETTING, ""));
    removeDirectEditableStyleLinks();
    if (!game.user?.isGM) return;

    await runInitializationStep("mk CSS prefix migration", migrateCssPrefixToMk);
    await runInitializationStep("Summary Bar CSS split migration", migrateSummaryBarCssSplit);
    await runInitializationStep("fixed Quickdraw CSS migration", migrateQuickdrawCssToFixedStylesheet);
    await runInitializationStep("expanded style controls migration", migrateExpandedStyleControls);
    await runInitializationStep("solid navigation background migration", migrateSolidNavigationBackground);
    await runInitializationStep("fixed Style Editor CSS migration", migrateStyleEditorCssToFixedStylesheet);
    await runInitializationStep("fixed context menu CSS migration", migrateContextMenuCssToFixedStylesheet);
    await runInitializationStep("fixed attack properties CSS migration", migrateAttackPropertiesCssToFixedStylesheet);
    await runInitializationStep("editable default CSS seed", seedEditableDefaultCss);
    await runInitializationStep("legacy typography migration", migrateLegacyTypographySettings);
    await runInitializationStep("managed setting CSS sync", syncCharacterSheetSettings);
  });

  for (const hookName of ["getApplicationHeaderButtons", "getApplicationV1HeaderButtons"]) {
    Hooks.on(hookName, addStyleEditorHeaderButton);
  }

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

    const windowElement = getWindowElement(app, root);
    root.querySelector(".mk-style-editor-toolbar")?.remove();
    root.querySelectorAll(".mk-has-style-editor-toolbar").forEach(element => {
      element.classList.remove("mk-has-style-editor-toolbar");
    });
    root.classList.remove("mk-style-edit-mode");
    renderedSheetRoots.set(app, root);

    if (!game.user?.isGM || !getSetting(EDITOR_SETTING, true)) {
      windowElement?.querySelectorAll?.(".mk-style-editor-toggle").forEach(element => element.remove());
      return;
    }

    resetHeaderButton(ensureStyleEditorHeaderButton(app, windowElement));
    bindStyleEditorContextMenu(root);
  }

  function isShadowdarkPlayerSheet(app, root) {
    if (!isShadowdarkPlayerApplication(app)) return false;

    return Boolean(
      root.matches?.(".shadowdark.sheet")
      || root.querySelector?.(".shadowdark.sheet")
      || root.querySelector?.("header.SD-header")
    );
  }

  function isShadowdarkPlayerApplication(app) {
    if (game.system?.id !== "shadowdark") return false;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor" || isGroupActor(actor)) return false;

    const type = String(actor.type ?? "").toLowerCase();
    const classes = Array.from(app?.options?.classes ?? []).join(" ").toLowerCase();
    return type === "player" || classes.includes("player");
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

  function getWindowElement(app, root) {
    const appElement = getRootElement(app?.element);
    if (appElement?.querySelector?.(".window-header")) return appElement;
    return root.closest?.(".window-app, .application, .app") ?? root;
  }

  function addStyleEditorHeaderButton(app, buttons) {
    if (!game.user?.isGM || !getSetting(EDITOR_SETTING, true)) return;
    if (!isShadowdarkPlayerApplication(app) || !Array.isArray(buttons)) return;
    if (buttons.some(button => String(button?.class ?? "").split(/\s+/).includes("mk-style-editor-toggle"))) return;

    const button = {
      label: "Edit Style",
      class: "mk-style-editor-toggle",
      icon: "fas fa-paintbrush",
      onclick: () => toggleStyleEditing(app)
    };
    buttons.unshift(button);
  }

  function ensureStyleEditorHeaderButton(app, windowElement) {
    const existing = windowElement?.querySelector?.(".mk-style-editor-toggle");
    if (existing) return existing;

    const header = windowElement?.querySelector?.(".window-header");
    const reference = header?.querySelector?.(".header-button, .window-header-button");
    if (!header || !reference) return null;

    const tagName = reference.tagName === "BUTTON" ? "button" : "a";
    const toggle = document.createElement(tagName);
    if (tagName === "BUTTON") toggle.type = "button";
    else toggle.href = "#";

    const nativeClasses = ["header-button", "control", "window-header-button"]
      .filter(className => reference.classList.contains(className));
    toggle.className = [...nativeClasses, "mk-style-editor-toggle"].join(" ");
    toggle.innerHTML = '<i class="fas fa-paintbrush" aria-hidden="true"></i> <span>Edit Style</span>';
    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleStyleEditing(app);
    });
    reference.before(toggle);
    return toggle;
  }

  function toggleStyleEditing(app) {
    const root = renderedSheetRoots.get(app);
    if (!root?.isConnected) {
      ui.notifications?.warn("The character sheet is not ready for style editing.");
      return;
    }

    const toggle = getWindowElement(app, root)?.querySelector?.(".mk-style-editor-toggle");
    const enabled = !root.classList.contains("mk-style-edit-mode");
    root.classList.toggle("mk-style-edit-mode", enabled);
    toggle?.classList.toggle("active", enabled);
    setHeaderButtonLabel(toggle, enabled ? "Finish Editing" : "Edit Style");
    if (toggle) {
      toggle.title = enabled ? "Disable style editing" : "Enable style editing";
      toggle.setAttribute("aria-label", toggle.title);
      toggle.setAttribute("aria-pressed", String(enabled));
    }

    if (!enabled) {
      clearSelectedTarget(root);
      closeContextMenu();
    } else {
      ui.notifications?.info("Style edit mode enabled. Right-click a sheet element to edit it.");
    }
  }

  function resetHeaderButton(toggle) {
    if (!toggle) return;
    toggle.classList.remove("active");
    setHeaderButtonLabel(toggle, "Edit Style");
    toggle.title = "Enable style editing";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-pressed", "false");
  }

  function setHeaderButtonLabel(toggle, text) {
    if (!toggle) return;
    const label = toggle.querySelector("span");
    if (label) {
      label.textContent = text;
      return;
    }

    const textNode = Array.from(toggle.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${text}`;
    else toggle.append(document.createTextNode(` ${text}`));
  }

  function bindStyleEditorContextMenu(root) {
    if (root.dataset.mkStyleEditorContextBound === "true") return;
    root.dataset.mkStyleEditorContextBound = "true";
    root.addEventListener("contextmenu", event => {
      if (!root.classList.contains("mk-style-edit-mode")) return;

      const target = getEditableTarget(event.target, root);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      openContextMenu({ root, target, x: event.clientX, y: event.clientY });
    }, true);
  }

  function getEditableTarget(candidate, root) {
    if (!(candidate instanceof HTMLElement)) return null;
    if (candidate.closest(".mk-style-context-menu")) return null;
    if (candidate.closest(".mk-character-sheet-bar")) return null;
    if (candidate === root) return null;
    const navigationLink = candidate.closest(".SD-nav a");
    if (navigationLink && root.contains(navigationLink)) return navigationLink;
    return candidate;
  }

  function openContextMenu({ root, target, x, y }) {
    closeContextMenu();
    clearSelectedTarget(root);
    target.classList.add("mk-style-selected-target");

    const selector = buildStableSelector(target, root);
    if (!selector) return;

    const cssText = String(getSetting(CSS_SETTING, "") ?? "");
    const existing = getGeneratedRuleStyles(cssText, selector);
    const hasOverride = Boolean(findGeneratedRuleBlock(cssText, selector));
    const computed = getComputedStyle(target);
    const fontWeight = existing.fontWeight ?? computed.fontWeight;
    const isBold = Number.parseInt(fontWeight, 10) >= 600 || String(fontWeight).toLowerCase() === "bold";
    const padding = existing.padding ?? [computed.paddingTop, computed.paddingRight, computed.paddingBottom, computed.paddingLeft].join(" ");
    const margin = existing.margin ?? [computed.marginTop, computed.marginRight, computed.marginBottom, computed.marginLeft].join(" ");
    const color = existing.color ?? computed.color;
    const backgroundColor = existing.backgroundColor ?? computed.backgroundColor;
    const backgroundImage = extractBackgroundImageUrl(existing.backgroundImage ?? computed.backgroundImage);
    const border = existing.border ?? computed.border;
    const navigationState = getNavigationState(target);

    const menu = document.createElement("section");
    menu.className = "mk-style-context-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Edit element style");
    menu.innerHTML = `
      <header>
        <strong>Element Style</strong>
        <button type="button" data-action="close" title="Close"><i class="fas fa-xmark"></i></button>
      </header>
      <p class="mk-style-selector" title="${escapeHtml(selector)}">${escapeHtml(selector)}</p>
      <div class="mk-style-status" aria-live="polite">
        ${navigationState ? `<span>Navigation: ${escapeHtml(navigationState)}</span>` : ""}
        <span class="mk-style-status__override ${hasOverride ? "is-modified" : ""}" data-role="override-status">
          ${hasOverride ? "Saved override" : "No saved override"}
        </span>
        <span data-role="source-status">Base: checking...</span>
        <span data-role="dirty-status">No unsaved changes</span>
      </div>
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
        <span>Text color</span>
        <span class="mk-style-color-control">
          <input type="color" data-color-picker="color" value="${escapeHtml(colorToHex(color, "#000000"))}" title="Choose text color">
          <input type="text" data-field="color" value="${escapeHtml(color)}" placeholder="#222 or rgba(...)" spellcheck="false">
        </span>
      </label>
      <label>
        <span>Background</span>
        <span class="mk-style-color-control">
          <input type="color" data-color-picker="backgroundColor" value="${escapeHtml(colorToHex(backgroundColor, "#ffffff"))}" title="Choose background color">
          <input type="text" data-field="backgroundColor" value="${escapeHtml(backgroundColor)}" placeholder="#fff or transparent" spellcheck="false">
        </span>
      </label>
      <label>
        <span>Background image</span>
        <span class="mk-style-image-control">
          <input type="text" data-field="backgroundImage" value="${escapeHtml(backgroundImage)}" placeholder="Select or enter an image path" spellcheck="false">
          <button type="button" data-action="browse-background" title="Browse images"><i class="fas fa-file-image"></i></button>
        </span>
      </label>
      <label>
        <span>Border</span>
        <input type="text" data-field="border" value="${escapeHtml(border)}" placeholder="e.g. 1px solid #888" spellcheck="false">
      </label>
      <label>
        <span>Padding</span>
        <input type="text" data-field="padding" value="${escapeHtml(padding)}" placeholder="e.g. 4px 8px">
      </label>
      <label>
        <span>Margin</span>
        <input type="text" data-field="margin" value="${escapeHtml(margin)}" placeholder="e.g. 4px 8px">
      </label>
      <footer>
        <button type="button" data-action="reset"${hasOverride ? "" : " disabled"}><i class="fas fa-rotate-left"></i> Reset override</button>
        <button type="button" data-action="apply" disabled><i class="fas fa-check"></i> Apply</button>
      </footer>
    `;

    document.body.append(menu);
    activeMenu = menu;
    positionContextMenu(menu, x, y);
    initializeMenuValidation(menu);
    void updateStyleSourceStatus(menu, target, selector);

    menu.addEventListener("contextmenu", event => event.preventDefault());
    menu.querySelector('[data-action="close"]').addEventListener("click", () => {
      clearSelectedTarget(root);
      closeContextMenu();
    });
    menu.querySelector('[data-action="apply"]').addEventListener("click", async () => {
      await applyMenuChanges({ root, selector, menu });
    });
    menu.querySelector('[data-action="browse-background"]').addEventListener("click", async () => {
      await browseForBackgroundImage(menu.querySelector('[data-field="backgroundImage"]'));
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

  function initializeMenuValidation(menu) {
    const initialValues = JSON.stringify(getMenuValues(menu));
    const applyButton = menu.querySelector('[data-action="apply"]');
    const dirtyStatus = menu.querySelector('[data-role="dirty-status"]');

    const updateDirtyState = () => {
      const dirty = JSON.stringify(getMenuValues(menu)) !== initialValues;
      menu.classList.toggle("is-dirty", dirty);
      applyButton.disabled = !dirty;
      dirtyStatus.textContent = dirty ? "Unsaved changes" : "No unsaved changes";
      dirtyStatus.classList.toggle("is-dirty", dirty);
    };

    menu.querySelectorAll('[data-color-picker]').forEach(picker => {
      const field = menu.querySelector(`[data-field="${picker.dataset.colorPicker}"]`);
      if (!field) return;

      picker.addEventListener("input", () => {
        field.value = picker.value;
      });
      field.addEventListener("input", () => {
        if (globalThis.CSS?.supports && !CSS.supports("color", field.value.trim())) return;
        picker.value = colorToHex(field.value, picker.value);
      });
    });

    menu.addEventListener("input", updateDirtyState);
    menu.addEventListener("change", updateDirtyState);
    updateDirtyState();
  }

  function getMenuValues(menu) {
    return Object.fromEntries(Array.from(menu.querySelectorAll('[data-field]')).map(field => [
      field.dataset.field,
      String(field.value ?? "").trim()
    ]));
  }

  async function updateStyleSourceStatus(menu, target, selector) {
    const status = menu.querySelector('[data-role="source-status"]');
    if (!status) return;

    try {
      const source = await resolveBaseStyleSource(target, selector);
      if (!menu.isConnected) return;
      status.textContent = `Base: ${source}`;
      status.dataset.source = source;
    } catch (error) {
      if (!menu.isConnected) return;
      status.textContent = "Base: source unavailable";
      console.warn(`${MODULE_ID} | ${SUBMODULE} | style source detection error`, error);
    }
  }

  async function resolveBaseStyleSource(target, selector) {
    const templateCss = await loadEditableTemplateCss();
    if (cssTextMatchesTarget(templateCss, target)) return "MK-Shadowdark Tweaks CSS";

    const globalCssWithoutOverride = removeGeneratedRule(String(getSetting(CSS_SETTING, "") ?? ""), selector);
    if (cssTextMatchesTarget(globalCssWithoutOverride, target)) return "custom Global Style CSS";

    const moduleStyleSheets = Array.from(document.styleSheets).filter(sheet =>
      String(sheet.href ?? "").includes(`/modules/${MODULE_ID}/`)
    );
    if (moduleStyleSheets.some(sheet => styleSheetMatchesTarget(sheet, target))) return "MK-Shadowdark module CSS";

    return "Shadowdark original / inherited";
  }

  function loadEditableTemplateCss() {
    if (!editableTemplateCssPromise) {
      editableTemplateCssPromise = (async () => {
        const route = toFoundryRoute(EDITABLE_DEFAULT_STYLESHEETS[0]);
        const response = await fetch(route, { cache: "no-store" });
        if (!response.ok) throw new Error(`Could not load ${route}: HTTP ${response.status}`);
        return response.text();
      })().catch(error => {
        editableTemplateCssPromise = null;
        throw error;
      });
    }
    return editableTemplateCssPromise;
  }

  function cssTextMatchesTarget(cssText, target) {
    const style = document.createElement("style");
    style.media = "not all";
    style.textContent = String(cssText ?? "");
    document.head.append(style);
    try {
      return styleSheetMatchesTarget(style.sheet, target);
    } finally {
      style.remove();
    }
  }

  function styleSheetMatchesTarget(sheet, target) {
    try {
      return cssRulesMatchTarget(sheet?.cssRules, target);
    } catch (_error) {
      return false;
    }
  }

  function cssRulesMatchTarget(rules, target) {
    for (const rule of Array.from(rules ?? [])) {
      if (rule.selectorText && hasEditableStyleDeclaration(rule.style)) {
        try {
          if (target.matches(rule.selectorText)) return true;
        } catch (_error) {
          // Ignore selectors unsupported by Element.matches.
        }
      }
      if (rule.cssRules && cssRulesMatchTarget(rule.cssRules, target)) return true;
    }
    return false;
  }

  function hasEditableStyleDeclaration(style) {
    if (!style) return false;
    return [
      "font-family",
      "font-size",
      "font-weight",
      "color",
      "background",
      "background-color",
      "background-image",
      "border",
      "padding",
      "margin"
    ].some(property => Boolean(style.getPropertyValue(property).trim()));
  }

  async function browseForBackgroundImage(input) {
    const FilePickerClass = globalThis.foundry?.applications?.apps?.FilePicker?.implementation
      ?? globalThis.foundry?.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePickerClass) {
      ui.notifications?.warn("The Foundry image picker is unavailable.");
      return;
    }

    const callback = path => {
      input.value = String(path ?? "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const picker = new FilePickerClass({ type: "image", current: input.value, callback });
    if (typeof picker.browse === "function") await picker.browse(input.value || "");
    else await picker.render(true);
  }

  async function applyMenuChanges({ root, selector, menu }) {
    const values = getMenuValues(menu);
    const { fontFamily, fontSize, fontWeight, color, backgroundColor, border, padding, margin } = values;
    const backgroundImage = buildBackgroundImageValue(values.backgroundImage);

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
    if (margin && globalThis.CSS?.supports && !CSS.supports("margin", margin)) {
      ui.notifications?.warn(`Invalid margin: ${margin}`);
      return;
    }
    if (color && globalThis.CSS?.supports && !CSS.supports("color", color)) {
      ui.notifications?.warn(`Invalid text color: ${color}`);
      return;
    }
    if (backgroundColor && globalThis.CSS?.supports && !CSS.supports("background-color", backgroundColor)) {
      ui.notifications?.warn(`Invalid background color: ${backgroundColor}`);
      return;
    }
    if (backgroundImage && globalThis.CSS?.supports && !CSS.supports("background-image", backgroundImage)) {
      ui.notifications?.warn("Invalid background image path.");
      return;
    }
    if (border && globalThis.CSS?.supports && !CSS.supports("border", border)) {
      ui.notifications?.warn(`Invalid border: ${border}`);
      return;
    }

    await updateGlobalCss(currentCss => (
      upsertGeneratedRule(currentCss, selector, {
        fontFamily,
        fontSize,
        fontWeight,
        color,
        backgroundColor,
        backgroundImage,
        border,
        padding,
        margin
      })
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

  async function migrateCssPrefixToMk() {
    if (getSetting(MK_PREFIX_MIGRATION_SETTING, false)) return;

    await updateGlobalCss(currentCss => String(currentCss ?? "").replaceAll("sdx-", "mk-"));
    await game.settings.set(MODULE_ID, MK_PREFIX_MIGRATION_SETTING, true);
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

  async function migrateQuickdrawCssToFixedStylesheet() {
    if (getSetting(QUICKDRAW_CSS_FIXED_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, QUICKDRAW_CSS_FIXED_SETTING, true);
  }

  async function migrateExpandedStyleControls() {
    if (getSetting(EXPANDED_CONTROLS_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, EXPANDED_CONTROLS_SETTING, true);
  }

  async function migrateSolidNavigationBackground() {
    if (getSetting(SOLID_NAVIGATION_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, SOLID_NAVIGATION_SETTING, true);
  }

  async function migrateStyleEditorCssToFixedStylesheet() {
    if (getSetting(FIXED_EDITOR_CSS_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, FIXED_EDITOR_CSS_SETTING, true);
  }

  async function migrateContextMenuCssToFixedStylesheet() {
    if (getSetting(FIXED_CONTEXT_MENU_CSS_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, FIXED_CONTEXT_MENU_CSS_SETTING, true);
  }

  async function migrateAttackPropertiesCssToFixedStylesheet() {
    if (getSetting(FIXED_ATTACK_PROPERTIES_CSS_SETTING, false)) return;

    const defaultCss = await loadEditableDefaultCss();
    await updateGlobalCss(currentCss => upsertManagedBlockAtStart(
      currentCss,
      "editable-character-sheet-defaults",
      defaultCss
    ));
    await game.settings.set(MODULE_ID, DEFAULTS_SEEDED_SETTING, true);
    await game.settings.set(MODULE_ID, FIXED_ATTACK_PROPERTIES_CSS_SETTING, true);
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
    return `.shadowdark.sheet.player.mk-character-sheet-tweaks .SD-header .shadowdark-logo {
  display: none !important;
}`;
  }

  function buildHeaderBackgroundCss(imagePath) {
    return `.shadowdark.sheet.player.mk-character-sheet-tweaks .SD-header {
  background-image:
    linear-gradient(
      180deg,
      transparent 65%,
      rgba(0, 0, 0, 0.35) 70%,
      rgba(0, 0, 0, 0.75) 88%,
      #000 100%
    ),
    linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.42),
      rgba(0, 0, 0, 0.12) 38%,
      rgba(0, 0, 0, 0.48)
    ),
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
      color: declaration.getPropertyValue("color").trim(),
      backgroundColor: declaration.getPropertyValue("background-color").trim(),
      backgroundImage: declaration.getPropertyValue("background-image").trim(),
      border: declaration.getPropertyValue("border").trim(),
      padding: declaration.getPropertyValue("padding").trim(),
      margin: declaration.getPropertyValue("margin").trim()
    };
  }

  function upsertGeneratedRule(cssText, selector, styles) {
    const withoutExisting = removeGeneratedRule(cssText, selector).trimEnd();
    const token = encodeURIComponent(selector);
    const declarations = [
      ["font-family", styles.fontFamily],
      ["font-size", styles.fontSize],
      ["font-weight", styles.fontWeight],
      ["color", styles.color],
      ["background-color", styles.backgroundColor],
      ["background-image", styles.backgroundImage],
      ["border", styles.border],
      ["padding", styles.padding],
      ["margin", styles.margin]
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
    const navigationStateSelector = buildNavigationStateSelector(target);
    if (navigationStateSelector) return navigationStateSelector;

    const parts = [];
    let element = target;

    while (element && element !== root && parts.length < 8) {
      const part = selectorPart(element);
      parts.unshift(part);
      element = element.parentElement;
    }

    return parts.join(" > ");
  }

  function buildNavigationStateSelector(target) {
    if (!target.matches?.(".SD-nav a")) return "";
    return target.classList.contains("active")
      ? "nav.SD-nav a.active"
      : "nav.SD-nav a:not(.active)";
  }

  function getNavigationState(target) {
    if (!target.matches?.(".SD-nav a")) return "";
    return target.classList.contains("active") ? "Active" : "Inactive";
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
    return /^(active|hover|selected|focus|is-|mk-style-|ui-|window-|flex)/i.test(className);
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  }

  function cssAttributeEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function clearSelectedTarget(root) {
    root?.querySelectorAll?.(".mk-style-selected-target")?.forEach(element => {
      element.classList.remove("mk-style-selected-target");
    });
  }

  function closeContextMenu() {
    activeMenu?.remove();
    activeMenu = null;
    document.querySelectorAll(".mk-style-selected-target").forEach(element => {
      element.classList.remove("mk-style-selected-target");
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

  function extractBackgroundImageUrl(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "none") return "";
    const match = text.match(/url\(\s*(["']?)(.*?)\1\s*\)/i);
    return match?.[2] ?? "";
  }

  function buildBackgroundImageValue(path) {
    const normalized = normalizeImagePath(path);
    return normalized ? `url("${cssUrlEscape(normalized)}")` : "";
  }

  function colorToHex(value, fallback = "#000000") {
    const normalized = String(value ?? "").trim();
    const shortHex = normalized.match(/^#([\da-f])([\da-f])([\da-f])$/i);
    if (shortHex) return `#${shortHex.slice(1).map(channel => channel + channel).join("")}`.toLowerCase();

    const fullHex = normalized.match(/^#([\da-f]{6})(?:[\da-f]{2})?$/i);
    if (fullHex) return `#${fullHex[1].toLowerCase()}`;

    const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!rgb) return fallback;
    const channels = rgb.slice(1, 4).map(channel => Math.min(255, Math.max(0, Math.round(Number(channel) || 0))));
    return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
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
