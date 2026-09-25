import {
  BASTION_ACTOR_TYPE,
  BASTION_DEFENSE_KINDS,
  BASTION_DEFAULT_TYPE,
  BASTION_SHEET_ID,
  BASTION_TYPES,
  BASTION_UPGRADES,
  MODULE_ID,
} from "./constants.js";
import { buildVaultData, getVaultItemSlots } from "./vault.js";
import { getVaultTransferData } from "../libs/bastion-vault-transfer.js";

const ActorSheetBase = globalThis.foundry?.appv1?.sheets?.ActorSheet;
const TextEditorImplementation = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;

function getBastionType(key) {
  return BASTION_TYPES.find(type => type.key === key) ?? BASTION_TYPES[0];
}

function getDefenseId(kind, entry, index) {
  return String(entry?.id || `${kind}-${index + 1}`);
}

function normalizeDefenseList(kind, entries) {
  return Array.isArray(entries)
    ? entries.map((entry, index) => ({
      id: getDefenseId(kind, entry, index),
      actorUuid: String(entry?.actorUuid ?? entry?.uuid ?? "").trim(),
      name: String(entry?.name ?? ""),
      quantity: Math.max(1, Math.floor(getNumber(entry?.quantity, 1))),
      notes: String(entry?.notes ?? ""),
    }))
    : [];
}

async function resolveActorFromUuid(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;

  let document;
  try {
    document = await fromUuid(uuid);
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not resolve bastion defense actor ${uuid}`, error);
    return null;
  }

  if (document?.documentName === "Actor") return document;
  if (document?.documentName === "Token") return document.actor ?? null;
  return null;
}

function getDropEventData(event) {
  const nativeEvent = event?.originalEvent ?? event;

  try {
    const data = TextEditorImplementation?.getDragEventData?.(nativeEvent);
    if (data) return data;
  } catch (_error) {
    // Use the browser drag payload fallback below.
  }

  for (const mime of ["application/json", "text/plain"]) {
    const raw = nativeEvent?.dataTransfer?.getData?.(mime);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      // Try the next supported payload type.
    }
  }

  return null;
}

function isItemDropData(data) {
  return String(data?.type ?? data?.documentName ?? "").toLowerCase() === "item";
}

async function buildDefenseData(defenses) {
  const result = {};

  for (const kind of Object.values(BASTION_DEFENSE_KINDS)) {
    result[kind] = await Promise.all((defenses[kind] ?? []).map(async entry => {
      const actor = await resolveActorFromUuid(entry.actorUuid);
      const hpValue = Number(actor?.system?.attributes?.hp?.value);
      const hpMax = Number(actor?.system?.attributes?.hp?.max);
      const hasHp = Boolean(actor) && (Number.isFinite(hpValue) || Number.isFinite(hpMax));
      const currentHp = Number.isFinite(hpValue) ? hpValue : 0;
      const maximumHp = Number.isFinite(hpMax) ? hpMax : currentHp;
      const hpPercent = hasHp && maximumHp > 0
        ? Math.min(100, Math.max(0, Math.round((currentHp / maximumHp) * 100)))
        : 0;

      return {
        ...entry,
        actorUuid: actor?.uuid ?? entry.actorUuid,
        actorExists: Boolean(actor),
        hasHp,
        hp: hasHp
          ? {
            value: currentHp,
            max: maximumHp,
            percent: hpPercent,
          }
          : null,
        img: actor?.img ?? "icons/svg/mystery-man.svg",
        name: actor?.name ?? entry.name,
      };
    }));
  }

  return result;
}

function getBastionState(actor) {
  const state = actor?.getFlag?.(MODULE_ID, "bastion") ?? {};
  const type = getBastionType(state.type || BASTION_DEFAULT_TYPE);
  const validKeys = new Set(BASTION_UPGRADES.map(upgrade => upgrade.key));
  const upgrades = Array.isArray(state.upgrades)
    ? [...new Set(state.upgrades.filter(key => validKeys.has(key)))]
    : [];
  const defenses = {
    siegeWeapons: normalizeDefenseList(
      BASTION_DEFENSE_KINDS.siegeWeapons,
      state.defenses?.[BASTION_DEFENSE_KINDS.siegeWeapons]
    ),
    warbands: normalizeDefenseList(
      BASTION_DEFENSE_KINDS.warbands,
      state.defenses?.[BASTION_DEFENSE_KINDS.warbands]
    ),
  };

  return { type, upgrades, defenses };
}

function getNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function canEditBastion(sheet) {
  return Boolean(sheet.isEditable && globalThis.game?.user?.isGM);
}

async function createBastionActor({ name = "New Bastion", folder = null } = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn?.("Only the GM can create a Bastion.");
    return null;
  }

  const type = BASTION_TYPES[0];
  const actorData = {
    name: String(name || "").trim() || "New Bastion",
    type: BASTION_ACTOR_TYPE,
    img: "icons/svg/castle.svg",
    system: {
      attributes: {
        ac: { value: type.ac },
        hp: {
          value: type.hp,
          max: type.hp,
        },
      },
      coins: {
        gp: 0,
        sp: 0,
        cp: 0,
      },
    },
    flags: {
      core: {
        sheetClass: BASTION_SHEET_ID,
      },
      [MODULE_ID]: {
        isBastion: true,
        bastion: {
          type: type.key,
          upgrades: [],
          defenses: {
            siegeWeapons: [],
            warbands: [],
          },
        },
      },
    },
  };

  if (folder) actorData.folder = folder;

  const actor = await Actor.create(actorData);
  actor?.sheet?.render(true);
  return actor;
}

class MKBastionSheet extends ActorSheetBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shadowdark", "sheet", "actor", "mk-bastion-sheet-window"],
      template: `modules/${MODULE_ID}/templates/bastion-sheet.hbs`,
      width: 980,
      height: 760,
      resizable: true,
      scrollY: [".mk-bastion-tab-body"],
      tabs: [
        {
          navSelector: ".mk-bastion-nav",
          contentSelector: ".mk-bastion-content",
          initial: "overview",
        },
      ],
      dragDrop: [
        {
          dragSelector: null,
          dropSelector: ".mk-bastion-sheet",
        },
      ],
    });
  }

  get template() {
    return `modules/${MODULE_ID}/templates/bastion-sheet.hbs`;
  }

  async getData(options = {}) {
    const context = await super.getData(options);
    const state = getBastionState(this.actor);
    const installed = new Set(state.upgrades);
    const installedCount = state.upgrades.length;
    const hasVault = installed.has("vault");
    const defenseCount = state.defenses.siegeWeapons.length + state.defenses.warbands.length;
    const defenses = await buildDefenseData(state.defenses);
    const canEdit = canEditBastion(this);
    const hpMax = state.type.hp;
    const hpValue = Math.min(
      Math.max(getNumber(this.actor.system?.attributes?.hp?.value, hpMax), 0),
      hpMax
    );

    context.mk = {
      isBastion: true,
      canEditBastion: canEdit,
      bastion: {
        type: state.type,
        location: String(this.actor.system?.location ?? ""),
        hasVault,
        defenseCount,
        types: BASTION_TYPES.map(type => ({
          ...type,
          selected: type.key === state.type.key,
        })),
        hp: {
          value: hpValue,
          max: hpMax,
          percent: hpMax > 0 ? Math.min(100, Math.round((hpValue / hpMax) * 100)) : 0,
        },
        ac: state.type.ac,
        defenses,
        vault: {
          ...buildVaultData(this.actor.items),
          gold: Math.max(0, Math.floor(getNumber(this.actor.system?.coins?.gp, 0))),
        },
        upgrades: BASTION_UPGRADES.map(upgrade => ({
          ...upgrade,
          installed: installed.has(upgrade.key),
          canInstall: canEdit && (installed.has(upgrade.key) || installedCount < state.type.upgrades),
        })),
        installedCount,
        upgradeLimit: state.type.upgrades,
      },
    };

    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-action='change-bastion-type']").on("change", event => {
      this._onChangeBastionType(event);
    });

    html.find("[data-action='toggle-bastion-upgrade']").on("click", event => {
      this._onToggleBastionUpgrade(event);
    });

    html.find("[data-action='update-defense']").on("change", event => {
      this._onUpdateDefense(event);
    });

    html.find("[data-action='remove-defense']").on("click", event => {
      this._onRemoveDefense(event);
    });

    html.find("[data-action='open-defense-actor']").on("click", event => {
      this._onOpenDefenseActor(event);
    });

    html.find("[data-action='open-vault-item']").on("click", event => {
      this._onOpenVaultItem(event);
    });

    html.find("[data-action='update-vault-gold']").on("change", event => {
      this._onUpdateVaultGold(event);
    });

    html[0]?.querySelectorAll("[data-defense-dropzone='true']").forEach(dropzone => {
      dropzone.addEventListener("dragenter", event => this._onDefenseDragEnter(event), true);
      dropzone.addEventListener("dragover", event => this._onDefenseDragOver(event), true);
      dropzone.addEventListener("dragleave", event => this._onDefenseDragLeave(event), true);
      dropzone.addEventListener("drop", event => this._onDefenseDragLeave(event), true);
    });

    html[0]?.querySelectorAll("[data-vault-dropzone='true']").forEach(dropzone => {
      dropzone.addEventListener("dragenter", event => this._onVaultDragEnter(event), true);
      dropzone.addEventListener("dragover", event => this._onVaultDragOver(event), true);
      dropzone.addEventListener("dragleave", event => this._onVaultDragLeave(event), true);
      dropzone.addEventListener("drop", event => this._onVaultDragLeave(event), true);
    });

    html[0]?.querySelectorAll("[data-vault-trash-dropzone='true']").forEach(dropzone => {
      dropzone.addEventListener("dragenter", event => this._onVaultTrashDragEnter(event), true);
      dropzone.addEventListener("dragover", event => this._onVaultTrashDragOver(event), true);
      dropzone.addEventListener("dragleave", event => this._onVaultTrashDragLeave(event), true);
      dropzone.addEventListener("drop", event => this._onVaultTrashDragLeave(event), true);
    });

    html[0]?.querySelectorAll("[data-vault-item-id]").forEach(itemElement => {
      itemElement.draggable = true;
      itemElement.addEventListener("dragstart", event => this._onVaultItemDragStart(event));
    });
  }

  async _onChangeBastionType(event) {
    if (!canEditBastion(this)) return;

    const type = getBastionType(event.currentTarget.value);
    const currentState = getBastionState(this.actor);
    if (currentState.upgrades.length > type.upgrades) {
      ui.notifications?.warn?.(
        `Remove ${currentState.upgrades.length - type.upgrades} upgrade(s) before changing to a ${type.name}.`
      );
      return;
    }

    const currentHp = getNumber(this.actor.system?.attributes?.hp?.value, type.hp);

    await this.actor.update({
      [`flags.${MODULE_ID}.bastion.type`]: type.key,
      "system.attributes.ac.value": type.ac,
      "system.attributes.hp.max": type.hp,
      "system.attributes.hp.value": Math.min(currentHp, type.hp),
    });
  }

  async _onToggleBastionUpgrade(event) {
    if (!canEditBastion(this)) return;

    const key = String(event.currentTarget.dataset.upgradeKey ?? "");
    const upgrade = BASTION_UPGRADES.find(entry => entry.key === key);
    if (!upgrade) return;

    const state = getBastionState(this.actor);
    const installed = state.upgrades.includes(key);
    if (!installed && state.upgrades.length >= state.type.upgrades) {
      ui.notifications?.warn?.(`This ${state.type.name} supports only ${state.type.upgrades} upgrades.`);
      return;
    }

    const upgrades = installed
      ? state.upgrades.filter(entry => entry !== key)
      : [...state.upgrades, key];

    await this.actor.update({
      [`flags.${MODULE_ID}.bastion.upgrades`]: upgrades,
    });
  }

  async _onUpdateDefense(event) {
    if (!canEditBastion(this)) return;

    const element = event.currentTarget;
    const kind = String(element.dataset.defenseKind ?? "");
    const id = String(element.dataset.defenseId ?? "");
    const field = String(element.dataset.defenseField ?? "");
    if (!Object.values(BASTION_DEFENSE_KINDS).includes(kind) || !id) return;
    if (!["quantity", "notes"].includes(field)) return;

    const state = getBastionState(this.actor);
    const entries = state.defenses[kind].map(entry => {
      if (entry.id !== id) return entry;

      const value = field === "quantity"
        ? Math.max(1, Math.floor(getNumber(element.value, 1)))
        : String(element.value ?? "");

      return { ...entry, [field]: value };
    });

    await this.actor.update({
      [`flags.${MODULE_ID}.bastion.defenses.${kind}`]: entries,
    });
  }

  async _onOpenDefenseActor(event) {
    const uuid = String(event.currentTarget.dataset.defenseUuid ?? "").trim();
    const actor = await resolveActorFromUuid(uuid);
    if (!actor) {
      ui.notifications?.warn?.("The linked defense actor could not be found.");
      return;
    }

    actor.sheet?.render(true);
  }

  async _onOpenVaultItem(event) {
    const itemId = String(event.currentTarget.dataset.vaultItemId ?? "").trim();
    const item = this.actor.items?.get?.(itemId)
      ?? Array.from(this.actor.items ?? []).find(candidate => candidate.id === itemId);
    if (!item) {
      ui.notifications?.warn?.("The stored vault item could not be found.");
      return;
    }

    item.sheet?.render(true);
  }

  async _onUpdateVaultGold(event) {
    if (!canEditBastion(this)) return;

    const value = Math.max(0, Math.floor(getNumber(event.currentTarget.value, 0)));
    event.currentTarget.value = value;
    await this.actor.update({ "system.coins.gp": value });
  }

  _onVaultItemDragStart(event) {
    const itemId = String(event.currentTarget.dataset.vaultItemId ?? "").trim();
    const item = this.actor.items?.get?.(itemId)
      ?? Array.from(this.actor.items ?? []).find(candidate => candidate.id === itemId);
    if (!item || !event.dataTransfer) return;

    let dragData;
    try {
      dragData = item.toDragData?.() ?? {
        type: "Item",
        uuid: item.uuid,
        id: item.id,
      };
    } catch (_error) {
      dragData = {
        type: "Item",
        uuid: item.uuid,
        id: item.id,
      };
    }

    dragData = {
      ...dragData,
      [MODULE_ID]: {
        ...(dragData[MODULE_ID] ?? {}),
        vaultTransfer: {
          sourceActorUuid: this.actor.uuid,
          sourceItemUuid: item.uuid,
          sourceItemId: item.id,
        },
      },
    };
    const payload = JSON.stringify(dragData);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", payload);
    event.dataTransfer.setData("text/plain", payload);
  }

  async _onRemoveDefense(event) {
    if (!canEditBastion(this)) return;

    const kind = String(event.currentTarget.dataset.defenseKind ?? "");
    const id = String(event.currentTarget.dataset.defenseId ?? "");
    if (!Object.values(BASTION_DEFENSE_KINDS).includes(kind) || !id) return;

    const state = getBastionState(this.actor);
    const entries = state.defenses[kind].filter(entry => entry.id !== id);
    await this.actor.update({
      [`flags.${MODULE_ID}.bastion.defenses.${kind}`]: entries,
    });
  }

  _onDefenseDragEnter(event) {
    event.currentTarget.classList.add("is-drag-over");
  }

  _onDefenseDragOver(event) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    event.currentTarget.classList.add("is-drag-over");
  }

  _onDefenseDragLeave(event) {
    const dropzone = event.currentTarget;
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-drag-over");
  }

  _onVaultDragEnter(event) {
    event.currentTarget.classList.add("is-drag-over");
  }

  _onVaultDragOver(event) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("is-drag-over");
  }

  _onVaultDragLeave(event) {
    const dropzone = event.currentTarget;
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-drag-over");
  }

  _onVaultTrashDragEnter(event) {
    event.currentTarget.classList.add("is-drag-over");
  }

  _onVaultTrashDragOver(event) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    event.currentTarget.classList.add("is-drag-over");
  }

  _onVaultTrashDragLeave(event) {
    const dropzone = event.currentTarget;
    if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("is-drag-over");
  }

  async _onDrop(event) {
    event.preventDefault();

    const data = getDropEventData(event);
    const dropzone = event.target?.closest?.("[data-defense-dropzone='true']");
    const trashDropzone = event.target?.closest?.("[data-vault-trash-dropzone='true']");
    const vaultDropzone = event.target?.closest?.("[data-vault-dropzone='true']");
    if (!dropzone && !vaultDropzone && !trashDropzone) {
      if (isItemDropData(data)) {
        ui.notifications?.warn?.(
          getBastionState(this.actor).upgrades.includes("vault")
            ? "Drop items into the Vault grid."
            : "Install the Vault upgrade before storing items here."
        );
        return false;
      }
      return super._onDrop(event);
    }

    if (trashDropzone) return this._onVaultTrashDrop(event, data, trashDropzone);
    if (vaultDropzone) return this._onVaultDrop(event, data, vaultDropzone);

    dropzone.classList.remove("is-drag-over");

    if (!canEditBastion(this)) {
      ui.notifications?.warn?.("Only the GM can add defenses to a bastion.");
      return false;
    }

    const kind = String(dropzone.dataset.defenseKind ?? "");
    if (!Object.values(BASTION_DEFENSE_KINDS).includes(kind)) return false;

    const droppedActor = await this._resolveDroppedActor(data);
    if (!droppedActor) {
      ui.notifications?.warn?.("Drop an NPC actor into this defense section.");
      return false;
    }

    if (String(droppedActor.type ?? "").toUpperCase() !== "NPC") {
      ui.notifications?.warn?.("Only NPC actors can be added as bastion defenses.");
      return false;
    }

    const actorUuid = String(droppedActor.uuid ?? "").trim();
    if (!actorUuid) {
      ui.notifications?.warn?.("The dropped NPC does not have a usable actor UUID.");
      return false;
    }

    const state = getBastionState(this.actor);
    const entries = [...state.defenses[kind]];
    if (entries.some(entry => entry.actorUuid === actorUuid)) {
      ui.notifications?.info?.("That NPC is already assigned to this defense section.");
      return false;
    }

    const id = foundry.utils.randomID?.(16) ?? `${kind}-${Date.now()}`;
    entries.push({
      id,
      actorUuid,
      name: droppedActor.name,
      quantity: 1,
      notes: "",
    });

    await this.actor.update({
      [`flags.${MODULE_ID}.bastion.defenses.${kind}`]: entries,
    });
    return false;
  }

  async _onVaultTrashDrop(event, data, dropzone) {
    dropzone.classList.remove("is-drag-over");
    event.stopPropagation();

    if (!canEditBastion(this)) {
      ui.notifications?.warn?.("Only the GM can discard items from a bastion vault.");
      return false;
    }

    const transfer = getVaultTransferData(data);
    if (!transfer || transfer.sourceActorUuid !== this.actor.uuid) {
      ui.notifications?.warn?.("Only Items already stored in this Vault can be discarded here.");
      return false;
    }

    const item = this.actor.items?.get?.(transfer.sourceItemId)
      ?? Array.from(this.actor.items ?? []).find(candidate => (
        candidate.id === transfer.sourceItemId || candidate.uuid === transfer.sourceItemUuid
      ));
    if (!item || !this.actor.deleteEmbeddedDocuments) {
      ui.notifications?.warn?.("The Vault Item could not be found.");
      return false;
    }

    await this.actor.deleteEmbeddedDocuments("Item", [item.id]);
    return false;
  }

  async _onVaultDrop(event, data, dropzone) {
    dropzone.classList.remove("is-drag-over");
    event.stopPropagation();

    if (!canEditBastion(this)) {
      ui.notifications?.warn?.("Only the GM can store items in a bastion vault.");
      return false;
    }

    if (!getBastionState(this.actor).upgrades.includes("vault")) {
      ui.notifications?.warn?.("Install the Vault upgrade before storing items here.");
      return false;
    }

    if (!isItemDropData(data)) {
      ui.notifications?.warn?.("Drop an Item into the Vault grid.");
      return false;
    }

    const droppedItem = await this._resolveDroppedItem(data);
    if (!droppedItem) {
      ui.notifications?.warn?.("The dropped Item could not be found.");
      return false;
    }

    if (droppedItem.parent?.uuid === this.actor.uuid) {
      ui.notifications?.info?.("That Item is already stored in this vault.");
      return false;
    }

    const sourceActor = droppedItem.parent?.documentName === "Actor"
      ? droppedItem.parent
      : null;

    const itemData = typeof droppedItem.toObject === "function"
      ? droppedItem.toObject()
      : (globalThis.foundry?.utils?.deepClone
        ? foundry.utils.deepClone(droppedItem)
        : JSON.parse(JSON.stringify(droppedItem)));
    if (!itemData || typeof itemData !== "object" || !itemData.type) {
      ui.notifications?.warn?.("The dropped data is not a usable Item.");
      return false;
    }

    delete itemData._id;
    delete itemData.id;

    const currentVault = buildVaultData(this.actor.items);
    const incomingSlots = getVaultItemSlots(itemData);
    if (currentVault.used + incomingSlots > currentVault.capacity) {
      ui.notifications?.warn?.(
        `The Vault has only ${currentVault.remaining} slot(s) remaining; this Item needs ${incomingSlots}.`
      );
      return false;
    }

    let createdItem;
    try {
      [createdItem] = await this.actor.createEmbeddedDocuments("Item", [itemData], { renderSheet: false });
      if (sourceActor && sourceActor.uuid !== this.actor.uuid) {
        await sourceActor.deleteEmbeddedDocuments("Item", [droppedItem.id]);
      }
    } catch (error) {
      if (createdItem?.id && this.actor.deleteEmbeddedDocuments) {
        try {
          await this.actor.deleteEmbeddedDocuments("Item", [createdItem.id], { renderSheet: false });
        } catch (_rollbackError) {
          // Preserve the original error while avoiding a second user-facing failure.
        }
      }
      console.error(`${MODULE_ID} | Could not move Item into bastion vault`, error);
      ui.notifications?.error?.("The Item could not be moved into the Vault.");
    }

    return false;
  }

  async _resolveDroppedItem(data) {
    if (!data) return null;

    const uuid = data.uuid ?? data.itemUuid ?? data.data?.uuid;
    if (uuid && typeof globalThis.fromUuid === "function") {
      try {
        const item = await globalThis.fromUuid(uuid);
        if (item?.documentName === "Item") return item;
      } catch (_error) {
        // Try the world-item and raw-data fallbacks below.
      }
    }

    if (!isItemDropData(data)) return null;

    const itemId = data.id ?? data._id ?? data.itemId ?? data.data?._id ?? data.data?.id;
    const worldItem = itemId ? game.items?.get?.(itemId) : null;
    if (worldItem) return worldItem;

    if (data.data && typeof data.data === "object") return data.data;
    if (data.system && typeof data === "object") return data;
    return null;
  }

  async _resolveDroppedActor(data) {
    if (!data) return null;

    if (data.uuid) {
      const actor = await resolveActorFromUuid(data.uuid);
      if (actor) return actor;
    }

    if (data.id && data.type === "Actor") {
      return game.actors?.get(data.id) ?? null;
    }

    return null;
  }
}

export {
  createBastionActor,
  getBastionState,
  MKBastionSheet,
};
