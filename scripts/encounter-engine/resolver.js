import { DEFAULT_PROFILES, MODULE_ID, SETTINGS } from "./constants.js";
import {
  activeGmIds,
  currentScene,
  deepClone,
  mergeObject,
  resolveUuid,
  setting,
  stripHtml,
  warn,
} from "./helpers.js";

export async function evaluateRoll(formula, flavor = "") {
  const roll = await new Roll(String(formula || "1")).evaluate();

  if (setting(SETTINGS.showDice3d, false) && game.dice3d?.showForRoll) {
    try {
      await game.dice3d.showForRoll(roll, game.user, true, activeGmIds(), false, flavor);
    } catch (diceError) {
      warn("Dice So Nice display failed", diceError);
    }
  }

  return roll;
}

export function rollTotal(roll, fallback = 0) {
  const total = Number(roll?.total);
  return Number.isFinite(total) ? total : fallback;
}

function mappingForTotal(results, total) {
  const result = Array.isArray(results)
    ? results.find(entry => total >= Number(entry.min) && total <= Number(entry.max))
    : null;
  return result ? deepClone(result) : null;
}

export async function drawTableText(tableUuid) {
  const table = await resolveUuid(tableUuid);
  if (!table || table.documentName !== "RollTable") {
    throw new Error(`RollTable not found: ${tableUuid}`);
  }

  let draw;
  if (typeof table.roll === "function") {
    draw = await table.roll({ recursive: false });
  } else {
    draw = await table.draw({ displayChat: false, recursive: false });
  }

  const results = Array.from(draw?.results ?? []);
  const result = results[0] ?? null;
  const text = getRollTableResultText(result);

  return {
    tableUuid: table.uuid,
    tableName: table.name,
    roll: draw?.roll ?? null,
    result,
    text,
  };
}

function getRollTableResultText(result) {
  if (!result) return "";

  const direct = result.text ?? result.name;
  if (direct) return stripHtml(direct);

  if (typeof result.getChatText === "function") {
    try {
      return stripHtml(result.getChatText());
    } catch (_error) {
    }
  }

  return stripHtml(result.document?.name ?? "");
}

function getResultRawFlags(result) {
  return result?._source?.flags?.[MODULE_ID]?.encounter ?? result?._source?.flags?.[MODULE_ID] ?? {};
}

function getActorEncounterFlags(actor) {
  if (!actor) return {};
  try {
    return actor.getFlag?.(MODULE_ID, "encounter") ?? actor._source?.flags?.[MODULE_ID]?.encounter ?? {};
  } catch (_error) {
    return actor._source?.flags?.[MODULE_ID]?.encounter ?? {};
  }
}

function resultDocumentUuid(result) {
  if (!result) return "";
  if (result.document?.uuid) return result.document.uuid;
  if (result.documentUuid) return result.documentUuid;

  const collection = result.documentCollection ?? result._source?.documentCollection;
  const documentId = result.documentId ?? result._source?.documentId;
  if (!collection || !documentId) return "";

  if (collection === "Actor") return `Actor.${documentId}`;
  if (String(collection).startsWith("Compendium.")) return `${collection}.Actor.${documentId}`;

  const pack = game.packs?.get(collection);
  if (pack?.documentName === "Actor") return `Compendium.${collection}.Actor.${documentId}`;
  return "";
}

function inlineActorUuid(text) {
  const match = String(text ?? "").match(/@UUID\[((?:Actor|Compendium\.[^\]]+\.Actor)\.[^\]]+)\]/i);
  return match?.[1] ?? "";
}

async function findActorByName(name) {
  const normalized = String(name ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const worldActor = Array.from(game.actors ?? []).find(actor => actor.name?.trim().toLowerCase() === normalized);
  if (worldActor) return worldActor;

  for (const pack of game.packs ?? []) {
    const documentName = pack.documentName ?? pack.metadata?.type;
    if (documentName !== "Actor") continue;

    try {
      const index = await pack.getIndex({ fields: ["name"] });
      const entry = index.find(item => item.name?.trim().toLowerCase() === normalized);
      if (entry) return await pack.getDocument(entry._id);
    } catch (_error) {
    }
  }

  return null;
}

function parseEncounterText(text) {
  const cleaned = stripHtml(text).replace(/\s+/g, " ").trim();
  const timeMatch = cleaned.match(/\s*\((Day|Night|Any)\)\s*$/i);
  const timeRestriction = timeMatch ? timeMatch[1].toLowerCase() : "any";
  const withoutTime = timeMatch ? cleaned.slice(0, timeMatch.index).trim() : cleaned;

  const countMatch = withoutTime.match(/^((?:\d+)?d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(?:[x×]\s*)?(.+)$/i);
  if (!countMatch) {
    return {
      raw: cleaned,
      label: withoutTime || "Unknown Encounter",
      numberFormula: "1",
      timeRestriction,
    };
  }

  return {
    raw: cleaned,
    label: countMatch[2].trim(),
    numberFormula: countMatch[1].replace(/\s+/g, ""),
    timeRestriction,
  };
}

async function resolveEncounterResult(draw, profile, period) {
  const parsed = parseEncounterText(draw.text);
  const resultFlags = getResultRawFlags(draw.result);

  let actorUuid = String(resultFlags.actorUuid ?? resultDocumentUuid(draw.result) ?? inlineActorUuid(draw.text) ?? "");
  let actor = await resolveUuid(actorUuid);

  if (actor?.documentName !== "Actor") actor = null;
  if (!actor) {
    actor = await findActorByName(parsed.label);
    actorUuid = actor?.uuid ?? actorUuid;
  }

  const actorFlags = getActorEncounterFlags(actor);
  const numberFormula = String(
    resultFlags.numberFormula ??
    actorFlags.numberFormula ??
    parsed.numberFormula ??
    profile.defaultNumberAppearing ??
    "1"
  );

  const numberRoll = await evaluateRoll(numberFormula, "Number Appearing");
  const count = Math.max(1, Math.floor(rollTotal(numberRoll, 1)));
  const label = String(resultFlags.label ?? actor?.name ?? parsed.label ?? draw.text ?? "Unknown Encounter");
  const timeRestriction = String(resultFlags.time ?? parsed.timeRestriction ?? "any").toLowerCase();

  return {
    label,
    actorUuid,
    count,
    numberFormula,
    numberTotal: rollTotal(numberRoll, count),
    timeRestriction,
    tableResultId: draw.result?.id ?? draw.result?._id ?? "",
    metadata: mergeObject(actorFlags, resultFlags),
    validForPeriod: timeRestriction === "any" || timeRestriction === period,
  };
}

export async function drawEncounterResult(tableUuid, profile, period) {
  const maximumAttempts = 30;
  let last = null;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const draw = await drawTableText(tableUuid);
    const resolved = await resolveEncounterResult(draw, profile, period);
    last = { ...draw, encounter: resolved };
    if (resolved.validForPeriod) return last;
  }

  warn(`Could not find an encounter result valid for ${period} after ${maximumAttempts} attempts.`);
  return last;
}

export async function rollMappedOutcome(profile, field) {
  const tableUuid = String(profile.auxiliaryTables?.[field] ?? "");
  if (tableUuid) {
    const draw = await drawTableText(tableUuid);
    return {
      label: draw.text || "No result",
      total: rollTotal(draw.roll, null),
      formula: draw.roll?.formula ?? "RollTable",
      tableUuid,
      tableName: draw.tableName,
    };
  }

  const definition = profile.outcomes?.[field] ?? DEFAULT_PROFILES.default.outcomes[field];
  const formula = String(definition?.formula ?? "1d6");
  const roll = await evaluateRoll(formula, field);
  const total = rollTotal(roll, 0);
  const mapped = mappingForTotal(definition?.results, total);

  return {
    label: mapped?.label ?? String(total),
    total,
    formula,
    disposition: mapped?.disposition ?? "",
  };
}

export async function rollSurprise(profile) {
  const tableUuid = String(profile.auxiliaryTables?.surprise ?? "");
  if (tableUuid) {
    const draw = await drawTableText(tableUuid);
    return {
      label: draw.text || "No surprise",
      formula: draw.roll?.formula ?? "RollTable",
      total: rollTotal(draw.roll, null),
      tableUuid,
      tableName: draw.tableName,
    };
  }

  const formula = String(profile.surprise?.formula ?? "1d6");
  const surprisedOn = Array.isArray(profile.surprise?.surprisedOn)
    ? profile.surprise.surprisedOn.map(Number)
    : [1];

  const partyRoll = await evaluateRoll(formula, "Party Surprise");
  const creatureRoll = await evaluateRoll(formula, "Creature Surprise");
  const partySurprised = surprisedOn.includes(rollTotal(partyRoll, 0));
  const creaturesSurprised = surprisedOn.includes(rollTotal(creatureRoll, 0));

  let label = "No one surprised";
  if (partySurprised && creaturesSurprised) label = "Both sides surprised";
  else if (partySurprised) label = "Party surprised";
  else if (creaturesSurprised) label = "Creatures surprised";

  return {
    label,
    formula,
    partyTotal: rollTotal(partyRoll, 0),
    creatureTotal: rollTotal(creatureRoll, 0),
    partySurprised,
    creaturesSurprised,
  };
}

function actorText(actor) {
  if (!actor) return "";
  const candidates = [
    actor.system?.notes,
    actor.system?.description,
    actor.system?.biography,
    actor.system?.details?.biography?.value,
  ];

  for (const item of actor.items ?? []) {
    candidates.push(item.system?.description, item.system?.notes, item.name);
  }

  return candidates.filter(Boolean).map(stripHtml).join(" ").toLowerCase();
}

export async function rollMorale(profile, encounter) {
  const actor = encounter.actorUuid ? await resolveUuid(encounter.actorUuid) : null;
  const metadata = encounter.metadata ?? {};

  if (metadata.moraleImmune === true || actorText(actor).includes("immune to morale")) {
    return { label: "Immune", immune: true, threshold: null, formula: "" };
  }

  if (metadata.morale !== undefined && metadata.morale !== null && metadata.morale !== "") {
    const threshold = Number(metadata.morale);
    if (Number.isFinite(threshold)) {
      return { label: String(threshold), immune: false, threshold, formula: "Fixed" };
    }
  }

  const tableUuid = String(profile.auxiliaryTables?.morale ?? "");
  if (tableUuid) {
    const draw = await drawTableText(tableUuid);
    const numeric = Number(String(draw.text).match(/-?\d+/)?.[0]);
    return {
      label: Number.isFinite(numeric) ? String(numeric) : draw.text,
      immune: false,
      threshold: Number.isFinite(numeric) ? numeric : null,
      formula: draw.roll?.formula ?? "RollTable",
      tableUuid,
      tableName: draw.tableName,
    };
  }

  const fixed = Number(profile.defaultMorale);
  if (Number.isFinite(fixed)) {
    return { label: String(fixed), immune: false, threshold: fixed, formula: "Profile" };
  }

  const rolled = await rollMappedOutcome(profile, "morale");
  return { label: String(rolled.total), immune: false, threshold: rolled.total, formula: rolled.formula };
}

export function deriveDisposition(reaction) {
  const normalized = String(reaction?.disposition ?? "").toLowerCase();
  if (["hostile", "neutral", "friendly"].includes(normalized)) return normalized;

  const label = String(reaction?.label ?? "").toLowerCase();
  if (label.includes("attack") || label.includes("hostile")) return "hostile";
  if (label.includes("friendly")) return "friendly";
  return "neutral";
}

export async function buildEncounterData({ profileId, profile, terrain, requestedPeriod, period, tableUuid, tableName, draw }) {
  const encounter = draw.encounter;

  const [distance, activity, surprise, reaction, intent] = await Promise.all([
    rollMappedOutcome(profile, "distance"),
    encounter.metadata?.activity
      ? Promise.resolve({ label: String(encounter.metadata.activity), formula: "Encounter result", total: null })
      : rollMappedOutcome(profile, "activity"),
    rollSurprise(profile),
    rollMappedOutcome(profile, "reaction"),
    encounter.metadata?.intent
      ? Promise.resolve({ label: String(encounter.metadata.intent), formula: "Encounter result", total: null })
      : rollMappedOutcome(profile, "intent"),
  ]);

  const morale = await rollMorale(profile, encounter);
  const disposition = String(encounter.metadata?.disposition ?? deriveDisposition(reaction));

  return {
    schema: 1,
    generatedAt: Date.now(),
    profileId,
    profileName: profile.name ?? profileId,
    sceneId: currentScene()?.id ?? "",
    sceneName: currentScene()?.name ?? "",
    terrain,
    requestedPeriod,
    period,
    tableUuid,
    tableName,
    encounter,
    distance,
    activity,
    surprise,
    reaction,
    intent,
    morale,
    disposition,
  };
}
