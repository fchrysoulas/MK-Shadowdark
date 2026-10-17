function getDtp(actor) {
  const value = Number(actor?.getFlag?.("mk-shadowdark", "dtp") ?? actor?.flags?.["mk-shadowdark"]?.dtp ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export { getDtp };
