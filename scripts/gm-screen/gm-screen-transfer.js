import {
  ENVIRONMENT_CHANGED_HOOK,
  getSceneEnvironmentContext,
  setSceneEnvironmentContext,
} from "../libs/environment-context.js";
import { confirmGmDialog } from "../libs/dialog-v2.js";
import { APP_ID } from "./gm-screen.js";
import {
  AUXILIARY_TABLE_FLAG,
  ENCOUNTER_ZONE_FLAG,
  GRID_COLLECTION_FLAG,
  GRID_FLAG,
  getSceneEncounterZoneAuxiliaryTables,
  getSceneEncounterZoneGrids,
  normalizeAuxiliaryTables,
  normalizeEncounterZoneGrids,
} from "./exploration-zone-grid.js";
import {
  NPC_NAME_COMPOSITION_FLAG,
  NPC_TRAIT_TABLE_FLAG,
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
  normalizeNpcNameComposition,
  normalizeNpcTraitTables,
  normalizeTableUuidList,
} from "./npc-name-compositions.js";
import {
  TAVERN_GENERATOR_TABLE_KEYS,
  TAVERN_GENERATOR_TABLE_FLAG,
  getSceneTavernGeneratorTables,
  normalizeTavernGeneratorTables,
} from "./tavern-generator-settings.js";

const MODULE_ID = "mk-shadowdark";
const TRANSFER_FORMAT = "mk-shadowdark.gm-screen";
const TRANSFER_SCHEMA = 1;

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  try {
    return [...collection];
  } catch (_error) {
    return [];
  }
}

function deepClone(value) {
  if (value === undefined || value === null) return value;
  if (globalThis.foundry?.utils?.deepClone) return globalThis.foundry.utils.deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currentScene() {
  return globalThis.canvas?.scene ?? globalThis.game?.scenes?.current ?? null;
}

function rawSceneFlag(scene, key) {
  return scene?._source?.flags?.[MODULE_ID]?.[key];
}

function getSceneFlag(scene, key, fallback = undefined) {
  if (!scene) return fallback;
  try {
    const value = scene.getFlag?.(MODULE_ID, key);
    return value === undefined ? rawSceneFlag(scene, key) ?? fallback : value;
  } catch (_error) {
    return rawSceneFlag(scene, key) ?? fallback;
  }
}

function tableUuid(value) {
  if (value && typeof value === "object") {
    return String(value.uuid ?? value.documentUuid ?? "").trim();
  }
  return String(value ?? "").trim();
}

function tableForUuid(uuid, tables = globalThis.game?.tables) {
  const requested = tableUuid(uuid);
  if (!requested) return null;
  return collectionValues(tables).find(table => String(table?.uuid ?? "") === requested) ?? null;
}

function tableReference(uuid, tables = globalThis.game?.tables) {
  const normalized = tableUuid(uuid);
  if (!normalized) return null;
  const table = tableForUuid(normalized, tables);
  return {
    uuid: normalized,
    name: String(table?.name ?? ""),
    img: String(table?.img ?? ""),
  };
}

function collectConfiguredTableUuids(configuration = {}) {
  const uuids = [];
  const seen = new Set();
  const add = value => {
    const normalized = tableUuid(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    uuids.push(normalized);
  };

  add(configuration.environmentContext?.tableUuid);

  const encounter = configuration.encounter ?? {};
  add(encounter.sourceTableUuid);
  for (const zone of encounter.zones ?? []) {
    for (const row of zone?.rows ?? []) {
      for (const cell of row?.cells ?? []) add(cell?.uuid ?? cell);
    }
  }
  for (const value of Object.values(encounter.auxiliaryTables ?? {})) {
    for (const uuid of (Array.isArray(value) ? value : [value])) add(uuid);
  }

  const compositions = configuration.compositions ?? {};
  const nameComposition = compositions.nameComposition ?? {};
  for (const key of ["prefix", "suffix", "identifier"]) add(nameComposition[key]);
  for (const uuid of normalizeTableUuidList(nameComposition.syllables)) add(uuid);

  const traitTables = compositions.traitTables ?? {};
  for (const key of ["ancestry", "age", "alignment", "wealth", "occupation"]) add(traitTables[key]);
  for (const uuid of normalizeTableUuidList(traitTables.features)) add(uuid);

  const tavernTables = configuration.tavernGenerator?.tables ?? {};
  for (const key of TAVERN_GENERATOR_TABLE_KEYS) add(tavernTables[key]);

  return uuids;
}

function collectTableReferences(configuration = {}, tables = globalThis.game?.tables) {
  return collectConfiguredTableUuids(configuration)
    .map(uuid => tableReference(uuid, tables))
    .filter(Boolean);
}

function exportConfiguration(scene = currentScene(), {
  tables = globalThis.game?.tables,
} = {}) {
  const zones = getSceneEncounterZoneGrids(scene);
  const configuration = {
    environmentContext: getSceneEnvironmentContext(scene),
    encounter: {
      zones: deepClone(zones),
      auxiliaryTables: deepClone(getSceneEncounterZoneAuxiliaryTables(scene)),
      sourceTableUuid: String(getSceneFlag(scene, ENCOUNTER_ZONE_FLAG, "") ?? ""),
    },
    compositions: {
      nameComposition: deepClone(getSceneNpcNameComposition(scene)),
      traitTables: deepClone(getSceneNpcTraitTables(scene)),
    },
    tavernGenerator: {
      tables: deepClone(getSceneTavernGeneratorTables(scene)),
    },
  };

  return {
    format: TRANSFER_FORMAT,
    schema: TRANSFER_SCHEMA,
    kind: "gm-screen-configuration",
    exportedAt: new Date().toISOString(),
    sourceScene: {
      id: String(scene?.id ?? ""),
      uuid: String(scene?.uuid ?? ""),
      name: String(scene?.name ?? ""),
    },
    configuration,
    tableReferences: collectTableReferences(configuration, tables),
  };
}

function validateExport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The selected file does not contain a GM Screen configuration object.");
  }
  if (value.format !== TRANSFER_FORMAT) {
    throw new Error("The selected file is not an MK-Shadowdark GM Screen export.");
  }
  if (Number(value.schema) !== TRANSFER_SCHEMA) {
    throw new Error(`Unsupported GM Screen export schema: ${value.schema ?? "unknown"}.`);
  }
  if (!value.configuration || typeof value.configuration !== "object" || Array.isArray(value.configuration)) {
    throw new Error("The GM Screen export does not contain a configuration payload.");
  }
  return value;
}

function normalizeTransferConfiguration(rawConfiguration = {}) {
  const encounter = rawConfiguration.encounter ?? {};
  const compositions = rawConfiguration.compositions ?? {};
  const tavernGenerator = rawConfiguration.tavernGenerator ?? {};
  return {
    environmentContext: deepClone(rawConfiguration.environmentContext ?? {}),
    encounter: {
      zones: normalizeEncounterZoneGrids(encounter.zones ?? encounter.encounterZoneGrids),
      auxiliaryTables: normalizeAuxiliaryTables(encounter.auxiliaryTables),
      sourceTableUuid: tableUuid(encounter.sourceTableUuid),
    },
    compositions: {
      nameComposition: normalizeNpcNameComposition(compositions.nameComposition),
      traitTables: normalizeNpcTraitTables(compositions.traitTables),
    },
    tavernGenerator: {
      tables: normalizeTavernGeneratorTables(tavernGenerator.tables ?? tavernGenerator),
    },
  };
}

function remapTableUuid(uuid, references = [], tables = globalThis.game?.tables) {
  const normalized = tableUuid(uuid);
  if (!normalized || tableForUuid(normalized, tables)) return normalized;

  const reference = references.find(entry => tableUuid(entry?.uuid) === normalized);
  const expectedName = String(reference?.name ?? "").trim().toLowerCase();
  if (!expectedName) return normalized;

  const matches = collectionValues(tables).filter(table => (
    String(table?.name ?? "").trim().toLowerCase() === expectedName
  ));
  return matches.length === 1 ? String(matches[0]?.uuid ?? normalized) : normalized;
}

function remapTableReference(value, references, tables) {
  if (!value) return value;
  const uuid = tableUuid(value);
  const remapped = remapTableUuid(uuid, references, tables);
  const table = tableForUuid(remapped, tables);
  if (typeof value === "object") {
    return {
      ...value,
      uuid: remapped,
      name: String(table?.name ?? value.name ?? ""),
    };
  }
  return remapped;
}

function remapConfiguration(configuration, references = [], tables = globalThis.game?.tables) {
  const next = deepClone(configuration);
  next.environmentContext.tableUuid = remapTableUuid(next.environmentContext.tableUuid, references, tables);
  next.encounter.sourceTableUuid = remapTableUuid(next.encounter.sourceTableUuid, references, tables);
  next.encounter.zones = next.encounter.zones.map(zone => ({
    ...zone,
    rows: zone.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => (cell ? remapTableReference(cell, references, tables) : null)),
    })),
  }));
  next.encounter.auxiliaryTables = Object.fromEntries(
    Object.entries(next.encounter.auxiliaryTables).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map(uuid => remapTableUuid(uuid, references, tables))
        : remapTableUuid(value, references, tables),
    ]),
  );

  const nameComposition = next.compositions.nameComposition;
  for (const key of ["prefix", "suffix", "identifier"]) {
    nameComposition[key] = remapTableUuid(nameComposition[key], references, tables);
  }
  nameComposition.syllables = nameComposition.syllables
    .map(uuid => remapTableUuid(uuid, references, tables));

  const traitTables = next.compositions.traitTables;
  for (const key of ["ancestry", "age", "alignment", "wealth", "occupation"]) {
    traitTables[key] = remapTableUuid(traitTables[key], references, tables);
  }
  traitTables.features = traitTables.features
    .map(uuid => remapTableUuid(uuid, references, tables));

  const tavernTables = next.tavernGenerator.tables;
  for (const key of TAVERN_GENERATOR_TABLE_KEYS) {
    tavernTables[key] = remapTableUuid(tavernTables[key], references, tables);
  }
  return next;
}

function unresolvedTableReferences(configuration, references = [], tables = globalThis.game?.tables) {
  const referenceByUuid = new Map(references.map(reference => [tableUuid(reference?.uuid), reference]));
  return collectConfiguredTableUuids(configuration)
    .filter(uuid => !tableForUuid(uuid, tables))
    .map(uuid => ({
      uuid,
      name: String(referenceByUuid.get(uuid)?.name ?? ""),
    }));
}

async function importConfiguration(payload, {
  scene = currentScene(),
  user = globalThis.game?.user,
  tables = globalThis.game?.tables,
  confirm = true,
} = {}) {
  if (!scene?.setFlag) throw new Error("No active Scene is available for GM Screen import.");
  if (!user?.isGM) throw new Error("Only the GM can import GM Screen configuration.");

  const validated = validateExport(payload);
  const references = Array.isArray(validated.tableReferences) ? validated.tableReferences : [];
  const configuration = remapConfiguration(
    normalizeTransferConfiguration(validated.configuration),
    references,
    tables,
  );
  const missingTableReferences = unresolvedTableReferences(configuration, references, tables);

  if (confirm) {
    const sourceName = String(validated.sourceScene?.name ?? "the exported Scene").trim() || "the exported Scene";
    const missingText = missingTableReferences.length
      ? `<p><strong>${missingTableReferences.length}</strong> RollTable reference${missingTableReferences.length === 1 ? "" : "s"} could not be resolved and will remain unavailable.</p>`
      : "";
    const accepted = await confirmGmDialog({
      title: "Import GM Screen Configuration",
      content: `<p>Replace the current Scene's GM Screen configuration with the export from <strong>${escapeHtml(sourceName)}</strong>?</p>${missingText}`,
      yes: { label: "Import" },
      no: { label: "Cancel", default: true },
    });
    if (!accepted) return null;
  }

  await setSceneEnvironmentContext(configuration.environmentContext, scene, { user });
  await scene.setFlag(MODULE_ID, GRID_COLLECTION_FLAG, configuration.encounter.zones);
  await scene.setFlag(MODULE_ID, GRID_FLAG, configuration.encounter.zones[0]);
  await scene.setFlag(MODULE_ID, AUXILIARY_TABLE_FLAG, configuration.encounter.auxiliaryTables);
  await scene.setFlag(MODULE_ID, ENCOUNTER_ZONE_FLAG, configuration.encounter.sourceTableUuid);
  await scene.setFlag(MODULE_ID, NPC_NAME_COMPOSITION_FLAG, configuration.compositions.nameComposition);
  await scene.setFlag(MODULE_ID, NPC_TRAIT_TABLE_FLAG, configuration.compositions.traitTables);
  await scene.setFlag(MODULE_ID, TAVERN_GENERATOR_TABLE_FLAG, configuration.tavernGenerator.tables);
  globalThis.Hooks?.callAll?.(ENVIRONMENT_CHANGED_HOOK, scene, configuration.environmentContext);

  return {
    configuration,
    missingTableReferences,
    sourceScene: validated.sourceScene ?? null,
  };
}

function safeFilename(value) {
  const base = String(value ?? "gm-screen")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `mk-shadowdark-gm-screen-${base || "export"}.json`;
}

function downloadExport(payload, {
  saveDataToFile = globalThis.foundry?.utils?.saveDataToFile ?? globalThis.saveDataToFile,
  sceneName = payload?.sourceScene?.name,
} = {}) {
  if (typeof saveDataToFile !== "function") {
    throw new Error("Foundry's native file-save API is unavailable.");
  }

  saveDataToFile(
    JSON.stringify(payload, null, 2),
    "application/json",
    safeFilename(sceneName),
  );
  return payload;
}

async function readImportFile(file) {
  if (!file) throw new Error("No GM Screen export file was selected.");
  const text = typeof file.text === "function"
    ? await file.text()
    : await new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read the selected file."));
      reader.readAsText(file);
    });
  try {
    return JSON.parse(String(text ?? ""));
  } catch (_error) {
    throw new Error("The selected file is not valid JSON.");
  }
}

function createTransferButton({ action, title, icon, label }) {
  const button = globalThis.document?.createElement?.("button");
  if (!button) return null;
  button.type = "button";
  button.dataset.mkGmScreenTransfer = action;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.innerHTML = `<i class="fas ${icon}" aria-hidden="true"></i> ${label}`;
  return button;
}

async function handleImportFile(application, file) {
  const payload = await readImportFile(file);
  const result = await importConfiguration(payload);
  if (!result) return null;
  await application?.render?.({ force: true });
  if (result.missingTableReferences.length) {
    globalThis.ui?.notifications?.warn?.(`GM Screen imported with ${result.missingTableReferences.length} unavailable RollTable reference${result.missingTableReferences.length === 1 ? "" : "s"}.`);
  } else {
    globalThis.ui?.notifications?.info?.("GM Screen configuration imported.");
  }
  return result;
}

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
    )
  );
}

function bindTransferControls(application, root) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const actions = root?.querySelector?.(".mk-gm-header-actions");
  if (!actions || actions.querySelector?.("[data-mk-gm-screen-transfer]")) return false;

  const exportButton = createTransferButton({
    action: "export",
    title: "Export GM Screen configuration",
    icon: "fa-file-export",
    label: "Export",
  });
  const importButton = createTransferButton({
    action: "import",
    title: "Import GM Screen configuration",
    icon: "fa-file-import",
    label: "Import",
  });
  const fileInput = globalThis.document?.createElement?.("input");
  if (!exportButton || !importButton || !fileInput) return false;

  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.hidden = true;
  fileInput.setAttribute("aria-hidden", "true");
  fileInput.tabIndex = -1;

  exportButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    try {
      downloadExport(exportConfiguration(), { sceneName: currentScene()?.name });
      globalThis.ui?.notifications?.info?.("GM Screen configuration exported.");
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Transfer | Export failed", error);
      globalThis.ui?.notifications?.error?.(`GM Screen export failed: ${error.message}`);
    }
  });

  importButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener("change", async event => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    importButton.disabled = true;
    try {
      await handleImportFile(application, file);
    } catch (error) {
      console.error("mk-shadowdark | GM Screen Transfer | Import failed", error);
      globalThis.ui?.notifications?.error?.(`GM Screen import failed: ${error.message}`);
    } finally {
      importButton.disabled = false;
    }
  });

  actions.append(exportButton, importButton, fileInput);
  return true;
}

function exposeGmScreenTransferApi() {
  const module = globalThis.game?.modules?.get?.(MODULE_ID);
  if (!module) return null;
  module.api ??= {};
  module.api.gmScreen ??= {};
  module.api.gmScreen.exportConfiguration = exportConfiguration;
  module.api.gmScreen.importConfiguration = importConfiguration;
  module.api.gmScreen.downloadExport = downloadExport;
  return module.api.gmScreen;
}

function registerGmScreenTransfer() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    bindTransferControls(application, element);
  });
  globalThis.Hooks?.once?.("ready", exposeGmScreenTransferApi);
}

registerGmScreenTransfer();

export {
  MODULE_ID,
  TRANSFER_FORMAT,
  TRANSFER_SCHEMA,
  collectionValues,
  deepClone,
  tableUuid,
  collectConfiguredTableUuids,
  collectTableReferences,
  exportConfiguration,
  validateExport,
  normalizeTransferConfiguration,
  remapTableUuid,
  remapConfiguration,
  unresolvedTableReferences,
  importConfiguration,
  safeFilename,
  downloadExport,
  readImportFile,
  createTransferButton,
  handleImportFile,
  gmScreenApplication,
  bindTransferControls,
  exposeGmScreenTransferApi,
  registerGmScreenTransfer,
};
