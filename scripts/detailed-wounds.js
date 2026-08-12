(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Detailed Wounds";
  const SETTING_ENABLED = "detailedWoundsEnabled";
  const FLAG_KEY = "detailedWounds";
  const EFFECT_FLAG = "woundPenalties";
  const TAB_ID = "tab-mk-wounds";

  const LOCATIONS = Object.freeze([
    { key: "head", label: "Head", roll: 10, icon: "fa-solid fa-brain", side: "left" },
    { key: "leftArm", label: "Left Arm", roll: 8, icon: "fa-solid fa-hand-fist", side: "left" },
    { key: "leftHand", label: "Left Hand", roll: 6, icon: "fa-solid fa-hand", side: "left" },
    { key: "leftLeg", label: "Left Leg", roll: 4, icon: "fa-solid fa-person-walking", side: "left" },
    { key: "leftFoot", label: "Left Foot", roll: 2, icon: "fa-solid fa-shoe-prints", side: "left" },
    { key: "torso", label: "Torso", roll: 9, icon: "fa-solid fa-heart-pulse", side: "right" },
    { key: "rightArm", label: "Right Arm", roll: 7, icon: "fa-solid fa-hand-fist", side: "right" },
    { key: "rightHand", label: "Right Hand", roll: 5, icon: "fa-solid fa-hand", side: "right" },
    { key: "rightLeg", label: "Right Leg", roll: 3, icon: "fa-solid fa-person-walking", side: "right" },
    { key: "rightFoot", label: "Right Foot", roll: 1, icon: "fa-solid fa-shoe-prints", side: "right" }
  ]);

  const STATUSES = Object.freeze([
    { key: "ok", label: "OK", rank: 1 },
    { key: "wounded", label: "Wounded", rank: 2 },
    { key: "critical", label: "Critical", rank: 3 },
    { key: "destroyed", label: "Destroyed", rank: 4 }
  ]);

  Hooks.once("init", () => {
    if (!game.settings.settings.has(`${MODULE_ID}.${SETTING_ENABLED}`)) {
      game.settings.register(MODULE_ID, SETTING_ENABLED, {
        name: "Detailed Wounds | Enabled",
        hint: "Adds a Wounds tab to Shadowdark player character sheets for tracking body-location status.",
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
    "renderActorSheetV2",
    "renderShadowdarkActorSheet",
    "renderShadowdarkActorSheetV2",
    "renderActorSheetShadowdark"
  ];

  for (const hookName of RENDER_HOOKS) {
    Hooks.on(hookName, (app, html) => {
      injectWoundsTabSafely(app, html);
      queueMicrotask(() => injectWoundsTabSafely(app, html));
    });
  }

  function injectWoundsTabSafely(app, html) {
    try {
      injectWoundsTab(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, err);
    }
  }

  function injectWoundsTab(app, html) {
    if (game.system?.id !== "shadowdark" || !getSetting(SETTING_ENABLED, true)) return;

    const actor = app?.actor ?? app?.object;
    if (actor?.documentName !== "Actor") return;

    const root = getRootElement(html);
    if (!root?.querySelector) return;

    const sheet = getSheetForm(root) ?? root;
    const nav = sheet.querySelector?.(".SD-nav[data-group='primary'], .SD-nav");
    const content = sheet.querySelector?.(".SD-content-body");
    if (!nav || !content || !nav.querySelector('[data-tab="tab-abilities"]')) return;

    nav.querySelector(".mk-wounds-nav")?.remove();
    content.querySelector(`.${TAB_ID}`)?.remove();

    const navButton = document.createElement("a");
    navButton.className = "navigation-tab mk-wounds-nav";
    navButton.dataset.tab = TAB_ID;
    navButton.textContent = "Wounds";

    const notesTab = nav.querySelector('[data-tab="tab-notes"]');
    if (notesTab) nav.insertBefore(navButton, notesTab);
    else nav.appendChild(navButton);

    const section = document.createElement("section");
    section.className = `tab ${TAB_ID} mk-wounds-tab`;
    section.dataset.group = "primary";
    section.dataset.tab = TAB_ID;
    section.innerHTML = renderWoundsHtml(actor);
    content.appendChild(section);

    bindTabNavigation(app, nav, content, navButton, section);
    bindStatusControls(app, actor, section);

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

  function bindStatusControls(app, actor, section) {
    if (!game.user?.isGM) return;

    for (const button of section.querySelectorAll("[data-wound-location]")) {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const location = button.dataset.woundLocation;
        if (!getLocation(location)) return;

        await worsenLocationStatus(actor, location);
        rerenderWoundsSection(app, actor, section);
      });

      button.addEventListener("contextmenu", async event => {
        event.preventDefault();
        const location = button.dataset.woundLocation;
        if (!getLocation(location)) return;

        await improveLocationStatus(actor, location);
        rerenderWoundsSection(app, actor, section);
      });
    }

    section.querySelector("[data-action='roll-random-wound']")?.addEventListener("click", async event => {
      event.preventDefault();
      await rollRandomWound(actor);
      rerenderWoundsSection(app, actor, section);
    });
  }

  function rerenderWoundsSection(app, actor, section) {
    section.innerHTML = renderWoundsHtml(actor);
    bindStatusControls(app, actor, section);
  }

  function renderWoundsHtml(actor) {
    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const editable = Boolean(game.user?.isGM);

    const leftCards = LOCATIONS.filter(location => location.side === "left")
      .map(location => renderLocationCard(location, data, editable))
      .join("");
    const rightCards = LOCATIONS.filter(location => location.side === "right")
      .map(location => renderLocationCard(location, data, editable))
      .join("");

    return `
      <div class="mk-wounds-shell">
        <header class="mk-wounds-header SD-banner">
          <button type="button" class="mk-wounds-random-roll" data-action="roll-random-wound"${editable ? "" : " disabled"}>
            <i class="fa-solid fa-dice-d10"></i><span>Random Wound</span><b>2d10</b>
          </button>
        </header>

        <div class="mk-wounds-map">
          <div class="mk-wounds-location-column mk-wounds-location-column-left">${leftCards}</div>
          <div class="mk-wounds-body" aria-label="Body location status map">
            <div class="mk-wounds-body-glow"></div>
            <i class="fa-solid fa-person mk-wounds-person" aria-hidden="true"></i>
            ${LOCATIONS.map(location => renderBodyMarker(location, data, editable)).join("")}
          </div>
          <div class="mk-wounds-location-column mk-wounds-location-column-right">${rightCards}</div>
        </div>
      </div>
    `;
  }

  function renderLocationCard(location, data, editable) {
    const status = getLocationStatus(data, location.key);
    const rollResult = location.roll;
    const penalties = formatLocationPenalties(location, status);
    const action = editable ? "Left-click to worsen; right-click to improve" : "GM only";

    return `
      <button type="button" class="mk-wounds-location-card status-${status.key}" data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(status.label)}. ${action}"${editable ? "" : " disabled"}>
        <span class="mk-wounds-location-icon"><i class="${location.icon}"></i></span>
        <span class="mk-wounds-location-copy"><strong>${rollResult}. ${escapeHtml(location.label)}</strong><small>${escapeHtml(status.label)}${penalties ? ` · ${escapeHtml(penalties)}` : ""}</small></span>
      </button>
    `;
  }

  function renderBodyMarker(location, data, editable) {
    const status = getLocationStatus(data, location.key);
    const action = editable ? "Left-click to worsen; right-click to improve" : "GM only";

    return `
      <button type="button" class="mk-wounds-marker marker-${location.key} status-${status.key}" data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(status.label)}. ${action}"
        aria-label="${escapeHtml(location.label)}: ${escapeHtml(status.label)}"${editable ? "" : " disabled"}></button>
    `;
  }

  async function worsenLocationStatus(actor, location) {
    if (!game.user?.isGM || !getLocation(location)) return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const current = getLocationStatus(data, location);
    const next = STATUSES[Math.min(current.rank, STATUSES.length - 1)];
    data.locations[location] = { ...data.locations[location], status: next.key };
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
    await syncWoundPenaltyEffect(actor, data);
  }

  async function improveLocationStatus(actor, location) {
    if (!game.user?.isGM || !getLocation(location)) return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const current = getLocationStatus(data, location);
    const next = STATUSES[Math.max(current.rank - 2, 0)];
    data.locations[location] = { ...data.locations[location], status: next.key };
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
    await syncWoundPenaltyEffect(actor, data);
  }

  async function rollRandomWound(actor) {
    if (!game.user?.isGM) return;

    // Separate terms let Dice So Nice style only the severity die.
    const roll = new Roll("1d10 + 1d10");
    setSeverityDieAppearance(roll);
    await roll.evaluate();
    const [locationResult = 1, severityResult = 1] = getDieResults(roll);
    const locationRoll = Math.min(Math.max(locationResult, 1), LOCATIONS.length);
    const location = LOCATIONS.find(entry => entry.roll === locationRoll) ?? LOCATIONS[0];
    const severity = getRandomWoundSeverity(severityResult);
    await applyRandomWound(actor, location.key, severity);

    const publicMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
    await roll.toMessage(
      {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Random Wound: ${escapeHtml(actor.name)} — ${locationRoll}. ${escapeHtml(location.label)} / ${severity.label} (severity ${severityResult})`
      },
      { rollMode: publicMode }
    );

    return { roll, location, locationRoll, severityResult, severity };
  }

  function getDieResults(roll) {
    const results = [];
    for (const die of roll?.dice ?? []) {
      for (const result of die.results ?? []) {
        if (result?.active === false) continue;
        const value = Number(result?.result);
        if (Number.isFinite(value)) results.push(value);
      }
    }
    return results;
  }

  function setSeverityDieAppearance(roll) {
    if (!game.dice3d || !Array.isArray(roll?.terms)) return;

    const d10Terms = roll.terms.filter(term => Number(term?.faces) === 10);
    const severityDie = d10Terms[1];
    if (!severityDie) return;

    severityDie.options = severityDie.options ?? {};
    severityDie.options.appearance = {
      colorset: "custom",
      foreground: "#fff4f4",
      background: "#b71c1c",
      outline: "#5a0000",
      edge: "#5a0000"
    };
  }

  function getRandomWoundSeverity(severityRoll) {
    if (severityRoll >= 10) return { label: "Destroyed", status: getStatus("destroyed") };
    if (severityRoll >= 8) return { label: "Critical", status: getStatus("critical") };
    if (severityRoll >= 5) return { label: "Wounded", status: getStatus("wounded") };
    return { label: "Scratch", status: getStatus("ok") };
  }

  async function applyRandomWound(actor, location, severity) {
    if (!game.user?.isGM || !getLocation(location) || !severity?.status) return;

    // Scratches are reported in chat but never alter or accumulate against a
    // location's condition.
    if (severity.status.key === "ok") return;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const currentLocation = data.locations[location];
    const current = getLocationStatus(data, location);
    const hits = current.key === "ok" ? 0 : Number(currentLocation.hits) || 1;
    const baseRank = Math.max(current.rank, severity.status.rank);
    const nextRank = hits > 0 ? Math.min(baseRank + 1, STATUSES.length) : baseRank;
    const next = STATUSES[nextRank - 1];

    data.locations[location] = { status: next.key, hits: hits + 1 };
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
    await syncWoundPenaltyEffect(actor, data);
  }

  async function syncWoundPenaltyEffect(actor, woundData = null) {
    if (!actor?.isOwner || game.system?.id !== "shadowdark") return;

    const data = woundData ?? normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const changes = buildWoundPenaltyChanges(data);
    const existing = actor.effects?.find(effect => (
      effect.getFlag?.(MODULE_ID, EFFECT_FLAG) ?? effect.flags?.[MODULE_ID]?.[EFFECT_FLAG]
    ));

    if (!changes.length) {
      if (existing) await existing.delete();
      return;
    }

    const effectData = {
      name: "Wound Penalties",
      img: "icons/svg/blood.svg",
      changes,
      disabled: false,
      origin: actor.uuid,
      flags: { [MODULE_ID]: { [EFFECT_FLAG]: true } }
    };

    if (existing) await existing.update(effectData);
    else await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  }

  function buildWoundPenaltyChanges(data) {
    const penalties = new Map();
    const addPenalty = (ability, amount) => {
      penalties.set(ability, (penalties.get(ability) ?? 0) + amount);
    };

    for (const location of LOCATIONS) {
      const status = getLocationStatus(data, location.key);
      for (const [ability, value] of getLocationPenaltyValues(location, status)) addPenalty(ability, value);
    }

    const activeEffectMode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    return [...penalties.entries()].map(([ability, value]) => ({
      key: `system.abilities.${ability}.value`,
      value: String(value),
      mode: activeEffectMode
    }));
  }

  function getLocationPenaltyValues(location, status) {
    if (status.rank < getStatus("wounded").rank) return [];

    const penalties = [["con", -1]];
    if (status.rank < getStatus("critical").rank) return penalties;

    if (["leftHand", "rightHand", "leftFoot", "rightFoot"].includes(location.key)) {
      penalties.push(["dex", -1], ["str", -1]);
    } else if (["leftArm", "rightArm", "leftLeg", "rightLeg"].includes(location.key)) {
      penalties.push(["str", -1], ["con", -1]);
    } else if (location.key === "torso") {
      penalties.push(["con", -2]);
    } else if (location.key === "head") {
      penalties.push(["wis", -1], ["int", -1]);
    }

    return penalties;
  }

  function formatLocationPenalties(location, status) {
    const totals = new Map();
    for (const [ability, value] of getLocationPenaltyValues(location, status)) {
      totals.set(ability, (totals.get(ability) ?? 0) + value);
    }

    return [...totals.entries()]
      .map(([ability, value]) => `${value} ${ability.toUpperCase()}`)
      .join(" · ");
  }

  function normalizeData(raw) {
    const source = foundry.utils.deepClone(raw ?? {});
    const data = { version: 2, locations: {} };

    for (const location of LOCATIONS) {
      data.locations[location.key] = normalizeLocation(source.locations?.[location.key]);
    }

    // Version 1 had a separate abdomen location. Preserve its most serious
    // status when migrating to the consolidated torso location.
    const abdomen = normalizeLocation(source.locations?.abdomen);
    const torso = data.locations.torso;
    const abdomenStatus = getStatus(abdomen.status);
    const torsoStatus = getLocationStatus(data, "torso");
    data.locations.torso = {
      status: (abdomenStatus.rank > torsoStatus.rank ? abdomenStatus : torsoStatus).key,
      hits: torso.hits + abdomen.hits
    };

    return data;
  }

  function normalizeLocation(value) {
    const status = getLegacyStatus(value);
    const hits = Array.isArray(value)
      ? value.length
      : Math.max(0, Number(value?.hits) || (status.key === "ok" ? 0 : 1));

    return { status: status.key, hits };
  }

  function getLegacyStatus(value) {
    if (value && !Array.isArray(value) && typeof value === "object" && getStatus(value.status)) {
      return getStatus(value.status);
    }

    if (!Array.isArray(value) || !value.length) return STATUSES[0];

    const severityRanks = { minor: 2, moderate: 2, severe: 3, critical: 3 };
    const highestRank = value.reduce((rank, wound) => Math.max(rank, severityRanks[wound?.severity] ?? 1), 1);
    return STATUSES.find(status => status.rank === highestRank) ?? STATUSES[0];
  }

  function getLocationStatus(data, location) {
    return getStatus(data.locations?.[location]?.status) ?? STATUSES[0];
  }

  function getStatus(key) {
    return STATUSES.find(status => status.key === key) ?? null;
  }

  function getLocation(key) {
    return LOCATIONS.find(location => location.key === key) ?? null;
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
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.wounds = {
        locations: LOCATIONS.map(location => ({ ...location })),
        statuses: foundry.utils.deepClone(STATUSES),
        get: actor => normalizeData(actor?.getFlag?.(MODULE_ID, FLAG_KEY)),
        getPenaltyChanges: actor => buildWoundPenaltyChanges(normalizeData(actor?.getFlag?.(MODULE_ID, FLAG_KEY))),
        worsen: (actor, location) => worsenLocationStatus(actor, location),
        improve: (actor, location) => improveLocationStatus(actor, location),
        rollRandom: actor => rollRandomWound(actor)
      };
    }

    if (game.user?.isGM) {
      for (const actor of game.actors ?? []) {
        syncWoundPenaltyEffect(actor).catch(error => {
          console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | penalty sync error`, error);
        });
      }
    }
  });
})();
