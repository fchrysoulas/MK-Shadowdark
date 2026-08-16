(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Character Sheet Tweaks";

  const SETTINGS = Object.freeze({
    ENABLED: "characterSheetTweaksEnabled",
    ATTACK_PROPERTIES: "attackWeaponPropertiesEnabled",
    DEBUG: "characterSheetTweaksDebug"
  });

  const ACTOR_SHEET_RENDER_HOOKS = [
    "renderActorSheet",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  const ITEM_SHEET_RENDER_HOOKS = [
    "renderItemSheet",
    "renderShadowdarkItemSheet",
    "renderShadowdarkItemSheetV2",
    "renderItemSheetShadowdark"
  ];

  Hooks.once("init", () => log("initialized"));

  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      try {
        onRenderActorSheet(app, html);
      } catch (err) {
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, err);
      }
    });
  }

  for (const hookName of ITEM_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      try {
        onRenderItemSheet(app, html);
      } catch (err) {
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | item render error`, err);
      }
    });
  }

  function onRenderActorSheet(app, html) {
    const root = getRootElement(html);
    if (!root?.querySelector || !isShadowdarkActorSheet(app, root)) return;

    const form = getSheetForm(root);
    const windowEl = getWindowElement(root);
    cleanupSheet(windowEl, form);

    if (!getSetting(SETTINGS.ENABLED, true)) return;

    applySheetClasses(windowEl, form);
    if (getSetting(SETTINGS.ATTACK_PROPERTIES, true)) {
      formatAttackProperties(app, form ?? root);
    }
    log("applied", app.actor?.name ?? app.object?.name ?? "unknown actor");
  }

  function onRenderItemSheet(app, html) {
    const root = getRootElement(html);
    if (!root?.querySelector || !isShadowdarkItemSheet(app, root)) return;

    const form = getSheetForm(root);
    const windowEl = getWindowElement(root);
    cleanupSheet(windowEl, form);

    if (!getSetting(SETTINGS.ENABLED, true)) return;

    applySheetClasses(windowEl, form);
    log("applied item visual style", app.item?.name ?? app.object?.name ?? "unknown item");
  }

  function isShadowdarkActorSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;
    const actor = app?.actor ?? app?.object;
    return Boolean(actor?.documentName === "Actor" && looksLikeShadowdarkSheet(root));
  }

  function isShadowdarkItemSheet(app, root) {
    if (game.system?.id !== "shadowdark") return false;
    const item = app?.item ?? app?.object;
    return Boolean(item?.documentName === "Item" && looksLikeShadowdarkSheet(root));
  }

  function looksLikeShadowdarkSheet(root) {
    return Boolean(
      root.matches?.(".shadowdark.sheet")
      || root.querySelector?.(".shadowdark.sheet")
      || (root.querySelector?.("header.SD-header") && root.querySelector?.("section.SD-content-body, .SD-content-body"))
    );
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetForm(root) {
    if (root.matches?.("form.shadowdark.sheet, form")) return root;
    return root.querySelector?.("form.shadowdark.sheet, form") ?? root;
  }

  function getWindowElement(root) {
    return root.closest?.(".window-app, .app") ?? root;
  }

  function cleanupSheet(windowEl, form) {
    for (const el of uniqueElements([windowEl, form])) {
      el.classList.remove("mk-character-sheet-tweaks");
    }
  }

  function applySheetClasses(windowEl, form) {
    for (const el of uniqueElements([windowEl, form])) {
      el.classList.add("mk-character-sheet-tweaks");
    }
  }

  function formatAttackProperties(app, root) {
    const actor = app.actor ?? app.object;
    if (!actor?.items || !root?.querySelectorAll) return;

    const links = root.querySelectorAll('.tab-abilities .attack a.rollable[data-action="item-attack"][data-item-id]');

    for (const link of links) {
      if (link.classList.contains("mk-attack-formatted")) continue;

      const itemId = link.dataset.itemId;
      const item = actor.items.get(itemId) ?? actor.items.find?.(candidate => candidate.id === itemId);
      if (!item || !["Weapon", "NPC Attack"].includes(item.type)) continue;

      Promise.resolve(getAttackPropertiesText(item)).then(properties => {
        const propertiesText = normalizeInlineText(properties);
        if (!propertiesText || !link.isConnected || link.classList.contains("mk-attack-formatted")) return;

        const currentText = normalizeInlineText(link.textContent);
        const mainText = item.type === "NPC Attack"
          ? getNpcAttackMainText(item, currentText)
          : stripTrailingProperties(currentText, propertiesText);
        const iconHtml = link.querySelector("i")?.outerHTML ?? '<i class="fa-solid fa-dice-d20"></i>';
        const attackName = String(item.name ?? "").trim();

        link.innerHTML = `
          ${iconHtml}
          <span class="mk-attack-lines">
            <span class="mk-attack-main-line">${renderAttackMainLine(mainText, attackName)}</span>
            <span class="mk-attack-properties-line">${escapeHtml(propertiesText)}</span>
          </span>
        `;
        link.classList.add("mk-attack-formatted");
      }).catch(err => {
        console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | attack property format error`, err);
      });
    }
  }

  async function getAttackPropertiesText(item) {
    if (item.type === "NPC Attack") return getNpcAttackPropertiesText(item);

    try {
      if (typeof item.propertiesDisplay === "function") {
        const display = await item.propertiesDisplay();
        const text = htmlToText(display);
        if (text) return text;
      }
    } catch (_err) {
      // Fall through to raw properties.
    }

    const properties = foundry.utils.getProperty(item, "system.properties") ?? [];
    if (!Array.isArray(properties) || !properties.length) return "";

    return properties.map(property => {
      if (typeof property === "string") return property.split(".").pop()?.replace(/[-_]/g, " ") ?? property;
      return property?.name ?? property?.label ?? "";
    }).filter(Boolean).join(", ");
  }

  async function getNpcAttackPropertiesText(item) {
    const ranges = Array.from(item.system?.ranges ?? [])
      .map(localizeRange)
      .filter(Boolean)
      .join("/");
    const attackType = Array.from(item.system?.ranges ?? []).includes("close")
      ? localizeConfigValue("WEAPON_TYPES", "melee", "Melee")
      : localizeConfigValue("WEAPON_TYPES", "ranged", "Ranged");
    const damage = formatNpcAttackDamage(item);
    const properties = await getPropertyNames(item);

    return [attackType, ranges, damage, properties.join(", ")]
      .filter(Boolean)
      .join(" • ");
  }

  function getNpcAttackMainText(item, fallback) {
    const count = Number(item.system?.attack?.num) || 1;
    const name = String(item.name ?? "").trim();
    const attackBonus = Number(item.system?.bonuses?.attackBonus) || 0;
    const damage = formatNpcAttackDamage(item);
    if (!name || !damage) return fallback;

    return `${count} ${name}${attackBonus ? ` +${attackBonus}` : ""} (${damage})`;
  }

  function formatNpcAttackDamage(item) {
    const base = String(item.system?.damage?.value ?? "").trim();
    if (!base) return "";

    const bonus = Number(item.system?.bonuses?.damageBonus) || 0;
    const special = String(item.system?.damage?.special ?? "").trim();
    return `${base}${bonus ? `+${bonus}` : ""}${special ? ` + ${special}` : ""}`;
  }

  async function getPropertyNames(item) {
    const properties = [];
    for (const property of Array.from(item.system?.properties ?? [])) {
      if (property && typeof property === "object") {
        const name = String(property.name ?? property.label ?? "").trim();
        if (name) properties.push(name);
        continue;
      }

      try {
        const resolved = await fromUuid(property);
        const name = String(resolved?.name ?? "").trim();
        if (name) properties.push(name);
      } catch (_err) {
        // Omit unavailable Property documents rather than exposing UUIDs.
      }
    }
    return properties;
  }

  function localizeRange(range) {
    const key = CONFIG.SHADOWDARK?.RANGES?.[range];
    return key ? game.i18n.localize(key) : String(range ?? "");
  }

  function localizeConfigValue(collection, key, fallback) {
    const value = CONFIG.SHADOWDARK?.[collection]?.[key];
    return value ? game.i18n.localize(value) : fallback;
  }

  function renderAttackMainLine(mainText, attackName) {
    const text = String(mainText ?? "").trim();
    const name = String(attackName ?? "").trim();
    const index = text.toLowerCase().indexOf(name.toLowerCase());
    if (!name || index < 0) return escapeHtml(text);
    return `${escapeHtml(text.slice(0, index))}<b>${escapeHtml(name)}</b>${escapeHtml(text.slice(index + name.length))}`;
  }

  function stripTrailingProperties(text, properties) {
    const main = String(text ?? "").trim();
    const props = String(properties ?? "").trim();
    if (!main || !props) return main;
    if (!main.toLowerCase().endsWith(props.toLowerCase())) return main;
    return main.slice(0, main.length - props.length).replace(/,\s*$/, "").trim();
  }

  function htmlToText(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return normalizeInlineText(div.textContent);
  }

  function normalizeInlineText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function getSetting(key, fallback = undefined) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
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
