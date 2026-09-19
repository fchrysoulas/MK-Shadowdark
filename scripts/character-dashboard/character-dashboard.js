import {
  collectPropertyNames,
  getItemHandUse,
  isArmor,
  isEquipped,
  isShield,
  isStashed,
  isWeapon
} from "../libs/equipment.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const BODY_SLOT_FLAG = "bodySlot";
  const HAND_SIDE_FLAG = "handSide";
  const QUICK_SLOT_FLAG = "quickSlots";
  const boundDashboardRoots = new WeakSet();
  let CharacterDashboardSheet;

  const SLOT_DEFINITIONS = Object.freeze([
    { key: "head", label: "Head", icon: "fa-solid fa-helmet-safety", side: "left", wound: "head" },
    { key: "rightArm", label: "Right Arm", icon: "fa-solid fa-hand-fist", side: "left", wound: "rightArm" },
    { key: "rightHand", label: "Right Hand", icon: "fa-solid fa-hand", side: "left", wound: "rightArm" },
    { key: "rightLeg", label: "Right Leg", icon: "fa-solid fa-person-walking", side: "left", wound: "rightLeg" },
    { key: "rightFoot", label: "Right Foot", icon: "fa-solid fa-shoe-prints", side: "left", wound: "rightLeg" },
    { key: "torso", label: "Torso", icon: "fa-solid fa-shirt", side: "right", wound: "body" },
    { key: "leftArm", label: "Left Arm", icon: "fa-solid fa-hand-fist", side: "right", wound: "leftArm" },
    { key: "leftHand", label: "Left Hand", icon: "fa-solid fa-hand", side: "right", wound: "leftArm" },
    { key: "leftLeg", label: "Left Leg", icon: "fa-solid fa-person-walking", side: "right", wound: "leftLeg" },
    { key: "leftFoot", label: "Left Foot", icon: "fa-solid fa-shoe-prints", side: "right", wound: "leftLeg" }
  ]);

  const SLOT_KEYS = new Set(SLOT_DEFINITIONS.map(slot => slot.key));
  const QUICK_SLOT_DEFINITIONS = Object.freeze([1, 2, 3].map(index => ({
    key: "quick" + index,
    label: "Quick Slot " + index,
    number: index,
    index: index - 1
  })));
  const QUICK_SLOT_KEYS = new Set(QUICK_SLOT_DEFINITIONS.map(slot => slot.key));
  const GEAR_TYPES = new Set([
    "armor",
    "basic",
    "consumable",
    "elixir",
    "potion",
    "scroll",
    "wand",
    "weapon"
  ]);

  // Use the system sheet as the base so native rolls, forms and inventory retain their behavior.
  // The system exposes its sheet classes during init, before Foundry builds CONFIG.Actor.sheetClasses.
  Hooks.once("init", () => {
    if (game.system?.id !== "shadowdark") return;
    const native = game.system?.sheets?.PlayerSheetSD ?? globalThis.shadowdark?.sheets?.PlayerSheetSD;
    if (!native) {
      console.error(MODULE_ID + " | Shadowdark player sheet is unavailable.");
      return;
    }
    CharacterDashboardSheet = class MKCharacterDashboardSheet extends native {
      static get defaultOptions() {
        const baseOptions = super.defaultOptions ?? {};
        return foundry.utils.mergeObject(baseOptions, {
          classes: ["shadowdark", "sheet", "player", "mk-character-dashboard-window"],
          height: 900, resizable: true,
          tabs: [{ navSelector: ".SD-nav", contentSelector: ".SD-content-body", initial: "tab-body" }],
          scrollY: [".mk-dashboard-left", ".mk-dashboard-side-extension-body", ".SD-content-body"],
          dragDrop: [
            ...(baseOptions.dragDrop ?? []),
            {
              dragSelector: "[data-item-id]",
              dropSelector: ".mk-body-slot[data-body-slot], .mk-dashboard-quickslot[data-quick-slot]"
            }
          ]
        });
      }
      get template() {
        return "modules/mk-shadowdark/templates/character-dashboard.hbs";
      }
      async getData(options) {
      const context = await super.getData(options);
      context.dashboard = buildDashboardContext(this.actor, {
          className: context.characterClass?.name,
          title: context.classTitle,
          level: context.actor?.system?.level?.value,
          xp: context.actor?.system?.level?.xp,
          xpNextLevel: context.xpNextLevel,
          levelUp: context.levelUp,
          gearSlots: context.gearSlots,
          slotUsage: context.slots,
          editingHp: context.editingHp,
          editingStats: context.editingStats,
          showSpellsButton: context.showSpellsTab,
          background: context.backgroundSelectors?.background?.item?.name,
          ancestry: context.backgroundSelectors?.ancestry?.item?.name,
        deity: context.backgroundSelectors?.deity?.item?.name
      });
        return context;
      }
      activateListeners(html) {
        super.activateListeners(html);
        bindDashboardInteractions(this, getDashboardRoot(html));
        bindTalentInteractions(this, html);
      }
      _onRender(context, options) {
        super._onRender?.(context, options);
        bindDashboardInteractions(this, getDashboardRoot(this.element ?? context?.element ?? context));
        bindTalentInteractions(this, this.element ?? context?.element ?? context);
      }
      async _onDrop(event) {
        // Dashboard slots assign existing actor items; do not also run the system import/sort handler.
        const target = event.target?.closest?.(".mk-body-slot[data-body-slot], .mk-dashboard-quickslot[data-quick-slot]");
        if (target?.matches?.(".mk-dashboard-quickslot[data-quick-slot]")) {
          return onQuickSlotDrop(event, this, target.dataset.quickSlot);
        }
        if (target?.matches?.(".mk-body-slot[data-body-slot]")) {
          return onSlotDrop(event, this, target.dataset.bodySlot);
        }
        return super._onDrop(event);
      }
      async _updateObject(event, formData) {
        if (Object.prototype.hasOwnProperty.call(formData, "system.level.xp")) {
          const xp = Number(formData["system.level.xp"]);
          formData["system.level.xp"] = Number.isFinite(xp) ? Math.trunc(xp) : 0;
        }
        return super._updateObject(event, formData);
      }
    };
    foundry.documents.collections.Actors.registerSheet(MODULE_ID, CharacterDashboardSheet, {
      types: ["Player"], makeDefault: false,
      label: game.i18n.localize("MK_SHADOWDARK.dashboard.sheetName")
    });
  });

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = mod.api ?? {};
    mod.api.characterDashboard = {
      open: actor => isPlayerActor(actor) ? openDashboard(actor) : null,
      getBodySlot: item => getBodySlot(item),
      assignBodySlot: (item, slotKey) => assignBodySlot(item, slotKey),
      clearBodySlot: item => clearBodySlot(item),
      slots: SLOT_DEFINITIONS.map(slot => ({ ...slot })),
      quickSlots: QUICK_SLOT_DEFINITIONS.map(slot => ({ ...slot })),
      assignQuickSlot: (item, slotKey) => assignQuickSlot(item, slotKey),
      clearQuickSlot: (actor, slotKey) => clearQuickSlot(actor, slotKey)
    };
  });

  function openDashboard(actor) {
    if (!CharacterDashboardSheet || !actor.testUserPermission(game.user, "OBSERVER")) return null;
    const existing = Object.values(actor.apps ?? {}).find(app => app instanceof CharacterDashboardSheet);
    const application = existing ?? new CharacterDashboardSheet(actor);
    application.render(true);
    return application;
  }

  function getDashboardRoot(html) {
    const element = html?.querySelector
      ? html
      : html?.[0] ?? html?.get?.(0);
    return element?.querySelector?.(".mk-character-dashboard")
      ?? html?.find?.(".mk-character-dashboard")?.[0]
      ?? (element?.matches?.(".mk-character-dashboard") ? element : null);
  }

  function buildDashboardContext(actor, identity = {}) {
    const items = Array.from(actor.items ?? []);
    const woundState = buildWoundState(actor);
    const slotState = buildSlotState(items, woundState);
    const quickSlots = buildQuickSlotState(actor, items);
    const level = getNumber(actor, "system.level.value");
    const className = identity.className || findIdentityItem(items, ["class"]);
    const title = identity.title || "";
    const ancestryName = identity.ancestry || findIdentityItem(items, ["ancestry"]);
    const backgroundName = identity.background || findIdentityItem(items, ["background"]);
    const deityName = identity.deity || findIdentityItem(items, ["deity"]);
    const alignment = humanize(getProperty(actor, "system.alignment") ?? "");
    const xp = Number(identity.xp ?? getProperty(actor, "system.level.xp"));
    const xpNextLevel = Number(identity.xpNextLevel ?? ((Number.isFinite(level) ? level : 0) * 10));
    const xpValue = Number.isFinite(xp) ? xp : 0;
    const xpTarget = Number.isFinite(xpNextLevel) ? xpNextLevel : 0;
    const levelUp = Boolean(identity.levelUp ?? (xpTarget > 0 && xpValue >= xpTarget));
    const editingHp = Boolean(identity.editingHp);
    const canEdit = Boolean(actor.isOwner || game.user?.isGM);

    const hpValue = getNumber(actor, "system.attributes.hp.value") ?? 0;
    const hpMax = getHpMax(actor);
    const hpPercent = hpMax > 0 ? clamp((hpValue / hpMax) * 100, 0, 100) : 0;
    // Renown uses a 0-20 dashboard scale.
    const renownMax = 20;
    const renown = clamp(getNumber(actor, "system.renown") ?? 0, 0, renownMax);
    const ac = getNumber(actor, "system.attributes.ac.value");
    const luck = getLuckState(actor);
    const armorClass = {
      label: "Armor Class",
      icon: "fa-solid fa-shield-halved",
      value: Number.isFinite(ac) ? String(ac) : "-"
    };

    const stats = [
      {
        key: "hp",
        label: "Health",
        icon: "fa-solid fa-heart",
        value: hpMax > 0 ? hpValue + " / " + hpMax : String(hpValue),
        currentValue: hpValue,
        maxValue: hpMax,
        percent: hpPercent,
        hasBar: true,
        isHealth: true,
        editing: editingHp,
        canEdit,
        adjustPath: "system.attributes.hp.value",
        adjustLabel: "HP",
        tone: hpValue <= 0 ? "danger" : hpPercent <= 40 ? "warning" : "normal"
      },
      {
        key: "xp",
        label: "XP",
        icon: "fa-solid fa-star",
        value: xpValue + " / " + xpTarget,
        percent: xpTarget > 0 ? clamp((xpValue / xpTarget) * 100, 0, 100) : 0,
        hasBar: true,
        adjustPath: "system.level.xp",
        adjustLabel: "XP",
        tone: "xp"
      },
      {
        key: "renown",
        label: "Renown",
        icon: "fa-solid fa-trophy",
        value: renown + " / " + renownMax,
        percent: clamp((renown / renownMax) * 100, 0, 100),
        hasBar: true,
        adjustPath: "system.renown",
        adjustLabel: "Renown",
        tone: "renown"
      },
    ];

    const abilities = ["str", "dex", "con", "int", "wis", "cha"].map(key => ({
      key,
      label: key.toUpperCase(),
      value: getAbilityScore(actor, key),
      modifier: formatModifier(getAbilityModifier(actor, key))
    }));

    const conditions = Array.from(actor.effects ?? [])
      .filter(effect => !effect.disabled && !effect.isSuppressed)
      .map(effect => ({
        id: effect.id,
        name: effect.name ?? "Effect",
        img: effect.img || "icons/svg/aura.svg"
      }));

    const carriedItems = items
      .filter(item => isGearItem(item) && !isStashed(item) && !(isEquipped(item) || Boolean(getBodySlot(item))))
      .sort((left, right) => {
        const leftQuick = Number(Boolean(left.getFlag?.(MODULE_ID, "quickdraw")));
        const rightQuick = Number(Boolean(right.getFlag?.(MODULE_ID, "quickdraw")));
        return rightQuick - leftQuick || itemSort(left, right);
      });
    const carried = carriedItems.map(item => itemView(item));
    const showSpellsButton = identity.showSpellsButton ?? items.some(item => String(item?.type ?? "").toLowerCase() === "spell");
    const configuredSlots = Number(identity.gearSlots ?? getNumber(actor, "system.slots"));
    const backpackCapacity = Number.isFinite(configuredSlots) && configuredSlots > 0
      ? Math.trunc(configuredSlots)
      : 10;
    const slotUsage = identity.slotUsage ?? getActorSlotUsage(actor);
    const reportedUsed = Number(slotUsage?.total);
    const backpackUsed = Number.isFinite(reportedUsed) && reportedUsed >= 0
      ? Math.trunc(reportedUsed)
      : carriedItems.reduce((total, item) => total + getBackpackSlotSpan(item), 0);
    const backpackItems = carriedItems.map(item => ({
      item: itemView(item),
      slotSpan: getBackpackSlotSpan(item)
    }));
    const visibleOccupiedSlots = backpackItems.reduce((total, entry) => total + entry.slotSpan, 0);
    const backpackGridSize = Math.max(backpackCapacity, backpackUsed, visibleOccupiedSlots);
    const backpackEmptySlots = Array.from({
      length: Math.max(0, backpackGridSize - Math.max(backpackUsed, visibleOccupiedSlots))
    }, (_value, index) => ({ key: "empty-" + (index + 1) }));

    return {
      actor: {
        id: actor.id,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        level: Number(identity.level ?? level) || "",
        levelUp,
        title,
        className,
        background: backgroundName,
        ancestry: ancestryName,
        alignment,
        deity: deityName,
        subtitle: ""
      },
      canEdit,
      themeClass: getDashboardThemeClass(),
      stats,
      armorClass,
      luckToggle: luck,
      showSpellsButton: Boolean(showSpellsButton),
      editingHp,
      editingStats: Boolean(identity.editingStats),
      abilities,
      conditions,
      hasConditions: conditions.length > 0,
      leftSlots: slotState.filter(slot => slot.key === "rightHand"),
      rightSlots: slotState.filter(slot => ["torso", "leftHand"].includes(slot.key)),
      quickSlots,
      woundMarkers: woundState.markers,
      wounds: woundState.active,
      hasWounds: woundState.active.length > 0,
      carried,
      hasCarried: carried.length > 0,
      carriedCount: carried.length,
      backpackItems,
      backpackEmptySlots,
      backpackUsed,
      backpackCapacity
    };
  }

  function getDashboardThemeClass() {
    let theme = "classic";
    try {
      const configured = String(globalThis.game?.settings?.get?.(MODULE_ID, "characterDashboardTheme") ?? "").toLowerCase();
      if (["classic", "osr"].includes(configured)) theme = configured;
    } catch (_error) {
      // Keep the default theme available during early sheet/test rendering.
    }
    return "mk-dashboard-theme-" + theme;
  }

  function getActorSlotUsage(actor) {
    try {
      return typeof actor?.system?.getSlotUsage === "function"
        ? actor.system.getSlotUsage()
        : null;
    } catch (_error) {
      return null;
    }
  }

  function getBackpackSlotSpan(item) {
    const slotsUsed = getNumber(item, "system.slotsUsed");
    if (Number.isFinite(slotsUsed) && slotsUsed > 0) return Math.max(1, Math.ceil(slotsUsed));

    const configuredSlots = getProperty(item, "system.slots");
    if (typeof configuredSlots === "number" && Number.isFinite(configuredSlots) && configuredSlots > 0) {
      return Math.max(1, Math.ceil(configuredSlots));
    }
    if (!configuredSlots || typeof configuredSlots !== "object") return 1;

    const slotsPerItem = getNumber(item, "system.slots.slots_used") ?? 1;
    const perSlot = getNumber(item, "system.slots.per_slot") ?? 1;
    const quantity = getNumber(item, "system.quantity") ?? 1;
    const freeCarry = getNumber(item, "system.slots.free_carry") ?? 0;
    const slotGroups = Math.ceil(Math.max(1, quantity) / Math.max(1, perSlot));
    return Math.max(1, Math.ceil((slotGroups - freeCarry) * slotsPerItem));
  }

  function buildQuickSlotState(actor, items) {
    const assignments = readQuickSlotAssignments(actor);
    return QUICK_SLOT_DEFINITIONS.map(slot => {
      const item = items.find(candidate => candidate.id === assignments[slot.index]);
      return { ...slot, item: item ? itemView(item) : null };
    });
  }

  function buildWoundState(actor) {
    const api = game.modules.get(MODULE_ID)?.api?.wounds;
    const data = api?.get?.(actor) ?? actor.getFlag?.(MODULE_ID, "detailedWounds") ?? {};
    const locations = api?.locations ?? [
      { key: "head", label: "Head" },
      { key: "rightArm", label: "Right Arm" },
      { key: "leftArm", label: "Left Arm" },
      { key: "body", label: "Body" },
      { key: "rightLeg", label: "Right Leg" },
      { key: "leftLeg", label: "Left Leg" }
    ];

    const markers = [];
    const active = [];
    const byLocation = new Map();

    for (const location of locations) {
      const entry = data?.locations?.[location.key] ?? {};
      const status = String(entry.status ?? "ok");
      const severityRoll = Number(entry.severityRoll) || 0;
      const outcome = severityRoll > 0 ? api?.getOutcome?.(location.key, severityRoll) : null;
      const isActive = entry.resultKey
        ? entry.resultKey !== "scar"
        : status !== "ok";

      const model = {
        key: location.key,
        label: location.label ?? humanize(location.key),
        status,
        statusClass: "status-" + sanitizeClass(status),
        result: outcome?.label ?? humanize(status),
        details: outcome?.consequence ?? "",
        severityRoll
      };

      byLocation.set(location.key, model);
      if (isActive) {
        markers.push(model);
        active.push(model);
      }
    }

    active.sort((left, right) => woundRank(right.status) - woundRank(left.status));
    return { markers, active, byLocation };
  }

  function buildSlotState(items, woundState) {
    const slots = SLOT_DEFINITIONS.map(slot => ({
      ...slot,
      item: null,
      itemId: "",
      manual: false,
      secondary: false,
      woundStatus: woundState.byLocation.get(slot.wound)?.status ?? "ok",
      woundClass: "wound-" + sanitizeClass(woundState.byLocation.get(slot.wound)?.status ?? "ok")
    }));
    const byKey = new Map(slots.map(slot => [slot.key, slot]));

    for (const item of items) {
      const slotKey = getBodySlot(item);
      if (!isGearItem(item) || isStashed(item) || !slotKey || !byKey.has(slotKey)) continue;
      const slot = byKey.get(slotKey);
      if (slot.item) continue;
      setSlotItem(slot, item, { manual: true });
    }

    for (const slot of slots) {
      if (!slot.manual || !["leftHand", "rightHand"].includes(slot.key)) continue;
      const handUse = getItemHandUse(items.find(item => item.id === slot.itemId));
      if (Number(handUse?.hands) !== 2) continue;
      const otherKey = slot.key === "leftHand" ? "rightHand" : "leftHand";
      const otherSlot = byKey.get(otherKey);
      if (otherSlot && !otherSlot.item) setSlotItem(otherSlot, slot.item, { secondary: true });
    }

    assignHeldItems(items, byKey);

    const torso = byKey.get("torso");
    if (torso && !torso.item) {
      const armor = items
        .filter(item => isArmor(item) && isEquipped(item) && !isShield(item) && !isStashed(item) && !getBodySlot(item))
        .sort(itemSort)[0];
      if (armor) setSlotItem(torso, armor);
    }

    assignNamedPair(items, byKey, ["head"], /\b(helm|helmet|hat|circlet|crown|hood)\b/i);
    assignNamedPair(items, byKey, ["rightArm", "leftArm"], /\b(bracer|bracers|vambrace|vambraces)\b/i);
    assignNamedPair(items, byKey, ["rightFoot", "leftFoot"], /\b(boot|boots|shoe|shoes|sandal|sandals)\b/i);

    return slots;
  }

  function assignHeldItems(items, byKey) {
    const entries = items
      .map(item => getItemHandUse(item))
      .filter(Boolean)
      .sort((left, right) => itemSort(left.item, right.item));

    for (const entry of entries) {
      if (getBodySlot(entry.item)) continue;

      if (Number(entry.hands) === 2) {
        const right = byKey.get("rightHand");
        const left = byKey.get("leftHand");
        if (!right.item && !left.item) {
          setSlotItem(right, entry.item);
          setSlotItem(left, entry.item, { secondary: true });
        }
        continue;
      }

      const explicitSide = normalizeHandSide(entry.item.getFlag?.(MODULE_ID, HAND_SIDE_FLAG));
      const preferredKey = explicitSide
        ? explicitSide + "Hand"
        : entry.isShield ? "leftHand" : "rightHand";
      const alternateKey = preferredKey === "leftHand" ? "rightHand" : "leftHand";
      const preferred = byKey.get(preferredKey);
      const alternate = byKey.get(alternateKey);

      if (preferred && !preferred.item) setSlotItem(preferred, entry.item);
      else if (alternate && !alternate.item) setSlotItem(alternate, entry.item);
    }
  }

  function assignNamedPair(items, byKey, keys, pattern) {
    const candidate = items
      .filter(item => isEquipped(item) && !isStashed(item) && !getBodySlot(item) && pattern.test(String(item.name ?? "")))
      .sort(itemSort)[0];
    if (!candidate) return;

    let first = true;
    for (const key of keys) {
      const slot = byKey.get(key);
      if (!slot?.item) {
        setSlotItem(slot, candidate, { secondary: !first });
        first = false;
      }
    }
  }

  function setSlotItem(slot, item, { manual = false, secondary = false } = {}) {
    slot.item = itemView(item);
    slot.itemId = item.id;
    slot.manual = manual;
    slot.secondary = secondary;
  }

  function bindDashboardInteractions(application, root) {
    if (!root?.querySelectorAll) return;
    if (boundDashboardRoots.has(root)) return;
    boundDashboardRoots.add(root);
    const actor = application.actor;

    root.querySelectorAll("[data-dashboard-adjust]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!(actor.isOwner || game.user?.isGM)) return;
        void adjustDashboardStat(actor, button.dataset.dashboardPath, Number(button.dataset.dashboardDelta))
          .then(() => application.render(true));
      });
    });

    root.querySelectorAll("[data-action='edit-alignment']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!(actor.isOwner || game.user?.isGM)) return;
        openAlignmentEditor(actor, button.closest(".mk-dashboard-identity-fact"), application);
      });
      button.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (!(actor.isOwner || game.user?.isGM)) return;
        openAlignmentEditor(actor, button.closest(".mk-dashboard-identity-fact"), application);
      });
    });

    root.querySelectorAll("[data-action='toggle-luck']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        if (!(actor.isOwner || game.user?.isGM)) return;
        void toggleDashboardLuck(actor).then(() => application.render(true));
      });
    });

    root.querySelectorAll("[data-action='open-spells']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleDashboardDrawer(root, "spells", actor);
      });
    });

    root.querySelectorAll("[data-action='open-backpack']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleDashboardDrawer(root, "backpack", actor);
      });
    });

    root.querySelectorAll("[data-action='close-dashboard-drawer']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleDashboardDrawer(root, null, actor);
      });
    });

    root.querySelectorAll(".mk-dashboard-ability[data-ability]").forEach(card => {
      const roll = event => {
        if (event.target.closest("input, .mk-dashboard-ability-label")) return;
        event.preventDefault();
        event.stopPropagation();
        const ability = card.dataset.ability;
        if (ability && typeof actor.system?.rollStatCheck === "function") {
          actor.system.rollStatCheck(ability, { skipPrompt: Boolean(event.shiftKey) });
        }
      };
      card.addEventListener("click", roll);
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        roll(event);
      });
    });

    root.querySelectorAll("[data-item-id]").forEach(element => {
      element.addEventListener("click", event => {
        if (event.target.closest("[data-action='clear-slot'], [data-action='clear-quick-slot']")) return;
        const item = actor.items?.get(element.dataset.itemId);
        if (!item) return;
        if (element.matches(".mk-body-slot[data-body-slot='rightHand']") && isWeapon(item)) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof actor.system?.rollAttack === "function") {
            void actor.system.rollAttack(item.uuid ?? item.id, { skipPrompt: Boolean(event.shiftKey) });
          }
          return;
        }
        item.sheet?.render?.(true);
      });
      element.draggable = true;
      element.addEventListener("dragstart", event => beginItemDrag(event, actor, element.dataset.itemId));
    });

    root.querySelectorAll(".mk-body-slot[data-body-slot]").forEach(slot => {
      slot.addEventListener("dragover", event => {
        if (!(actor.isOwner || game.user?.isGM)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        slot.classList.add("is-drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-drag-over"));
      slot.addEventListener("drop", event => void onSlotDrop(event, application, slot.dataset.bodySlot));
      slot.addEventListener("contextmenu", event => {
        if (!(actor.isOwner || game.user?.isGM)) return;
        event.preventDefault();
        void clearSlotByKey(actor, slot.dataset.bodySlot);
      });
    });

    root.querySelectorAll(".mk-dashboard-quickslot[data-quick-slot]").forEach(slot => {
      slot.addEventListener("dragover", event => {
        if (!(actor.isOwner || game.user?.isGM)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        slot.classList.add("is-drag-over");
      });
      slot.addEventListener("dragleave", () => slot.classList.remove("is-drag-over"));
      slot.addEventListener("drop", event => void onQuickSlotDrop(event, application, slot.dataset.quickSlot));
      slot.addEventListener("contextmenu", event => {
        if (!(actor.isOwner || game.user?.isGM)) return;
        event.preventDefault();
        void clearQuickSlot(actor, slot.dataset.quickSlot).then(() => application.render(true));
      });
    });

    root.querySelectorAll("[data-action='clear-slot']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void clearSlotByKey(actor, button.dataset.bodySlot);
      });
    });

    root.querySelectorAll("[data-action='clear-quick-slot']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void clearQuickSlot(actor, button.dataset.quickSlot).then(() => application.render(true));
      });
    });

    root.querySelectorAll("[data-action='open-wounds']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        game.modules.get(MODULE_ID)?.api?.wounds?.open?.(actor);
      });
    });
  }

  function bindTalentInteractions(application, html) {
    const element = html?.querySelector
      ? html
      : html?.[0] ?? html?.get?.(0);
    const root = element?.querySelector?.(".mk-dashboard-talents-tab")
      ?? html?.find?.(".mk-dashboard-talents-tab")?.[0]
      ?? (element?.matches?.(".mk-dashboard-talents-tab") ? element : null);
    if (!root?.querySelectorAll || boundDashboardRoots.has(root)) return;
    boundDashboardRoots.add(root);

    root.querySelectorAll(".mk-dashboard-talent-row[data-item-id]").forEach(row => {
      const openItem = event => {
        if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        const item = application.actor?.items?.get?.(row.dataset.itemId)
          ?? Array.from(application.actor?.items ?? []).find(candidate => candidate.id === row.dataset.itemId);
        item?.sheet?.render?.(true);
      };
      row.addEventListener("click", openItem);
      row.addEventListener("keydown", openItem);
    });
  }

  async function adjustDashboardStat(actor, path, delta) {
    if (!path || !Number.isFinite(delta) || typeof actor?.update !== "function") return;
    const current = Number(getProperty(actor, path));
    let value = (Number.isFinite(current) ? Math.trunc(current) : 0) + Math.trunc(delta);
    if (path === "system.attributes.hp.value") {
      const max = getNumber(actor, "system.attributes.hp.max");
      if (Number.isFinite(max)) value = Math.min(value, max);
    }
    if (path === "system.renown") value = Math.min(value, 20);
    await actor.update({ [path]: Math.max(0, value) });
  }

  async function toggleDashboardLuck(actor) {
    if (typeof actor?.update !== "function") return;
    const luck = getLuckState(actor);
    if (luck.pulpMode) return;
    await actor.update({ "system.luck.available": !luck.available });
  }

  function openAlignmentEditor(actor, fact, application) {
    const valueElement = fact?.querySelector?.("strong");
    if (!valueElement || valueElement.querySelector("select")) return;
    const current = String(getProperty(actor, "system.alignment") ?? "");
    const select = document.createElement("select");
    select.className = "mk-dashboard-alignment-editor";
    select.name = "system.alignment";
    for (const choice of getAlignmentChoices()) {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      option.selected = choice.value === current;
      select.append(option);
    }
    valueElement.replaceChildren(select);
    select.focus();
    select.addEventListener("change", async () => {
      await actor.update({ "system.alignment": select.value });
      application.render(true);
    }, { once: true });
    select.addEventListener("keydown", event => {
      if (event.key === "Escape") application.render(true);
    });
    select.addEventListener("blur", () => {
      if (select.isConnected) application.render(true);
    }, { once: true });
  }

  function getAlignmentChoices() {
    const configured = globalThis.CONFIG?.SHADOWDARK?.ALIGNMENTS ?? {};
    const alignments = Object.keys(configured).length
      ? configured
      : { lawful: "Lawful", neutral: "Neutral", chaotic: "Chaotic" };
    return Object.entries(alignments).map(([value, label]) => ({
      value,
      label: game.i18n?.localize?.(label) || humanize(value)
    }));
  }

  function toggleDashboardDrawer(root, drawerKey, actor) {
    const drawers = Array.from(root?.querySelectorAll?.("[data-dashboard-drawer]") ?? []);
    const target = drawerKey ? drawers.find(drawer => drawer.dataset.dashboardDrawer === drawerKey) : null;
    const shouldOpen = Boolean(target && target.hidden);

    for (const drawer of drawers) {
      const isOpen = shouldOpen && drawer === target;
      drawer.hidden = !isOpen;
      drawer.classList.toggle("is-open", isOpen);
    }

    if (shouldOpen && drawerKey === "spells") renderSpellDrawer(actor, target);
  }

  function renderSpellDrawer(actor, drawer) {
    const content = drawer?.querySelector?.(".mk-dashboard-spell-drawer-content");
    if (!content) return;

    const spells = Array.from(actor?.items ?? [])
      .filter(item => String(item?.type ?? "").toLowerCase() === "spell")
      .sort((left, right) => Number(left.system?.tier ?? 0) - Number(right.system?.tier ?? 0)
        || String(left.name ?? "").localeCompare(String(right.name ?? ""), game.i18n?.lang, { sensitivity: "base" }));
    const rows = spells.map(spell => {
      const lost = Boolean(spell.system?.lost);
      const tier = Number(spell.system?.tier);
      const tierLabel = Number.isFinite(tier) ? "Tier " + tier : "Spell";
      return `<div class="mk-dashboard-spell-row${lost ? " is-lost" : ""}">
        <img src="${escapeHtml(spell.img || "icons/svg/book.svg")}" alt="">
        <div class="mk-dashboard-spell-copy"><strong>${escapeHtml(spell.name || "Spell")}</strong><small>${escapeHtml(tierLabel)}${lost ? " / Lost" : ""}</small></div>
        <button type="button" class="mk-dashboard-spell-cast" data-spell-uuid="${escapeHtml(spell.uuid || "")}"${lost || !spell.uuid ? " disabled" : ""}>
          <i class="fa-solid fa-hand-sparkles" aria-hidden="true"></i><span>Cast</span>
        </button>
      </div>`;
    }).join("");
    content.innerHTML = `<div class="mk-dashboard-spell-popup">${rows || '<div class="mk-dashboard-spell-empty">No known spells</div>'}</div>`;
    content.querySelectorAll("[data-spell-uuid]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const spellUuid = button.dataset.spellUuid;
        if (!spellUuid || typeof actor?.system?.castSpell !== "function") return;
        const spell = spells.find(candidate => candidate.uuid === spellUuid);
        const config = { itemUuid: spellUuid };
        const selfTargetUuid = isSelfSpell(spell) ? getActiveTokenUuid(actor) : "";
        if (selfTargetUuid) {
          config.targetUuid = selfTargetUuid;
          config.targetUuids = [selfTargetUuid];
        }
        void actor.system.castSpell(spellUuid, config);
      });
    });
  }

  function openSpellPopup(actor) {
    if (typeof Dialog !== "function") return;
    const spells = Array.from(actor?.items ?? [])
      .filter(item => String(item?.type ?? "").toLowerCase() === "spell")
      .sort((left, right) => Number(left.system?.tier ?? 0) - Number(right.system?.tier ?? 0)
        || String(left.name ?? "").localeCompare(String(right.name ?? ""), game.i18n?.lang, { sensitivity: "base" }));
    const rows = spells.map(spell => {
      const lost = Boolean(spell.system?.lost);
      const tier = Number(spell.system?.tier);
      const tierLabel = Number.isFinite(tier) ? "Tier " + tier : "Spell";
      return `<div class="mk-dashboard-spell-row${lost ? " is-lost" : ""}">
        <img src="${escapeHtml(spell.img || "icons/svg/book.svg")}" alt="">
        <div class="mk-dashboard-spell-copy"><strong>${escapeHtml(spell.name || "Spell")}</strong><small>${escapeHtml(tierLabel)}${lost ? " / Lost" : ""}</small></div>
        <button type="button" class="mk-dashboard-spell-cast" data-spell-uuid="${escapeHtml(spell.uuid || "")}"${lost || !spell.uuid ? " disabled" : ""}>
          <i class="fa-solid fa-hand-sparkles" aria-hidden="true"></i><span>Cast</span>
        </button>
      </div>`;
    }).join("");
    const content = `<div class="mk-dashboard-spell-popup">${rows || '<div class="mk-dashboard-spell-empty">No known spells</div>'}</div>`;
    let dialog;
    dialog = new Dialog({
      title: "Spells",
      content,
      buttons: {},
      render: html => {
        const root = html?.querySelector ? html : html?.[0] ?? html?.get?.(0);
        root?.querySelectorAll?.("[data-spell-uuid]").forEach(button => {
          button.addEventListener("click", event => {
            event.preventDefault();
            const spellUuid = button.dataset.spellUuid;
            if (!spellUuid || typeof actor?.system?.castSpell !== "function") return;
            const spell = spells.find(candidate => candidate.uuid === spellUuid);
            const config = { itemUuid: spellUuid };
            const selfTargetUuid = isSelfSpell(spell) ? getActiveTokenUuid(actor) : "";
            if (selfTargetUuid) {
              config.targetUuid = selfTargetUuid;
              config.targetUuids = [selfTargetUuid];
            }
            dialog.close();
            void actor.system.castSpell(spellUuid, config);
          });
        });
      }
    });
    dialog.render(true);
  }

  function isSelfSpell(spell) {
    return String(spell?.system?.range ?? "").trim().toLowerCase() === "self";
  }

  function getActiveTokenUuid(actor) {
    const activeTokens = actor?.getActiveTokens?.(true, true) ?? actor?.getActiveTokens?.() ?? [];
    const token = Array.from(activeTokens).find(candidate => candidate?.document?.uuid || candidate?.uuid);
    const tokenDocument = token?.document ?? actor?.token?.document ?? actor?.token;
    return tokenDocument?.uuid ?? "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character]));
  }

  function beginItemDrag(event, actor, itemId) {
    const item = actor.items?.get?.(itemId) ?? Array.from(actor.items ?? []).find(candidate => candidate.id === itemId);
    if (!item || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copyMove";
    const payload = JSON.stringify({
      type: "Item",
      uuid: item.uuid,
      id: item.id
    });
    event.dataTransfer.setData("application/json", payload);
    event.dataTransfer.setData("text/plain", payload);
  }

  async function onSlotDrop(event, application, slotKey) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList?.remove("is-drag-over");

    const actor = application.actor;
    if (!(actor.isOwner || game.user?.isGM)) {
      ui.notifications?.warn?.("MK-Shadowdark | You do not have permission to assign body slots.");
      return;
    }

    const item = await getDroppedActorItem(event, actor);
    if (!item || !isGearItem(item)) {
      ui.notifications?.warn?.("MK-Shadowdark | Drop one of this character's gear items onto the body slot.");
      return;
    }

    await assignBodySlot(item, slotKey);
    application.render(true);
  }

  async function onQuickSlotDrop(event, application, slotKey) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.classList?.remove("is-drag-over");

    const actor = application.actor;
    if (!(actor.isOwner || game.user?.isGM)) {
      ui.notifications?.warn?.("MK-Shadowdark | You do not have permission to assign quick slots.");
      return;
    }

    const item = await getDroppedActorItem(event, actor);
    if (!item) {
      ui.notifications?.warn?.("MK-Shadowdark | Drop one of this character's items onto the quick slot.");
      return;
    }

    await assignQuickSlot(item, slotKey);
    application.render(true);
  }

  async function assignBodySlot(item, slotKey) {
    if (!item?.parent || !isGearItem(item) || !SLOT_KEYS.has(slotKey)) return false;
    const actor = item.parent;
    if (!(actor.isOwner || game.user?.isGM)) return false;

    const occupied = Array.from(actor.items ?? []).filter(other => (
      other.id !== item.id && getBodySlot(other) === slotKey
    ));
    for (const other of occupied) {
      await other.update(getBodySlotClearChanges(other), { render: false });
    }

    const changes = {
      ["flags." + MODULE_ID + "." + BODY_SLOT_FLAG]: slotKey
    };
    if (slotKey === "leftHand" || slotKey === "rightHand") {
      changes["flags." + MODULE_ID + "." + HAND_SIDE_FLAG] = slotKey === "leftHand" ? "left" : "right";
    } else {
      changes["flags." + MODULE_ID + ".-=" + HAND_SIDE_FLAG] = null;
    }
    if (Object.prototype.hasOwnProperty.call(item.system ?? {}, "equipped")) {
      changes["system.equipped"] = true;
    }
    if (Object.prototype.hasOwnProperty.call(item.system ?? {}, "stashed")) {
      changes["system.stashed"] = false;
    }

    await item.update(changes);
    return true;
  }

  async function clearBodySlot(item) {
    if (!item?.parent || (!getBodySlot(item) && !isEquipped(item))) return false;
    const actor = item.parent;
    if (!(actor.isOwner || game.user?.isGM)) return false;
    await item.update(getBodySlotClearChanges(item));
    return true;
  }

  async function clearSlotByKey(actor, slotKey, itemId = "") {
    if (!SLOT_KEYS.has(slotKey)) return false;
    const item = itemId
      ? actor.items?.get?.(itemId) ?? Array.from(actor.items ?? []).find(candidate => candidate.id === itemId)
      : Array.from(actor.items ?? []).find(candidate => getBodySlot(candidate) === slotKey);
    if (!item) return false;
    return clearBodySlot(item);
  }

  function getBodySlotClearChanges(item) {
    const changes = {
      ["flags." + MODULE_ID + ".-=" + BODY_SLOT_FLAG]: null,
      ["flags." + MODULE_ID + ".-=" + HAND_SIDE_FLAG]: null
    };
    if (Object.prototype.hasOwnProperty.call(item.system ?? {}, "equipped")) {
      changes["system.equipped"] = false;
    }
    return changes;
  }

  async function assignQuickSlot(item, slotKey) {
    if (!item?.parent || !QUICK_SLOT_KEYS.has(slotKey)) return false;
    const actor = item.parent;
    if (!(actor.isOwner || game.user?.isGM)) return false;

    const slot = QUICK_SLOT_DEFINITIONS.find(candidate => candidate.key === slotKey);
    if (!slot) return false;

    const assignments = readQuickSlotAssignments(actor).map(itemId => itemId === item.id ? null : itemId);
    assignments[slot.index] = item.id;
    await actor.update({ ["flags." + MODULE_ID + "." + QUICK_SLOT_FLAG]: assignments }, { render: false });
    return true;
  }

  async function clearQuickSlot(actor, slotKey) {
    if (!actor || !QUICK_SLOT_KEYS.has(slotKey) || !(actor.isOwner || game.user?.isGM)) return false;

    const slot = QUICK_SLOT_DEFINITIONS.find(candidate => candidate.key === slotKey);
    if (!slot) return false;

    const assignments = readQuickSlotAssignments(actor);
    assignments[slot.index] = null;
    await actor.update({ ["flags." + MODULE_ID + "." + QUICK_SLOT_FLAG]: assignments }, { render: false });
    return true;
  }

  function readQuickSlotAssignments(actor) {
    const actorFlag = actor?.getFlag?.(MODULE_ID, QUICK_SLOT_FLAG);
    const raw = actorFlag ?? getProperty(actor, "flags." + MODULE_ID + "." + QUICK_SLOT_FLAG);
    if (Array.isArray(raw)) return QUICK_SLOT_DEFINITIONS.map((_slot, index) => raw[index] ?? null);
    if (raw && typeof raw === "object") {
      return QUICK_SLOT_DEFINITIONS.map((slot, index) => raw[slot.key] ?? raw[index] ?? raw[String(index)] ?? null);
    }
    return QUICK_SLOT_DEFINITIONS.map(() => null);
  }

  async function getDroppedActorItem(event, actor) {
    const nativeEvent = event.originalEvent ?? event;
    const data = getDropEventData(nativeEvent);
    if (!data) return null;

    const itemId = data?.id ?? data?._id ?? data?.itemId ?? data?.data?._id ?? data?.data?.id;
    const embedded = itemId
      ? actor.items?.get?.(itemId) ?? Array.from(actor.items ?? []).find(item => item.id === itemId)
      : null;
    if (embedded) return embedded;

    const uuid = data?.uuid ?? data?.itemUuid ?? data?.data?.uuid;
    if (uuid && typeof globalThis.fromUuid === "function") {
      try {
        const item = await globalThis.fromUuid(uuid);
        if (item?.documentName === "Item") {
          return item.parent?.uuid === actor.uuid ? item : importItemToActor(item, actor);
        }
      } catch (_error) {
        // Try the remaining item-data fallback below.
      }
    }

    const worldItem = data?.type === "Item" ? game.items?.get?.(itemId) : null;
    if (worldItem) return importItemToActor(worldItem, actor);

    const rawItem = data?.type === "Item" && data?.data && typeof data.data === "object"
      ? data.data
      : null;
    return rawItem ? importItemDataToActor(rawItem, actor) : null;
  }

  function getDropEventData(nativeEvent) {
    try {
      const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
      const data = textEditor?.getDragEventData?.(nativeEvent);
      if (data) return data;
    } catch (_error) {
      // Use the browser drag payload fallback.
    }

    for (const mime of ["application/json", "text/plain"]) {
      const raw = nativeEvent.dataTransfer?.getData?.(mime);
      if (!raw) continue;
      try {
        return JSON.parse(raw);
      } catch (_error) {
        // Try the next supported payload type.
      }
    }
    return null;
  }

  async function importItemToActor(item, actor) {
    if (!item || !actor?.createEmbeddedDocuments || typeof item.toObject !== "function") return null;
    return importItemDataToActor(item.toObject(), actor);
  }

  async function importItemDataToActor(itemData, actor) {
    if (!itemData || !actor?.createEmbeddedDocuments) return null;
    const data = globalThis.foundry?.utils?.deepClone
      ? globalThis.foundry.utils.deepClone(itemData)
      : JSON.parse(JSON.stringify(itemData));
    delete data._id;
    try {
      const [created] = await actor.createEmbeddedDocuments("Item", [data], { renderSheet: false });
      return created ?? null;
    } catch (_error) {
      return null;
    }
  }

  function getBodySlot(item) {
    const value = String(item?.getFlag?.(MODULE_ID, BODY_SLOT_FLAG) ?? "");
    return SLOT_KEYS.has(value) ? value : "";
  }

  function itemView(item) {
    const quantity = getNumber(item, "system.quantity") ?? 1;
    return {
      id: item.id,
      name: item.name ?? "Item",
      img: item.img || "icons/svg/item-bag.svg",
      type: humanize(item.type ?? "Item"),
      quickdraw: Boolean(item.getFlag?.(MODULE_ID, "quickdraw")),
      quantity,
      hasQuantity: quantity > 1,
      weaponDetails: isWeapon(item) ? getWeaponDetails(item) : null
    };
  }

  function getWeaponDetails(item) {
    const attackBonus = getNativeWeaponAttackBonus(item);
    const damage = getWeaponDamage(item);
    const properties = getWeaponProperties(item);
    return {
      attackBonus: formatModifier(attackBonus),
      damage: damage || "—",
      properties: properties || "None"
    };
  }

  function getNativeWeaponAttackBonus(item) {
    const actor = item?.parent;
    const system = actor?.system;
    const attackType = String(item?.system?.type ?? "").toLowerCase() === "ranged"
      ? "ranged"
      : "melee";
    const finesse = Boolean(item?.system?.isFinesse);

    try {
      if (typeof system?._getAttackAbilityModifier === "function") {
        const ability = system._getAttackAbilityModifier(attackType, finesse);
        if (typeof system._getActiveEffectKeys === "function") {
          const rollKey = system._getActiveEffectKeys(
            `roll.${attackType}.bonus`,
            ability?.modifier ?? 0,
            item,
            { itemUuid: item.uuid, situational: [] }
          );
          const value = Number(rollKey?.value);
          if (Number.isFinite(value)) return value;
        }
        const value = Number(ability?.modifier);
        if (Number.isFinite(value)) return value;
      }
    } catch (_error) {
      // Fall through to the actor ability fallback for compatible system versions.
    }

    const str = getNumber(actor, "system.abilities.str.mod") ?? 0;
    const dex = getNumber(actor, "system.abilities.dex.mod") ?? 0;
    if (attackType === "ranged") return dex;
    return finesse && dex > str ? dex : str;
  }

  function getWeaponDamage(item) {
    const damage = getProperty(item, "system.damage");
    if (typeof damage === "string" || typeof damage === "number") return String(damage);
    const values = [damage?.value, damage?.oneHanded, damage?.twoHanded]
      .map(value => String(value ?? "").trim())
      .filter(Boolean);
    return [...new Set(values)].join(" / ");
  }

  function getWeaponProperties(item) {
    return [...new Set(collectPropertyNames(item)
      .map(value => String(value ?? "").trim())
      .filter(value => value && !/^(Actor|Item|Compendium)\./i.test(value))
      .map(value => humanize(value.split(".").pop())))]
      .join(", ");
  }

  function findIdentityItem(items, types) {
    const wanted = new Set(types.map(type => String(type).toLowerCase()));
    const item = items.find(candidate => wanted.has(String(candidate.type ?? "").toLowerCase()));
    return item?.name ?? "";
  }

  function isGearItem(item) {
    const type = String(item?.type ?? "").toLowerCase();
    if (GEAR_TYPES.has(type)) return true;
    return Boolean(item?.system?.isWeapon || item?.system?.isArmor || item?.system?.isWand || item?.system?.isScroll);
  }

  function isPlayerActor(actor) {
    return Boolean(actor?.documentName === "Actor" && String(actor.type ?? "").toLowerCase() === "player");
  }

  function getHpMax(actor) {
    const explicitMax = getNumber(actor, "system.attributes.hp.max");
    if (Number.isFinite(explicitMax) && explicitMax > 0) return explicitMax;
    const base = getNumber(actor, "system.attributes.hp.base");
    const bonus = getNumber(actor, "system.attributes.hp.bonus");
    if (!Number.isFinite(base) && !Number.isFinite(bonus)) return 0;
    return (Number.isFinite(base) ? base : 0) + (Number.isFinite(bonus) ? bonus : 0);
  }

  function getLuckState(actor) {
    const luck = getProperty(actor, "system.luck") ?? {};
    const remaining = Number(luck.remaining ?? 0);
    const pulpMode = Boolean(getSettingFromSystem("usePulpMode", false));
    const available = pulpMode
      ? Number.isFinite(remaining) && remaining > 0
      : Boolean(luck.available);
    return {
      available,
      pulpMode,
      stateLabel: available ? "Ready" : "Spent",
      remaining: Number.isFinite(remaining) ? remaining : 0
    };
  }

  function getAbilityScore(actor, ability) {
    const value = getNumber(actor, "system.abilities." + ability + ".value");
    if (Number.isFinite(value)) return value;
    const base = getNumber(actor, "system.abilities." + ability + ".base");
    const bonus = getNumber(actor, "system.abilities." + ability + ".bonus");
    if (!Number.isFinite(base) && !Number.isFinite(bonus)) return "-";
    return (Number.isFinite(base) ? base : 10) + (Number.isFinite(bonus) ? bonus : 0);
  }

  function getAbilityModifier(actor, ability) {
    try {
      if (typeof actor?.abilityModifier === "function") {
        const value = Number(actor.abilityModifier(ability));
        if (Number.isFinite(value)) return value;
      }
    } catch (_error) {
      // Use the stored score fallback.
    }

    const direct = getNumber(actor, "system.abilities." + ability + ".mod");
    if (Number.isFinite(direct)) return direct;

    const score = Number(getAbilityScore(actor, ability));
    if (!Number.isFinite(score)) return 0;
    if (score <= 3) return -4;
    if (score <= 5) return -3;
    if (score <= 7) return -2;
    if (score <= 9) return -1;
    if (score <= 11) return 0;
    if (score <= 13) return 1;
    if (score <= 15) return 2;
    if (score <= 17) return 3;
    return 4;
  }

  function getNumber(object, path) {
    const value = getProperty(object, path);
    if (value === undefined || value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getProperty(object, path) {
    const utility = globalThis.foundry?.utils?.getProperty;
    if (typeof utility === "function") return utility(object, path);
    return String(path).split(".").reduce((value, key) => value?.[key], object);
  }

  function getSettingFromSystem(key, fallback) {
    try {
      return game.settings.get("shadowdark", key);
    } catch (_error) {
      return fallback;
    }
  }

  function itemSort(left, right) {
    const sort = Number(left?.sort ?? 0) - Number(right?.sort ?? 0);
    if (sort) return sort;
    return String(left?.name ?? "").localeCompare(String(right?.name ?? ""), game.i18n?.lang, {
      sensitivity: "base",
      numeric: true
    });
  }

  function normalizeHandSide(value) {
    const side = String(value ?? "").toLowerCase();
    return side === "left" || side === "right" ? side : "";
  }

  function woundRank(status) {
    return { ok: 0, wounded: 1, critical: 2, destroyed: 3 }[status] ?? 0;
  }

  function sanitizeClass(value) {
    return String(value ?? "ok").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
  }

  function humanize(value) {
    return String(value ?? "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, character => character.toUpperCase());
  }

  function formatModifier(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "+0";
    return number > 0 ? "+" + number : String(number);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

})();
