function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getConScore(actor) {
  const candidates = [
    actor?.system?.abilities?.con?.value,
    actor?.system?.abilities?.con?.score,
    actor?.system?.attributes?.con?.value,
    actor?.system?.con?.value
  ];

  for (const candidate of candidates) {
    const score = numberOrNull(candidate);
    if (score !== null) return score;
  }

  return null;
}

function isPlayerAtZeroCon(actor) {
  if (actor?.documentName !== "Actor" || actor.type !== "Player") return false;
  const score = getConScore(actor);
  return score !== null && score <= 0;
}

export {
  getConScore,
  isPlayerAtZeroCon
};
