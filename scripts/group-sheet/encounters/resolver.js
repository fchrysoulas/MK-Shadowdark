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

export function mappingForTotal(results, total) {
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
    present: mapped?.present,
  };
}

export async function rollOptionalSurprise(profile) {
  const tableUuid = String(profile.auxiliaryTables?.surprise ?? "");
  if (tableUuid) {
    const draw = await drawTableText(tableUuid);
    return {
      label: draw.text || "No surprise",
      formula: draw.roll?.formula ?? "RollTable",
      total: rollTotal(draw.roll, null),
      tableUuid,
      tableName: draw.tableName,
      optional: true,
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
    optional: true,
  };
}

export function awarenessResult(profile, requested = "determine") {
  const options = profile.awareness?.options ?? DEFAULT_PROFILES.default.awareness.options;
  const key = options[requested] ? requested : String(profile.awareness?.default ?? "determine");
  return {
    key,
    label: String(options[key] ?? "Determine during play"),
    formula: "Fiction and detection checks",
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

export async function rollReaction(profile, encounter, options = {}) {
  const metadata = encounter.metadata ?? {};
  const fixedReaction = String(metadata.reaction ?? metadata.fixedReaction ?? "").trim();
  const reactionMode = String(metadata.reactionMode ?? options.reactionMode ?? "roll").toLowerCase();

  if (reactionMode === "skip" || reactionMode === "none") {
    return {
      label: "Not determined",
      skipped: true,
      disposition: String(metadata.disposition ?? "neutral"),
      formula: "",
    };
  }

  if (reactionMode === "hostile" || reactionMode === "fixed" || fixedReaction) {
    const label = fixedReaction || "Hostile";
    const normalized = label.toLowerCase();
    return {
      label,
      fixed: true,
      formula: "Fixed attitude",
      disposition: String(metadata.disposition ?? (normalized.includes("friendly") ? "friendly" : normalized.includes("hostile") ? "hostile" : "neutral")),
    };
  }

  let actor = null;
  let chaModifier = 0;
  if (options.addReactionCha && options.reactionActorUuid) {
    actor = await resolveUuid(options.reactionActorUuid);
    if (actor?.documentName === "Actor" && actor.type === "Player") {
      chaModifier = Number(actor.system?.abilities?.cha?.mod ?? 0);
    } else {
      actor = null;
    }
  }

  const baseFormula = String(profile.outcomes?.reaction?.formula ?? "2d6");
  const formula = chaModifier ? `${baseFormula} ${chaModifier >= 0 ? "+" : "-"} ${Math.abs(chaModifier)}` : baseFormula;
  const roll = await evaluateRoll(formula, "Reaction");
  const total = rollTotal(roll, 0);
  const tableUuid = String(profile.auxiliaryTables?.reaction ?? "");

  let mapped = null;
  let tableName = "";
  if (tableUuid) {
    const table = await resolveUuid(tableUuid);
    if (table?.documentName === "RollTable") {
      const results = Array.from(table.getResultsForRoll?.(total) ?? []);
      const result = results[0] ?? null;
      mapped = result ? { label: getRollTableResultText(result) } : null;
      tableName = table.name;
    }
  }
  mapped ??= mappingForTotal(profile.outcomes?.reaction?.results, total);

  return {
    label: mapped?.label ?? String(total),
    total,
    formula,
    disposition: mapped?.disposition ?? "",
    actorUuid: actor?.uuid ?? "",
    actorName: actor?.name ?? "",
    chaModifier,
    revealsPosition: Boolean(actor),
    tableUuid,
    tableName,
  };
}

export async function rollTreasure(profile, encounter) {
  const metadata = encounter.metadata ?? {};
  if (metadata.treasure === true || metadata.treasure === false) {
    return {
      label: metadata.treasure ? "Treasure present" : "No treasure",
      present: Boolean(metadata.treasure),
      formula: "Encounter result",
    };
  }

  const tableUuid = String(profile.auxiliaryTables?.treasure ?? "");
  if (tableUuid) {
    const draw = await drawTableText(tableUuid);
    const label = draw.text || "No treasure";
    return {
      label,
      present: !/no\s+treasure/i.test(label),
      total: rollTotal(draw.roll, null),
      formula: draw.roll?.formula ?? "RollTable",
      tableUuid,
      tableName: draw.tableName,
    };
  }

  const rolled = await rollMappedOutcome(profile, "treasure");
  return {
    ...rolled,
    present: Boolean(mappingForTotal(profile.outcomes?.treasure?.results, rolled.total)?.present),
  };
}

export async function buildMoraleInfo(profile, encounter) {
  const actor = encounter.actorUuid ? await resolveUuid(encounter.actorUuid) : null;
  const metadata = encounter.metadata ?? {};
  const text = actorText(actor);
  const immune = metadata.moraleImmune === true
    || /immune to morale checks?/i.test(text)
    || /\bfearless\b/i.test(text);
  const dc = Number(profile.morale?.dc ?? 15);
  const ability = String(profile.morale?.ability ?? "wis").toLowerCase();
  const modifier = Number(actor?.system?.abilities?.[ability]?.mod ?? 0);

  if (immune) {
    return {
      label: "Immune",
      immune: true,
      dc,
      ability,
      modifier,
      trigger: "Does not make morale checks",
    };
  }

  const count = Math.max(1, Number(encounter.count ?? 1));
  const hpMax = Number(actor?.system?.attributes?.hp?.max ?? 0);
  const isSolo = count === 1;
  const triggerCount = isSolo ? null : Math.max(1, Math.floor(count / 2));
  const trigger = isSolo
    ? (hpMax > 0 ? `At ${Math.floor(hpMax / 2)} of ${hpMax} HP` : "At half HP")
    : `When ${triggerCount} of ${count} remain`;

  return {
    label: `DC ${dc} ${ability.toUpperCase()}`,
    immune: false,
    dc,
    ability,
    modifier,
    trigger,
    startingCount: count,
    triggerCount,
    hpMax: hpMax || null,
    status: "Not triggered",
  };
}

export function deriveDisposition(reaction) {
  const normalized = String(reaction?.disposition ?? "").toLowerCase();
  if (["hostile", "neutral", "friendly"].includes(normalized)) return normalized;

  const label = String(reaction?.label ?? "").toLowerCase();
  if (label.includes("attack") || label.includes("hostile")) return "hostile";
  if (label.includes("friendly")) return "friendly";
  return "neutral";
}

export function dangerDefinition(profile, dangerLevel) {
  const levels = profile.dangerLevels ?? DEFAULT_PROFILES.default.dangerLevels;
  const id = levels[dangerLevel] ? dangerLevel : String(profile.defaultDangerLevel ?? "unsafe");
  return { id, data: levels[id] ?? DEFAULT_PROFILES.default.dangerLevels.unsafe };
}

export async function buildEncounterData({
  profileId,
  profile,
  terrain,
  dangerLevel,
  requestedPeriod,
  period,
  tableUuid,
  tableName,
  draw,
  options = {},
}) {
  const encounter = draw.encounter;
  const activityPromise = encounter.metadata?.activity
    ? Promise.resolve({ label: String(encounter.metadata.activity), formula: "Encounter result", total: null })
    : rollMappedOutcome(profile, "activity");
  const intentEnabled = Boolean(options.rollIntent ?? profile.optionalProcedures?.intent ?? false);
  const intentPromise = encounter.metadata?.intent
    ? Promise.resolve({ label: String(encounter.metadata.intent), formula: "Encounter result", total: null })
    : intentEnabled ? rollMappedOutcome(profile, "intent") : Promise.resolve(null);
  const surpriseDiceEnabled = Boolean(profile.optionalProcedures?.surpriseDice);

  const [distance, activity, reaction, intent, treasure, optionalSurprise] = await Promise.all([
    rollMappedOutcome(profile, "distance"),
    activityPromise,
    rollReaction(profile, encounter, options),
    intentPromise,
    rollTreasure(profile, encounter),
    surpriseDiceEnabled ? rollOptionalSurprise(profile) : Promise.resolve(null),
  ]);

  const awareness = optionalSurprise ?? awarenessResult(
    profile,
    String(encounter.metadata?.awareness ?? options.awareness ?? profile.awareness?.default ?? "determine")
  );
  const morale = await buildMoraleInfo(profile, encounter);
  const disposition = String(encounter.metadata?.disposition ?? deriveDisposition(reaction));
  const danger = dangerDefinition(profile, dangerLevel);

  return {
    schema: 2,
    generatedAt: Date.now(),
    rulesMode: String(profile.rulesMode ?? "shadowdark"),
    profileId,
    profileName: profile.name ?? profileId,
    sceneId: currentScene()?.id ?? "",
    sceneName: currentScene()?.name ?? "",
    terrain,
    dangerLevel: danger.id,
    dangerLabel: String(danger.data.label ?? danger.id),
    dangerInterval: Number(danger.data.interval ?? 1),
    requestedPeriod,
    period,
    tableUuid,
    tableName,
    encounter,
    distance,
    activity,
    awareness,
    reaction,
    intent,
    treasure,
    morale,
    disposition,
    resolutionOptions: {
      awareness: String(options.awareness ?? "determine"),
      reactionMode: String(options.reactionMode ?? "roll"),
      reactionActorUuid: String(options.reactionActorUuid ?? ""),
      addReactionCha: Boolean(options.addReactionCha),
      rollIntent: intentEnabled,
    },
  };
}
