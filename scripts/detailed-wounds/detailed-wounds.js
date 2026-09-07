import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import {
  WOUND_MIGRATION_VERSION,
  WOUND_LOCATION_RULES,
  getNextWoundSeverityRoll,
  getPreviousWoundSeverityRoll,
  getWoundLocationForRoll,
  getWoundOutcome,
  migrateLegacyWoundData,
  normalizeCurrentWoundData
} from "./detailed-wounds-migration.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Detailed Wounds";
  const SETTING_ENABLED = "detailedWoundsEnabled";
  const SETTING_MIGRATION_VERSION = "detailedWoundsMigrationVersion";
  const FLAG_KEY = "detailedWounds";
  const EFFECT_FLAG = "woundPenalties";
  const woundsWindows = new Map();

  function isPlayerActor(actor) {
    return actor?.documentName === "Actor" && actor.type === "Player";
  }

  const LOCATION_PRESENTATION = Object.freeze({
    head: { icon: "fa-solid fa-brain", side: "left" },
    rightArm: { icon: "fa-solid fa-hand-fist", side: "right" },
    leftArm: { icon: "fa-solid fa-hand-fist", side: "left" },
    body: { icon: "fa-solid fa-heart-pulse", side: "right" },
    rightLeg: { icon: "fa-solid fa-person-walking", side: "right" },
    leftLeg: { icon: "fa-solid fa-person-walking", side: "left" }
  });

  const LOCATION_ALIASES = Object.freeze({
    torso: "body",
    leftHand: "leftArm",
    rightHand: "rightArm",
    leftFoot: "leftLeg",
    rightFoot: "rightLeg"
  });

  const LOCATIONS = Object.freeze(WOUND_LOCATION_RULES.map(location => ({
    ...location,
    roll: location.rolls[0],
    rollLabel: location.rolls.length === 1
      ? String(location.rolls[0])
      : `${location.rolls[0]}-${location.rolls[location.rolls.length - 1]}`,
    ...LOCATION_PRESENTATION[location.key]
  })));

  const STATUSES = Object.freeze([
    { key: "ok", label: "OK", rank: 1 },
    { key: "wounded", label: "Wounded", rank: 2 },
    { key: "critical", label: "Critical", rank: 3 },
    { key: "destroyed", label: "Destroyed", rank: 4 }
  ]);

  const foundryApplicationApi = globalThis.foundry?.applications?.api ?? {};
  const ApplicationV2 = foundryApplicationApi.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApplicationApi.HandlebarsApplicationMixin;
  const WoundsApplicationBase = ApplicationV2 && HandlebarsApplicationMixin
    ? HandlebarsApplicationMixin(ApplicationV2)
    : class {};

  class DetailedWoundsApplication extends WoundsApplicationBase {
    static DEFAULT_OPTIONS = {
      classes: ["mk-wounds-window"],
      position: {
        width: 720,
        height: 590
      },
      window: {
        icon: "fa-solid fa-droplet",
        resizable: true
      }
    };

    static PARTS = {
      main: {
        template: `modules/${MODULE_ID}/templates/detailed-wounds.hbs`,
        scrollable: [".mk-wounds-map"]
      }
    };

    constructor(actor, options = {}) {
      super({
        ...options,
        id: `mk-detailed-wounds-${actor.id}`,
        window: {
          ...options.window,
          title: `Wounds - ${actor.name}`
        }
      });
      this.actor = actor;
    }

    async _prepareContext(options) {
      const context = typeof super._prepareContext === "function"
        ? await super._prepareContext(options)
        : {};
      return { ...context, woundsHtml: renderWoundsHtml(this.actor) };
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      bindStatusControls(this.actor, this.element, () => this.render({ force: true }));
    }

    async close(options = {}) {
      woundsWindows.delete(this.actor.uuid);
      return super.close(options);
    }
  }

  onCharacterSheetRender("Detailed Wounds", injectWoundsSummarySafely, { priority: 30 });

  function injectWoundsSummarySafely(app, html) {
    try {
      injectWoundsSummary(app, html);
    } catch (err) {
      console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | render error`, err);
    }
  }

  function injectWoundsSummary(app, html) {
    if (game.system?.id !== "shadowdark" || !getSetting(SETTING_ENABLED, true)) return;

    const actor = app?.actor ?? app?.object;
    if (!isPlayerActor(actor)) return;

    const root = getRootElement(html);
    if (!root?.querySelector) return;

    const sheet = getSheetForm(root) ?? root;
    const statsBox = sheet.querySelector?.(".tab-abilities .ability-score")?.closest?.(".SD-box");
    if (!statsBox) return;

    statsBox.parentElement?.querySelector(":scope > .mk-wounds-summary")?.remove();

    const summary = document.createElement("section");
    summary.className = "SD-box grid-colspan-2 mk-wounds-summary";
    summary.dataset.action = "open-wounds";
    summary.tabIndex = 0;
    summary.setAttribute("role", "button");
    summary.setAttribute("aria-label", `Open wounds for ${actor.name}`);
    summary.title = "Open Wounds";
    summary.innerHTML = renderWoundsSummaryHtml(actor);
    statsBox.insertAdjacentElement("afterend", summary);
    summary.addEventListener("click", event => {
      event.preventDefault();
      openWoundsApplication(actor);
    });
    summary.addEventListener("keydown", event => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      openWoundsApplication(actor);
    });
  }

  function bindStatusControls(actor, section, rerender) {
    if (!game.user?.isGM) return;

    for (const button of section.querySelectorAll("[data-wound-location]")) {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const location = button.dataset.woundLocation;
        if (!getLocation(location)) return;

        await worsenLocationStatus(actor, location);
        rerender();
      });

      button.addEventListener("contextmenu", async event => {
        event.preventDefault();
        const location = button.dataset.woundLocation;
        if (!getLocation(location)) return;

        await improveLocationStatus(actor, location);
        rerender();
      });
    }

    section.querySelector("[data-action='roll-random-wound']")?.addEventListener("click", async event => {
      event.preventDefault();
      await rollRandomWound(actor);
      rerender();
    });
  }

  function openWoundsApplication(actor) {
    if (!ApplicationV2 || !HandlebarsApplicationMixin) {
      ui.notifications?.error?.("Foundry ApplicationV2 is unavailable; the Wounds screen cannot open.");
      return null;
    }

    let application = woundsWindows.get(actor.uuid);
    if (!application) {
      application = new DetailedWoundsApplication(actor);
      woundsWindows.set(actor.uuid, application);
    }
    application.render({ force: true });
    return application;
  }

  function renderWoundsSummaryHtml(actor) {
    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const activeWounds = LOCATIONS
      .map(location => ({
        location,
        wound: getLocationEntry(data, location.key),
        status: getLocationStatus(data, location.key)
      }))
      .filter(entry => isActiveWound(entry.wound));

    const entries = activeWounds.length
      ? activeWounds.map(({ location, wound, status }) => {
        const outcome = getStoredWoundOutcome(location.key, wound);
        const label = outcome?.label ?? status.label;
        return `
          <span class="mk-wounds-summary-entry status-${status.key}">
            <i class="${location.icon}" aria-hidden="true"></i>
            <span>${escapeHtml(location.label)}<small>${escapeHtml(label)}</small></span>
          </span>
        `;
      }).join("")
      : '<span class="mk-wounds-summary-empty">No active wounds</span>';

    return `
      <div class="header mk-wounds-summary-header">
        <label>Wounds</label>
        <span>
          <i class="fa-solid fa-up-right-from-square" aria-hidden="true"></i>
        </span>
      </div>
      <div class="content mk-wounds-summary-list">${entries}</div>
    `;
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
          <p class="mk-wounds-rules-note">Location d10: 1 Head · 2-3 Right Arm · 4-5 Left Arm · 6-8 Body · 9 Right Leg · 10 Left Leg. Roll a second d10 on that location's severity table.</p>
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
    const wound = getLocationEntry(data, location.key);
    const outcome = getStoredWoundOutcome(location.key, wound);
    const resultLabel = outcome?.label ?? status.label;
    const consequence = formatWoundDetails(outcome, wound);
    const penalties = formatLocationPenalties(location, wound);
    const action = editable ? "Left-click to worsen; right-click to improve" : "GM only";

    return `
      <button type="button" class="mk-wounds-location-card status-${status.key}" data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(resultLabel)}. ${escapeHtml(consequence)} ${action}"${editable ? "" : " disabled"}>
        <span class="mk-wounds-location-icon"><i class="${location.icon}"></i></span>
        <span class="mk-wounds-location-copy">
          <strong>${escapeHtml(location.rollLabel)}. ${escapeHtml(location.label)}</strong>
          <small>${escapeHtml(resultLabel)}${penalties ? ` · ${escapeHtml(penalties)}` : ""}</small>
          <em>${escapeHtml(consequence)}</em>
        </span>
      </button>
    `;
  }

  function renderBodyMarker(location, data, editable) {
    const status = getLocationStatus(data, location.key);
    const wound = getLocationEntry(data, location.key);
    const outcome = getStoredWoundOutcome(location.key, wound);
    const resultLabel = outcome?.label ?? status.label;
    const action = editable ? "Left-click to worsen; right-click to improve" : "GM only";

    return `
      <button type="button" class="mk-wounds-marker marker-${location.key} status-${status.key}" data-wound-location="${location.key}"
        title="${escapeHtml(location.label)}: ${escapeHtml(resultLabel)}. ${escapeHtml(formatWoundDetails(outcome, wound))} ${action}"
        aria-label="${escapeHtml(location.label)}: ${escapeHtml(resultLabel)}"${editable ? "" : " disabled"}></button>
    `;
  }

  async function worsenLocationStatus(actor, location) {
    const resolvedLocation = getLocation(location);
    if (!game.user?.isGM || !isPlayerActor(actor) || !resolvedLocation) return;
    const locationKey = resolvedLocation.key;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const current = getLocationEntry(data, locationKey);
    const nextSeverity = getNextWoundSeverityRoll(Number(current.severityRoll) || minimumSeverityForStatus(current.status));
    await setWoundResult(actor, locationKey, nextSeverity, data, true);
  }

  async function improveLocationStatus(actor, location) {
    const resolvedLocation = getLocation(location);
    if (!game.user?.isGM || !isPlayerActor(actor) || !resolvedLocation) return;
    const locationKey = resolvedLocation.key;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const current = getLocationEntry(data, locationKey);
    const nextSeverity = getPreviousWoundSeverityRoll(Number(current.severityRoll) || 0);
    data.locations[locationKey] = nextSeverity > 0
      ? await createWoundEntry(locationKey, nextSeverity, Number(current.hits) || 1)
      : createEmptyWoundEntry();
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
    await syncWoundPenaltyEffect(actor, data);
  }

  async function rollRandomWound(actor) {
    if (!game.user?.isGM || !isPlayerActor(actor)) return;

    // Separate terms let Dice So Nice style only the severity die.
    const roll = new Roll("1d10 + 1d10");
    setSeverityDieAppearance(roll);
    await roll.evaluate();
    const [locationResult = 1, severityResult = 1] = getDieResults(roll);
    const locationRoll = Math.min(Math.max(locationResult, 1), 10);
    const locationRule = getWoundLocationForRoll(locationRoll);
    const location = getLocation(locationRule.key) ?? LOCATIONS[0];
    const severity = getRandomWoundSeverity(location.key, severityResult);
    const applied = await applyRandomWound(actor, location.key, severity);
    const appliedOutcome = applied?.outcome ?? severity.outcome;
    const appliedEntry = applied?.entry ?? null;
    const resultDetails = formatWoundDetails(appliedOutcome, appliedEntry);

    const publicMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
    await roll.toMessage(
      {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Random Wound: ${escapeHtml(actor.name)} - ${locationRoll}. ${escapeHtml(location.label)} / ${escapeHtml(appliedOutcome?.label ?? severity.label)} (severity ${severityResult})${resultDetails ? `: ${escapeHtml(resultDetails)}` : ""}`
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

  function getRandomWoundSeverity(location, severityRoll) {
    const outcome = getWoundOutcome(location, severityRoll);
    return {
      label: outcome?.label ?? "Scar",
      status: getStatus(outcome?.status ?? "ok"),
      outcome,
      severityRoll: Math.min(Math.max(Math.floor(Number(severityRoll) || 1), 1), 10)
    };
  }

  async function applyRandomWound(actor, location, severity) {
    const resolvedLocation = getLocation(location);
    if (!game.user?.isGM || !isPlayerActor(actor) || !resolvedLocation || !severity?.outcome) return null;
    const locationKey = resolvedLocation.key;

    const data = normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const currentLocation = data.locations[locationKey];
    const currentSeverity = Number(currentLocation?.severityRoll) || minimumSeverityForStatus(currentLocation?.status);
    const currentOutcome = getStoredWoundOutcome(locationKey, currentLocation);
    const currentIsActive = isActiveWound(currentLocation) && currentOutcome?.key !== "scar";
    const rolledSeverity = severity.severityRoll;

    if (currentIsActive && rolledSeverity <= 2 && currentOutcome) {
      return { entry: currentLocation, outcome: currentOutcome };
    }

    // A new injury can worsen an existing location, but a scar cannot erase a
    // wound that is already recorded there.
    const nextSeverity = currentIsActive && rolledSeverity <= 2
      ? currentSeverity
      : currentIsActive
        ? Math.max(rolledSeverity, getNextWoundSeverityRoll(currentSeverity))
        : rolledSeverity;
    const hits = Math.max(0, Number(currentLocation?.hits) || 0) + 1;
    const result = await setWoundResult(actor, locationKey, nextSeverity, data, true, hits);
    return result;
  }

  async function setWoundResult(actor, location, severityRoll, data, resolveConsequences = false, hitCount = null) {
    const outcome = getWoundOutcome(location, severityRoll);
    if (!outcome) return null;

    const current = data.locations[location] ?? createEmptyWoundEntry();
    const hits = hitCount === null
      ? Math.max(1, Number(current.hits) || 0)
      : Math.max(1, Number(hitCount) || 1);
    const entry = await createWoundEntry(location, severityRoll, hits);
    data.locations[location] = entry;
    await actor.setFlag(MODULE_ID, FLAG_KEY, data);
    await syncWoundPenaltyEffect(actor, data);

    if (resolveConsequences) await resolveWoundConsequences(actor, location, entry, outcome, data);
    return { entry, outcome };
  }

  async function createWoundEntry(location, severityRoll, hits) {
    const roll = Math.min(Math.max(Math.floor(Number(severityRoll) || 1), 1), 10);
    const outcome = getWoundOutcome(location, roll);
    const entry = {
      status: outcome?.status ?? "ok",
      hits: Math.max(1, Number(hits) || 1),
      severityRoll: roll,
      resultKey: outcome?.key ?? null
    };

    if (outcome?.durationFormula) {
      const durationRoll = new Roll(outcome.durationFormula);
      await durationRoll.evaluate();
      entry.durationValue = Number(durationRoll.total) || 0;
    }

    return entry;
  }

  function createEmptyWoundEntry() {
    return { status: "ok", hits: 0, severityRoll: 0, resultKey: null };
  }

  async function resolveWoundConsequences(actor, location, entry, outcome, data) {
    if (outcome?.prone) await applyConfiguredStatus(actor, "prone");

    let died = Boolean(outcome?.fatal);
    if (outcome?.save?.dc) {
      const save = await rollConstitutionSave(actor, outcome.save.dc);
      entry.saveTotal = save.total;
      entry.saveSuccess = save.success;
      data.locations[location] = entry;
      await actor.setFlag(MODULE_ID, FLAG_KEY, data);
      died = !save.success;
    }

    if (died) await markActorDead(actor);
  }

  async function rollConstitutionSave(actor, dc) {
    const modifier = getConstitutionModifier(actor);
    const formula = `1d20${modifier >= 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`}`;
    const roll = new Roll(formula);
    await roll.evaluate();
    const total = Number(roll.total) || 0;
    const success = total >= dc;
    const publicMode = globalThis.CONST?.DICE_ROLL_MODES?.PUBLIC ?? "publicroll";
    await roll.toMessage(
      {
        speaker: ChatMessage.getSpeaker({ actor }),
        flavor: `Heart wound: ${escapeHtml(actor.name)} rolls CON ${total} vs DC ${dc} - ${success ? "Success" : "Failure"}`
      },
      { rollMode: publicMode }
    );
    return { total, success };
  }

  function getConstitutionModifier(actor) {
    const paths = [
      "system.abilities.con.mod",
      "system.abilities.con.modifier",
      "system.abilities.con.bonus",
      "system.attributes.con.mod",
      "system.con.mod",
      "system.conMod"
    ];
    for (const path of paths) {
      const value = getProperty(actor, path);
      if (Number.isFinite(Number(value))) return Number(value);
    }

    const scorePaths = [
      "system.abilities.con.value",
      "system.abilities.con.score",
      "system.attributes.con.value",
      "system.con.value"
    ];
    for (const path of scorePaths) {
      const score = Number(getProperty(actor, path));
      if (Number.isFinite(score)) return Math.floor((score - 10) / 2);
    }
    return 0;
  }

  function getProperty(object, path) {
    const utility = globalThis.foundry?.utils?.getProperty;
    if (typeof utility === "function") return utility(object, path);
    return String(path).split(".").reduce((value, key) => value?.[key], object);
  }

  async function applyConfiguredStatus(actor, preferredId) {
    if (typeof actor?.toggleStatusEffect !== "function") return false;
    const specialStatuses = globalThis.CONFIG?.specialStatusEffects ?? {};
    const fallbackId = specialStatuses[String(preferredId).toUpperCase()] ?? preferredId;
    const configured = (globalThis.CONFIG?.statusEffects ?? []).find(status => (
      status.id === fallbackId || (preferredId === "dead" && status.id === "dead")
    ));
    const statusId = configured?.id ?? fallbackId;
    if (!configured?.id && !statusId) return false;
    await actor.toggleStatusEffect(statusId, { active: true, overlay: false });
    return true;
  }

  async function markActorDead(actor) {
    const marked = await applyConfiguredStatus(actor, "dead");
    if (!marked) globalThis.ui?.notifications?.warn?.("The wound was fatal, but the Dead status could not be applied automatically.");
    return marked;
  }

  async function syncWoundPenaltyEffect(actor, woundData = null) {
    if (!actor?.isOwner || game.system?.id !== "shadowdark") return;

    const existing = actor.effects?.find(effect => (
      effect.getFlag?.(MODULE_ID, EFFECT_FLAG) ?? effect.flags?.[MODULE_ID]?.[EFFECT_FLAG]
    ));
    if (!isPlayerActor(actor)) {
      if (existing) await existing.delete();
      return;
    }

    const data = woundData ?? normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY));
    const changes = buildWoundPenaltyChanges(data);

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
      const wound = getLocationEntry(data, location.key);
      for (const [ability, value] of getLocationPenaltyValues(location, wound)) addPenalty(ability, value);
    }

    const activeEffectMode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    return [...penalties.entries()].map(([ability, value]) => ({
      key: `system.abilities.${ability}.value`,
      value: String(value),
      mode: activeEffectMode
    }));
  }

  function getLocationPenaltyValues(location, wound) {
    const outcome = getStoredWoundOutcome(location.key, wound);
    if (outcome?.changes) return outcome.changes.map(([ability, value]) => [ability, value]);
    if (!wound?.legacy) return [];

    // Preserve the penalty behavior of records created by the previous
    // ten-location implementation until the GM edits or clears them.
    const status = getStatus(wound.status) ?? STATUSES[0];
    if (status.rank < getStatus("wounded").rank) return [];

    const penalties = [["con", -1]];
    if (status.rank < getStatus("critical").rank) return penalties;

    if (["leftArm", "rightArm", "leftLeg", "rightLeg"].includes(location.key)) {
      penalties.push(["str", -1], ["con", -1]);
    } else if (location.key === "body") {
      penalties.push(["con", -2]);
    } else if (location.key === "head") {
      penalties.push(["wis", -1], ["int", -1]);
    }

    return penalties;
  }

  function formatLocationPenalties(location, wound) {
    const totals = new Map();
    for (const [ability, value] of getLocationPenaltyValues(location, wound)) {
      totals.set(ability, (totals.get(ability) ?? 0) + value);
    }

    return [...totals.entries()]
      .map(([ability, value]) => `${value} ${ability.toUpperCase()}`)
      .join(" · ");
  }

  function getLocationEntry(data, location) {
    return data.locations?.[location] ?? createEmptyWoundEntry();
  }

  function getStoredWoundOutcome(location, wound) {
    if (!wound || Number(wound.severityRoll) <= 0) return null;
    const outcome = getWoundOutcome(location, wound.severityRoll);
    if (!outcome) return null;
    return !wound.resultKey || wound.resultKey === outcome.key ? outcome : null;
  }

  function isActiveWound(wound) {
    if (!wound) return false;
    if (wound.resultKey && wound.resultKey !== "scar") return true;
    return getStatus(wound.status)?.key !== "ok";
  }

  function minimumSeverityForStatus(statusKey) {
    if (statusKey === "destroyed") return 10;
    if (statusKey === "critical") return 9;
    if (statusKey === "wounded") return 3;
    return 0;
  }

  function formatWoundDetails(outcome, wound) {
    if (!outcome) {
      return isActiveWound(wound)
        ? `${getStatus(wound?.status)?.label ?? "Wound"} (legacy record)`
        : "No wound recorded.";
    }

    let details = outcome.consequence ?? outcome.label;
    if (outcome.durationFormula && Number(wound?.durationValue) > 0) {
      details += ` Rolled ${wound.durationValue} ${outcome.durationUnit}.`;
    }
    if (outcome.save && Number.isFinite(Number(wound?.saveTotal))) {
      details += ` Save ${wound.saveTotal}: ${wound.saveSuccess ? "success" : "failure"}.`;
    }
    return details;
  }

  function normalizeData(raw) {
    return normalizeCurrentWoundData(raw);
  }

  function getLocationStatus(data, location) {
    return getStatus(data.locations?.[location]?.status) ?? STATUSES[0];
  }

  function getStatus(key) {
    return STATUSES.find(status => status.key === key) ?? null;
  }

  function getLocation(key) {
    const canonicalKey = LOCATION_ALIASES[key] ?? key;
    return LOCATIONS.find(location => location.key === canonicalKey) ?? null;
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

  function isMigrationAuthority() {
    const activeGms = (game.users ?? [])
      .filter(user => user.active && user.isGM)
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const authority = activeGms[0];
    return authority ? game.user?.id === authority.id : game.user?.isGM === true;
  }

  async function migrateDetailedWounds() {
    if (!isMigrationAuthority()) return { migrated: 0, errors: 0, skipped: true };

    const currentVersion = Number(getSetting(SETTING_MIGRATION_VERSION, 0)) || 0;
    if (currentVersion >= WOUND_MIGRATION_VERSION) {
      return { migrated: 0, errors: 0, skipped: true };
    }

    let migrated = 0;
    let errors = 0;

    for (const actor of game.actors ?? []) {
      try {
        if (!isPlayerActor(actor)) {
          await syncWoundPenaltyEffect(actor);
          continue;
        }

        const raw = actor.getFlag(MODULE_ID, FLAG_KEY);
        const { data, needsWrite } = migrateLegacyWoundData(raw);
        const hasStoredData = raw !== undefined && raw !== null;

        if (hasStoredData && needsWrite) {
          await actor.setFlag(MODULE_ID, FLAG_KEY, data);
          migrated += 1;
        }

        await syncWoundPenaltyEffect(actor, data);
      } catch (error) {
        errors += 1;
        console.error(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} | migration error`, actor?.name, error);
      }
    }

    if (errors === 0) {
      await game.settings.set(MODULE_ID, SETTING_MIGRATION_VERSION, WOUND_MIGRATION_VERSION);
      if (migrated > 0) log(`migrated ${migrated} actor wound record(s)`);
    }

    return { migrated, errors, skipped: false };
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

  Hooks.once("ready", async () => {
    await migrateDetailedWounds();

    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = mod.api ?? {};
      mod.api.wounds = {
        locations: LOCATIONS.map(location => ({ ...location })),
        statuses: globalThis.foundry?.utils?.deepClone?.(STATUSES) ?? STATUSES.map(status => ({ ...status })),
        getOutcome: (location, severityRoll) => getWoundOutcome(LOCATION_ALIASES[location] ?? location, severityRoll),
        get: actor => isPlayerActor(actor) ? normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY)) : null,
        getPenaltyChanges: actor => isPlayerActor(actor)
          ? buildWoundPenaltyChanges(normalizeData(actor.getFlag(MODULE_ID, FLAG_KEY)))
          : [],
        worsen: (actor, location) => worsenLocationStatus(actor, location),
        improve: (actor, location) => improveLocationStatus(actor, location),
        rollRandom: actor => rollRandomWound(actor),
        open: actor => isPlayerActor(actor) ? openWoundsApplication(actor) : null,
        migrateLegacyData: () => migrateDetailedWounds()
      };
    }
  });
})();
