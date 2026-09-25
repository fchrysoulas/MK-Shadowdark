import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  linkedNpcTraitStatus,
  NPC_ABILITY_KEYS,
  NPC_ABILITY_LABELS,
  npcAbilityModifier,
  rollNpcProfileFromSource,
} from "./npc-source-tables.js";
import {
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
} from "./npc-name-compositions.js";
import { pinDocument } from "./pinned-documents.js";

const DEFAULT_NPC_NAME = "New NPC";
const NPC_PROFILE_NAME = "NPC Profile";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function dialogRoot(html) {
  if (html?.form?.querySelector) return html.form;
  if (html?.querySelector) return html;
  if (html?.[0]?.querySelector) return html[0];
  return null;
}

function dialogName(html) {
  const root = dialogRoot(html);
  const direct = root?.querySelector?.('[name="name"]')?.value;
  if (direct !== undefined) return String(direct ?? "").trim();
  return String(html?.find?.('[name="name"]')?.val?.() ?? "").trim();
}

function configuredDocumentClass(baseClass) {
  return baseClass?.implementation ?? baseClass ?? null;
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

const NPC_PROFILE_FIELDS = Object.freeze([
  ["Name", "name"],
  ["Identifier", "identifier"],
  ["Features", "features"],
  ["Ancestry", "ancestry"],
  ["Alignment", "alignment"],
  ["Age", "age"],
  ["Wealth", "wealth"],
  ["Occupation", "occupation"],
]);

function npcProfileFields(profile) {
  return NPC_PROFILE_FIELDS.map(([label, key]) => ({
    label,
    value: Array.isArray(profile?.[key])
      ? profile[key].join("; ")
      : String(profile?.[key] ?? ""),
  }));
}

function numericValue(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function npcAbilityFields(profile) {
  return NPC_ABILITY_KEYS.map(key => {
    const ability = profile?.abilities?.[key] ?? {};
    const score = numericValue(ability.score ?? ability.value);
    const roll = numericValue(ability.roll ?? profile?.rolls?.abilities?.[key] ?? score);
    const modifierValue = numericValue(
      ability.modifier
      ?? ability.mod
      ?? profile?.rolls?.abilityModifiers?.[key],
    );
    const modifier = modifierValue ?? npcAbilityModifier(score);
    if (score === null && roll === null && modifier === null) return null;
    return {
      key,
      label: ability.label ?? NPC_ABILITY_LABELS[key],
      formula: ability.formula ?? "3d6",
      roll,
      score,
      modifier,
    };
  }).filter(Boolean);
}

function formatModifier(value) {
  const number = numericValue(value);
  if (number === null) return "";
  return number > 0 ? `+${number}` : String(number);
}

function npcProfileDescription(profile) {
  const sections = [
    `<h2>${escapeHtml(NPC_PROFILE_NAME)}</h2>`,
    ...npcProfileFields(profile).map(({ label, value }) => (
      `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
    )),
  ];
  const abilities = npcAbilityFields(profile);
  if (abilities.length) {
    sections.push(
      "<h2>Ability Scores</h2>",
      ...abilities.map(ability => (
        `<p><strong>${escapeHtml(ability.label)} (${escapeHtml(ability.key.toUpperCase())}):</strong> ${escapeHtml(ability.score ?? "")} `
        + `(${escapeHtml(formatModifier(ability.modifier))})</p>`
      )),
    );
  }
  return sections.join("\n");
}

function buildNpcActorData(name = DEFAULT_NPC_NAME, profile = null) {
  const data = {
    name: String(name ?? "").trim() || DEFAULT_NPC_NAME,
    type: "NPC",
  };
  if (profile) {
    const system = { notes: npcProfileDescription(profile) };
    const abilities = Object.fromEntries(
      npcAbilityFields(profile)
        .map(ability => {
          const values = {};
          if (ability.modifier !== null) values.mod = ability.modifier;
          return [ability.key, values];
        })
        .filter(([, values]) => Object.keys(values).length > 0),
    );
    if (Object.keys(abilities).length) system.abilities = abilities;
    data.system = system;
  }
  return data;
}

function npcGeneratorDialogContent(profile) {
  return `
    <div class="mk-gm-create-document-form mk-gm-npc-generator-form">
      <div class="form-group">
        <label>NPC Name</label>
        <input type="text" name="name" value="${escapeHtml(profile.name)}" required autofocus autocomplete="off">
      </div>
      <dl class="mk-gm-data-list">
        ${npcProfileFields(profile).map(({ label, value }) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n        ")}
      </dl>
      ${npcAbilityFields(profile).length ? `
      <h3>Ability Scores</h3>
      <dl class="mk-gm-data-list mk-gm-npc-ability-list">
        ${npcAbilityFields(profile).map(ability => `<div><dt>${escapeHtml(ability.key.toUpperCase())}</dt><dd>${escapeHtml(ability.score ?? "")} (${escapeHtml(formatModifier(ability.modifier))})</dd></div>`).join("\n        ")}
      </dl>` : ""}
    </div>
  `;
}

async function promptForGeneratedNpc({
  rollProfile = rollNpcProfileFromSource,
  sourceStatus = null,
  tables = globalThis.game?.tables,
  nameComposition = null,
  traitTables = null,
} = {}) {
  let profile = await rollProfile({ status: sourceStatus, tables, nameComposition, traitTables });
  if (!profile) return { mode: "missing-linked-tables" };

  while (true) {
    const choice = await waitForGmDialog({
      title: "Create Shadowdark NPC",
      content: npcGeneratorDialogContent(profile),
      buttons: [
        {
          action: "create",
          icon: '<i class="fas fa-user-plus"></i>',
          label: "Create",
          default: true,
          callback: (_event, button) => ({ action: "create", name: dialogName(button.form) }),
        },
        {
          action: "reroll",
          icon: '<i class="fas fa-dice-d20"></i>',
          label: "Roll Again",
          callback: () => ({ action: "reroll" }),
        },
        {
          action: "cancel",
          icon: '<i class="fas fa-xmark"></i>',
          label: "Cancel",
          callback: () => ({ action: "cancel" }),
        },
      ],
      close: () => ({ action: "cancel" }),
    });

    if (!choice || choice.action === "cancel") return null;
    if (choice.action === "reroll") {
      profile = await rollProfile({
        status: sourceStatus,
        tables: globalThis.game?.tables ?? tables,
        nameComposition,
        traitTables,
      });
      if (!profile) return { mode: "missing-linked-tables" };
      continue;
    }
    const name = String(choice.name ?? "").trim();
    if (!name) {
      globalThis.ui?.notifications?.warn?.("NPC Name is required.");
      continue;
    }
    return {
      mode: "generated",
      profile,
      name,
    };
  }
}

async function createNpcActor({ name, profile = null } = {}) {
  const ActorClass = configuredDocumentClass(globalThis.Actor);
  if (!ActorClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Actor creation is unavailable.");
    return null;
  }

  const actor = await ActorClass.create(buildNpcActorData(name, profile));
  await pinDocument(actor);
  actor?.sheet?.render?.(true);
  return actor ?? null;
}

async function createSourceDrivenNpc({
  tables = globalThis.game?.tables,
  scene = currentScene(),
  nameComposition = null,
  promptGenerated = promptForGeneratedNpc,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can create NPCs.");
    return null;
  }

  const traitTables = getSceneNpcTraitTables(scene);
  const resolvedTables = globalThis.game?.tables ?? tables;
  const status = linkedNpcTraitStatus(resolvedTables, { traitTables });

  const composition = nameComposition ?? getSceneNpcNameComposition(scene);

  const generated = await promptGenerated({
    sourceStatus: status,
    tables: resolvedTables,
    nameComposition: composition,
    traitTables,
  });
  if (!generated || generated.mode !== "generated") return null;
  return createNpcActor({ name: generated.name, profile: generated.profile });
}

export {
  DEFAULT_NPC_NAME,
  NPC_PROFILE_NAME,
  currentScene,
  escapeHtml,
  configuredDocumentClass,
  npcProfileFields,
  npcAbilityFields,
  formatModifier,
  npcProfileDescription,
  buildNpcActorData,
  npcGeneratorDialogContent,
  promptForGeneratedNpc,
  createNpcActor,
  createSourceDrivenNpc,
};
