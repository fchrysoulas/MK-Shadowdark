(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Damage Traits";
  const ACTOR_TRAITS_FLAG = "damageTraits";
  const FEATURE_TRAITS_FLAG = "npcFeatureTraits";
  const ONLY_MAGICAL_DAMAGE_KEY = "system.damage.immunity.nonmagical";
  const MAGICAL_ATTACKS_KEY = "system.damage.source.magical";
  const TRAIT_EFFECT_KEYS = Object.freeze({
    resistance: "system.damage.resistance.property",
    immunity: "system.damage.immunity.property",
    vulnerability: "system.damage.vulnerability.property"
  });

  const ITEM_TYPES = new Set(["Spell", "NPC Attack", "NPC Special Attack"]);
  const RENDER_MARKER = "mkDamageTraitsRendered";
  const TRAIT_MODES = new Set(["resistance", "immunity", "vulnerability"]);
  const ACTIVE_FEATURE_EFFECT_TABS = new Set();

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }

  function warn(...args) {
    console.warn(`${MODULE_ID} v${getModuleVersion()} | ${SUBMODULE} |`, ...args);
  }

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetForm(root) {
    if (root?.matches?.("form")) return root;
    return root?.querySelector?.("form") ?? root;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value ?? "");
    return String(div.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  function normalizeTraitMode(entry) {
    const mode = String(entry?.mode ?? "").trim().toLowerCase();
    if (TRAIT_MODES.has(mode)) return mode;
    if (mode === "nonmagical-immunity") return "immunity";

    // Migrate the short-lived symbolic resistance formats. Numeric flat DR
    // entries and descriptive traits are removed from damage-trait storage.
    if (["%", "&"].includes(String(entry?.reduction ?? "").trim())) return "resistance";
    return null;
  }

  function traitModeLabel(mode) {
    const normalized = TRAIT_MODES.has(mode) ? mode : "resistance";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function hasMagicalProperty(properties) {
    return Array.from(properties ?? []).some(property => {
      const name = String(property?.name ?? "").trim().toLowerCase();
      return ["magic", "magical", "magic weapon", "magical weapon"].includes(name);
    });
  }

  function isMagicalWeapon(weapon, properties = []) {
    if (!weapon || weapon.type !== "Weapon") return false;
    return weapon.system?.magicItem === true
      || hasMagicalProperty(properties);
  }

  function normalizeTraits(value) {
    if (!Array.isArray(value)) return [];

    const records = new Map();
    for (const entry of value) {
      const uuid = typeof entry === "string" ? entry : entry?.uuid;
      if (!uuid) continue;
      const mode = normalizeTraitMode(typeof entry === "string" ? {} : entry);
      if (!mode) continue;
      records.set(String(uuid), {
        uuid: String(uuid),
        mode
      });
    }
    return [...records.values()];
  }

  function getLegacyFeatureTraits(feature) {
    const nativeUuids = Array.from(feature?.system?.properties ?? []).filter(Boolean).map(String);
    const flagValue = feature?.getFlag?.(MODULE_ID, FEATURE_TRAITS_FLAG)
      ?? feature?.flags?.[MODULE_ID]?.[FEATURE_TRAITS_FLAG];
    const flagRecords = normalizeTraits(flagValue);
    const nativeSet = new Set(nativeUuids);
    return flagRecords.filter(record => nativeSet.has(record.uuid));
  }

  function traitModeFromEffectKey(key) {
    return Object.entries(TRAIT_EFFECT_KEYS).find(([, effectKey]) => effectKey === key)?.[0] ?? null;
  }

  function effectTraitRecords(effects, { activeOnly = true } = {}) {
    const records = new Map();
    for (const effect of collectionValues(effects)) {
      if (activeOnly && (effect?.disabled || effect?.isSuppressed)) continue;
      for (const change of effect?.changes ?? []) {
        const mode = traitModeFromEffectKey(change.key);
        const uuid = String(change.value ?? "").trim();
        if (!mode || !uuid) continue;
        records.set(`${uuid}:${mode}`, { uuid, mode });
      }
    }
    return [...records.values()];
  }

  function getFeatureTraits(feature, { activeOnly = true, includeLegacy = true } = {}) {
    const records = new Map(effectTraitRecords(feature?.effects, { activeOnly })
      .map(record => [`${record.uuid}:${record.mode}`, record]));
    if (includeLegacy) {
      for (const record of getLegacyFeatureTraits(feature)) {
        records.set(`${record.uuid}:${record.mode}`, record);
      }
    }
    return [...records.values()];
  }

  function actorTraitEffects(actor) {
    const effects = new Set();
    const addEffects = collection => {
      for (const effect of collectionValues(collection)) effects.add(effect);
    };

    addEffects(actor?.appliedEffects);
    addEffects(actor?.effects);
    try {
      addEffects(actor?.allApplicableEffects?.());
    } catch (_error) {
      // Foundry v13 does not expose allApplicableEffects consistently.
    }
    for (const item of collectionValues(actor?.items)) {
      for (const effect of collectionValues(item?.effects)) {
        if (effect?.transfer === true) effects.add(effect);
      }
    }
    return [...effects];
  }

  function getActorTraits(actor) {
    const legacyEmbedded = collectionValues(actor?.items)
      .filter(item => item?.type === "NPC Feature")
      .flatMap(getLegacyFeatureTraits);
    const effects = effectTraitRecords(actorTraitEffects(actor));
    const legacy = normalizeTraits(
      actor?.getFlag?.(MODULE_ID, ACTOR_TRAITS_FLAG)
      ?? actor?.flags?.[MODULE_ID]?.[ACTOR_TRAITS_FLAG]
    );
    const records = new Map();
    for (const record of [...effects, ...legacyEmbedded, ...legacy]) {
      records.set(`${record.uuid}:${record.mode}`, record);
    }
    return [...records.values()];
  }

  async function resolveProperty(uuid) {
    if (!uuid) return null;
    try {
      const property = await fromUuid(uuid);
      return property?.type === "Property" ? property : null;
    } catch (_error) {
      return null;
    }
  }

  async function resolveProperties(uuids) {
    const unique = [...new Set(Array.from(uuids ?? []).filter(Boolean).map(String))];
    const properties = await Promise.all(unique.map(resolveProperty));
    return properties.filter(Boolean);
  }

  function collectionValues(collection) {
    if (!collection) return [];
    if (Array.isArray(collection)) return collection;
    if (Array.isArray(collection.contents)) return collection.contents;
    if (typeof collection.values === "function") return [...collection.values()];
    return Array.from(collection);
  }

  function actorEffects(actor) {
    const effects = new Set();
    const addEffects = collection => {
      for (const effect of collectionValues(collection)) effects.add(effect);
    };

    addEffects(actor?.appliedEffects);
    addEffects(actor?.effects);
    try {
      addEffects(actor?.allApplicableEffects?.());
    } catch (_error) {
      // Foundry v13 does not expose allApplicableEffects consistently.
    }
    for (const item of collectionValues(actor?.items)) addEffects(item?.effects);
    return [...effects];
  }

  function hasTruthyEffectChange(actor, key) {
    return actorEffects(actor).some(effect => (
      !effect.disabled
      && !effect.isSuppressed
      && Array.from(effect.changes ?? []).some(change => (
        change.key === key
        && !["", "0", "false"].includes(String(change.value ?? "").trim().toLowerCase())
      ))
    ));
  }

  function hasOnlyMagicalDamageEffect(actor) {
    return hasTruthyEffectChange(actor, ONLY_MAGICAL_DAMAGE_KEY);
  }

  function hasMagicalAttacksEffect(actor) {
    return hasTruthyEffectChange(actor, MAGICAL_ATTACKS_KEY);
  }

  function registerDamageTraitTranslations() {
    const translations = CONFIG.SHADOWDARK?.EFFECT_TRANSLATIONS;
    if (!translations) return;
    translations[TRAIT_EFFECT_KEYS.resistance] = "Damage Resistance Property";
    translations[TRAIT_EFFECT_KEYS.immunity] = "Damage Immunity Property";
    translations[TRAIT_EFFECT_KEYS.vulnerability] = "Damage Vulnerability Property";
  }

  function hasPropertyType(property, itemType = null) {
    if (!itemType) return true;
    return String(property?.system?.itemType ?? "").toLowerCase() === itemType;
  }

  async function getAvailableProperties(selectedUuids = [], { itemType = null } = {}) {
    const properties = new Map();
    const normalizedItemType = String(itemType ?? "").trim().toLowerCase() || null;

    for (const item of collectionValues(game.items)) {
      if (item?.type === "Property" && item.uuid && hasPropertyType(item, normalizedItemType)) {
        properties.set(item.uuid, item);
      }
    }

    try {
      const compendiumProperties = await globalThis.shadowdark?.compendiums?.properties?.();
      for (const entry of collectionValues(compendiumProperties)) {
        if (!entry?.uuid || !hasPropertyType(entry, normalizedItemType)) continue;
        properties.set(entry.uuid, entry);
      }
    } catch (error) {
      warn("Could not load Shadowdark property compendiums", error);
    }

    for (const property of await resolveProperties(selectedUuids)) {
      if (hasPropertyType(property, normalizedItemType)) properties.set(property.uuid, property);
    }

    return [...properties.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  function propertyTooltip(property) {
    return stripHtml(property?.system?.description) || "Shadowdark property";
  }

  async function renderPropertyTags(uuids, modes = new Map()) {
    const properties = await resolveProperties(uuids);
    if (!properties.length) return '<li class="mk-damage-traits-empty">None</li>';

    return properties.map(property => {
      const mode = modes.get(property.uuid) ?? "none";
      const suffix = mode !== "none"
        ? ` <strong>${escapeHtml(traitModeLabel(mode))}</strong>`
        : "";
      return `<li class="tag tag_primary" data-tooltip="${escapeHtml(propertyTooltip(property))}">${escapeHtml(property.name)}${suffix}</li>`;
    }).join("");
  }

  function makeTraitsBox({ label, tagsHtml, editable, onEdit }) {
    const box = document.createElement("div");
    box.className = "SD-box mk-damage-traits-box";
    box.innerHTML = `
      <div class="header light">
        <label>${escapeHtml(label)}</label>
        ${editable ? `
          <span class="mk-damage-traits-actions">
            <button type="button" data-mk-action="select-properties" data-tooltip="Select properties"><i class="fas fa-pen-to-square"></i></button>
          </span>
        ` : ""}
      </div>
      <div class="content"><ul class="tags">${tagsHtml}</ul></div>
    `;

    box.querySelector('[data-mk-action="select-properties"]')?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void onEdit();
    });
    return box;
  }

  async function createDamageTraitEffects(feature) {
    const properties = await getAvailableProperties();
    const rows = properties.map(property => `
      <label class="mk-damage-trait-choice">
        <input type="checkbox" name="property" value="${escapeHtml(property.uuid)}">
        <span>${escapeHtml(property.name)}</span>
      </label>
    `).join("");

    const result = await Dialog.wait({
      title: `Add Damage Trait Effects: ${feature.name}`,
      content: `
        <form class="mk-damage-traits-dialog">
          <div class="form-group">
            <label>Trait</label>
            <select name="mode">
              ${[...TRAIT_MODES].map(mode => `<option value="${mode}">${traitModeLabel(mode)}</option>`).join("")}
            </select>
          </div>
          <p class="notes">Each selected Property becomes a transferring Active Effect on this NPC Feature.</p>
          <div class="mk-damage-trait-choices">${rows || "<p>No Property items are available.</p>"}</div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Add Effects",
          callback: html => {
            const root = dialogRoot(html);
            return {
              mode: root.querySelector('select[name="mode"]')?.value,
              uuids: [...root.querySelectorAll('input[name="property"]:checked')].map(input => input.value)
            };
          }
        },
        cancel: { label: "Cancel", callback: () => null }
      },
      default: "save",
      close: () => null
    });

    if (!result?.uuids?.length || !TRAIT_MODES.has(result.mode)) return;
    await addTraitEffects(feature, result.uuids.map(uuid => ({ uuid, mode: result.mode })));
  }

  async function addTraitEffects(feature, records) {
    const normalized = normalizeTraits(records);
    const existing = new Set(getFeatureTraits(feature, { activeOnly: false, includeLegacy: false })
      .map(record => `${record.uuid}:${record.mode}`));
    const additions = normalized.filter(record => !existing.has(`${record.uuid}:${record.mode}`));
    if (!additions.length) return [];

    const properties = await resolveProperties(additions.map(record => record.uuid));
    const propertyByUuid = new Map(properties.map(property => [property.uuid, property]));
    const effectData = additions.map(record => {
      const property = propertyByUuid.get(record.uuid);
      const propertyName = property?.name ?? record.uuid;
      return {
        name: `${propertyName} ${traitModeLabel(record.mode)}`,
        img: property?.img || "icons/svg/aura.svg",
        origin: feature.uuid,
        transfer: true,
        disabled: false,
        changes: [{
          key: TRAIT_EFFECT_KEYS[record.mode],
          mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
          value: record.uuid
        }],
        flags: {
          [MODULE_ID]: {
            damageTrait: true
          }
        }
      };
    });
    return feature.createEmbeddedDocuments("ActiveEffect", effectData);
  }

  async function createBlankFeatureEffect(feature) {
    const [effect] = await feature.createEmbeddedDocuments("ActiveEffect", [{
      name: "New Effect",
      img: "icons/commodities/tech/cog-steel-grey.webp",
      origin: feature.uuid,
      transfer: true,
      disabled: false,
      changes: []
    }]);
    effect?.sheet?.render(true);
  }

  async function effectChangeSummary(effect) {
    const summaries = [];
    for (const change of effect?.changes ?? []) {
      const mode = traitModeFromEffectKey(change.key);
      if (mode) {
        const property = await resolveProperty(String(change.value ?? "").trim());
        summaries.push(`${traitModeLabel(mode)}: ${property?.name ?? change.value}`);
        continue;
      }
      const label = CONFIG.SHADOWDARK?.EFFECT_TRANSLATIONS?.[change.key] ?? change.key;
      summaries.push(`${label}: ${change.value}`);
    }
    return summaries.join("; ") || "No changes";
  }

  async function makeFeatureEffectsContent({ feature, editable }) {
    const wrapper = document.createElement("div");
    wrapper.className = "mk-npc-feature-effects";
    const note = document.createElement("p");
    note.className = "notes mk-feature-effect-notes";
    note.textContent = "Enabled effects with Transfer active apply to the NPC that owns this Feature.";
    wrapper.appendChild(note);

    if (editable) {
      const predefined = Object.entries(CONFIG.SHADOWDARK?.PREDEFINED_EFFECTS ?? {})
        .sort((left, right) => String(left[1]?.name).localeCompare(String(right[1]?.name)));
      const toolbar = document.createElement("div");
      toolbar.className = "mk-feature-effect-toolbar";
      toolbar.innerHTML = `
        <button type="button" data-mk-effect-action="add-trait"><i class="fas fa-shield-halved"></i> Add Damage Trait</button>
        <select data-mk-predefined-effect>
          <option value="">Predefined effect...</option>
          ${predefined.map(([key, data]) => `<option value="${escapeHtml(key)}">${escapeHtml(data.name)}</option>`).join("")}
        </select>
        <button type="button" data-mk-effect-action="add-predefined" data-tooltip="Add predefined effect"><i class="fas fa-plus"></i></button>
        <button type="button" data-mk-effect-action="create"><i class="fas fa-plus"></i> New Effect</button>
      `;
      wrapper.appendChild(toolbar);

      toolbar.querySelector('[data-mk-effect-action="add-trait"]')?.addEventListener("click", event => {
        event.preventDefault();
        void createDamageTraitEffects(feature);
      });
      toolbar.querySelector('[data-mk-effect-action="add-predefined"]')?.addEventListener("click", event => {
        event.preventDefault();
        const key = toolbar.querySelector("[data-mk-predefined-effect]")?.value;
        if (key) void globalThis.shadowdark?.effects?.createPredefinedEffect?.(feature, key);
      });
      toolbar.querySelector('[data-mk-effect-action="create"]')?.addEventListener("click", event => {
        event.preventDefault();
        void createBlankFeatureEffect(feature);
      });
    }

    const list = document.createElement("ol");
    list.className = "mk-feature-effect-list";
    const effects = collectionValues(feature.effects);
    if (!effects.length) {
      list.innerHTML = '<li class="mk-damage-traits-empty">No effects</li>';
    } else {
      for (const effect of effects) {
        const row = document.createElement("li");
        row.className = `mk-feature-effect-row${effect.disabled ? " disabled" : ""}`;
        row.innerHTML = `
          <img src="${escapeHtml(effect.img || "icons/svg/aura.svg")}" alt="">
          <span class="mk-feature-effect-description">
            <strong>${escapeHtml(effect.name)}</strong>
            <small>${escapeHtml(await effectChangeSummary(effect))}</small>
          </span>
          <span class="mk-feature-effect-transfer${effect.transfer === false ? " inactive" : ""}" data-tooltip="${effect.transfer === false ? "Does not transfer" : "Transfers to NPC"}">
            <i class="fas fa-right-left"></i>
          </span>
          ${editable ? `
            <span class="mk-feature-effect-actions">
              <button type="button" data-mk-effect-action="toggle" data-effect-id="${escapeHtml(effect.id)}" data-tooltip="${effect.disabled ? "Enable" : "Disable"}"><i class="fas fa-power-off"></i></button>
              <button type="button" data-mk-effect-action="transfer" data-effect-id="${escapeHtml(effect.id)}" data-tooltip="Toggle Transfer"><i class="fas fa-right-left"></i></button>
              <button type="button" data-mk-effect-action="edit" data-effect-id="${escapeHtml(effect.id)}" data-tooltip="Edit"><i class="fas fa-pen-to-square"></i></button>
              <button type="button" data-mk-effect-action="delete" data-effect-id="${escapeHtml(effect.id)}" data-tooltip="Delete"><i class="fas fa-trash"></i></button>
            </span>
          ` : ""}
        `;
        list.appendChild(row);
      }
    }
    wrapper.appendChild(list);

    list.addEventListener("click", event => {
      const button = event.target.closest?.("[data-mk-effect-action]");
      if (!button) return;
      event.preventDefault();
      const effect = feature.effects?.get?.(button.dataset.effectId)
        ?? collectionValues(feature.effects).find(entry => entry.id === button.dataset.effectId);
      if (!effect) return;
      if (button.dataset.mkEffectAction === "toggle") void effect.update({ disabled: !effect.disabled });
      if (button.dataset.mkEffectAction === "transfer") void effect.update({ transfer: effect.transfer === false });
      if (button.dataset.mkEffectAction === "edit") effect.sheet?.render(true);
      if (button.dataset.mkEffectAction === "delete") void effect.delete();
    });
    return wrapper;
  }

  async function addNpcFeatureEffectsTab(form, feature, editable) {
    const nav = form.querySelector("nav.SD-nav");
    const content = form.querySelector(".SD-content-body");
    if (!nav || !content || nav.querySelector('[data-tab="tab-effects"]')) return;

    const navLink = document.createElement("a");
    navLink.className = "navigation-tab";
    navLink.dataset.tab = "tab-effects";
    navLink.textContent = "Effects";

    const tab = document.createElement("section");
    tab.className = "tab tab-effects mk-npc-feature-effects-tab";
    tab.dataset.group = "primary";
    tab.dataset.tab = "tab-effects";
    tab.appendChild(await makeFeatureEffectsContent({ feature, editable }));
    if (!form.isConnected) return;

    nav.appendChild(navLink);
    content.appendChild(tab);

    const featureKey = feature.uuid ?? feature.id;
    const activateEffectsTab = () => {
      for (const link of nav.querySelectorAll(".navigation-tab")) link.classList.remove("active");
      for (const section of content.querySelectorAll('.tab[data-group="primary"]')) section.classList.remove("active");
      navLink.classList.add("active");
      tab.classList.add("active");
    };

    navLink.addEventListener("click", event => {
      event.preventDefault();
      if (featureKey) ACTIVE_FEATURE_EFFECT_TABS.add(featureKey);
      activateEffectsTab();
    });

    for (const link of nav.querySelectorAll('.navigation-tab:not([data-tab="tab-effects"])')) {
      link.addEventListener("click", () => {
        if (featureKey) ACTIVE_FEATURE_EFFECT_TABS.delete(featureKey);
        navLink.classList.remove("active");
        tab.classList.remove("active");
      });
    }

    if (featureKey && ACTIVE_FEATURE_EFFECT_TABS.has(featureKey)) activateEffectsTab();
  }

  function isPrimaryActiveGM() {
    if (!game.user?.isGM) return false;
    const activeGM = game.users?.activeGM;
    if (activeGM) return activeGM.id === game.user.id;
    return collectionValues(game.users).find(user => user?.active && user?.isGM)?.id === game.user.id;
  }

  async function migrateDamageTraitsToEffects() {
    if (!isPrimaryActiveGM()) return;

    for (const actor of collectionValues(game.actors).filter(entry => entry?.type === "NPC")) {
      const legacyValue = actor?.getFlag?.(MODULE_ID, ACTOR_TRAITS_FLAG)
        ?? actor?.flags?.[MODULE_ID]?.[ACTOR_TRAITS_FLAG];
      const legacy = normalizeTraits(legacyValue);

      try {
        let legacyFeature = null;
        if (legacy.length) {
          legacyFeature = collectionValues(actor.items).find(item => (
            item?.type === "NPC Feature" && item.name === "Creature Properties"
          ));
          if (!legacyFeature) {
            [legacyFeature] = await actor.createEmbeddedDocuments("Item", [{
              name: "Creature Properties",
              type: "NPC Feature"
            }]);
          }
          await addTraitEffects(legacyFeature, legacy);
          await actor.unsetFlag(MODULE_ID, ACTOR_TRAITS_FLAG);
        }

        for (const feature of collectionValues(actor.items).filter(item => item?.type === "NPC Feature")) {
          const records = getLegacyFeatureTraits(feature);
          if (!records.length) continue;
          await addTraitEffects(feature, records);
          const migratedUuids = new Set(records.map(record => record.uuid));
          const retainedProperties = Array.from(feature.system?.properties ?? [])
            .filter(uuid => !migratedUuids.has(String(uuid)));
          await feature.update({ "system.properties": retainedProperties });
          await feature.unsetFlag(MODULE_ID, FEATURE_TRAITS_FLAG);
        }
      } catch (error) {
        warn(`Could not migrate damage traits to Active Effects for ${actor.name}`, error);
      }
    }
  }

  function dialogRoot(html) {
    return html?.[0] ?? html;
  }

  async function selectItemProperties(item) {
    const selected = new Set(Array.from(item?.system?.properties ?? []).map(String));
    const itemType = item.type === "NPC Attack" ? "weapon" : null;
    const properties = await getAvailableProperties(selected, { itemType });
    const propertyHint = itemType === "weapon"
      ? "NPC attacks can use Weapon-type Properties only."
      : "Selected properties are stored in Shadowdark's native item property list.";
    const rows = properties.map(property => `
      <label class="mk-damage-trait-choice">
        <input type="checkbox" name="property" value="${escapeHtml(property.uuid)}"${selected.has(property.uuid) ? " checked" : ""}>
        <span>${escapeHtml(property.name)}</span>
      </label>
    `).join("");

    const result = await Dialog.wait({
      title: `Properties: ${item.name}`,
      content: `
        <form class="mk-damage-traits-dialog">
          <p class="notes">${propertyHint}</p>
          <div class="mk-damage-trait-choices">${rows || "<p>No Property items are available.</p>"}</div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: html => [...dialogRoot(html).querySelectorAll('input[name="property"]:checked')].map(input => input.value)
        },
        cancel: { label: "Cancel", callback: () => null }
      },
      default: "save",
      close: () => null
    });

    if (!result) return;
    await item.update({ "system.properties": result });
  }

  async function renderItemTraits(app, html) {
    if (game.system?.id !== "shadowdark") return;
    const item = app?.item ?? app?.object;
    if (!item || (!ITEM_TYPES.has(item.type) && item.type !== "NPC Feature")) return;

    const root = getRootElement(html);
    const form = getSheetForm(root);
    if (!form?.querySelector || form.dataset[RENDER_MARKER]) return;
    form.dataset[RENDER_MARKER] = "true";

    const editable = Boolean(app?.isEditable ?? item.isOwner);
    if (item.type === "NPC Feature") {
      await addNpcFeatureEffectsTab(form, item, editable);
      return;
    }

    const tab = form.querySelector('.tab[data-tab="tab-details"]');
    const uuids = Array.from(item.system?.properties ?? []);
    const tagsHtml = await renderPropertyTags(uuids);
    if (!form.isConnected) return;

    const box = makeTraitsBox({
      label: "Properties",
      tagsHtml,
      editable,
      onEdit: () => selectItemProperties(item)
    });
    tab?.appendChild(box);
  }

  async function getSourceContext(message) {
    const rollConfig = message?.getFlag?.("shadowdark", "rollConfig")
      ?? message?.flags?.shadowdark?.rollConfig;
    const itemUuid = rollConfig?.itemUuid ?? rollConfig?.cast?.spellUuid;
    const spellRoll = rollConfig?.type === "spell" || Boolean(rollConfig?.cast?.spellUuid);
    if (!itemUuid) {
      return {
        item: null,
        properties: [],
        isWeapon: false,
        isMagicalWeapon: false,
        isMagicalSource: spellRoll,
        magicSource: spellRoll ? "spell" : null
      };
    }

    let item = null;
    try {
      item = await fromUuid(itemUuid);
    } catch (_error) {
      return {
        item: null,
        properties: [],
        isWeapon: false,
        isMagicalWeapon: false,
        isMagicalSource: spellRoll,
        magicSource: spellRoll ? "spell" : null
      };
    }
    const properties = await resolveProperties(item?.system?.properties ?? []);
    const magicalWeapon = isMagicalWeapon(item, properties);
    const magicalProperty = hasMagicalProperty(properties);
    const sourceActor = item?.actor
      ?? (item?.parent?.documentName === "Actor" ? item.parent : null);
    const attackSource = ["Weapon", "NPC Attack", "NPC Special Attack"].includes(item?.type);
    const magicalAttacks = attackSource && hasMagicalAttacksEffect(sourceActor);
    const spellSource = spellRoll
      || ["Spell", "Scroll", "Wand"].includes(item?.type)
      || item?.system?.isSpell === true
      || item?.system?.isScroll === true
      || item?.system?.isWand === true;
    const magicSource = spellSource
      ? "spell"
      : magicalAttacks
        ? "actor-effect"
        : item?.system?.magicItem === true
          ? "permanent"
          : magicalProperty
            ? "property"
            : null;
    return {
      item,
      properties,
      isWeapon: item?.type === "Weapon",
      isMagicalWeapon: magicalWeapon || (item?.type === "Weapon" && magicalAttacks),
      isMagicalSource: spellSource || magicalWeapon || magicalProperty || magicalAttacks,
      magicSource
    };
  }

  async function getSourceProperties(message) {
    return (await getSourceContext(message)).properties;
  }

  function calculateReduction(actor, sourceProperties, damage = 0, sourceContext = {}) {
    const sourceUuids = new Set(Array.from(sourceProperties ?? []).map(property => (
      typeof property === "string" ? property : property?.uuid
    )).filter(Boolean));
    const incomingDamage = Math.max(0, Number(damage) || 0);
    const candidates = getActorTraits(actor)
      .filter(record => sourceUuids.has(record.uuid));
    const matching = candidates;
    const modes = new Set(matching.map(record => record.mode));
    const onlyMagical = hasOnlyMagicalDamageEffect(actor);

    let mode = null;
    let appliedDamage = incomingDamage;

    if (onlyMagical && sourceContext?.isMagicalSource !== true) {
      mode = "nonmagical-immunity";
      appliedDamage = 0;
    } else if (modes.has("immunity")) {
      mode = "immunity";
      appliedDamage = 0;
    } else if (modes.has("resistance") && modes.has("vulnerability")) {
      mode = "neutral";
    } else if (modes.has("resistance")) {
      mode = "resistance";
      appliedDamage = incomingDamage > 0
        ? Math.max(1, Math.floor(incomingDamage * 0.5))
        : 0;
    } else if (modes.has("vulnerability")) {
      mode = "vulnerability";
      appliedDamage = incomingDamage * 2;
    }

    return {
      reduction: Math.max(0, incomingDamage - appliedDamage),
      increase: Math.max(0, appliedDamage - incomingDamage),
      mode,
      appliedDamage,
      matching,
      onlyMagical,
      bypassed: []
    };
  }

  async function resolveReduction(actor, sourceProperties, damage = 0, sourceContext = {}) {
    const result = calculateReduction(actor, sourceProperties, damage, sourceContext);
    if (!result.matching.length) {
      return {
        ...result,
        propertyNames: result.mode === "nonmagical-immunity" ? ["Nonmagical source"] : []
      };
    }

    const properties = await resolveProperties(result.matching.map(record => record.uuid));
    const names = new Map(properties.map(property => [property.uuid, property.name]));
    return {
      ...result,
      propertyNames: result.matching.map(record => names.get(record.uuid)).filter(Boolean)
    };
  }

  function exposeApi() {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api ??= {};
    mod.api.damageTraits = {
      getFeatureTraits,
      getActorTraits,
      getSourceContext,
      getSourceProperties,
      calculateReduction,
      resolveReduction,
      hasOnlyMagicalDamageEffect,
      hasMagicalAttacksEffect,
      isMagicalWeapon,
      addTraitEffects,
      selectItemProperties
    };
  }

  Hooks.once("init", () => {
    registerDamageTraitTranslations();
    exposeApi();
  });
  Hooks.once("ready", () => {
    exposeApi();
    void migrateDamageTraitsToEffects();
  });

  for (const hook of ["renderItemSheet", "renderShadowdarkItemSheet", "renderShadowdarkItemSheetV2", "renderItemSheetShadowdark"]) {
    Hooks.on(hook, (app, html) => void renderItemTraits(app, html).catch(error => warn("Item sheet render failed", error)));
  }
})();
