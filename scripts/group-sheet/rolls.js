// scripts/group-sheet/rolls.js

import { ABILITIES, MODULE_ID, TRAVEL_ROLL_RESULT_TIMEOUT_MS } from "./constants.js";
import { getActorAbilityModifier } from "./actors.js";
import { travelRollWaiters } from "./state.js";
import { escapeHtml } from "./utils.js";
function buildNativeStatCheckConfig(options = {}) {
  const fastForward = Boolean(options.fastForward);
  const dc = Number(options.dc ?? options.target);
  const config = {
    skipPrompt: fastForward,
  };

  if (Number.isFinite(dc)) config.mainRoll = { dc };

  return config;
}

function buildNativeAbilityRollOptions(options = {}) {
  const fastForward = Boolean(options.fastForward);

  return {
    ...options,
    fastForward,
    skipPrompt: fastForward,
    skipDialog: fastForward,
    dialog: !fastForward,
    configureDialog: !fastForward,
  };
}

async function rollNativeAbilityCheck(actor, ability, options = {}) {
  if (typeof actor?.system?.rollStatCheck === "function") {
    return {
      called: true,
      result: await actor.system.rollStatCheck(ability, buildNativeStatCheckConfig(options)),
    };
  }

  const rollOptions = buildNativeAbilityRollOptions(options);
  const methodNames = [
    "rollAbilityCheck",
    "rollAbilityTest",
    "rollAbility",
  ];

  for (const methodName of methodNames) {
    const method = actor?.[methodName];
    if (typeof method !== "function") continue;

    return {
      called: true,
      result: await method.call(actor, ability, rollOptions),
    };
  }

  return { called: false, result: undefined };
}

async function rollActorAbility(actor, ability, options = {}) {
  if (!actor || !ability) return;

  if (!options.forceManual) {
    const nativeRoll = await rollNativeAbilityCheck(actor, ability, options);
    if (nativeRoll.called) return nativeRoll.result;
  }

  const label = ABILITIES.find(([key]) => key === ability)?.[1] ?? ability.toUpperCase();
  const mod = getActorAbilityModifier(actor, ability);

  const roll = await new Roll(`1d20 + ${mod}`).evaluate();
  const target = Number(options.target);
  const hasTarget = Number.isFinite(target);
  const outcome = hasTarget ? getTravelRollOutcome(roll, target) : null;
  const outcomeLabel = outcome
    ? `${outcome.critical ? "Critical " : ""}${outcome.success ? "Success" : "Failure"}`
    : "";

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: buildAbilityRollFlavor(actor, label, target, outcomeLabel, outcome),
  };

  if (outcome) {
    messageData.flags = {
      shadowdark: {
        ability,
        target,
        success: Boolean(outcome.success),
        result: outcomeLabel,
        critical: Boolean(outcome.critical),
      },
      [MODULE_ID]: {
        travelRoll: {
          ability,
          target,
          success: Boolean(outcome.success),
          result: outcomeLabel,
          critical: Boolean(outcome.critical),
        },
      },
    };
  }

  await roll.toMessage(messageData);

  return roll;
}

function buildAbilityRollFlavor(actor, label, target, outcomeLabel, outcome) {
  const base = `${escapeHtml(actor?.name ?? "Actor")} rolls ${escapeHtml(label)}`;
  if (!Number.isFinite(target) || !outcome) return base;

  const outcomeClass = outcome.success ? "is-success" : "is-failure";
  return `
    <div class="sdx-travel-roll-flavor">
      <span>${base} vs DC ${escapeHtml(target)}</span>
      <strong class="sdx-travel-roll-outcome ${outcomeClass}">${escapeHtml(outcomeLabel)}</strong>
    </div>
  `;
}

function getRollTotal(result) {
  const direct = Number(result?.total);
  if (Number.isFinite(direct)) return direct;

  const nested = Number(result?.roll?.total);
  if (Number.isFinite(nested)) return nested;

  const firstRoll = Array.isArray(result?.rolls) ? Number(result.rolls[0]?.total) : NaN;
  if (Number.isFinite(firstRoll)) return firstRoll;

  const texts = [
    result?.content,
    result?.flavor,
    result?.message?.content,
    result?.message?.flavor,
  ].filter(value => typeof value === "string");

  for (const text of texts) {
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    const outcomeMatches = [...plain.matchAll(/\b(?:critical\s+success|critical\s+failure|success|failure)\b[^\(\)]*\((-?\d+)\)/gi)];
    const outcomeTotal = Number(outcomeMatches.at(-1)?.[1]);
    if (Number.isFinite(outcomeTotal)) return outcomeTotal;
  }

  return null;
}

function getRollObjects(result) {
  const rolls = [];

  if (result?.terms) rolls.push(result);
  if (result?.roll?.terms) rolls.push(result.roll);
  if (Array.isArray(result?.rolls)) {
    rolls.push(...result.rolls.filter(roll => roll?.terms));
  }
  if (Array.isArray(result?.message?.rolls)) {
    rolls.push(...result.message.rolls.filter(roll => roll?.terms));
  }

  return rolls;
}

function getNaturalD20Result(result) {
  for (const roll of getRollObjects(result)) {
    for (const term of roll.terms ?? []) {
      if (Number(term?.faces) !== 20 || !Array.isArray(term.results)) continue;

      const activeResults = term.results.filter(entry => entry?.active !== false);
      const results = activeResults.length ? activeResults : term.results;
      const value = Number(results[0]?.result);

      if (Number.isFinite(value)) return value;
    }
  }

  return null;
}

function getTravelOutcomeFromShadowdarkResult(result) {
  const candidates = [
    result?.flags?.shadowdark,
    result?.message?.flags?.shadowdark,
  ].filter(value => value && typeof value === "object");
  const texts = [
    result?.flavor,
    result?.content,
    result?.message?.flavor,
    result?.message?.content,
  ].filter(value => typeof value === "string");
  let success = null;
  let critical = false;

  function readOutcomeText(text) {
    const lower = String(text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
    const matches = [...lower.matchAll(/\bcritical\s+success\b|\bcritical\s+failure\b|\bsuccess\b|\bfailure\b/g)];
    const last = matches.at(-1)?.[0] ?? "";

    if (!last) return null;

    return {
      success: last.includes("success"),
      critical: last.includes("critical"),
    };
  }

  function walk(value) {
    if (!value || typeof value !== "object" || success !== null) return;

    for (const [key, entry] of Object.entries(value)) {
      const keyText = key.toLowerCase();

      if (typeof entry === "boolean" && /\bsuccess\b/.test(keyText)) {
        success = entry;
        return;
      }

      if (typeof entry === "boolean" && keyText.includes("critical")) {
        critical ||= entry;
        continue;
      }

      if (typeof entry === "string") {
        if (!/(result|outcome|status|title|label)/i.test(key)) continue;

        const parsed = readOutcomeText(entry);
        if (parsed) {
          success = parsed.success;
          critical ||= parsed.critical;
          return;
        }
      }

      if (entry && typeof entry === "object") walk(entry);
    }
  }

  for (const candidate of candidates) walk(candidate);

  for (const text of texts) {
    if (success !== null) break;
    const parsed = readOutcomeText(text);
    if (!parsed) continue;
    success = parsed.success;
    critical ||= parsed.critical;
  }

  if (success === null) return null;

  return {
    success,
    critical,
    count: critical ? 2 : 1,
  };
}

function getTravelRollOutcome(result, dc) {
  const total = getRollTotal(result);
  const natural = getNaturalD20Result(result);

  if (natural === 20) {
    return {
      success: true,
      critical: true,
      count: 2,
    };
  }

  if (natural === 1) {
    return {
      success: false,
      critical: true,
      count: 2,
    };
  }

  const shadowdarkOutcome = getTravelOutcomeFromShadowdarkResult(result);
  if (shadowdarkOutcome?.critical) return shadowdarkOutcome;

  if (Number.isFinite(total)) {
    return {
      success: total >= Number(dc),
      critical: false,
      count: 1,
    };
  }

  if (shadowdarkOutcome) return shadowdarkOutcome;

  return {
    success: false,
    critical: false,
    count: 1,
  };
}

function isTravelRollResultParseable(result) {
  return Boolean(result)
    && (
      getRollTotal(result) !== null
      || getNaturalD20Result(result) !== null
      || Boolean(getTravelOutcomeFromShadowdarkResult(result))
    );
}

function getTravelMessageActorIds(message) {
  const ids = new Set();
  const actorId = message?.getFlag?.("shadowdark", "actorId") ?? message?.flags?.shadowdark?.actorId;
  const tokenActorId = message?.speaker?.actor;
  const actor = message?.actor;

  for (const value of [actorId, tokenActorId, actor?.id, actor?.uuid]) {
    if (value) ids.add(String(value));
  }

  return ids;
}

function getTravelMessagePlainText(message) {
  return [
    message?.flavor,
    message?.content,
    message?.flags?.shadowdark?.title,
    message?.flags?.shadowdark?.label,
    message?.flags?.shadowdark?.result,
  ]
    .filter(value => typeof value === "string")
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function messageMatchesTravelRollWaiter(message, waiter) {
  if (!message || !waiter?.actor || !waiter.ability) return false;

  const actorIds = getTravelMessageActorIds(message);
  const actorIdMatches = actorIds.has(String(waiter.actor.id)) || actorIds.has(String(waiter.actor.uuid));
  const text = getTravelMessagePlainText(message);
  const lower = text.toLowerCase();
  const actorNameMatches = waiter.actor.name && lower.includes(String(waiter.actor.name).toLowerCase());

  if (!actorIdMatches && !actorNameMatches) return false;

  const dcMatch = lower.match(/\bdc\s*\(?\s*(\d+)\s*\)?/i);
  if (dcMatch && Number(dcMatch[1]) !== Number(waiter.dc)) return false;

  const abilityLabel = ABILITIES.find(([key]) => key === waiter.ability)?.[1] ?? waiter.ability.toUpperCase();
  const abilityNames = {
    str: "strength",
    dex: "dexterity",
    con: "constitution",
    int: "intelligence",
    wis: "wisdom",
    cha: "charisma",
  };
  const expectedName = abilityNames[waiter.ability] ?? waiter.ability;
  const expectedPattern = new RegExp(`\\b(${expectedName}|${abilityLabel.toLowerCase()})\\b`, "i");
  const abilityWords = Object.values(abilityNames).join("|");
  const otherAbilityPattern = new RegExp(`\\b(${abilityWords})\\s+check\\b`, "i");
  const otherAbilityMatch = lower.match(otherAbilityPattern);

  if (otherAbilityMatch && !expectedPattern.test(otherAbilityMatch[1])) return false;
  if (!expectedPattern.test(lower) && !dcMatch) return false;

  return isTravelRollResultParseable({ message });
}

function waitForTravelRollChatMessage({ actor, ability, dc, timeoutMs = TRAVEL_ROLL_RESULT_TIMEOUT_MS }) {
  let waiter;

  const promise = new Promise(resolve => {
    waiter = {
      actor,
      ability,
      dc,
      resolve,
      settled: false,
      timer: null,
    };

    waiter.finish = result => {
      if (waiter.settled) return;
      waiter.settled = true;
      if (waiter.timer) clearTimeout(waiter.timer);
      travelRollWaiters.delete(waiter);
      resolve(result);
    };

    waiter.timer = setTimeout(() => {
      waiter.finish(null);
    }, Math.max(1000, Number(timeoutMs) || TRAVEL_ROLL_RESULT_TIMEOUT_MS));

    travelRollWaiters.add(waiter);
  });

  return {
    promise,
    cancel: () => waiter?.finish?.(null),
  };
}

function handleTravelRollChatMessage(message) {
  if (!travelRollWaiters.size) return;

  for (const waiter of [...travelRollWaiters]) {
    if (messageMatchesTravelRollWaiter(message, waiter)) {
      waiter.finish({ message });
    }
  }
}

async function rollTravelAbilityAndWait(actor, ability, activity, options = {}) {
  const waiter = waitForTravelRollChatMessage({
    actor,
    ability,
    dc: activity.dc,
    timeoutMs: options.timeoutMs,
  });

  let immediateResult = null;

  try {
    immediateResult = await rollActorAbility(actor, ability, {
      event: options.event,
      target: activity.dc,
      dc: activity.dc,
      fastForward: Boolean(options.fastForward),
    });
  } catch (error) {
    waiter.cancel();
    throw error;
  }

  if (isTravelRollResultParseable(immediateResult)) {
    waiter.cancel();
    return immediateResult;
  }

  if (immediateResult === false) {
    waiter.cancel();
    return immediateResult;
  }

  const chatResult = await waiter.promise;
  return chatResult ?? immediateResult ?? null;
}
export {
  rollActorAbility,
  getTravelRollOutcome,
  isTravelRollResultParseable,
  handleTravelRollChatMessage,
  rollTravelAbilityAndWait,
};
