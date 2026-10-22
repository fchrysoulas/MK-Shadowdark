import { getSpellTemplate, normalizeTemplate, storedSpellTemplate, TEMPLATE_FLAG, TEMPLATE_MODES } from "./config.js";

const MODULE_ID = "mk-shadowdark";
const pending = new WeakMap();
export function templateText(key, values, environment = globalThis) {
  const full = `MK_SHADOWDARK.spellTemplates.${key}`;
  return values ? environment.game?.i18n?.format?.(full, values) ?? full : environment.game?.i18n?.localize?.(full) ?? full;
}

export function describeTemplate(template, environment = globalThis) {
  return template.shape === "path" ? templateText("pathSummary", { length: template.length, feet: template.length * 5 }, environment)
    : template.shape === "circle" ? templateText("circleSummary", { length: template.length, feet: template.length * 5 }, environment)
    : templateText("summary", { shape: templateText(template.shape, undefined, environment), length: template.length, width: template.width }, environment);
}

export function canEditTemplate(item, editable = true) {
  return String(item?.type).toLowerCase() === "spell" && editable !== false
    && (globalThis.game?.user?.isGM || item?.isOwner === true);
}

export async function updateSpellTemplate(item, field, value, editable = true) {
  if (!canEditTemplate(item, editable) || !["mode", "length", "width", "origin", "color", "excludeCaster", "animate"].includes(field)) return false;
  const update = (pending.get(item) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!canEditTemplate(item, editable)) return false;
    const current = storedSpellTemplate(item);
    const defaults = getSpellTemplate(item) ?? normalizeTemplate({ mode: field === "mode" ? value : "cube" });
    const data = normalizeTemplate({ ...defaults, ...current, [field]: value });
    delete data.shape;
    await item.setFlag(MODULE_ID, TEMPLATE_FLAG, data);
    return true;
  });
  pending.set(item, update);
  try { return await update; } finally { if (pending.get(item) === update) pending.delete(item); }
}

export function renderSpellTemplateSettings(app, html) {
  const item = app?.item ?? app?.object;
  const root = html?.[0] ?? html;
  if (globalThis.game?.system?.id !== "shadowdark" || String(item?.type).toLowerCase() !== "spell" || !root?.querySelector) return;
  const grid = root.querySelector('.tab[data-tab="tab-details"] .grid-3-columns');
  if (!grid) return;
  grid.querySelector(".mk-spell-template-settings")?.remove();
  const document = grid.ownerDocument;
  const panel = document.createElement("section");
  panel.className = "mk-spell-template-settings";
  const title = document.createElement("h3");
  title.textContent = templateText("title");
  const controls = document.createElement("div");
  controls.className = "mk-spell-template-fields";
  const stored = normalizeTemplate(storedSpellTemplate(item));
  const template = getSpellTemplate(item);
  const add = (field, type, value, options) => {
    const label = document.createElement("label");
    const caption = document.createElement("span");
    caption.textContent = templateText(field);
    const input = document.createElement(options ? "select" : "input");
    input.dataset.spellTemplateField = field;
    if (options) for (const choice of options) {
      const option = document.createElement("option");
      option.value = choice;
      option.textContent = templateText(choice);
      input.append(option);
    }
    else input.type = type;
    if (type === "checkbox") input.checked = value;
    else input.value = String(value);
    if (type === "number") { input.min = "1"; input.max = "60"; input.step = "1"; }
    input.disabled = !canEditTemplate(item, app.isEditable);
    input.addEventListener("change", event => {
      event.stopPropagation();
      input.disabled = true;
      void updateSpellTemplate(item, field, type === "checkbox" ? input.checked : input.value, app.isEditable)
        .then(() => renderSpellTemplateSettings(app, root)).catch(error => {
          console.error(`${MODULE_ID} | Spell template settings`, error);
          globalThis.ui?.notifications?.error(templateText("saveError"));
          renderSpellTemplateSettings(app, root);
        });
    });
    label.append(caption, input);
    controls.append(label);
  };
  add("mode", "select", stored.mode, TEMPLATE_MODES);
  if (!["auto", "none"].includes(stored.mode)) {
    add("length", "number", template.length);
    if (["line", "wall"].includes(stored.mode)) add("width", "number", template.width);
    if (stored.mode !== "path") add("origin", "select", template.origin, ["point", "caster"]);
    add("color", "color", template.color);
    if (stored.mode === "path") add("animate", "checkbox", template.animate);
    if (stored.mode !== "path") add("excludeCaster", "checkbox", template.excludeCaster);
  }
  const hint = document.createElement("p");
  hint.className = "mk-spell-template-hint";
  hint.textContent = template ? describeTemplate(template) : templateText("manualHint");
  const help = document.createElement("p");
  help.className = "mk-spell-template-hint";
  help.textContent = templateText("settingsHint");
  panel.append(title, controls, hint, help);
  grid.append(panel);
}

export function registerSpellTemplateSettings(hooks = globalThis.Hooks) {
  for (const name of ["renderItemSheet", "renderItemSheetSD", "renderMKDashboardItemSheet", "renderShadowdarkItemSheet",
    "renderShadowdarkItemSheetV2", "renderItemSheetShadowdark"]) hooks?.on?.(name, renderSpellTemplateSettings);
}
