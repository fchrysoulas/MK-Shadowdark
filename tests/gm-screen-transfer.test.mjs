import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  TRANSFER_FORMAT,
  TRANSFER_SCHEMA,
  collectConfiguredTableUuids,
  exportConfiguration,
  importConfiguration,
  normalizeTransferConfiguration,
  remapTableUuid,
  safeFilename,
  validateExport,
  downloadExport,
} from "../scripts/gm-screen/gm-screen-transfer.js";

const runtime = fs.readFileSync(
  new URL("../scripts/gm-screen/gm-screen-transfer.js", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sceneWithFlags(flags = {}) {
  const scene = {
    id: "scene-1",
    uuid: "Scene.scene-1",
    name: "Ashen Keep",
    _source: {
      flags: {
        "mk-shadowdark": clone(flags),
      },
    },
    getFlag(_moduleId, key) {
      return this._source.flags["mk-shadowdark"][key];
    },
    async setFlag(_moduleId, key, value) {
      this._source.flags["mk-shadowdark"][key] = clone(value);
      return value;
    },
  };
  return scene;
}

function table(uuid, name) {
  return { id: uuid.split(".").at(-1), uuid, name, img: "icons/svg/d20.svg" };
}

test("GM Screen export captures Scene-owned configuration and table references", () => {
  const scene = sceneWithFlags({
    encounterContext: {
      terrain: "Forest",
      dangerLevel: "risky",
      period: "night",
      tableUuid: "RollTable.environment",
    },
    encounterZoneGrids: [{
      id: "ruins",
      title: "Ruins",
      rowHeader: "d6",
      columns: [{ id: "forest", label: "Forest" }],
      rows: [{ label: "1", cells: [{ uuid: "RollTable.encounter", name: "Forest Encounter" }] }],
    }],
    encounterZoneAuxiliaryTables: {
      distance: "RollTable.distance",
      activity: "",
      danger: "RollTable.danger",
      trap: ["RollTable.trap"],
      hazard: [],
    },
    npcNameCompositionTables: {
      prefix: "RollTable.prefix",
      syllables: ["RollTable.syllable"],
      suffix: "RollTable.suffix",
      identifier: "",
      twoSyllableChance: 25,
    },
    npcTraitTables: {
      ancestry: "RollTable.ancestry",
      age: "",
      alignment: "RollTable.alignment",
      wealth: "",
      features: ["RollTable.feature"],
      occupation: "RollTable.occupation",
    },
    tavernGeneratorTables: {
      firstPart: "RollTable.tavern-first",
      secondPart: "RollTable.tavern-second",
      knownFor: "RollTable.tavern-known-for",
      wealth: "RollTable.tavern-wealth",
      foodPoor: "RollTable.tavern-food-poor",
      foodStandard: "RollTable.tavern-food-standard",
      foodWealthy: "RollTable.tavern-food-wealthy",
      drinksPoor: "RollTable.tavern-drinks-poor",
      drinksStandard: "RollTable.tavern-drinks-standard",
      drinksWealthy: "RollTable.tavern-drinks-wealthy",
    },
    encounterZoneTableUuid: "RollTable.legacy",
  });
  const tables = [
    table("RollTable.environment", "Environment"),
    table("RollTable.encounter", "Forest Encounter"),
    table("RollTable.distance", "Distance"),
    table("RollTable.danger", "Danger"),
    table("RollTable.trap", "Trap"),
    table("RollTable.prefix", "Prefix"),
    table("RollTable.syllable", "Syllable"),
    table("RollTable.suffix", "Suffix"),
    table("RollTable.ancestry", "Ancestry"),
    table("RollTable.alignment", "Alignment"),
    table("RollTable.feature", "Feature"),
    table("RollTable.occupation", "Occupation"),
    table("RollTable.tavern-first", "Tavern First Part"),
    table("RollTable.tavern-second", "Tavern Second Part"),
    table("RollTable.tavern-known-for", "Tavern Known For"),
    table("RollTable.tavern-wealth", "Tavern Wealth"),
    table("RollTable.tavern-food-poor", "Tavern Poor Food"),
    table("RollTable.tavern-food-standard", "Tavern Standard Food"),
    table("RollTable.tavern-food-wealthy", "Tavern Wealthy Food"),
    table("RollTable.tavern-drinks-poor", "Tavern Poor Drinks"),
    table("RollTable.tavern-drinks-standard", "Tavern Standard Drinks"),
    table("RollTable.tavern-drinks-wealthy", "Tavern Wealthy Drinks"),
    table("RollTable.legacy", "Legacy"),
  ];

  const exported = exportConfiguration(scene, { tables });
  assert.equal(exported.format, TRANSFER_FORMAT);
  assert.equal(exported.schema, TRANSFER_SCHEMA);
  assert.equal(exported.sourceScene.name, "Ashen Keep");
  assert.equal(exported.configuration.encounter.zones[0].title, "Ruins");
  assert.equal(exported.configuration.compositions.nameComposition.twoSyllableChance, 25);
  assert.equal(exported.configuration.tavernGenerator.tables.firstPart, "RollTable.tavern-first");
  assert.equal(exported.configuration.tavernGenerator.tables.secondPart, "RollTable.tavern-second");
  assert.equal(exported.configuration.tavernGenerator.tables.knownFor, "RollTable.tavern-known-for");
  assert.equal(exported.configuration.tavernGenerator.tables.wealth, "RollTable.tavern-wealth");
  assert.equal(exported.configuration.tavernGenerator.tables.foodStandard, "RollTable.tavern-food-standard");
  assert.equal(exported.configuration.tavernGenerator.tables.drinksWealthy, "RollTable.tavern-drinks-wealthy");
  assert.ok(exported.tableReferences.some(reference => reference.name === "Forest Encounter"));
  assert.deepEqual(collectConfiguredTableUuids(exported.configuration).includes("RollTable.feature"), true);
  assert.deepEqual(collectConfiguredTableUuids(exported.configuration).includes("RollTable.tavern-wealth"), true);
  assert.deepEqual(collectConfiguredTableUuids(exported.configuration).includes("RollTable.tavern-food-poor"), true);
});

test("GM Screen import remaps missing UUIDs by unique RollTable name", async () => {
  const destination = sceneWithFlags();
  const destinationTables = [
    table("RollTable.destination-encounter", "Forest Encounter"),
    table("RollTable.destination-prefix", "Prefix"),
    table("RollTable.destination-first", "Tavern First Part"),
  ];
  const payload = {
    format: TRANSFER_FORMAT,
    schema: TRANSFER_SCHEMA,
    sourceScene: { name: "Exported Scene" },
    tableReferences: [
      { uuid: "World.other.RollTable.old-encounter", name: "Forest Encounter" },
      { uuid: "World.other.RollTable.old-prefix", name: "Prefix" },
      { uuid: "World.other.RollTable.old-first", name: "Tavern First Part" },
    ],
    configuration: {
      environmentContext: { terrain: "Forest", dangerLevel: "unsafe", period: "day", tableUuid: "" },
      encounter: {
        zones: [{
          id: "zone-1",
          title: "Forest",
          rowHeader: "d6",
          columns: [{ id: "forest", label: "Forest" }],
          rows: [{ label: "1", cells: [{ uuid: "World.other.RollTable.old-encounter", name: "Forest Encounter" }] }],
        }],
        auxiliaryTables: { distance: "", activity: "", danger: "", trap: [], hazard: [] },
        sourceTableUuid: "",
      },
      compositions: {
        nameComposition: {
          prefix: "World.other.RollTable.old-prefix",
          syllables: [],
          suffix: "",
          identifier: "",
          twoSyllableChance: 50,
        },
        traitTables: {
          ancestry: "",
          age: "",
          alignment: "",
          wealth: "",
          features: [],
          occupation: "",
        },
      },
      tavernGenerator: {
        tables: {
          firstPart: "World.other.RollTable.old-first",
          secondPart: "",
          knownFor: "",
          wealth: "",
          foodPoor: "",
          foodStandard: "",
          foodWealthy: "",
          drinksPoor: "",
          drinksStandard: "",
          drinksWealthy: "",
        },
      },
    },
  };

  const result = await importConfiguration(payload, {
    scene: destination,
    user: { isGM: true },
    tables: destinationTables,
    confirm: false,
  });

  assert.ok(result);
  assert.equal(result.missingTableReferences.length, 0);
  assert.equal(
    destination._source.flags["mk-shadowdark"].encounterZoneGrids[0].rows[0].cells[0].uuid,
    "RollTable.destination-encounter",
  );
  assert.equal(
    destination._source.flags["mk-shadowdark"].npcNameCompositionTables.prefix,
    "RollTable.destination-prefix",
  );
  assert.equal(
    destination._source.flags["mk-shadowdark"].tavernGeneratorTables.firstPart,
    "RollTable.destination-first",
  );
});

test("GM Screen import validates the transfer format and leaves ambiguous table names unresolved", () => {
  assert.throws(
    () => validateExport({ format: "other", schema: TRANSFER_SCHEMA, configuration: {} }),
    /not an MK-Shadowdark GM Screen export/,
  );
  assert.throws(
    () => validateExport({ format: TRANSFER_FORMAT, schema: 99, configuration: {} }),
    /Unsupported GM Screen export schema/,
  );

  const tables = [table("RollTable.one", "Same Name"), table("RollTable.two", "Same Name")];
  assert.equal(
    remapTableUuid("World.other.RollTable.old", [{ uuid: "World.other.RollTable.old", name: "Same Name" }], tables),
    "World.other.RollTable.old",
  );
  const normalized = normalizeTransferConfiguration({ configuration: {} });
  assert.equal(normalized.compositions.nameComposition.twoSyllableChance, 50);
});

test("GM Screen transfer is loaded and uses a scene-named JSON filename", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/gm-screen-transfer.js"), true);
  assert.match(runtime, /data-mk-gm-screen-transfer/);
  assert.equal(safeFilename("Ashen Keep / Level 1"), "mk-shadowdark-gm-screen-ashen-keep-level-1.json");
});

test("GM Screen export uses Foundry's native file-save workflow", () => {
  const calls = [];
  const payload = { sourceScene: { name: "Ashen Keep" }, configuration: {} };
  const result = downloadExport(payload, {
    saveDataToFile: (...args) => calls.push(args),
  });

  assert.equal(result, payload);
  assert.deepEqual(calls, [[
    JSON.stringify(payload, null, 2),
    "application/json",
    "mk-shadowdark-gm-screen-ashen-keep.json",
  ]]);
});
