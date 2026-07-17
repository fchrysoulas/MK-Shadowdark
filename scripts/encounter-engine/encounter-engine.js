import {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILES,
  MODULE_ID,
  SETTINGS,
  WRAPPED_TIME_PASSES,
} from "./constants.js";
import {
  availableRollTables,
  deepClone,
  determinePeriod,
  error,
  escapeHtml,
  getProfile,
  getProfiles,
  getSceneEncounterContext,
  log,
  normalizeProfiles,
  readDialogForm,
  registerSetting,
  renderGroupedOptions,
  resolveUuid,
  setSceneEncounterContext,
  setting,
  tableUuidForContext,
  terrainNames,
  warn,
} from "./helpers.js";
import { buildEncounterData, drawEncounterResult } from "./resolver.js";
import {
  bindEncounterCard,
  createEncounterMessage,
  renderEncounterCard,
  rerollEncounterField,
  rerollEntireEncounter,
} from "./chat.js";

async function openEncounterDialog(options = {}) {
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

  const selectedPeriod = String(options.period ?? sceneContext.period ?? "auto");
  const selectedTable = String(options.tableUuid ?? sceneContext.tableUuid ?? "");

  const content = `
    <form class="mk-sd-encounter-dialog">
      <p class="notes">Resolve the full encounter procedure. The selected profile supplies automatic terrain and time-of-day tables.</p>

      <div class="form-group">
        <label>Profile</label>
        <select name="profileId">${profileOptions}</select>
      </div>

      <div class="form-group">
        <label>Terrain</label>
        <select name="terrain">${terrainOptions}</select>
        <p class="hint">Terrain choices come from the selected Encounter Profile.</p>
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
        <p class="hint">Leave automatic to use the scene profile, terrain, and current time.</p>
      </div>

      <div class="form-group">
        <label>Remember for this Scene</label>
        <input type="checkbox" name="rememberScene" ${options.rememberScene === false ? "" : "checked"}>
      </div>
    </form>
  `;

  return Dialog.wait({
    title: "MK-Shadowdark Encounter Engine",
    content,
    buttons: {
      resolve: {
        icon: '<i class="fas fa-dice-d20"></i>',
        label: "Resolve Encounter",
        callback: async html => {
          const form = readDialogForm(html);
          const context = {
            profileId: String(form.profileId ?? initialProfile.id),
            terrain: String(form.terrain ?? initialTerrain),
            period: String(form.period ?? selectedPeriod),
            tableUuid: String(form.tableUuid ?? ""),
          };

          if (form.rememberScene) await setSceneEncounterContext(context);
          return resolveEncounter({ ...options, ...context, promptIfMissing: false });
        },
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
    default: "resolve",
    close: () => null,
  }, { width: 620 });
}

async function configureProfiles() {
  if (!game.user?.isGM) return null;

  const current = JSON.stringify(getProfiles(), null, 2);
  const content = `
    <form class="mk-sd-encounter-profiles-dialog">
      <p class="notes">Profiles are world-level JSON. Terrain entries may point to world or compendium RollTable UUIDs for day, night, or any time.</p>
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
        label: "Reset Defaults",
        callback: async () => {
          const defaults = JSON.stringify(DEFAULT_PROFILES, null, 2);
          await game.settings.set(MODULE_ID, SETTINGS.profiles, defaults);
          ui.notifications.info("Encounter Profiles reset to defaults.");
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

async function resolveEncounter(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only a GM can resolve an encounter.");
    return null;
  }

  if (!setting(SETTINGS.enabled, true)) return null;

  const profiles = getProfiles();
  const sceneContext = getSceneEncounterContext();
  const profileRef = getProfile(options.profileId ?? sceneContext.profileId, profiles);
  const profile = profileRef.data;
  const terrain = String(options.terrain ?? sceneContext.terrain ?? profile.defaultTerrain ?? "Default");
  const requestedPeriod = String(options.period ?? sceneContext.period ?? "auto");
  const period = determinePeriod(profile, requestedPeriod);
  const explicitTableUuid = String(options.tableUuid ?? sceneContext.tableUuid ?? "");
  const tableUuid = tableUuidForContext(profile, terrain, period, explicitTableUuid);

  if (!tableUuid) {
    if (options.promptIfMissing !== false) {
      return openEncounterDialog({ ...options, profileId: profileRef.id, terrain, period: requestedPeriod });
    }
    ui.notifications.warn("No encounter RollTable is configured for this profile, terrain, and time.");
    return null;
  }

  const table = await resolveUuid(tableUuid);
  if (!table || table.documentName !== "RollTable") {
    ui.notifications.error(`Encounter RollTable could not be resolved: ${tableUuid}`);
    return null;
  }

  const draw = await drawEncounterResult(tableUuid, profile, period);
  if (!draw?.encounter) {
    ui.notifications.warn(`The encounter table ${table.name} returned no result.`);
    return null;
  }

  const data = await buildEncounterData({
    profileId: profileRef.id,
    profile,
    terrain,
    requestedPeriod,
    period,
    tableUuid,
    tableName: table.name,
    draw,
  });

  const message = await createEncounterMessage(data, { whisper: options.whisper });
  return { data, message };
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

function registerSettings() {
  registerSetting(SETTINGS.enabled, {
    name: "Encounter Engine | Enabled",
    hint: "Enables the Phase 1 encounter resolver, chat card, scene control, and API.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  registerSetting(SETTINGS.autoTimePasses, {
    name: "Encounter Engine | Resolve Time Passes Encounters",
    hint: "When Time Passes produces an encounter, immediately run the Encounter Engine using the current scene profile.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  registerSetting(SETTINGS.defaultTable, {
    name: "Encounter Engine | Default Encounter Table UUID",
    hint: "Fallback world or compendium RollTable UUID used when the active profile has no matching terrain and time table.",
    scope: "world",
    config: false,
    type: String,
    default: "",
  });

  registerSetting(SETTINGS.defaultProfile, {
    name: "Encounter Engine | Default Profile ID",
    hint: "Profile ID used by scenes that do not have their own encounter context.",
    scope: "world",
    config: false,
    type: String,
    default: DEFAULT_PROFILE_ID,
  });

  registerSetting(SETTINGS.whisper, {
    name: "Encounter Engine | GM-only Chat Card",
    hint: "Whispers the full encounter card to active GMs. The card can then be revealed to players without morale information.",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
  });

  registerSetting(SETTINGS.showDice3d, {
    name: "Encounter Engine | Show 3D Procedure Dice",
    hint: "Shows the encounter procedure dice to GMs when Dice So Nice is active. Disabled by default to avoid many sequential dice animations.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
  });

  registerSetting(SETTINGS.profiles, {
    name: "Encounter Engine Profiles",
    hint: "JSON storage for Encounter Profiles. Use the Edit Profiles button in the Encounter Engine dialog.",
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(DEFAULT_PROFILES, null, 2),
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
  module.api.encounters = {
    version: 1,
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
  game.mkShadowdark.encounters = module.api.encounters;
}

Hooks.once("init", () => {
  registerSettings();
  log("Settings registered.");
});

Hooks.on("getSceneControlButtons", addSceneControl);
Hooks.on("getRollTableDirectoryEntryContext", addRollTableContextOptions);
Hooks.on("renderChatMessage", bindEncounterCard);

Hooks.once("ready", () => {
  exposeApi();
  installTimePassesIntegration();
  log("Ready.");
});
