import {
  collectionValues,
  rollImportedSourceTable,
  tableResultText,
} from "../source-tables/source-table-service.js";
import { APP_ID, SETTINGS_APP_ID } from "./gm-screen.js";

const MODULE_ID = "mk-shadowdark";
const NPC_NAME_COMPOSITION_FLAG = "npcNameCompositionTables";
const NPC_NAME_COMPOSITION_SCHEMA = 2;
const NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE = 33;
const NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE = 33;
// Kept for legacy imports and callers that still provide the former setting.
const NPC_NAME_COMPOSITION_DEFAULT_TWO_SYLLABLE_CHANCE = 50;

const NPC_NAME_COMPOSITION_KEYS = Object.freeze([
  "prefix",
  "syllables",
  "suffix",
]);

const NPC_NAME_COMPOSITION_OPTIONAL_KEYS = Object.freeze(["identifier"]);
const NPC_NAME_COMPOSITION_DISPLAY_KEYS = Object.freeze([
  ...NPC_NAME_COMPOSITION_KEYS,
  ...NPC_NAME_COMPOSITION_OPTIONAL_KEYS,
]);

const NPC_NAME_COMPOSITION_LABELS = Object.freeze({
  prefix: "Prefix",
  syllables: "Possible Syllables",
  suffix: "Suffix",
  identifier: "NPC Identifier",
});

const NPC_NAME_COMPOSITION_DESCRIPTIONS = Object.freeze({
  prefix: "Rolls the first part of the NPC name.",
  syllables: "Rolls a possible syllable for the NPC name.",
  suffix: "Rolls the final part of the NPC name.",
  identifier: "Rolls an optional NPC identifier.",
});

const NPC_NAME_COMPOSITION_MULTI_KEYS = Object.freeze(["syllables"]);
const NPC_NAME_COMPOSITION_MULTI_COUNTS = Object.freeze({ syllables: 2 });

const NPC_TRAIT_TABLE_FLAG = "npcTraitTables";
const NPC_TRAIT_TABLE_SCHEMA = 1;
const NPC_TRAIT_TABLE_KEYS = Object.freeze([
  "ancestry",
  "age",
  "alignment",
  "wealth",
  "features",
  "occupation",
]);
const NPC_TRAIT_TABLE_LABELS = Object.freeze({
  ancestry: "Ancestry",
  age: "Age",
  alignment: "Alignment",
  wealth: "Wealth",
  features: "NPC Features",
  occupation: "Occupation",
});
const NPC_TRAIT_TABLE_DESCRIPTIONS = Object.freeze({
  ancestry: "Rolls the NPC ancestry.",
  age: "Rolls the NPC age.",
  alignment: "Rolls the NPC alignment.",
  wealth: "Rolls the NPC wealth.",
  features: "Rolls an NPC feature.",
  occupation: "Rolls the NPC occupation.",
});
const NPC_TRAIT_TABLE_MULTI_KEYS = Object.freeze(["features"]);
const NPC_TRAIT_TABLE_MULTI_COUNTS = Object.freeze({ features: 3 });

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

function normalizeTableUuid(value) {
  if (value && typeof value === "object") {
    return String(value.uuid ?? value.documentUuid ?? "").trim();
  }
  return String(value ?? "").trim();
}

function normalizeTableUuidList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map(normalizeTableUuid).filter(Boolean);
}

function normalizeChance(value, fallback = NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeSyllableChances(secondSyllableChance, thirdSyllableChance) {
  const second = normalizeChance(
    secondSyllableChance,
    NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
  );
  const third = Math.min(
    normalizeChance(thirdSyllableChance, NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE),
    Math.max(0, 100 - second),
  );
  return {
    secondSyllableChance: second,
    thirdSyllableChance: third,
  };
}

function normalizeNpcNameComposition(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const hasLegacyChance = source.twoSyllableChance !== undefined;
  const legacyChance = hasLegacyChance
    ? normalizeChance(source.twoSyllableChance, NPC_NAME_COMPOSITION_DEFAULT_TWO_SYLLABLE_CHANCE)
    : undefined;
  const chances = normalizeSyllableChances(
    source.secondSyllableChance ?? legacyChance ?? NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
    source.thirdSyllableChance ?? (hasLegacyChance ? 0 : NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE),
  );
  return {
    schema: NPC_NAME_COMPOSITION_SCHEMA,
    prefix: normalizeTableUuid(source.prefix),
    syllables: normalizeTableUuidList(source.syllables),
    suffix: normalizeTableUuid(source.suffix),
    identifier: normalizeTableUuid(source.identifier),
    ...chances,
  };
}

function getSceneNpcNameComposition(scene = currentScene()) {
  return normalizeNpcNameComposition(getSceneFlag(scene, NPC_NAME_COMPOSITION_FLAG, null));
}

function normalizeNpcTraitTables(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: NPC_TRAIT_TABLE_SCHEMA,
    ancestry: normalizeTableUuid(source.ancestry),
    age: normalizeTableUuid(source.age),
    alignment: normalizeTableUuid(source.alignment),
    wealth: normalizeTableUuid(source.wealth),
    features: normalizeTableUuidList(source.features),
    occupation: normalizeTableUuid(source.occupation),
  };
}

function getSceneNpcTraitTables(scene = currentScene()) {
  return normalizeNpcTraitTables(getSceneFlag(scene, NPC_TRAIT_TABLE_FLAG, null));
}

function tableLabel(key) {
  return NPC_NAME_COMPOSITION_LABELS[key] ?? key;
}

function tableForUuid(uuid, tables = globalThis.game?.tables) {
  const requested = normalizeTableUuid(uuid);
  if (!requested) return null;
  return collectionValues(tables).find(table => String(table?.uuid ?? "") === requested) ?? null;
}

function npcTraitTableLabel(key) {
  return NPC_TRAIT_TABLE_LABELS[key] ?? key;
}

function npcTraitTableStatus(value, tables = globalThis.game?.tables) {
  const assignments = normalizeNpcTraitTables(value);
  const resolvedTables = {
    ancestry: tableForUuid(assignments.ancestry, tables),
    age: tableForUuid(assignments.age, tables),
    alignment: tableForUuid(assignments.alignment, tables),
    wealth: tableForUuid(assignments.wealth, tables),
    features: assignments.features.map(uuid => tableForUuid(uuid, tables)),
    occupation: tableForUuid(assignments.occupation, tables),
  };
  const missing = NPC_TRAIT_TABLE_KEYS
    .filter(key => NPC_TRAIT_TABLE_MULTI_KEYS.includes(key)
      ? !assignments[key].length
      : !assignments[key])
    .map(npcTraitTableLabel);
  const unavailable = NPC_TRAIT_TABLE_KEYS
    .filter(key => NPC_TRAIT_TABLE_MULTI_KEYS.includes(key)
      ? assignments[key].length > 0 && resolvedTables[key].some(table => !table)
      : assignments[key] && !resolvedTables[key])
    .map(npcTraitTableLabel);
  return {
    available: missing.length === 0 && unavailable.length === 0,
    assignments,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

function npcNameCompositionStatus(value, tables = globalThis.game?.tables) {
  const composition = normalizeNpcNameComposition(value);
  const resolvedTables = {
    prefix: tableForUuid(composition.prefix, tables),
    syllables: composition.syllables.map(uuid => tableForUuid(uuid, tables)),
    suffix: tableForUuid(composition.suffix, tables),
    identifier: tableForUuid(composition.identifier, tables),
  };
  const missing = NPC_NAME_COMPOSITION_KEYS
    .filter(key => (NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key) ? !composition[key].length : !composition[key]))
    .map(tableLabel);
  const unavailable = NPC_NAME_COMPOSITION_DISPLAY_KEYS
    .filter(key => NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key)
      ? composition[key].length > 0 && resolvedTables[key].some(table => !table)
      : composition[key] && !resolvedTables[key])
    .map(tableLabel);
  return {
    available: missing.length === 0 && unavailable.length === 0,
    composition,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function setSceneNpcNameCompositionTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
  index = null,
  replace = false,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!NPC_NAME_COMPOSITION_DISPLAY_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change NPC name composition tables.");
    return null;
  }

  const next = normalizeNpcNameComposition(getSceneFlag(scene, NPC_NAME_COMPOSITION_FLAG, null));
  if (NPC_NAME_COMPOSITION_MULTI_KEYS.includes(normalizedKey)) {
    const tableUuids = normalizeTableUuidList(next[normalizedKey]);
    const normalizedUuid = normalizeTableUuid(tableUuid);
    if (Number.isInteger(index) && index >= 0) {
      if (normalizedUuid && replace) {
        const targetIndex = Math.min(index, tableUuids.length);
        if (targetIndex < tableUuids.length) tableUuids[targetIndex] = normalizedUuid;
        else tableUuids.push(normalizedUuid);
      } else if (index < tableUuids.length) {
        tableUuids.splice(index, 1);
      } else if (normalizedUuid) {
        tableUuids.push(normalizedUuid);
      } else {
        tableUuids.length = 0;
      }
    } else if (normalizedUuid) {
      tableUuids.push(normalizedUuid);
    } else {
      tableUuids.length = 0;
    }
    next[normalizedKey] = tableUuids;
  } else {
    next[normalizedKey] = normalizeTableUuid(tableUuid);
  }
  await scene.setFlag(MODULE_ID, NPC_NAME_COMPOSITION_FLAG, next);
  return next;
}

async function setSceneNpcNameCompositionChances(secondSyllableChance, thirdSyllableChance, scene = currentScene(), {
  user = globalThis.game?.user,
} = {}) {
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change NPC name composition settings.");
    return null;
  }

  const next = normalizeNpcNameComposition(getSceneFlag(scene, NPC_NAME_COMPOSITION_FLAG, null));
  const chances = normalizeSyllableChances(secondSyllableChance, thirdSyllableChance);
  next.secondSyllableChance = chances.secondSyllableChance;
  next.thirdSyllableChance = chances.thirdSyllableChance;
  await scene.setFlag(MODULE_ID, NPC_NAME_COMPOSITION_FLAG, next);
  return next;
}

async function setSceneNpcNameCompositionChance(chance, scene = currentScene(), options = {}) {
  return setSceneNpcNameCompositionChances(chance, 0, scene, options);
}

async function setSceneNpcTraitTable(key, tableUuid, scene = currentScene(), {
  user = globalThis.game?.user,
  index = null,
  replace = false,
} = {}) {
  const normalizedKey = String(key ?? "").trim();
  if (!NPC_TRAIT_TABLE_KEYS.includes(normalizedKey)) return null;
  if (!scene?.setFlag) return null;
  if (!user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Only the GM can change NPC trait RollTables.");
    return null;
  }

  const next = normalizeNpcTraitTables(getSceneFlag(scene, NPC_TRAIT_TABLE_FLAG, null));
  if (NPC_TRAIT_TABLE_MULTI_KEYS.includes(normalizedKey)) {
    const tableUuids = normalizeTableUuidList(next[normalizedKey]);
    const normalizedUuid = normalizeTableUuid(tableUuid);
    if (Number.isInteger(index) && index >= 0) {
      if (normalizedUuid && replace) {
        const targetIndex = Math.min(index, tableUuids.length);
        if (targetIndex < tableUuids.length) tableUuids[targetIndex] = normalizedUuid;
        else tableUuids.push(normalizedUuid);
      } else if (index < tableUuids.length) {
        tableUuids.splice(index, 1);
      } else if (normalizedUuid) {
        tableUuids.push(normalizedUuid);
      } else {
        tableUuids.length = 0;
      }
    } else if (normalizedUuid) {
      tableUuids.push(normalizedUuid);
    } else {
      tableUuids.length = 0;
    }
    next[normalizedKey] = tableUuids;
  } else {
    next[normalizedKey] = normalizeTableUuid(tableUuid);
  }
  await scene.setFlag(MODULE_ID, NPC_TRAIT_TABLE_FLAG, next);
  return next;
}

async function resolveUuid(uuid) {
  const resolver = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (typeof resolver !== "function") return null;
  try {
    return await resolver(String(uuid ?? ""));
  } catch (_error) {
    return null;
  }
}

async function resolveRollTable(uuid, tables = globalThis.game?.tables) {
  const local = tableForUuid(uuid, tables);
  if (local) return local;
  const resolved = await resolveUuid(uuid);
  if (!resolved || (resolved.documentName && resolved.documentName !== "RollTable")) return null;
  return typeof resolved.roll === "function" || typeof resolved.draw === "function" ? resolved : null;
}

async function resolveNpcNameCompositionStatus(value, tables = globalThis.game?.tables) {
  const composition = normalizeNpcNameComposition(value);
  const resolvedTables = {
    prefix: composition.prefix ? await resolveRollTable(composition.prefix, tables) : null,
    syllables: await Promise.all(composition.syllables.map(uuid => resolveRollTable(uuid, tables))),
    suffix: composition.suffix ? await resolveRollTable(composition.suffix, tables) : null,
    identifier: composition.identifier ? await resolveRollTable(composition.identifier, tables) : null,
  };
  const missing = NPC_NAME_COMPOSITION_KEYS
    .filter(key => (NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key) ? !composition[key].length : !composition[key]))
    .map(tableLabel);
  const unavailable = NPC_NAME_COMPOSITION_DISPLAY_KEYS
    .filter(key => NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key)
      ? composition[key].length > 0 && resolvedTables[key].some(table => !table)
      : composition[key] && !resolvedTables[key])
    .map(tableLabel);
  return {
    available: missing.length === 0 && unavailable.length === 0,
    composition,
    missing,
    unavailable,
    tables: resolvedTables,
  };
}

async function resolveNpcNameCompositionEntries(scene = currentScene(), tables = globalThis.game?.tables) {
  const composition = getSceneNpcNameComposition(scene);
  return Promise.all(NPC_NAME_COMPOSITION_DISPLAY_KEYS.map(async key => {
    if (NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key)) {
      const uuids = normalizeTableUuidList(composition[key]);
      return {
        key,
        label: tableLabel(key),
        uuids,
        tables: await Promise.all(uuids.map(uuid => resolveRollTable(uuid, tables))),
      };
    }

    return {
      key,
      label: tableLabel(key),
      uuid: composition[key],
      table: composition[key] ? await resolveRollTable(composition[key], tables) : null,
    };
  }));
}

async function resolveNpcTraitTableEntries(scene = currentScene(), tables = globalThis.game?.tables) {
  const assignments = getSceneNpcTraitTables(scene);
  return Promise.all(NPC_TRAIT_TABLE_KEYS.map(async key => {
    if (NPC_TRAIT_TABLE_MULTI_KEYS.includes(key)) {
      const uuids = normalizeTableUuidList(assignments[key]);
      return {
        key,
        label: npcTraitTableLabel(key),
        uuids,
        tables: await Promise.all(uuids.map(uuid => resolveRollTable(uuid, tables))),
      };
    }

    return {
      key,
      label: npcTraitTableLabel(key),
      uuid: assignments[key],
      table: assignments[key] ? await resolveRollTable(assignments[key], tables) : null,
    };
  }));
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

function assignmentOrdinal(index) {
  return ["first", "second", "third"][index] ?? `number ${index + 1}`;
}

function renderNpcNameAssignmentRow({
  key,
  label,
  description,
  uuid = "",
  table = null,
  multiple = false,
  index = 0,
} = {}) {
  const assigned = Boolean(uuid);
  const rowLabel = multiple ? `${label} ${index + 1}` : label;
  const tableName = table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
  const slotIndex = multiple ? ` data-mk-npc-name-composition-index="${index}"` : "";
  const clearIndex = multiple ? ` data-mk-npc-name-composition-index="${index}"` : "";
  return `
    <article class="mk-gm-npc-name-composition-slot mk-gm-rolltable-assignment-row ${assigned ? "is-assigned" : "is-empty"}" data-mk-npc-name-composition-slot="${escapeHtml(key)}"${multiple ? ` data-mk-npc-name-composition-multiple${slotIndex}` : ""}>
      <span class="mk-gm-npc-name-composition-label mk-gm-rolltable-assignment-title">${escapeHtml(rowLabel)}</span>
      <span class="mk-gm-rolltable-assignment-description">${escapeHtml(description)}</span>
      <div class="mk-gm-npc-name-composition-drop mk-gm-rolltable-assignment-table" data-mk-npc-name-composition-drop>
        <i class="fas ${assigned ? "fa-table-list" : "fa-arrow-down"}" aria-hidden="true"></i>
        <strong>${escapeHtml(tableName)}</strong>
        ${assigned && !table ? `<small>${escapeHtml(uuid)}</small>` : ""}
        ${assigned ? `<button type="button" data-mk-npc-name-composition-clear${clearIndex} title="Clear ${escapeHtml(rowLabel)} RollTable" aria-label="Clear ${escapeHtml(rowLabel)} RollTable"><i class="fas fa-xmark"></i></button>` : ""}
      </div>
    </article>
  `;
}

function renderNpcTraitAssignmentRow({
  key,
  label,
  description,
  uuid = "",
  table = null,
  multiple = false,
  index = 0,
} = {}) {
  const assigned = Boolean(uuid);
  const rowLabel = multiple ? `${label} ${index + 1}` : label;
  const rowDescription = multiple
    ? `Rolls the ${assignmentOrdinal(index)} NPC feature.`
    : description;
  const tableName = table?.name ?? (assigned ? "Unavailable RollTable" : "Drop RollTable here");
  const slotIndex = multiple ? ` data-mk-npc-trait-index="${index}"` : "";
  const clearIndex = multiple ? ` data-mk-npc-trait-index="${index}"` : "";
  return `
    <article class="mk-gm-npc-trait-slot mk-gm-rolltable-assignment-row ${assigned ? "is-assigned" : "is-empty"}" data-mk-npc-trait-slot="${escapeHtml(key)}"${multiple ? ` data-mk-npc-trait-multiple${slotIndex}` : ""}>
      <span class="mk-gm-npc-trait-label mk-gm-rolltable-assignment-title">${escapeHtml(rowLabel)}</span>
      <span class="mk-gm-rolltable-assignment-description">${escapeHtml(rowDescription)}</span>
      <div class="mk-gm-npc-trait-drop mk-gm-rolltable-assignment-table" data-mk-npc-trait-drop>
        <i class="fas ${assigned ? "fa-table-list" : "fa-arrow-down"}" aria-hidden="true"></i>
        <strong>${escapeHtml(tableName)}</strong>
        ${assigned && !table ? `<small>${escapeHtml(uuid)}</small>` : ""}
        ${assigned ? `<button type="button" data-mk-npc-trait-clear${clearIndex} title="Clear ${escapeHtml(rowLabel)} RollTable" aria-label="Clear ${escapeHtml(rowLabel)} RollTable"><i class="fas fa-xmark"></i></button>` : ""}
      </div>
    </article>
  `;
}

function renderNpcNameCompositionSetup(entries = [], options = {}) {
  const legacyChance = options.twoSyllableChance;
  const chances = normalizeSyllableChances(
    options.secondSyllableChance ?? legacyChance ?? NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
    options.thirdSyllableChance ?? (legacyChance === undefined
      ? NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE
      : 0),
  );
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const rows = NPC_NAME_COMPOSITION_DISPLAY_KEYS.map(key => {
    const entry = byKey.get(key) ?? (NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key)
      ? { key, label: tableLabel(key), uuids: [], tables: [] }
      : { key, label: tableLabel(key), uuid: "", table: null });
    const multiple = NPC_NAME_COMPOSITION_MULTI_KEYS.includes(key);
    const uuids = multiple ? normalizeTableUuidList(entry.uuids ?? entry.uuid) : [entry.uuid].filter(Boolean);
    const tables = multiple
      ? (Array.isArray(entry.tables) ? entry.tables : [])
      : [entry.table];
    const count = multiple
      ? Math.max(NPC_NAME_COMPOSITION_MULTI_COUNTS[key] ?? 1, uuids.length)
      : 1;
    return Array.from({ length: count }, (_value, index) => renderNpcNameAssignmentRow({
      key,
      label: entry.label,
      description: multiple
        ? `Rolls the ${assignmentOrdinal(index)} possible syllable.`
        : NPC_NAME_COMPOSITION_DESCRIPTIONS[key] ?? "Rolls this NPC name component.",
      uuid: multiple ? (uuids[index] ?? "") : entry.uuid,
      table: multiple ? (tables[index] ?? null) : entry.table,
      multiple,
      index,
    })).join("");
  }).join("");

  return `
    <section class="mk-gm-npc-name-composition" data-mk-npc-name-composition>
      <header class="mk-gm-npc-name-composition-heading">
        <div>
          <strong>NPC Name Composition</strong>
          <span>Assign the RollTables used to build the NPC name. Possible Syllables are split into two assignments.</span>
        </div>
        <i class="fas fa-font" aria-hidden="true"></i>
      </header>
      <div class="mk-gm-npc-name-composition-flow mk-gm-rolltable-assignment-grid">
        ${rows}
      </div>
      <div class="mk-gm-npc-name-composition-chance">
        <div class="mk-gm-npc-name-composition-chance-fields">
          <div class="mk-gm-npc-name-composition-chance-field">
            <label for="mk-gm-npc-name-second-syllable-chance">Second syllable chance</label>
            <div>
              <input id="mk-gm-npc-name-second-syllable-chance" type="number" min="0" max="100" step="1" value="${chances.secondSyllableChance}" data-mk-npc-name-composition-second-syllable-chance>
              <span>%</span>
            </div>
          </div>
          <div class="mk-gm-npc-name-composition-chance-field">
            <label for="mk-gm-npc-name-third-syllable-chance">Third syllable chance</label>
            <div>
              <input id="mk-gm-npc-name-third-syllable-chance" type="number" min="0" max="100" step="1" value="${chances.thirdSyllableChance}" data-mk-npc-name-composition-third-syllable-chance>
              <span>%</span>
            </div>
          </div>
        </div>
        <small>Each chance adds one more syllable in order; the remaining percentage uses one syllable.</small>
      </div>
      <small class="mk-gm-npc-name-composition-status">Prefix + Possible Syllables + Suffix. An assigned NPC Identifier is rolled as the second name part. Assignments are stored on the active Scene.</small>
    </section>
  `;
}

function renderNpcTraitTableSetup(entries = []) {
  const byKey = new Map((entries ?? []).map(entry => [entry.key, entry]));
  const rows = NPC_TRAIT_TABLE_KEYS.map(key => {
    const entry = byKey.get(key) ?? (NPC_TRAIT_TABLE_MULTI_KEYS.includes(key)
      ? { key, label: npcTraitTableLabel(key), uuids: [], tables: [] }
      : { key, label: npcTraitTableLabel(key), uuid: "", table: null });
    const multiple = NPC_TRAIT_TABLE_MULTI_KEYS.includes(key);
    const uuids = multiple ? normalizeTableUuidList(entry.uuids ?? entry.uuid) : [entry.uuid].filter(Boolean);
    const tables = multiple
      ? (Array.isArray(entry.tables) ? entry.tables : [])
      : [entry.table];
    const count = multiple
      ? Math.max(NPC_TRAIT_TABLE_MULTI_COUNTS[key] ?? 1, uuids.length)
      : 1;
    return Array.from({ length: count }, (_value, index) => renderNpcTraitAssignmentRow({
      key,
      label: entry.label,
      description: NPC_TRAIT_TABLE_DESCRIPTIONS[key] ?? "Rolls this NPC trait.",
      uuid: multiple ? (uuids[index] ?? "") : entry.uuid,
      table: multiple ? (tables[index] ?? null) : entry.table,
      multiple,
      index,
    })).join("");
  }).join("");

  return `
    <section class="mk-gm-npc-trait-tables" data-mk-npc-trait-tables>
      <header class="mk-gm-npc-trait-heading">
        <div>
          <strong>NPC Traits</strong>
          <span>Link RollTables for the generated NPC profile. NPC Features are split into three assignments.</span>
        </div>
        <i class="fas fa-list-check" aria-hidden="true"></i>
      </header>
      <div class="mk-gm-npc-trait-grid mk-gm-rolltable-assignment-grid">
        ${rows}
      </div>
      <small class="mk-gm-npc-trait-status">Ancestry, Age, Alignment, Wealth, NPC Features, and Occupation are rolled from these linked assignments when available. Missing tables leave their profile entries blank; only the NPC name is required.</small>
    </section>
  `;
}

function dragEventData(event) {
  const TextEditorClass = globalThis.foundry?.applications?.ux?.TextEditor
    ?? globalThis.TextEditor;
  const getData = TextEditorClass?.getDragEventData
    ?? TextEditorClass?.implementation?.getDragEventData;

  if (typeof getData === "function") {
    try {
      return getData.call(TextEditorClass, event) ?? {};
    } catch (_error) {
      // Fall through to raw DataTransfer JSON.
    }
  }

  for (const mime of ["application/json", "text/plain"]) {
    const raw = event?.dataTransfer?.getData?.(mime);
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (_error) {
      // Try the next supported payload type.
    }
  }
  return {};
}

function dragDataUuid(data) {
  for (const value of [data?.uuid, data?.documentUuid, data?.data?.uuid]) {
    const uuid = normalizeTableUuid(value);
    if (uuid) return uuid;
  }
  return "";
}

function bindRollTableDropSlots(application, root, scene, {
  slotSelector,
  keyDataset,
  multipleDataset,
  dropSelector,
  clearSelector,
  clearIndexDataset,
  setTable,
  warningMessage,
  errorLabel,
} = {}) {
  root?.querySelectorAll?.(slotSelector)?.forEach(slot => {
    const key = String(slot.dataset?.[keyDataset] ?? "");
    const multiple = slot.dataset?.[multipleDataset] !== undefined;
    const rawSlotIndex = slot.dataset?.[clearIndexDataset];
    const slotIndex = multiple && rawSlotIndex !== undefined ? Number(rawSlotIndex) : null;
    const drop = slot.querySelector?.(dropSelector);
    if (!drop) return;

    drop.addEventListener("dragenter", event => {
      event.preventDefault();
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragover", event => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      slot.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", event => {
      if (event.relatedTarget && drop.contains?.(event.relatedTarget)) return;
      slot.classList.remove("is-dragover");
    });
    drop.addEventListener("drop", async event => {
      event.preventDefault();
      event.stopPropagation();
      slot.classList.remove("is-dragover");
      const uuid = dragDataUuid(dragEventData(event));
      const table = await resolveRollTable(uuid);
      if (!table) {
        globalThis.ui?.notifications?.warn?.(warningMessage);
        return;
      }

      try {
        await setTable(
          key,
          table.uuid ?? uuid,
          scene,
          multiple && Number.isInteger(slotIndex) ? { index: slotIndex, replace: true } : {},
        );
        await application?.render?.({ force: true });
      } catch (error) {
        console.error(`mk-shadowdark | ${errorLabel} | Assignment failed`, error);
        globalThis.ui?.notifications?.error?.(`${errorLabel} assignment failed: ${error.message}`);
      }
    });

    drop.querySelectorAll?.(clearSelector)?.forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        button.disabled = true;
        try {
          const index = Number(button.dataset?.[clearIndexDataset]);
          await setTable(
            key,
            "",
            scene,
            multiple && Number.isInteger(index) ? { index } : {},
          );
          await application?.render?.({ force: true });
        } catch (error) {
          console.error(`mk-shadowdark | ${errorLabel} | Clear failed`, error);
          globalThis.ui?.notifications?.error?.(`${errorLabel} clear failed: ${error.message}`);
          button.disabled = false;
        }
      });
    });
  });
}

function bindNpcNameComposition(application, root, scene) {
  bindRollTableDropSlots(application, root, scene, {
    slotSelector: "[data-mk-npc-name-composition-slot]",
    keyDataset: "mkNpcNameCompositionSlot",
    multipleDataset: "mkNpcNameCompositionMultiple",
    dropSelector: "[data-mk-npc-name-composition-drop]",
    clearSelector: "[data-mk-npc-name-composition-clear]",
    clearIndexDataset: "mkNpcNameCompositionIndex",
    setTable: setSceneNpcNameCompositionTable,
    warningMessage: "Drop a RollTable onto the name composition box.",
    errorLabel: "NPC Name Composition",
  });

  const chanceInputs = Array.from(root?.querySelectorAll?.(
    "[data-mk-npc-name-composition-second-syllable-chance], [data-mk-npc-name-composition-third-syllable-chance]",
  ) ?? []);
  chanceInputs.forEach(input => input.addEventListener("change", async () => {
    chanceInputs.forEach(chanceInput => {
      chanceInput.disabled = true;
    });
    try {
      const secondInput = root?.querySelector?.("[data-mk-npc-name-composition-second-syllable-chance]");
      const thirdInput = root?.querySelector?.("[data-mk-npc-name-composition-third-syllable-chance]");
      await setSceneNpcNameCompositionChances(secondInput?.value, thirdInput?.value, scene);
      await application?.render?.({ force: true });
    } catch (error) {
      console.error("mk-shadowdark | NPC Name Composition | Chance update failed", error);
      globalThis.ui?.notifications?.error?.(`NPC name composition chance update failed: ${error.message}`);
      chanceInputs.forEach(chanceInput => {
        chanceInput.disabled = false;
      });
    }
  }));
  return true;
}

function bindNpcTraitTables(application, root, scene) {
  bindRollTableDropSlots(application, root, scene, {
    slotSelector: "[data-mk-npc-trait-slot]",
    keyDataset: "mkNpcTraitSlot",
    multipleDataset: "mkNpcTraitMultiple",
    dropSelector: "[data-mk-npc-trait-drop]",
    clearSelector: "[data-mk-npc-trait-clear]",
    clearIndexDataset: "mkNpcTraitIndex",
    setTable: setSceneNpcTraitTable,
    warningMessage: "Drop a RollTable onto the NPC trait box.",
    errorLabel: "NPC Traits",
  });
  return true;
}

function compositionResultText(draw) {
  return tableResultText(draw?.result ?? draw?.results?.[0]) || String(draw?.value ?? "").trim();
}

function namePart(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function identifierPart(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function compositionTableProvenance(table) {
  return {
    tableId: String(table?.id ?? table?._id ?? ""),
    tableUuid: String(table?.uuid ?? ""),
    tableName: String(table?.name ?? ""),
  };
}

async function rollDieTotal(formula, RollClass = globalThis.Roll) {
  if (typeof RollClass === "function") {
    const roll = new RollClass(formula);
    const evaluated = typeof roll.evaluate === "function"
      ? await roll.evaluate({ async: true })
      : roll;
    const total = Number(evaluated?.total ?? roll?.total);
    if (Number.isFinite(total)) return Math.floor(total);
  }

  const match = /^\s*(\d+)d(\d+)\s*$/i.exec(String(formula ?? ""));
  const count = Number(match?.[1]);
  const sides = Number(match?.[2]);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(sides) || sides < 1) {
    throw new Error(`Cannot roll unsupported die formula: ${formula}.`);
  }
  return Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))
    .reduce((total, value) => total + value, 0);
}

async function rollNpcNameComposition(value, {
  tables = globalThis.game?.tables,
  rollTable = rollImportedSourceTable,
  rollDie = rollDieTotal,
  allowMissing = false,
} = {}) {
  const status = await resolveNpcNameCompositionStatus(value, tables);
  if (!allowMissing && !status.available) {
    const missing = [...status.missing, ...status.unavailable];
    throw new Error(`NPC name composition is incomplete: ${missing.join(", ") || "assigned RollTables are unavailable"}.`);
  }

  const parts = {};
  const rolls = {};
  const sources = {};
  const prefixTable = status.tables.prefix;
  const suffixTable = status.tables.suffix;
  const syllableTables = status.tables.syllables.filter(Boolean);
  const secondSyllableChance = status.composition.secondSyllableChance;
  const thirdSyllableChance = status.composition.thirdSyllableChance;
  const syllableCountRoll = syllableTables.length ? await rollDie("1d100") : null;
  const syllableCount = syllableTables.length === 0
    ? 0
    : syllableCountRoll <= secondSyllableChance
      ? 2
      : syllableCountRoll <= secondSyllableChance + thirdSyllableChance
        ? 3
        : 1;

  const rollFragment = async (key, table, { compact = true } = {}) => {
    const draw = await rollTable(table);
    const valueText = compact
      ? namePart(compositionResultText(draw))
      : identifierPart(compositionResultText(draw));
    if (!valueText) throw new Error(`${tableLabel(key)} RollTable returned no name fragment.`);
    return {
      value: valueText,
      roll: Number.isFinite(Number(draw?.total)) ? Number(draw.total) : null,
    };
  };

  const prefix = prefixTable ? await rollFragment("prefix", prefixTable) : null;
  parts.prefix = prefix?.value ?? "";
  rolls.prefix = prefix?.roll ?? null;
  sources.prefix = prefixTable ? compositionTableProvenance(prefixTable) : null;

  const syllableParts = [];
  const syllableRolls = [];
  const syllableSources = [];
  const syllableTableSelections = [];
  for (let index = 0; index < syllableCount; index += 1) {
    let selectionRoll = null;
    let selectedIndex = 0;
    if (syllableTables.length > 1) {
      selectionRoll = await rollDie(`1d${syllableTables.length}`);
      selectedIndex = Math.min(
        syllableTables.length - 1,
        Math.max(0, Math.floor(Number(selectionRoll)) - 1),
      );
    }
    const table = syllableTables[selectedIndex];
    const syllable = await rollFragment("syllables", table);
    syllableParts.push(syllable.value);
    syllableRolls.push(syllable.roll);
    syllableSources.push(compositionTableProvenance(table));
    syllableTableSelections.push({
      roll: selectionRoll,
      index: selectedIndex + 1,
      table: compositionTableProvenance(table),
    });
  }
  parts.syllables = syllableParts.join("");
  rolls.syllables = syllableRolls;
  sources.syllables = syllableSources;

  const suffix = suffixTable ? await rollFragment("suffix", suffixTable) : null;
  parts.suffix = suffix?.value ?? "";
  rolls.suffix = suffix?.roll ?? null;
  sources.suffix = suffixTable ? compositionTableProvenance(suffixTable) : null;

  let identifierValue = "";
  if (status.tables.identifier) {
    const identifier = await rollFragment("identifier", status.tables.identifier, { compact: false });
    identifierValue = identifier.value;
    parts.identifier = identifierValue;
    rolls.identifier = identifier.roll;
    sources.identifier = compositionTableProvenance(status.tables.identifier);
  } else {
    parts.identifier = "";
    rolls.identifier = null;
    sources.identifier = null;
  }

  rolls.secondSyllableChance = secondSyllableChance;
  rolls.thirdSyllableChance = thirdSyllableChance;
  rolls.syllableCountRoll = syllableCountRoll;
  rolls.syllableCount = syllableCount;
  rolls.syllableTableSelections = syllableTableSelections;

  return {
    name: [parts.prefix + parts.syllables + parts.suffix, identifierValue].filter(Boolean).join(" "),
    identifier: identifierValue,
    parts,
    syllableParts,
    rolls,
    sources,
  };
}

async function decorateNpcNameComposition(application, element) {
  if (!gmScreenApplication(application) || !globalThis.game?.user?.isGM) return false;
  const root = element?.querySelector ? element : null;
  const target = root?.querySelector?.("[data-mk-npc-name-composition]");
  const traitTarget = root?.querySelector?.("[data-mk-npc-trait-tables]");
  if (!target && !traitTarget) return false;

  const scene = currentScene();
  if (!scene) {
    if (target) target.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    if (traitTarget) traitTarget.innerHTML = '<div class="mk-gm-empty">No active Scene.</div>';
    return true;
  }

  const composition = getSceneNpcNameComposition(scene);
  if (target) {
    const entries = await resolveNpcNameCompositionEntries(scene);
    target.innerHTML = renderNpcNameCompositionSetup(entries, {
      secondSyllableChance: composition.secondSyllableChance,
      thirdSyllableChance: composition.thirdSyllableChance,
    });
    bindNpcNameComposition(application, target, scene);
  }
  if (traitTarget) {
    const entries = await resolveNpcTraitTableEntries(scene);
    traitTarget.innerHTML = renderNpcTraitTableSetup(entries);
    bindNpcTraitTables(application, traitTarget, scene);
  }
  return true;
}

function gmScreenApplication(application) {
  return Boolean(
    application
    && (
      application.id === APP_ID
      || application.options?.id === APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === APP_ID
      || application.id === SETTINGS_APP_ID
      || application.options?.id === SETTINGS_APP_ID
      || application.constructor?.DEFAULT_OPTIONS?.id === SETTINGS_APP_ID
    )
  );
}

function registerNpcNameComposition() {
  globalThis.Hooks?.on?.("renderApplicationV2", (application, element) => {
    void decorateNpcNameComposition(application, element);
  });
}

registerNpcNameComposition();

export {
  MODULE_ID,
  NPC_NAME_COMPOSITION_FLAG,
  NPC_NAME_COMPOSITION_SCHEMA,
  NPC_NAME_COMPOSITION_DEFAULT_SECOND_SYLLABLE_CHANCE,
  NPC_NAME_COMPOSITION_DEFAULT_THIRD_SYLLABLE_CHANCE,
  NPC_NAME_COMPOSITION_DEFAULT_TWO_SYLLABLE_CHANCE,
  NPC_NAME_COMPOSITION_KEYS,
  NPC_NAME_COMPOSITION_LABELS,
  NPC_NAME_COMPOSITION_MULTI_KEYS,
  NPC_NAME_COMPOSITION_OPTIONAL_KEYS,
  NPC_NAME_COMPOSITION_DISPLAY_KEYS,
  NPC_TRAIT_TABLE_FLAG,
  NPC_TRAIT_TABLE_SCHEMA,
  NPC_TRAIT_TABLE_KEYS,
  NPC_TRAIT_TABLE_LABELS,
  NPC_TRAIT_TABLE_MULTI_KEYS,
  normalizeNpcNameComposition,
  normalizeNpcTraitTables,
  normalizeTableUuidList,
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
  npcNameCompositionStatus,
  npcTraitTableStatus,
  resolveNpcNameCompositionStatus,
  setSceneNpcNameCompositionTable,
  setSceneNpcNameCompositionChances,
  setSceneNpcNameCompositionChance,
  setSceneNpcTraitTable,
  resolveNpcNameCompositionEntries,
  resolveNpcTraitTableEntries,
  renderNpcNameCompositionSetup,
  renderNpcTraitTableSetup,
  bindNpcNameComposition,
  bindNpcTraitTables,
  rollDieTotal,
  rollNpcNameComposition,
  decorateNpcNameComposition,
  registerNpcNameComposition,
};
