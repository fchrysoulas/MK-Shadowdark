(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Damage Traits";
  const ACTOR_TRAITS_FLAG = "damageTraits";
  const FEATURE_TRAITS_FLAG = "npcFeatureTraits";
  const TEMPORARY_ENCHANTMENT_FLAG = "temporaryMagicalEnchantment";

  const ITEM_TYPES = new Set(["Spell", "NPC Attack", "NPC Special Attack"]);
  const RENDER_MARKER = "mkDamageTraitsRendered";
  const TRAIT_MODES = new Set(["resistance", "immunity", "vulnerability"]);
  const ACTIVE_FEATURE_TRAIT_TABS = new Set();

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

  function traitGroupLabel(mode) {
    return {
      resistance: "Resistances",
      immunity: "Immunities",
      vulnerability: "Vulnerabilities"
    }[mode] ?? "Traits";
  }

  function getTemporaryEnchantment(weapon) {
    const value = weapon?.getFlag?.(MODULE_ID, TEMPORARY_ENCHANTMENT_FLAG)
      ?? weapon?.flags?.[MODULE_ID]?.[TEMPORARY_ENCHANTMENT_FLAG];
    if (!value || value.active === false) return null;
    return {
      active: true,
      source: String(value.source ?? "").trim(),
      startedAt: Number(value.startedAt) || null
    };
  }

  function isTemporaryMagicalEnchantmentActive(weapon) {
    return Boolean(getTemporaryEnchantment(weapon));
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
      || isTemporaryMagicalEnchantmentActive(weapon)
      || hasMagicalProperty(properties);
  }

  async function setTemporaryMagicalEnchantment(weapon, { active = true, source = "" } = {}) {
    if (!weapon || weapon.type !== "Weapon") throw new Error("Temporary magical enchantments require a Weapon item.");
    if (!active) {
      await weapon.unsetFlag(MODULE_ID, TEMPORARY_ENCHANTMENT_FLAG);
      return null;
    }

    const existing = getTemporaryEnchantment(weapon);
    const enchantment = {
      active: true,
      source: String(source ?? "").trim(),
      startedAt: existing?.startedAt ?? Date.now()
    };
    await weapon.setFlag(MODULE_ID, TEMPORARY_ENCHANTMENT_FLAG, enchantment);
    return enchantment;
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

  function getFeatureTraits(feature) {
    const nativeUuids = Array.from(feature?.system?.properties ?? []).filter(Boolean).map(String);
    const flagValue = feature?.getFlag?.(MODULE_ID, FEATURE_TRAITS_FLAG)
      ?? feature?.flags?.[MODULE_ID]?.[FEATURE_TRAITS_FLAG];
    const flagRecords = normalizeTraits(flagValue);
    const nativeSet = new Set(nativeUuids);
    return flagRecords.filter(record => nativeSet.has(record.uuid));
  }

  function getActorTraits(actor) {
    const embedded = collectionValues(actor?.items)
      .filter(item => item?.type === "NPC Feature")
      .flatMap(getFeatureTraits);
    const legacy = normalizeTraits(
      actor?.getFlag?.(MODULE_ID, ACTOR_TRAITS_FLAG)
      ?? actor?.flags?.[MODULE_ID]?.[ACTOR_TRAITS_FLAG]
    );
    const records = new Map();
    for (const record of [...embedded, ...legacy]) {
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

  async function getAvailableProperties(selectedUuids = []) {
    const properties = new Map();

    for (const item of collectionValues(game.items)) {
      if (item?.type === "Property" && item.uuid) properties.set(item.uuid, item);
    }

    try {
      const compendiumProperties = await globalThis.shadowdark?.compendiums?.properties?.();
      for (const entry of collectionValues(compendiumProperties)) {
        if (!entry?.uuid) continue;
        properties.set(entry.uuid, entry);
      }
    } catch (error) {
      warn("Could not load Shadowdark property compendiums", error);
    }

    for (const property of await resolveProperties(selectedUuids)) {
      properties.set(property.uuid, property);
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

  async function saveFeatureTraits(feature, records) {
    const normalized = normalizeTraits(records);
    await feature.update({
      "system.properties": normalized.map(record => record.uuid),
      [`flags.${MODULE_ID}.${FEATURE_TRAITS_FLAG}`]: normalized
    });
  }

  async function setFeatureTraitProperties(feature, mode, uuids) {
    const selected = new Set(Array.from(uuids ?? []).filter(Boolean).map(String));
    const retained = getFeatureTraits(feature).filter(record => (
      record.mode !== mode && !selected.has(record.uuid)
    ));
    await saveFeatureTraits(feature, [
      ...retained,
      ...[...selected].map(uuid => ({ uuid, mode }))
    ]);
  }

  async function selectFeatureTraitProperties(feature, mode) {
    const records = getFeatureTraits(feature);
    const selected = new Set(records.filter(record => record.mode === mode).map(record => record.uuid));
    const properties = await getAvailableProperties(records.map(record => record.uuid));
    const rows = properties.map(property => `
      <label class="mk-damage-trait-choice">
        <input type="checkbox" name="property" value="${escapeHtml(property.uuid)}"${selected.has(property.uuid) ? " checked" : ""}>
        <span>${escapeHtml(property.name)}</span>
      </label>
    `).join("");

    const result = await Dialog.wait({
      title: `${traitModeLabel(mode)} Properties: ${feature.name}`,
      content: `
        <form class="mk-damage-traits-dialog">
          <p class="notes">Choose the Properties this NPC Feature treats as ${traitModeLabel(mode).toLowerCase()}.</p>
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
    await setFeatureTraitProperties(feature, mode, result);
  }

  async function makeFeatureTraitGroup({ feature, mode, editable }) {
    const uuids = getFeatureTraits(feature)
      .filter(record => record.mode === mode)
      .map(record => record.uuid);
    const tagsHtml = await renderPropertyTags(uuids);
    return makeTraitsBox({
      label: traitGroupLabel(mode),
      tagsHtml,
      editable,
      onEdit: () => selectFeatureTraitProperties(feature, mode)
    });
  }

  async function makeFeatureTraitsContent({ feature, editable }) {
    const wrapper = document.createElement("div");
    wrapper.className = "mk-npc-feature-traits-groups";
    const note = document.createElement("p");
    note.className = "notes mk-feature-trait-notes";
    note.textContent = "Assign Properties to this NPC Feature as resistances, immunities, or vulnerabilities.";
    wrapper.appendChild(note);
    for (const mode of TRAIT_MODES) {
      wrapper.appendChild(await makeFeatureTraitGroup({ feature, mode, editable }));
    }
    return wrapper;
  }

  async function addNpcFeatureTraitsTab(form, feature, editable) {
    const nav = form.querySelector("nav.SD-nav");
    const content = form.querySelector(".SD-content-body");
    if (!nav || !content || nav.querySelector('[data-tab="tab-traits"]')) return;

    const navLink = document.createElement("a");
    navLink.className = "navigation-tab";
    navLink.dataset.tab = "tab-traits";
    navLink.textContent = "Traits";

    const tab = document.createElement("section");
    tab.className = "tab tab-traits mk-npc-feature-traits-tab";
    tab.dataset.group = "primary";
    tab.dataset.tab = "tab-traits";
    tab.appendChild(await makeFeatureTraitsContent({ feature, editable }));
    if (!form.isConnected) return;

    nav.appendChild(navLink);
    content.appendChild(tab);

    const featureKey = feature.uuid ?? feature.id;
    const activateTraitsTab = () => {
      for (const link of nav.querySelectorAll(".navigation-tab")) link.classList.remove("active");
      for (const section of content.querySelectorAll('.tab[data-group="primary"]')) section.classList.remove("active");
      navLink.classList.add("active");
      tab.classList.add("active");
    };

    navLink.addEventListener("click", event => {
      event.preventDefault();
      if (featureKey) ACTIVE_FEATURE_TRAIT_TABS.add(featureKey);
      activateTraitsTab();
    });

    for (const link of nav.querySelectorAll('.navigation-tab:not([data-tab="tab-traits"])')) {
      link.addEventListener("click", () => {
        if (featureKey) ACTIVE_FEATURE_TRAIT_TABS.delete(featureKey);
        navLink.classList.remove("active");
        tab.classList.remove("active");
      });
    }

    if (featureKey && ACTIVE_FEATURE_TRAIT_TABS.has(featureKey)) activateTraitsTab();
  }

  function isPrimaryActiveGM() {
    if (!game.user?.isGM) return false;
    const activeGM = game.users?.activeGM;
    if (activeGM) return activeGM.id === game.user.id;
    return collectionValues(game.users).find(user => user?.active && user?.isGM)?.id === game.user.id;
  }

  async function migrateActorTraitsToNpcFeatures() {
    if (!isPrimaryActiveGM()) return;

    for (const actor of collectionValues(game.actors).filter(entry => entry?.type === "NPC")) {
      const legacyValue = actor?.getFlag?.(MODULE_ID, ACTOR_TRAITS_FLAG)
        ?? actor?.flags?.[MODULE_ID]?.[ACTOR_TRAITS_FLAG];
      if (!Array.isArray(legacyValue) || !legacyValue.length) continue;
      const legacy = normalizeTraits(legacyValue);

      try {
        if (!legacy.length) {
          await actor.unsetFlag(MODULE_ID, ACTOR_TRAITS_FLAG);
          continue;
        }
        let feature = collectionValues(actor.items).find(item => (
          item?.type === "NPC Feature" && item.name === "Creature Properties"
        ));
        const merged = new Map((feature ? getFeatureTraits(feature) : []).map(record => [record.uuid, record]));
        for (const record of legacy) merged.set(record.uuid, record);
        const records = [...merged.values()];

        if (feature) {
          await saveFeatureTraits(feature, records);
        } else {
          [feature] = await actor.createEmbeddedDocuments("Item", [{
            name: "Creature Properties",
            type: "NPC Feature",
            system: { properties: records.map(record => record.uuid) },
            flags: { [MODULE_ID]: { [FEATURE_TRAITS_FLAG]: records } }
          }]);
        }
        await actor.unsetFlag(MODULE_ID, ACTOR_TRAITS_FLAG);
      } catch (error) {
        warn(`Could not migrate Creature Properties for ${actor.name}`, error);
      }
    }
  }

  function makeWeaponEnchantmentBox(weapon, editable) {
    const enchantment = getTemporaryEnchantment(weapon);
    const permanent = weapon.system?.magicItem === true;
    const box = document.createElement("div");
    box.className = "SD-box mk-damage-traits-box mk-temporary-enchantment-box";
    box.innerHTML = `
      <div class="header light"><label>Temporary Magical Enchantment</label></div>
      <div class="content mk-temporary-enchantment-content">
        <label class="mk-temporary-enchantment-active">
          <input type="checkbox" data-mk-enchantment-active${enchantment ? " checked" : ""}${editable ? "" : " disabled"}>
          <span>Active</span>
        </label>
        <label class="mk-temporary-enchantment-source">
          <span>Source</span>
          <input type="text" data-mk-enchantment-source value="${escapeHtml(enchantment?.source ?? "")}" placeholder="Spell or effect"${editable ? "" : " disabled"}>
        </label>
        ${editable && enchantment ? '<button type="button" data-mk-enchantment-clear><i class="fas fa-xmark"></i> Clear</button>' : ""}
        <p class="notes">
          ${permanent
            ? "This weapon is also permanently magical. Clearing this enchantment will not change its native Magical Item setting."
            : "This active enchantment makes the weapon magical without changing its permanent Magical Item setting."}
        </p>
      </div>
    `;

    const activeInput = box.querySelector("[data-mk-enchantment-active]");
    const sourceInput = box.querySelector("[data-mk-enchantment-source]");
    activeInput?.addEventListener("change", event => {
      void setTemporaryMagicalEnchantment(weapon, {
        active: event.currentTarget.checked,
        source: sourceInput?.value
      });
    });
    sourceInput?.addEventListener("change", event => {
      if (!activeInput?.checked) return;
      void setTemporaryMagicalEnchantment(weapon, {
        active: true,
        source: event.currentTarget.value
      });
    });
    box.querySelector("[data-mk-enchantment-clear]")?.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      void setTemporaryMagicalEnchantment(weapon, { active: false });
    });
    return box;
  }

  function dialogRoot(html) {
    return html?.[0] ?? html;
  }

  async function selectItemProperties(item) {
    const selected = new Set(Array.from(item?.system?.properties ?? []).map(String));
    const properties = await getAvailableProperties(selected);
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
          <p class="notes">Selected properties are stored in Shadowdark's native item property list.</p>
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
    if (!item || (!ITEM_TYPES.has(item.type) && !["Weapon", "NPC Feature"].includes(item.type))) return;

    const root = getRootElement(html);
    const form = getSheetForm(root);
    if (!form?.querySelector || form.dataset[RENDER_MARKER]) return;
    form.dataset[RENDER_MARKER] = "true";

    const editable = Boolean(app?.isEditable ?? item.isOwner);
    if (item.type === "NPC Feature") {
      await addNpcFeatureTraitsTab(form, item, editable);
      return;
    }

    const tab = form.querySelector('.tab[data-tab="tab-details"]');
    if (item.type === "Weapon") {
      tab?.appendChild(makeWeaponEnchantmentBox(item, editable));
      return;
    }

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
    if (!itemUuid) return { item: null, properties: [], isWeapon: false, isMagicalWeapon: false };

    let item = null;
    try {
      item = await fromUuid(itemUuid);
    } catch (_error) {
      return { item: null, properties: [], isWeapon: false, isMagicalWeapon: false };
    }
    const properties = await resolveProperties(item?.system?.properties ?? []);
    return {
      item,
      properties,
      isWeapon: item?.type === "Weapon",
      isMagicalWeapon: isMagicalWeapon(item, properties),
      magicSource: item?.system?.magicItem === true
        ? "permanent"
        : isTemporaryMagicalEnchantmentActive(item)
          ? "temporary-enchantment"
          : hasMagicalProperty(properties)
            ? "property"
            : null
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

    let mode = null;
    let appliedDamage = incomingDamage;

    if (modes.has("immunity")) {
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
      bypassed: []
    };
  }

  async function resolveReduction(actor, sourceProperties, damage = 0, sourceContext = {}) {
    const result = calculateReduction(actor, sourceProperties, damage, sourceContext);
    if (!result.matching.length) return { ...result, propertyNames: [] };

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
      getTemporaryEnchantment,
      isMagicalWeapon,
      setTemporaryMagicalEnchantment,
      selectItemProperties
    };
  }

  Hooks.once("init", exposeApi);
  Hooks.once("ready", () => {
    exposeApi();
    void migrateActorTraitsToNpcFeatures();
  });

  for (const hook of ["renderItemSheet", "renderShadowdarkItemSheet", "renderShadowdarkItemSheetV2", "renderItemSheetShadowdark"]) {
    Hooks.on(hook, (app, html) => void renderItemTraits(app, html).catch(error => warn("Item sheet render failed", error)));
  }
})();
