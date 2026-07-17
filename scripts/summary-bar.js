import { reportLuckChange } from "./chat-reporting.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Summary Bar";
  const STYLESHEET_ID = "mk-shadowdark-summary-bar-styles";
  const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/summary-bar.css`;

  const SETTINGS = Object.freeze({
    ENABLED: "characterSheetTweaksSummaryBar",
    ELEMENTS: "characterSheetTweaksBarElements",
    FONT_SCALE: "characterSheetTweaksFontScale",
    VALUE_FONT_SIZE: "characterSheetTweaksBarValueFontSize",
    BUTTON_RADIUS: "characterSheetTweaksBarButtonRadius",
    BUTTON_SCALE: "characterSheetTweaksBarButtonScale",
    POSITION_X: "characterSheetTweaksBarPositionX",
    POSITION_Y: "characterSheetTweaksBarPositionY",
    DEBUG: "summaryBarDebug"
  });

  const DEFAULT_ELEMENTS = ["HP", "DT", "LUCK", "|", "STR", "DEX", "CON", "INT", "WIS", "CHA", "SLOTS"];
  const VALID_ELEMENTS = new Set(["LVL", "HP", "AC", "XP", "LUCK", "DT", "SLOTS", "STR", "DEX", "CON", "INT", "WIS", "CHA", "|"]);
  const ABILITY_ELEMENTS = new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  const ACTOR_SHEET_RENDER_HOOKS = [
    "renderActorSheet",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  ensureStylesheet();

  Hooks.once("init", () => log("initialized"));

  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html, data) => {
      try {
        onRenderActorSheet(app, html, data);
      } catch (err) {
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, err);
      }
    });
  }

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
    const windowEl = getWindowElement(root);
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
      // Foundry v12 may throw on inactive legacy flag scopes.
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

  function getWindowElement(root) {
    return root.closest?.(".window-app, .app") ?? root;
  }

  function cleanupSummaryBar(root, form, windowEl) {
    for (const scope of uniqueElements([root, form, windowEl])) {
      scope.querySelectorAll?.(".mk-character-sheet-bar")?.forEach(element => element.remove());
    }

    for (const element of uniqueElements([form, windowEl])) {
      element.classList.remove("mk-summary-bar-in-header");
      element.style.removeProperty("--mk-sheet-font-scale");
      element.style.removeProperty("--mk-bar-value-font-size");
      element.style.removeProperty("--mk-bar-button-radius");
      element.style.removeProperty("--mk-bar-button-scale");
      element.style.removeProperty("--mk-bar-position-x");
      element.style.removeProperty("--mk-bar-position-y");
    }
  }

  function applySummaryBarScope(form, windowEl) {
    for (const element of uniqueElements([form, windowEl])) {
      element.classList.add("mk-summary-bar-in-header");
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

    element.style.setProperty("--mk-sheet-font-scale", String(fontScale / 100));
    element.style.setProperty("--mk-bar-value-font-size", `${valueFontSize}px`);
    element.style.setProperty("--mk-bar-button-radius", `${buttonRadius}px`);
    element.style.setProperty("--mk-bar-button-scale", String(buttonScale / 100));
    element.style.setProperty("--mk-bar-position-x", `${positionX}px`);
    element.style.setProperty("--mk-bar-position-y", `${positionY}px`);
  }

  function injectSummaryBar(app, root, data) {
    const actor = app.actor ?? app.object;
    if (!actor) return;

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
    `;

    insertSummaryBar(root, bar);

    bar.querySelectorAll('[data-mk-action="roll-ability"]').forEach(element => {
      element.addEventListener("click", event => onRollAbilityCheck(event, actor));
    });
    bar.querySelectorAll('[data-mk-action="toggle-luck"]').forEach(element => {
      element.addEventListener("click", event => onToggleLuck(event, actor));
    });
    bar.querySelectorAll('[data-mk-action="death-timer"]').forEach(element => {
      element.addEventListener("click", event => onDeathTimer(event, actor));
    });
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
    const tokens = raw.toUpperCase().match(/LUCK|SLOTS|STR|DEX|CON|INT|WIS|CHA|LVL|HP|DT|AC|XP|\|/g) ?? [];

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
