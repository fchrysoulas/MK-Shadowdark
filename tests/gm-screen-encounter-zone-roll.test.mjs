import assert from "node:assert/strict";
import test from "node:test";

import {
  AUXILIARY_TABLE_KEYS,
  ENCOUNTER_AUXILIARY_TABLE_KEYS,
  GENERATOR_ASSIGNMENT_COUNT,
  encounterGeneratorDialogContent,
  encounterDangerDieFormula,
  encounterZoneDieFormula,
  findEncounterZoneCell,
  generatorJournalContent,
  promptForEncounterGenerator,
  getSceneEncounterZoneAuxiliaryTables,
  getSceneEncounterZoneGrids,
  GRID_COLLECTION_FLAG,
  normalizeAuxiliaryTables,
  normalizeEncounterZoneGrids,
  rollEncounterGenerator,
  renderEncounterAuxiliaryTableSetup,
  renderEncounterGeneratorSetup,
  renderEncounterZoneGroups,
  renderEncounterZoneRollCard,
  promptForEncounterZone,
  rollEncounterZone,
  setSceneEncounterZoneAuxiliaryTable,
  tableResultSummary,
} from "../scripts/gm-screen/exploration-zone-grid.js";

function grid() {
  return {
    rowHeader: "d8",
    columns: [
      { id: "forest", label: "Forest" },
      { id: "ruins", label: "Ruins" },
    ],
    rows: [
      { label: "1-2", cells: [{ uuid: "RollTable.forest-low", name: "Forest Low" }, null] },
      { label: "3-5", cells: [null, { uuid: "RollTable.ruins-mid", name: "Ruins Mid" }] },
      { label: "6-8", cells: [{ uuid: "RollTable.forest-high", name: "Forest High" }, null] },
    ],
  };
}

test("Encounter Zone rolls use the grid die and selected terrain column", () => {
  assert.equal(encounterZoneDieFormula(grid()), "1d8");
  assert.equal(findEncounterZoneCell(grid(), "forest", 7).cell.uuid, "RollTable.forest-high");
  assert.equal(findEncounterZoneCell(grid(), "RUINS", 4).cell.uuid, "RollTable.ruins-mid");
  assert.equal(findEncounterZoneCell(grid(), "Forest", 9), null);
});

test("Encounter Zone dice follow the selected Danger level", () => {
  assert.equal(encounterDangerDieFormula("Unsafe"), "1d6");
  assert.equal(encounterDangerDieFormula("rIsKy"), "2d6");
  assert.equal(encounterDangerDieFormula({ label: "Deadly" }), "3d6");
  assert.equal(encounterZoneDieFormula(grid(), "unsafe"), "1d6");
  assert.equal(encounterZoneDieFormula(grid(), "Risky"), "2d6");
  assert.equal(encounterZoneDieFormula(grid(), "DEADLY"), "3d6");
  assert.equal(encounterZoneDieFormula(grid(), "Safe"), "1d8");
});

test("Encounter Zones migrate into named collapsible groups with editable names", () => {
  const zones = normalizeEncounterZoneGrids([
    { id: "wilderness", title: "Andrik Zone", ...grid() },
    { id: "wilderness", title: "Dungeon Zone", ...grid() },
  ]);
  assert.deepEqual(zones.map(zone => zone.id), ["wilderness", "wilderness-2"]);
  assert.deepEqual(zones.map(zone => zone.title), ["Andrik Zone", "Dungeon Zone"]);

  const edit = renderEncounterZoneGroups(zones, { mode: "edit" });
  assert.equal((edit.match(/data-mk-encounter-zone-group(?=[\s=])/g) ?? []).length, 2);
  assert.equal((edit.match(/data-grid-title(?=[\s=])/g) ?? []).length, 2);
  assert.match(edit, /data-grid-add-zone/);
  assert.match(edit, /value="Andrik Zone"/);
  assert.match(edit, /value="Dungeon Zone"/);
  assert.match(edit, /> Save\s*<\/button>/);
  assert.doesNotMatch(edit, /View Grid/);
  assert.equal((edit.match(/data-grid-remove-zone/g) ?? []).length, 2);

  const view = renderEncounterZoneGroups(zones, { mode: "view" });
  assert.equal((view.match(/<details class="mk-gm-encounter-zone-group"/g) ?? []).length, 2);
  assert.doesNotMatch(view, /<details class="mk-gm-encounter-zone-group"[^>]* open/);
  assert.equal((view.match(/data-grid-roll-zone/g) ?? []).length, 2);
  assert.equal((view.match(/Andrik Zone/g) ?? []).length, 1);
  assert.equal((view.match(/Dungeon Zone/g) ?? []).length, 1);
  assert.match(view, /data-grid-add-zone/);
});

test("Encounter Zone collections keep legacy single-grid scenes readable", () => {
  const scene = {
    getFlag(_moduleId, key) {
      return key === "encounterZoneGrid" ? { ...grid(), title: "Legacy Zone" } : null;
    },
  };
  const zones = getSceneEncounterZoneGrids(scene, { fallback: false });
  assert.equal(zones.length, 1);
  assert.equal(zones[0].title, "Legacy Zone");
  assert.equal(zones[0].id, "zone-1");
  assert.notEqual(GRID_COLLECTION_FLAG, "encounterZoneGrid");
});

test("RollTable result metadata is safe when Foundry result sources are unavailable", () => {
  const result = { range: [1, 1], text: "A guarded bridge." };
  Object.defineProperty(result, "_source", {
    get() {
      throw new TypeError("source is unavailable");
    },
  });
  assert.deepEqual(tableResultSummary(result), {
    index: 1,
    range: "1–1",
    text: "A guarded bridge.",
    documentCollection: "",
    documentId: "",
    uuid: "",
  });
});

test("Encounter and generator settings expose independent Scene-owned RollTable assignments", () => {
  assert.deepEqual(normalizeAuxiliaryTables({ distance: "RollTable.distance", trap: " RollTable.trap " }), {
    distance: "RollTable.distance",
    activity: "",
    danger: "",
    trap: ["RollTable.trap", "", ""],
    hazard: ["", "", ""],
  });
  const html = renderEncounterAuxiliaryTableSetup([
    { key: "distance", label: "Starting Distance", uuid: "RollTable.distance", table: { name: "Distance" } },
    { key: "danger", label: "Danger Level", uuid: "RollTable.danger", table: { name: "Danger Level" } },
    { key: "activity", label: "Activity", uuid: "RollTable.activity", table: { name: "Activity" } },
  ]);
  for (const key of ENCOUNTER_AUXILIARY_TABLE_KEYS) assert.match(html, new RegExp(`data-mk-encounter-auxiliary-slot="${key}"`));
  assert.match(html, /Starting Distance/);
  assert.match(html, /Activity/);
  assert.doesNotMatch(html, /Trap|Hazard/);

  const generator = renderEncounterGeneratorSetup({
    key: "trap",
    label: "Trap",
    uuids: ["RollTable.spike", "RollTable.pit", "RollTable.snare"],
    tables: [{ name: "Spike Trap" }, { name: "Pit Trap" }, { name: "Snare Trap" }],
  });
  assert.equal((generator.match(/data-mk-encounter-auxiliary-slot="trap"/g) ?? []).length, GENERATOR_ASSIGNMENT_COUNT);
  assert.equal((generator.match(/mk-gm-rolltable-assignment-row/g) ?? []).length, GENERATOR_ASSIGNMENT_COUNT);
  assert.match(generator, /mk-gm-rolltable-assignment-grid/);
  assert.match(generator, /Rolls the first trap table/);
  assert.match(generator, /Spike Trap/);
  assert.match(generator, /Pit Trap/);
  assert.match(generator, /Snare Trap/);
});

test("Encounter Journal pages hide dice and roll details while keeping results visible", () => {
  const data = {
    terrain: "Forest",
    rowLabel: "6-8",
    tableName: "Forest High",
    zoneRoll: { formula: "1d8", total: 7 },
    tableRoll: { roll: { formula: "1d20", total: 14 }, results: [{ index: 1, range: "14–14", text: "A patrol approaches." }] },
    auxiliaryRolls: [{
      key: "trap",
      label: "Trap",
      tableName: "Spike Trap",
      tableIndex: 1,
      tableCount: 2,
      tableRoll: { roll: { formula: "1d6", total: 3 }, results: [{ index: 1, range: "3–3", text: "A concealed snare." }] },
    }, {
      key: "trap",
      label: "Trap",
      tableName: "Pit Trap",
      tableIndex: 2,
      tableCount: 2,
      tableRoll: { roll: { formula: "1d4", total: 2 }, results: [{ index: 1, range: "2–2", text: "The floor gives way." }] },
    }, {
      key: "hazard",
      label: "Hazard",
      tableName: "Falling Rocks",
      tableIndex: 1,
      tableCount: 1,
      tableRoll: { roll: { formula: "1d6", total: 5 }, results: [{ index: 1, range: "5–5", text: "Loose stone crashes down." }] },
    }],
  };
  const hidden = renderEncounterZoneRollCard(data, { showRollDetails: false });
  assert.match(hidden, /Forest High/);
  assert.match(hidden, /<h2>Forest High<\/h2>/);
  assert.match(hidden, /<h2>Forest High<\/h2>[\s\S]*<p>A patrol approaches/);
  assert.match(hidden, /<h2>Spike Trap<\/h2>/);
  assert.match(hidden, /<h2>Spike Trap<\/h2>[\s\S]*<p>A concealed snare/);
  assert.match(hidden, /<h2>Pit Trap<\/h2>[\s\S]*<p>The floor gives way/);
  assert.match(hidden, /<h2>Falling Rocks<\/h2>[\s\S]*<p>Loose stone crashes down/);
  assert.match(hidden, /<h4>Trap<\/h4>[\s\S]*Spike Trap[\s\S]*Pit Trap/);
  assert.match(hidden, /<h4>Hazard<\/h4>[\s\S]*Falling Rocks/);
  assert.equal((hidden.match(/class="mk-gm-encounter-zone-auxiliary-group"/g) ?? []).length, 2);
  assert.match(hidden, /Dice, roll totals, and result numbers are hidden/);
  assert.doesNotMatch(hidden, /1d8|1d20|1d6|1d4|→ 7|→ 14|→ 3|→ 2|→ 5|Result 14|Result 3|Result 2|Result 5/);

  const debug = renderEncounterZoneRollCard(data, { showRollDetails: true });
  assert.match(debug, /1d8 → 7/);
  assert.match(debug, /1d20 → 14/);
  assert.match(debug, /<h2>Forest High<\/h2>[\s\S]*<p>A patrol approaches/);
  assert.match(debug, /<h2>Spike Trap<\/h2>/);
  assert.match(debug, /<h2>Spike Trap<\/h2>[\s\S]*<p>A concealed snare/);
  assert.match(debug, /<h2>Pit Trap<\/h2>[\s\S]*<p>The floor gives way/);
  assert.match(debug, /<h2>Falling Rocks<\/h2>[\s\S]*<p>Loose stone crashes down/);
  assert.match(debug, /Result 14–14/);
  assert.match(debug, /Result 3–3/);
  assert.match(debug, /Result 2–2/);
  assert.match(debug, /Result 5–5/);
});

test("Encounter quick action previews before creating a Journal and offers Create, Reroll, and Cancel", async () => {
  const dialogs = [];
  const rolls = [];
  const journals = [];
  const generated = rowLabel => ({
    detail: {
      terrain: "Forest",
      rowLabel,
      tableName: "Forest High",
      zoneRoll: { formula: "1d8", total: Number(rowLabel) },
      tableRoll: {
        roll: { formula: "1d20", total: 14 },
        results: [{ text: rowLabel === "1" ? "A patrol approaches." : "A hidden shrine waits." }],
      },
      auxiliaryRolls: [],
    },
  });

  const result = await promptForEncounterZone("Forest", { id: "Scene.forest" }, {
    user: { isGM: true },
    roll: async (_terrain, _scene, options) => {
      rolls.push(options);
      return generated(rolls.length === 1 ? "1" : "2");
    },
    prompt: async config => {
      dialogs.push(config);
      return dialogs.length === 1 ? { action: "reroll" } : { action: "create" };
    },
    createJournal: async data => {
      journals.push(data);
      return { id: "JournalEntry.encounter" };
    },
  });

  assert.deepEqual(rolls.map(options => options.createJournal), [false, false]);
  assert.deepEqual(dialogs[0].buttons.map(button => button.label), ["Create", "Reroll", "Cancel"]);
  assert.match(dialogs[0].content, /Forest High/);
  assert.match(dialogs[0].content, /A patrol approaches/);
  assert.match(encounterGeneratorDialogContent(generated("2").detail), /A hidden shrine waits/);
  assert.equal(journals.length, 1);
  assert.equal(journals[0].rowLabel, "2");
  assert.equal(result.journal.id, "JournalEntry.encounter");
});

test("Trap and Hazard generators resolve their assigned tables before Journal creation", async () => {
  const previousGame = globalThis.game;
  const previousFromUuid = globalThis.fromUuid;
  const previousUi = globalThis.ui;
  const calls = [];
  const scene = {
    getFlag(_moduleId, key) {
      if (key !== "encounterZoneAuxiliaryTables") return null;
      return {
        trap: ["RollTable.trap-one", "RollTable.trap-two", "RollTable.trap-three"],
        hazard: ["RollTable.hazard-one", "RollTable.hazard-two", "RollTable.hazard-three"],
      };
    },
  };
  const tables = new Map([
    ["RollTable.trap-one", "Spike Trap"],
    ["RollTable.trap-two", "Pit Trap"],
    ["RollTable.trap-three", "Snare Trap"],
    ["RollTable.hazard-one", "Falling Rocks"],
    ["RollTable.hazard-two", "Flash Flood"],
    ["RollTable.hazard-three", "Ash Cloud"],
  ]);
  globalThis.game = { user: { isGM: true } };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.fromUuid = async uuid => {
    if (!tables.has(uuid)) return null;
    return {
      documentName: "RollTable",
      uuid,
      name: tables.get(uuid),
      async draw(options) {
        calls.push({ uuid, options });
        return {
          roll: { formula: "1d6", total: 4 },
          results: [{ text: `${tables.get(uuid)} result.` }],
        };
      },
    };
  };

  try {
    const trap = await rollEncounterGenerator("trap", scene);
    assert.equal(trap.label, "Trap");
    assert.deepEqual(trap.rolls.map(roll => roll.tableName), ["Spike Trap", "Pit Trap", "Snare Trap"]);
    assert.ok(calls.every(call => call.options.displayChat === false));

    let dialog;
    let created;
    const hazard = await promptForEncounterGenerator("hazard", scene, {
      user: { isGM: true },
      roll: async () => ({
        key: "hazard",
        label: "Hazard",
        rolls: [{
          configured: true,
          tableIndex: 1,
          tableName: "Falling Rocks",
          results: [{ text: "Loose stone crashes down." }],
          roll: { formula: "1d6", total: 5 },
        }],
      }),
      prompt: async config => {
        dialog = config;
        return { action: "create" };
      },
      createJournal: async data => {
        created = data;
        return { id: "JournalEntry.hazard" };
      },
    });
    assert.deepEqual(dialog.buttons.map(button => button.label), ["Create", "Reroll", "Cancel"]);
    assert.match(dialog.content, /Falling Rocks/);
         assert.match(dialog.content, /Loose stone crashes down/);
         assert.equal(created.label, "Hazard");
         assert.equal(hazard.journal.id, "JournalEntry.hazard");
         const journalContent = generatorJournalContent(created);
         assert.match(journalContent, /Hazard Generator/);
         assert.match(journalContent, /Loose stone crashes down/);
       } finally {
    globalThis.game = previousGame;
    globalThis.fromUuid = previousFromUuid;
    globalThis.ui = previousUi;
  }
});

test("Trap and Hazard assignments use three fixed slots", async () => {
  const previousGame = globalThis.game;
  let stored = {
    distance: "",
    activity: "",
    trap: "RollTable.old-trap",
    hazard: ["RollTable.old-hazard"],
  };
  const scene = {
    getFlag: () => stored,
    async setFlag(_moduleId, _key, value) {
      stored = value;
    },
  };
  globalThis.game = { user: { isGM: true } };

  try {
    assert.deepEqual(getSceneEncounterZoneAuxiliaryTables(scene).trap, ["RollTable.old-trap", "", ""]);
    const appended = await setSceneEncounterZoneAuxiliaryTable("trap", "RollTable.new-trap", scene);
    assert.deepEqual(appended.trap, ["RollTable.old-trap", "RollTable.new-trap", ""]);
    const removed = await setSceneEncounterZoneAuxiliaryTable("trap", "", scene, { index: 0 });
    assert.deepEqual(removed.trap, ["", "RollTable.new-trap", ""]);
  } finally {
    globalThis.game = previousGame;
  }
});

test("Encounter Zone rolls the selected cell's RollTable after the zone die", async () => {
  const previousRoll = globalThis.Roll;
  const previousFromUuid = globalThis.fromUuid;
  const previousCanvas = globalThis.canvas;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  const previousJournalEntry = globalThis.JournalEntry;
  const previousConst = globalThis.CONST;
  const calls = [];

  class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = null;
    }

    async evaluate() {
      this.total = 7;
      return this;
    }

    async toMessage(options) {
      calls.push({ type: "unexpected-public-roll", formula: this.formula, options });
    }
  }

  const table = {
    documentName: "RollTable",
    uuid: "RollTable.forest-high",
    name: "Forest High",
    async draw(options) {
      calls.push({ type: "table-roll", options });
      return {
        roll: { formula: "1d20", total: 14 },
        results: [{ range: [14, 14], text: "A patrol approaches." }],
      };
    },
  };

  globalThis.Roll = MockRoll;
  globalThis.fromUuid = async uuid => uuid === table.uuid ? table : null;
  globalThis.canvas = { scene: { getFlag: (_moduleId, key) => key === "encounterZoneGrid" ? grid() : null } };
  globalThis.game = {
    user: { id: "User.gm", isGM: true },
    users: [{ id: "User.gm", isGM: true, active: true }],
    settings: { get: () => true },
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.CONST = { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 }, DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0 } };
  globalThis.JournalEntry = {
    async create(data) {
      calls.push({ type: "journal", data });
      return { id: "JournalEntry.zone" };
    },
  };

  try {
    const result = await rollEncounterZone("Forest", globalThis.canvas.scene);
    assert.equal(result.total, 7);
    assert.equal(result.cell.uuid, table.uuid);
    assert.deepEqual(calls.map(call => call.type), ["table-roll", "journal"]);
    assert.equal(calls[0].options.displayChat, false);
    assert.equal(calls[1].data.name, "Encounter — Forest — 6-8");
    assert.equal(calls[1].data.ownership.default, 0);
    assert.equal(calls[1].data.pages[0].name, "Encounter Result");
    assert.equal(calls[1].data.pages[0].text.format, 1);
    assert.match(calls[1].data.pages[0].text.content, /1d8 → 7/);
    assert.match(calls[1].data.pages[0].text.content, /1d20 → 14/);
    assert.match(calls[1].data.pages[0].text.content, /A patrol approaches/);
    assert.equal(calls[1].data.flags["mk-shadowdark"].encounterZoneRoll.tableUuid, table.uuid);
    assert.equal(result.journal.id, "JournalEntry.zone");
    assert.equal(result.auxiliaryRolls.length, ENCOUNTER_AUXILIARY_TABLE_KEYS.length);
    assert.ok(result.auxiliaryRolls.every(entry => entry.configured === false));
    assert.match(calls[1].data.pages[0].text.content, /No supporting encounter tables were configured/);
    assert.doesNotMatch(calls[1].data.pages[0].text.content, /Starting Distance|Not configured; skipped/);
  } finally {
    globalThis.Roll = previousRoll;
    globalThis.fromUuid = previousFromUuid;
    globalThis.canvas = previousCanvas;
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
    globalThis.JournalEntry = previousJournalEntry;
    globalThis.CONST = previousConst;
  }
});

test("Encounter Zone rolls only the configured encounter detail tables into a Journal page", async () => {
  const previousRoll = globalThis.Roll;
  const previousFromUuid = globalThis.fromUuid;
  const previousCanvas = globalThis.canvas;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  const previousJournalEntry = globalThis.JournalEntry;
  const calls = [];
  const auxiliaryTables = Object.fromEntries(AUXILIARY_TABLE_KEYS.map((key, index) => {
    const uuid = `RollTable.${key}`;
    return [uuid, {
      documentName: "RollTable",
      uuid,
      name: key,
      async draw(options) {
        calls.push({ type: key, options });
        return { roll: { formula: `1d${index + 4}`, total: index + 1 }, results: [{ text: `${key} result.` }] };
      },
    }];
  }));
  const mainTable = {
    documentName: "RollTable",
    uuid: "RollTable.forest-high",
    name: "Forest High",
    async draw(options) {
      calls.push({ type: "main", options });
      return { roll: { formula: "1d20", total: 14 }, results: [{ text: "A patrol approaches." }] };
    },
  };

  class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 7;
    }

    async evaluate() {
      return this;
    }
  }

  const scene = {
    getFlag(_moduleId, key) {
      if (key === "encounterZoneGrid") return grid();
      if (key === "encounterZoneAuxiliaryTables") {
        return Object.fromEntries(AUXILIARY_TABLE_KEYS.map(key => [key, `RollTable.${key}`]));
      }
      return null;
    },
  };

  globalThis.Roll = MockRoll;
  globalThis.fromUuid = async uuid => uuid === mainTable.uuid ? mainTable : auxiliaryTables[uuid] ?? null;
  globalThis.canvas = { scene };
  globalThis.game = {
    user: { id: "User.gm", isGM: true },
    users: [{ id: "User.gm", isGM: true, active: true }],
    settings: { get: () => true },
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.JournalEntry = {
    async create(data) {
      calls.push({ type: "journal", data });
      return { id: "JournalEntry.zone-details" };
    },
  };

  try {
    const result = await rollEncounterZone("Forest", scene);
    assert.deepEqual(result.auxiliaryRolls.map(entry => entry.key), [...ENCOUNTER_AUXILIARY_TABLE_KEYS]);
    assert.ok(result.auxiliaryRolls.every(entry => entry.configured && !entry.error));
    assert.deepEqual(calls.map(call => call.type), ["main", ...ENCOUNTER_AUXILIARY_TABLE_KEYS, "journal"]);
    assert.ok(calls.slice(0, ENCOUNTER_AUXILIARY_TABLE_KEYS.length + 1).every(call => call.options.displayChat === false));
    assert.match(calls.at(-1).data.pages[0].text.content, /Starting Distance/);
    assert.match(calls.at(-1).data.pages[0].text.content, /Activity/);
    assert.match(calls.at(-1).data.pages[0].text.content, /Danger Level/);
    assert.doesNotMatch(calls.at(-1).data.pages[0].text.content, /Trap|Hazard/);
  } finally {
    globalThis.Roll = previousRoll;
    globalThis.fromUuid = previousFromUuid;
    globalThis.canvas = previousCanvas;
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
    globalThis.JournalEntry = previousJournalEntry;
  }
});

test("Encounter Zone ignores assigned Trap and Hazard tables", async () => {
  const previousRoll = globalThis.Roll;
  const previousFromUuid = globalThis.fromUuid;
  const previousCanvas = globalThis.canvas;
  const previousGame = globalThis.game;
  const previousUi = globalThis.ui;
  const previousJournalEntry = globalThis.JournalEntry;
  const calls = [];
  const assignments = {
    distance: "RollTable.distance",
    activity: "RollTable.activity",
    danger: "RollTable.danger",
    trap: ["RollTable.trap-one", "RollTable.trap-two"],
    hazard: ["RollTable.hazard-one", "RollTable.hazard-two"],
  };
  const auxiliaryTables = Object.fromEntries(Object.entries(assignments).flatMap(([key, rawUuids]) => {
    const uuids = Array.isArray(rawUuids) ? rawUuids : [rawUuids];
    return uuids.map((uuid, index) => [uuid, {
      documentName: "RollTable",
      uuid,
      name: `${key} ${index + 1}`,
      async draw(options) {
        calls.push({ type: uuid, options });
        return { roll: { formula: "1d6", total: index + 1 }, results: [{ text: `${uuid} result.` }] };
      },
    }]);
  }));
  const mainTable = {
    documentName: "RollTable",
    uuid: "RollTable.forest-high",
    name: "Forest High",
    async draw(options) {
      calls.push({ type: "main", options });
      return { roll: { formula: "1d20", total: 14 }, results: [{ text: "A patrol approaches." }] };
    },
  };

  class MockRoll {
    constructor(formula) {
      this.formula = formula;
      this.total = 7;
    }

    async evaluate() {
      return this;
    }
  }

  const scene = {
    getFlag(_moduleId, key) {
      if (key === "encounterZoneGrid") return grid();
      if (key === "encounterZoneAuxiliaryTables") return assignments;
      return null;
    },
  };

  globalThis.Roll = MockRoll;
  globalThis.fromUuid = async uuid => uuid === mainTable.uuid ? mainTable : auxiliaryTables[uuid] ?? null;
  globalThis.canvas = { scene };
  globalThis.game = {
    user: { id: "User.gm", isGM: true },
    users: [{ id: "User.gm", isGM: true, active: true }],
    settings: { get: () => true },
  };
  globalThis.ui = { notifications: { warn: () => {}, error: () => {} } };
  globalThis.JournalEntry = {
    async create(data) {
      calls.push({ type: "journal", data });
      return { id: "JournalEntry.zone-details" };
    },
  };

  try {
    const result = await rollEncounterZone("Forest", scene);
    assert.deepEqual(result.auxiliaryRolls.map(entry => entry.tableUuid), [
      "RollTable.distance",
      "RollTable.activity",
      "RollTable.danger",
    ]);
    assert.deepEqual(calls.map(call => call.type), [
      "main",
      assignments.distance,
      assignments.activity,
      assignments.danger,
      "journal",
    ]);
    assert.ok(calls.slice(0, -1).every(call => call.options.displayChat === false));
    assert.doesNotMatch(calls.at(-1).data.pages[0].text.content, /Trap|Hazard|trap-one|hazard-two/);
  } finally {
    globalThis.Roll = previousRoll;
    globalThis.fromUuid = previousFromUuid;
    globalThis.canvas = previousCanvas;
    globalThis.game = previousGame;
    globalThis.ui = previousUi;
    globalThis.JournalEntry = previousJournalEntry;
  }
});
