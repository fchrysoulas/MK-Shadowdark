import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);

globalThis.foundry = {
  utils: {
    deepClone: value => value == null ? value : JSON.parse(JSON.stringify(value)),
    mergeObject: (original, other) => ({ ...original, ...other }),
    getProperty: (object, path) => String(path).split(".").reduce((value, key) => value?.[key], object),
  },
};

globalThis.game = {
  user: { id: "gm", isGM: true },
  actors: [],
  messages: [],
  scenes: { current: null },
  time: { worldTime: 0 },
  combat: null,
  modules: new Map(),
  settings: {
    settings: new Map(),
    get: () => undefined,
  },
};

globalThis.canvas = { scene: null };
globalThis.CONFIG = { specialStatusEffects: { DEFEATED: "dead" } };

globalThis.Hooks = {
  on: () => {},
  once: () => {},
  callAll: () => {},
};

const viewModel = await import("../scripts/gm-screen/view-model.js");

test("GM Screen workspace normalization is bounded", () => {
  assert.equal(viewModel.normalizeWorkspace("combat"), "combat");
  assert.equal(viewModel.normalizeWorkspace("NOT-A-WORKSPACE"), "overview");
  assert.ok(viewModel.GM_SCREEN_WORKSPACES.includes("rules"));
});

test("GM Screen duration presentation is deterministic", () => {
  assert.equal(viewModel.formatDuration(0), "0s");
  assert.equal(viewModel.formatDuration(360), "6m");
  assert.equal(viewModel.formatDuration(3900), "1h 5m");
});

test("GM Screen discovers only flagged Group actors", () => {
  const group = {
    id: "group",
    name: "Dune Runners",
    getFlag: (_scope, key) => key === "isGroup" ? true : undefined,
  };
  const character = {
    id: "pc",
    name: "Hero",
    getFlag: () => false,
  };

  const groups = viewModel.getGroupActors([character, group]);
  assert.deepEqual(groups.map(actor => actor.id), ["group"]);
});

test("GM Screen combat view reads canonical morale API without persisting state", () => {
  const current = { id: "c2", name: "Goblin", initiative: 12, defeated: false };
  const first = { id: "c1", name: "Hero", initiative: 15, defeated: false };
  const combat = {
    id: "combat",
    name: "Battle",
    round: 2,
    turn: 1,
    turns: [first, current],
    combatants: new Map([["c1", first], ["c2", current]]),
  };

  globalThis.game.modules.set("mk-shadowdark", {
    api: {
      morale: {
        getState: () => ({
          force: {
            initialCount: 2,
            threshold: 1,
            checked: false,
            members: [{ combatantId: "c2" }],
          },
        }),
      },
    },
  });

  const result = viewModel.buildCombatView(combat);
  assert.equal(result.active, true);
  assert.equal(result.round, 2);
  assert.equal(result.currentCombatant.name, "Goblin");
  assert.equal(result.morale.initialCount, 2);
  assert.equal(result.morale.livingCount, 1);
});

test("GM Screen latest encounter lookup is scoped to the selected Group", () => {
  const group = { uuid: "Actor.group" };
  const other = { uuid: "Actor.other" };
  const makeMessage = (id, timestamp, groupActorUuid, label) => ({
    id,
    timestamp,
    getFlag: () => ({
      groupContext: { groupActorUuid },
      encounter: { label, count: 1 },
    }),
  });

  const messages = [
    makeMessage("old", 10, group.uuid, "Goblin"),
    makeMessage("other", 30, other.uuid, "Dragon"),
    makeMessage("new", 20, group.uuid, "Spider"),
  ];

  const result = viewModel.findLatestEncounterMessage(group, messages);
  assert.equal(result.message.id, "new");
  assert.equal(result.data.encounter.label, "Spider");
});

test("GM Screen runtime uses ApplicationV2 and does not modify Group Sheet files", () => {
  const source = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
  const template = fs.readFileSync(new URL("../templates/gm-screen.hbs", import.meta.url), "utf8");
  const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

  assert.match(source, /HandlebarsApplicationMixin/);
  assert.match(source, /getSceneControlButtons/);
  assert.match(source, /module\.api\.gmScreen/);
  assert.match(source, /visible: true/);
  assert.match(template, /Group Management/);
  assert.match(template, /Quick Rules|Procedure Turns/);
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"));
  assert.ok(manifest.styles.includes("styles/gm-screen.css"));
});

test("GM Screen files contain no gameplay-state persistence API", () => {
  const runtime = fs.readFileSync(new URL("../scripts/gm-screen/gm-screen.js", import.meta.url), "utf8");
  const view = fs.readFileSync(new URL("../scripts/gm-screen/view-model.js", import.meta.url), "utf8");
  const combined = `${runtime}\n${view}`;

  assert.doesNotMatch(combined, /\.setFlag\s*\(/);
  assert.doesNotMatch(combined, /\.unsetFlag\s*\(/);
  assert.doesNotMatch(combined, /localStorage/);
  assert.doesNotMatch(combined, /game\.settings\.set\s*\(/);
});
