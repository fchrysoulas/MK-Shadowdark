import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMonsterActorData,
  buildMonsterAttackData,
  createMonsterActor,
  getActivePartyLevel,
  monsterActorNotes,
  monsterCombatStats,
  monsterGeneratorDialogContent,
  rollMonsterFromSource,
} from "../scripts/gm-screen/monster-generator.js";
import { MONSTER_GENERATOR_TABLE_KEYS } from "../scripts/gm-screen/monster-generator-settings.js";

function generatedStatus() {
  return {
    available: true,
    missing: [],
    unavailable: [],
    tables: Object.fromEntries(MONSTER_GENERATOR_TABLE_KEYS.map(key => [key, {
      id: key,
      uuid: `RollTable.${key}`,
      name: `${key} table`,
    }])),
  };
}

function generatedResult() {
  return {
    name: "Generated Monster",
    results: {
      combat: "Combat: +5",
      quality: "Quality result",
      strength: "Strength result",
      weakness: "Weakness result",
      mutation1: "Mutation one",
      mutation2: "Mutation two",
      mutation3: "Mutation three",
    },
    partyLevel: { average: 3.5, value: 4, memberCount: 2 },
    combat: {
      partyLevel: 4,
      ac: 14,
      attackBonus: 5,
      level: 5,
    },
    attackCount: 3,
  };
}

test("Monster Generator rolls all seven linked fields and derives native combat stats", async () => {
  const values = {
    combat: "+5",
    quality: "Crystalline hide",
    strength: "Unnatural speed",
    weakness: "Bright light",
    mutation1: "Split jaw",
    mutation2: "Living shadow",
    mutation3: "Extra eyes",
  };
  let index = 0;
  const result = await rollMonsterFromSource({
    status: generatedStatus(),
    partyLevel: { average: 3.5, value: 4, memberCount: 2 },
    rollFormula: async formula => {
      assert.equal(formula, "1d4");
      return 3;
    },
    rollTable: async table => {
      const key = MONSTER_GENERATOR_TABLE_KEYS[index++];
      return {
        total: index,
        result: { text: values[key] },
        table,
      };
    },
  });

  assert.equal(result.mode, "generated");
  assert.deepEqual(result.results, values);
  assert.deepEqual(result.rolls, {
    combat: 1,
    quality: 2,
    strength: 3,
    weakness: 4,
    mutation1: 5,
    mutation2: 6,
    mutation3: 7,
  });
  assert.equal(result.partyLevel.average, 3.5);
  assert.equal(result.combat.ac, 14);
  assert.equal(result.combat.attackBonus, 5);
  assert.equal(result.combat.level, 5);
  assert.equal(result.attackCount, 3);
  assert.equal(result.damageFormula, "1d8");
});

test("Monster Combat result supplies attack bonus and level while party level supplies AC", () => {
  assert.deepEqual(monsterCombatStats("Combat +3, LV 6", 2), {
    partyLevel: 2,
    ac: 12,
    attackBonus: 3,
    level: 6,
  });
  assert.deepEqual(monsterCombatStats("+4", 3), {
    partyLevel: 3,
    ac: 13,
    attackBonus: 4,
    level: 4,
  });
});

test("Monster Generator calculates PL from active Player actor levels", async () => {
  const levels = {
    "Actor.one": { type: "Player", system: { level: { value: 3 } } },
    "Actor.two": { type: "Player", system: { level: { value: 4 } } },
    "Actor.npc": { type: "NPC", system: { level: { value: 10 } } },
  };
  const summary = await getActivePartyLevel({
    groupData: { activeMembers: ["Actor.one", "Actor.two", "Actor.npc"] },
    resolveActor: async uuid => levels[uuid] ?? null,
  });

  assert.deepEqual(summary, { average: 3.5, value: 4, memberCount: 2 });
});

test("Monster preview and NPC actor data include every assigned field and native attack", () => {
  const result = generatedResult();
  const dialog = monsterGeneratorDialogContent(result);
  const notes = monsterActorNotes(result, "Ash Beast");
  const data = buildMonsterActorData({ name: "Ash Beast", result });
  const attack = buildMonsterAttackData(result);

  for (const value of Object.values(result.results)) {
    assert.match(dialog, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(notes, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(dialog, /name="name"/);
  assert.match(dialog, /Party Level/);
  assert.match(dialog, /Armor Class/);
  assert.equal(data.name, "Ash Beast");
  assert.equal(data.type, "NPC");
  assert.equal(data.system.attributes.ac.value, 14);
  assert.equal(data.system.level.value, 5);
  assert.equal(data.items.length, 1);
  assert.deepEqual(attack.system.attack, { num: 3 });
  assert.equal(attack.system.bonuses.attackBonus, 5);
  assert.equal(attack.system.damage.value, "1d8");
});

test("Monster Actor creation pins and opens the generated NPC", async () => {
  const previousActor = globalThis.Actor;
  let actorData = null;
  let rendered = false;
  try {
    globalThis.Actor = {
      implementation: {
        async create(data) {
          actorData = data;
          return {
            uuid: "Actor.generated-monster",
            sheet: { render(force) { rendered = force; } },
          };
        },
      },
    };

    const actor = await createMonsterActor({
      name: "Synthetic Monster",
      result: generatedResult(),
    });

    assert.ok(actor);
    assert.equal(actorData.name, "Synthetic Monster");
    assert.equal(actorData.type, "NPC");
    assert.equal(actorData.items[0].type, "NPC Attack");
    assert.equal(actorData.items[0].system.damage.value, "1d8");
    assert.equal(rendered, true);
  } finally {
    globalThis.Actor = previousActor;
  }
});
