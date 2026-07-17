(() => {
  "use strict";

  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "EncounterEngine";
  const CHAT_FLAG = "encounterEngine";
  const SCENE_FLAG = "encounterContext";
  const WRAPPED_TIME_PASSES = Symbol.for("mk-shadowdark.encounter-engine.time-passes-wrapped");
  const CARD_SELECTOR = ".mk-sd-encounter-card";

  const SETTINGS = Object.freeze({
    enabled: "encounterEngineEnabled",
    autoTimePasses: "encounterEngineAutoTimePasses",
    defaultTable: "encounterEngineDefaultTableUuid",
    profiles: "encounterEngineProfiles",
    whisper: "encounterEngineWhisperToGm",
    showDice3d: "encounterEngineShowDice3d",
    defaultProfile: "encounterEngineDefaultProfile",
  });

  const DEFAULT_PROFILE_ID = "default";

  const DEFAULT_PROFILES = Object.freeze({
    default: {
      name: "Default",
      dayStart: 6,
      nightStart: 18,
      defaultTerrain: "Default",
      defaultNumberAppearing: "1",
      defaultMorale: 7,
      terrains: {
        Default: {
          any: "",
          day: "",
          night: "",
        },
      },
      auxiliaryTables: {
        distance: "",
        activity: "",
        reaction: "",
        intent: "",
        morale: "",
        surprise: "",
      },
      outcomes: {
        distance: {
          formula: "1d6",
          results: [
            { min: 1, max: 2, label: "Close" },
            { min: 3, max: 5, label: "Near" },
            { min: 6, max: 6, label: "Far" },
          ],
        },
        activity: {
          formula: "1d12",
          results: [
            { min: 1, max: 1, label: "Resting or recovering" },
            { min: 2, max: 2, label: "Searching the area" },
            { min: 3, max: 3, label: "Hunting or tracking prey" },
            { min: 4, max: 4, label: "Guarding territory" },
            { min: 5, max: 5, label: "Traveling with purpose" },
            { min: 6, max: 6, label: "Foraging or scavenging" },
            { min: 7, max: 7, label: "Investigating a disturbance" },
            { min: 8, max: 8, label: "Hiding from another threat" },
            { min: 9, max: 9, label: "Arguing or reorganizing" },
            { min: 10, max: 10, label: "Preparing an ambush" },
            { min: 11, max: 11, label: "Carrying loot or a captive" },
            { min: 12, max: 12, label: "Wounded and seeking safety" },
          ],
        },
        reaction: {
          formula: "2d6",
          results: [
            { min: 2, max: 2, label: "Attacks immediately", disposition: "hostile" },
            { min: 3, max: 5, label: "Hostile", disposition: "hostile" },
            { min: 6, max: 8, label: "Suspicious", disposition: "neutral" },
            { min: 9, max: 9, label: "Neutral", disposition: "neutral" },
            { min: 10, max: 11, label: "Curious", disposition: "neutral" },
            { min: 12, max: 12, label: "Friendly", disposition: "friendly" },
          ],
        },
        intent: {
          formula: "1d8",
          results: [
            { min: 1, max: 1, label: "Drive the party away" },
            { min: 2, max: 2, label: "Observe from a safe position" },
            { min: 3, max: 3, label: "Protect territory or companions" },
            { min: 4, max: 4, label: "Pass without conflict" },
            { min: 5, max: 5, label: "Demand tribute or information" },
            { min: 6, max: 6, label: "Trade, bargain, or seek aid" },
            { min: 7, max: 7, label: "Lure the party elsewhere" },
            { min: 8, max: 8, label: "Exploit the party's distraction" },
          ],
        },
        morale: {
          formula: "1d4+5",
          results: [],
        },
      },
      surprise: {
        formula: "1d6",
        surprisedOn: [1],
      },
    },
  });

  function moduleVersion() {
    const module = game.modules?.get(MODULE_ID);
    return module?.version ?? module?.data?.version ?? "unknown";
  }

  function log(...args) {
    console.log(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function error(...args) {
    console.error(`${MODULE_ID} v${moduleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function settingExists(key) {
    return game.settings?.settings?.has(`${MODULE_ID}.${key}`) ?? false;
  }

  function setting(key, fallback) {
    try {
      if (!settingExists(key)) return fallback;
      return game.settings.get(MODULE_ID, key);
    } catch (_error) {
      return fallback;
    }
  }

  function registerSetting(key, data) {
    if (settingExists(key)) return;
    game.settings.register(MODULE_ID, key, data);
  }

  function deepClone(value) {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function mergeObject(original, other) {
    if (globalThis.foundry?.utils?.mergeObject) {
      return foundry.utils.mergeObject(original, other, {
        inplace: false,
        insertKeys: true,
        insertValues: true,
        overwrite: true,
        recursive: true,
      });
    }

    const result = deepClone(original ?? {});
    for (const [key, value] of Object.entries(other ?? {})) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = mergeObject(result[key], value);
      } else {
        result[key] = deepClone(value);
      }
    }
    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function stripHtml(value) {
    const text = String(value ?? "");
    const div = document.createElement("div");
    div.innerHTML = text;
    return String(div.textContent ?? div.innerText ?? "").replace(/\s+/g, " ").trim();
  }

  function slug(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "default";
  }

  function getRootElement(html) {
    if (!html) return null;
    if (html instanceof HTMLElement) return html;
    if (html[0] instanceof HTMLElement) return html[0];
    return null;
  }

  function activeGmIds() {
    return Array.from(game.users ?? [])
      .filter(user => user.active && user.isGM)
      .map(user => user.id);
  }

  function currentScene() {
    return canvas?.scene ?? game.scenes?.current ?? null;
  }

  function rawSceneFlag(scene, key) {
    return scene?._source?.flags?.[MODULE_ID]?.[key];
  }

  function getSceneFlag(scene, key, fallback = undefined) {
    if (!scene) return fallback;
    try {
      const current = scene.getFlag?.(MODULE_ID, key);
      return current === undefined ? rawSceneFlag(scene, key) ?? fallback : current;
    } catch (_error) {
      return rawSceneFlag(scene, key) ?? fallback;
    }
  }

  function normalizeProfiles(rawValue) {
    let parsed = rawValue;
    if (typeof rawValue === "string") {
      try {
        parsed = JSON.parse(rawValue || "{}");
      } catch (parseError) {
        warn("Invalid Encounter Profiles JSON. Using defaults.", parseError);
        parsed = {};
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) parsed = {};

    const normalized = {};
    const source = Object.keys(parsed).length ? parsed : DEFAULT_PROFILES;
    for (const [profileId, profileValue] of Object.entries(source)) {
      const id = slug(profileId);
      normalized[id] = mergeObject(DEFAULT_PROFILES.default, profileValue ?? {});
      normalized[id].name = String(profileValue?.name ?? profileId ?? "Default");
    }

    if (!Object.keys(normalized).length) normalized.default = deepClone(DEFAULT_PROFILES.default);
    return normalized;
  }

  function getProfiles() {
    return normalizeProfiles(setting(SETTINGS.profiles, JSON.stringify(DEFAULT_PROFILES, null, 2)));
  }

  function getDefaultProfileId(profiles = getProfiles()) {
    const requested = slug(setting(SETTINGS.defaultProfile, DEFAULT_PROFILE_ID));
    if (profiles[requested]) return requested;
    return Object.keys(profiles)[0] ?? DEFAULT_PROFILE_ID;
  }

  function getProfile(profileId, profiles = getProfiles()) {
    const id = slug(profileId || getDefaultProfileId(profiles));
    return {
      id: profiles[id] ? id : getDefaultProfileId(profiles),
      data: profiles[id] ?? profiles[getDefaultProfileId(profiles)] ?? deepClone(DEFAULT_PROFILES.default),
    };
  }

  function worldHour() {
    const worldTime = Number(game.time?.worldTime ?? 0);
    const secondsInDay = 24 * 60 * 60;
    const normalized = ((worldTime % secondsInDay) + secondsInDay) % secondsInDay;
    return Math.floor(normalized / 3600);
  }

  function determinePeriod(profile, requestedPeriod = "auto") {
    if (["day", "night"].includes(requestedPeriod)) return requestedPeriod;

    const hour = worldHour();
    const dayStart = Number(profile.dayStart ?? 6);
    const nightStart = Number(profile.nightStart ?? 18);

    if (dayStart === nightStart) return "day";
    if (dayStart < nightStart) return hour >= dayStart && hour < nightStart ? "day" : "night";
    return hour >= dayStart || hour < nightStart ? "day" : "night";
  }

  function getSceneEncounterContext(scene = currentScene()) {
    const profiles = getProfiles();
    const fallbackProfileId = getDefaultProfileId(profiles);
    const stored = getSceneFlag(scene, SCENE_FLAG, {}) ?? {};
    const profileId = profiles[slug(stored.profileId)] ? slug(stored.profileId) : fallbackProfileId;
    const profile = profiles[profileId];

    return {
      profileId,
      terrain: String(stored.terrain ?? profile.defaultTerrain ?? Object.keys(profile.terrains ?? {})[0] ?? "Default"),
      period: ["auto", "day", "night"].includes(stored.period) ? stored.period : "auto",
      tableUuid: String(stored.tableUuid ?? ""),
    };
  }

  async function setSceneEncounterContext(context, scene = currentScene()) {
    if (!scene || !game.user?.isGM) return null;
    const normalized = {
      profileId: slug(context.profileId),
      terrain: String(context.terrain ?? "Default"),
      period: ["auto", "day", "night"].includes(context.period) ? context.period : "auto",
      tableUuid: String(context.tableUuid ?? ""),
    };
    await scene.setFlag(MODULE_ID, SCENE_FLAG, normalized);
    return normalized;
  }

  function terrainNames(profile) {
    const names = Object.keys(profile.terrains ?? {});
    if (profile.defaultTerrain && !names.includes(profile.defaultTerrain)) names.unshift(profile.defaultTerrain);
    return names.length ? names : ["Default"];
  }

  function tableUuidForContext(profile, terrain, period, explicitUuid = "") {
    if (explicitUuid) return explicitUuid;

    const terrainData = profile.terrains?.[terrain] ?? profile.terrains?.[profile.defaultTerrain] ?? {};
    return String(
      terrainData?.[period] ||
      terrainData?.any ||
      setting(SETTINGS.defaultTable, "") ||
      ""
    );
  }

  async function resolveUuid(uuid) {
    if (!uuid) return null;
    try {
      return await fromUuid(uuid);
    } catch (resolveError) {
      warn(`Could not resolve UUID ${uuid}`, resolveError);
      return null;
    }
  }

  async function availableRollTables() {
    const tables = [];

    for (const table of game.tables ?? []) {
      tables.push({
        uuid: table.uuid,
        name: table.name,
        group: "World",
      });
    }

    for (const pack of game.packs ?? []) {
      const documentName = pack.documentName ?? pack.metadata?.type;
      if (documentName !== "RollTable") continue;

      try {
        const index = await pack.getIndex({ fields: ["name"] });
        for (const entry of index) {
          tables.push({
            uuid: `Compendium.${pack.collection}.RollTable.${entry._id}`,
            name: entry.name,
            group: pack.metadata?.label ?? pack.title ?? pack.collection,
          });
        }
      } catch (indexError) {
        warn(`Could not index RollTable pack ${pack.collection}`, indexError);
      }
    }

    return tables.sort((a, b) => {
      const groupCompare = a.group.localeCompare(b.group);
      return groupCompare || a.name.localeCompare(b.name);
    });
  }

  function renderGroupedOptions(entries, selectedUuid = "") {
    const grouped = new Map();
    for (const entry of entries) {
      if (!grouped.has(entry.group)) grouped.set(entry.group, []);
      grouped.get(entry.group).push(entry);
    }

    const empty = `<option value="" ${selectedUuid ? "" : "selected"}>Automatic / not configured</option>`;
    const groups = Array.from(grouped.entries()).map(([group, options]) => `
      <optgroup label="${escapeHtml(group)}">
        ${options.map(option => `
          <option value="${escapeHtml(option.uuid)}" ${option.uuid === selectedUuid ? "selected" : ""}>
            ${escapeHtml(option.name)}
          </option>
        `).join("")}
      </optgroup>
    `).join("");

    return empty + groups;
  }

  function readDialogForm(html) {
    const root = getRootElement(html);
    const form = root?.querySelector("form") ?? root;
    if (!form) return {};

    const object = globalThis.FormDataExtended
      ? new FormDataExtended(form).object
      : Object.fromEntries(new FormData(form).entries());

    return object;
  }

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
    }, {
      width: 620,
    });
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

  async function evaluateRoll(formula, flavor = "") {
    const roll = await new Roll(String(formula || "1")).evaluate();

    if (setting(SETTINGS.showDice3d, false) && game.dice3d?.showForRoll) {
      try {
        await game.dice3d.showForRoll(roll, game.user, true, activeGmIds(), false, flavor);
      } catch (diceError) {
        warn("Dice So Nice display failed", diceError);
      }
    }

    return roll;
  }

  function rollTotal(roll, fallback = 0) {
    const total = Number(roll?.total);
    return Number.isFinite(total) ? total : fallback;
  }

  function mappingForTotal(results, total) {
    const result = Array.isArray(results)
      ? results.find(entry => total >= Number(entry.min) && total <= Number(entry.max))
      : null;
    return result ? deepClone(result) : null;
  }

  async function drawTableText(tableUuid) {
    const table = await resolveUuid(tableUuid);
    if (!table || table.documentName !== "RollTable") {
      throw new Error(`RollTable not found: ${tableUuid}`);
    }

    let draw;
    if (typeof table.roll === "function") {
      draw = await table.roll({ recursive: false });
    } else {
      draw = await table.draw({ displayChat: false, recursive: false });
    }

    const results = Array.from(draw?.results ?? []);
    const result = results[0] ?? null;
    const text = getRollTableResultText(result);

    return {
      tableUuid: table.uuid,
      tableName: table.name,
      roll: draw?.roll ?? null,
      result,
      text,
    };
  }

  function getRollTableResultText(result) {
    if (!result) return "";

    const direct = result.text ?? result.name;
    if (direct) return stripHtml(direct);

    if (typeof result.getChatText === "function") {
      try {
        return stripHtml(result.getChatText());
      } catch (_error) {
      }
    }

    return stripHtml(result.document?.name ?? "");
  }

  function getResultRawFlags(result) {
    return result?._source?.flags?.[MODULE_ID]?.encounter ?? result?._source?.flags?.[MODULE_ID] ?? {};
  }

  function getActorEncounterFlags(actor) {
    if (!actor) return {};
    try {
      return actor.getFlag?.(MODULE_ID, "encounter") ?? actor._source?.flags?.[MODULE_ID]?.encounter ?? {};
    } catch (_error) {
      return actor._source?.flags?.[MODULE_ID]?.encounter ?? {};
    }
  }

  function resultDocumentUuid(result) {
    if (!result) return "";
    if (result.document?.uuid) return result.document.uuid;
    if (result.documentUuid) return result.documentUuid;

    const collection = result.documentCollection ?? result._source?.documentCollection;
    const documentId = result.documentId ?? result._source?.documentId;
    if (!collection || !documentId) return "";

    if (collection === "Actor") return `Actor.${documentId}`;
    if (String(collection).startsWith("Compendium.")) {
      return `${collection}.Actor.${documentId}`;
    }

    const pack = game.packs?.get(collection);
    if (pack?.documentName === "Actor") return `Compendium.${collection}.Actor.${documentId}`;
    return "";
  }

  function inlineActorUuid(text) {
    const match = String(text ?? "").match(/@UUID\[((?:Actor|Compendium\.[^\]]+\.Actor)\.[^\]]+)\]/i);
    return match?.[1] ?? "";
  }

  async function findActorByName(name) {
    const normalized = String(name ?? "").trim().toLowerCase();
    if (!normalized) return null;

    const worldActor = Array.from(game.actors ?? []).find(actor => actor.name?.trim().toLowerCase() === normalized);
    if (worldActor) return worldActor;

    for (const pack of game.packs ?? []) {
      const documentName = pack.documentName ?? pack.metadata?.type;
      if (documentName !== "Actor") continue;

      try {
        const index = await pack.getIndex({ fields: ["name"] });
        const entry = index.find(item => item.name?.trim().toLowerCase() === normalized);
        if (entry) return await pack.getDocument(entry._id);
      } catch (_error) {
      }
    }

    return null;
  }

  function parseEncounterText(text) {
    const cleaned = stripHtml(text).replace(/\s+/g, " ").trim();
    const timeMatch = cleaned.match(/\s*\((Day|Night|Any)\)\s*$/i);
    const timeRestriction = timeMatch ? timeMatch[1].toLowerCase() : "any";
    const withoutTime = timeMatch ? cleaned.slice(0, timeMatch.index).trim() : cleaned;

    const countMatch = withoutTime.match(/^((?:\d+)?d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(?:[x×]\s*)?(.+)$/i);
    if (!countMatch) {
      return {
        raw: cleaned,
        label: withoutTime || "Unknown Encounter",
        numberFormula: "1",
        timeRestriction,
      };
    }

    return {
      raw: cleaned,
      label: countMatch[2].trim(),
      numberFormula: countMatch[1].replace(/\s+/g, ""),
      timeRestriction,
    };
  }

  async function resolveEncounterResult(draw, profile, period) {
    const parsed = parseEncounterText(draw.text);
    const resultFlags = getResultRawFlags(draw.result);

    let actorUuid = String(resultFlags.actorUuid ?? resultDocumentUuid(draw.result) ?? inlineActorUuid(draw.text) ?? "");
    let actor = await resolveUuid(actorUuid);

    if (actor?.documentName !== "Actor") actor = null;
    if (!actor) {
      actor = await findActorByName(parsed.label);
      actorUuid = actor?.uuid ?? actorUuid;
    }

    const actorFlags = getActorEncounterFlags(actor);
    const numberFormula = String(
      resultFlags.numberFormula ??
      actorFlags.numberFormula ??
      parsed.numberFormula ??
      profile.defaultNumberAppearing ??
      "1"
    );

    const numberRoll = await evaluateRoll(numberFormula, "Number Appearing");
    const count = Math.max(1, Math.floor(rollTotal(numberRoll, 1)));

    const label = String(resultFlags.label ?? actor?.name ?? parsed.label ?? draw.text ?? "Unknown Encounter");
    const timeRestriction = String(resultFlags.time ?? parsed.timeRestriction ?? "any").toLowerCase();

    return {
      label,
      actorUuid,
      count,
      numberFormula,
      numberTotal: rollTotal(numberRoll, count),
      timeRestriction,
      tableResultId: draw.result?.id ?? draw.result?._id ?? "",
      metadata: mergeObject(actorFlags, resultFlags),
      validForPeriod: timeRestriction === "any" || timeRestriction === period,
    };
  }

  async function drawEncounterResult(tableUuid, profile, period) {
    const maximumAttempts = 30;
    let last = null;

    for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
      const draw = await drawTableText(tableUuid);
      const resolved = await resolveEncounterResult(draw, profile, period);
      last = { ...draw, encounter: resolved };
      if (resolved.validForPeriod) return last;
    }

    warn(`Could not find an encounter result valid for ${period} after ${maximumAttempts} attempts.`);
    return last;
  }

  async function rollMappedOutcome(profile, field) {
    const tableUuid = String(profile.auxiliaryTables?.[field] ?? "");
    if (tableUuid) {
      const draw = await drawTableText(tableUuid);
      return {
        label: draw.text || "No result",
        total: rollTotal(draw.roll, null),
        formula: draw.roll?.formula ?? "RollTable",
        tableUuid,
        tableName: draw.tableName,
      };
    }

    const definition = profile.outcomes?.[field] ?? DEFAULT_PROFILES.default.outcomes[field];
    const formula = String(definition?.formula ?? "1d6");
    const roll = await evaluateRoll(formula, field);
    const total = rollTotal(roll, 0);
    const mapped = mappingForTotal(definition?.results, total);

    return {
      label: mapped?.label ?? String(total),
      total,
      formula,
      disposition: mapped?.disposition ?? "",
    };
  }

  async function rollSurprise(profile) {
    const tableUuid = String(profile.auxiliaryTables?.surprise ?? "");
    if (tableUuid) {
      const draw = await drawTableText(tableUuid);
      return {
        label: draw.text || "No surprise",
        formula: draw.roll?.formula ?? "RollTable",
        total: rollTotal(draw.roll, null),
        tableUuid,
        tableName: draw.tableName,
      };
    }

    const formula = String(profile.surprise?.formula ?? "1d6");
    const surprisedOn = Array.isArray(profile.surprise?.surprisedOn)
      ? profile.surprise.surprisedOn.map(Number)
      : [1];

    const partyRoll = await evaluateRoll(formula, "Party Surprise");
    const creatureRoll = await evaluateRoll(formula, "Creature Surprise");
    const partySurprised = surprisedOn.includes(rollTotal(partyRoll, 0));
    const creaturesSurprised = surprisedOn.includes(rollTotal(creatureRoll, 0));

    let label = "No one surprised";
    if (partySurprised && creaturesSurprised) label = "Both sides surprised";
    else if (partySurprised) label = "Party surprised";
    else if (creaturesSurprised) label = "Creatures surprised";

    return {
      label,
      formula,
      partyTotal: rollTotal(partyRoll, 0),
      creatureTotal: rollTotal(creatureRoll, 0),
      partySurprised,
      creaturesSurprised,
    };
  }

  function actorText(actor) {
    if (!actor) return "";
    const candidates = [
      actor.system?.notes,
      actor.system?.description,
      actor.system?.biography,
      actor.system?.details?.biography?.value,
    ];

    for (const item of actor.items ?? []) {
      candidates.push(item.system?.description, item.system?.notes, item.name);
    }

    return candidates.filter(Boolean).map(stripHtml).join(" ").toLowerCase();
  }

  async function rollMorale(profile, encounter) {
    const actor = encounter.actorUuid ? await resolveUuid(encounter.actorUuid) : null;
    const metadata = encounter.metadata ?? {};

    if (metadata.moraleImmune === true || actorText(actor).includes("immune to morale")) {
      return {
        label: "Immune",
        immune: true,
        threshold: null,
        formula: "",
      };
    }

    if (metadata.morale !== undefined && metadata.morale !== null && metadata.morale !== "") {
      const threshold = Number(metadata.morale);
      if (Number.isFinite(threshold)) {
        return {
          label: String(threshold),
          immune: false,
          threshold,
          formula: "Fixed",
        };
      }
    }

    const tableUuid = String(profile.auxiliaryTables?.morale ?? "");
    if (tableUuid) {
      const draw = await drawTableText(tableUuid);
      const numeric = Number(String(draw.text).match(/-?\d+/)?.[0]);
      return {
        label: Number.isFinite(numeric) ? String(numeric) : draw.text,
        immune: false,
        threshold: Number.isFinite(numeric) ? numeric : null,
        formula: draw.roll?.formula ?? "RollTable",
        tableUuid,
        tableName: draw.tableName,
      };
    }

    const fixed = Number(profile.defaultMorale);
    if (Number.isFinite(fixed)) {
      return {
        label: String(fixed),
        immune: false,
        threshold: fixed,
        formula: "Profile",
      };
    }

    const rolled = await rollMappedOutcome(profile, "morale");
    return {
      label: String(rolled.total),
      immune: false,
      threshold: rolled.total,
      formula: rolled.formula,
    };
  }

  function deriveDisposition(reaction) {
    const normalized = String(reaction?.disposition ?? "").toLowerCase();
    if (["hostile", "neutral", "friendly"].includes(normalized)) return normalized;

    const label = String(reaction?.label ?? "").toLowerCase();
    if (label.includes("attack") || label.includes("hostile")) return "hostile";
    if (label.includes("friendly")) return "friendly";
    return "neutral";
  }

  async function buildEncounterData({ profileId, profile, terrain, requestedPeriod, period, tableUuid, tableName, draw }) {
    const encounter = draw.encounter;

    const [distance, activity, surprise, reaction, intent] = await Promise.all([
      rollMappedOutcome(profile, "distance"),
      encounter.metadata?.activity
        ? Promise.resolve({ label: String(encounter.metadata.activity), formula: "Encounter result", total: null })
        : rollMappedOutcome(profile, "activity"),
      rollSurprise(profile),
      rollMappedOutcome(profile, "reaction"),
      encounter.metadata?.intent
        ? Promise.resolve({ label: String(encounter.metadata.intent), formula: "Encounter result", total: null })
        : rollMappedOutcome(profile, "intent"),
    ]);

    const morale = await rollMorale(profile, encounter);
    const disposition = String(encounter.metadata?.disposition ?? deriveDisposition(reaction));

    return {
      schema: 1,
      generatedAt: Date.now(),
      profileId,
      profileName: profile.name ?? profileId,
      sceneId: currentScene()?.id ?? "",
      sceneName: currentScene()?.name ?? "",
      terrain,
      requestedPeriod,
      period,
      tableUuid,
      tableName,
      encounter,
      distance,
      activity,
      surprise,
      reaction,
      intent,
      morale,
      disposition,
    };
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

    const message = await createEncounterMessage(data, {
      whisper: options.whisper,
    });

    return { data, message };
  }

  function encounterDisplay(data) {
    const encounter = data.encounter ?? {};
    const actorLink = encounter.actorUuid
      ? `<a class="content-link" data-uuid="${escapeHtml(encounter.actorUuid)}"><i class="fas fa-user"></i>${escapeHtml(encounter.label)}</a>`
      : escapeHtml(encounter.label ?? "Unknown Encounter");

    const formula = encounter.numberFormula && encounter.numberFormula !== String(encounter.count)
      ? `<span class="mk-sd-encounter-formula">${escapeHtml(encounter.numberFormula)}</span>`
      : "";

    return `<strong>${escapeHtml(encounter.count)}</strong> ${actorLink} ${formula}`;
  }

  function row(label, value, field, { publicCard = false, detail = "" } = {}) {
    const reroll = publicCard || !field
      ? ""
      : `<button type="button" class="mk-sd-encounter-icon-button" data-action="reroll-field" data-field="${escapeHtml(field)}" title="Reroll ${escapeHtml(label)}"><i class="fas fa-rotate"></i></button>`;

    return `
      <div class="mk-sd-encounter-row" data-field-row="${escapeHtml(field ?? "")}">
        <span class="mk-sd-encounter-label">${escapeHtml(label)}</span>
        <span class="mk-sd-encounter-value">${value}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</span>
        ${reroll}
      </div>
    `;
  }

  function renderEncounterCard(data, { publicCard = false } = {}) {
    const periodLabel = data.period === "night" ? "Night" : "Day";
    const disposition = String(data.disposition ?? "neutral");
    const moraleDetail = data.morale?.immune
      ? "Does not make morale checks"
      : "2d6 equal to or below this score to hold";

    const controls = publicCard ? "" : `
      <div class="mk-sd-encounter-controls">
        <button type="button" data-action="reveal"><i class="fas fa-eye"></i> Reveal to Players</button>
        <button type="button" data-action="reroll-field" data-field="number"><i class="fas fa-users"></i> Reroll Number</button>
        <button type="button" data-action="reroll-field" data-field="encounter"><i class="fas fa-rotate"></i> Reroll Creature</button>
        <button type="button" data-action="reroll-all"><i class="fas fa-dice-d20"></i> Reroll All</button>
      </div>
    `;

    return `
      <section class="mk-sd-encounter-card ${publicCard ? "is-public" : "is-gm"}" data-encounter-schema="${Number(data.schema ?? 1)}">
        <header class="mk-sd-encounter-header">
          <div>
            <span class="mk-sd-encounter-kicker">Encounter</span>
            <h3>${encounterDisplay(data)}</h3>
          </div>
          <span class="mk-sd-encounter-disposition is-${escapeHtml(disposition)}">${escapeHtml(disposition)}</span>
        </header>

        <div class="mk-sd-encounter-context">
          <span><i class="fas fa-mountain-sun"></i> ${escapeHtml(data.terrain)}</span>
          <span><i class="fas ${data.period === "night" ? "fa-moon" : "fa-sun"}"></i> ${periodLabel}</span>
          <span><i class="fas fa-table-list"></i> ${escapeHtml(data.tableName)}</span>
        </div>

        <div class="mk-sd-encounter-grid">
          ${row("Distance", escapeHtml(data.distance?.label ?? "Unknown"), "distance", { publicCard })}
          ${row("Activity", escapeHtml(data.activity?.label ?? "Unknown"), "activity", { publicCard })}
          ${row("Reaction", escapeHtml(data.reaction?.label ?? "Unknown"), "reaction", { publicCard })}
          ${row("Intent", escapeHtml(data.intent?.label ?? "Unknown"), "intent", { publicCard })}
          ${row("Surprise", escapeHtml(data.surprise?.label ?? "Unknown"), "surprise", { publicCard })}
          ${publicCard ? "" : row("Morale", escapeHtml(data.morale?.label ?? "Unknown"), "morale", { publicCard, detail: moraleDetail })}
        </div>

        ${controls}

        <footer class="mk-sd-encounter-footer">
          ${escapeHtml(data.profileName)}${data.sceneName ? ` - ${escapeHtml(data.sceneName)}` : ""}
        </footer>
      </section>
    `;
  }

  async function createEncounterMessage(data, options = {}) {
    const whisperSetting = options.whisper ?? setting(SETTINGS.whisper, true);
    const whisper = whisperSetting ? activeGmIds() : [];
    const content = renderEncounterCard(data);

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      style: CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
      content,
      whisper,
      flags: {
        [MODULE_ID]: {
          [CHAT_FLAG]: data,
        },
      },
    });
  }

  async function updateEncounterMessage(message, data) {
    await message.update({
      content: renderEncounterCard(data),
      [`flags.${MODULE_ID}.${CHAT_FLAG}`]: data,
    });
    return message;
  }

  async function revealEncounter(message, data) {
    const content = renderEncounterCard(data, { publicCard: true });
    return ChatMessage.create({
      speaker: message.speaker ?? ChatMessage.getSpeaker(),
      style: CONST?.CHAT_MESSAGE_STYLES?.OTHER ?? CONST?.CHAT_MESSAGE_TYPES?.OTHER ?? 0,
      content,
      whisper: [],
      flags: {
        [MODULE_ID]: {
          encounterEnginePublic: {
            sourceMessageId: message.id,
            schema: data.schema ?? 1,
          },
        },
      },
    });
  }

  async function rerollEncounterField(message, field) {
    const data = deepClone(message.getFlag(MODULE_ID, CHAT_FLAG));
    if (!data) return null;

    const profileRef = getProfile(data.profileId);
    const profile = profileRef.data;

    switch (field) {
      case "encounter": {
        const draw = await drawEncounterResult(data.tableUuid, profile, data.period);
        data.encounter = draw.encounter;
        data.activity = data.encounter.metadata?.activity
          ? { label: String(data.encounter.metadata.activity), formula: "Encounter result", total: null }
          : await rollMappedOutcome(profile, "activity");
        data.intent = data.encounter.metadata?.intent
          ? { label: String(data.encounter.metadata.intent), formula: "Encounter result", total: null }
          : await rollMappedOutcome(profile, "intent");
        data.morale = await rollMorale(profile, data.encounter);
        break;
      }
      case "number": {
        const numberRoll = await evaluateRoll(data.encounter.numberFormula || "1", "Number Appearing");
        data.encounter.numberTotal = rollTotal(numberRoll, 1);
        data.encounter.count = Math.max(1, Math.floor(data.encounter.numberTotal));
        break;
      }
      case "distance":
      case "activity":
      case "reaction":
      case "intent":
        data[field] = await rollMappedOutcome(profile, field);
        if (field === "reaction") data.disposition = deriveDisposition(data.reaction);
        break;
      case "surprise":
        data.surprise = await rollSurprise(profile);
        break;
      case "morale":
        data.morale = await rollMorale(profile, data.encounter);
        break;
      default:
        return null;
    }

    data.generatedAt = Date.now();
    await updateEncounterMessage(message, data);
    return data;
  }

  async function rerollEntireEncounter(message) {
    const oldData = message.getFlag(MODULE_ID, CHAT_FLAG);
    if (!oldData) return null;

    const profileRef = getProfile(oldData.profileId);
    const profile = profileRef.data;
    const draw = await drawEncounterResult(oldData.tableUuid, profile, oldData.period);
    const data = await buildEncounterData({
      profileId: profileRef.id,
      profile,
      terrain: oldData.terrain,
      requestedPeriod: oldData.requestedPeriod,
      period: oldData.period,
      tableUuid: oldData.tableUuid,
      tableName: oldData.tableName,
      draw,
    });

    await updateEncounterMessage(message, data);
    return data;
  }

  function messageFromApp(app) {
    return app?.document ?? app?.message ?? game.messages?.get(app?.id) ?? null;
  }

  function bindEncounterCard(app, html) {
    const message = messageFromApp(app);
    if (!message || !message.getFlag(MODULE_ID, CHAT_FLAG)) return;

    const root = getRootElement(html);
    const card = root?.querySelector(CARD_SELECTOR);
    if (!card || card.dataset.mkBound === "true") return;
    card.dataset.mkBound = "true";

    card.addEventListener("click", async event => {
      const button = event.target.closest("button[data-action]");
      if (!button || !card.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();

      if (!game.user?.isGM) return;
      button.disabled = true;

      try {
        const action = button.dataset.action;
        const data = message.getFlag(MODULE_ID, CHAT_FLAG);

        if (action === "reveal") {
          await revealEncounter(message, data);
        } else if (action === "reroll-all") {
          await rerollEntireEncounter(message);
        } else if (action === "reroll-field") {
          await rerollEncounterField(message, button.dataset.field);
        }
      } catch (actionError) {
        error("Encounter chat action failed", actionError);
        ui.notifications.error(`Encounter action failed: ${actionError.message}`);
      } finally {
        button.disabled = false;
      }
    });
  }

  function addSceneControl(controls) {
    if (!game.user?.isGM || !setting(SETTINGS.enabled, true)) return;

    const tool = {
      name: "mkEncounterEngine",
      title: "MK-Shadowdark Encounter Engine",
      icon: "fas fa-dice-d20",
      button: true,
      visible: true,
      onClick: () => openEncounterDialog(),
      onChange: active => {
        if (active !== false) openEncounterDialog();
      },
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
        if (!table) return;
        await resolveEncounter({ tableUuid: table.uuid, promptIfMissing: false });
      },
    });
  }

  function registerSettings() {
    registerSetting(SETTINGS.enabled, {
      name: "Encounter Engine | Enabled",
      hint: "Enables the Phase 1 encounter resolver, chat card, scene control, and API.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });

    registerSetting(SETTINGS.autoTimePasses, {
      name: "Encounter Engine | Resolve Time Passes Encounters",
      hint: "When Time Passes produces an encounter, immediately run the Encounter Engine using the current scene profile.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });

    registerSetting(SETTINGS.defaultTable, {
      name: "Encounter Engine | Default Encounter Table UUID",
      hint: "Fallback world or compendium RollTable UUID used when the active profile has no matching terrain and time table.",
      scope: "world",
      config: true,
      type: String,
      default: "",
    });

    registerSetting(SETTINGS.defaultProfile, {
      name: "Encounter Engine | Default Profile ID",
      hint: "Profile ID used by scenes that do not have their own encounter context.",
      scope: "world",
      config: true,
      type: String,
      default: DEFAULT_PROFILE_ID,
    });

    registerSetting(SETTINGS.whisper, {
      name: "Encounter Engine | GM-only Chat Card",
      hint: "Whispers the full encounter card to active GMs. The card can then be revealed to players without morale information.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });

    registerSetting(SETTINGS.showDice3d, {
      name: "Encounter Engine | Show 3D Procedure Dice",
      hint: "Shows the encounter procedure dice to GMs when Dice So Nice is active. Disabled by default to avoid many sequential dice animations.",
      scope: "world",
      config: true,
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
          const encounterResolution = await resolveEncounter({
            source: "timePasses",
            promptIfMissing: true,
          });
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
})();
