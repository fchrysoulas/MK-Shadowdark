const AUTO_DAMAGE_PROCESSING_VERSION = 1;

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTarget(target) {
  const state = ["planned", "applied", "conflict"].includes(target?.state)
    ? target.state
    : "planned";
  const operation = target?.operation === "healing" ? "healing" : "damage";
  const amount = Math.max(0, finiteNumber(target?.amount, 0));
  const reduction = Math.max(0, finiteNumber(target?.reduction, 0));
  const damageIncrease = Math.max(0, finiteNumber(target?.damageIncrease, 0));
  const effectiveAmount = Math.max(
    0,
    finiteNumber(
      target?.effectiveAmount,
      operation === "damage"
        ? amount - reduction + damageIncrease
        : amount
    )
  );

  return {
    uuid: String(target?.uuid ?? ""),
    state,
    hpPath: String(target?.hpPath ?? ""),
    beforeHp: finiteNumber(target?.beforeHp, 0),
    afterHp: finiteNumber(target?.afterHp, 0),
    appliedAmount: Math.max(0, finiteNumber(target?.appliedAmount, 0)),
    operation,
    actorName: String(target?.actorName ?? ""),
    tokenId: String(target?.tokenId ?? ""),
    amount,
    effectiveAmount,
    reduction,
    damageIncrease,
    traitMode: target?.traitMode ?? null,
    propertyNames: Array.from(target?.propertyNames ?? []).map(value => String(value)),
    conflictReason: target?.conflictReason ? String(target.conflictReason) : null,
    observedHp: finiteNumber(target?.observedHp, null)
  };
}

function deriveProcessingStatus(targets) {
  const records = Array.from(targets ?? []);
  if (records.some(target => target.state === "conflict")) return "conflict";
  if (records.every(target => target.state === "applied")) return "complete";
  return "pending";
}

function normalizeProcessingState(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (Number(raw.version) !== AUTO_DAMAGE_PROCESSING_VERSION) return null;

  const targets = Array.from(raw.targets ?? []).map(normalizeTarget);
  return {
    version: AUTO_DAMAGE_PROCESSING_VERSION,
    status: deriveProcessingStatus(targets),
    operation: raw.operation === "healing" ? "healing" : "damage",
    amount: Math.max(0, finiteNumber(raw.amount, 0)),
    display: raw.display && typeof raw.display === "object" ? clonePlain(raw.display) : null,
    targets
  };
}

function createProcessingState({ operation, amount, display = null, targets = [] }) {
  return normalizeProcessingState({
    version: AUTO_DAMAGE_PROCESSING_VERSION,
    status: "pending",
    operation,
    amount,
    display,
    targets
  });
}

function isTerminalProcessingState(state) {
  return state?.status === "complete" || state?.status === "conflict";
}

function hasLegacyProcessed(message, moduleId = "mk-shadowdark") {
  try {
    if (message?.getFlag?.(moduleId, "autoDamageProcessed") === true) return true;
  } catch (_error) {
    // Fall through to raw source data.
  }

  return message?.flags?.[moduleId]?.autoDamageProcessed === true
    || message?._source?.flags?.[moduleId]?.autoDamageProcessed === true;
}

function readProcessingState(message, moduleId = "mk-shadowdark") {
  let raw = null;
  try {
    raw = message?.getFlag?.(moduleId, "autoDamageProcessing") ?? null;
  } catch (_error) {
    // Fall through to raw source data.
  }

  raw ??= message?.flags?.[moduleId]?.autoDamageProcessing
    ?? message?._source?.flags?.[moduleId]?.autoDamageProcessing
    ?? null;
  return normalizeProcessingState(raw);
}

function reconcilePlannedTarget(target, currentHp) {
  const current = finiteNumber(currentHp, null);
  if (target?.state === "applied") return "skip";
  if (target?.state === "conflict") return "conflict";
  if (current === target.afterHp) return "promote";
  if (current === target.beforeHp) return "apply";
  return "conflict";
}

function replaceTarget(state, uuid, replacement) {
  const next = clonePlain(state);
  const index = next.targets.findIndex(target => target.uuid === uuid);
  if (index === -1) return normalizeProcessingState(next);
  next.targets[index] = normalizeTarget(replacement);
  next.status = deriveProcessingStatus(next.targets);
  return normalizeProcessingState(next);
}

async function runProcessingState(state, {
  readCurrentHp,
  applyTarget,
  persistState,
  onApplied = null,
  onPromoted = null,
  onConflict = null
} = {}) {
  let working = normalizeProcessingState(state);
  if (!working) throw new Error("Invalid Auto Damage processing state.");

  for (const target of working.targets) {
    if (target.state !== "planned") continue;

    let currentHp;
    try {
      currentHp = await readCurrentHp(target);
    } catch (error) {
      const conflictTarget = {
        ...target,
        state: "conflict",
        conflictReason: "target-unavailable",
        observedHp: null
      };
      working = replaceTarget(working, target.uuid, conflictTarget);
      await persistState(working);
      await onConflict?.(conflictTarget, error);
      continue;
    }

    const action = reconcilePlannedTarget(target, currentHp);
    if (action === "conflict") {
      const conflictTarget = {
        ...target,
        state: "conflict",
        conflictReason: "hp-diverged",
        observedHp: finiteNumber(currentHp, null)
      };
      working = replaceTarget(working, target.uuid, conflictTarget);
      await persistState(working);
      await onConflict?.(conflictTarget, null);
      continue;
    }

    if (action === "apply") {
      await applyTarget(target);
    }

    if (action === "promote") {
      await onPromoted?.(target);
    }

    const appliedTarget = {
      ...target,
      state: "applied",
      conflictReason: null,
      observedHp: null
    };
    working = replaceTarget(working, target.uuid, appliedTarget);
    await persistState(working);
    await onApplied?.(appliedTarget, action);
  }

  return working;
}

export {
  AUTO_DAMAGE_PROCESSING_VERSION,
  createProcessingState,
  deriveProcessingStatus,
  hasLegacyProcessed,
  isTerminalProcessingState,
  normalizeProcessingState,
  readProcessingState,
  reconcilePlannedTarget,
  runProcessingState
};
