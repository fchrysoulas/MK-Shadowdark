const MODULE_ID = "mk-shadowdark";
const PINNED_DOCUMENTS_FLAG = "gmScreenOverviewLinks";
const PINNED_DOCUMENTS_REFRESH_HOOK = "mk-shadowdark.gm-screen-document-pinned";
const MAX_PINNED_DOCUMENTS = 100;

function normalizePinnedDocumentUuids(values) {
  const source = Array.isArray(values) ? values : [];
  return [...new Set(source
    .map(value => String(value ?? "").trim())
    .filter(Boolean))]
    .slice(0, MAX_PINNED_DOCUMENTS);
}

function rawPinnedDocumentFlag(user) {
  return user?._source?.flags?.[MODULE_ID]?.[PINNED_DOCUMENTS_FLAG]
    ?? user?.flags?.[MODULE_ID]?.[PINNED_DOCUMENTS_FLAG];
}

function getPinnedDocumentUuids(user = globalThis.game?.user) {
  if (!user) return [];
  let value;
  try {
    value = user.getFlag?.(MODULE_ID, PINNED_DOCUMENTS_FLAG);
  } catch (_error) {
    value = undefined;
  }
  if (value === undefined) value = rawPinnedDocumentFlag(user);
  return normalizePinnedDocumentUuids(value);
}

async function setPinnedDocumentUuids(values, user = globalThis.game?.user) {
  const normalized = normalizePinnedDocumentUuids(values);
  if (!user?.setFlag) return normalized;
  await user.setFlag(MODULE_ID, PINNED_DOCUMENTS_FLAG, normalized);
  return normalized;
}

async function pinDocument(document, user = globalThis.game?.user) {
  const uuid = String(document?.uuid ?? "").trim();
  const current = getPinnedDocumentUuids(user);
  if (!uuid || !user?.isGM || current.includes(uuid)) return current;

  try {
    const next = await setPinnedDocumentUuids([...current, uuid], user);
    globalThis.Hooks?.callAll?.(PINNED_DOCUMENTS_REFRESH_HOOK, uuid, document, user);
    return next;
  } catch (error) {
    console.error("mk-shadowdark | GM Screen | Failed to pin generated document", error);
    return current;
  }
}

export {
  MODULE_ID,
  PINNED_DOCUMENTS_FLAG,
  PINNED_DOCUMENTS_REFRESH_HOOK,
  MAX_PINNED_DOCUMENTS,
  normalizePinnedDocumentUuids,
  getPinnedDocumentUuids,
  setPinnedDocumentUuids,
  pinDocument,
};
