import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { bindSheetThemeToggle, getSheetTheme, toggleSheetTheme } from "../scripts/libs/sheet-themes.js";

const translations = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));

function fixture(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  globalThis.game = {
    user: { isGM: false },
    i18n: { localize: key => translations[key] ?? key },
    settings: {
      get(module, key) { assert.equal(module, "mk-shadowdark"); return values.get(key); },
      async set(module, key, value) { writes.push({ module, key, value }); values.set(key, value); },
    },
  };
  return { values, writes };
}

test("sheet themes default to Dark before settings are ready and reject invalid stored values", () => {
  for (const game of [undefined, {}, { settings: { get() { throw new Error("not ready"); } } }]) {
    globalThis.game = game;
    for (const kind of ["group", "bastion", "boat"]) {
      const theme = getSheetTheme(kind);
      assert.equal(theme.value, "dark");
      assert.equal(theme.isLight, false);
      assert.equal(theme.toggleIcon, "fa-sun");
      assert.equal(theme.toggleLabel, "Switch to Light theme");
    }
  }
  fixture({ groupSheetTheme: "unknown" });
  assert.equal(getSheetTheme("group").value, "dark");
});

test("toggling a sheet saves only its own client preference and supports both directions", async () => {
  const { writes } = fixture({ groupSheetTheme: "dark", bastionSheetTheme: "light" });
  assert.equal(await toggleSheetTheme("group"), "light");
  assert.equal(getSheetTheme("bastion").value, "light");
  assert.deepEqual(getSheetTheme("group").classes, ["mk-themed-sheet", "mk-sheet-theme-light"]);
  assert.equal(getSheetTheme("group").toggleIcon, "fa-moon");
  assert.equal(getSheetTheme("group").toggleLabel, translations["MK_SHADOWDARK.sheetTheme.switchDark"]);
  assert.equal(await toggleSheetTheme("bastion"), "dark");
  assert.equal(getSheetTheme("group").value, "light");
  assert.equal(await toggleSheetTheme("group"), "dark");
  assert.deepEqual(writes, [
    { module: "mk-shadowdark", key: "groupSheetTheme", value: "light" },
    { module: "mk-shadowdark", key: "bastionSheetTheme", value: "dark" },
    { module: "mk-shadowdark", key: "groupSheetTheme", value: "dark" },
  ]);
  for (const kind of ["unknown", "__proto__", undefined]) {
    await assert.rejects(toggleSheetTheme(kind), /Unknown sheet theme/);
  }
  assert.equal(writes.length, 3);
});

test("observers can use the theme button while editing controls remain disabled", async () => {
  const { writes } = fixture();
  const listeners = new Map();
  const button = {
    disabled: true, isConnected: true,
    removeAttribute(name) { assert.equal(name, "disabled"); },
    addEventListener(event, listener) { listeners.set(event, listener); },
  };
  const editor = { disabled: true };
  bindSheetThemeToggle({ jquery: true, 0: {
    querySelectorAll(selector) { assert.equal(selector, "[data-action='toggle-sheet-theme']"); return [button]; },
  } }, "bastion");
  assert.equal(button.disabled, false);
  let prevented = 0;
  await listeners.get("click")({ preventDefault() { prevented++; }, stopPropagation() { prevented++; } });
  assert.equal(prevented, 2);
  assert.equal(button.disabled, false);
  assert.equal(editor.disabled, true);
  assert.deepEqual(writes, [{ module: "mk-shadowdark", key: "bastionSheetTheme", value: "light" }]);
  button.disabled = true;
  bindSheetThemeToggle({ nodeType: 1, 0: editor, querySelectorAll: () => [button] }, "bastion");
  assert.equal(button.disabled, false, "A native form's indexed input must not replace the form root");
});

test("shared settings register separate client themes and refresh open actor sheets on change", () => {
  const registered = new Map();
  let init;
  const renders = [];
  const context = {
    console, Boolean, Number, String,
    Hooks: { once(event, callback) { assert.equal(event, "init"); init = callback; } },
    game: {
      i18n: { localize: key => translations[key] ?? key },
      modules: { get: () => ({ version: "test" }) },
      settings: {
        settings: registered,
        register(module, key, data) { registered.set(`${module}.${key}`, data); },
        get: () => undefined,
      },
    },
    ui: { windows: {
      group: { actor: {}, render(force) { renders.push(["group", force]); } },
      bastion: { object: { documentName: "Actor" }, render(force) { renders.push(["bastion", force]); } },
      other: { render() { assert.fail("Non-actor applications should not refresh"); } },
    } },
  };
  vm.runInNewContext(readFileSync(new URL("../scripts/libs/settings.js", import.meta.url), "utf8"), context);
  init();
  for (const key of ["groupSheetTheme", "bastionSheetTheme", "boatSheetTheme"]) {
    const setting = registered.get(`mk-shadowdark.${key}`);
    assert.equal(setting.scope, "client");
    assert.equal(setting.default, "dark");
    assert.equal(setting.type, String);
    assert.deepEqual(Object.keys(setting.choices), ["dark", "light"]);
    assert.ok(translations[setting.name]);
    assert.ok(translations[setting.hint]);
    setting.onChange("light");
  }
  assert.deepEqual(renders, [["group", false], ["bastion", false], ["group", false], ["bastion", false], ["group", false], ["bastion", false]]);
});
