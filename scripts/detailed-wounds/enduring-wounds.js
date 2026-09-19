const ENDURING_WOUNDS_FAILURE = Object.freeze({
  MISSING_TABLE: "missing-table",
  INVALID_TABLE: "invalid-table",
  EMPTY_TABLE: "empty-table",
  DRAW_FAILED: "draw-failed"
});

function normalizeTableUuid(value) {
  return String(value ?? "").trim();
}

function validateEnduringWoundsTable(table) {
  if (!table) return ENDURING_WOUNDS_FAILURE.MISSING_TABLE;
  if (table.documentName !== "RollTable" || typeof table.draw !== "function") {
    return ENDURING_WOUNDS_FAILURE.INVALID_TABLE;
  }
  return "";
}

async function resolveEnduringWoundsTable(tableUuid, {
  resolver = globalThis.fromUuid
} = {}) {
  const uuid = normalizeTableUuid(tableUuid);
  if (!uuid) {
    return {
      table: null,
      tableUuid: "",
      reason: ENDURING_WOUNDS_FAILURE.MISSING_TABLE
    };
  }

  if (typeof resolver !== "function") {
    return {
      table: null,
      tableUuid: uuid,
      reason: ENDURING_WOUNDS_FAILURE.INVALID_TABLE
    };
  }

  let table = null;
  try {
    table = await resolver(uuid);
  } catch (_error) {
    return {
      table: null,
      tableUuid: uuid,
      reason: ENDURING_WOUNDS_FAILURE.INVALID_TABLE
    };
  }

  const reason = validateEnduringWoundsTable(table);
  return {
    table: reason ? null : table,
    tableUuid: uuid,
    reason
  };
}

async function drawEnduringWound(tableUuid, {
  resolver = globalThis.fromUuid
} = {}) {
  const resolved = await resolveEnduringWoundsTable(tableUuid, { resolver });
  if (resolved.reason) {
    return {
      ...resolved,
      draw: null
    };
  }

  try {
    const draw = await resolved.table.draw({
      displayChat: true,
      recursive: false
    });
    const results = Array.from(draw?.results ?? []);
    if (!results.length) {
      return {
        ...resolved,
        draw,
        reason: ENDURING_WOUNDS_FAILURE.EMPTY_TABLE
      };
    }

    return {
      ...resolved,
      draw,
      reason: ""
    };
  } catch (error) {
    return {
      ...resolved,
      draw: null,
      error,
      reason: ENDURING_WOUNDS_FAILURE.DRAW_FAILED
    };
  }
}

export {
  ENDURING_WOUNDS_FAILURE,
  drawEnduringWound,
  normalizeTableUuid,
  resolveEnduringWoundsTable,
  validateEnduringWoundsTable
};
