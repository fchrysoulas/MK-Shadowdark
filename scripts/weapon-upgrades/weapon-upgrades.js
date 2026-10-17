const MODULE_ID = "mk-shadowdark";
const EFFECT_FLAG = "downtimeWeaponUpgrades";
const UPGRADE_KEYS = Object.freeze({
  attackBonus: "system.roll.attack.bonus.this",
  damageBonus: "system.roll.attack.damage.this",
  damageDieSteps: "system.roll.attack.upgrade-damage-die.this"
});
const pendingUpdates = new WeakMap();

function localize(key) {
  const fullKey = `MK_SHADOWDARK.weaponUpgrades.${key}`;
  return globalThis.game?.i18n?.localize?.(fullKey) ?? fullKey;
}

function getUpgradeEffects(item) {
  return Array.from(item?.effects ?? []).filter(effect => (
    effect.getFlag?.(MODULE_ID, EFFECT_FLAG) === true
    || effect.flags?.[MODULE_ID]?.[EFFECT_FLAG] === true
  ));
}

function getWeaponUpgrades(item) {
  const changes = getUpgradeEffects(item)[0]?.changes ?? [];
  const value = field => Number(changes.find(change => change.key === UPGRADE_KEYS[field])?.value) || 0;
  return {
    attackBonus: value("attackBonus") > 0,
    damageBonus: value("damageBonus") > 0,
    damageDieSteps: Math.max(0, Math.min(2, Math.trunc(value("damageDieSteps"))))
  };
}

function canEditWeaponUpgrades(item, editable = true) {
  return globalThis.game?.system?.id === "shadowdark" && item?.type === "Weapon"
    && globalThis.game?.user?.isGM === true && editable !== false;
}

function buildUpgradeChanges(upgrades) {
  const mode = globalThis.CONST?.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  return Object.entries(UPGRADE_KEYS).flatMap(([field, key]) => {
    const value = field === "damageDieSteps" ? upgrades[field] : Number(upgrades[field]);
    return value ? [{ key, mode, value: String(value) }] : [];
  });
}

async function setWeaponUpgrade(item, field, value, { editable = true } = {}) {
  if (!canEditWeaponUpgrades(item, editable) || !(field === "bonus" || Object.hasOwn(UPGRADE_KEYS, field))) return false;
  if (field === "bonus") {
    if (!["none", "attack", "attackAndDamage"].includes(value)) return false;
  } else if (field === "damageDieSteps") {
    value = Number(value);
    if (!Number.isInteger(value) || value < 0 || value > 2) return false;
  } else if (typeof value !== "boolean") return false;

  // Serialize edits so quick changes to separate options preserve one another.
  const update = (pendingUpdates.get(item) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!canEditWeaponUpgrades(item, editable)) return false;
    const effects = getUpgradeEffects(item);
    const upgrades = getWeaponUpgrades(item);
    if (field === "bonus") {
      upgrades.attackBonus = value !== "none";
      upgrades.damageBonus = value === "attackAndDamage";
    } else upgrades[field] = value;
    const changes = buildUpgradeChanges(upgrades);
    if (!changes.length) {
      if (!effects.length) return true;
      const deleted = await item.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
      return deleted?.length === effects.length;
    }
    if (effects.length > 1) {
      const deleted = await item.deleteEmbeddedDocuments("ActiveEffect", effects.slice(1).map(effect => effect.id));
      if (deleted?.length !== effects.length - 1) return false;
    }
    const data = {
      name: localize("title"),
      img: item.img || "icons/svg/item-bag.svg",
      origin: item.uuid,
      // Shadowdark reads transferring .this effects only for their parent weapon.
      transfer: true,
      disabled: false,
      changes,
      flags: { [MODULE_ID]: { [EFFECT_FLAG]: true } }
    };
    const saved = effects.length
      ? await item.updateEmbeddedDocuments("ActiveEffect", [{ _id: effects[0].id, ...data }])
      : await item.createEmbeddedDocuments("ActiveEffect", [data]);
    return Boolean(saved?.length);
  });
  pendingUpdates.set(item, update);
  try {
    return await update;
  } finally {
    if (pendingUpdates.get(item) === update) pendingUpdates.delete(item);
  }
}

function renderWeaponUpgrades(app, html) {
  const item = app?.item ?? app?.object;
  const root = html?.[0] ?? html;
  if (globalThis.game?.system?.id !== "shadowdark" || item?.type !== "Weapon" || !root?.querySelector) return;
  const grid = root.querySelector('.tab[data-tab="tab-details"] .grid-3-columns');
  if (!grid) return;

  let panel = grid.querySelector(".mk-weapon-upgrades");
  if (!panel) {
    const document = grid.ownerDocument;
    panel = document.createElement("section");
    panel.className = "mk-weapon-upgrades SD-box";
    const heading = document.createElement("h3");
    heading.textContent = localize("title");
    const controls = document.createElement("ul");
    controls.className = "mk-weapon-upgrade-controls";
    for (const field of ["attackBonus", "attackAndDamageBonus", "damageDieSteps"]) {
      const row = document.createElement("li");
      const label = document.createElement("label");
      const caption = document.createElement("span");
      caption.textContent = localize(field);
      const input = document.createElement(field === "damageDieSteps" ? "select" : "input");
      input.dataset.weaponUpgrade = field;
      input.setAttribute("aria-label", caption.textContent);
      if (field === "damageDieSteps") {
        for (const [steps, key] of ["none", "oneStep", "twoSteps"].entries()) {
          const option = document.createElement("option");
          option.value = String(steps);
          option.textContent = localize(key);
          input.append(option);
        }
        label.className = "mk-weapon-upgrade-die";
        label.append(caption, input);
      } else {
        input.type = "checkbox";
        label.append(input, caption);
      }
      input.addEventListener("change", async event => {
        event.stopPropagation();
        const value = field === "damageDieSteps" ? input.value
          : !input.checked ? "none" : field === "attackBonus" ? "attack" : "attackAndDamage";
        try {
          if (!await setWeaponUpgrade(item, field === "damageDieSteps" ? field : "bonus", value, { editable: app.isEditable })) {
            globalThis.ui?.notifications?.warn?.(localize("saveFailed"));
          }
        } catch (error) {
          globalThis.ui?.notifications?.error?.(localize("saveFailed"));
          console.error(`${MODULE_ID} | Weapon Upgrades | Save failed`, error);
        } finally {
          app.render?.(false);
        }
      });
      row.append(label);
      controls.append(row);
    }
    panel.append(heading, controls);
    grid.append(panel);
  }

  const upgrades = getWeaponUpgrades(item);
  for (const input of panel.querySelectorAll("[data-weapon-upgrade]")) {
    const field = input.dataset.weaponUpgrade;
    if (field === "damageDieSteps") input.value = String(upgrades[field]);
    else if (field === "attackBonus") input.checked = upgrades.attackBonus && !upgrades.damageBonus;
    else {
      input.checked = upgrades.attackBonus && upgrades.damageBonus;
      // Retain earlier damage-only rewards as a partial combined upgrade until edited.
      input.indeterminate = upgrades.damageBonus && !upgrades.attackBonus;
    }
    input.disabled = !canEditWeaponUpgrades(item, app.isEditable);
  }
}

for (const hook of [
  "renderItemSheet", "renderItemSheetSD", "renderMKDashboardItemSheet",
  "renderShadowdarkItemSheet", "renderShadowdarkItemSheetV2", "renderItemSheetShadowdark"
]) {
  globalThis.Hooks?.on?.(hook, renderWeaponUpgrades);
}

export { buildUpgradeChanges, canEditWeaponUpgrades, getWeaponUpgrades, renderWeaponUpgrades, setWeaponUpgrade };
