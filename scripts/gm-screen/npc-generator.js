import { waitForGmDialog } from "../libs/dialog-v2.js";
import {
  CORE_BOOK_TITLE,
  npcSourceStatus,
  rollNpcProfileFromSource,
} from "./npc-source-tables.js";

const MODULE_ID = "mk-shadowdark";
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

const NPC_PROFILE_FIELDS = Object.freeze([
  ["Ancestry", "ancestry"],
  ["Alignment", "alignment"],
  ["Age", "age"],
  ["Wealth", "wealth"],
  ["Appearance", "appearance"],
  ["Does", "does"],
  ["Secret", "secret"],
  ["Occupation", "occupation"],
  ["Name", "name"],
]);

function npcProfileFields(profile) {
  return NPC_PROFILE_FIELDS.map(([label, key]) => ({
    label,
    value: String(profile?.[key] ?? ""),
  }));
}

function npcProfileDescription(profile) {
  return [
    `<h2>${escapeHtml(NPC_PROFILE_NAME)}</h2>`,
    ...npcProfileFields(profile).map(({ label, value }) => (
      `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
    )),
  ].join("\n");
}

function buildNpcActorData(name = DEFAULT_NPC_NAME, profile = null) {
  const data = {
    name: String(name ?? "").trim() || DEFAULT_NPC_NAME,
    type: "NPC",
  };
  if (profile) data.system = { notes: npcProfileDescription(profile) };
  return data;
}

function npcGeneratorDialogContent(profile) {
  return `
    <div class="mk-gm-create-document-form mk-gm-npc-generator-form">
      <div class="form-group">
        <label>NPC Name</label>
        <input type="text" name="name" value="${escapeHtml(profile.name)}" autofocus autocomplete="off">
      </div>
      <dl class="mk-gm-data-list">
        ${npcProfileFields(profile).map(({ label, value }) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("\n        ")}
      </dl>
    </div>
  `;
}

async function promptForGeneratedNpc({
  rollProfile = rollNpcProfileFromSource,
  sourceStatus = null,
  tables = globalThis.game?.tables,
} = {}) {
  let profile = await rollProfile({ status: sourceStatus, tables });
  if (!profile) return { mode: "missing-source" };

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
      profile = await rollProfile({ status: sourceStatus, tables: globalThis.game?.tables ?? tables });
      if (!profile) return { mode: "missing-source" };
      continue;
    }
    return {
      mode: "generated",
      profile,
      name: String(choice.name ?? "").trim() || profile.name || DEFAULT_NPC_NAME,
    };
  }
}

function missingNpcSourceDialogContent(status) {
  const missing = status?.missing ?? [];
  return `
    <div class="mk-gm-create-document-form">
      <p>The imported <strong>${escapeHtml(CORE_BOOK_TITLE)}</strong> NPC RollTables are required for generated NPCs.</p>
      ${missing.length ? `<p>Missing: ${missing.map(escapeHtml).join(", ")}.</p>` : ""}
      <p class="hint">Import or update your owned Core v4.9 Markdown transcription, or create a blank NPC.</p>
    </div>
  `;
}

async function promptForMissingNpcSource(status) {
  return waitForGmDialog({
    title: "NPC Source Tables Required",
    content: missingNpcSourceDialogContent(status),
    buttons: [
      {
        action: "import",
        icon: '<i class="fas fa-file-import"></i>',
        label: "Import / Update Source Tables",
        default: true,
        callback: () => "import",
      },
      {
        action: "blank",
        icon: '<i class="fas fa-user-plus"></i>',
        label: "Create Blank NPC",
        callback: () => "blank",
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => "cancel",
      },
    ],
    close: () => "cancel",
  });
}

async function promptForBlankNpcName() {
  const result = await waitForGmDialog({
    title: "Create Blank NPC",
    content: `<div class="mk-gm-create-document-form"><div class="form-group"><label>NPC Name</label><input type="text" name="name" value="${DEFAULT_NPC_NAME}" autofocus autocomplete="off"></div></div>`,
    buttons: [
      {
        action: "create",
        icon: '<i class="fas fa-user-plus"></i>',
        label: "Create",
        default: true,
        callback: (_event, button) => dialogName(button.form),
      },
      {
        action: "cancel",
        icon: '<i class="fas fa-xmark"></i>',
        label: "Cancel",
        callback: () => null,
      },
    ],
    close: () => null,
  });
  if (result === null || result === undefined) return null;
  return String(result).trim() || DEFAULT_NPC_NAME;
}

async function openSourceTableImporter() {
  const api = globalThis.game?.modules?.get?.(MODULE_ID)?.api?.sourceTables;
  if (typeof api?.openImporter !== "function") {
    globalThis.ui?.notifications?.warn?.("Source Table Importer is unavailable.");
    return null;
  }
  return api.openImporter();
}

async function createNpcActor({ name, profile = null } = {}) {
  const ActorClass = configuredDocumentClass(globalThis.Actor);
  if (!ActorClass?.create) {
    globalThis.ui?.notifications?.error?.("Foundry Actor creation is unavailable.");
    return null;
  }

  const actor = await ActorClass.create(buildNpcActorData(name, profile));
  actor?.sheet?.render?.(true);
  return actor ?? null;
}

async function createSourceDrivenNpc({
  tables = globalThis.game?.tables,
  promptMissingSource = promptForMissingNpcSource,
  importSources = openSourceTableImporter,
  promptGenerated = promptForGeneratedNpc,
  promptBlank = promptForBlankNpcName,
} = {}) {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can create NPCs.");
    return null;
  }

  let status = npcSourceStatus(tables);
  if (!status.available) {
    const missingChoice = await promptMissingSource(status);
    if (!missingChoice || missingChoice === "cancel") return null;
    if (missingChoice === "blank") {
      const name = await promptBlank();
      return name ? createNpcActor({ name }) : null;
    }
    await importSources();
    status = npcSourceStatus(globalThis.game?.tables ?? tables);
    if (!status.available) {
      globalThis.ui?.notifications?.warn?.("Required Core NPC RollTables are still unavailable after import.");
      return null;
    }
  }

  const generated = await promptGenerated({ sourceStatus: status, tables: globalThis.game?.tables ?? tables });
  if (!generated || generated.mode !== "generated") return null;
  return createNpcActor({ name: generated.name, profile: generated.profile });
}

export {
  MODULE_ID,
  DEFAULT_NPC_NAME,
  NPC_PROFILE_NAME,
  escapeHtml,
  configuredDocumentClass,
  npcProfileFields,
  npcProfileDescription,
  buildNpcActorData,
  npcGeneratorDialogContent,
  promptForGeneratedNpc,
  missingNpcSourceDialogContent,
  promptForMissingNpcSource,
  promptForBlankNpcName,
  openSourceTableImporter,
  createNpcActor,
  createSourceDrivenNpc,
};
