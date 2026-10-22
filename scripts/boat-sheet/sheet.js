import { BOAT_ACTOR_TYPE, BOAT_SHEET_ID, MODULE_ID, boatLabel } from "./constants.js";
import { getBoatCrew, buildBoatCrewData, resolveCrewActor } from "./crew.js";
import { storeBoatCargo } from "./cargo.js";
import { buildGearInventoryData } from "../libs/inventory-slots.js";
import { buildInventoryItemCards, getGroupItemSelection } from "../libs/group-inventory-items.js";
import { queueStoredInventoryMutation } from "../libs/stored-inventory-queue.js";
import { canManageActorItems, getVaultTransferData } from "../libs/bastion-vault-transfer.js";
import { getSheetTheme, bindSheetThemeToggle } from "../libs/sheet-themes.js";
import { confirmGmDialog } from "../libs/dialog-v2.js";

const ActorSheetBase = globalThis.foundry?.appv1?.sheets?.ActorSheet;

async function createBoatActor({ name, folder = null } = {}) {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.(boatLabel("gmCreate"));
    return null;
  }
  const data = {
    name: String(name ?? "").trim() || boatLabel("newName"), type: BOAT_ACTOR_TYPE,
    img: "icons/svg/anchor.svg",
    prototypeToken: { actorLink: true, bar1: { attribute: "attributes.hp" } },
    flags: { core: { sheetClass: BOAT_SHEET_ID } },
  };
  if (folder) data.folder = folder;
  const actor = await Actor.create(data);
  actor?.sheet?.render(true);
  return actor;
}

class MKBoatSheet extends ActorSheetBase {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["shadowdark", "sheet", "actor", "mk-boat-sheet-window"],
      template: `modules/${MODULE_ID}/templates/boat-sheet.hbs`, width: 820, height: 800, resizable: true,
      scrollY: [".mk-boat-tab-body"],
      tabs: [{ navSelector: ".mk-boat-nav", contentSelector: ".mk-boat-content", initial: "overview" }],
      dragDrop: [{ dragSelector: "[data-cargo-item-id]", dropSelector: ".mk-boat-sheet" }],
    });
  }

  get template() { return `modules/${MODULE_ID}/templates/boat-sheet.hbs`; }
  get canManageBoat() { return Boolean(this.isEditable && canManageActorItems(this.actor)); }

  async getData(options = {}) {
    const context = await super.getData(options);
    const crew = await buildBoatCrewData(this.actor);
    const hp = this.actor.system?.attributes?.hp ?? { value: 0, max: 0 };
    const editor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
    const notes = this.actor.system?.notes ?? "";
    const cargo = buildGearInventoryData(this.actor.items, this.actor.system?.cargoCapacity);
    cargo.items = Array.from(this.actor.items ?? []).flatMap(buildInventoryItemCards);
    context.mk = {
      theme: getSheetTheme("boat"), canEdit: this.canManageBoat,
      system: this.actor.system, crew,
      crewOverCapacity: crew.length > Number(this.actor.system?.crewCapacity ?? 0),
      cargo,
      hpPercent: hp.max > 0 ? Math.min(100, Math.max(0, hp.value / hp.max * 100)) : 0,
      notesHTML: editor?.enrichHTML ? await editor.enrichHTML(notes, {
        async: true, secrets: this.actor.isOwner, relativeTo: this.actor,
      }) : "",
    };
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    bindSheetThemeToggle(html, "boat");
    this._activateCargoContextMenu(html);
    for (const [action, event, method] of [
      ["open-crew", "click", "_onOpenCrew"], ["remove-crew", "click", "_onRemoveCrew"],
      ["crew-role", "change", "_onCrewRole"], ["open-cargo", "click", "_onOpenCargo"],
      ["cargo-help", "click", "_onCargoHelp"],
    ]) html.find(`[data-action='${action}']`).on(event, e => {
      void this[method](e).catch(error => this._reportError(error));
    });
  }

  _reportError(error) {
    console.error(`${MODULE_ID} | Boat Sheet`, error);
    globalThis.ui?.notifications?.error?.(boatLabel("saveFailed"));
  }

  _disableFields(form) {
    super._disableFields(form);
    for (const button of form.querySelectorAll("[data-action='open-crew'], [data-action='open-cargo'], [data-action='cargo-help']")) {
      button.disabled = button.dataset.action === "open-crew"
        && Boolean(button.closest(".is-missing"));
    }
  }

  _queueChange(operation) {
    const pending = (this._pendingChange ?? Promise.resolve()).then(operation);
    this._pendingChange = pending.catch(() => {});
    return pending;
  }

  _canDragStart() { return this.canManageBoat; }
  _canDragDrop() { return this.canManageBoat; }

  _onDragStart(event) {
    if (!this.canManageBoat) return;
    const card = event.target?.closest?.("[data-cargo-item-id]")?.dataset;
    const item = this.actor.items?.get?.(card?.cargoItemId);
    if (!item || !event.dataTransfer) return;
    const selection = getGroupItemSelection(item, { quantity: card.itemQuantity, sourceQuantity: card.sourceQuantity });
    if (!selection) {
      event.preventDefault();
      globalThis.ui?.notifications?.warn?.(boatLabel("cargoChanged"));
      return;
    }
    const data = {
      ...item.toDragData(), [MODULE_ID]: { cargoTransfer: {
        sourceActorUuid: this.actor.uuid, sourceItemUuid: item.uuid, sourceItemId: item.id,
        quantity: selection.quantity, sourceQuantity: selection.sourceQuantity,
      } },
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(data));
    event.dataTransfer.setData("application/json", JSON.stringify(data));
    event.dataTransfer.effectAllowed = "move";
  }

  async _onDrop(event) {
    event.preventDefault();
    if (!this.canManageBoat) return false;
    const editor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
    const data = editor?.getDragEventData?.(event);
    if (!data) return false;
    try {
      return await this._queueChange(async () => {
        if (!this.canManageBoat) return false;
        if (["Actor", "Token"].includes(data.type)) return this._addCrew(data);
        if (data.type !== "Item") return false;
        const transfer = getVaultTransferData(data) ?? data?.[MODULE_ID]?.groupInventoryTransfer;
        if (transfer?.sourceActorUuid === this.actor.uuid) return false;
        const item = await globalThis.Item?.implementation?.fromDropData?.(data);
        if (!item || item.documentName !== "Item") return false;
        if (transfer && (item.parent?.uuid !== transfer.sourceActorUuid
          || item.id !== transfer.sourceItemId)) return false;
        const card = data?.[MODULE_ID]?.cargoTransfer || data?.[MODULE_ID]?.groupInventoryTransfer ? transfer : null;
        return storeBoatCargo(this.actor, item, card);
      });
    } catch (error) { this._reportError(error); return false; }
  }

  async _addCrew(data) {
    if (!this.canManageBoat) return false;
    const uuid = data.uuid ?? (data.id ? globalThis.game?.actors?.get?.(data.id)?.uuid : null);
    const linked = await resolveCrewActor(uuid);
    if (!linked || linked.uuid === this.actor.uuid) {
      globalThis.ui?.notifications?.warn?.(boatLabel("crewOnly"));
      return false;
    }
    const crew = getBoatCrew(this.actor);
    if (crew.some(entry => entry.actorUuid === linked.uuid)) return false;
    crew.push({ actorUuid: linked.uuid, name: linked.name, role: "" });
    await this.actor.update({ "system.crew": crew });
    return true;
  }

  _crewUuid(event) { return event.currentTarget.closest("[data-crew-uuid]")?.dataset.crewUuid; }
  _cargoItem(event) {
    return this.actor.items?.get?.(event.currentTarget.closest("[data-cargo-item-id]")?.dataset.cargoItemId);
  }

  async _onOpenCrew(event) {
    event.preventDefault();
    const uuid = this._crewUuid(event);
    if (!getBoatCrew(this.actor).some(entry => entry.actorUuid === uuid)) return;
    const actor = await resolveCrewActor(uuid);
    actor?.sheet?.render(true);
  }

  async _onRemoveCrew(event) {
    event.preventDefault();
    return this._queueChange(async () => {
      if (!this.canManageBoat) return;
      await this.actor.update({ "system.crew": getBoatCrew(this.actor).filter(entry => entry.actorUuid !== this._crewUuid(event)) });
    });
  }

  async _onCrewRole(event) {
    return this._queueChange(async () => {
      if (!this.canManageBoat) return;
      const crew = getBoatCrew(this.actor);
      const member = crew.find(entry => entry.actorUuid === this._crewUuid(event));
      if (!member) return;
      member.role = String(event.currentTarget.value ?? "").trim();
      await this.actor.update({ "system.crew": crew });
    });
  }

  async _onOpenCargo(event) { event.preventDefault(); this._cargoItem(event)?.sheet?.render(true); }

  async _onCargoHelp(event) {
    event.preventDefault();
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (typeof DialogV2 !== "function") return null;
    return new DialogV2({
      window: { title: boatLabel("cargoHelpTitle") },
      position: { width: 560 },
      classes: ["mk-boat-help-dialog", ...getSheetTheme("boat").classes],
      content: `<article class="mk-boat-cargo-help"><p>${boatLabel("cargoHint")}</p></article>`,
      buttons: [{ action: "close", label: boatLabel("close"), default: true }],
    }).render(true);
  }

  _activateCargoContextMenu(html) {
    if (this._cargoContextMenu?.element?.isConnected) void this._cargoContextMenu.close({ animate: false });
    const ContextMenu = globalThis.foundry?.applications?.ux?.ContextMenu;
    const root = html?.nodeType === 1 ? html : html?.[0];
    if (!ContextMenu || !root || !this.canManageBoat) return;
    class CargoContextMenu extends ContextMenu {
      _setPosition(menu, target, options) {
        menu.classList.add("mk-boat-item-context-menu", ...getSheetTheme("boat").classes);
        return super._setPosition(menu, target, options);
      }
    }
    this._cargoContextMenu = new CargoContextMenu(root, ".mk-boat-cargo-item[data-cargo-item-id]", [{
      name: "MK_SHADOWDARK.boat.trashCargo",
      icon: '<i class="fas fa-trash" aria-hidden="true"></i>',
      condition: row => Boolean(this.canManageBoat && this.actor.items?.get?.(row.dataset.cargoItemId)),
      callback: row => this._onTrashCargoCard(row).catch(error => this._reportError(error)),
    }], { jQuery: false, fixed: true });
  }

  async _onTrashCargoCard(row) {
    if (!this.canManageBoat) return false;
    const { cargoItemId: itemId, itemQuantity: quantity, sourceQuantity } = row?.dataset ?? {};
    const item = this.actor.items?.get?.(itemId);
    const selection = item && getGroupItemSelection(item, { quantity, sourceQuantity });
    if (!selection) {
      globalThis.ui?.notifications?.warn?.(boatLabel("cargoChanged"));
      return false;
    }
    const name = document.createElement("span");
    name.textContent = item.name;
    const confirmed = await confirmGmDialog({
      title: boatLabel("trashCargoTitle"),
      content: boatLabel("trashCargoPrompt", { name: name.innerHTML, quantity: selection.quantity }),
      yes: { label: boatLabel("trashCargo") },
      no: { label: boatLabel("close"), default: true },
      classes: ["mk-boat-item-trash-dialog", ...getSheetTheme("boat").classes],
    });
    if (!confirmed) return false;
    return queueStoredInventoryMutation(async () => {
      // Recheck after confirmation, in the same queue as cargo transfers.
      const current = this.actor.items?.get?.(itemId);
      const selected = current === item && getGroupItemSelection(current, { quantity, sourceQuantity });
      if (!this.canManageBoat || !selected) {
        globalThis.ui?.notifications?.warn?.(boatLabel("cargoChanged"));
        return false;
      }
      if (selected.remaining > 0) await current.update({ "system.quantity": selected.remaining });
      else await this.actor.deleteEmbeddedDocuments("Item", [itemId]);
      return true;
    });
  }

  async _updateObject(event, formData) {
    if (!this.canManageBoat) return;
    const countFields = ["attributes.ac.value", "attributes.hp.value", "attributes.hp.max", "crewCapacity", "passengerCapacity", "cargoCapacity"];
    for (const path of countFields) {
      const key = `system.${path}`;
      if (!Object.hasOwn(formData, key)) continue;
      const number = Number(formData[key]);
      if (!Number.isInteger(number) || number < 0) {
        globalThis.ui?.notifications?.warn?.(boatLabel("invalidStat"));
        this.render(false);
        return;
      }
      formData[key] = number;
    }
    const valueKey = "system.attributes.hp.value";
    const maxKey = "system.attributes.hp.max";
    if (Object.hasOwn(formData, valueKey) || Object.hasOwn(formData, maxKey)) {
      formData[valueKey] = Math.min(formData[valueKey] ?? this.actor.system.attributes.hp.value,
        formData[maxKey] ?? this.actor.system.attributes.hp.max);
    }
    return super._updateObject(event, formData);
  }
}

export { createBoatActor, MKBoatSheet };
