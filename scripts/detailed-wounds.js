(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Detailed Wounds";
  const SETTING_ENABLED = "detailedWoundsEnabled";
  const FLAG_KEY = "detailedWounds";
  const TAB_ID = "tab-mk-wounds";

  const LOCATIONS = Object.freeze([
    { key: "head", label: "Head", icon: "fa-solid fa-brain", side: "left" },
    { key: "leftArm", label: "Left Arm", icon: "fa-solid fa-hand-fist", side: "left" },
    { key: "leftHand", label: "Left Hand", icon: "fa-solid fa-hand", side: "left" },
    { key: "leftLeg", label: "Left Leg", icon: "fa-solid fa-person-walking", side: "left" },
    { key: "torso", label: "Torso", icon: "fa-solid fa-heart-pulse", side: "right" },
    { key: "abdomen", label: "Abdomen", icon: "fa-solid fa-shield-halved", side: "right" },
    { key: "rightArm", label: "Right Arm", icon: "fa-solid fa-hand-fist", side: "right" },
    { key: "rightHand", label: "Right Hand", icon: "fa-solid fa-hand", side: "right" },
    { key: "rightLeg", label: "Right Leg", icon: "fa-solid fa-person-walking", side: "right" }
  ]);

  const SEVERITIES = Object.freeze({
    minor: { label: "Minor", rank: 1 },
    moderate: { label: "Moderate", rank: 2 },
    severe: { label: "Severe", rank: 3 },
    critical: { label: "Critical", rank: 4 }
  });

  Hooks.once("init", () => {
    if (!game.settings.settings.has(`${MODULE_ID}.${SETTING_ENABLED}`)) {
      game.settings.register(MODULE_ID, SETTING_ENABLED, {
        name: "Detailed Wounds | Enabled",
        hint: "Adds a Wounds tab to Shadowdark player character sheets for tracking injuries by body location.",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: refreshOpenActorSheets
      });
    }

    log("initialized");
  });

  const RENDER_HOOKS = [
    "renderActorSheet",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  for (const hookName of RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      try {
        injectWoundsTab(app, html);
      } catch (err) {
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, err);
      }
    });
  }

  function injectWoundsTab(app, html) {
    if (game.system?.id !== "shadowdark") return;
    if (!getSetting(SETTING_ENABLED, true)) return;

    const actor = app?.actor ?? app?.object;
    if (actor?.documentName !== "Actor") return;

    const root = getRootElement(html);
    if (!root?.querySelector) return;

    const form = getSheetForm(root);
    if (!form?.matches?.(".shadowdark.sheet.player, form.shadowdark.sheet.player") && !form?.classList?.contains("player")) return;

    const nav = form.querySelector(".SD-nav[data-group='primary'], .SD-nav");
    const content = form.querySelector(".SD-content-body");
    if (!nav || !content) return;

    nav.querySelector(".mk-wounds-nav")?.remove();
    content.querySelector(`.${TAB_ID}`)?.remove();

    const navButton = document.createElement("a");
    navButton.className = "navigation-tab mk-wounds-nav";
    navButton.dataset.tab = TAB_ID;
    navButton.innerHTML = '<i class="fa-solid fa-bandage"></i><span>Wounds</span>';

    const notesTab = nav.querySelector('[data-tab="tab-notes"]');
    if (notesTab) nav.insertBefore(navButton, notesTab);
    else nav.appendChild(navButton);

    const section = document.createElement("section");
    section.className = `tab ${TAB_ID} mk-wounds-tab`;
    section.dataset.group = "primary";
    section.dataset.tab = TAB_ID;
    section.innerHTML = renderWoundsHtml(actor, app.__mkWoundsSelectedLocation ?? "torso");
    content.appendChild(section);

    bindTabNavigation(app, nav, content, navButton, section);
    bindWoundControls(app, actor, section);

    if (app.__mkWoundsActive) activateWoundsTab(app, nav, content, navButton, section);
  }

  function bindTabNavigation(app, nav, content, navButton, section) {
    navButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      app.__mkWoundsActive = true;
      activateWoundsTab(app, nav, content, navButton, section);
    });

    for (const nativeTab of nav.querySelectorAll(".navigation-tab:not(.mk-wounds-nav)")) {
      nativeTab.addEventListener("click", () => {
        app.__mkWoundsActive = false;
        navButton.classList.remove("active");
        section.classList.remove("active");
      });
    }
  }

  function activateWoundsTab(app, nav, content, navButton, section) {
    for (const tab of nav.querySelectorAll(".navigation-tab")) tab.classList.remove("active");
    for (const panel of content.querySelectorAll(":scope > .tab[data-group='primary']")) panel.classList.remove("active");

    navButton.classList.add("active");
    section.classList.add("active");
    app.__mkWoundsActive = true;
  }

  function bindWoundControls(app, actor, section) {
    const canEdit = canEditActor(actor);

    for (const locationButton of section.querySelectorAll("[data-wound-location]")) {
      locationButton.addEventListener("click", () => {
        app.__mkWoundsSelectedLocation = locationButton.dataset.woundLocation;
        rerenderWoundsSection(app, actor, section);
      });
    }

    const form = section.querySelector(".mk-wounds-add-form");
    if (form && canEdit) {
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const formData = new FormData(form);
        const location = String(formData.get("location") ?? "");
        const severity = String(formData.get("severity") ?? "minor");
        const note = String(formData.get("note") ?? "").trim();

        if (!getLocation(location) || !SEVERITIES[severity]) return;
        await addWound(actor, location, severity, note);
      });
    }

    if (canEdit) {
      for (const healButton of section.querySelectorAll("[data-action='heal-wound']")) {
        healButton.addEventListener("click", async event => {
          event.preventDefault();
          const location = healButton.dataset.location;
          const woundId = healButton.dataset.woundId;
          await removeWound(actor, location, woundId);
        });
      }

      const clearButton = section.querySelector("[data-action='clear-location']");
      clearButton?.addEventListener("click", async event => {
        event.preventDefault();
        const location = clearButton.dataset.location;
        await clearLocation(actor, location);
      });
    }
  }

  function rerenderWoundsSection(app, actor, section) {
    const selected = app.__mkWoundsSelectedLocation ?? "torso";
    section.innerHTML = renderWoundsHtml(actor, selected);
    bindWoundControls(app, actor, section);
  }

  function renderWoundsHtml(actor, selectedLocationKey) {
    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const selectedLocation = getLocation(selectedLocationKey) ?? getLocation("torso") ?? LOCATIONS[0];
    const selectedWounds = data.locations[selectedLocation.key] ?? [];
    const totalWounds = LOCATIONS.reduce((sum, location) => sum + (data.locations[location.key]?.length ?? 0), 0);
    const criticalWounds = LOCATIONS.reduce((sum, location) => (
      sum + (data.locations[location.key] ?? []).filter(wound => wound.severity === "critical").length
    ), 0);
    const canEdit = canEditActor(actor);

    const leftCards = LOCATIONS.filter(location => location.side === "left")
      .map(location => renderLocationCard(location, data, selectedLocation.key))
      .join("");
    const rightCards = LOCATIONS.filter(location => location.side === "right")
      .map(location => renderLocationCard(location, data, selectedLocation.key))
      .join("");

    return `
      <div class="mk-wounds-shell">
        <header class="mk-wounds-header">
          <div>
            <h2><i class="fa-solid fa-bandage"></i> Detailed Wounds</h2>
            <p>Track injuries by body location without changing Shadowdark's core HP rules.</p>
          </div>
          <div class="mk-wounds-summary" title="Tracked wounds">
            <strong>${totalWounds}</strong>
            <span>${totalWounds === 1 ? "wound" : "wounds"}</span>
            ${criticalWounds ? `<em>${criticalWounds} critical</em>` : ""}
          </div>
        </header>

        <div class="mk-wounds-map">
          <div class="mk-wounds-location-column mk-wounds-location-column-left">
            ${leftCards}
          </div>

          <div class="mk-wounds-body" aria-label="Body wound map">
            <div class="mk-wounds-body-glow"></div>
            <i class="fa-solid fa-person mk-wounds-person" aria-hidden="true"></i>
            ${LOCATIONS.map(location => renderBodyMarker(location, data, selectedLocation.key)).join("")}
          </div>

          <div class="mk-wounds-location-column mk-wounds-location-column-right">
            ${rightCards}
          </div>
        </div>

        <div class="mk-wounds-detail">
          <div class="mk-wounds-detail-heading">
            <div>
              <i class="${selectedLocation.icon}"></i>
              <div>
                <h3>${escapeHtml(selectedLocation.label)}</h3>
                <span>${renderLocationStatusText(selectedWounds)}</span>
              </div>
            </div>
            ${canEdit && selectedWounds.length ? `
              <button type="button" class="mk-wounds-clear" data-action="clear-location" data-location="${selectedLocation.key}">
                <i class="fa-solid fa-kit-medical"></i> Clear location
              </button>
            ` : ""}
          </div>

          <div class="mk-wounds-list">
            ${selectedWounds.length
              ? selectedWounds.map(wound => renderWoundRow(wound, selectedLocation.key, canEdit)).join("")
              : '<div class="mk-wounds-empty"><i class="fa-solid fa-shield-heart"></i><span>No wounds recorded.</span></div>'}
          </div>

          ${canEdit ? renderAddForm(selectedLocation.key) : '<p class="mk-wounds-readonly"><i class="fa-solid fa-lock"></i> Read only</p>'}
        </div>
      </div>
    `;
  }

  function renderLocationCard(location, data, selectedLocationKey) {
    const wounds = data.locations[location.key] ?? [];
    const status = getLocationStatus(wounds);
    const selected = location.key === selectedLocationKey;

    return `
      <button type="button"
        class="mk-wounds-location-card status-${status.key}${selected ? " selected" : ""}"
        data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(status.label)}">
        <span class="mk-wounds-location-icon"><i class="${location.icon}"></i></span>
        <span class="mk-wounds-location-copy">
          <strong>${escapeHtml(location.label)}</strong>
          <small>${escapeHtml(status.label)}${wounds.length ? ` · ${wounds.length}` : ""}</small>
        </span>
      </button>
    `;
  }

  function renderBodyMarker(location, data, selectedLocationKey) {
    const wounds = data.locations[location.key] ?? [];
    const status = getLocationStatus(wounds);
    const selected = location.key === selectedLocationKey;

    return `
      <button type="button"
        class="mk-wounds-marker marker-${location.key} status-${status.key}${selected ? " selected" : ""}"
        data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(status.label)}"
        aria-label="${escapeHtml(location.label)}: ${escapeHtml(status.label)}">
      </button>
    `;
  }

  function renderWoundRow(wound, location, canEdit) {
    const severity = SEVERITIES[wound.severity] ?? SEVERITIES.minor;
    const note = String(wound.note ?? "").trim();
    const when = wound.createdAt ? formatTimestamp(wound.createdAt) : "";

    return `
      <article class="mk-wounds-entry severity-${wound.severity}">
        <span class="mk-wounds-entry-severity">${escapeHtml(severity.label)}</span>
        <div class="mk-wounds-entry-copy">
          <strong>${note ? escapeHtml(note) : "Unspecified injury"}</strong>
          ${when ? `<small>${escapeHtml(when)}</small>` : ""}
        </div>
        ${canEdit ? `
          <button type="button" class="mk-wounds-heal" data-action="heal-wound" data-location="${location}" data-wound-id="${wound.id}" title="Heal / remove this wound">
            <i class="fa-solid fa-heart"></i>
          </button>
        ` : ""}
      </article>
    `;
  }

  function renderAddForm(location) {
    return `
      <form class="mk-wounds-add-form">
        <input type="hidden" name="location" value="${location}">
        <select name="severity" aria-label="Wound severity">
          ${Object.entries(SEVERITIES).map(([key, severity]) => `<option value="${key}">${severity.label}</option>`).join("")}
        </select>
        <input type="text" name="note" maxlength="180" placeholder="Wound description…" aria-label="Wound description">
        <button type="submit" title="Add wound"><i class="fa-solid fa-plus"></i> Add Wound</button>
      </form>
    `;
  }

  async function addWound(actor, location, severity, note = "") {
    if (!canEditActor(actor)) return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    data.locations[location].push({
      id: foundry.utils.randomID(),
      severity,
      note,
      createdAt: Date.now()
    });

    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
  }

  async function removeWound(actor, location, woundId) {
    if (!canEditActor(actor) || !getLocation(location)) return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    data.locations[location] = data.locations[location].filter(wound => wound.id !== woundId);
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
  }

  async function clearLocation(actor, location) {
    if (!canEditActor(actor) || !getLocation(location)) return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    data.locations[location] = [];
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
  }

  function normalizeData(raw) {
    const data = foundry.utils.deepClone(raw ?? {});
    data.version = 1;
    data.locations = data.locations && typeof data.locations === "object" ? data.locations : {};

    for (const location of LOCATIONS) {
      const wounds = Array.isArray(data.locations[location.key]) ? data.locations[location.key] : [];
      data.locations[location.key] = wounds
        .filter(wound => wound && typeof wound === "object")
        .map(wound => ({
          id: String(wound.id ?? foundry.utils.randomID()),
          severity: SEVERITIES[wound.severity] ? wound.severity : "minor",
          note: String(wound.note ?? ""),
          createdAt: Number(wound.createdAt) || null
        }));
    }

    return data;
  }

  function getLocationStatus(wounds) {
    if (!wounds?.length) return { key: "healthy", label: "Healthy", rank: 0 };

    let highest = { key: "minor", label: SEVERITIES.minor.label, rank: SEVERITIES.minor.rank };
    for (const wound of wounds) {
      const severity = SEVERITIES[wound.severity] ?? SEVERITIES.minor;
      if (severity.rank > highest.rank) highest = { key: wound.severity, label: severity.label, rank: severity.rank };
    }
    return highest;
  }

  function renderLocationStatusText(wounds) {
    const status = getLocationStatus(wounds);
    if (!wounds?.length) return "Healthy · no tracked injuries";
    return `${status.label} · ${wounds.length} ${wounds.length === 1 ? "wound" : "wounds"}`;
  }

  function getLocation(key) {
    return LOCATIONS.find(location => location.key === key) ?? null;
  }

  function canEditActor(actor) {
    return Boolean(game.user?.isGM || actor?.isOwner);
  }

  function formatTimestamp(timestamp) {
    try {
      return new Intl.DateTimeFormat(game.i18n?.lang ?? undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(timestamp));
    } catch (_err) {
      return "";
    }
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetForm(root) {
    if (root.matches?.("form.shadowdark.sheet, form")) return root;
    return root.querySelector?.("form.shadowdark.sheet, form") ?? root;
  }

  function getSetting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_err) {
      return fallback;
    }
  }

  function refreshOpenActorSheets() {
    try {
      for (const app of Object.values(ui.windows ?? {})) {
        const actor = app?.actor ?? (app?.object?.documentName === "Actor" ? app.object : null);
        if (actor) app.render(false);
      }
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | refresh error`, err);
    }
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
    console.log(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = mod.api ?? {};
    mod.api.wounds = {
      locations: LOCATIONS.map(location => ({ ...location })),
      severities: foundry.utils.deepClone(SEVERITIES),
      get: actor => normalizeData(actor?.getFlag?.(MODULE_ID, FLAG_KEY)),
      add: (actor, location, severity, note = "") => addWound(actor, location, severity, note),
      remove: (actor, location, woundId) => removeWound(actor, location, woundId),
      clearLocation: (actor, location) => clearLocation(actor, location)
    };
  });
})();
