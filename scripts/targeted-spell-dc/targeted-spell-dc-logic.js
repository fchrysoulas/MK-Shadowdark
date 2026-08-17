function selectHighestSpellDcCandidate(candidates = []) {
  let selected = null;

  for (const candidate of candidates) {
    const dc = Number(candidate?.dc);
    if (!Number.isFinite(dc) || dc < 0) continue;
    if (!selected || dc > selected.dc) selected = { ...candidate, dc };
  }

  return selected;
}

export { selectHighestSpellDcCandidate };
