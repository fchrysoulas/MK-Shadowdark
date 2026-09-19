import test from "node:test";
import assert from "node:assert/strict";

test("dashboard registers an optional native Player sheet without standard-sheet hooks", async () => {
  const hooks = new Map();
  let registration;
  class NativeSheet {
    static get defaultOptions() { return { native: true }; }
    constructor(actor) { this.actor = actor; }
    async getData() {
      return {
        native: true,
        actor: this.actor,
        characterClass: { name: "Priest" },
        classTitle: "Crusader",
        xpNextLevel: 30,
        backgroundSelectors: {
          background: { item: { name: "Urchin" } },
          ancestry: { item: { name: "Half-Orc" } },
          deity: { item: { name: "Saint Terragnis" } }
        }
      };
    }
    async _onDrop() { return "native-drop"; }
    async _updateObject(_event, formData) { return formData; }
  }
  globalThis.Hooks = { once: (name, callback) => hooks.set(name, callback) };
  globalThis.game = {
    system: { id: "shadowdark", sheets: { PlayerSheetSD: NativeSheet } }, user: { isGM: true },
    i18n: { localize: key => key }, modules: new Map(),
    settings: { get: (_module, key) => key === "characterDashboardTheme" ? "osr" : false }
  };
  globalThis.foundry = {
    utils: { mergeObject: (base, options) => ({ ...base, ...options }) },
    documents: { collections: { Actors: { registerSheet: (...args) => { registration = args; } } } }
  };
  await import("../scripts/character-dashboard/character-dashboard.js");
  hooks.get("init")();
  const [scope, Sheet, options] = registration;
  assert.equal(scope, "mk-shadowdark");
  assert.equal(options.makeDefault, false);
  assert.deepEqual(options.types, ["Player"]);
  assert.ok(Sheet.prototype instanceof NativeSheet);
  assert.equal(Sheet.defaultOptions.tabs[0].initial, "tab-body");
  assert.equal(Sheet.defaultOptions.dragDrop.at(-1).dragSelector, "[data-item-id]");
  assert.match(Sheet.defaultOptions.dragDrop.at(-1).dropSelector, /data-quick-slot/);
  assert.deepEqual([...hooks.keys()], ["init", "ready"]);
  const sheet = new Sheet({
    items: [
      { id: "bandages", name: "Bandages", type: "basic", img: "bandages.png", system: { quantity: 3 } },
      { id: "two-slot", name: "Two Slot Item", type: "basic", img: "two-slot.png", system: { slots: { slots_used: 2 } } },
      { id: "three-slot", name: "Three Slot Item", type: "basic", img: "three-slot.png", system: { slots: { slots_used: 3 } } },
      { id: "bless", name: "Bless", type: "spell", img: "bless.png", system: {} }
    ],
    effects: [],
    flags: { "mk-shadowdark": { quickSlots: ["bless", null, null] } },
    system: { level: { value: 3, xp: 0 }, alignment: "lawful", renown: 2 },
    isOwner: true
  });
  const context = await sheet.getData();
  assert.equal(context.native, true);
  assert.deepEqual(context.dashboard.leftSlots.map(slot => slot.key), ["rightHand"]);
  assert.deepEqual(context.dashboard.rightSlots.map(slot => slot.key), ["torso", "leftHand"]);
  assert.deepEqual(context.dashboard.quickSlots.map(slot => slot.key), ["quick1", "quick2", "quick3"]);
  assert.equal(context.dashboard.quickSlots[0].item.name, "Bless");
  assert.equal(context.dashboard.quickSlots[1].item, null);
  assert.deepEqual(context.dashboard.armorClass, {
    label: "Armor Class",
    icon: "fa-solid fa-shield-halved",
    value: "-"
  });
  assert.equal(context.dashboard.stats.some(stat => stat.key === "ac"), false);
  assert.equal(context.dashboard.stats.some(stat => stat.key === "level"), false);
  assert.equal(context.dashboard.stats.some(stat => stat.key === "luck"), false);
  assert.equal(context.dashboard.editingStats, false);
  assert.equal(context.dashboard.showSpellsButton, true);
  assert.equal(context.dashboard.themeClass, "mk-dashboard-theme-osr");
  assert.deepEqual(
    {
      available: context.dashboard.luckToggle.available,
      stateLabel: context.dashboard.luckToggle.stateLabel,
      pulpMode: context.dashboard.luckToggle.pulpMode
    },
    { available: false, stateLabel: "Spent", pulpMode: false }
  );
  assert.equal(context.dashboard.backpackUsed, 6);
  assert.equal(context.dashboard.backpackCapacity, 10);
  assert.deepEqual(context.dashboard.backpackItems.map(entry => entry.slotSpan), [1, 3, 2]);
  assert.equal(context.dashboard.backpackEmptySlots.length, 4);
  assert.equal(context.dashboard.woundMarkers.length, 0);
  assert.deepEqual(
    context.dashboard.stats.slice(0, 3).map(stat => ({ key: stat.key, value: stat.value, hasBar: stat.hasBar })),
    [
      { key: "hp", value: "0", hasBar: true },
      { key: "xp", value: "0 / 30", hasBar: true },
      { key: "renown", value: "2 / 20", hasBar: true }
    ]
  );
  assert.equal(context.dashboard.stats.find(stat => stat.key === "renown").percent, 10);
  assert.deepEqual(context.dashboard.carried.map(item => ({ name: item.name, quantity: item.quantity, hasQuantity: item.hasQuantity })), [
    { name: "Bandages", quantity: 3, hasQuantity: true },
    { name: "Three Slot Item", quantity: 1, hasQuantity: false },
    { name: "Two Slot Item", quantity: 1, hasQuantity: false }
  ]);
  assert.deepEqual(
    {
      level: context.dashboard.actor.level,
      title: context.dashboard.actor.title,
      className: context.dashboard.actor.className,
      background: context.dashboard.actor.background,
      ancestry: context.dashboard.actor.ancestry,
      alignment: context.dashboard.actor.alignment,
      deity: context.dashboard.actor.deity
    },
    {
      level: 3,
      title: "Crusader",
      className: "Priest",
      background: "Urchin",
      ancestry: "Half-Orc",
      alignment: "Lawful",
      deity: "Saint Terragnis"
    }
  );
  assert.equal(await sheet._onDrop({ target: { closest: () => null } }), "native-drop");
  assert.equal(await sheet._onDrop({ target: { closest: () => ({}) } }), "native-drop");
  const formData = { "system.level.xp": "7.8" };
  await sheet._updateObject({}, formData);
  assert.equal(formData["system.level.xp"], 7);
});
