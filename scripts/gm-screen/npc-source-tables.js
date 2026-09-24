import {
  parseLabeledResultText,
  rollImportedSourceTable,
  tableResultText,
} from "../source-tables/source-table-service.js";
import {
  getSceneNpcNameComposition,
  getSceneNpcTraitTables,
  npcTraitTableStatus,
  rollNpcNameComposition,
  rollDieTotal,
} from "./npc-name-compositions.js";

const LINKED_NPC_SOURCE_TITLE = "Scene-linked RollTables";
const NPC_ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
const NPC_ABILITY_LABELS = Object.freeze({
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
});

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function linkedNpcTraitStatus(tables = globalThis.game?.tables, {
  traitTables = getSceneNpcTraitTables(),
} = {}) {
  const status = npcTraitTableStatus(traitTables, tables);
  const featureTables = status.tables.features ?? [];
  const fieldTables = {
    ancestry: status.tables.ancestry,
    age: status.tables.age,
    alignment: status.tables.alignment,
    wealth: status.tables.wealth,
    occupation: status.tables.occupation,
    features: featureTables,
  };

  return {
    ...status,
    missingTables: [...status.missing, ...status.unavailable],
    tables: {
      ...status.tables,
      featureTables,
      featureFields: featureTables.map(() => ""),
      fieldTables,
      traitTables: status.assignments,
    },
  };
}

function simpleResultValue(draw, field = "") {
  const text = tableResultText(draw?.result ?? draw?.results?.[0]);
  const fields = parseLabeledResultText(text);
  if (!field) {
    const values = Object.values(fields);
    return values.length === 1 ? values[0] : text;
  }

  const wanted = normalize(field);
  const match = Object.entries(fields).find(([label]) => normalize(label) === wanted);
  return match?.[1] ?? text;
}

async function rollSimple(table, field = "", rollTable = rollImportedSourceTable) {
  const draw = await rollTable(table);
  return {
    roll: draw.total,
    value: simpleResultValue(draw, field),
    result: draw.result,
  };
}

async function rollOptionalSimple(table, field = "", rollTable = rollImportedSourceTable) {
  if (!table) return { roll: null, value: "", result: null };
  return rollSimple(table, field, rollTable);
}

function npcAbilityModifier(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value <= 3) return -4;
  if (value <= 5) return -3;
  if (value <= 7) return -2;
  if (value <= 9) return -1;
  if (value <= 11) return 0;
  if (value <= 13) return 1;
  if (value <= 15) return 2;
  if (value <= 17) return 3;
  return 4;
}

async function rollNpcAbilities({ rollAbility = rollDieTotal } = {}) {
  const abilities = {};
  for (const key of NPC_ABILITY_KEYS) {
    const roll = await rollAbility("3d6");
    const score = Number(roll);
    const normalizedScore = Number.isFinite(score) ? Math.floor(score) : null;
    abilities[key] = {
      key,
      label: NPC_ABILITY_LABELS[key],
      formula: "3d6",
      roll: normalizedScore,
      score: normalizedScore,
      modifier: npcAbilityModifier(normalizedScore),
    };
  }
  return abilities;
}

function tableProvenance(table) {
  return {
    source: "scene-linked",
    tableId: String(table?.id ?? table?._id ?? ""),
    tableUuid: String(table?.uuid ?? ""),
    tableName: String(table?.name ?? ""),
  };
}

async function rollNpcProfileFromSource({
  tables = globalThis.game?.tables,
  status = null,
  rollTable = rollImportedSourceTable,
  rollDie = undefined,
  rollAbility = undefined,
  nameComposition = null,
  traitTables = null,
} = {}) {
  const selectedTraitTables = traitTables ?? getSceneNpcTraitTables();
  const source = status ?? linkedNpcTraitStatus(tables, { traitTables: selectedTraitTables });
  const abilities = await rollNpcAbilities({ rollAbility: rollAbility ?? rollDieTotal });

  const ancestry = await rollOptionalSimple(source.tables.ancestry, "Ancestry", rollTable);
  const alignment = await rollOptionalSimple(source.tables.alignment, "Alignment", rollTable);
  const age = await rollOptionalSimple(source.tables.age, "Age", rollTable);
  const wealth = await rollOptionalSimple(source.tables.wealth, "Wealth", rollTable);

  const featureTables = source.tables.featureTables
    ?? source.tables.fieldTables?.features
    ?? source.tables.features
    ?? [];
  const featureDraws = await Promise.all(featureTables.map(table => rollOptionalSimple(table, "", rollTable)));
  const features = featureDraws
    .map(draw => String(draw.value ?? "").trim())
    .filter(Boolean);

  const occupation = await rollOptionalSimple(source.tables.occupation, "Occupation", rollTable);

  const selectedComposition = nameComposition ?? getSceneNpcNameComposition();
  const compositionResult = await rollNpcNameComposition(selectedComposition, {
    tables,
    rollTable,
    allowMissing: true,
    ...(rollDie ? { rollDie } : {}),
  });
  const nameValue = compositionResult.name;

  const sources = {
    ancestry: tableProvenance(source.tables.ancestry),
    age: tableProvenance(source.tables.age),
    alignment: tableProvenance(source.tables.alignment),
    wealth: tableProvenance(source.tables.wealth),
    occupation: tableProvenance(source.tables.occupation),
    features: featureTables.map(tableProvenance),
    nameComposition: compositionResult.sources,
  };

  return {
    name: nameValue,
    identifier: compositionResult.identifier,
    nameComposition: compositionResult,
    ancestry: ancestry.value,
    alignment: alignment.value,
    age: age.value,
    wealth: wealth.value,
    features,
    featuresAreCustom: featureTables.length > 0,
    occupation: occupation.value,
    rolls: {
      ancestry: ancestry.roll,
      alignment: alignment.roll,
      age: age.roll,
      wealth: wealth.roll,
      features: featureDraws.map(draw => draw.roll),
      occupation: occupation.roll,
      nameComposition: compositionResult.rolls,
      abilities: Object.fromEntries(
        NPC_ABILITY_KEYS.map(key => [key, abilities[key].roll]),
      ),
    },
    abilities,
    sources,
    sourceBookTitle: LINKED_NPC_SOURCE_TITLE,
  };
}

export {
  LINKED_NPC_SOURCE_TITLE,
  NPC_ABILITY_KEYS,
  NPC_ABILITY_LABELS,
  normalize,
  linkedNpcTraitStatus,
  npcAbilityModifier,
  rollNpcAbilities,
  simpleResultValue,
  rollSimple,
  tableProvenance,
  rollNpcProfileFromSource,
};
