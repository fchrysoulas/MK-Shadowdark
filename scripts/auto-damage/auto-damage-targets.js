function uniqueUuids(values) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const uuid = String(value ?? "").trim();
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    result.push(uuid);
  }

  return result;
}

function shadowdarkRollConfig(message) {
  return message?.rollConfig
    ?? message?.flags?.shadowdark?.rollConfig
    ?? message?._source?.flags?.shadowdark?.rollConfig
    ?? null;
}

function extractShadowdarkTargetUuids(message) {
  const config = shadowdarkRollConfig(message);
  if (!config || typeof config !== "object") return [];

  const values = [];
  if (typeof config.targetUuid === "string") values.push(config.targetUuid);
  if (Array.isArray(config.targetUuids)) values.push(...config.targetUuids);
  return uniqueUuids(values);
}

function tokenUuid(target) {
  return target?.document?.uuid
    ?? target?.uuid
    ?? target?.object?.document?.uuid
    ?? null;
}

function snapshotTargetUuids(message, author) {
  const nativeTargets = extractShadowdarkTargetUuids(message);
  if (nativeTargets.length) return nativeTargets;

  return uniqueUuids(
    Array.from(author?.targets ?? [], target => tokenUuid(target))
  );
}

function storedTargetUuids(message, moduleId = "mk-shadowdark") {
  try {
    const stored = message?.getFlag?.(moduleId, "autoDamageTargetUuids");
    if (Array.isArray(stored)) return uniqueUuids(stored);
  } catch (_error) {
    // Fall through to raw source data.
  }

  const raw = message?.flags?.[moduleId]?.autoDamageTargetUuids
    ?? message?._source?.flags?.[moduleId]?.autoDamageTargetUuids;
  return Array.isArray(raw) ? uniqueUuids(raw) : null;
}

async function resolveTargetDocuments(uuids, resolver = globalThis.fromUuid) {
  if (typeof resolver !== "function") return [];

  const resolved = [];
  for (const uuid of uniqueUuids(uuids)) {
    try {
      const document = await resolver(uuid);
      if (document) resolved.push(document);
    } catch (_error) {
      // A deleted or inaccessible target should not abort the other targets.
    }
  }
  return resolved;
}

export {
  extractShadowdarkTargetUuids,
  resolveTargetDocuments,
  snapshotTargetUuids,
  storedTargetUuids,
  uniqueUuids
};
