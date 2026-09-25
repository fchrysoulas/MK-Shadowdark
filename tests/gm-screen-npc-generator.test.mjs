import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildNpcActorData,
  createNpcActor,
  npcGeneratorDialogContent,
  npcProfileDescription,
} from "../scripts/gm-screen/npc-generator.js";
import {
  linkedNpcTraitStatus,
  NPC_ABILITY_KEYS,
  npcAbilityModifier,
  rollNpcProfileFromSource,
} from "../scripts/gm-screen/npc-source-tables.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const generatorRuntime = fs.readFileSync(new URL("../scripts/gm-screen/npc-generator.js", import.meta.url), "utf8");
const sourceRuntime = fs.readFileSync(new URL("../scripts/gm-screen/npc-source-tables.js", import.meta.url), "utf8");

function table({ id, name, results, totals = [1] }) {
  let index = 0;
  return {
    id,
    uuid: `RollTable.${id}`,
    name,
    formula: "1d1",
    results: results.map((text, resultIndex) => ({
      id: `${id}-${resultIndex}`,
      range: [resultIndex + 1, resultIndex + 1],
      text,
    })),
    async roll() {
      const total = totals[index++] ?? totals.at(-1) ?? 1;
      const result = this.results.find(entry => total >= entry.range[0] && total <= entry.range[1]);
      return { roll: { total }, results: result ? [result] : [] };
    },
  };
}

function linkedNpcTables() {
  const ancestry = table({
    id: "linked-ancestry",
    name: "Linked Ancestry",
    results: ["Ancestry: Goblin"],
  });
  const age = table({
    id: "linked-age",
    name: "Linked Age",
    results: ["Age: Young"],
  });
  const alignment = table({
    id: "linked-alignment",
    name: "Linked Alignment",
    results: ["Alignment: Chaotic"],
  });
  const wealth = table({
    id: "linked-wealth",
    name: "Linked Wealth",
    results: ["Wealth: Poor"],
  });
  const featureA = table({
    id: "linked-feature-a",
    name: "Linked Feature A",
    results: ["Feature: Alert"],
  });
  const featureB = table({
    id: "linked-feature-b",
    name: "Linked Feature B",
    results: ["Feature: Scarred"],
  });
  const occupation = table({
    id: "linked-occupation",
    name: "Linked Occupation",
    results: ["Occupation: Scout"],
  });
  return {
    tables: [ancestry, age, alignment, wealth, featureA, featureB, occupation],
    assignments: {
      ancestry: ancestry.uuid,
      age: age.uuid,
      alignment: alignment.uuid,
      wealth: wealth.uuid,
      features: [featureA.uuid, featureB.uuid],
      occupation: occupation.uuid,
    },
  };
}

function nameTables() {
  const prefix = table({ id: "linked-prefix", name: "Linked Prefix", results: ["Ka"] });
  const syllables = table({ id: "linked-syllable", name: "Linked Syllable", results: ["ra"] });
  const suffix = table({ id: "linked-suffix", name: "Linked Suffix", results: ["th"] });
  const identifier = table({ id: "linked-identifier", name: "Linked Identifier", results: [" the Swift"] });
  return {
    tables: [prefix, syllables, suffix, identifier],
    assignment: {
      prefix: prefix.uuid,
      syllables: [syllables.uuid],
      suffix: suffix.uuid,
      identifier: identifier.uuid,
      secondSyllableChance: 0,
      thirdSyllableChance: 0,
    },
  };
}

test("linked NPC status reports missing Scene-linked trait tables", () => {
  const { tables, assignments } = linkedNpcTables();
  const status = linkedNpcTraitStatus(tables, { traitTables: assignments });

  assert.equal(status.available, true);
  assert.deepEqual(status.tables.traitTables, { schema: 1, ...assignments });
  assert.equal(status.tables.featureTables.length, 2);

  const missing = linkedNpcTraitStatus(tables, {
    traitTables: { ...assignments, occupation: "" },
  });
  assert.equal(missing.available, false);
  assert.ok(missing.missing.includes("Occupation"));
});

test("imported Core-looking tables are ignored when Scene links are missing", () => {
  const coreLookingTable = table({
    id: "core-npc-ancestry",
    name: "Shadowdark RPG Core Rulebook — NPCs — Ancestry",
    results: ["Ancestry: Human"],
  });
  const status = linkedNpcTraitStatus([coreLookingTable], { traitTables: {} });

  assert.equal(status.available, false);
  assert.ok(status.missing.includes("Ancestry"));
  assert.ok(status.missing.includes("Occupation"));
  assert.equal(status.tables.ancestry, null);
});

test("NPC generation rolls only the linked trait and name composition tables", async () => {
  const traits = linkedNpcTables();
  const names = nameTables();
  const abilityScores = [3, 5, 7, 9, 13, 18];
  const profile = await rollNpcProfileFromSource({
    tables: [...traits.tables, ...names.tables],
    traitTables: traits.assignments,
    nameComposition: names.assignment,
    rollDie: async () => 100,
    rollAbility: async () => abilityScores.shift(),
  });

  assert.equal(profile.name, "Karath the Swift");
  assert.equal(profile.identifier, "the Swift");
  assert.equal(profile.ancestry, "Goblin");
  assert.equal(profile.age, "Young");
  assert.equal(profile.alignment, "Chaotic");
  assert.equal(profile.wealth, "Poor");
  assert.deepEqual(profile.features, ["Alert", "Scarred"]);
  assert.equal(profile.occupation, "Scout");
  assert.equal(profile.featuresAreCustom, true);
  assert.equal(profile.rolls.features.length, 2);
  assert.deepEqual(profile.rolls.abilities, { str: 3, dex: 5, con: 7, int: 9, wis: 13, cha: 18 });
  assert.deepEqual(profile.abilities.str, {
    key: "str",
    label: "Strength",
    formula: "3d6",
    roll: 3,
    score: 3,
    modifier: -4,
  });
  assert.equal(profile.abilities.dex.modifier, -3);
  assert.equal(profile.abilities.cha.modifier, 4);
  assert.equal(profile.sources.features.length, 2);
  assert.equal(profile.sources.ancestry.source, "scene-linked");
  assert.match(npcProfileDescription(profile), /Features:<\/strong> Alert; Scarred/);
  assert.match(npcProfileDescription(profile), /Strength \(STR\):<\/strong> 3 \(-4\)/);
  assert.doesNotMatch(npcProfileDescription(profile), /3d6 total|modifier:/);
  assert.ok(npcProfileDescription(profile).indexOf("Name:</strong>") < npcProfileDescription(profile).indexOf("Identifier:</strong>"));
  assert.ok(npcProfileDescription(profile).indexOf("Identifier:</strong>") < npcProfileDescription(profile).indexOf("Features:</strong>"));
  assert.ok(npcProfileDescription(profile).indexOf("Features:</strong>") < npcProfileDescription(profile).indexOf("Ancestry:</strong>"));
  assert.doesNotMatch(npcProfileDescription(profile), /Appearance:<\/strong>/);
});

test("NPC ability rolling uses Shadowdark's six-stat order and modifier bands", async () => {
  const formulas = [];
  const scores = [4, 6, 8, 10, 12, 16];
  const profile = await rollNpcProfileFromSource({
    tables: [],
    traitTables: {},
    nameComposition: {},
    rollAbility: async formula => {
      formulas.push(formula);
      return scores.shift();
    },
  });

  assert.deepEqual(formulas, ["3d6", "3d6", "3d6", "3d6", "3d6", "3d6"]);
  assert.deepEqual(Object.keys(profile.abilities), NPC_ABILITY_KEYS);
  assert.deepEqual(
    NPC_ABILITY_KEYS.map(key => profile.abilities[key].modifier),
    [-3, -2, -1, 0, 1, 3],
  );
  assert.equal(npcAbilityModifier(18), 4);
});

test("NPC generation leaves missing name composition entries blank", async () => {
  const traits = linkedNpcTables();
  const profile = await rollNpcProfileFromSource({
    tables: traits.tables,
    traitTables: traits.assignments,
    nameComposition: {},
  });

  assert.equal(profile.name, "");
  assert.equal(profile.identifier, "");
  assert.equal(profile.rolls.nameComposition.syllableCount, 0);
});

test("NPC generation leaves missing trait entries blank and requires only a name", async () => {
  const profile = await rollNpcProfileFromSource({
    tables: [],
    traitTables: {},
    nameComposition: {},
  });

  assert.equal(profile.ancestry, "");
  assert.equal(profile.age, "");
  assert.equal(profile.alignment, "");
  assert.equal(profile.wealth, "");
  assert.deepEqual(profile.features, []);
  assert.equal(profile.occupation, "");
  assert.match(npcGeneratorDialogContent(profile), /name="name"[^>]+required/);
});

test("generated profile formats linked result values without roll or source metadata", () => {
  const profile = {
    name: "Karath the Swift",
    identifier: "the Swift",
    ancestry: "Goblin",
    alignment: "Chaotic",
    age: "Young",
    wealth: "Poor",
    features: ["Alert", "Scarred"],
    featuresAreCustom: true,
    occupation: "Scout",
    sourceBookTitle: "Scene-linked RollTables",
    rolls: { ancestry: 1, alignment: 1, age: 1, wealth: 1, features: [1, 1], occupation: 1 },
    sources: {},
  };
  const description = npcProfileDescription(profile);
  assert.match(description, /Ancestry:<\/strong> Goblin/);
  assert.match(description, /Features:<\/strong> Alert; Scarred/);
  assert.match(description, /Occupation:<\/strong> Scout/);
  assert.doesNotMatch(description, /d20|PDF|Shadowdark RPG Core Rulebook|>1</);
  const dialog = npcGeneratorDialogContent(profile);
  assert.match(dialog, /<dt>Identifier<\/dt><dd>the Swift<\/dd>/);
  assert.doesNotMatch(dialog, /Appearance|Does|Secret|Shadowdark RPG Core Rulebook/);
  assert.equal(buildNpcActorData("Karath the Swift").type, "NPC");
});

test("Actor creation stores the generated linked profile before opening the sheet", async () => {
  const previousActor = globalThis.Actor;
  let actorData = null;
  let rendered = false;
  try {
    globalThis.Actor = {
      implementation: {
        async create(data) {
          actorData = data;
          return {
            sheet: { render(force) { rendered = force; } },
          };
        },
      },
    };
    const actor = await createNpcActor({
      name: "Synthetic NPC",
      profile: {
        name: "Synthetic NPC",
        ancestry: "Human",
        alignment: "Lawful",
        age: "Adult",
        wealth: "Standard",
        features: ["Nods"],
        featuresAreCustom: true,
        occupation: "Scout",
        identifier: "the Quick",
        abilities: {
          str: { score: 3, roll: 3, modifier: -4 },
          dex: { score: 5, roll: 5, modifier: -3 },
          con: { score: 7, roll: 7, modifier: -2 },
          int: { score: 9, roll: 9, modifier: -1 },
          wis: { score: 13, roll: 13, modifier: 1 },
          cha: { score: 18, roll: 18, modifier: 4 },
        },
      },
    });
    assert.ok(actor);
    assert.equal(actorData.name, "Synthetic NPC");
    assert.equal(actorData.type, "NPC");
    assert.match(actorData.system.notes, /Ancestry:<\/strong> Human/);
    assert.deepEqual(actorData.system.abilities, {
      str: { mod: -4 },
      dex: { mod: -3 },
      con: { mod: -2 },
      int: { mod: -1 },
      wis: { mod: 1 },
      cha: { mod: 4 },
    });
    assert.doesNotMatch(actorData.system.notes, /Appearance|Does|Secret|Shadowdark RPG Core Rulebook/);
    assert.equal(rendered, true);
  } finally {
    globalThis.Actor = previousActor;
  }
});

test("NPC runtime has no imported Core discovery or fallback path", () => {
  assert.doesNotMatch(sourceRuntime, /shadowdark-core-v4\.9|Shadowdark RPG Core Rulebook|findImportedSourceTable|rollSecondD4|occupationMatrix/);
  assert.doesNotMatch(generatorRuntime, /shadowdark-core-v4\.9|Shadowdark RPG Core Rulebook|Import \/ Update Source Tables|openSourceTableImporter/);
  assert.match(sourceRuntime, /linkedNpcTraitStatus/);
  assert.match(generatorRuntime, /NPC Name is required/);
});

test("NPC creation has no macro or module API surface", () => {
  assert.doesNotMatch(generatorRuntime, /module\.api\.npcGenerator|exposeNpcGeneratorApi|registerNpcGenerator/);
  assert.doesNotMatch(manifest.esmodules.join("\n"), /macros\/create-npc\.js/);
  assert.equal(fs.existsSync(new URL("../macros/create-npc.js", import.meta.url)), false);
});

test("source NPC creation controller is loaded by the Settlement workspace", () => {
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/exploration-creation-controls.js"));
  assert.equal(manifest.esmodules.indexOf("scripts/gm-screen/npc-creation-controls.js"), -1);
});
