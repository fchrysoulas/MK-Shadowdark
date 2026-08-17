import {
  DEFAULT_PROFILES,
  MODULE_ID,
  SETTINGS,
  WRAPPED_TIME_PASSES,
} from "./constants.js";
import {
  activeGmIds,
  availableRollTables,
  deepClone,
  error,
  escapeHtml,
  getProfile,
  getProfiles,
  getSceneEncounterContext,
  log,
  normalizeProfiles,
  readDialogForm,
  renderGroupedOptions,
  setSceneEncounterContext,
  setting,
  terrainNames,
  warn,
} from "./helpers.js";
import {
  createEncounterServiceApi,
  checkEncounterService,
  resolveEncounterService,
} from "./service.js";
import {
  bindEncounterCard,
  createEncounterMessage,
  renderEncounterCard,
  rerollEncounterField,
  rerollEntireEncounter,
} from "./chat.js";

function playerActors() {
  return Array.from(game.actors ?? [])
    .filter(actor => actor.type === "Player")
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function selectedPlayerActorUuid(options = {}) {
  if (options.reactionActorUuid) return String(options.reactionActorUuid);
  const controlled = globalThis.canvas?.tokens?.controlled ?? [];
  const actor = controlled.find(token => token.actor?.type === "Player")?.actor;
  return actor?.uuid ?? "";
}

function awarenessOptions(profile, selected = "determine") {
  const options = profile.awareness?.options ?? DEFAULT_PROFILES.default.awareness.options;
  return Object.entries(options).map(([value, label]) => `
    <option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>
  `).join("");
}

function dangerLevelOptions(profile, selected = "unsafe") {
  return Object.entries(profile.dangerLevels ?? DEFAULT_PROFILES.default.dangerLevels).map(([id, data]) => `
    <option value="${escapeHtml(id)}" ${id === selected ? "selected" : ""}>
      ${escapeHtml(data.label ?? id)} - every ${Number(data.interval ?? 1)} ${Number(data.interval ?? 1) === 1 ? "round/hour" : "rounds/hours"}
    </option>
  `).join("");
}

function reactionActorOptions(selectedUuid = "") {
  const empty = `<option value="" ${selectedUuid ? "" : "selected"}>No CHA modifier</option>`;
  return empty + playerActors().map(actor => `
    <option value="${escapeHtml(actor.uuid)}" ${actor.uuid === selectedUuid ? "selected" : ""}>
      ${escapeHtml(actor.name)} (${Number(actor.system?.abilities?.cha?.mod ?? 0) >= 0 ? "+" : ""}${Number(actor.system?.abilities?.cha?.mod ?? 0)} CHA)
    </option>
  `).join("");
}

export async function openEncounterDialog(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can resolve an encounter.");
    return null;
  }

  if (!setting(SETTINGS.enabled, true)) {
    ui.notifications.warn("The MK-Shadowdark Encounter Engine is disabled.");
    return null;
  }

  const profiles = getProfiles();
  const sceneContext = getSceneEncounterContext();
  const initialProfile = getProfile(options.profileId ?? sceneContext.profileId, profiles);
  const tables = await availableRollTables();

  const profileOptions = Object.entries(profiles).map(([id, profile]) => `
    <option value="${escapeHtml(id)}" ${id === initialProfile.id ? "selected" : ""}>
      ${escapeHtml(profile.name ?? id)}
    </option>
  `).join("");

  const initialTerrain = String(options.terrain ?? sceneContext.terrain ?? initialProfile.data.defaultTerrain ?? "Default");
  const allTerrains = [...new Set(Object.values(profiles).flatMap(profile => terrainNames(profile)))];
  const terrainOptions = allTerrains.map(name => `
    <option value="${escapeHtml(name)}" ${name === initialTerrain ? "selected" : ""}>
      ${escapeHtml(name)}
    </option>
  `).join("");

  const selectedDanger = String(options.dangerLevel ?? sceneContext.dangerLevel ?? initialProfile.data.defaultDangerLevel ?? "unsafe");
  const selectedPeriod = String(options.period ?? sceneContext.period ?? "auto");
  const selectedTable = String(options.tableUuid ?? sceneContext.tableUuid ?? "");
  const selectedAwareness = String(options.awareness ?? initialProfile.data.awareness?.default ?? "determine");
  const selectedReactionActor = selectedPlayerActorUuid(options);
  const selectedReactionMode = String(options.reactionMode ?? "roll");
  const intentEnabled = Boolean(options.rollIntent ?? initialProfile.data.optionalProcedures?.intent ?? false);

  const content = `
    <form class="mk-sd-encounter-dialog">
      <p class="notes">Uses the Shadowdark random encounter procedure. Check Encounter rolls for occurrence; Resolve Now skips that check.</p>

      <div class="form-group">
        <label>Profile</label>
        <select name="profileId">${profileOptions}</select>
      </div>

      <div class="form-group">
        <label>Terrain</label>
        <select name="terrain">${terrainOptions}</select>
      </div>

      <div class="form-group">
        <label>Danger Level</label>
        <select name="dangerLevel">${dangerLevelOptions(initialProfile.data, selectedDanger)}</select>
        <p class="hint">Unsafe checks every 3 rounds/hours, Risky every 2, Deadly every round/hour.</p>
      </div>

      <div class="form-group">
        <label>Time of Day</label>
        <select name="period">
          <option value="auto" ${selectedPeriod === "auto" ? "selected" : ""}>Automatic from world time</option>
          <option value="day" ${selectedPeriod === "day" ? "selected" : ""}>Day</option>
          <option value="night" ${selectedPeriod === "night" ? "selected" : ""}>Night</option>
        </select>
      </div>

      <div class="form-group">
        <label>Encounter Table Override</label>
        <select name="tableUuid">${renderGroupedOptions(tables, selectedTable)}</select>
        <p class="hint">Leave automatic to use the profile terrain and time table.</p>
      </div>

      <div class="form-group">
        <label>Awareness</label>
        <select name="awareness">${awarenessOptions(initialProfile.data, selectedAwareness)}</select>
        <p class="hint">Shadowdark surprise follows the fiction and detection checks rather than a random surprise die.</p>
      </div>

      <div class="form-group">
        <label>Reaction</label>
        <select name="reactionMode">
          <option value="roll" ${selectedReactionMode === "roll" ? "selected" : ""}>Roll if attitude is unclear</option>
          <option value="hostile" ${selectedReactionMode === "hostile" ? "selected" : ""}>Attitude already hostile</option>
          <option value="skip" ${selectedReactionMode === "skip" ? "selected" : ""}>Do not determine reaction</option>
        </select>
      </div>

      <div class="form-group">
        <label>Interacting Character</label>
        <select name="reactionActorUuid">${reactionActorOptions(selectedReactionActor)}</select>
        <p class="hint">Selecting a character adds their CHA modifier and means they reveal their presence and position.</p>
      </div>

      <div class="form-group">
        <label>Expanded Intent Roll</label>
        <input type="checkbox" name="rollIntent" ${intentEnabled ? "checked" : ""}>
        <p class="hint">Intent is optional and is not part of the core Shadowdark encounter procedure.</p>
      </div>

      <div class="form-group">
        <label>Remember Profile, Terrain, Danger and Time for this Scene</label>
        <input type="checkbox" name="rememberScene" ${options.rememberScene === false ? "" : "checked"}>
      </div>
    </form>
  `;

  const readOptions = async html => {
    const form = readDialogForm(html);
    const context = {
      profileId: String(form.profileId ?? initialProfile.id),
      terrain: String(form.terrain ?? initialTerrain),
      dangerLevel: String(form.dangerLevel ?? selectedDanger),
      period: String(form.period ?? selectedPeriod),
      tableUuid: String(form.tableUuid ?? ""),
    };
    if (form.rememberScene) await setSceneEncounterContext(context);
    return {
      ...options,
      ...context,
      awareness: String(form.awareness ?? selectedAwareness),
      reactionMode: String(form.reactionMode ?? "roll"),
      reactionActorUuid: String(form.reactionActorUuid ?? ""),
      addReactionCha: Boolean(form.reactionActorUuid),
      rollIntent: Boolean(form.rollIntent),
      promptIfMissing: false,
    };
  };

  return Dialog.wait({
    title: "MK-Shadowdark Encounter Engine",
    content,
    buttons: {
      check: {
        icon: '<i class="fas fa-dice-one"></i>',
        label: "Check Encounter",
        callback: async html => checkEncounter(await readOptions(html)),
      },
      resolve: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Resolve Now",
        callback: async html => resolveEncounter(await readOptions(html)),
      },
      profiles: {
        icon: '<i class="fas fa-sliders"></i>',
        label: "Edit Profiles",
        callback: () => configureProfiles(),
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "check",
    close: () => null,
  }, { width: 680 });
}

export async function configureProfiles() {
  if (!game.user?.isGM) return null;

  const current = JSON.stringify(getProfiles(), null, 2);
  const content = `
    <form class="mk-sd-encounter-profiles-dialog">
      <p class="notes">Profiles are world-level JSON. The default profile uses the Shadowdark procedure; optional intent and surprise dice can be enabled for expanded profiles.</p>
      <textarea name="profiles" spellcheck="false">${escapeHtml(current)}</textarea>
    </form>
  `;

  return Dialog.wait({
    title: "Encounter Profiles",
    content,
    buttons: {
      save: {
        icon: '<i class="fas fa-save"></i>',
        label: "Save Profiles",
        callback: async html => {
          const form = readDialogForm(html);
          const text = String(form.profiles ?? "").trim();
          let parsed;
          try {
            parsed = JSON.parse(text);
            normalizeProfiles(parsed);
          } catch (parseError) {
            ui.notifications.error(`Encounter Profiles JSON is invalid: ${parseError.message}`);
            throw parseError;
          }

          await game.settings.set(MODULE_ID, SETTINGS.profiles, JSON.stringify(parsed, null, 2));
          ui.notifications.info("Encounter Profiles saved.");
          return parsed;
        },
      },
      reset: {
        icon: '<i class="fas fa-rotate-left"></i>',
        label: "Reset Shadowdark Defaults",
        callback: async () => {
          const defaults = JSON.stringify(DEFAULT_PROFILES, null, 2);
          await game.settings.set(MODULE_ID, SETTINGS.profiles, defaults);
          ui.notifications.info("Encounter Profiles reset to Shadowdark defaults.");
          return deepClone(DEFAULT_PROFILES);
        },
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: "Cancel",
        callback: () => null,
      },
    },
    default: "save",
    close: () => null,
  }, {
    width: 800,
    height: 720,
    resizable: true,
  });
}

async function createEncounterCheckMessage(check) {
  const whisper = setting(SETTINGS.whisper, true) ? activeGmIds() : [];
  const result = check.isEncounter ? "Encounter" : "No encounter";
  const intervalLabel = `${check.interval} ${check.interval === 1 ? "round/hour" : "rounds/hours"}`;
  const content = `
    <section class="mk-sd-encounter-card is-gm">
      <header class="mk-sd-encounter-header">
        <div><span class="mk-sd-encounter-kicker">Random Encounter Check</span><h3>${escapeHtml(result)}</h3></div>
      </header>
      <div class="mk-sd-encounter-grid">
        <div class="mk-sd-encounter-row">
          <span class="mk-sd-encounter-label">Danger</span>
          <span class="mk-sd-encounter-value">${escapeHtml(check.label)}<small>Check every ${escapeHtml(intervalLabel)}</small></span>
        </div>
        <div class="mk-sd-encounter-row">
          <span class="mk-sd-encounter-label">Roll</span>
          <span class="mk-sd-encounter-value">${escapeHtml(`${check.total} on ${check.formula}`)}<small>Encounter on ${escapeHtml(check.encounterOn.join(", "))}</small></span>
        </div>
      </div>
    </section>
  `;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? globalThis.CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
    content,
    whisper,
  });
}

export async function checkEncounter(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can check for an encounter.");
    return null;
  }

  if (!setting(SETTINGS.enabled, true)) return null;

  const serviceResult = await checkEncounterService({
    ...options,
    user: game.user,
  });
  if (!serviceResult.check) return null;

  const message = await createEncounterCheckMessage(serviceResult.check);
  if (!serviceResult.isEncounter) {
    return {
      check: serviceResult.check,
      message,
      encounter: null,
      context: serviceResult.context,
    };
  }

  const encounter = await resolveEncounter({
    ...options,
    dangerLevel: serviceResult.check.dangerLevel,
    source: options.source ?? "encounterCheck",
  });

  return {
    check: serviceResult.check,
    message,
    encounter,
    context: serviceResult.context,
  };
}

export async function resolveEncounter(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can resolve an encounter.");
    return null;
  }

  if (!setting(SETTINGS.enabled, true)) return null;

  const serviceResult = await resolveEncounterService({
    ...options,
    user: game.user,
  });

  if (serviceResult.reason) {
    if (serviceResult.reason === "missing-table") {
      if (options.promptIfMissing !== false) {
        const context = serviceResult.context ?? {};
        return openEncounterDialog({
          ...options,
          profileId: context.profileId,
          terrain: context.terrain,
          dangerLevel: context.dangerLevel,
          period: context.requestedPeriod,
        });
      }
      ui.notifications.warn("No encounter RollTable is configured for this profile, terrain, and time.");
      return null;
    }

    if (serviceResult.reason === "invalid-table") {
      ui.notifications.error(`Encounter RollTable could not be resolved: ${serviceResult.context?.tableUuid ?? ""}`);
      return null;
    }

    if (serviceResult.reason === "empty-table") {
      ui.notifications.warn(`The encounter table ${serviceResult.context?.tableUuid ?? ""} returned no result.`);
      return null;
    }

    return null;
  }

  const data = serviceResult.encounter;
  if (!data) return null;

  const message = await createEncounterMessage(data, { whisper: options.whisper });
  return {
    data,
    message,
    context: serviceResult.context,
  };
}

let sceneControlDialogPromise = null;

function openEncounterDialogFromSceneControl(active = true) {
  if (active === false || sceneControlDialogPromise) return sceneControlDialogPromise;

  sceneControlDialogPromise = Promise.resolve(openEncounterDialog()).finally(() => {
    sceneControlDialogPromise = null;
  });
  return sceneControlDialogPromise;
}

function addSceneControl(controls) {
  if (!game.user?.isGM || !setting(SETTINGS.enabled, true)) return;

  const tool = {
    name: "mkEncounterEngine",
    title: "MK-Shadowdark Encounter Engine",
    icon: "fas fa-dice-d20",
    button: true,
    visible: true,
    onClick: () => openEncounterDialogFromSceneControl(),
    onChange: active => openEncounterDialogFromSceneControl(active),
  };

  if (Array.isArray(controls)) {
    const tokens = controls.find(control => ["token", "tokens"].includes(control.name));
    if (tokens && Array.isArray(tokens.tools) && !tokens.tools.some(existing => existing.name === tool.name)) {
      tokens.tools.push(tool);
    }
    return;
  }

  const tokenControl = controls?.tokens ?? controls?.token;
  if (!tokenControl) return;

  if (Array.isArray(tokenControl.tools)) {
    if (!tokenControl.tools.some(existing => existing.name === tool.name)) tokenControl.tools.push(tool);
    return;
  }

  tokenControl.tools ??= {};
  tokenControl.tools[tool.name] = tool;
}

function addRollTableContextOptions(_html, options) {
  if (!Array.isArray(options)) return;

  options.push({
    name: "MK-Shadowdark: Resolve Encounter",
    icon: '<i class="fas fa-dice-d20"></i>',
    condition: () => game.user?.isGM && setting(SETTINGS.enabled, true),
    callback: async target => {
      const element = target?.[0] ?? target;
      const id = element?.dataset?.entryId ?? element?.dataset?.documentId ?? element?.closest?.("[data-entry-id]")?.dataset?.entryId;
      const table = game.tables?.get(id);
      if (table) await resolveEncounter({ tableUuid: table.uuid, promptIfMissing: false });
    },
  });
}

function installTimePassesIntegration() {
  if (!setting(SETTINGS.autoTimePasses, true)) return;

  const module = game.modules?.get(MODULE_ID);
  const timePassesApi = module?.api?.timePasses;
  if (!timePassesApi || typeof timePassesApi.timePasses !== "function") {
    warn("Time Passes API was not found. Automatic encounter integration was not installed.");
    return;
  }

  if (timePassesApi.timePasses[WRAPPED_TIME_PASSES]) return;

  const original = timePassesApi.timePasses.bind(timePassesApi);
  const wrapped = async (...args) => {
    const result = await original(...args);
    if (result?.isEncounter && setting(SETTINGS.enabled, true) && setting(SETTINGS.autoTimePasses, true)) {
      try {
        const encounterResolution = await resolveEncounter({ source: "timePasses", promptIfMissing: true });
        return { ...result, encounterResolution };
      } catch (integrationError) {
        error("Time Passes encounter resolution failed", integrationError);
        ui.notifications.error(`Encounter Engine failed: ${integrationError.message}`);
      }
    }
    return result;
  };

  wrapped[WRAPPED_TIME_PASSES] = true;
  wrapped.original = original;
  timePassesApi.timePasses = wrapped;
  log("Time Passes integration installed.");
}

function exposeApi() {
  const module = game.modules?.get(MODULE_ID);
  if (!module) return;

  module.api ??= {};
  const service = createEncounterServiceApi();
  module.api.encounterService = service;
  module.api.encounters = {
    version: 2,
    service,
    check: checkEncounter,
    resolve: resolveEncounter,
    openDialog: openEncounterDialog,
    configureProfiles,
    getProfiles,
    getSceneContext: getSceneEncounterContext,
    setSceneContext: setSceneEncounterContext,
    rerollField: rerollEncounterField,
    rerollAll: rerollEntireEncounter,
    renderCard: renderEncounterCard,
    defaults: () => deepClone(DEFAULT_PROFILES),
  };

  game.mkShadowdark ??= {};
  game.mkShadowdark.encounterService = service;
  game.mkShadowdark.encounters = module.api.encounters;
}

Hooks.on("getSceneControlButtons", addSceneControl);
Hooks.on("getRollTableDirectoryEntryContext", addRollTableContextOptions);
Hooks.on("renderChatMessage", bindEncounterCard);

Hooks.once("ready", () => {
  exposeApi();
  installTimePassesIntegration();
  log("Ready.");
});
