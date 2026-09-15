const SURVIVAL_TRIGGER_MODES = Object.freeze({
  OFF: "off",
  PROMPT: "prompt",
  AUTOMATIC: "automatic"
});

const SURVIVAL_WOUND_DC = 12;

function normalizeSurvivalTriggerMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();
  if (mode === SURVIVAL_TRIGGER_MODES.OFF) return SURVIVAL_TRIGGER_MODES.OFF;
  if (mode === SURVIVAL_TRIGGER_MODES.AUTOMATIC) return SURVIVAL_TRIGGER_MODES.AUTOMATIC;
  return SURVIVAL_TRIGGER_MODES.PROMPT;
}

function survivalTriggerAction({
  enabled = true,
  mode = SURVIVAL_TRIGGER_MODES.PROMPT,
  wasDying = false,
  zeroCon = false,
  hp = 0,
  isGm = false
} = {}) {
  if (!enabled || !wasDying || zeroCon || !isGm) return "none";
  if (!Number.isFinite(Number(hp)) || Number(hp) <= 0) return "none";

  const normalizedMode = normalizeSurvivalTriggerMode(mode);
  if (normalizedMode === SURVIVAL_TRIGGER_MODES.OFF) return "none";
  if (normalizedMode === SURVIVAL_TRIGGER_MODES.AUTOMATIC) return "automatic";
  return "prompt";
}

function getConModifier(actor) {
  const modifierCandidates = [
    actor?.system?.abilities?.con?.mod,
    actor?.system?.abilities?.con?.modifier,
    actor?.system?.abilities?.con?.bonus,
    actor?.system?.attributes?.con?.mod,
    actor?.system?.con?.mod,
    actor?.system?.conMod
  ];

  for (const candidate of modifierCandidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }

  const scoreCandidates = [
    actor?.system?.abilities?.con?.value,
    actor?.system?.abilities?.con?.score,
    actor?.system?.attributes?.con?.value,
    actor?.system?.con?.value
  ];

  for (const candidate of scoreCandidates) {
    const score = Number(candidate);
    if (Number.isFinite(score)) return Math.floor((score - 10) / 2);
  }

  return 0;
}

export {
  SURVIVAL_TRIGGER_MODES,
  SURVIVAL_WOUND_DC,
  getConModifier,
  normalizeSurvivalTriggerMode,
  survivalTriggerAction
};
