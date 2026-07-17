(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Quickdraw";
  const STYLESHEET_ID = "mk-shadowdark-quickdraw-styles";
  const STYLESHEET_PATH = `modules/${MODULE_ID}/styles/quickdraw-icons.css`;
  const FLAG_KEY = "quickdraw";
  const ACTOR_SHEET_RENDER_HOOKS = [
    "renderActorSheet",
    "renderActorSheetSD",
    "renderPlayerSheetSD",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];
  const renderRetryTimers = new WeakMap();

  ensureStylesheet();

  function ensureStylesheet() {
    if (document.getElementById(STYLESHEET_ID)) return;

    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => link.href.includes(`/modules/${MODULE_ID}/styles/quickdraw-icons.css`));
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

  function toFoundryRoute(path) {
    const clean = String(path ?? "").replace(/^\/+/, "");
    try {
      if (foundry.utils.getRoute) return foundry.utils.getRoute(clean);
    } catch (_error) {
      // Use the host-root fallback.
    }
    return `/${clean}`;
  }

  function isDebugEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, "debug");
    } catch (e) {
      return false;
    }
  }

  function dlog(...args) {
    if (!isDebugEnabled()) return;
    console.log(`${MODULE_ID} | ${SUBMODULE} |`, ...args);
  }

  function dwarn(...args) {
    if (!isDebugEnabled()) return;
    console.warn(`${MODULE_ID} | ${SUBMODULE} |`, ...args);
  }

  function getLimit() {
    const v = Number(game.settings.get(MODULE_ID, "quickdrawLimit"));
    return Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 3;
  }

  function isQuickdraw(item) {
    return !!item?.getFlag(MODULE_ID, FLAG_KEY);
  }

  function countQuickdraw(actor) {
    return actor?.items?.filter((i) => isQuickdraw(i))?.length ?? 0;
  }

  function normalizeType(t) {
    return String(t ?? "").trim().toLowerCase();
  }

  function collectStringFields(item) {
    const sys = item?.system ?? {};
    return [
      item?.name,
      item?.type,
      sys.type,
      sys.subtype,
      sys.category,
      sys.itemType,
      sys.kind,
      sys.group
    ]
      .filter((x) => typeof x === "string")
      .map((x) => x.toLowerCase());
  }

  function looksLikePotion(item) {
    return collectStringFields(item).some((s) => s.includes("potion"));
  }

  function looksLikeWand(item) {
    return collectStringFields(item).some((s) => s.includes("wand"));
  }

  function looksLikeScroll(item) {
    return collectStringFields(item).some((s) => s.includes("scroll"));
  }

  /**
   * Eligible = Weapon, Basic, Armor, Potion-like, Wand-like, Scroll-like.
   * If an item is already flagged quickdraw, still show the bolt so it can be unset.
   */
  function isEligibleForBolt(item) {
    if (!item) return false;
    if (isQuickdraw(item)) return true;

    const t = normalizeType(item.type);

    if (t === "weapon") return true;
    if (t === "basic") return true;
    if (t === "armor") return true;
    if (t === "potion" || t === "consumable" || t === "elixir") return true;
    if (t === "wand") return true;
    if (t === "scroll") return true;

    if (looksLikePotion(item)) return true;
    if (looksLikeWand(item)) return true;
    if (looksLikeScroll(item)) return true;

    return false;
  }

  function isAutoSortEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, "quickdrawAutoSort");
    } catch (e) {
      return true;
    }
  }

  function isQuickdrawIconEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, "quickdrawIconEnabled");
    } catch (_err) {
      return true;
    }
  }

  function isHighlightEnabled() {
    try {
      return !!game.settings.get(MODULE_ID, "characterSheetTweaksHighlightEquipped");
    } catch (_err) {
      return true;
    }
  }

  function applyHighlightScope(html) {
    const scopes = html
      .add(html.find("form.shadowdark.sheet.player, .shadowdark.sheet.player"))
      .add(html.closest(".window-app, .app"));

    scopes.toggleClass("mk-highlight-equipped", isHighlightEnabled());
  }

  /**
   * Update without re-rendering the sheet to avoid flicker.
   */
  async function setQuickdrawNoRender(item, value) {
    if (!item?.isOwner) {
      ui.notifications?.warn("You do not have permission to edit this item.");
      return false;
    }

    const updateData = value
      ? { [`flags.${MODULE_ID}.${FLAG_KEY}`]: true }
      : { [`flags.${MODULE_ID}.-=${FLAG_KEY}`]: null };

    await item.update(updateData, { render: false });
    return true;
  }

  async function tryToggleQuickdraw(app, item) {
    const currentlyOn = isQuickdraw(item);

    if (currentlyOn) {
      return await setQuickdrawNoRender(item, false);
    }

    const limit = getLimit();
    const currentCount = countQuickdraw(app.actor);

    if (limit > 0 && currentCount >= limit) {
      ui.notifications?.warn(`Quickdraw limit reached (${limit}). Unmark another item first.`);
      return false;
    }

    return await setQuickdrawNoRender(item, true);
  }

  function titleFor(active) {
    return active ? "Quickdraw (ON) - click to unset" : "Quickdraw (OFF) - click to set";
  }

  function buildQuickdrawButton(active) {
    return $(`
      <a class="item-control mk-quickdraw-toggle ${active ? "is-on" : "is-off"}"
         data-action="mk-quickdraw"
         role="button"
         aria-label="${titleFor(active)}"
         title="${titleFor(active)}">
        <svg class="mk-quickdraw-bolt" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M13.6 1.5 3.8 13.2h7.1l-1.1 9.3 10.4-12.7h-7.1l.5-8.3Z"></path>
        </svg>
      </a>
    `);
  }

  function asJQuery(html) {
    if (!html) return null;
    if (html.jquery) return html;

    try {
      return $(html);
    } catch (_err) {
      return null;
    }
  }

  /**
   * IMPORTANT:
   * We only operate inside the inventory tab/root.
   * If we cannot find a real inventory root, we do nothing rather than touching spells lists.
   */
  function getInventoryRoot(html) {
    const selectors = [
      "section.tab.tab-inventory[data-tab='tab-inventory']",
      "section[data-tab='tab-inventory']",
      ".tab.tab-inventory",
      "section.tab[data-tab='inventory']",
      "div.tab[data-tab='inventory']",
      ".tab.inventory",
      ".inventory.tab",
      ".inventory",
      ".inventory-tab",
      "[data-panel='inventory']"
    ];

    for (const sel of selectors) {
      const el = html.find(sel).first();
      if (el?.length) {
        dlog("inventory root found by selector", sel);
        return el;
      }
    }

    // Heuristic fallback for Shadowdark layouts:
    // look for a container that clearly contains the carried gear inventory,
    // but not spell sections.
    const heuristic = html.find("section, article, div").filter((_, el) => {
      const t = ($(el).text() || "").trim();
      if (!t) return false;

      const hasInventoryMarkers =
        t.includes("Items") &&
        t.includes("Qty") &&
        t.includes("Slots");

      const hasSpellMarkers =
        t.includes("Spells Known") ||
        t.includes("Spells from Items") ||
        t.includes("Duration") && t.includes("Range");

      return hasInventoryMarkers && !hasSpellMarkers;
    }).first();

    if (heuristic?.length) {
      dlog("inventory root found by heuristic");
      return heuristic;
    }

    dwarn("Could not find inventory root. Quickdraw will not inject.");
    return null;
  }

  function getRowMarkerElement(row) {
    const child = row.find("[data-item-id],[data-item-uuid],[data-document-id],[data-uuid]").first();
    return child?.length ? child : row;
  }

  function parseItemIdFromUuidLike(str) {
    if (!str || typeof str !== "string") return null;

    const idx = str.indexOf(".Item.");
    if (idx !== -1) return (str.slice(idx + 6).split(".")[0]) || null;

    const idx2 = str.indexOf("Item.");
    if (idx2 !== -1) return (str.slice(idx2 + 5).split(".")[0]) || null;

    return null;
  }

  function getItemFromRow(app, row) {
    const marker = getRowMarkerElement(row);

    const itemId =
      marker.data("itemId") ||
      marker.attr("data-item-id") ||
      marker.data("documentId") ||
      marker.attr("data-document-id");

    if (itemId) return app.actor?.items?.get(itemId) ?? null;

    const uuidLike =
      marker.data("itemUuid") ||
      marker.attr("data-item-uuid") ||
      marker.data("uuid") ||
      marker.attr("data-uuid");

    if (uuidLike) {
      const parsedId = parseItemIdFromUuidLike(uuidLike);
      if (parsedId) return app.actor?.items?.get(parsedId) ?? null;
    }

    return null;
  }

  function getInventoryRows(html) {
    const root = getInventoryRoot(html);
    if (!root?.length) return $();

    const rowCandidates = root.find("li.item, .item");
    const rows = rowCandidates.filter((_, el) => {
      const $el = $(el);
      const marker = getRowMarkerElement($el);
      const hasId = !!(
        marker.attr("data-item-id") ||
        marker.data("itemId") ||
        marker.attr("data-document-id") ||
        marker.data("documentId")
      );
      const hasUuid = !!(
        marker.attr("data-item-uuid") ||
        marker.data("itemUuid") ||
        marker.attr("data-uuid") ||
        marker.data("uuid")
      );
      return hasId || hasUuid;
    });

    dlog("inventory rows found", rows.length);

    return rows.length ? rows : root.find("[data-item-id],[data-item-uuid],[data-document-id],[data-uuid]");
  }

  function findRightIconContainer(row) {
    const selectors = [
      ".item-controls",
      ".item-control-group",
      ".item-controls-container",
      ".controls",
      ".item-icons",
      ".item-buttons",
      ".item-actions",
      ".actions"
    ];

    for (const sel of selectors) {
      const el = row.find(sel).first();
      if (el?.length) return el;
    }

    const existingControl = row.find("a.item-control, button.item-control, a[data-action], button[data-action]").first();
    if (existingControl?.length) return existingControl.parent();

    return null;
  }

  function insertQuickdrawButton(controls, $btn) {
    const deleteBtn = controls
      .find(".item-delete, [data-action='delete'], [data-action='remove'], a.item-control.delete, button.item-control.delete")
      .first();

    controls.addClass("mk-has-quickdraw-toggle");

    if (deleteBtn?.length) deleteBtn.before($btn);
    else controls.append($btn);
  }

  function isSpecialAbilitiesGroup(parentEl) {
    const $parent = $(parentEl);
    if (!$parent.length) return false;

    const classIdText = [
      $parent.attr("class") || "",
      $parent.attr("id") || "",
      $parent.attr("data-group") || "",
      $parent.attr("data-category") || ""
    ]
      .join(" ")
      .toLowerCase();

    if (classIdText.includes("special-abilities") || classIdText.includes("specialabilities")) {
      return true;
    }

    const container = $parent.closest("section, article, fieldset, .tab, .panel, .group, .items-list, .inventory-group, .grid, .flexcol, .flexrow").first();

    const headerText = [
      container.attr("class") || "",
      container.attr("id") || "",
      container.attr("data-group") || "",
      container.attr("data-category") || "",
      container.find("h1, h2, h3, h4, h5, .header, .group-header, .items-header, .section-header, .title, .label")
        .map((_, el) => $(el).text())
        .get()
        .join(" ")
    ]
      .join(" ")
      .toLowerCase();

    return headerText.includes("special abilities");
  }

  /**
   * Auto-sort quickdraw items first within inventory lists only.
   * It never touches spells lists because rows are sourced only from inventory root.
   * It also skips Special Abilities groups.
   */
  function autoSortQuickdraw(html, app) {
    if (!isAutoSortEnabled()) return;

    const rows = getInventoryRows(html);
    if (!rows?.length) return;

    const groups = new Map();

    rows.each((idx, el) => {
      const $row = $(el);
      const item = getItemFromRow(app, $row);
      if (!item) return;

      const parent = $row.closest("ol, ul").get(0);
      if (!parent) return;
      if (isSpecialAbilitiesGroup(parent)) return;

      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push({ rowEl: el, item, index: idx });
    });

    for (const [parent, entries] of groups.entries()) {
      const parent$ = $(parent);

      const anyEligible = entries.some((e) => isEligibleForBolt(e.item));
      if (!anyEligible) continue;

      const sorted = entries.slice().sort((a, b) => {
        const aq = isEligibleForBolt(a.item) && isQuickdraw(a.item) ? 0 : 1;
        const bq = isEligibleForBolt(b.item) && isQuickdraw(b.item) ? 0 : 1;

        if (aq !== bq) return aq - bq;
        return a.index - b.index;
      });

      for (const ent of sorted) parent$.append(ent.rowEl);
    }
  }

  function injectQuickdrawToggles(app, html) {
    const rows = getInventoryRows(html);
    if (!rows?.length) return;

    rows.closest("ol.SD-list.item-list, ul.SD-list.item-list").removeClass("mk-has-quickdraw-column");

    for (const rowEl of rows) {
      const row = $(rowEl);
      const item = getItemFromRow(app, row);
      if (!item) continue;

      const controls = findRightIconContainer(row);
      if (!controls?.length) continue;

      controls.find(".mk-quickdraw-toggle").remove();
      controls.removeClass("mk-has-quickdraw-toggle");

      if (!isEligibleForBolt(item)) continue;

      const active = isQuickdraw(item);
      row.toggleClass("mk-quickdraw-item", active);
      row.toggleClass("mk-quickdraw-active", active);
      row.attr("data-mk-quickdraw", active ? "true" : "false");

      const $btn = buildQuickdrawButton(active);

      $btn.on("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const ok = await tryToggleQuickdraw(app, item);
        if (!ok) return;

        const nowOn = isQuickdraw(item);
        $btn.toggleClass("is-on", nowOn).toggleClass("is-off", !nowOn);
        $btn.attr("title", titleFor(nowOn));
        row.toggleClass("mk-quickdraw-item", nowOn);
        row.toggleClass("mk-quickdraw-active", nowOn);
        row.attr("data-mk-quickdraw", nowOn ? "true" : "false");

        autoSortQuickdraw(html, app);
      });

      insertQuickdrawButton(controls, $btn);
      row.closest("ol.SD-list.item-list, ul.SD-list.item-list").addClass("mk-has-quickdraw-column");
    }

    autoSortQuickdraw(html, app);

    dlog("quickdraw summary", {
      actor: app.actor?.name,
      limit: getLimit(),
      currentQuickdraw: countQuickdraw(app.actor),
      autoSort: isAutoSortEnabled()
    });
  }

  function refreshQuickdrawRowState(app, html) {
    const rows = getInventoryRows(html);
    if (!rows?.length) return;

    for (const rowEl of rows) {
      const row = $(rowEl);
      const item = getItemFromRow(app, row);
      if (!item) continue;

      const active = isQuickdraw(item);
      row.toggleClass("mk-quickdraw-item", active);
      row.toggleClass("mk-quickdraw-active", active);
      row.attr("data-mk-quickdraw", active ? "true" : "false");
    }
  }

  function processSheet(app, html) {
    applyHighlightScope(html);
    refreshQuickdrawRowState(app, html);
    if (isQuickdrawIconEnabled()) injectQuickdrawToggles(app, html);
  }

  function onRender(app, html) {
    if (!app?.actor) return;
    if (game.system?.id !== "shadowdark") return;

    const $html = asJQuery(html);
    if (!$html?.length) return;

    processSheet(app, $html);
    scheduleRenderRetries(app, $html);
  }

  function scheduleRenderRetries(app, fallbackHtml) {
    const existingTimers = renderRetryTimers.get(app) ?? [];
    existingTimers.forEach(timer => window.clearTimeout(timer));

    const timers = [50, 250].map(delay => window.setTimeout(() => {
      const currentHtml = asJQuery(app?.element);
      const $html = currentHtml?.length ? currentHtml : fallbackHtml;
      if (!$html?.length) return;

      processSheet(app, $html);
    }, delay));

    renderRetryTimers.set(app, timers);
  }

  Hooks.once("init", () => {
    console.log(`${MODULE_ID} | ${SUBMODULE} | loaded (settings registered in settings.js)`);
  });

  for (const hookName of ACTOR_SHEET_RENDER_HOOKS) {
    Hooks.on(hookName, onRender);
  }
})();
