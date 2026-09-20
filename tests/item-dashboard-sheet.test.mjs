import test from "node:test";
import assert from "node:assert/strict";

test("dashboard item sheet registers as the native-styled default item sheet when enabled", async () => {
  const hooks = new Map();
  let registration;
  class NativeItemSheet {
    static get defaultOptions() { return { native: true, classes: ["shadowdark", "sheet", "item"] }; }
  }

  globalThis.Hooks = { once: (name, callback) => hooks.set(name, callback) };
  globalThis.game = {
    system: { id: "shadowdark", sheets: { ItemSheetSD: NativeItemSheet } },
    i18n: { localize: key => key },
    settings: { get: () => true }
  };
  globalThis.foundry = {
    utils: { mergeObject: (base, options) => ({ ...base, ...options }) },
    documents: { collections: { Items: { registerSheet: (...args) => { registration = args; } } } }
  };

  await import("../scripts/item-dashboard/item-dashboard.js");
  hooks.get("init")();

  const [scope, Sheet, options] = registration;
  assert.equal(scope, "mk-shadowdark");
  assert.equal(options.makeDefault, true);
  assert.equal(options.label, "MK_SHADOWDARK.dashboard.itemSheetName");
  assert.ok(Sheet.prototype instanceof NativeItemSheet);
  assert.deepEqual(Sheet.defaultOptions.classes, ["shadowdark", "sheet", "item", "mk-dashboard-item-sheet"]);
  assert.equal(Sheet.defaultOptions.width, 720);
  assert.equal(Sheet.defaultOptions.height, 680);
});

test("dashboard item sheet does not register when the Character Dashboard is disabled", async () => {
  const hooks = new Map();
  let registration;
  class NativeItemSheet {}

  globalThis.Hooks = { once: (name, callback) => hooks.set(name, callback) };
  globalThis.game = {
    system: { id: "shadowdark", sheets: { ItemSheetSD: NativeItemSheet } },
    i18n: { localize: key => key },
    settings: { get: () => false }
  };
  globalThis.foundry = {
    utils: { mergeObject: (base, options) => ({ ...base, ...options }) },
    documents: { collections: { Items: { registerSheet: (...args) => { registration = args; } } } }
  };

  await import("../scripts/item-dashboard/item-dashboard.js?disabled");
  hooks.get("init")();

  assert.equal(registration, undefined);
});
