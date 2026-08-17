function statusLabel(status, fallback = "Dead") {
  const raw = String(status?.name ?? status?.title ?? fallback).trim();
  if (!raw || /^effect\./i.test(raw)) return fallback;
  return raw;
}

function findConfiguredStatus(statusEffects, preferredId = "dead") {
  const effects = Array.from(statusEffects ?? []);
  const normalizedId = String(preferredId ?? "").toLowerCase();

  return effects.find(status => String(status?.id ?? "").toLowerCase() === normalizedId)
    ?? effects.find(status => statusLabel(status, "").toLowerCase() === normalizedId)
    ?? null;
}

async function setConfiguredStatus(actor, statusEffects, preferredId = "dead", active = true) {
  if (!actor || typeof actor.toggleStatusEffect !== "function") {
    throw new TypeError("Actor.toggleStatusEffect is required.");
  }

  const status = findConfiguredStatus(statusEffects, preferredId);
  if (!status?.id) {
    throw new Error(`Configured status not found: ${preferredId}`);
  }

  return actor.toggleStatusEffect(status.id, {
    active: Boolean(active),
    overlay: false
  });
}

export {
  findConfiguredStatus,
  setConfiguredStatus,
  statusLabel
};
