(() => {
  const MODULE_ID = "mk-shadowdark";
  const ENABLED_SETTING = "paperChatEnabled";
  const STYLE_SETTING = "paperChatStyle";
  const EDITOR_SETTING = "paperChatStyleEditorEnabled";
  const CSS_SETTING = "paperChatEditorCss";
  const DEFAULT_STYLE = "parchment-scroll";
  const STYLE_ELEMENT_ID = "mk-shadowdark-global-chat-styles";
  const RULE_MARKER_PREFIX = "mk-shadowdark-chat-style-editor";
  const EDIT_MODE_CLASS = "mk-chat-style-edit-mode";
  const MESSAGE_SELECTOR = ":is(.message, .chat-message)";
  const CHAT_LOG_SELECTOR = ":is(#chat-log, .chat-log)";
  const V2_CONTROL_ACTION = "mkChatStyleEditor";
  const STYLE_CLASSES = Object.freeze({
    "parchment-scroll": "mk-paper-chat--parchment-scroll",
    "clean-parchment": "mk-paper-chat--clean-parchment",
    "dark-grimoire": "mk-paper-chat--dark-grimoire",
    "torn-field-note": "mk-paper-chat--torn-field-note",
    "illuminated-manuscript": "mk-paper-chat--illuminated-manuscript",
    "dungeon-ledger": "mk-paper-chat--dungeon-ledger",
    "crimson-dispatch": "mk-paper-chat--crimson-dispatch",
    "moonlit-arcana": "mk-paper-chat--moonlit-arcana",
    "obsidian-sun": "mk-paper-chat--obsidian-sun",
    "tyrants-decree": "mk-paper-chat--tyrants-decree",
    "silt-sea-chart": "mk-paper-chat--silt-sea-chart",
    "bloodsand-arena": "mk-paper-chat--bloodsand-arena"
  });
  const STYLE_LABELS = Object.freeze({
    "parchment-scroll": "Parchment Scroll",
    "clean-parchment": "Clean Parchment",
    "dark-grimoire": "Dark Grimoire",
    "torn-field-note": "Torn Field Note",
    "illuminated-manuscript": "Illuminated Manuscript",
    "dungeon-ledger": "Dungeon Ledger",
    "crimson-dispatch": "Crimson Dispatch",
    "moonlit-arcana": "Moonlit Arcana",
    "obsidian-sun": "Obsidian Sun",
    "tyrants-decree": "Tyrant's Decree",
    "silt-sea-chart": "Silt Sea Chart",
    "bloodsand-arena": "Bloodsand Arena"
  });
  const STYLE_PROPERTIES = Object.freeze([
    "fontFamily",
    "fontSize",
    "fontWeight",
    "color",
    "backgroundColor",
    "backgroundImage",
    "border",
    "borderRadius",
    "width",
    "height",
    "padding",
    "margin",
    "textAlign"
  ]);

  let activeMenu = null;
  let cssUpdateQueue = Promise.resolve();

  globalThis.MKShadowdarkChatStyleEditor = {
    applyCss,
    syncAvailability
  };

  Hooks.once("ready", () => {
    applyCss(getSetting(CSS_SETTING, ""));
    syncAvailability();
    ensureChatEditorButtons(document);
  });

  Hooks.on("renderChatInput", (_app, elements) => {
    ensureChatEditorButtons(elements);
    queueControlSync();
  });

  Hooks.on("renderChatLog", (_app, html) => {
    ensureChatEditorButtons(html);
    queueControlSync();
  });

  Hooks.on("changeSidebarTab", () => {
    ensureChatEditorButtons(document);
    queueControlSync();
  });

  Hooks.on("getHeaderControlsChatLog", (_app, controls) => {
    if (!isEditorAvailable() || !Array.isArray(controls)) return;
    if (controls.some(control => control?.action === V2_CONTROL_ACTION)) return;

    controls.unshift({
      icon: "fa-solid fa-paintbrush",
      label: "Edit Chat Style",
      action: V2_CONTROL_ACTION,
      visible: true,
      onClick: toggleStyleEditing
    });
  });

  Hooks.on("getChatLogHeaderButtons", (_app, buttons) => {
    if (!isEditorAvailable() || !Array.isArray(buttons)) return;
    if (buttons.some(button => String(button?.class ?? "").split(/\s+/).includes("mk-chat-style-editor-toggle"))) return;

    buttons.unshift({
      label: "Edit Chat Style",
      class: "mk-chat-style-editor-toggle",
      icon: "fas fa-paintbrush",
      onclick: toggleStyleEditing
    });
  });

  document.addEventListener("contextmenu", event => {
    if (!document.body?.classList.contains(EDIT_MODE_CLASS)) return;

    const target = getEditableTarget(event.target);
    if (!target) return;

    const message = target.closest(MESSAGE_SELECTOR);
    if (!message) return;

    event.preventDefault();
    event.stopPropagation();
    openContextMenu({ target, message, x: event.clientX, y: event.clientY });
  }, true);

  document.addEventListener("pointerdown", event => {
    if (activeMenu && !activeMenu.contains(event.target)) closeContextMenu();
  }, true);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeContextMenu();
  });

  function syncAvailability() {
    const available = isEditorAvailable() && isPaperChatEnabled();
    if (activeMenu) closeContextMenu();
    if (!available) disableStyleEditing();
    ensureChatEditorButtons(document);
    syncEditorControls();
  }

  function isEditorAvailable() {
    return Boolean(game.user?.isGM && getSetting(EDITOR_SETTING, true));
  }

  function isPaperChatEnabled() {
    return Boolean(getSetting(ENABLED_SETTING, true));
  }

  function ensureChatEditorButtons(source) {
    const roots = getSourceElements(source);
    if (!roots.length) roots.push(document);

    if (!isEditorAvailable()) {
      for (const root of roots) {
        root.querySelectorAll?.(".mk-chat-style-editor-toggle")?.forEach(button => button.remove());
      }
      return;
    }

    for (const root of roots) {
      const chatControls = [];
      if (root.matches?.("#chat-controls")) chatControls.push(root);
      root.querySelectorAll?.("#chat-controls")?.forEach(element => chatControls.push(element));

      for (const controls of chatControls) {
        if (controls.querySelector(".mk-chat-style-editor-toggle")) continue;
        const buttonGroup = controls.querySelector(".control-buttons");
        if (!buttonGroup) continue;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "ui-control icon fa-solid fa-paintbrush mk-chat-style-editor-toggle";
        button.setAttribute("data-tooltip", "");
        button.setAttribute("aria-label", "Edit Chat Style");
        button.title = "Edit Chat Style";
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          toggleStyleEditing();
        });
        buttonGroup.prepend(button);
      }
    }

    syncEditorControls();
  }

  function getSourceElements(source) {
    const values = [];
    const add = value => {
      const element = getRootElement(value);
      if (element?.querySelectorAll) values.push(element);
    };

    if (source && typeof source === "object" && !source.querySelectorAll && !source.jquery && !Array.isArray(source)) {
      Object.values(source).forEach(add);
    } else {
      add(source);
    }
    return [...new Set(values)];
  }

  function getRootElement(value) {
    if (value === document) return document;
    if (value instanceof Element) return value;
    return value?.[0] instanceof Element ? value[0] : null;
  }

  function queueControlSync() {
    setTimeout(() => {
      ensureChatEditorButtons(document);
      syncEditorControls();
    }, 0);
  }

  function toggleStyleEditing() {
    if (!isEditorAvailable()) {
      ui.notifications?.warn("The Paper Chat style editor is unavailable.");
      return;
    }
    if (!isPaperChatEnabled()) {
      ui.notifications?.warn("Enable Paper Chat before editing its style.");
      return;
    }

    const enabled = !document.body?.classList.contains(EDIT_MODE_CLASS);
    document.body?.classList.toggle(EDIT_MODE_CLASS, enabled);
    if (!enabled) closeContextMenu();
    syncEditorControls();
    ui.notifications?.info(
      enabled
        ? "Chat style edit mode enabled. Right-click a chat element to edit the selected theme."
        : "Chat style edit mode disabled."
    );
  }

  function disableStyleEditing() {
    document.body?.classList.remove(EDIT_MODE_CLASS);
    closeContextMenu();
  }

  function syncEditorControls() {
    const enabled = Boolean(document.body?.classList.contains(EDIT_MODE_CLASS));
    const available = isEditorAvailable() && isPaperChatEnabled();
    const label = enabled ? "Finish Editing Chat Style" : "Edit Chat Style";

    document.querySelectorAll(".mk-chat-style-editor-toggle").forEach(button => {
      button.classList.toggle("active", enabled);
      button.disabled = !available;
      button.setAttribute("aria-pressed", String(enabled));
      button.setAttribute("aria-label", label);
      button.title = available ? label : "Enable Paper Chat to edit its style";
      const text = button.querySelector("span, .control-label");
      if (text) text.textContent = label;
    });

    document.querySelectorAll(`[data-action="${V2_CONTROL_ACTION}"]`).forEach(control => {
      control.classList.toggle("active", enabled);
      const button = control.matches("button") ? control : control.querySelector("button");
      if (!button) return;
      button.disabled = !available;
      button.setAttribute("aria-pressed", String(enabled));
      button.title = available ? label : "Enable Paper Chat to edit its style";
      const text = button.querySelector(".control-label");
      if (text) text.textContent = label;
    });
  }

  function getEditableTarget(candidate) {
    if (!(candidate instanceof Element)) return null;
    if (candidate.closest(".mk-style-context-menu, .mk-chat-style-editor-toggle")) return null;

    const log = candidate.closest(CHAT_LOG_SELECTOR);
    const message = candidate.closest(MESSAGE_SELECTOR);
    if (!log || !message || !log.contains(message)) return null;

    const control = candidate.closest("button, a, input, select, textarea, img");
    if (control && message.contains(control)) return control;
    if (candidate instanceof HTMLElement) return candidate;
    return candidate.parentElement instanceof HTMLElement ? candidate.parentElement : null;
  }

  function openContextMenu({ target, message, x, y }) {
    closeContextMenu();
    target.classList.add("mk-style-selected-target");

    const selector = buildStableSelector(target, message);
    const theme = getCurrentTheme();
    const ruleKey = buildRuleKey(theme, selector);
    const cssText = String(getSetting(CSS_SETTING, "") ?? "");
    const existing = getGeneratedRuleStyles(cssText, ruleKey);
    const hasOverride = Boolean(findGeneratedRuleBlock(cssText, ruleKey));
    const computed = getComputedStyle(target);
    const displayedBackgroundImage = existing.backgroundImage || computed.backgroundImage;

    const menu = document.createElement("section");
    menu.className = "mk-style-context-menu mk-chat-style-context-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Edit chat element style");
    menu.innerHTML = `
      <header>
        <strong>Chat Element Style</strong>
        <button type="button" data-action="close" title="Close"><i class="fas fa-xmark"></i></button>
      </header>
      <p class="mk-style-selector" title="${escapeHtml(buildScopedSelector(theme, selector))}">
        ${escapeHtml(buildScopedSelector(theme, selector))}
      </p>
      <div class="mk-style-status" aria-live="polite">
        <span>Theme: ${escapeHtml(STYLE_LABELS[theme])}</span>
        <span>Scope: current theme</span>
        <span class="mk-style-status__override ${hasOverride ? "is-modified" : ""}" data-role="override-status">
          ${hasOverride ? "Saved override" : "No saved override"}
        </span>
        <span data-role="dirty-status">No unsaved changes</span>
      </div>
      <label>
        <span>Font family</span>
        <input type="text" data-field="fontFamily" value="${escapeHtml(existing.fontFamily || computed.fontFamily)}">
      </label>
      <label>
        <span>Font size</span>
        <input type="text" data-field="fontSize" value="${escapeHtml(existing.fontSize || computed.fontSize)}" placeholder="e.g. 14px or 1rem">
      </label>
      <label>
        <span>Font weight</span>
        <input type="text" data-field="fontWeight" value="${escapeHtml(existing.fontWeight || computed.fontWeight)}" placeholder="e.g. 400 or 700">
      </label>
      <label>
        <span>Text color</span>
        <span class="mk-style-color-control">
          <input type="color" data-color-picker="color" value="${escapeHtml(colorToHex(existing.color || computed.color, "#000000"))}" title="Choose text color">
          <input type="text" data-field="color" value="${escapeHtml(existing.color || computed.color)}" placeholder="#222 or rgba(...)" spellcheck="false">
        </span>
      </label>
      <label>
        <span>Background</span>
        <span class="mk-style-color-control">
          <input type="color" data-color-picker="backgroundColor" value="${escapeHtml(colorToHex(existing.backgroundColor || computed.backgroundColor, "#ffffff"))}" title="Choose background color">
          <input type="text" data-field="backgroundColor" value="${escapeHtml(existing.backgroundColor || computed.backgroundColor)}" placeholder="#fff or transparent" spellcheck="false">
        </span>
      </label>
      <label>
        <span>Background image</span>
        <span class="mk-style-image-control">
          <input type="text" data-field="backgroundImage" value="${escapeHtml(extractBackgroundImageUrl(displayedBackgroundImage))}" placeholder="Image path or none" spellcheck="false">
          <button type="button" data-action="browse-background" title="Browse images"><i class="fas fa-file-image"></i></button>
        </span>
      </label>
      <label>
        <span>Border</span>
        <input type="text" data-field="border" value="${escapeHtml(existing.border || computed.border)}" placeholder="e.g. 1px solid #888" spellcheck="false">
      </label>
      <label>
        <span>Border radius</span>
        <input type="text" data-field="borderRadius" value="${escapeHtml(existing.borderRadius || computed.borderRadius)}" placeholder="e.g. 6px">
      </label>
      <label>
        <span>Width</span>
        <input type="text" data-field="width" value="${escapeHtml(existing.width || computed.width)}" placeholder="e.g. 320px, 100%, or auto" spellcheck="false">
      </label>
      <label>
        <span>Height</span>
        <input type="text" data-field="height" value="${escapeHtml(existing.height || computed.height)}" placeholder="e.g. 120px, 50%, or auto" spellcheck="false">
      </label>
      <label>
        <span>Padding</span>
        <input type="text" data-field="padding" value="${escapeHtml(existing.padding || boxValue(computed, "padding"))}" placeholder="e.g. 4px 8px">
      </label>
      <label>
        <span>Margin</span>
        <input type="text" data-field="margin" value="${escapeHtml(existing.margin || boxValue(computed, "margin"))}" placeholder="e.g. 4px 8px">
      </label>
      <label>
        <span>Text align</span>
        <select data-field="textAlign">
          ${textAlignOptions(existing.textAlign || computed.textAlign)}
        </select>
      </label>
      <footer>
        <button type="button" data-action="reset"${hasOverride ? "" : " disabled"}>
          <i class="fas fa-rotate-left"></i> Reset override
        </button>
        <button type="button" data-action="apply" disabled><i class="fas fa-check"></i> Apply</button>
      </footer>
    `;

    document.body.append(menu);
    activeMenu = menu;
    menu._mkExistingStyles = existing;
    menu._mkInitialBackgroundImageCss = displayedBackgroundImage;
    initializeMenuValidation(menu);
    positionContextMenu(menu, x, y);

    menu.addEventListener("contextmenu", event => event.preventDefault());
    menu.querySelector('[data-action="close"]').addEventListener("click", closeContextMenu);
    menu.querySelector('[data-action="browse-background"]').addEventListener("click", async () => {
      await browseForBackgroundImage(menu.querySelector('[data-field="backgroundImage"]'));
    });
    menu.querySelector('[data-action="apply"]').addEventListener("click", async () => {
      await applyMenuChanges({ ruleKey, theme, selector, menu });
    });
    menu.querySelector('[data-action="reset"]').addEventListener("click", async () => {
      await resetElementRule(ruleKey);
    });
  }

  function positionContextMenu(menu, x, y) {
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - bounds.height - margin))}px`;
  }

  function initializeMenuValidation(menu) {
    const initialValues = getMenuValues(menu);
    menu._mkInitialValues = initialValues;
    const initialText = JSON.stringify(initialValues);
    const applyButton = menu.querySelector('[data-action="apply"]');
    const dirtyStatus = menu.querySelector('[data-role="dirty-status"]');

    const updateDirtyState = () => {
      const dirty = JSON.stringify(getMenuValues(menu)) !== initialText;
      menu.classList.toggle("is-dirty", dirty);
      applyButton.disabled = !dirty;
      dirtyStatus.textContent = dirty ? "Unsaved changes" : "No unsaved changes";
      dirtyStatus.classList.toggle("is-dirty", dirty);
    };

    menu.querySelectorAll("[data-color-picker]").forEach(picker => {
      const field = menu.querySelector(`[data-field="${picker.dataset.colorPicker}"]`);
      if (!field) return;

      picker.addEventListener("input", () => {
        field.value = picker.value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
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
    return Object.fromEntries(Array.from(menu.querySelectorAll("[data-field]")).map(field => [
      field.dataset.field,
      String(field.value ?? "").trim()
    ]));
  }

  async function applyMenuChanges({ ruleKey, theme, selector, menu }) {
    const values = getMenuValues(menu);
    if (!validateMenuValues(values)) return;

    const initial = menu._mkInitialValues ?? {};
    const styles = { ...(menu._mkExistingStyles ?? {}) };
    for (const property of STYLE_PROPERTIES) {
      if (values[property] === initial[property]) continue;
      styles[property] = property === "backgroundImage"
        ? buildBackgroundImageValue(values[property], menu._mkInitialBackgroundImageCss)
        : values[property];
    }

    await updateGlobalCss(currentCss => upsertGeneratedRule(currentCss, {
      ruleKey,
      selector: buildScopedSelector(theme, selector),
      styles
    }));
    closeContextMenu();
    ui.notifications?.info(`${STYLE_LABELS[theme]} chat style saved and synchronized to all clients.`);
  }

  function validateMenuValues(values) {
    const validations = [
      ["fontFamily", "font-family", "font family"],
      ["fontSize", "font-size", "font size"],
      ["fontWeight", "font-weight", "font weight"],
      ["color", "color", "text color"],
      ["backgroundColor", "background-color", "background color"],
      ["border", "border", "border"],
      ["borderRadius", "border-radius", "border radius"],
      ["width", "width", "width"],
      ["height", "height", "height"],
      ["padding", "padding", "padding"],
      ["margin", "margin", "margin"],
      ["textAlign", "text-align", "text alignment"]
    ];

    for (const [field, cssProperty, label] of validations) {
      const value = values[field];
      if (!value || !globalThis.CSS?.supports || CSS.supports(cssProperty, value)) continue;
      ui.notifications?.warn(`Invalid ${label}: ${value}`);
      return false;
    }

    const backgroundImage = buildBackgroundImageValue(values.backgroundImage);
    if (backgroundImage && globalThis.CSS?.supports && !CSS.supports("background-image", backgroundImage)) {
      ui.notifications?.warn("Invalid background image path.");
      return false;
    }
    return true;
  }

  async function resetElementRule(ruleKey) {
    await updateGlobalCss(currentCss => removeGeneratedRule(currentCss, ruleKey));
    closeContextMenu();
    ui.notifications?.info("Chat element style reset.");
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

  function buildStableSelector(target, message) {
    if (target === message) return "";

    const parts = [];
    let element = target;
    while (element && element !== message && parts.length < 8) {
      parts.unshift(selectorPart(element));
      element = element.parentElement;
    }
    return parts.join(" > ");
  }

  function selectorPart(element) {
    const tag = element.tagName.toLowerCase();
    for (const attribute of ["data-action", "data-tab", "data-group", "name"]) {
      const value = element.getAttribute(attribute);
      if (value) return `${tag}[${attribute}="${cssAttributeEscape(value)}"]`;
    }

    const classes = Array.from(element.classList)
      .filter(className => !isTransientClass(className))
      .slice(0, 3)
      .map(className => `.${cssEscape(className)}`)
      .join("");
    return classes ? `${tag}${classes}` : tag;
  }

  function isTransientClass(className) {
    return /^(active|hover|selected|focus|expanded|collapsed|disabled|hidden|flex|flexrow|flexcol|grid|plain|themed|theme-|is-|ui-|window-|fa[rsbld]?|mk-style-)/i.test(className);
  }

  function getCurrentTheme() {
    const style = String(getSetting(STYLE_SETTING, DEFAULT_STYLE) ?? DEFAULT_STYLE);
    return STYLE_CLASSES[style] ? style : DEFAULT_STYLE;
  }

  function buildRuleKey(theme, selector) {
    return `${theme}|${selector || ":message"}`;
  }

  function buildScopedSelector(theme, selector) {
    const base = `body.mk-paper-chat.${STYLE_CLASSES[theme]} ${CHAT_LOG_SELECTOR} ${MESSAGE_SELECTOR}`;
    return selector ? `${base} > ${selector}` : base;
  }

  function getGeneratedRuleStyles(cssText, ruleKey) {
    const block = findGeneratedRuleBlock(cssText, ruleKey);
    if (!block) return {};

    const declaration = document.createElement("div").style;
    declaration.cssText = block;
    return Object.fromEntries(STYLE_PROPERTIES.map(property => [
      property,
      declaration.getPropertyValue(toKebabCase(property)).trim()
    ]));
  }

  function upsertGeneratedRule(cssText, { ruleKey, selector, styles }) {
    const withoutExisting = removeGeneratedRule(cssText, ruleKey).trimEnd();
    const declarations = STYLE_PROPERTIES
      .map(property => [toKebabCase(property), styles[property]])
      .filter(([, value]) => String(value ?? "").trim())
      .map(([property, value]) => `  ${property}: ${String(value).trim()} !important;`)
      .join("\n");

    if (!declarations) return withoutExisting ? `${withoutExisting}\n` : "";

    const token = encodeURIComponent(ruleKey);
    const block = `/* ${RULE_MARKER_PREFIX}:start ${token} */\n${selector} {\n${declarations}\n}\n/* ${RULE_MARKER_PREFIX}:end ${token} */`;
    return withoutExisting ? `${withoutExisting}\n\n${block}\n` : `${block}\n`;
  }

  function removeGeneratedRule(cssText, ruleKey) {
    const token = encodeURIComponent(ruleKey);
    const escapedToken = escapeRegExp(token);
    const pattern = new RegExp(
      `\\s*\\/\\* ${RULE_MARKER_PREFIX}:start ${escapedToken} \\*\\/[\\s\\S]*?\\/\\* ${RULE_MARKER_PREFIX}:end ${escapedToken} \\*\\/\\s*`,
      "g"
    );
    return String(cssText ?? "").replace(pattern, "\n").trim();
  }

  function findGeneratedRuleBlock(cssText, ruleKey) {
    const token = encodeURIComponent(ruleKey);
    const escapedToken = escapeRegExp(token);
    const pattern = new RegExp(
      `\\/\\* ${RULE_MARKER_PREFIX}:start ${escapedToken} \\*\\/\\s*[^{}]+\\{([\\s\\S]*?)\\}\\s*\\/\\* ${RULE_MARKER_PREFIX}:end ${escapedToken} \\*\\/`
    );
    return String(cssText ?? "").match(pattern)?.[1] ?? "";
  }

  function toKebabCase(value) {
    return String(value).replace(/[A-Z]/g, character => `-${character.toLowerCase()}`);
  }

  function boxValue(computed, property) {
    const suffixes = ["Top", "Right", "Bottom", "Left"];
    return suffixes.map(suffix => computed[`${property}${suffix}`]).join(" ");
  }

  function textAlignOptions(value) {
    const current = String(value ?? "start");
    const options = ["start", "left", "center", "right", "end", "justify"];
    if (current && !options.includes(current)) options.unshift(current);
    return options.map(option => (
      `<option value="${option}"${current === option ? " selected" : ""}>${option[0].toUpperCase()}${option.slice(1)}</option>`
    )).join("");
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

  function extractBackgroundImageUrl(value) {
    const text = String(value ?? "").trim();
    if (!text || text === "none") return "";
    const matches = [...text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)];
    return matches.at(-1)?.[2] ?? "";
  }

  function buildBackgroundImageValue(path, initialCss = "") {
    if (String(path ?? "").trim().toLowerCase() === "none") return "none";
    const normalized = normalizeImagePath(path);
    if (!normalized) return "";

    const replacement = `url("${cssUrlEscape(normalized)}")`;
    const cssText = String(initialCss ?? "").trim();
    const matches = [...cssText.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)];
    const lastMatch = matches.at(-1);
    if (!lastMatch || lastMatch.index === undefined) return replacement;
    return `${cssText.slice(0, lastMatch.index)}${replacement}${cssText.slice(lastMatch.index + lastMatch[0].length)}`;
  }

  function normalizeImagePath(path) {
    const value = String(path ?? "").trim();
    if (!value || /^(https?:|data:|blob:)/i.test(value) || value.startsWith("/")) return value;

    const clean = value.replace(/\\/g, "/").replace(/^\.\//, "");
    if (/^(modules|systems|worlds|icons|uploads|images)\//i.test(clean)) return toFoundryRoute(clean);
    if (clean.startsWith("assets/")) return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    if (clean.includes("/")) return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    return toFoundryRoute(`modules/${MODULE_ID}/assets/${clean}`);
  }

  function toFoundryRoute(path) {
    const clean = String(path ?? "").replace(/^\/+/, "");
    try {
      if (globalThis.foundry?.utils?.getRoute) return foundry.utils.getRoute(clean);
    } catch (_error) {
      // Use the host-root fallback.
    }
    return `/${clean}`;
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

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
  }

  function cssAttributeEscape(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function cssUrlEscape(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
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
})();
