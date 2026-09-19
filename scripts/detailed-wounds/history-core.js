const MAX_WOUND_HISTORY_ENTRIES = 12;
const MAX_WOUND_HISTORY_NOTE_LENGTH = 160;

function clonePlain(value) {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

function compactText(value, maximum = MAX_WOUND_HISTORY_NOTE_LENGTH) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function nullableText(value, maximum = MAX_WOUND_HISTORY_NOTE_LENGTH) {
  const text = compactText(value, maximum);
  return text || null;
}

function normalizeHistoryEntry(value, index = 0) {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;

  const timestampValue = Number(value.timestamp);
  const timestamp = Number.isFinite(timestampValue) && timestampValue > 0
    ? Math.floor(timestampValue)
    : null;
  const note = nullableText(value.note ?? value.source);
  const fromStatus = nullableText(value.fromStatus, 40);
  const toStatus = nullableText(value.toStatus, 40);
  const fromLabel = nullableText(value.fromLabel, 80);
  const toLabel = nullableText(value.toLabel, 80);
  const outcomeKey = nullableText(value.outcomeKey, 80);
  const kind = nullableText(value.kind, 40) ?? "transition";

  if (!note && !fromStatus && !toStatus && !fromLabel && !toLabel && !outcomeKey) return null;

  const id = nullableText(value.id, 120)
    ?? `history-${timestamp ?? 0}-${Math.max(0, Math.floor(Number(index) || 0))}`;

  return {
    id,
    timestamp,
    kind,
    note,
    fromStatus,
    toStatus,
    fromLabel,
    toLabel,
    outcomeKey
  };
}

function normalizeWoundHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => normalizeHistoryEntry(entry, index))
    .filter(Boolean)
    .slice(-MAX_WOUND_HISTORY_ENTRIES);
}

function createHistoryEntry({
  id = null,
  timestamp = Date.now(),
  kind = "transition",
  note = "",
  fromStatus = null,
  toStatus = null,
  fromLabel = null,
  toLabel = null,
  outcomeKey = null
} = {}) {
  const fallbackId = globalThis.crypto?.randomUUID?.()
    ?? `history-${Math.floor(Number(timestamp) || Date.now())}-${Math.random().toString(36).slice(2, 10)}`;

  return normalizeHistoryEntry({
    id: id ?? fallbackId,
    timestamp,
    kind,
    note,
    fromStatus,
    toStatus,
    fromLabel,
    toLabel,
    outcomeKey
  });
}

function withHistory(record, history) {
  const next = clonePlain(record) ?? {};
  const normalized = normalizeWoundHistory(history);
  if (normalized.length) next.history = normalized;
  else delete next.history;
  return next;
}

function appendHistoryEntry(record, entry) {
  const normalizedEntry = normalizeHistoryEntry(entry, normalizeWoundHistory(record?.history).length);
  if (!normalizedEntry) return withHistory(record, record?.history);
  return withHistory(record, [...normalizeWoundHistory(record?.history), normalizedEntry]);
}

function editHistoryEntry(record, entryId, note) {
  const id = compactText(entryId, 120);
  if (!id) return withHistory(record, record?.history);
  const history = normalizeWoundHistory(record?.history).map(entry => (
    entry.id === id
      ? { ...entry, note: nullableText(note) }
      : entry
  ));
  return withHistory(record, history);
}

function removeHistoryEntry(record, entryId) {
  const id = compactText(entryId, 120);
  if (!id) return withHistory(record, record?.history);
  return withHistory(record, normalizeWoundHistory(record?.history).filter(entry => entry.id !== id));
}

function woundMechanicalSignature(record) {
  return JSON.stringify({
    status: String(record?.status ?? "ok").toLowerCase(),
    hits: Math.max(0, Math.floor(Number(record?.hits) || 0)),
    severityRoll: Math.max(0, Math.floor(Number(record?.severityRoll) || 0)),
    resultKey: typeof record?.resultKey === "string" ? record.resultKey : null
  });
}

export {
  MAX_WOUND_HISTORY_ENTRIES,
  MAX_WOUND_HISTORY_NOTE_LENGTH,
  appendHistoryEntry,
  createHistoryEntry,
  editHistoryEntry,
  normalizeHistoryEntry,
  normalizeWoundHistory,
  removeHistoryEntry,
  withHistory,
  woundMechanicalSignature
};