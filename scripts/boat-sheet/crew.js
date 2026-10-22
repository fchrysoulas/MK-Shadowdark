function getBoatCrew(actor) {
  const seen = new Set();
  return Array.from(actor?.system?.crew ?? []).flatMap(entry => {
    const actorUuid = String(entry?.actorUuid ?? "").trim();
    if (!actorUuid || actorUuid === actor?.uuid || seen.has(actorUuid)) return [];
    seen.add(actorUuid);
    return [{ actorUuid, name: String(entry.name ?? ""), role: String(entry.role ?? "") }];
  });
}

async function resolveCrewActor(uuid) {
  if (!uuid || typeof globalThis.fromUuid !== "function") return null;
  try {
    const document = await globalThis.fromUuid(uuid);
    const actor = document?.documentName === "Token" ? document.actor : document;
    return actor?.documentName === "Actor" && ["Player", "NPC"].includes(actor.type)
      && actor.visible !== false && !actor.getFlag?.("mk-shadowdark", "isGroup") ? actor : null;
  } catch (_error) {
    // Keep unavailable links removable without preventing the rest of the crew from rendering.
    return null;
  }
}

async function buildBoatCrewData(actor) {
  return Promise.all(getBoatCrew(actor).map(async entry => {
    const linked = await resolveCrewActor(entry.actorUuid);
    return { ...entry, name: linked?.name ?? entry.name, img: linked?.img ?? "icons/svg/mystery-man.svg", available: Boolean(linked) };
  }));
}

export { getBoatCrew, resolveCrewActor, buildBoatCrewData };
