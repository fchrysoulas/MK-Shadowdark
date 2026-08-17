import {
  MODULE_ID,
  buildTorchWeaponData,
  isTorchLightSource
} from "./torch-attack-data.js";

function getSheetRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function configuredTorchKeywords() {
  try {
    return game.settings.get(MODULE_ID, "groupSheetCampingTorchKeywords") || "torch,torches";
  } catch (_error) {
    return "torch,torches";
  }
}

function isTorchItem(item) {
  return isTorchLightSource(item, configuredTorchKeywords());
}

async function createTemporaryTorchWeapon(actor, lightItem) {
  if (!actor?.createEmbeddedDocuments) return null;
  const created = await actor.createEmbeddedDocuments(
    "Item",
    [buildTorchWeaponData(lightItem)],
    { render: false }
  );
  return created?.[0] ?? null;
}

async function deleteTemporaryTorchWeapon(actor, weapon) {
  if (!actor?.deleteEmbeddedDocuments || !weapon?.id) return;
  try {
    await actor.deleteEmbeddedDocuments("Item", [weapon.id], { render: false });
  } catch (error) {
    console.warn(`${MODULE_ID} | Torch Attack | Could not remove temporary torch weapon`, error);
  }
}

async function rollTorchAttack(actor, item, { skipPrompt = false } = {}) {
  if (!item?.system?.equipped || item?.system?.stashed) {
    ui.notifications?.warn("MK-Shadowdark | Equip the torch before attacking with it.");
    return false;
  }

  if (typeof actor?.system?.rollAttack !== "function") {
    ui.notifications?.error("MK-Shadowdark | Torch attacks are unavailable in this Shadowdark version.");
    return false;
  }

  let temporaryWeapon = null;
  try {
    temporaryWeapon = await createTemporaryTorchWeapon(actor, item);
    if (!temporaryWeapon?.uuid) {
      ui.notifications?.error("MK-Shadowdark | Could not prepare the temporary torch weapon.");
      return false;
    }

    return await actor.system.rollAttack(temporaryWeapon.uuid, {
      skipPrompt,
      attack: {
        handedness: "1h",
        type: "melee",
        range: "close"
      }
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Torch Attack | Native Shadowdark torch roll failed`, error);
    ui.notifications?.error("MK-Shadowdark | Torch attack failed.");
    return false;
  } finally {
    await deleteTemporaryTorchWeapon(actor, temporaryWeapon);
  }
}

function addTorchMeleeAttackEntry(root, actor, item) {
  if (!item.system?.equipped || item.system?.stashed || !isTorchItem(item)) return;

  const meleeLabel = game.i18n.localize("SHADOWDARK.sheet.player.melee_attacks");
  const meleeBox = Array.from(root.querySelectorAll(".tab-abilities .SD-box"))
    .find(box => box.querySelector(":scope > .header label")?.textContent?.trim() === meleeLabel);
  const content = meleeBox?.querySelector(":scope > .content");
  if (!content || content.querySelector(`[data-mk-torch-attack-id="${item.id}"]`)) return;

  const row = document.createElement("div");
  row.className = "attack item";
  row.dataset.itemId = item.id;
  row.dataset.itemUuid = item.uuid;
  row.dataset.mkTorchAttackId = item.id;

  const attack = document.createElement("a");
  attack.className = "rollable";
  attack.dataset.action = "mk-torch-attack";
  attack.dataset.itemId = item.id;
  attack.innerHTML = '<i class="fa-solid fa-dice-d20"></i>';

  const name = document.createElement("b");
  name.className = "item-name";
  name.textContent = item.name;
  attack.append(name);
  attack.append(document.createTextNode(" (d4)"));
  attack.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void rollTorchAttack(actor, item, { skipPrompt: event.shiftKey });
  });

  const subtext = document.createElement("span");
  subtext.className = "item-subtext";
  subtext.textContent = "Melee • Close";

  row.append(attack, subtext);
  content.append(row);
}

function addLightSourceEquippedToggles(app, html) {
  const root = getSheetRoot(html);
  const actor = app?.actor ?? app?.object;
  if (!root || !actor?.items) return;

  root.querySelectorAll(".item[data-item-id]").forEach(row => {
    const item = actor.items.get(row.dataset.itemId);
    if (!item?.system?.light?.isSource) return;

    const actions = row.querySelector(".actions");
    if (!actions) return;

    if (!actions.querySelector("[data-action='toggle-equipped']")) {
      const toggle = document.createElement("a");
      toggle.dataset.action = "toggle-equipped";
      toggle.dataset.itemId = item.id;
      toggle.dataset.tooltip = game.i18n.localize("SHADOWDARK.inventory.tooltip.toggle_equipped");
      toggle.innerHTML = item.system.equipped
        ? '<i class="fas fa-user-shield" style="color:var(--primary);"></i>'
        : '<i class="fas fa-user-shield"></i>';
      toggle.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        await item.update({
          "system.equipped": !item.system.equipped,
          "system.stashed": false
        });
      });

      const lightToggle = actions.querySelector("[data-action='toggle-light']");
      actions.insertBefore(toggle, lightToggle);
    }

    if (
      item.system.equipped
      && !item.system.stashed
      && isTorchItem(item)
      && !actions.querySelector("[data-action='mk-torch-attack']")
    ) {
      const attack = document.createElement("a");
      attack.className = "rollable";
      attack.dataset.action = "mk-torch-attack";
      attack.dataset.itemId = item.id;
      attack.dataset.tooltip = "Attack with torch: 1d4 damage";
      attack.innerHTML = '<i class="fa-solid fa-dice-d20"></i>';
      attack.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void rollTorchAttack(actor, item, { skipPrompt: event.shiftKey });
      });
      actions.prepend(attack);
    }

    addTorchMeleeAttackEntry(root, actor, item);
  });
}

Hooks.on("preUpdateItem", (item, change) => {
  const isBeingLit =
    change?.["system.light.active"] === true
    || change?.system?.light?.active === true;
  if (!isBeingLit || !item.system?.light?.isSource) return;

  if (change.system) {
    change.system.equipped = true;
    change.system.stashed = false;
  } else {
    change["system.equipped"] = true;
    change["system.stashed"] = false;
  }
});

Hooks.on("renderPlayerSheetSD", addLightSourceEquippedToggles);

export {
  addLightSourceEquippedToggles,
  createTemporaryTorchWeapon,
  isTorchItem,
  rollTorchAttack
};
