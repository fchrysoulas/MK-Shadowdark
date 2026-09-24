import assert from "node:assert/strict";
import test from "node:test";

import {
  bindOverviewToolSources,
  GM_SCREEN_SETTINGS_TABS,
  SETTINGS_APP_ID,
  buildSettingsViewModel,
  normalizeSettingsTab,
} from "../scripts/gm-screen/gm-screen-settings.js";

test("GM Screen Settings exposes generator tabs in the left rail", () => {
  assert.deepEqual(GM_SCREEN_SETTINGS_TABS.map(tab => tab.id), ["home", "encounters", "compositions", "tavern-generator"]);
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "compositions")?.label, "NPC Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "tavern-generator")?.label, "Tavern Generator");
  assert.equal(SETTINGS_APP_ID, "mk-shadowdark-gm-screen-settings");

  const view = buildSettingsViewModel("compositions");
  assert.equal(view.activeTab, "compositions");
  assert.equal(view.tabs.find(tab => tab.id === "compositions")?.active, true);
  assert.equal(view.tabs.find(tab => tab.id === "home")?.active, false);
});

test("GM Screen Settings falls back to Home for unknown tabs", () => {
  assert.equal(normalizeSettingsTab("missing"), "home");
  assert.equal(normalizeSettingsTab(" COMPOSITIONS "), "compositions");
  assert.equal(normalizeSettingsTab(" TAVERN-GENERATOR "), "tavern-generator");
  assert.equal(buildSettingsViewModel("missing").activeTab, "home");
});

test("GM Screen Settings exposes Overview tool drag data without relying on an application id", () => {
  const previousGame = globalThis.game;
  const listeners = {};
  const button = {
    dataset: { mkGmOverviewTool: "encounters" },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const element = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-mk-gm-overview-tool]");
      return [button];
    },
  };
  const values = new Map();
  const dataTransfer = {
    effectAllowed: "",
    setData(type, value) {
      values.set(type, value);
    },
  };

  globalThis.game = { user: { isGM: true } };
  try {
    assert.equal(bindOverviewToolSources(null, element), true);
    listeners.dragstart({ dataTransfer });
  } finally {
    globalThis.game = previousGame;
  }

  assert.equal(dataTransfer.effectAllowed, "copy");
  assert.equal(JSON.parse(values.get("application/json")).uuid, "mk-shadowdark.gm-screen-tool:encounters");
  assert.equal(values.get("text/uri-list"), "mk-shadowdark.gm-screen-tool:encounters");
});
