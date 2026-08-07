import { registerGroupSheet } from "./group-sheet/registration.js";
import "./group-sheet/dashboard-layout.js";

export { createGroupActor, SDXGroupSheet } from "./group-sheet/sheet.js";
export { registerGroupSheet };

function getSheetRoot(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function isTorchItem(item) {
  if (!item?.system?.light?.isSource) return false;

  let configuredKeywords = "torch,torches";
  try {
    configuredKeywords = game.settings.get("mk-shadowdark", "groupSheetCampingTorchKeywords")
      || configuredKeywords;
  } catch (_error) {
    // The default keywords are sufficient if the group setting is unavailable.
  }

  const itemName = String(item.name ?? "").toLowerCase();
  return String(configuredKeywords)
    .split(",")
    .map(keyword => keyword.trim().toLowerCase())
    .filter(Boolean)
    .some(keyword => itemName.includes(keyword));
}

async function rollTorchAttack(actor, item, { skipPrompt = false } = {}) {
  if (!item?.system?.equipped) {
    ui.notifications?.warn("MK-Shadowdark | Equip the torch before attacking with it.");
    return false;
  }

  const dice = globalThis.shadowdark?.dice;
  const actorSystem = actor?.system;
  if (
    !dice?.setRollTarget ||
    !dice?.rollDialog ||
    !dice?.rollFromConfig ||
    typeof actorSystem?._calcAttackMainConfig !== "function" ||
    typeof actorSystem?._calcDamageConfig !== "function"
  ) {
    ui.notifications?.error("MK-Shadowdark | Torch attacks are unavailable in this Shadowdark version.");
    return false;
  }

  const config = {
    actorUuid: actor.uuid,
    itemUuid: item.uuid,
    type: "attack",
    heading: game.i18n.format("SHADOWDARK.dialog.roll_attacking_with", { name: item.name }),
    skipPrompt,
    attack: {
      handedness: "1h",
      type: "melee",
      range: "close",
    },
  };

  dice.setRollTarget(config);
  actorSystem._calcAttackMainConfig(item, config);
  actorSystem._calcDamageConfig(item, config, "melee", "d4");
  actorSystem._calcAttackExtraConfig?.(item, config);

  if (!await dice.rollDialog(config)) return false;
  if (!await Hooks.call("SD-Player-Attack", config)) return false;
  return dice.rollFromConfig(config);
}

function addTorchMeleeAttackEntry(root, actor, item) {
  if (!item.system?.equipped || !isTorchItem(item)) return;

  const meleeLabel = game.i18n.localize("SHADOWDARK.sheet.player.melee_attacks");
  const meleeBox = Array.from(root.querySelectorAll(".tab-abilities .SD-box"))
    .find(box => box.querySelector(":scope > .header label")?.textContent?.trim() === meleeLabel);
  const content = meleeBox?.querySelector(":scope > .content");
  if (!content || content.querySelector(`[data-mk-torch-attack-id="${item.id}"]`)) return;

  const preview = {
    attack: {
      handedness: "1h",
      type: "melee",
      range: "close",
    },
  };
  try {
    actor.system?._calcAttackMainConfig?.(item, preview);
    actor.system?._calcDamageConfig?.(item, preview, "melee", "d4");
  } catch (_error) {
    // Fall back to the base torch attack display if preview generation fails.
  }

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
  attack.append(document.createTextNode(
    `${preview.mainRoll?.bonus ?? ""} (${preview.damageRoll?.formula ?? "d4"})`,
  ));
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
          "system.stashed": false,
        });
      });

      const lightToggle = actions.querySelector("[data-action='toggle-light']");
      actions.insertBefore(toggle, lightToggle);
    }

    if (
      item.system.equipped &&
      isTorchItem(item) &&
      !actions.querySelector("[data-action='mk-torch-attack']")
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

// The Shadowdark system only toggles a light source's active state.  Keep an
// active light source with the rest of a character's equipped gear as well.
Hooks.on("preUpdateItem", (item, change) => {
  const isBeingLit =
    change?.["system.light.active"] === true ||
    change?.system?.light?.active === true;
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
Hooks.once("init", registerGroupSheet);
