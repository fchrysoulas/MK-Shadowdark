import assert from "node:assert/strict";
import test from "node:test";

import {
  bindQuickActionToggles,
  GM_SCREEN_SETTINGS_TABS,
  SETTINGS_APP_ID,
  buildSettingsViewModel,
  normalizeSettingsTab,
} from "../scripts/gm-screen/gm-screen-settings.js";

test("GM Screen Settings exposes generator tabs in the left rail", () => {
  assert.deepEqual(GM_SCREEN_SETTINGS_TABS.map(tab => tab.id), ["home", "encounters", "trap-generator", "hazard-generator", "compositions", "monster-generator", "magic-item-generator", "tavern-generator", "shop-generator", "location-generator"]);
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "trap-generator")?.label, "Trap Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "hazard-generator")?.label, "Hazard Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "compositions")?.label, "NPC Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "monster-generator")?.label, "Monster Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "magic-item-generator")?.label, "Magic Item Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "tavern-generator")?.label, "Tavern Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "shop-generator")?.label, "Shop Generator");
  assert.equal(GM_SCREEN_SETTINGS_TABS.find(tab => tab.id === "location-generator")?.label, "Location Generator");
  assert.equal(SETTINGS_APP_ID, "mk-shadowdark-gm-screen-settings");

  const view = buildSettingsViewModel("compositions");
  assert.equal(view.activeTab, "compositions");
  assert.equal(view.tabs.find(tab => tab.id === "compositions")?.active, true);
  assert.equal(view.tabs.find(tab => tab.id === "home")?.active, false);
  assert.deepEqual(view.homeFeatures.map(feature => feature.overviewTool), [
    "encounters",
    "trap-generator",
    "hazard-generator",
    "npc-generator",
    "monster-generator",
    "magic-item-generator",
    "tavern-generator",
    "shop-generator",
    "location-generator",
  ]);
  assert.ok(view.homeFeatures.every(feature => feature.quickActionEnabled));

  const filteredView = buildSettingsViewModel("home", {
    getFlag(_moduleId, key) {
      assert.equal(key, "gmScreenQuickActions");
      return ["encounters", "tavern-generator"];
    },
  });
  assert.equal(filteredView.homeFeatures.find(feature => feature.overviewTool === "encounters")?.quickActionEnabled, true);
  assert.equal(filteredView.homeFeatures.find(feature => feature.overviewTool === "trap-generator")?.quickActionEnabled, false);
});

test("GM Screen Settings falls back to Home for unknown tabs", () => {
  assert.equal(normalizeSettingsTab("missing"), "home");
  assert.equal(normalizeSettingsTab(" COMPOSITIONS "), "compositions");
  assert.equal(normalizeSettingsTab(" TAVERN-GENERATOR "), "tavern-generator");
  assert.equal(normalizeSettingsTab(" SHOP-GENERATOR "), "shop-generator");
  assert.equal(normalizeSettingsTab(" LOCATION-GENERATOR "), "location-generator");
  assert.equal(normalizeSettingsTab(" MONSTER-GENERATOR "), "monster-generator");
  assert.equal(normalizeSettingsTab(" MAGIC-ITEM-GENERATOR "), "magic-item-generator");
  assert.equal(buildSettingsViewModel("missing").activeTab, "home");
});

test("GM Screen Settings toggles Quick Action visibility without drag sources", async () => {
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  const listeners = {};
  const writes = [];
  const toggle = {
    dataset: { mkGmQuickActionToggle: "encounters" },
    checked: false,
    disabled: false,
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const element = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-mk-gm-quick-action-toggle]");
      return [toggle];
    },
  };
  globalThis.game = {
    user: {
      isGM: true,
      getFlag() {
        return ["encounters", "trap-generator", "hazard-generator", "npc-generator", "tavern-generator"];
      },
      async setFlag(moduleId, key, value) {
        writes.push({ moduleId, key, value });
      },
    },
  };
  globalThis.ui = { notifications: { error: () => {} } };

  try {
    assert.equal(bindQuickActionToggles({ id: SETTINGS_APP_ID }, element), true);
    assert.equal(listeners.dragstart, undefined);
    await listeners.change({ target: toggle });
  } finally {
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
  }

  assert.deepEqual(writes, [{
    moduleId: "mk-shadowdark",
    key: "gmScreenQuickActions",
    value: ["trap-generator", "hazard-generator", "npc-generator", "tavern-generator"],
  }]);
  assert.equal(toggle.disabled, false);
});
