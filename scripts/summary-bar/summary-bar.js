import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import { reportLuckChange } from "../chat-reporting/chat-reporting.js";
import { getRestMode, onRest } from "../libs/resting.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Summary Bar";
  const STYLESHEET_ID = "mk-shadowdark-summary-bar-styles";
  const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/summary-bar.css`;

  const SETTINGS = Object.freeze({
    ENABLED: "characterSheetTweaksSummaryBar",
    SHORTCUT_ROW: "characterSheetTweaksSummaryBarShortcutRow",
    SHORTCUT_COUNT: "characterSheetTweaksSummaryBarShortcutCount",
    ELEMENTS: "characterSheetTweaksBarElements",
    FONT_SCALE: "characterSheetTweaksFontScale",
    VALUE_FONT_SIZE: "characterSheetTweaksBarValueFontSize",
    BUTTON_RADIUS: "characterSheetTweaksBarButtonRadius",
    BUTTON_SCALE: "characterSheetTweaksBarButtonScale",
    POSITION_X: "characterSheetTweaksBarPositionX",
    POSITION_Y: "characterSheetTweaksBarPositionY",
    DEBUG: "summaryBarDebug"
  });

  const DEFAULT_ELEMENTS = ["HP", "DT", "LUCK", "REST", "|", "STR", "DEX", "CON", "INT", "WIS", "CHA", "SLOTS"];
  const SHORTCUT_FLAG = "summaryBarShortcuts";
  const VALID_ELEMENTS = new Set(["LVL", "HP", "AC", "XP", "LUCK", "REST", "DT", "SLOTS", "STR", "DEX", "CON", "INT", "WIS", "CHA", "|"]);
  const ABILITY_ELEMENTS = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  ensureStylesheet();

  Hooks.once("init", () => log("initialized"));

  onCharacterSheetRender("Summary Bar", onRenderActorSheet, { priority: 20 });

  function ensureStylesheet() {
    if (document.getElementById(STYLESHEET_ID)) return;

    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => link.href.includes(`/modules/${MODULE_ID}/styles/summary-bar.css`));
    if (existing) {
      existing.id = STYLESHEET_ID;
      return;
    }

    const link = document.createElement("link");
    link.id = STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = toFoundryRoute(STYLESHEET_PATH);
    document.head.append(link);
  }

  function onRenderActorSheet(app, html, data) {
    const root = getRootElement(html);
    if (!root?.querySelector || !isShadowdarkPlayerSheet(app, root)) return;

    const form = getSheetForm(root);
    const windowEl = getWindowElement(app, root);
    cleanupSummaryBar(root, form, windowEl);

    if (!getSetting(SETTINGS.ENABLED, true)) return;

    applySummaryBarScope(form, windowEl);
    injectSummaryBar(app, form ?? root, data);
    log("applied", app.actor?.name ?? app.object?.name ?? "unknown actor");
  }

  function isShadowdarkPlayerSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;

    const actor = app?.actor ?? app?.object;
    if (!actor || actor.documentName !== "Actor" || isGroupActor(actor)) return false;

    const type = String(actor.type ?? "").toLowerCase();
    const appClasses = Array.from(app?.options?.classes ?? []).join(" ").toLowerCase();
    const isPlayer = type === "player" || appClasses.includes("player");
    if (!isPlayer) return false;

    return Boolean(
      root.matches?.(".shadowdark.sheet")
      || root.querySelector?.(".shadowdark.sheet")
      || root.querySelector?.("header.SD-header")
    );
  }

  function isGroupActor(actor) {
    try {
      if (actor.getFlag?.(MODULE_ID, "isGroup")) return true;
    } catch (_err) {
      // Inactive legacy flag scopes can throw when read through getFlag.
    }

    return Boolean(actor?._source?.flags?.[MODULE_ID]?.isGroup);
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetForm(root) {
    if (root.matches?.("form.shadowdark.sheet.player, form")) return root;
    return root.querySelector?.("form.shadowdark.sheet.player, form") ?? root;
  }

  function getWindowElement(app, root) {
    const appElement = getRootElement(app?.element);
    if (appElement?.querySelector?.(".window-header")) return appElement;
    return root.closest?.(".window-app, .application, .app") ?? root;
  }

  function cleanupSummaryBar(root, form, windowEl) {
    for (const scope of uniqueElements([root, form, windowEl])) {
      scope.querySelectorAll?.(".mk-character-sheet-bar")?.forEach(element => element.remove());
    }

    for (const element of uniqueElements([form, windowEl])) {
      element.classList.remove("mk-summary-bar-in-header");
      element.classList.remove("mk-summary-bar-has-shortcuts");
      element.style.removeProperty("--mk-sheet-font-scale");
      element.style.removeProperty("--mk-bar-value-font-size");
      element.style.removeProperty("--mk-bar-button-radius");
      element.style.removeProperty("--mk-bar-button-scale");
      element.style.removeProperty("--mk-bar-position-x");
      element.style.removeProperty("--mk-bar-position-y");
      element.style.removeProperty("--mk-bar-shortcut-count");
    }
  }

  function applySummaryBarScope(form, windowEl) {
    const hasShortcuts = Boolean(getSetting(SETTINGS.SHORTCUT_ROW, false));
    for (const element of uniqueElements([form, windowEl])) {
      element.classList.add("mk-summary-bar-in-header");
      element.classList.toggle("mk-summary-bar-has-shortcuts", hasShortcuts);
      applySummaryBarVariables(element);
    }
  }

  function applySummaryBarVariables(element) {
    const fontScale = clampNumber(Number(getSetting(SETTINGS.FONT_SCALE, 120)) || 120, 80, 130);
    const valueFontSize = clampNumber(Number(getSetting(SETTINGS.VALUE_FONT_SIZE, 13)) || 13, 8, 24);
    const buttonRadius = clampNumber(Number(getSetting(SETTINGS.BUTTON_RADIUS, 8)) || 0, 0, 999);
    const buttonScale = clampNumber(Number(getSetting(SETTINGS.BUTTON_SCALE, 100)) || 100, 70, 140);
    const positionX = clampNumber(Number(getSetting(SETTINGS.POSITION_X, 20)) || 0, -250, 250);
    const positionY = clampNumber(Number(getSetting(SETTINGS.POSITION_Y, 8)) || 0, -150, 150);
    const shortcutCount = getShortcutSlotCount();

    element.style.setProperty("--mk-sheet-font-scale", String(fontScale / 100));
    element.style.setProperty("--mk-bar-value-font-size", `${valueFontSize}px`);
    element.style.setProperty("--mk-bar-button-radius", `${buttonRadius}px`);
    element.style.setProperty("--mk-bar-button-scale", String(buttonScale / 100));
    element.style.setProperty("--mk-bar-position-x", `${positionX}px`);
    element.style.setProperty("--mk-bar-position-y", `${positionY}px`);
    element.style.setProperty("--mk-bar-shortcut-count", String(shortcutCount));
  }

  function injectSummaryBar(app, root, data) {
    const actor = app.actor ?? app.object;
    if (!actor) return null;

    const bar = document.createElement("div");
    bar.className = "mk-character-sheet-bar flex0";
    bar.dataset.actorId = actor.id ?? "";
    applySummaryBarVariables(bar);
    bar.innerHTML = `
      <div class="mk-character-sheet-bar__main">
        <div class="mk-character-sheet-bar__chips">
          ${buildSummaryChips(actor, data).map(renderChip).join("")}
        </div>
      </div>
      ${getSetting(SETTINGS.SHORTCUT_ROW, false) ? renderShortcutRow(actor) : ""}
    `;

    insertSummaryBar(root, bar);
    bindShortcutDragSources(root, actor);

    bar.querySelectorAll('[data-mk-action="roll-ability"]').forEach(element => {
      element.addEventListener("click", event => onRollAbilityCheck(event, actor));
    });
    bar.querySelectorAll('[data-mk-action="toggle-luck"]').forEach(element => {
      element.addEventListener("click", event => onToggleLuck(event, actor));
    });
    bar.querySelectorAll('[data-mk-action="death-timer"]').forEach(element => {
      element.addEventListener("click", event => onDeathTimer(event, actor));
    });
    bar.querySelectorAll('[data-mk-action="rest"]').forEach(element => {
      element.addEventListener("click", event => onRest(event, actor));
    });
    bindShortcutListeners(app, bar, actor);
    return bar;
  }

  function bindShortcutDragSources(root, actor) {
    if (!getSetting(SETTINGS.SHORTCUT_ROW, false)) return;

    const bindRows = (selector, acceptsItem) => {
      root.querySelectorAll?.(selector).forEach(row => {
        if (row.dataset.mkShortcutDragSource === "true") return;

        const item = actor.items?.get(row.dataset.itemId);
        if (!item || !acceptsItem(item)) return;

        row.draggable = true;
        row.dataset.mkShortcutDragSource = "true";
        row.addEventListener("dragstart", event => {
          if (!event.dataTransfer) return;

          event.dataTransfer.effectAllowed = "copy";
          event.dataTransfer.setData("text/plain", JSON.stringify({
            type: "Item",
            uuid: item.uuid,
          }));
        });
      });
    };

    bindRows(".tab-spells .item[data-item-id]", item =>
      String(item.type ?? "").toLowerCase() === "spell"
    );
    bindRows(".tab-abilities .SD-list .item[data-item-id]", item => {
      const type = String(item.type ?? "").toLowerCase();
      return Boolean(item.system?.isAbility)
        || type === "class ability"
        || type === "ability";
    });
  }

  function renderShortcutRow(actor) {
    const slots = getShortcutSlots(actor);
    return `
      <div class="mk-character-sheet-bar__shortcuts" aria-label="Character shortcuts">
        ${slots.map((itemId, index) => renderShortcutSlot(actor, itemId, index)).join("")}
      </div>
    `;
  }

  function renderShortcutSlot(actor, itemId, index) {
    const item = itemId ? actor.items?.get(itemId) : null;
    const slot = String(index + 1);
    if (!item) {
      return `
        <button type="button" class="mk-summary-shortcut is-empty" data-mk-shortcut-slot="${index}" title="Shortcut ${slot}: drag an ability, attack, spell, or potion here" aria-label="Shortcut ${slot}: drag an ability, attack, spell, or potion here">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      `;
    }

    const isLostSpell = String(item.type ?? "").toLowerCase() === "spell" && item.system?.lost === true;
    return `
      <button type="button" class="mk-summary-shortcut${isLostSpell ? " is-lost-spell" : ""}" data-mk-shortcut-slot="${index}" data-mk-shortcut-item-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}${isLostSpell ? " — lost" : ""} — click to use; right-click to clear" aria-label="${escapeHtml(item.name)}">
        <img src="${escapeHtml(item.img ?? "icons/svg/item-bag.svg")}" alt="">
      </button>
    `;
  }

  function getShortcutSlots(actor) {
    let stored = [];
    try {
      stored = actor?.getFlag?.(MODULE_ID, SHORTCUT_FLAG) ?? [];
    } catch (_error) {
      stored = actor?.flags?.[MODULE_ID]?.[SHORTCUT_FLAG] ?? [];
    }

    return Array.from({ length: getShortcutSlotCount() }, (_unused, index) => {
      const itemId = Array.isArray(stored) ? stored[index] : "";
      return typeof itemId === "string" ? itemId : "";
    });
  }

  async function setShortcutSlot(actor, index, itemId = "") {
    if (!actor?.setFlag || !Number.isInteger(index) || index < 0 || index >= getShortcutSlotCount()) return;
    if (!actor.isOwner && !game.user?.isGM) {
      ui.notifications?.warn("MK-Shadowdark | You do not have permission to update these shortcuts.");
      return;
    }

    const slots = getShortcutSlots(actor);
    slots[index] = String(itemId ?? "");
    await actor.setFlag(MODULE_ID, SHORTCUT_FLAG, slots);
  }

  function getShortcutSlotCount() {
    const value = Number(getSetting(SETTINGS.SHORTCUT_COUNT, 10));
    return Math.round(clampNumber(Number.isFinite(value) ? value : 10, 1, 16));
  }

  function bindShortcutListeners(app, bar, actor) {
    bar.querySelectorAll("[data-mk-shortcut-slot]").forEach(slot => {
      slot.addEventListener("click", event => void onShortcutClick(event, app, actor));
      slot.addEventListener("contextmenu", event => void onShortcutClear(event, app, actor));
      slot.addEventListener("dragover", event => {
        event.preventDefault();
        slot.classList.add("is-drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-drag-over"));
      slot.addEventListener("drop", event => void onShortcutDrop(event, app, actor));
    });
  }

  async function onShortcutDrop(event, app, actor) {
    event.preventDefault();
    event.stopPropagation();

    const slot = event.currentTarget;
    slot.classList.remove("is-drag-over");
    const index = Number(slot.dataset.mkShortcutSlot);
    const item = await getDroppedActorItem(event, actor);
    if (!item) return;

    if (!isShortcutItem(item)) {
      ui.notifications?.warn("MK-Shadowdark | Only abilities, attacks, spells, and potions can be added as Summary Bar shortcuts.");
      return;
    }

    try {
      await setShortcutSlot(actor, index, item.id);
      app.render(false);
    } catch (error) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | shortcut drop error`, error);
      ui.notifications?.error("MK-Shadowdark | Could not save the shortcut.");
    }
  }

  async function getDroppedActorItem(event, actor) {
    const nativeEvent = event.originalEvent ?? event;
    let data = null;
    try {
      const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
      data = textEditor?.getDragEventData?.(nativeEvent) ?? null;
    } catch (_error) {
      // Fall through to standard drag payload formats.
    }

    if (!data) {
      for (const type of ["application/json", "text/plain"]) {
        const raw = nativeEvent.dataTransfer?.getData?.(type);
        if (!raw) continue;
        try {
          data = JSON.parse(raw);
          break;
        } catch (_error) {
          // Try the next payload type.
        }
      }
    }

    const itemId = data?.id ?? data?._id ?? data?.itemId ?? data?.data?._id ?? data?.data?.id;
    if (itemId && actor.items?.get(itemId)) return actor.items.get(itemId);

    const uuid = data?.uuid ?? data?.itemUuid ?? data?.data?.uuid;
    if (!uuid || typeof globalThis.fromUuid !== "function") return null;

    try {
      const item = await globalThis.fromUuid(uuid);
      return item?.parent?.id === actor.id ? item : null;
    } catch (_error) {
      return null;
    }
  }

  function isShortcutItem(item) {
    const type = String(item?.type ?? "").toLowerCase();
    return Boolean(item?.system?.isAbility || item?.system?.isWeapon || item?.system?.isSpell)
      || ["weapon", "class ability", "ability", "spell", "potion"].includes(type);
  }

  async function castShortcutSpell(actor, item, fastForward = false) {
    if (typeof actor.system?.castSpell === "function") {
      await actor.system.castSpell(item.uuid, { skipPrompt: fastForward });
      return true;
    }

    return false;
  }

  async function useShortcutAbility(actor, item, fastForward = false) {
    if (typeof actor.system?.useAbility === "function") {
      await actor.system.useAbility(item.uuid, { skipPrompt: fastForward });
      return true;
    }

    return false;
  }

  async function onShortcutClick(event, app, actor) {
    event.preventDefault();
    event.stopPropagation();

    const itemId = event.currentTarget?.dataset?.mkShortcutItemId;
    if (!itemId) return;
    const item = actor.items?.get(itemId);
    if (!item) return;

    try {
      const options = { skipPrompt: Boolean(event.shiftKey) };
      if (
        (item.system?.isSpell || String(item.type).toLowerCase() === "spell") &&
        await castShortcutSpell(actor, item, Boolean(event.shiftKey))
      ) {
        return;
      }
      if (
        (item.system?.isAbility || String(item.type).toLowerCase() === "class ability") &&
        await useShortcutAbility(actor, item, Boolean(event.shiftKey))
      ) {
        return;
      }
      if ((item.system?.isWeapon || String(item.type).toLowerCase() === "weapon") && typeof actor.system?.rollAttack === "function") {
        await actor.system.rollAttack(item.uuid, options);
        return;
      }
      if (String(item.type).toLowerCase() === "potion" && typeof actor.system?.usePotion === "function") {
        await actor.system.usePotion(item.id);
        return;
      }

      const root = getRootElement(app?.element);
      const rollControl = Array.from(root?.querySelectorAll?.("[data-action='item-attack'][data-item-id]") ?? [])
        .find(control => control.dataset.itemId === item.id);
      if (rollControl) {
        rollControl.click();
        return;
      }

      ui.notifications?.warn(`MK-Shadowdark | ${item.name} cannot be used from a Summary Bar shortcut.`);
    } catch (error) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | shortcut use error`, error);
      ui.notifications?.error(`MK-Shadowdark | Could not use ${item.name}.`);
    }
  }

  async function onShortcutClear(event, app, actor) {
    event.preventDefault();
    event.stopPropagation();

    if (!event.currentTarget?.dataset?.mkShortcutItemId) return;
    try {
      await setShortcutSlot(actor, Number(event.currentTarget.dataset.mkShortcutSlot), "");
      app.render(false);
    } catch (error) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | shortcut clear error`, error);
      ui.notifications?.error("MK-Shadowdark | Could not clear the shortcut.");
    }
  }

  function insertSummaryBar(root, bar) {
    const header = root.querySelector?.("header.SD-header");
    if (header) {
      bar.classList.add("mk-in-header");
      header.append(bar);
      return;
    }

    const nav = root.querySelector?.("nav.SD-nav[data-group='primary'], nav.SD-nav");
    if (nav) nav.before(bar);
    else root.prepend(bar);
  }

  function buildSummaryChips(actor, data) {
    const elements = getSelectedElements();
    if (isAtZeroHp(actor) && !elements.includes("DT")) {
      const hpIndex = elements.indexOf("HP");
      elements.splice(hpIndex >= 0 ? hpIndex + 1 : 0, 0, "DT");
    }

    return elements
      .map(element => buildBarChip(element, actor, data))
      .filter(Boolean)
      .map(chip => chip.divider ? chip : { ...chip, value: chip.value ?? "-" });
  }

  function getSelectedElements() {
    const raw = String(getSetting(SETTINGS.ELEMENTS, DEFAULT_ELEMENTS.join(",")) ?? "").trim();
    if (!raw) return [...DEFAULT_ELEMENTS];

    const selected = [];
    const seen = new Set();
    const tokens = raw.toUpperCase().match(/LUCK|REST|SLOTS|STR|DEX|CON|INT|WIS|CHA|LVL|HP|DT|AC|XP|\|/g) ?? [];

    for (const key of tokens) {
      if (!VALID_ELEMENTS.has(key) || (key !== "|" && seen.has(key))) continue;
      selected.push(key);
      if (key !== "|") seen.add(key);
    }

    return selected.length ? selected : [...DEFAULT_ELEMENTS];
  }

  function buildBarChip(element, actor, data) {
    switch (element) {
      case "|":
        return { divider: true, value: "divider" };
      case "LVL":
        return { label: "LVL", value: getNumber(actor, "system.level.value") };
      case "HP": {
        if (isAtZeroHp(actor) && getSetting("deathTimerEnabled", true)) return null;
        return { label: "HP", value: formatPair(getNumber(actor, "system.attributes.hp.value"), getHpMax(actor)) };
      }
      case "DT": {
        if (!isAtZeroHp(actor) || !getSetting("deathTimerEnabled", true)) return null;
        const timer = globalThis.MKShadowdarkDeathTimer;
        const state = timer?.getState?.(actor) ?? { dead: false, turns: timer?.getTurns?.(actor) };
        const turns = state.turns;
        const hasTurns = turns !== null && turns !== undefined && turns !== "" && Number.isFinite(Number(turns));
        const display = state.dead ? "Dead" : (hasTurns ? String(turns) : "-");
        const icon = escapeHtml(getSetting("deathTimerIcon", "fa-solid fa-skull") || "fa-solid fa-skull");
        const tooltip = getSetting("deathTimerTooltip", "Death Timer") || "Death Timer";
        return {
          label: "DT",
          value: hasTurns ? String(turns) : "-",
          html: `<i class="${icon} mk-death-timer-icon" aria-hidden="true"></i><em>${display}</em>`,
          action: state.dead ? null : "death-timer",
          className: "mk-death-timer-chip",
          title: state.dead ? "Dead" : (hasTurns ? `${tooltip}: ${turns} turn(s) remaining` : tooltip)
        };
      }
      case "AC":
        return { label: "AC", value: getValue(actor, "system.attributes.ac.value") };
      case "XP": {
        const level = getNumber(actor, "system.level.value");
        return { label: "XP", value: formatPair(getNumber(actor, "system.level.xp"), Number.isFinite(level) ? level * 10 : null) };
      }
      case "LUCK": {
        const luck = getLuckState(actor);
        return {
          label: "Luck",
          value: luck.available ? "Ready" : "Spent",
          html: renderLuckIcon(luck.available),
          action: "toggle-luck",
          className: luck.available ? "mk-luck-chip mk-luck-ready" : "mk-luck-chip mk-luck-spent",
          title: luck.available ? "Luck Ready - click to remove" : "Luck Spent - click to add"
        };
      }
      case "SLOTS":
        return { label: "Slots", value: getSlotsDisplay(data) };
      case "REST": {
        const mode = getRestMode();
        const grinder = mode === "grinder";
        return {
          label: "Rest",
          value: grinder ? "Grinder" : "Normal",
          html: `<i class="fa-solid ${grinder ? "fa-dice" : "fa-bed"} mk-rest-icon" aria-hidden="true"></i>`,
          action: "rest",
          className: `mk-rest-chip mk-rest-${mode}`,
          title: grinder
            ? "Rest (Grinder): recover abilities, 1d4 lost spells, and one hit die of HP"
            : "Rest (Normal): fully recover HP, abilities, and spells"
        };
      }
      default: {
        if (!ABILITY_ELEMENTS.has(element)) return null;
        return {
          label: element,
          value: formatModifier(getAbilityModifier(actor, element.toLowerCase())),
          action: "roll-ability",
          ability: element.toLowerCase(),
          className: "mk-stat-chip",
          title: `Roll ${element} check`
        };
      }
    }
  }

  function getHpMax(actor) {
    const explicitMax = getNumber(actor, "system.attributes.hp.max");
    if (Number.isFinite(explicitMax) && explicitMax > 0) return explicitMax;

    const base = getNumber(actor, "system.attributes.hp.base");
    const bonus = getNumber(actor, "system.attributes.hp.bonus");
    if (!Number.isFinite(base) && !Number.isFinite(bonus)) return null;
    return (Number.isFinite(base) ? base : 0) + (Number.isFinite(bonus) ? bonus : 0);
  }

  function isAtZeroHp(actor) {
    const paths = [
      "system.attributes.hp.value",
      "system.attributes.hp.current",
      "system.hp.value",
      "system.hp.current",
      "system.hp"
    ];
    const hp = paths.map(path => getNumber(actor, path)).find(Number.isFinite);
    return Number.isFinite(hp) && hp <= 0;
  }

  function getLuckState(actor) {
    const luck = foundry.utils.getProperty(actor, "system.luck") ?? {};
    const remaining = Number(luck.remaining ?? 0);
    if (isPulpMode()) return { available: Number.isFinite(remaining) && remaining > 0, remaining };
    return { available: Boolean(luck.available), remaining };
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
    return Number.isFinite(total) && Number.isFinite(max) ? `${total}/${max}` : null;
  }

  function getAbilityModifier(actor, ability) {
    try {
      if (typeof actor.abilityModifier === "function") {
        const value = actor.abilityModifier(ability);
        if (Number.isFinite(Number(value))) return Number(value);
      }
    } catch (_err) {
      // Fall through to stored values.
    }

    const directModifier = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.mod`));
    if (Number.isFinite(directModifier)) return directModifier;

    const base = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.base`));
    const bonus = normalizeNumber(foundry.utils.getProperty(actor, `system.abilities.${ability}.bonus`));
    if (!Number.isFinite(base) && !Number.isFinite(bonus)) return 0;
    return abilityScoreToModifier((Number.isFinite(base) ? base : 10) + (Number.isFinite(bonus) ? bonus : 0));
  }

  function abilityScoreToModifier(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) return 0;
    if (value <= 3) return -4;
    if (value <= 5) return -3;
    if (value <= 7) return -2;
    if (value <= 9) return -1;
    if (value <= 11) return 0;
    if (value <= 13) return 1;
    if (value <= 15) return 2;
    if (value <= 17) return 3;
    return 4;
  }

  function formatModifier(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "+0";
    return number > 0 ? `+${number}` : String(number);
  }

  function renderLuckIcon(available) {
    return `<i class="fa-solid ${available ? "fa-check" : "fa-xmark"} mk-luck-icon" aria-hidden="true"></i>`;
  }

  function renderChip(chip) {
    if (chip.divider) return '<span class="mk-bar-divider" aria-hidden="true"></span>';

    const className = ["mk-sheet-chip", chip.className].filter(Boolean).join(" ");
    const title = chip.title ? ` title="${escapeHtml(chip.title)}"` : "";
    const value = chip.html ?? escapeHtml(chip.value);

    if (chip.action) {
      const ability = chip.ability ? ` data-mk-ability="${escapeHtml(chip.ability)}"` : "";
      return `
        <button type="button" class="${escapeHtml(className)}" data-mk-action="${escapeHtml(chip.action)}"${ability}${title}>
          <strong>${escapeHtml(chip.label)}</strong><span>${value}</span>
        </button>
      `;
    }

    return `<span class="${escapeHtml(className)}"${title}><strong>${escapeHtml(chip.label)}</strong><span>${value}</span></span>`;
  }

  async function onRollAbilityCheck(event, actor) {
    event.preventDefault();
    event.stopPropagation();

    const ability = String(event.currentTarget?.dataset?.mkAbility ?? "").toLowerCase();
    if (!ability || !actor) return;

    try {
      const nativeRoll = await rollNativeAbilityCheck(actor, ability, {
        event,
        fastForward: Boolean(event.shiftKey)
      });
      if (!nativeRoll.called) ui.notifications?.warn("MK-Shadowdark | This actor cannot roll ability checks from the Summary Bar.");
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | ability roll error`, err);
      ui.notifications?.error(`MK-Shadowdark | Could not roll ${ability.toUpperCase()} check.`);
    }
  }

  async function rollNativeAbilityCheck(actor, ability, options = {}) {
    const fastForward = Boolean(options.fastForward);
    if (typeof actor?.system?.rollStatCheck === "function") {
      return { called: true, result: await actor.system.rollStatCheck(ability, { skipPrompt: fastForward }) };
    }

    const rollOptions = {
      ...options,
      fastForward,
      skipPrompt: fastForward,
      skipDialog: fastForward,
      dialog: !fastForward,
      configureDialog: !fastForward
    };

    for (const methodName of ["rollAbilityCheck", "rollAbilityTest", "rollAbility"]) {
      const method = actor?.[methodName];
      if (typeof method === "function") return { called: true, result: await method.call(actor, ability, rollOptions) };
    }
    return { called: false, result: undefined };
  }

  async function onToggleLuck(event, actor) {
    event.preventDefault();
    event.stopPropagation();
    if (!actor?.update) return;

    try {
      const current = getLuckState(actor);
      const pulpMode = isPulpMode();
      const nextAvailable = !current.available;
      const currentRemaining = Number.isFinite(Number(current.remaining)) ? Number(current.remaining) : 0;
      const nextRemaining = pulpMode
        ? (nextAvailable ? Math.max(1, currentRemaining + 1) : Math.max(0, currentRemaining - 1))
        : (nextAvailable ? 1 : 0);

      await actor.update({
        "system.luck.available": nextAvailable,
        "system.luck.remaining": nextRemaining
      });
      await reportLuckChange(actor, nextAvailable, nextRemaining, pulpMode);
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | luck toggle error`, err);
      ui.notifications?.error("MK-Shadowdark | Could not update Luck.");
    }
  }

  async function onDeathTimer(event, actor) {
    event.preventDefault();
    event.stopPropagation();

    const activate = globalThis.MKShadowdarkDeathTimer?.activate;
    if (typeof activate !== "function") {
      ui.notifications?.warn("MK-Shadowdark | Death Timer is unavailable.");
      return;
    }

    try {
      await activate(actor);
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | death timer error`, err);
      ui.notifications?.error("MK-Shadowdark | Could not update the Death Timer.");
    }
  }

  function getSetting(key, fallback = undefined) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
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

  function getValue(document, path) {
    const value = foundry.utils.getProperty(document, path);
    if (value === undefined || value === null || value === "") return null;
    return ["string", "number", "boolean"].includes(typeof value) ? value : null;
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

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function log(...args) {
    if (!getSetting(SETTINGS.DEBUG, false)) return;
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }
})();
