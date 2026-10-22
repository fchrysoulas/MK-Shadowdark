const pending = new WeakSet();

export function queueLinkedSheetRefresh(sheet) {
  if (!sheet?.rendered || typeof sheet.render !== "function" || pending.has(sheet)) return false;
  pending.add(sheet);
  // Embedded item batches can emit several Actor and Item notifications together.
  globalThis.setTimeout(() => {
    pending.delete(sheet);
    if (!sheet.rendered) return;
    try {
      void Promise.resolve(sheet.render(false)).catch(reportError);
    } catch (error) {
      reportError(error);
    }
  }, 50);
  return true;
}

function reportError(error) {
  console.error("mk-shadowdark | Linked sheet refresh failed", error);
}
