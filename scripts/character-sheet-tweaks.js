/*
 * MK-Shadowdark - Character Sheet Tweaks
 * Foundry VTT v12
 * Shadowdark system 3.5.x aware
 *
 * Does not replace Shadowdark system templates.
 */

(() => {
  const MODULE_ID = "mk-shadowdark";
  const MODULE_VERSION = "1.0.0";
  const SUBMODULE = "Character Sheet Tweaks";

  const SETTINGS = Object.freeze({
    ENABLED: "characterSheetTweaksEnabled",
    SUMMARY_BAR: "characterSheetTweaksSummaryBar",
    SUMMARY_BAR_IN_HEADER: "characterSheetTweaksSummaryBarInHeader",
    BAR_ELEMENTS: "characterSheetTweaksBarElements",
    QUICK_NOTE: "characterSheetTweaksQuickNote",
    HIGHLIGHT_EQUIPPED: "characterSheetTweaksHighlightEquipped",
    FONT_SCALE: "characterSheetTweaksFontScale",
    BAR_VALUE_FONT_SIZE: "characterSheetTweaksBarValueFontSize",
    BAR_BUTTON_RADIUS: "characterSheetTweaksBarButtonRadius",
    BAR_POSITION_X: "characterSheetTweaksBarPositionX",
    BAR_POSITION_Y: "characterSheetTweaksBarPositionY",
    HIDE_LOGO: "characterSheetTweaksHideLogo",
    HEADER_BG: "characterSheetTweaksHeaderBackgroundImage",
    DEBUG: "characterSheetTweaksDebug"
  });

  const DEFAULT_BAR_ELEMENTS = [
    "LVL", "HP", "AC", "XP", "LUCK", "SLOTS",
    "STR", "DEX", "CON", "INT", "WIS", "CHA"
  ];

  const VALID_BAR_ELEMENTS = new Set([...DEFAULT_BAR_ELEMENTS, "|"]);
  const ABILITY_ELEMENTS = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);

  Hooks.once("init", () => {
    log("initialized");
  });

  Hooks.on("renderActorSheet", (app, html, data) => {
    try {
      onRenderActorSheet(app, html, data);
    } catch (err) {
      console.error(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} | render error`, err);
    }
  });

  function onRenderActorSheet(app, html, data) {
    const root = getRootElement(html);
    if (!root?.querySelector) return;

    if (!isShadowdarkPlayerSheet(app, root)) return;

    const form = getPlayerForm(root);
    const windowEl = getWindowElement(root);

    cleanupSheet(root, windowEl, form);

    if (!getSetting(SETTINGS.ENABLED, true)) return;

    applySheetClasses(windowEl, form);

    if (getSetting(SETTINGS.SUMMARY_BAR, true)) {
      injectSummaryBar(app, form ?? root, data);
    }

    formatWeaponAttackProperties(app, form ?? root);

    if (getSetting(SETTINGS.HIGHLIGHT_EQUIPPED, true)) {
      const highlightRoot = form ?? root;
      refreshItemHighlights(app, highlightRoot);
      attachQuickdrawRefreshWatcher(app, highlightRoot);
      // Quickdraw icons are injected by a separate MK-Shadowdark hook. Run a few
      // delayed passes so the highlight sees the bolt/thunder icon after it appears.
      window.setTimeout(() => refreshItemHighlights(app, highlightRoot), 50);
      window.setTimeout(() => refreshItemHighlights(app, highlightRoot), 250);
    }

    log("applied", app.actor?.name ?? app.object?.name ?? "unknown actor");
  }

  /* -------------------------------------------- */
  /* Sheet Detection                              */
  /* -------------------------------------------- */

  function isShadowdarkPlayerSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor") return false;

    const type = String(actor.type ?? "").toLowerCase();
    const appClasses = Array.from(app?.options?.classes ?? [])
      .join(" ")
      .toLowerCase();

    const looksLikeShadowdark35PlayerSheet = Boolean(
      root.querySelector?.("header.SD-header")
      && root.querySelector?.("nav.SD-nav[data-group='primary'], nav.SD-nav")
      && root.querySelector?.("section.SD-content-body")
    );

    if (!looksLikeShadowdark35PlayerSheet) return false;

    return type === "player" || appClasses.includes("player");
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getPlayerForm(root) {
    if (root.matches?.("form.shadowdark.sheet.player, form")) return root;
    return root.querySelector?.("form.shadowdark.sheet.player, form") ?? root;
  }

  function getWindowElement(root) {
    return root.closest?.(".window-app, .app") ?? root;
  }

  /* -------------------------------------------- */
  /* Classes and CSS Variables                    */
  /* -------------------------------------------- */

  function cleanupSheet(root, windowEl, form) {
    for (const scope of uniqueElements([root, form, windowEl])) {
      scope.querySelectorAll?.(".sdx-character-sheet-bar")?.forEach(el => el.remove());
      scope.querySelectorAll?.(".sdx-equipped-item")?.forEach(el => el.classList.remove("sdx-equipped-item"));
      scope.querySelectorAll?.(".sdx-quickdraw-item")?.forEach(el => el.classList.remove("sdx-quickdraw-item"));
      scope.querySelectorAll?.(".sdx-quickdraw-active")?.forEach(el => el.classList.remove("sdx-quickdraw-active"));
    }

    for (const el of uniqueElements([windowEl, form])) {
      el.classList.remove(
        "sdx-character-sheet-tweaks",
        "sdx-highlight-equipped",
        "sdx-hide-shadowdark-logo",
        "sdx-has-header-background",
        "sdx-summary-bar-in-header"
      );

      el.style.removeProperty("--sdx-sheet-font-scale");
      el.style.removeProperty("--sdx-bar-value-font-size");
      el.style.removeProperty("--sdx-bar-button-radius");
      el.style.removeProperty("--sdx-bar-position-x");
      el.style.removeProperty("--sdx-bar-position-y");
      el.style.removeProperty("--sdx-header-background-image");
    }
  }

  function applySheetClasses(windowEl, form) {
    const highlightEquipped = getSetting(SETTINGS.HIGHLIGHT_EQUIPPED, true);
    const hideLogo = getSetting(SETTINGS.HIDE_LOGO, false);
    const headerBackground = normalizeImagePath(getSetting(SETTINGS.HEADER_BG, ""));
    const fontScale = clampNumber(Number(getSetting(SETTINGS.FONT_SCALE, 100)) || 100, 80, 130);
    const valueFontSize = clampNumber(Number(getSetting(SETTINGS.BAR_VALUE_FONT_SIZE, 11)) || 11, 8, 24);
    const barButtonRadius = clampNumber(Number(getSetting(SETTINGS.BAR_BUTTON_RADIUS, 999)) || 0, 0, 999);
    const barPositionX = clampNumber(Number(getSetting(SETTINGS.BAR_POSITION_X, 0)) || 0, -250, 250);
    const barPositionY = clampNumber(Number(getSetting(SETTINGS.BAR_POSITION_Y, 0)) || 0, -150, 150);
    const summaryBarInHeader = getSetting(SETTINGS.SUMMARY_BAR_IN_HEADER, true);

    for (const el of uniqueElements([windowEl, form])) {
      el.classList.add("sdx-character-sheet-tweaks");
      el.style.setProperty("--sdx-sheet-font-scale", String(fontScale / 100));
      el.style.setProperty("--sdx-bar-value-font-size", `${valueFontSize}px`);
      el.style.setProperty("--sdx-bar-button-radius", `${barButtonRadius}px`);
      el.style.setProperty("--sdx-bar-position-x", `${barPositionX}px`);
      el.style.setProperty("--sdx-bar-position-y", `${barPositionY}px`);

      if (hideLogo) el.classList.add("sdx-hide-shadowdark-logo");
      if (highlightEquipped) el.classList.add("sdx-highlight-equipped");
      if (summaryBarInHeader) el.classList.add("sdx-summary-bar-in-header");

      if (headerBackground) {
        el.classList.add("sdx-has-header-background");
        el.style.setProperty("--sdx-header-background-image", `url("${cssUrlEscape(headerBackground)}")`);
      }
    }
  }

  /* -------------------------------------------- */
  /* Summary Bar                                  */
  /* -------------------------------------------- */

  function injectSummaryBar(app, root, data) {
    const actor = app.actor ?? app.object;
    if (!actor) return;

    const bar = document.createElement("div");
    const fontScale = clampNumber(Number(getSetting(SETTINGS.FONT_SCALE, 100)) || 100, 80, 130);
    const valueFontSize = clampNumber(Number(getSetting(SETTINGS.BAR_VALUE_FONT_SIZE, 11)) || 11, 8, 24);
    const barButtonRadius = clampNumber(Number(getSetting(SETTINGS.BAR_BUTTON_RADIUS, 999)) || 0, 0, 999);
    const barPositionX = clampNumber(Number(getSetting(SETTINGS.BAR_POSITION_X, 0)) || 0, -250, 250);
    const barPositionY = clampNumber(Number(getSetting(SETTINGS.BAR_POSITION_Y, 0)) || 0, -150, 150);

    bar.className = "sdx-character-sheet-bar flex0";
    bar.dataset.actorId = actor.id ?? "";
    bar.style.setProperty("--sdx-sheet-font-scale", String(fontScale / 100));
    bar.style.setProperty("--sdx-bar-value-font-size", `${valueFontSize}px`);
    bar.style.setProperty("--sdx-bar-button-radius", `${barButtonRadius}px`);
    bar.style.setProperty("--sdx-bar-position-x", `${barPositionX}px`);
    bar.style.setProperty("--sdx-bar-position-y", `${barPositionY}px`);

    const chips = buildSummaryChips(actor, data);
    const noteEnabled = getSetting(SETTINGS.QUICK_NOTE, false);
    const note = actor.getFlag(MODULE_ID, "characterSheetQuickNote") ?? "";

    bar.innerHTML = `
      <div class="sdx-character-sheet-bar__main">
        <div class="sdx-character-sheet-bar__chips">
          ${chips.map(renderChip).join("")}
        </div>
      </div>

      ${noteEnabled ? renderQuickNote(note) : ""}
    `;

    insertSummaryBar(root, bar);

    bar.querySelector('[data-sdx-action="quick-note"]')?.addEventListener("change", event => {
      onQuickNoteChange(event, actor);
    });

    bar.querySelectorAll('[data-sdx-action="roll-ability"]').forEach(element => {
      element.addEventListener("click", event => onRollAbilityCheck(event, actor));
    });

    bar.querySelectorAll('[data-sdx-action="toggle-luck"]').forEach(element => {
      element.addEventListener("click", event => onToggleLuck(event, actor));
    });
  }

  function insertSummaryBar(root, bar) {
    const header = root.querySelector?.("header.SD-header");
    const shouldUseHeader = getSetting(SETTINGS.SUMMARY_BAR_IN_HEADER, true);

    if (shouldUseHeader && header) {
      bar.classList.add("sdx-in-header");
      header.append(bar);
      return;
    }

    const nav = root.querySelector?.("nav.SD-nav[data-group='primary'], nav.SD-nav");

    if (nav) {
      nav.before(bar);
      return;
    }

    if (header) {
      header.after(bar);
      return;
    }

    root.prepend(bar);
  }

  function buildSummaryChips(actor, data) {
    const selectedElements = getSelectedBarElements();
    const chips = [];

    for (const element of selectedElements) {
      const chip = buildBarChip(element, actor, data);
      if (!chip) continue;
      chips.push(chip);
    }

    return chips.filter(chip => chip.value !== undefined && chip.value !== null && chip.value !== "");
  }

  function getSelectedBarElements() {
    const raw = String(getSetting(SETTINGS.BAR_ELEMENTS, DEFAULT_BAR_ELEMENTS.join(",")) ?? "").trim();
    if (!raw) return [...DEFAULT_BAR_ELEMENTS];

    const selected = [];
    const seen = new Set();
    const tokens = raw.toUpperCase().match(/LUCK|SLOTS|STR|DEX|CON|INT|WIS|CHA|LVL|HP|AC|XP|\|/g) ?? [];

    for (const key of tokens) {
      if (!VALID_BAR_ELEMENTS.has(key)) continue;

      // Allow multiple dividers, but avoid duplicate data elements.
      if (key !== "|" && seen.has(key)) continue;

      selected.push(key);
      if (key !== "|") seen.add(key);
    }

    return selected.length ? selected : [...DEFAULT_BAR_ELEMENTS];
  }

  function buildBarChip(element, actor, data) {
    switch (element) {
      case "|":
        return { divider: true, value: "divider" };
      case "LVL":
        return { label: "LVL", value: getNumber(actor, "system.level.value") };
      case "HP": {
        const hpValue = getNumber(actor, "system.attributes.hp.value");
        const hpMax = getHpMax(actor);
        return { label: "HP", value: formatPair(hpValue, hpMax) };
      }
      case "AC":
        return { label: "AC", value: getValue(actor, "system.attributes.ac.value") };
      case "XP": {
        const levelValue = getNumber(actor, "system.level.value");
        const xp = getNumber(actor, "system.level.xp");
        const xpNext = Number.isFinite(levelValue) ? levelValue * 10 : null;
        return { label: "XP", value: formatPair(xp, xpNext) };
      }
      case "LUCK": {
        const luck = getLuckState(actor);
        return {
          label: "Luck",
          value: luck.available ? "Ready" : "Spent",
          html: renderLuckIcon(luck.available),
          action: "toggle-luck",
          className: luck.available ? "sdx-luck-chip sdx-luck-ready" : "sdx-luck-chip sdx-luck-spent",
          title: luck.available ? "Luck Ready - click to remove" : "Luck Spent - click to add"
        };
      }
      case "SLOTS":
        return { label: "Slots", value: getSlotsDisplay(data) };
      default:
        if (ABILITY_ELEMENTS.has(element)) {
          const ability = element.toLowerCase();
          const modifier = getAbilityModifier(actor, ability);

          return {
            label: element,
            value: formatModifier(modifier),
            action: "roll-ability",
            ability,
            className: "sdx-stat-chip",
            title: `Roll ${element} check`
          };
        }

        return null;
    }
  }

  function getHpMax(actor) {
    const explicitMax = getNumber(actor, "system.attributes.hp.max");
    if (Number.isFinite(explicitMax) && explicitMax > 0) return explicitMax;

    const base = getNumber(actor, "system.attributes.hp.base");
    const bonus = getNumber(actor, "system.attributes.hp.bonus");

    if (Number.isFinite(base) || Number.isFinite(bonus)) {
      return (Number.isFinite(base) ? base : 0) + (Number.isFinite(bonus) ? bonus : 0);
    }

    return null;
  }

  function getLuckState(actor) {
    const luck = foundry.utils.getProperty(actor, "system.luck") ?? {};
    const remaining = Number(luck.remaining ?? 0);
    const available = Boolean(luck.available);

    if (isPulpMode()) {
      return { available: Number.isFinite(remaining) && remaining > 0, remaining };
    }

    return { available, remaining };
  }

  function isPulpMode() {
    try {
      return Boolean(game.settings.get("shadowdark", "usePulpMode"));
    } catch (_err) {
      return false;
    }
  }

  function getSlotsDisplay(data) {
    const total = normalizeNumber(foundry.utils.getProperty(data, "slots.total"));
    const max = normalizeNumber(foundry.utils.getProperty(data, "gearSlots"));

    if (Number.isFinite(total) && Number.isFinite(max)) return `${total}/${max}`;
    return null;
  }

  function buildAbilityChips(actor) {
    return [...ABILITY_ELEMENTS].map(element => buildBarChip(element, actor, null));
  }

  function getAbilityModifier(actor, ability) {
    try {
      if (typeof actor.abilityModifier === "function") {
        const value = actor.abilityModifier(ability);
        if (Number.isFinite(Number(value))) return Number(value);
      }
    } catch (_err) {
      // Fall back below.
    }

    const directMod = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.mod`));
    if (Number.isFinite(directMod)) return directMod;

    const base = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.base`));
    const bonus = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.bonus`));

    if (Number.isFinite(base) || Number.isFinite(bonus)) {
      return abilityScoreToModifier((Number.isFinite(base) ? base : 10) + (Number.isFinite(bonus) ? bonus : 0));
    }

    return 0;
  }

  function abilityScoreToModifier(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return 0;
    if (value >= 1 && value <= 3) return -4;
    if (value >= 4 && value <= 5) return -3;
    if (value >= 6 && value <= 7) return -2;
    if (value >= 8 && value <= 9) return -1;
    if (value >= 10 && value <= 11) return 0;
    if (value >= 12 && value <= 13) return 1;
    if (value >= 14 && value <= 15) return 2;
    if (value >= 16 && value <= 17) return 3;
    if (value >= 18) return 4;
    return 0;
  }

  function formatModifier(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "+0";
    if (number > 0) return `+${number}`;
    return String(number);
  }

  function renderLuckIcon(available) {
    const icon = available ? "fa-check" : "fa-xmark";
    return `<i class="fa-solid ${icon} sdx-luck-icon" aria-hidden="true"></i>`;
  }

  function renderChip(chip) {
    if (chip.divider) {
      return `<span class="sdx-bar-divider" aria-hidden="true"></span>`;
    }

    const className = ["sdx-sheet-chip", chip.className].filter(Boolean).join(" ");
    const title = chip.title ? ` title="${escapeHtml(chip.title)}"` : "";
    const value = chip.html ?? escapeHtml(chip.value);

    if (chip.action === "roll-ability") {
      return `
        <button
          type="button"
          class="${escapeHtml(className)}"
          data-sdx-action="roll-ability"
          data-sdx-ability="${escapeHtml(chip.ability)}"
          ${title}
        >
          <strong>${escapeHtml(chip.label)}</strong>
          <span>${value}</span>
        </button>
      `;
    }

    if (chip.action === "toggle-luck") {
      return `
        <button
          type="button"
          class="${escapeHtml(className)}"
          data-sdx-action="toggle-luck"
          ${title}
        >
          <strong>${escapeHtml(chip.label)}</strong>
          <span>${value}</span>
        </button>
      `;
    }

    return `
      <span class="${escapeHtml(className)}"${title}>
        <strong>${escapeHtml(chip.label)}</strong>
        <span>${value}</span>
      </span>
    `;
  }

  function renderQuickNote(note) {
    return `
      <div class="sdx-character-sheet-note">
        <label>
          <span>Note</span>
          <input
            type="text"
            value="${escapeHtml(note)}"
            placeholder="Torch bearer, wounds, travel role, reminders..."
            autocomplete="off"
            data-sdx-action="quick-note"
          >
        </label>
      </div>
    `;
  }

  async function onQuickNoteChange(event, actor) {
    event.preventDefault();
    event.stopPropagation();

    const value = String(event.currentTarget?.value ?? "").trim();
    await actor.setFlag(MODULE_ID, "characterSheetQuickNote", value);
  }

  async function onRollAbilityCheck(event, actor) {
    event.preventDefault();
    event.stopPropagation();

    const ability = String(event.currentTarget?.dataset?.sdxAbility ?? "").toLowerCase();
    if (!ability || typeof actor?.rollAbility !== "function") return;

    try {
      await actor.rollAbility(ability, {
        event,
        fastForward: Boolean(event.shiftKey)
      });
    } catch (err) {
      console.error(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} | ability roll error`, err);
      ui.notifications?.error(`MK-Shadowdark | Could not roll ${ability.toUpperCase()} check.`);
    }
  }

  async function onToggleLuck(event, actor) {
    event.preventDefault();
    event.stopPropagation();

    if (!actor?.update) return;

    try {
      const current = getLuckState(actor);
      const pulpMode = isPulpMode();
      const currentlyAvailable = Boolean(current.available);
      const nextAvailable = !currentlyAvailable;
      const currentRemaining = Number.isFinite(Number(current.remaining)) ? Number(current.remaining) : 0;

      let nextRemaining;
      if (pulpMode) {
        nextRemaining = nextAvailable ? Math.max(1, currentRemaining + 1) : Math.max(0, currentRemaining - 1);
      } else {
        nextRemaining = nextAvailable ? 1 : 0;
      }

      await actor.update({
        "system.luck.available": nextAvailable,
        "system.luck.remaining": nextRemaining
      });

      await createLuckChatMessage(actor, nextAvailable, nextRemaining, pulpMode);
    } catch (err) {
      console.error(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} | luck toggle error`, err);
      ui.notifications?.error("MK-Shadowdark | Could not update Luck.");
    }
  }

  async function createLuckChatMessage(actor, gainedLuck, remaining, pulpMode) {
    const actorName = escapeHtml(actor?.name ?? "Character");
    const icon = gainedLuck
      ? '<i class="fa-solid fa-check sdx-luck-chat-icon sdx-luck-chat-gain"></i>'
      : '<i class="fa-solid fa-xmark sdx-luck-chat-icon sdx-luck-chat-remove"></i>';

    const actionText = gainedLuck ? "gained Luck" : "removed Luck";
    const remainingText = pulpMode ? ` <span class="sdx-luck-chat-remaining">Remaining: ${escapeHtml(remaining)}</span>` : "";

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `
        <div class="sdx-luck-chat-message">
          ${icon}
          <strong>${actorName}</strong> ${actionText}.${remainingText}
        </div>
      `
    });
  }

  /* -------------------------------------------- */
  /* Attack Display Formatting                    */
  /* -------------------------------------------- */

  function formatWeaponAttackProperties(app, root) {
    const actor = app.actor ?? app.object;
    if (!actor?.items || !root?.querySelectorAll) return;

    const links = root.querySelectorAll('.tab-abilities .attack a.rollable[data-action="item-attack"][data-item-id]');

    for (const link of links) {
      if (link.classList.contains("sdx-attack-formatted")) continue;

      const itemId = link.dataset.itemId;
      const item = actor.items.get(itemId) ?? actor.items.find?.(i => i.id === itemId);
      if (!item || item.type !== "Weapon") continue;

      Promise.resolve(getWeaponPropertiesText(item)).then(properties => {
        const propertiesText = normalizeInlineText(properties);
        if (!propertiesText) return;
        if (!link.isConnected) return;
        if (link.classList.contains("sdx-attack-formatted")) return;

        const currentText = normalizeInlineText(link.textContent);
        const mainText = stripTrailingProperties(currentText, propertiesText);
        const iconHtml = link.querySelector("i")?.outerHTML ?? '<i class="fa-solid fa-dice-d20"></i>';
        const weaponName = String(item.name ?? "").trim();
        const renderedMain = renderAttackMainLine(mainText, weaponName);

        link.innerHTML = `
          ${iconHtml}
          <span class="sdx-attack-lines">
            <span class="sdx-attack-main-line">${renderedMain}</span>
            <span class="sdx-attack-properties-line">${escapeHtml(propertiesText)}</span>
          </span>
        `;
        link.classList.add("sdx-attack-formatted");
      }).catch(err => {
        console.warn(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} | attack property format error`, err);
      });
    }
  }

  async function getWeaponPropertiesText(item) {
    try {
      if (typeof item.propertiesDisplay === "function") {
        const display = await item.propertiesDisplay();
        const text = htmlToText(display);
        if (text) return text;
      }
    } catch (_err) {
      // Fall back below.
    }

    const properties = foundry.utils.getProperty(item, "system.properties") ?? [];
    if (!Array.isArray(properties) || !properties.length) return "";

    const names = properties
      .map(property => {
        if (typeof property === "string") return property.split(".").pop()?.replace(/[-_]/g, " ") ?? property;
        if (property?.name) return property.name;
        if (property?.label) return property.label;
        return "";
      })
      .filter(Boolean);

    return names.join(", ");
  }

  function renderAttackMainLine(mainText, weaponName) {
    const text = String(mainText ?? "").trim();
    const name = String(weaponName ?? "").trim();

    if (!name || !text.toLowerCase().startsWith(name.toLowerCase())) {
      return escapeHtml(text);
    }

    const rest = text.slice(name.length);
    return `<b>${escapeHtml(name)}</b>${escapeHtml(rest)}`;
  }

  function stripTrailingProperties(text, properties) {
    const main = String(text ?? "").trim();
    const props = String(properties ?? "").trim();
    if (!main || !props) return main;

    if (main.toLowerCase().endsWith(props.toLowerCase())) {
      return main.slice(0, main.length - props.length).replace(/,\s*$/, "").trim();
    }

    return main;
  }

  function htmlToText(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return normalizeInlineText(div.textContent);
  }

  function normalizeInlineText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  /* -------------------------------------------- */
  /* Equipped Highlight                           */
  /* -------------------------------------------- */

  function attachQuickdrawRefreshWatcher(app, root) {
    if (!root?.addEventListener) return;
    if (root.dataset?.sdxQuickdrawRefreshWatcher === "true") return;

    if (root.dataset) root.dataset.sdxQuickdrawRefreshWatcher = "true";

    root.addEventListener("click", event => {
      const target = event.target;
      if (!isQuickdrawClickTarget(target)) return;

      // Let quickdraw-icons.js finish toggling the item flag/icon first,
      // then refresh the row highlight immediately and once more after sheet hooks run.
      window.setTimeout(() => refreshItemHighlights(app, root), 0);
      window.setTimeout(() => refreshItemHighlights(app, root), 75);
      window.setTimeout(() => refreshItemHighlights(app, root), 200);
    }, true);
  }

  function isQuickdrawClickTarget(target) {
    if (!target?.closest) return false;

    return Boolean(target.closest(`
      [class*="quickdraw"],
      [data-action*="quickdraw"],
      [data-sdx-action*="quickdraw"],
      [data-quickdraw],
      i.fa-bolt,
      i.fa-bolt-lightning,
      i.fa-zap,
      [class*="bolt"],
      [class*="thunder"]
    `));
  }

  function refreshItemHighlights(app, root) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll(".sdx-equipped-item").forEach(el => el.classList.remove("sdx-equipped-item"));
    root.querySelectorAll(".sdx-quickdraw-item").forEach(el => el.classList.remove("sdx-quickdraw-item"));
    root.querySelectorAll(".sdx-quickdraw-active").forEach(el => el.classList.remove("sdx-quickdraw-active"));

    highlightEquippedItems(app, root);
  }

  function highlightEquippedItems(app, root) {
    const actor = app.actor ?? app.object;
    if (!actor?.items) return;

    for (const item of actor.items.contents ?? []) {
      const row = findItemRow(root, item.id);
      if (!row) continue;

      const quickdraw = isItemQuickdraw(item) || isRowQuickdraw(row);
      if (!quickdraw) continue;

      // Only Quickdraw items are highlighted. Equipped items are not highlighted
      // unless they are also marked Quickdraw.
      row.classList.remove("sdx-equipped-item");
      row.classList.add("sdx-quickdraw-item");
      row.classList.add("sdx-quickdraw-active");
    }
  }

  function findItemRow(root, itemId) {
    const safeId = cssEscape(itemId);

    return (
      root.querySelector(`li.item[data-item-id="${safeId}"]`) ??
      root.querySelector(`[data-item-id="${safeId}"]`) ??
      root.querySelector(`[data-document-id="${safeId}"]`) ??
      root.querySelector(`[data-id="${safeId}"]`)
    );
  }

  function isItemEquipped(item) {
    const value = foundry.utils.getProperty(item, "system.equipped");
    if (value === true) return true;

    const text = String(value ?? "").toLowerCase();
    return ["true", "equipped", "active", "yes"].includes(text);
  }

  function isItemQuickdraw(item) {
    const values = [
      item?.getFlag?.(MODULE_ID, "quickdraw"),
      item?.getFlag?.(MODULE_ID, "quickdrawEnabled"),
      item?.getFlag?.(MODULE_ID, "isQuickdraw"),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw.value`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw.enabled`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw.active`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw.isActive`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdraw.marked`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.quickdrawEnabled`),
      foundry.utils.getProperty(item, `flags.${MODULE_ID}.isQuickdraw`),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw"),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw.value"),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw.enabled"),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw.active"),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw.isActive"),
      foundry.utils.getProperty(item, "flags.mk-shadowdark.quickdraw.marked")
    ];

    return values.some(isQuickdrawValue);
  }

  function isQuickdrawValue(value) {
    if (value === true) return true;
    if (value === false || value === undefined || value === null || value === "") return false;

    if (typeof value === "number") return value > 0;

    if (typeof value === "object") {
      const possibleKeys = ["value", "enabled", "active", "isActive", "marked", "quickdraw", "isQuickdraw"];
      return possibleKeys.some(key => isQuickdrawValue(value[key]));
    }

    const text = String(value).trim().toLowerCase();
    return ["true", "quickdraw", "active", "enabled", "yes", "on", "1"].includes(text);
  }

  function isRowQuickdraw(row) {
    const candidates = row.querySelectorAll?.(`
      [class*="quickdraw"],
      [data-action*="quickdraw"],
      [data-sdx-action*="quickdraw"],
      [data-quickdraw],
      [aria-pressed],
      i.fa-bolt,
      i.fa-bolt-lightning,
      i.fa-zap,
      [class*="bolt"],
      [class*="thunder"]
    `);

    if (!candidates?.length) return false;

    for (const element of candidates) {
      if (isQuickdrawDomElementActive(element)) return true;
    }

    return false;
  }

  function isQuickdrawDomElementActive(element) {
    const relatedElements = uniqueElements([
      element,
      element.closest?.("button"),
      element.closest?.("a"),
      element.closest?.("span"),
      element.closest?.("div")
    ]);

    for (const candidate of relatedElements) {
      const classText = String(candidate.className ?? "").toLowerCase();
      const title = String(
        candidate.getAttribute?.("title")
        ?? candidate.dataset?.tooltip
        ?? candidate.getAttribute?.("data-tooltip")
        ?? candidate.getAttribute?.("aria-label")
        ?? ""
      ).toLowerCase();
      const pressed = String(candidate.getAttribute?.("aria-pressed") ?? "").toLowerCase();
      const dataQuickdraw = String(candidate.getAttribute?.("data-quickdraw") ?? candidate.dataset?.quickdraw ?? "").toLowerCase();

      if (pressed === "true") return true;
      if (["true", "1", "on", "active", "enabled", "checked"].includes(dataQuickdraw)) return true;

      if (
        classText.includes("active")
        || classText.includes("enabled")
        || classText.includes("checked")
        || classText.includes("selected")
        || classText.includes("is-on")
        || classText.includes("quickdraw-on")
        || classText.includes("sdx-on")
      ) return true;

      if (title.includes("quickdraw") && (title.includes("on") || title.includes("enabled") || title.includes("active") || title.includes("checked"))) return true;
      if (title.includes("quickdraw") && (title.includes("off") || title.includes("disabled") || title.includes("inactive"))) return false;
    }

    // Do not infer Quickdraw state from icon color. Inactive bolts should keep
    // the native/system color, which might be dark depending on the sheet theme.
    return false;
  }

  /* -------------------------------------------- */
  /* Helpers                                      */
  /* -------------------------------------------- */

  function getSetting(key, fallback = undefined) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
  }

  function getValue(document, path) {
    const value = foundry.utils.getProperty(document, path);
    if (value === undefined || value === null || value === "") return null;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    return null;
  }

  function getNumber(document, path) {
    return normalizeNumber(foundry.utils.getProperty(document, path));
  }

  function normalizeNumber(value) {
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatPair(value, max) {
    if (value === undefined || value === null || value === "") return null;
    if (max === undefined || max === null || max === "") return value;
    return `${value}/${max}`;
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function uniqueElements(elements) {
    return [...new Set(elements.filter(Boolean))];
  }

  function normalizeImagePath(path) {
    const value = String(path ?? "").trim();
    if (!value) return "";

    if (/^(https?:|data:|blob:)/i.test(value)) return value;
    if (value.startsWith("/")) return value;

    const clean = value.replace(/\\/g, "/").replace(/^\.\//, "");

    if (/^(modules|systems|worlds|icons|uploads)\//i.test(clean)) {
      return toFoundryRoute(clean);
    }

    if (clean.startsWith("assets/")) {
      return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    }

    if (clean.startsWith("images/")) {
      return toFoundryRoute(`modules/${MODULE_ID}/assets/${clean}`);
    }

    if (clean.includes("/")) {
      return toFoundryRoute(`modules/${MODULE_ID}/${clean}`);
    }

    return toFoundryRoute(`modules/${MODULE_ID}/assets/${clean}`);
  }

  function toFoundryRoute(path) {
    const clean = String(path ?? "").replace(/^\/+/, "");

    try {
      if (foundry.utils.getRoute) return foundry.utils.getRoute(clean);
    } catch (_err) {
      // Fall back below.
    }

    return `/${clean}`;
  }

  function cssUrlEscape(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "");
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function log(...args) {
    if (!getSetting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${MODULE_VERSION} | ${SUBMODULE} |`, ...args);
  }
})();
