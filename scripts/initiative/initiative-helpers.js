function numericInitiative(combatant) {
  const value = combatant?.initiative;
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function combatPosition(combat) {
  const combatant = combat?.combatant ?? combat?.turns?.[combat?.turn ?? -1] ?? null;
  return `${combat?.round ?? ""}:${combat?.turn ?? ""}:${combatant?.id ?? ""}`;
}

function sameInitiative(left, right) {
  const leftInitiative = numericInitiative(left);
  const rightInitiative = numericInitiative(right);
  return leftInitiative !== null
    && rightInitiative !== null
    && leftInitiative === rightInitiative;
}

async function advancePastGroupedCombatants(combat, origin, {
  advanceTurn,
  isGroupedCombatant,
  sameGroup = sameInitiative
} = {}) {
  if (typeof advanceTurn !== "function") {
    throw new TypeError("advancePastGroupedCombatants requires an advanceTurn function.");
  }

  if (typeof isGroupedCombatant !== "function") {
    throw new TypeError("advancePastGroupedCombatants requires an isGroupedCombatant function.");
  }

  const startRound = combat?.round;
  const maxTransitions = Math.max(1, Number(combat?.turns?.length ?? 0) + 1);
  let previousPosition = combatPosition(combat);
  let result = await advanceTurn();
  let transitions = 1;

  while (transitions < maxTransitions) {
    const currentPosition = combatPosition(combat);
    if (currentPosition === previousPosition) break;
    previousPosition = currentPosition;

    // Crossing the round boundary means core has reached the next round's
    // first real turn. Do not skip a new enemy slot just because it shares
    // the same initiative value as the previous round.
    if (combat?.round !== startRound) break;

    const current = combat?.combatant ?? combat?.turns?.[combat?.turn ?? -1] ?? null;
    if (!isGroupedCombatant(current) || !sameGroup(origin, current)) break;

    result = await advanceTurn();
    transitions += 1;
  }

  return result ?? combat;
}

export {
  advancePastGroupedCombatants,
  sameInitiative
};
