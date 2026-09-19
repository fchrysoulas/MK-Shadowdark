import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";
import {
  getItemHandUse,
  isArmor,
  isEquipped,
  isShield,
  isStashed
} from "../libs/equipment.js";

(() => {
  const MODULE_ID = "mk-shadowdark";
  const SUBMODULE = "Character Dashboard";
  const SETTING_ENABLED = "characterDashboardEnabled";
  const BODY_SLOT_FLAG = "bodySlot";
  const HAND_SIDE_FLAG = "handSide";
  const dashboardWindows = new Map();
  const rerenderTimers = new Map();

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

  const foundryApplicationApi = globalThis.foundry?.applications?.api ?? {};
  const ApplicationV2 = foundryApplicationApi.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApplicationApi.HandlebarsApplicationMixin;
  const DashboardApplicationBase = ApplicationV2 && HandlebarsApplicationMixin
    ? HandlebarsApplicationMixin(ApplicationV2)
    : class {};

  class CharacterDashboardApplication extends DashboardApplicationBase {
    static DEFAULT_OPTIONS = {
      classes: ["mk-character-dashboard-window"],
      position: {
        width: 1320,
        height: 820
      },
      window: {
        icon: "fa-solid fa-person",
        resizable: true
      }
    };

    static PARTS = {
      main: {
        template: "modules/mk-shadowdark/templates/character-dashboard.hbs",
        scrollable: [".mk-dashboard-left", ".mk-dashboard-right"]
      }
    };

    constructor(actor, options = {}) {
      super({
        ...options,
        id: "mk-character-dashboard-" + actor.id,
        window: {
          ...options.window,
          title: actor.name + " - Body"
        }
      });
      this.actor = actor;
    }

    async _prepareContext(options) {
      const context = typeof super._prepareContext === "function"
        ? await super._prepareContext(options)
        : {};
      return {
        ...context,
        ...buildDashboardContext(this.actor)
      };
    }

    _onRender(context, options) {
      super._onRender?.(context, options);
      bindDashboardInteractions(this, this.element);
    }

    async close(options = {}) {
      dashboardWindows.delete(this.actor.uuid);
      return super.close(options);
    }
  }

  onCharacterSheetRender("Character Dashboard", injectDashboardButtonSafely, { priority: 35 });

  Hooks.on("updateActor", actor => scheduleDashboardRerender(actor));
  Hooks.on("createItem", item => scheduleDashboardRerender(item?.parent));
  Hooks.on("updateItem", item => scheduleDashboardRerender(item?.parent));
  Hooks.on("deleteItem", item => scheduleDashboardRerender(item?.parent));
  Hooks.on("createActiveEffect", effect => scheduleDashboardRerender(effect?.parent));
  Hooks.on("updateActiveEffect", effect => scheduleDashboardRerender(effect?.parent));
  Hooks.on("deleteActiveEffect", effect => scheduleDashboardRerender(effect?.parent));

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (!mod) return;
    mod.api = mod.api ?? {};
    mod.api.characterDashboard = {
      open: actor => isPlayerActor(actor) ? openDashboard(actor) : null,
      getBodySlot: item => getBodySlot(item),
      assignBodySlot: (item, slotKey) => assignBodySlot(item, slotKey),
      clearBodySlot: item => clearBodySlot(item),
      slots: SLOT_DEFINITIONS.map(slot => ({ ...slot }))
    };
  });

  function injectDashboardButtonSafely(app, html) {
    try {
      injectDashboardButton(app, html);
    } catch (error) {
      console.error(MODULE_ID + " v" + getModuleVersion() + " | " + SUBMODULE + " | render error", error);
    }
  }

  function injectDashboardButton(app, html) {
    if (game.system?.id !== "shadowdark" || !getSetting(SETTING_ENABLED, true)) return;
    const actor = app?.actor ?? app?.object;
    if (!isPlayerActor(actor)) return;

    const root = getRootElement(html);
    if (!root?.querySelector) return;

    const sheet = getSheetForm(root) ?? root;
    sheet.querySelectorAll(".mk-character-dashboard-launch").forEach(button => button.remove());

    const header = sheet.querySelector("header.SD-header");
    if (!header) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "mk-character-dashboard-launch";
    button.title = "Open body and equipment view";
    button.setAttribute("aria-label", "Open body and equipment view");
    button.innerHTML = '<i class="fa-solid fa-person" aria-hidden="true"></i><span>Body</span>';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openDashboard(actor);
    });
    header.append(button);
  }

  function openDashboard(actor) {
    if (!ApplicationV2 || !HandlebarsApplicationMixin) {
      ui.notifications?.error?.("Foundry ApplicationV2 is unavailable; the Character Dashboard cannot open.");
      return null;
    }

    let application = dashboardWindows.get(actor.uuid);
    if (!application) {
      application = new CharacterDashboardApplication(actor);
      dashboardWindows.set(actor.uuid, application);
    }
    application.render({ force: true });
    return application;
  }

  function scheduleDashboardRerender(actor) {
    if (!isPlayerActor(actor)) return;
    const application = dashboardWindows.get(actor.uuid);
    if (!application) return;

    const existing = rerenderTimers.get(actor.uuid);
    if (existing) window.clearTimeout(existing);

    const timeout = window.setTimeout(() => {
      rerenderTimers.delete(actor.uuid);
      if (dashboardWindows.get(actor.uuid) === application) application.render({ force: true });
    }, 50);
    rerenderTimers.set(actor.uuid, timeout);
  }

  function buildDashboardContext(actor) {
    const items = Array.from(actor.items ?? []);
    const woundState = buildWoundState(actor);
    const slotState = buildSlotState(items, woundState);
    const level = getNumber(actor, "system.level.value");
    const className = findIdentityItem(items, ["class"]);
    const ancestryName = findIdentityItem(items, ["ancestry"]);
    const subtitleParts = [];
    if (Number.isFinite(level)) subtitleParts.push("Level " + level);
    if (className) subtitleParts.push(className);
    if (ancestryName) subtitleParts.push(ancestryName);

    const hpValue = getNumber(actor, "system.attributes.hp.value") ?? 0;
    const hpMax = getHpMax(actor);
    const hpPercent = hpMax > 0 ? clamp((hpValue / hpMax) * 100, 0, 100) : 0;
    const ac = getNumber(actor, "system.attributes.ac.value");
    const luck = getLuckState(actor);

    const stats = [
      {
        key: "hp",
        label: "Health",
        icon: "fa-solid fa-heart",
        value: hpMax > 0 ? hpValue + " / " + hpMax : String(hpValue),
        percent: hpPercent,
        hasBar: true,
        tone: hpValue <= 0 ? "danger" : hpPercent <= 40 ? "warning" : "normal"
      },
      {
        key: "ac",
        label: "Armor Class",
        icon: "fa-solid fa-shield-halved",
        value: Number.isFinite(ac) ? String(ac) : "-"
      },
      {
        key: "level",
        label: "Level",
        icon: "fa-solid fa-star",
        value: Number.isFinite(level) ? String(level) : "-"
      },
      {
        key: "luck",
        label: "Luck",
        icon: "fa-solid fa-clover",
        value: luck.available ? "Ready" : "Spent",
        tone: luck.available ? "normal" : "muted"
      }
    ];

    const abilities = ["str", "dex", "con", "int", "wis", "cha"].map(key => ({
      key,
      label: key.toUpperCase(),
      value: getAbilityScore(actor, key),
      modifier: formatModifier(getAbilityModifier(actor, key))
    }));

    const conditions = Array.from(actor.effects ?? [])
      .filter(effect => !effect.disabled)
      .slice(0, 6)
      .map(effect => ({
        id: effect.id,
        name: effect.name ?? "Effect",
        img: effect.img || "icons/svg/aura.svg"
      }));

    const equipped = items
      .filter(item => isGearItem(item) && !isStashed(item) && (isEquipped(item) || Boolean(getBodySlot(item))))
      .sort(itemSort)
      .map(item => itemView(item));

    const equippedIds = new Set(equipped.map(item => item.id));
    const carried = items
      .filter(item => isGearItem(item) && !isStashed(item) && !equippedIds.has(item.id))
      .sort((left, right) => {
        const leftQuick = Number(Boolean(left.getFlag?.(MODULE_ID, "quickdraw")));
        const rightQuick = Number(Boolean(right.getFlag?.(MODULE_ID, "quickdraw")));
        return rightQuick - leftQuick || itemSort(left, right);
      })
      .slice(0, 8)
      .map(item => itemView(item));

    return {
      actor: {
        id: actor.id,
        name: actor.name,
        img: actor.img || "icons/svg/mystery-man.svg",
        subtitle: subtitleParts.join(" / ") || "Shadowdark Character"
      },
      canEdit: Boolean(actor.isOwner || game.user?.isGM),
      stats,
      abilities,
      conditions,
      hasConditions: conditions.length > 0,
      leftSlots: slotState.filter(slot => slot.side === "left"),
      rightSlots: slotState.filter(slot => slot.side === "right"),
      woundMarkers: woundState.markers,
      wounds: woundState.active,
      hasWounds: woundState.active.length > 0,
      equipped,
      hasEquipped: equipped.length > 0,
      carried,
      hasCarried: carried.length > 0,
      carriedCount: carried.length
    };
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

      markers.push(model);
      byLocation.set(location.key, model);
      if (isActive) active.push(model);
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
      if (!slotKey || !byKey.has(slotKey)) continue;
      const slot = byKey.get(slotKey);
      if (slot.item) continue;
      setSlotItem(slot, item, { manual: true });
    }

    for (const slot of slots) {
      if (!slot.manual || !["leftHand", "rightHand"].includes(slot.key)) continue;
      const handUse = getItemHandUse(slot.item);
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
    const actor = application.actor;

    root.querySelectorAll("[data-item-id]").forEach(element => {
      element.addEventListener("click", event => {
        if (event.target.closest("[data-action='clear-slot']")) return;
        const item = actor.items?.get(element.dataset.itemId);
        if (item) item.sheet?.render?.(true);
      });
      element.draggable = true;
      element.addEventListener("dragstart", event => beginItemDrag(event, actor, element.dataset.itemId));
    });

    root.querySelectorAll("[data-body-slot]").forEach(slot => {
      slot.addEventListener("dragover", event => {
        if (!(actor.isOwner || game.user?.isGM)) return;
        event.preventDefault();
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

    root.querySelectorAll("[data-action='clear-slot']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void clearSlotByKey(actor, button.dataset.bodySlot);
      });
    });

    root.querySelectorAll("[data-action='open-wounds']").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        game.modules.get(MODULE_ID)?.api?.wounds?.open?.(actor);
      });
    });
  }

  function beginItemDrag(event, actor, itemId) {
    const item = actor.items?.get(itemId);
    if (!item || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "Item",
      uuid: item.uuid,
      id: item.id
    }));
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
    if (!item) {
      ui.notifications?.warn?.("MK-Shadowdark | Drop one of this character's gear items onto the body slot.");
      return;
    }

    await assignBodySlot(item, slotKey);
    application.render({ force: true });
  }

  async function assignBodySlot(item, slotKey) {
    if (!item?.parent || !SLOT_KEYS.has(slotKey)) return false;
    const actor = item.parent;
    if (!(actor.isOwner || game.user?.isGM)) return false;

    const occupied = Array.from(actor.items ?? []).filter(other => (
      other.id !== item.id && getBodySlot(other) === slotKey
    ));
    for (const other of occupied) {
      await other.update({ ["flags." + MODULE_ID + ".-=" + BODY_SLOT_FLAG]: null }, { render: false });
    }

    const changes = {
      ["flags." + MODULE_ID + "." + BODY_SLOT_FLAG]: slotKey
    };
    if (slotKey === "leftHand" || slotKey === "rightHand") {
      changes["flags." + MODULE_ID + "." + HAND_SIDE_FLAG] = slotKey === "leftHand" ? "left" : "right";
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
    if (!item?.parent || !getBodySlot(item)) return false;
    const actor = item.parent;
    if (!(actor.isOwner || game.user?.isGM)) return false;
    await item.update({ ["flags." + MODULE_ID + ".-=" + BODY_SLOT_FLAG]: null });
    return true;
  }

  async function clearSlotByKey(actor, slotKey) {
    if (!SLOT_KEYS.has(slotKey)) return false;
    const item = Array.from(actor.items ?? []).find(candidate => getBodySlot(candidate) === slotKey);
    if (!item) return false;
    return clearBodySlot(item);
  }

  async function getDroppedActorItem(event, actor) {
    const nativeEvent = event.originalEvent ?? event;
    let data = null;

    try {
      const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
      data = textEditor?.getDragEventData?.(nativeEvent) ?? null;
    } catch (_error) {
      data = null;
    }

    if (!data) {
      for (const mime of ["application/json", "text/plain"]) {
        const raw = nativeEvent.dataTransfer?.getData?.(mime);
        if (!raw) continue;
        try {
          data = JSON.parse(raw);
          break;
        } catch (_error) {
          data = null;
        }
      }
    }

    const itemId = data?.id ?? data?._id ?? data?.itemId ?? data?.data?._id ?? data?.data?.id;
    if (itemId && actor.items?.get(itemId)) return actor.items.get(itemId);

    const uuid = data?.uuid ?? data?.itemUuid ?? data?.data?.uuid;
    if (!uuid || typeof globalThis.fromUuid !== "function") return null;

    try {
      const item = await globalThis.fromUuid(uuid);
      return item?.parent?.id === actor.id ? item : null;
    } catch (_error) {
      return null;
    }
  }

  function getBodySlot(item) {
    const value = String(item?.getFlag?.(MODULE_ID, BODY_SLOT_FLAG) ?? "");
    return SLOT_KEYS.has(value) ? value : "";
  }

  function itemView(item) {
    return {
      id: item.id,
      name: item.name ?? "Item",
      img: item.img || "icons/svg/item-bag.svg",
      type: humanize(item.type ?? "Item"),
      quickdraw: Boolean(item.getFlag?.(MODULE_ID, "quickdraw"))
    };
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

  function getRootElement(html) {
    return html?.[0] ?? html;
  }

  function getSheetForm(root) {
    if (root.matches?.("form.shadowdark.sheet.player, form")) return root;
    return root.querySelector?.("form.shadowdark.sheet.player, form") ?? root;
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
    if (pulpMode) return { available: Number.isFinite(remaining) && remaining > 0 };
    return { available: Boolean(luck.available) };
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

  function getSetting(key, fallback) {
    try {
      return game.settings.get(MODULE_ID, key);
    } catch (_error) {
      return fallback;
    }
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

  function getModuleVersion() {
    const mod = game.modules.get(MODULE_ID);
    return mod?.version ?? mod?.data?.version ?? "unknown";
  }
})();
