import { onCharacterSheetRender } from "../libs/sheet-render-adapter.js";

const MODULE_ID = "mk-shadowdark";
const FLAG_KEY = "dtp";
const FLAG_PATH = `flags.${MODULE_ID}.${FLAG_KEY}`;

function getDtp(actor) {
  const value = Number(actor?.getFlag?.(MODULE_ID, FLAG_KEY) ?? actor?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function canEditDtp(app) {
  return globalThis.game?.user?.isGM === true && app?.isEditable !== false;
}

async function saveDtp(actor, value) {
  if (globalThis.game?.user?.isGM !== true || actor?.type !== "Player") return false;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return false;
  await actor.setFlag(MODULE_ID, FLAG_KEY, number);
  return true;
}

function changesDtp(change, { recursive = true } = {}, prefix = "") {
  if (!change || typeof change !== "object") return false;
  return Object.entries(change).some(([key, value]) => {
    const deletion = key.split(".").some(part => part.startsWith("-="));
    const path = [prefix, key].filter(Boolean).join(".").replace(/(^|\.)-=/g, "$1");
    if (path === FLAG_PATH || path.startsWith(`${FLAG_PATH}.`)) return true;
    if (!FLAG_PATH.startsWith(`${path}.`)) return false;
    if (deletion || !recursive || !value || typeof value !== "object") return true;
    return changesDtp(value, { recursive }, path);
  });
}

function guardDtpUpdate(actor, change, options) {
  if (globalThis.game?.system?.id !== "shadowdark" || actor?.type !== "Player") return;
  if (globalThis.game?.user?.isGM === true || !changesDtp(change, options)) return;
  return false;
}

function renderDtp(app, html) {
  const actor = app?.actor ?? app?.object;
  const root = html?.[0] ?? html;
  if (globalThis.game?.system?.id !== "shadowdark" || actor?.type !== "Player" || !root?.querySelector) return;

  const grid = root.querySelector(".tab-details .background-grid-a");
  if (!grid) return;
  const languages = [...grid.children].find(child => child.querySelector('[for="system.languages"], .tags'));
  if (!languages) return;

  let box = grid.querySelector(".mk-dtp-box");
  if (!box) {
    const document = grid.ownerDocument;
    box = document.createElement("div");
    box.className = "SD-box mk-dtp-box";
    const header = document.createElement("div");
    header.className = "header";
    const label = document.createElement("label");
    label.textContent = globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.label") ?? "DTP";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "ability-score";
    input.min = "0";
    input.step = "1";
    input.placeholder = "0";
    input.setAttribute("aria-label", label.textContent);
    // The GM-owned flag is saved separately from ordinary sheet form submissions.
    input.addEventListener("change", async event => {
      event.stopPropagation();
      if (!canEditDtp(app) || !input.validity.valid) {
        input.value = String(getDtp(actor));
        return;
      }
      try {
        if (!await saveDtp(actor, input.value)) input.value = String(getDtp(actor));
      } catch (error) {
        input.value = String(getDtp(actor));
        globalThis.ui?.notifications?.error?.(globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.saveFailed") ?? "Could not save DTP.");
        console.error(`${MODULE_ID} | DTP | save failed`, error);
      }
    });
    const content = document.createElement("div");
    content.className = "content centered";
    content.append(input);
    header.append(label, document.createElement("span"));
    box.append(header, content);
    grid.insertBefore(box, languages);
  }

  const input = box.querySelector("input");
  input.value = String(getDtp(actor));
  input.readOnly = !canEditDtp(app);
  input.title = globalThis.game?.i18n?.localize?.("MK_SHADOWDARK.dtp.gmOnly") ?? "Only the GM can edit DTP.";
  // Preserve the native Patron column even when an observer has no edit links.
  languages.dataset.mkDtpColumns ??= String(Math.max(1,
    Number(languages.style.gridColumn.match(/span\s+(\d+)/)?.[1] ?? 3) - 1));
  languages.style.gridColumn = `span ${languages.dataset.mkDtpColumns}`;
}

onCharacterSheetRender("DTP", renderDtp, { priority: 15 });
globalThis.Hooks?.on?.("preUpdateActor", guardDtpUpdate);

export { canEditDtp, changesDtp, getDtp, guardDtpUpdate, renderDtp, saveDtp };
