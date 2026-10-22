const MODULE_ID = "mk-shadowdark";
export const TEMPLATE_FLAG = "spellTemplate";
export const TEMPLATE_MODES = ["auto", "none", "cube", "line", "circle", "wall", "path"];
const COLORS = /^#[0-9a-f]{6}$/i;

function dimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.max(1, Math.min(60, Math.round(number))) : fallback;
}

export function normalizeTemplate(value = {}) {
  const mode = TEMPLATE_MODES.includes(value?.mode) ? value.mode : "auto";
  const length = dimension(value?.length, mode === "line" ? 12 : mode === "circle" ? 1 : 6);
  return { mode, shape: mode, length, width: mode === "cube" ? length : mode === "path" ? 1 : dimension(value?.width, 1),
    origin: mode !== "path" && value?.origin === "caster" ? "caster" : "point", excludeCaster: value?.excludeCaster === true,
    areaOnly: mode === "path",
    animate: mode === "path" && value?.animate !== false,
    color: COLORS.test(value?.color) ? value.color : "#d5a65c" };
}

export function inferSpellTemplate(item) {
  if (String(item?.type).toLowerCase() !== "spell") return null;
  const name = String(item.name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const description = String(item.system?.description?.value ?? item.system?.description ?? "")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  if (["firewall", "walloffire"].includes(name) || /contiguous near(?:[- ]sized)? line/.test(description)) {
    return normalizeTemplate({ mode: "path", length: 6, color: "#f47726" });
  }
  if (name === "burninghands" || /circle of flame.*close area around/.test(description)) {
    return normalizeTemplate({ mode: "circle", length: 1, origin: "caster", excludeCaster: true });
  }
  if (name === "lightningbolt" || /straight line.*far distance/.test(description)) {
    return normalizeTemplate({ mode: "line", length: 12, width: 1, origin: "caster", excludeCaster: true });
  }
  if (/\bnear(?:[- ]sized)? cube\b/.test(description)
    || ["fireball", "sleep", "silence", "web", "cloudkill"].includes(name)) {
    return normalizeTemplate({ mode: "cube", length: /double[- ]near/.test(description) ? 12 : 6,
      origin: /extending from you/.test(description) || name === "sleep" ? "caster" : "point" });
  }
  if (name === "wallofforce") return normalizeTemplate({ mode: "wall", length: 6 });
  return null;
}

export function storedSpellTemplate(item) {
  return item?.getFlag?.(MODULE_ID, TEMPLATE_FLAG) ?? item?.flags?.[MODULE_ID]?.[TEMPLATE_FLAG] ?? { mode: "auto" };
}

export function getSpellTemplate(item) {
  if (String(item?.type).toLowerCase() !== "spell") return null;
  const stored = storedSpellTemplate(item);
  const normalized = normalizeTemplate(stored);
  if (normalized.mode === "none") return null;
  return normalized.mode === "auto" ? inferSpellTemplate(item) : normalized;
}

export function spellRangeCells(item) {
  const range = String(item?.system?.range ?? "").trim().toLowerCase();
  return { self: 0, close: 1, near: 6, far: 12, "double near": 12 }[range] ?? Infinity;
}
