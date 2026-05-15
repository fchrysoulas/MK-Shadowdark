// scripts/base-actor.js
// MK-Shadowdark - Base Actor Type
// Foundry VTT v12 + Shadowdark RPG
//
// Graphic UI version using Game-icons.net SVG icons.
// Icons are loaded from https://game-icons.net/ and attributed in GAME_ICONS_ATTRIBUTION.md.
//
// Required module.json entry:
// "documentTypes": { "Actor": { "Base": { "htmlFields": [...] } } }
//
// Foundry stores module-provided actor subtypes with a module prefix.
// The real actor type is "mk-shadowdark.Base", not plain "Base".

const MODULE_ID = "mk-shadowdark";
const ACTOR_SUBTYPE = "Base";
const ACTOR_TYPE = `${MODULE_ID}.${ACTOR_SUBTYPE}`;
const LEGACY_ACTOR_TYPE = "Base";

const SHEET_ID = "sdx-base-actor-sheet";
const TEMPLATE_PATH = `modules/${MODULE_ID}/templates/base-actor-sheet.hbs`;
const DEFAULT_BASE_IMAGE = `modules/${MODULE_ID}/assets/base-management/base.svg`;

const GAME_ICON_ROOT = "https://game-icons.net/icons/ffffff/transparent/1x1";

const GAME_ICONS = {
  base: `${GAME_ICON_ROOT}/delapouite/village.svg`,
  tier: `${GAME_ICON_ROOT}/delapouite/castle.svg`,
  population: `${GAME_ICON_ROOT}/delapouite/meeple-group.svg`,
  morale: `${GAME_ICON_ROOT}/delapouite/heart-beats.svg`,
  security: `${GAME_ICON_ROOT}/sbed/shield.svg`,
  supplies: `${GAME_ICON_ROOT}/delapouite/wooden-crate.svg`,
  wealth: `${GAME_ICON_ROOT}/delapouite/pay-money.svg`,
  influence: `${GAME_ICON_ROOT}/delapouite/vertical-banner.svg`,
  coin: `${GAME_ICON_ROOT}/delapouite/pay-money.svg`,
  water: `${GAME_ICON_ROOT}/sbed/water-drop.svg`,
  food: `${GAME_ICON_ROOT}/lorc/meat.svg`,
  medicine: `${GAME_ICON_ROOT}/delapouite/medicine-pills.svg`,
  materials: `${GAME_ICON_ROOT}/delapouite/anvil.svg`,
  relics: `${GAME_ICON_ROOT}/lorc/crystal-ball.svg`,
  facilities: `${GAME_ICON_ROOT}/delapouite/watchtower.svg`,
  projects: `${GAME_ICON_ROOT}/delapouite/3d-hammer.svg`,
  npcs: `${GAME_ICON_ROOT}/delapouite/meeple-king.svg`,
  threats: `${GAME_ICON_ROOT}/lorc/skull-crossed-bones.svg`,
  notes: `${GAME_ICON_ROOT}/delapouite/archive-research.svg`,
  status: `${GAME_ICON_ROOT}/delapouite/scroll-quill.svg`,
  event: `${GAME_ICON_ROOT}/delapouite/dice-twenty-faces-twenty.svg`,
  add: `${GAME_ICON_ROOT}/delapouite/plus.svg`,
  delete: `${GAME_ICON_ROOT}/delapouite/trash-can.svg`,
};

const BASE_TYPE_LABELS = {
  camp: "Camp",
  hideout: "Hideout",
  village: "Village",
  stronghold: "Stronghold",
  temple: "Temple",
  guildhall: "Guildhall",
  ship: "Ship",
  caravan: "Caravan",
};

const BASE_TYPE_ICONS = {
  camp: `${GAME_ICON_ROOT}/lorc/campfire.svg`,
  hideout: `${GAME_ICON_ROOT}/delapouite/closed-doors.svg`,
  village: `${GAME_ICON_ROOT}/delapouite/village.svg`,
  stronghold: `${GAME_ICON_ROOT}/delapouite/castle.svg`,
  temple: `${GAME_ICON_ROOT}/delapouite/ancient-columns.svg`,
  guildhall: `${GAME_ICON_ROOT}/delapouite/round-table.svg`,
  ship: `${GAME_ICON_ROOT}/delapouite/sailboat.svg`,
  caravan: `${GAME_ICON_ROOT}/delapouite/covered-horse.svg`,
};

const SUMMARY_NUMBER_LABELS = {
  tier: "Tier",
  population: "Population",
  morale: "Morale",
  security: "Security",
  supplies: "Supplies",
  wealth: "Wealth",
  influence: "Influence",
};

const RESOURCE_LABELS = {
  coin: "Coin",
  water: "Water",
  food: "Food",
  medicine: "Medicine",
  materials: "Materials",
  relics: "Relics",
};

const BASE_EVENTS = [
  {
    title: "Shortage",
    text: "A critical resource runs low. Reduce Food, Water, or Supplies by 1.",
  },
  {
    title: "Useful Stranger",
    text: "A traveler arrives with news, a service, or a dangerous secret.",
  },
  {
    title: "Internal Dispute",
    text: "A conflict breaks out inside the base. Test Morale before the next rest.",
  },
  {
    title: "Threat Advances",
    text: "One active threat increases its clock by 1.",
  },
  {
    title: "Good Work",
    text: "A project gains +1 progress as workers, allies, or followers push it forward.",
  },
  {
    title: "Bad Omen",
    text: "Something feels wrong. The next expedition from this base begins with tension.",
  },
  {
    title: "Hidden Cache",
    text: "The base discovers useful supplies. Gain +1 Materials, Food, Water, or Medicine.",
  },
  {
    title: "Security Breach",
    text: "Someone or something bypasses the base defenses. Reduce Security by 1 or create a new threat.",
  },
];

let featureRegistered = false;
let createAliasInstalled = false;

function log(...args) {
  console.log(`${MODULE_ID} | BaseActor |`, ...args);
}

function warn(...args) {
  console.warn(`${MODULE_ID} | BaseActor |`, ...args);
}

function clone(value) {
  if (value?.toObject) return value.toObject(false);
  if (foundry.utils.deepClone) return foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value ?? {}));
}

function makeId(prefix = "id") {
  if (foundry.utils.randomID) return `${prefix}-${foundry.utils.randomID(8)}`;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function escapeHTML(value) {
  const text = String(value ?? "");
  const div = document.createElement("div");
  div.innerText = text;
  return div.innerHTML;
}

function numberFrom(value, fallback = 0) {
  if (value && typeof value === "object" && "value" in value) {
    return Number(value.value ?? fallback);
  }

  return Number(value ?? fallback);
}

function getDefaultBaseSystem() {
  return {
    base: {
      type: "village",
      tier: 1,
      location: "",
      population: 0,
      description: "",
    },
    stats: {
      morale: 2,
      security: 2,
      supplies: 2,
      wealth: 1,
      influence: 1,
    },
    resources: {
      coin: 0,
      water: 0,
      food: 0,
      medicine: 0,
      materials: 0,
      relics: 0,
    },
    facilities: [],
    projects: [],
    npcs: [],
    threats: [],
    notes: "",
  };
}

function normalizeBaseSystem(sourceSystem = {}) {
  const source = clone(sourceSystem);
  const defaults = getDefaultBaseSystem();

  const normalized = foundry.utils.mergeObject(defaults, source, {
    inplace: false,
    recursive: true,
    insertKeys: true,
    insertValues: true,
    overwrite: true,
  });

  normalized.base = normalized.base ?? {};
  normalized.base.type = normalized.base.type || "village";
  normalized.base.tier = clamp(normalized.base.tier, 1, 6);
  normalized.base.location = String(normalized.base.location ?? "");
  normalized.base.population = Math.max(0, Math.trunc(numberFrom(normalized.base.population, 0)));
  normalized.base.description = String(normalized.base.description ?? "");

  normalized.stats = normalized.stats ?? {};
  normalized.stats.morale = clamp(numberFrom(normalized.stats.morale, 2), 0, 6);
  normalized.stats.security = clamp(numberFrom(normalized.stats.security, 2), 0, 6);
  normalized.stats.supplies = clamp(numberFrom(normalized.stats.supplies, 2), 0, 6);
  normalized.stats.wealth = clamp(numberFrom(normalized.stats.wealth, 1), 0, 6);
  normalized.stats.influence = clamp(numberFrom(normalized.stats.influence, 1), 0, 6);

  normalized.resources = normalized.resources ?? {};
  for (const key of Object.keys(RESOURCE_LABELS)) {
    normalized.resources[key] = Math.max(0, Math.trunc(numberFrom(normalized.resources[key], 0)));
  }

  normalized.facilities = Array.isArray(normalized.facilities) ? normalized.facilities : [];
  normalized.facilities = normalized.facilities.map((facility) => ({
    id: facility.id || makeId("facility"),
    name: String(facility.name ?? "New Facility"),
    rank: clamp(facility.rank ?? 1, 1, 3),
    condition: String(facility.condition ?? "Stable"),
    benefit: String(facility.benefit ?? ""),
    note: String(facility.note ?? ""),
  }));

  normalized.projects = Array.isArray(normalized.projects) ? normalized.projects : [];
  normalized.projects = normalized.projects.map((project) => ({
    id: project.id || makeId("project"),
    name: String(project.name ?? "New Project"),
    progress: Math.max(0, Math.trunc(numberFrom(project.progress, 0))),
    target: Math.max(1, Math.trunc(numberFrom(project.target, 4))),
    cost: String(project.cost ?? ""),
    owner: String(project.owner ?? ""),
    note: String(project.note ?? ""),
  }));

  normalized.npcs = Array.isArray(normalized.npcs) ? normalized.npcs : [];
  normalized.npcs = normalized.npcs.map((npc) => ({
    id: npc.id || makeId("npc"),
    name: String(npc.name ?? "New NPC"),
    role: String(npc.role ?? ""),
    loyalty: clamp(npc.loyalty ?? 2, 0, 6),
    note: String(npc.note ?? ""),
  }));

  normalized.threats = Array.isArray(normalized.threats) ? normalized.threats : [];
  normalized.threats = normalized.threats.map((threat) => ({
    id: threat.id || makeId("threat"),
    name: String(threat.name ?? "New Threat"),
    level: clamp(threat.level ?? 1, 1, 10),
    clock: clamp(threat.clock ?? 0, 0, 6),
    note: String(threat.note ?? ""),
  }));

  normalized.notes = String(normalized.notes ?? "");

  return normalized;
}

function isBaseActorType(type) {
  return type === ACTOR_TYPE || type === LEGACY_ACTOR_TYPE;
}

function isBaseActorData(data) {
  return isBaseActorType(data?.type);
}

function rewriteLegacyBaseType(data) {
  if (!data || typeof data !== "object") return data;
  if (data.type !== LEGACY_ACTOR_TYPE) return data;

  return {
    ...data,
    type: ACTOR_TYPE,
  };
}

function configureBaseActorDefaults() {
  CONFIG.Actor.typeLabels = CONFIG.Actor.typeLabels ?? {};
  CONFIG.Actor.typeLabels[ACTOR_TYPE] = `TYPES.Actor.${ACTOR_TYPE}`;
  CONFIG.Actor.typeLabels[LEGACY_ACTOR_TYPE] = `TYPES.Actor.${ACTOR_TYPE}`;

  CONFIG.SHADOWDARK = CONFIG.SHADOWDARK ?? {};
  CONFIG.SHADOWDARK.DEFAULTS = CONFIG.SHADOWDARK.DEFAULTS ?? {};
  CONFIG.SHADOWDARK.DEFAULTS.ACTOR_IMAGES = CONFIG.SHADOWDARK.DEFAULTS.ACTOR_IMAGES ?? {};
  CONFIG.SHADOWDARK.DEFAULTS.ACTOR_IMAGES[ACTOR_TYPE] = DEFAULT_BASE_IMAGE;
}

function installLegacyBaseCreateAlias() {
  if (createAliasInstalled) return;
  createAliasInstalled = true;

  const originalCreate = Actor.create.bind(Actor);
  const originalCreateDocuments = Actor.createDocuments.bind(Actor);

  Actor.create = async function patchedCreate(data = {}, context = {}) {
    return originalCreate(rewriteLegacyBaseType(data), context);
  };

  Actor.createDocuments = async function patchedCreateDocuments(data = [], context = {}) {
    const rewrittenData = Array.isArray(data)
      ? data.map((entry) => rewriteLegacyBaseType(entry))
      : data;

    return originalCreateDocuments(rewrittenData, context);
  };
}

function installBaseActorHooks() {
  Hooks.on("preCreateActor", (actor, data) => {
    if (!isBaseActorData(data) && !isBaseActorType(actor.type)) return;

    const normalizedSystem = normalizeBaseSystem(data.system ?? actor.system ?? {});
    const update = {
      system: normalizedSystem,
      prototypeToken: {
        actorLink: true,
        sight: {
          enabled: false,
        },
      },
    };

    if (!data.img || data.img === "icons/svg/mystery-man.svg") {
      update.img = DEFAULT_BASE_IMAGE;
      update.prototypeToken.texture = {
        src: DEFAULT_BASE_IMAGE,
      };
    }

    actor.updateSource(update);
  });

  Hooks.on("renderActorDirectory", (_app, html) => {
    if (!game.user.isGM) return;

    const root = html instanceof jQuery ? html : $(html);
    const header = root.find(".directory-header .header-actions");
    if (!header.length) return;
    if (root.find(".sdx-create-base-actor").length) return;

    const button = $(`
      <button type="button" class="sdx-create-base-actor">
        <img src="${GAME_ICONS.base}" alt=""> Base
      </button>
    `);

    button.on("click", async () => {
      await Actor.create({
        name: "New Base",
        type: ACTOR_TYPE,
        img: DEFAULT_BASE_IMAGE,
        system: getDefaultBaseSystem(),
      });
    });

    header.append(button);
  });
}

function registerBaseActorDataModel() {
  CONFIG.Actor.dataModels = CONFIG.Actor.dataModels ?? {};
  CONFIG.Actor.dataModels[ACTOR_TYPE] = BaseActorDataModel;
}

function registerBaseActorSheet() {
  Actors.registerSheet(MODULE_ID, BaseActorSheet, {
    types: [ACTOR_TYPE],
    makeDefault: true,
    label: "Base Management",
  });
}

export function registerBaseActorFeature() {
  if (featureRegistered) return;
  featureRegistered = true;

  registerBaseActorDataModel();
  configureBaseActorDefaults();
  registerBaseActorSheet();
  installBaseActorHooks();
  installLegacyBaseCreateAlias();

  log(`registered actor subtype ${ACTOR_TYPE}`);
}

class BaseActorDataModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;

    const smallNumber = (initial = 0, min = 0, max = 6) => new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      min,
      max,
      initial,
    });

    const resourceNumber = () => new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      min: 0,
      initial: 0,
    });

    const text = (initial = "") => new fields.StringField({
      required: false,
      blank: true,
      nullable: false,
      initial,
    });

    const html = (initial = "") => new fields.HTMLField({
      required: false,
      blank: true,
      nullable: false,
      initial,
    });

    return {
      base: new fields.SchemaField({
        type: text("village"),
        tier: smallNumber(1, 1, 6),
        location: text(""),
        population: resourceNumber(),
        description: html(""),
      }),

      stats: new fields.SchemaField({
        morale: smallNumber(2, 0, 6),
        security: smallNumber(2, 0, 6),
        supplies: smallNumber(2, 0, 6),
        wealth: smallNumber(1, 0, 6),
        influence: smallNumber(1, 0, 6),
      }),

      resources: new fields.SchemaField({
        coin: resourceNumber(),
        water: resourceNumber(),
        food: resourceNumber(),
        medicine: resourceNumber(),
        materials: resourceNumber(),
        relics: resourceNumber(),
      }),

      facilities: new fields.ArrayField(new fields.SchemaField({
        id: text(""),
        name: text("New Facility"),
        rank: smallNumber(1, 1, 3),
        condition: text("Stable"),
        benefit: text(""),
        note: html(""),
      }), {
        initial: [],
      }),

      projects: new fields.ArrayField(new fields.SchemaField({
        id: text(""),
        name: text("New Project"),
        progress: resourceNumber(),
        target: new fields.NumberField({
          required: true,
          nullable: false,
          integer: true,
          min: 1,
          initial: 4,
        }),
        cost: text(""),
        owner: text(""),
        note: html(""),
      }), {
        initial: [],
      }),

      npcs: new fields.ArrayField(new fields.SchemaField({
        id: text(""),
        name: text("New NPC"),
        role: text(""),
        loyalty: smallNumber(2, 0, 6),
        note: html(""),
      }), {
        initial: [],
      }),

      threats: new fields.ArrayField(new fields.SchemaField({
        id: text(""),
        name: text("New Threat"),
        level: smallNumber(1, 1, 10),
        clock: smallNumber(0, 0, 6),
        note: html(""),
      }), {
        initial: [],
      }),

      notes: html(""),
    };
  }
}

class BaseActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: SHEET_ID,
      classes: ["mk-shadowdark", "sheet", "actor", "sdx-base-sheet"],
      width: 920,
      height: 820,
      resizable: true,
      submitOnChange: true,
      closeOnSubmit: false,
      scrollY: [".sdx-base-body"],
    });
  }

  get template() {
    return TEMPLATE_PATH;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const system = normalizeBaseSystem(this.actor.system);

    const baseTypes = Object.entries(BASE_TYPE_LABELS).map(([key, label]) => ({
      key,
      label,
      icon: BASE_TYPE_ICONS[key] ?? GAME_ICONS.base,
      selected: system.base.type === key,
    }));

    const selectedBaseType = baseTypes.find((type) => type.selected) ?? baseTypes[0];

    const summaryNumbers = [
      {
        key: "tier",
        label: SUMMARY_NUMBER_LABELS.tier,
        value: system.base.tier,
        path: "base.tier",
        name: "system.base.tier",
        min: 1,
        max: 6,
        icon: GAME_ICONS.tier,
      },
      {
        key: "population",
        label: SUMMARY_NUMBER_LABELS.population,
        value: system.base.population,
        path: "base.population",
        name: "system.base.population",
        min: 0,
        max: 999999,
        icon: GAME_ICONS.population,
      },
      {
        key: "morale",
        label: SUMMARY_NUMBER_LABELS.morale,
        value: system.stats.morale,
        path: "stats.morale",
        name: "system.stats.morale",
        min: 0,
        max: 6,
        icon: GAME_ICONS.morale,
      },
      {
        key: "security",
        label: SUMMARY_NUMBER_LABELS.security,
        value: system.stats.security,
        path: "stats.security",
        name: "system.stats.security",
        min: 0,
        max: 6,
        icon: GAME_ICONS.security,
      },
      {
        key: "supplies",
        label: SUMMARY_NUMBER_LABELS.supplies,
        value: system.stats.supplies,
        path: "stats.supplies",
        name: "system.stats.supplies",
        min: 0,
        max: 6,
        icon: GAME_ICONS.supplies,
      },
      {
        key: "wealth",
        label: SUMMARY_NUMBER_LABELS.wealth,
        value: system.stats.wealth,
        path: "stats.wealth",
        name: "system.stats.wealth",
        min: 0,
        max: 6,
        icon: GAME_ICONS.wealth,
      },
      {
        key: "influence",
        label: SUMMARY_NUMBER_LABELS.influence,
        value: system.stats.influence,
        path: "stats.influence",
        name: "system.stats.influence",
        min: 0,
        max: 6,
        icon: GAME_ICONS.influence,
      },
    ];

    const resources = Object.entries(RESOURCE_LABELS).map(([key, label]) => ({
      key,
      label,
      value: system.resources[key] ?? 0,
      path: `resources.${key}`,
      name: `system.resources.${key}`,
      icon: GAME_ICONS[key] ?? GAME_ICONS.supplies,
    }));

    const facilities = system.facilities.map((facility, index) => ({
      ...facility,
      index,
      icon: GAME_ICONS.facilities,
    }));

    const projects = system.projects.map((project, index) => ({
      ...project,
      index,
      icon: GAME_ICONS.projects,
      complete: Number(project.progress) >= Number(project.target),
    }));

    const npcs = system.npcs.map((npc, index) => ({
      ...npc,
      index,
      icon: GAME_ICONS.npcs,
    }));

    const threats = system.threats.map((threat, index) => ({
      ...threat,
      index,
      icon: GAME_ICONS.threats,
    }));

    const descriptionHTML = await TextEditor.enrichHTML(system.base.description ?? "", {
      secrets: this.actor.isOwner,
      async: true,
      relativeTo: this.actor,
    });

    const notesHTML = await TextEditor.enrichHTML(system.notes ?? "", {
      secrets: this.actor.isOwner,
      async: true,
      relativeTo: this.actor,
    });

    return {
      ...context,
      actor: this.actor,
      editable: this.isEditable,
      owner: this.actor.isOwner,
      system,
      icons: GAME_ICONS,
      baseTypes,
      selectedBaseType,
      summaryNumbers,
      resources,
      facilities,
      projects,
      npcs,
      threats,
      descriptionHTML,
      notesHTML,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='post-status']").on("click", this._onPostStatus.bind(this));
    html.find("[data-action='roll-event']").on("click", this._onRollEvent.bind(this));

    if (!this.isEditable) return;

    html.find("[data-action='pick-image']").on("click", this._onPickImage.bind(this));
    html.find("[data-action='adjust-number']").on("click", this._onAdjustNumber.bind(this));
    html.find("[data-action='add-row']").on("click", this._onAddRow.bind(this));
    html.find("[data-action='delete-row']").on("click", this._onDeleteRow.bind(this));
  }

  async _onPickImage(event) {
    event.preventDefault();

    const picker = new FilePicker({
      type: "image",
      current: this.actor.img,
      callback: async (path) => {
        await this.actor.update({
          img: path,
          "prototypeToken.texture.src": path,
        });
      },
    });

    picker.render(true);
  }

  async _onAdjustNumber(event) {
    event.preventDefault();

    const button = event.currentTarget;
    const path = button.dataset.path;
    const delta = Number(button.dataset.delta ?? 0);

    if (!path) return;

    const current = Number(foundry.utils.getProperty(this.actor.system, path) ?? 0);
    const next = Math.max(0, current + delta);

    await this.actor.update({ [`system.${path}`]: next });
  }

  async _onAddRow(event) {
    event.preventDefault();

    const collection = event.currentTarget.dataset.collection;
    if (!collection) return;

    const system = normalizeBaseSystem(this.actor.system);

    if (collection === "facilities") {
      system.facilities.push({
        id: makeId("facility"),
        name: "New Facility",
        rank: 1,
        condition: "Stable",
        benefit: "",
        note: "",
      });
    }

    if (collection === "projects") {
      system.projects.push({
        id: makeId("project"),
        name: "New Project",
        progress: 0,
        target: 4,
        cost: "",
        owner: "",
        note: "",
      });
    }

    if (collection === "npcs") {
      system.npcs.push({
        id: makeId("npc"),
        name: "New NPC",
        role: "",
        loyalty: 2,
        note: "",
      });
    }

    if (collection === "threats") {
      system.threats.push({
        id: makeId("threat"),
        name: "New Threat",
        level: 1,
        clock: 0,
        note: "",
      });
    }

    await this.actor.update({ [`system.${collection}`]: system[collection] });
  }

  async _onDeleteRow(event) {
    event.preventDefault();

    const collection = event.currentTarget.dataset.collection;
    const rowId = event.currentTarget.dataset.id;

    if (!collection || !rowId) return;

    const system = normalizeBaseSystem(this.actor.system);
    if (!Array.isArray(system[collection])) return;

    system[collection] = system[collection].filter((row) => row.id !== rowId);

    await this.actor.update({ [`system.${collection}`]: system[collection] });
  }

  async _onPostStatus(event) {
    event.preventDefault();

    const system = normalizeBaseSystem(this.actor.system);

    const summary = [
      `Tier: ${system.base.tier}`,
      `Population: ${system.base.population}`,
      `Morale: ${system.stats.morale}/6`,
      `Security: ${system.stats.security}/6`,
      `Supplies: ${system.stats.supplies}/6`,
      `Wealth: ${system.stats.wealth}/6`,
      `Influence: ${system.stats.influence}/6`,
    ].join(", ");

    const resources = Object.entries(RESOURCE_LABELS)
      .map(([key, label]) => `${label}: ${system.resources[key] ?? 0}`)
      .join(", ");

    const activeProjects = system.projects
      .map((project) => {
        const complete = Number(project.progress) >= Number(project.target);
        return `<li>${escapeHTML(project.name)}: ${escapeHTML(project.progress)}/${escapeHTML(project.target)}${complete ? " - Complete" : ""}</li>`;
      })
      .join("");

    const activeThreats = system.threats
      .map((threat) => `<li>${escapeHTML(threat.name)}: Clock ${escapeHTML(threat.clock)}/6, Level ${escapeHTML(threat.level)}</li>`)
      .join("");

    const content = `
      <section class="sdx-base-chat-card">
        <h2>${escapeHTML(this.actor.name)}</h2>
        <p><strong>Type:</strong> ${escapeHTML(BASE_TYPE_LABELS[system.base.type] ?? system.base.type)} | <strong>Location:</strong> ${escapeHTML(system.base.location || "Unknown")}</p>
        <hr>
        <p><strong>Numbers:</strong> ${escapeHTML(summary)}</p>
        <p><strong>Resources:</strong> ${escapeHTML(resources)}</p>
        ${activeProjects ? `<h3>Projects</h3><ul>${activeProjects}</ul>` : ""}
        ${activeThreats ? `<h3>Threats</h3><ul>${activeThreats}</ul>` : ""}
      </section>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
    });
  }

  async _onRollEvent(event) {
    event.preventDefault();

    const baseEvent = BASE_EVENTS[Math.floor(Math.random() * BASE_EVENTS.length)];

    const content = `
      <section class="sdx-base-chat-card">
        <h2>Base Event: ${escapeHTML(baseEvent.title)}</h2>
        <p><strong>${escapeHTML(this.actor.name)}</strong></p>
        <p>${escapeHTML(baseEvent.text)}</p>
      </section>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content,
    });
  }
}

Hooks.once("init", () => {
  const actorTypes = game.documentTypes?.Actor ?? [];
  if (!actorTypes.includes(ACTOR_TYPE)) {
    warn(
      `Actor subtype ${ACTOR_TYPE} is not in game.documentTypes.Actor yet. ` +
      `Check module.json documentTypes.Actor.${ACTOR_SUBTYPE}.`
    );
  }

  registerBaseActorFeature();
});
