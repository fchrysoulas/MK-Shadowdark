// scripts/group-sheet/utils.js

import { MODULE_ID } from "./constants.js";
function sdxGroupLog(...args) {
  console.log(`${MODULE_ID} | GroupSheet |`, ...args);
}

function signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function optionLabel(options, value) {
  return options.find(option => option.value === value)?.label ?? value;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function settingExists(key) {
  return game.settings?.settings?.has(`${MODULE_ID}.${key}`);
}

function getRootElement(html) {
  if (!html) return null;
  if (html instanceof HTMLElement) return html;
  if (html[0] instanceof HTMLElement) return html[0];
  return null;
}

function getDialogFieldValue(html, selector) {
  if (html?.find) return html.find(selector).val();

  const root = getRootElement(html);
  return root?.querySelector?.(selector)?.value;
}
export {
  sdxGroupLog,
  signed,
  clampPercent,
  hasOwn,
  optionLabel,
  escapeHtml,
  numberOrZero,
  clampNumber,
  settingExists,
  getRootElement,
  getDialogFieldValue,
};