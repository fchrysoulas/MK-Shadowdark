import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const summaryBar = fs.readFileSync(path.join(ROOT, "scripts/summary-bar/summary-bar.js"), "utf8");
const summaryBarCss = fs.readFileSync(path.join(ROOT, "styles/summary-bar.css"), "utf8");
const settings = fs.readFileSync(path.join(ROOT, "scripts/libs/settings.js"), "utf8");
const retiredSettings = fs.readFileSync(path.join(ROOT, "scripts/libs/retired-settings.js"), "utf8");

test("Summary Bar shortcut visibility is a per-player flag with twelve fixed slots", () => {
  assert.match(summaryBar, /const SHORTCUT_ROW_FLAG = "summaryBarShortcutRowEnabled";/);
  assert.match(summaryBar, /const SHORTCUT_SLOT_COUNT = 12;/);
  assert.match(summaryBar, /user\.setFlag\(MODULE_ID, SHORTCUT_ROW_FLAG, enabled\)/);
  assert.doesNotMatch(summaryBar, /SHORTCUT_COUNT|SETTINGS\.SHORTCUT_ROW/);
});

test("legacy global shortcut settings are removed from configuration and retired", () => {
  for (const key of [
    "characterSheetTweaksSummaryBarShortcutRow",
    "characterSheetTweaksSummaryBarShortcutCount"
  ]) {
    assert.doesNotMatch(settings, new RegExp(`registerSetting\\(\\"${key}\\"`));
    assert.match(retiredSettings, new RegExp(`\\"${key}\\"`));
  }
});

test("enabled shortcut layout uses a fixed 130px header and lifts the title and main bar", () => {
  assert.match(summaryBarCss, /mk-summary-bar-in-header \.SD-header\s*\{[\s\S]*?min-height: 130px;/);
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts \.SD-header\s*\{\s*min-height: 130px;/);
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts \.SD-header \.SD-title[\s\S]*?transform: translateY\(-22px\)/);
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts \.SD-header \.mk-character-sheet-bar\.mk-in-header[\s\S]*?bottom: calc\(10px \+ 2\.3rem\)/);
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts \.SD-header \.mk-character-sheet-bar__shortcuts[\s\S]*?position: absolute[\s\S]*?top: 100%/);
});

test("Summary Bar position settings are removed and its position is fixed", () => {
  for (const key of [
    "characterSheetTweaksBarPositionX",
    "characterSheetTweaksBarPositionY"
  ]) {
    assert.doesNotMatch(settings, new RegExp(`registerSetting\\(\\"${key}\\"`));
    assert.match(retiredSettings, new RegExp(`\\"${key}\\"`));
  }
  assert.doesNotMatch(summaryBar, /POSITION_X|POSITION_Y/);
  assert.match(summaryBarCss, /mk-character-sheet-bar\.mk-in-header[\s\S]*?left: clamp\(141px, 10%, 108px\);[\s\S]*?right: 5px;[\s\S]*?bottom: 10px;/);
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts[\s\S]*?bottom: calc\(10px \+ 2\.3rem\)/);
});

test("empty shortcut plus indicators only appear while a slot is being dragged over", () => {
  assert.match(summaryBarCss, /\.mk-summary-shortcut\.is-empty\s*>\s*\.fa-plus\s*\{[\s\S]*?visibility: hidden;/);
  assert.match(summaryBarCss, /\.mk-summary-shortcut\.is-empty\.is-drag-over\s*>\s*\.fa-plus\s*\{[\s\S]*?visibility: visible;/);
});

test("shortcut row has no border and a one-pixel top margin", () => {
  assert.match(summaryBarCss, /mk-summary-bar-has-shortcuts \.SD-header \.mk-character-sheet-bar__shortcuts[\s\S]*?margin-top: 1px;[\s\S]*?border: none;/);
});

test("shortcut row toggle uses the requested compact square dimensions", () => {
  assert.match(summaryBarCss, /mk-summary-bar-shortcut-toggle[\s\S]*?width: 22px;[\s\S]*?height: 21px;[\s\S]*?border-radius: 0;/);
});
