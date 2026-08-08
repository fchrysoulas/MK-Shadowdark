import { evaluateQuickdrawLimitDetails } from "./quickdraw-limit.js";

// Renders and manages Quickdraw controls on Shadowdark actor sheets.
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
  const invalidLimitExpressionsWarned = new Set();

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

  function getLimitDetails(actor) {
    let expression = "3";

    try {
      expression = String(game.settings.get(MODULE_ID, "quickdrawLimit") ?? "3").trim() || "3";
      return evaluateQuickdrawLimitDetails(expression, actor);
    } catch (error) {
      const warningKey = `${actor?.id ?? "unknown"}:${expression}`;
      if (!invalidLimitExpressionsWarned.has(warningKey)) {
        invalidLimitExpressionsWarned.add(warningKey);
        console.warn(`${MODULE_ID} | ${SUBMODULE} | Invalid limit expression "${expression}"; using 3.`, error);
      }
      return {
        expression,
        total: 3,
        invalid: true,
        sources: [{ type: "fixed", key: "fallback", label: "Invalid expression fallback", value: 3 }]
      };
    }
  }

  function getLimit(actor) {
    return getLimitDetails(actor).total;
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

    const limit = getLimit(app.actor);
    const currentCount = countQuickdraw(app.actor);

    if (limit > 0 && currentCount >= limit) {
      ui.notifications?.warn(`Quickdraw limit reached (${limit}). Unmark another item first.`);
      return false;
    }

    return await setQuickdrawNoRender(item, true);
  }

  function quickdrawControlLabel() {
    return "Toggle Quickdraw";
  }

  function syncQuickdrawButtonState(button, active) {
    const title = quickdrawControlLabel();

    button
      .toggleClass("is-on", active)
      .toggleClass("is-off", !active)
      .attr({
        "aria-label": title,
        "aria-pressed": String(active),
        "data-tooltip": title
      });
  }

  function buildQuickdrawButton(item, active) {
    // Match Shadowdark's native inventory actions (equip, light, and stash):
    // a plain action link containing a Font Awesome icon. These classes and
    // CSS variables are stable across the supported v13+ system releases.
    const button = $("<a>", {
      class: "mk-quickdraw-toggle",
      "data-action": "mk-quickdraw",
      "data-item-id": item?.id ?? item?._id ?? "",
      role: "button",
      tabindex: 0
    }).append($("<i>", {
      class: "fa-solid fa-bolt",
      "aria-hidden": "true"
    }));

    syncQuickdrawButtonState(button, active);
    return button;
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

  function compareInventoryEntries(a, b) {
    const quickdrawOrder = Number(isQuickdraw(b.item)) - Number(isQuickdraw(a.item));
    if (quickdrawOrder !== 0) return quickdrawOrder;

    const nameOrder = String(a.item?.name ?? "").localeCompare(
      String(b.item?.name ?? ""),
      game.i18n?.lang,
      { sensitivity: "base", numeric: true }
    );

    return nameOrder || a.index - b.index;
  }

  /**
   * Sort every item inside its existing inventory group. Quickdraw items come
   * first, followed by all other items alphabetically. Rows never move between
   * groups, and spell lists remain untouched because rows come from the
   * inventory root only.
   */
  function sortInventoryGroups(html, app) {
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

      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push({ rowEl: el, item, index: idx });
    });

    for (const [parent, entries] of groups.entries()) {
      const parent$ = $(parent);
      const sorted = entries.slice().sort(compareInventoryEntries);

      for (const ent of sorted) parent$.append(ent.rowEl);
    }
  }

  function findInventorySidebar(root) {
    const inventoryGrid = root.is?.(".inventory-grid")
      ? root
      : root.find(".inventory-grid").first();
    if (!inventoryGrid?.length) return null;

    const columns = inventoryGrid.children("div");
    const sidebar = columns.last().children(".grid-1-columns").first();
    if (sidebar?.length) return sidebar;

    // Fallback for compatible sheet variants which wrap the sidebar grid.
    const nestedSidebar = columns.last().find(".grid-1-columns").first();
    return nestedSidebar?.length ? nestedSidebar : null;
  }

  function formatQuickdrawNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0";
    return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 100) / 100);
  }

  function quickdrawSourceLabel(source) {
    return String(source?.label ?? "Limit");
  }

  function quickdrawSourceValue(source, limit) {
    if (source?.type === "fixed" && limit === 0) return "∞";
    return formatQuickdrawNumber(source?.value);
  }

  function renderQuickdrawSummaryCard(app, html) {
    const root = getInventoryRoot(html);
    if (!root?.length) return;

    root.find(".mk-quickdraw-card").remove();

    const sidebar = findInventorySidebar(root);
    if (!sidebar?.length) {
      dwarn("Could not find inventory sidebar. Quickdraw summary will not inject.");
      return;
    }

    const details = getLimitDetails(app.actor);
    const current = countQuickdraw(app.actor);
    const limit = Number(details.total);
    const overLimit = limit > 0 && current > limit;
    const totalText = limit === 0 ? "∞" : formatQuickdrawNumber(limit);
    const analysisId = `mk-quickdraw-analysis-${String(app.appId ?? app.id ?? app.actor?.id ?? "actor").replace(/[^A-Za-z0-9_-]/g, "-")}`;

    const card = $("<div>", {
      class: `SD-box mk-quickdraw-card${overLimit || details.invalid ? " mk-warning" : ""}`,
      "data-mk-quickdraw-expression": details.expression,
      tabindex: 0,
      "aria-label": `Quickdraw ${current} of ${limit === 0 ? "unlimited" : totalText}`,
      "aria-describedby": analysisId
    });

    const header = $("<div>", { class: "header" })
      .append($("<label>").text("Quick"))
      .append($("<span>"));
    const content = $("<div>", { class: "content" });
    const values = $("<div>", { class: "value-grid larger mk-quickdraw-card-values" })
      .append($("<div>", { class: overLimit ? "mk-warning" : "" }).text(current))
      .append($("<div>").text("/"))
      .append($("<div>").text(totalText));

    const analysis = $("<div>", {
      id: analysisId,
      class: "mk-quickdraw-card-analysis",
      role: "tooltip"
    });
    analysis.append($("<div>", { class: "mk-quickdraw-analysis-title" }).text("Sources"));

    const sources = $("<div>", { class: "SD-grid left small mk-quickdraw-card-sources" });
    for (const source of details.sources ?? []) {
      sources
        .append($("<div>", { class: "mk-quickdraw-source-value" }).text(quickdrawSourceValue(source, limit)))
        .append($("<div>", { class: "mk-quickdraw-source-label" }).text(quickdrawSourceLabel(source)));
    }

    analysis.append(sources);
    content.append(values);
    card.append(header, content, analysis);

    const slotsCard = sidebar.children(".SD-box").first();
    if (slotsCard?.length) slotsCard.after(card);
    else sidebar.prepend(card);

    dlog("quickdraw card", { current, limit, sources: details.sources });
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

      const $btn = buildQuickdrawButton(item, active);

      const activateQuickdraw = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const ok = await tryToggleQuickdraw(app, item);
        if (!ok) return;

        const nowOn = isQuickdraw(item);
        syncQuickdrawButtonState($btn, nowOn);
        row.toggleClass("mk-quickdraw-item", nowOn);
        row.toggleClass("mk-quickdraw-active", nowOn);
        row.attr("data-mk-quickdraw", nowOn ? "true" : "false");

        sortInventoryGroups(html, app);
        renderQuickdrawSummaryCard(app, html);
      };

      $btn.on("click", activateQuickdraw);
      $btn.on("keydown", ev => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        activateQuickdraw(ev);
      });

      insertQuickdrawButton(controls, $btn);
      row.closest("ol.SD-list.item-list, ul.SD-list.item-list").addClass("mk-has-quickdraw-column");
    }

    sortInventoryGroups(html, app);

    dlog("quickdraw summary", {
      actor: app.actor?.name,
      limit: getLimit(app.actor),
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
    else sortInventoryGroups(html, app);
    renderQuickdrawSummaryCard(app, html);
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
