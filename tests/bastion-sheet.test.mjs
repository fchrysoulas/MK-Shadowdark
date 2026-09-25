import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASTION_ACTOR_TYPE,
  BASTION_DEFENSE_KINDS,
  BASTION_TYPES,
  BASTION_UPGRADES,
  BASTION_VAULT_CAPACITY,
} from "../scripts/bastion-sheet/constants.js";
import { buildVaultData, getVaultItemSlots } from "../scripts/bastion-sheet/vault.js";
import { getVaultTransferData, isVaultTransferData } from "../scripts/libs/bastion-vault-transfer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Bastion reference data matches the supplied rules", () => {
  assert.equal(BASTION_ACTOR_TYPE, "mk-shadowdark.bastion");
  assert.deepEqual(BASTION_DEFENSE_KINDS, {
    siegeWeapons: "siegeWeapons",
    warbands: "warbands",
  });
  assert.deepEqual(BASTION_TYPES.map(type => type.name), ["House", "Outpost", "Keep", "Castle"]);
  assert.deepEqual(BASTION_TYPES.map(type => type.upgrades), [3, 5, 10, 20]);
  assert.equal(BASTION_TYPES[3].hp, 300);
  assert.equal(BASTION_UPGRADES.length, 20);
  assert.equal(BASTION_UPGRADES[0].name, "Aviary");
  assert.equal(BASTION_UPGRADES[0].icon, "fas fa-dove");
  assert.match(BASTION_UPGRADES.find(upgrade => upgrade.name === "Barracks").description, /5 warbands/);
  assert.equal(BASTION_UPGRADES.at(-1).name, "Wizard Tower");
  assert.equal(BASTION_UPGRADES.find(upgrade => upgrade.name === "Vault").cost, "200 gp");
  assert.equal(BASTION_VAULT_CAPACITY, 100);
});

test("Vault data tracks item cards and gear-slot capacity", () => {
  const sword = {
    id: "sword",
    uuid: "Actor.bastion.Item.sword",
    name: "Longsword",
    type: "Weapon",
    img: "sword.png",
    system: {
      quantity: 11,
      slots: {
        slots_used: 1,
        per_slot: 10,
      },
    },
  };
  const potion = {
    id: "potion",
    name: "Potion",
    type: "basic",
    system: {},
  };

  assert.equal(getVaultItemSlots(sword), 2);
  assert.equal(getVaultItemSlots(potion), 1);

  const vault = buildVaultData([sword, potion]);
  assert.equal(vault.used, 3);
  assert.equal(vault.capacity, 100);
  assert.equal(vault.remaining, 97);
  assert.deepEqual(vault.items.map(item => item.name), ["Longsword", "Potion"]);
});

test("Vault transfer payloads identify the Bastion item source", () => {
  const data = {
    "mk-shadowdark": {
      vaultTransfer: {
        sourceActorUuid: "Actor.bastion",
        sourceItemUuid: "Actor.bastion.Item.sword",
        sourceItemId: "sword",
      },
    },
  };

  assert.equal(isVaultTransferData(data), true);
  assert.deepEqual(getVaultTransferData(data), data["mk-shadowdark"].vaultTransfer);
  assert.equal(isVaultTransferData({ type: "Item", uuid: "Item.world" }), false);
});

test("Bastion actors have a dedicated type, sheet, and upgrade controls", () => {
  const manifest = source("module.json");
  const template = source("templates/bastion-sheet.hbs");
  const sheet = source("scripts/bastion-sheet/sheet.js");
  const bastionRuntime = source("scripts/bastion-sheet/bastion-sheet.js");
  const dashboard = source("scripts/character-dashboard/character-dashboard.js");
  const dataModel = source("scripts/bastion-sheet/data-model.js");
  const registration = source("scripts/bastion-sheet/registration.js");
  const css = source("styles/bastion-sheet.css");

  assert.match(manifest, /"documentTypes"[\s\S]*?"Actor"[\s\S]*?"bastion"/);
  assert.match(manifest, /"styles\/bastion-sheet\.css"/);
  assert.match(template, /class="mk-bastion-sheet/);
  assert.match(template, /name="system\.location"/);
  assert.match(template, /data-action="change-bastion-type"/);
  assert.match(template, /data-action="toggle-bastion-upgrade"/);
  assert.match(template, /class="mk-bastion-upgrade-grid"/);
  assert.match(template, /class="\{\{icon\}\}"/);
  assert.match(template, /\{\{#if installed\}\}is-installed\{\{\/if\}\}/);
  assert.doesNotMatch(template, /\{\{else\}\}Install\{\{\/if\}\}/);
  assert.match(template, /data-tab="vault"/);
  assert.match(template, /mk\.bastion\.hasVault/);
  assert.match(template, /data-vault-dropzone="true"/);
  assert.match(template, /class="mk-bastion-vault-item"/);
  assert.match(template, /data-action="open-vault-item"/);
  assert.doesNotMatch(template, /data-action="remove-vault-item"/);
  assert.match(template, /data-vault-trash-dropzone="true"/);
  assert.match(template, /class="mk-bastion-vault-trash"/);
  assert.match(template, /data-vault-fixed="gold"/);
  assert.match(template, /draggable="false"/);
  assert.match(template, /name="system\.coins\.gp"/);
  assert.match(template, /data-tab="defenses"/);
  assert.match(template, /data-defense-dropzone="true"/);
  assert.match(template, /data-defense-kind="siegeWeapons"/);
  assert.match(template, /data-defense-kind="warbands"/);
  assert.match(template, /data-action="open-defense-actor"/);
  assert.match(template, /mk-bastion-defense-actor-hp/);
  assert.match(template, /mk-bastion-defense-hp-track/);
  assert.match(template, /class="mk-bastion-defense-quantity"/);
  assert.doesNotMatch(template, /data-defense-kind="warbands"[^>]*data-defense-field="notes"/);
  assert.doesNotMatch(template, /data-action="add-defense"/);
  assert.match(template, /class="mk-bastion-type-field"/);
  assert.match(sheet, /location:\s*String\(this\.actor\.system\?\.location/);
  assert.match(sheet, /type:\s*BASTION_ACTOR_TYPE/);
  assert.match(sheet, /flags\.\$\{MODULE_ID\}\.bastion\.upgrades/);
  assert.match(sheet, /flags\.\$\{MODULE_ID\}\.bastion\.defenses\.\$\{kind\}/);
  assert.match(sheet, /dragDrop:\s*\[/);
  assert.match(sheet, /droppedActor\.type/);
  assert.match(sheet, /actorUuid,\n\s*name:\s*droppedActor\.name/);
  assert.match(sheet, /system\?\.attributes\?\.hp\?\.value/);
  assert.match(sheet, /hpPercent/);
  assert.match(sheet, /createEmbeddedDocuments\("Item"/);
  assert.match(sheet, /deleteEmbeddedDocuments\("Item"/);
  assert.match(sheet, /_onVaultTrashDrop/);
  assert.match(sheet, /getVaultTransferData/);
  assert.match(sheet, /_resolveDroppedItem/);
  assert.match(sheet, /getVaultItemSlots/);
  assert.match(sheet, /system\.coins\.gp/);
  assert.match(sheet, /update-vault-gold/);
  assert.match(sheet, /dataTransfer\.setData\("application\/json"/);
  assert.match(sheet, /vaultTransfer/);
  assert.match(sheet, /effectAllowed = "move"/);
  assert.match(bastionRuntime, /dropActorSheetData/);
  assert.match(dashboard, /transferVaultItemToActor/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.mk-bastion-defense-card\.is-drag-over/);
  assert.match(css, /\.mk-bastion-defense-hp-fill/);
  assert.match(css, /\.mk-bastion-defense-quantity/);
  assert.match(css, /\.mk-bastion-upgrade-box/);
  assert.match(css, /\.mk-bastion-upgrade-icon/);
  assert.match(css, /\.mk-bastion-upgrade-toggle\.is-installed/);
  assert.match(css, /\.mk-bastion-upgrade-toggle\s*\{[\s\S]*?align-self:\s*flex-end/);
  assert.match(css, /\.mk-bastion-upgrade-toggle\s*\{[\s\S]*?border-radius:\s*50%/);
  assert.match(css, /\.mk-bastion-nav\.has-vault/);
  assert.match(css, /\.mk-bastion-vault-empty/);
  assert.match(css, /\.mk-bastion-vault-grid/);
  assert.match(css, /\.mk-bastion-vault-grid\.is-drag-over/);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fill/);
  assert.match(css, /\.mk-bastion-vault-gold/);
  assert.match(css, /\.mk-bastion-vault-footer/);
  assert.match(css, /\.mk-bastion-vault-trash\.is-drag-over/);
  assert.match(dataModel, /coins:\s*new fields\.SchemaField/);
  assert.match(registration, /types:\s*\[BASTION_ACTOR_TYPE\]/);
  assert.match(css, /\.mk-bastion-sheet-window/);
  assert.match(css, /color-scheme:\s*dark/);
  assert.match(css, /\.mk-bastion-type-select\s*\{[\s\S]*?width:\s*100%[\s\S]*?text-align:\s*left/);
  assert.match(css, /\.mk-bastion-type-select option,\n\.mk-bastion-type-select optgroup/);
});
