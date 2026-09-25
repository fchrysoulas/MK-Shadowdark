import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMagicItemData,
  createMagicItem,
  magicItemGeneratorDialogContent,
  rollMagicItemFromSource,
} from "../scripts/gm-screen/magic-item-generator.js";
import { MAGIC_ITEM_GENERATOR_TABLE_KEYS } from "../scripts/gm-screen/magic-item-generator-settings.js";

function generatedStatus() {
  return {
    available: true,
    missing: [],
    unavailable: [],
    tables: Object.fromEntries(MAGIC_ITEM_GENERATOR_TABLE_KEYS.map(key => [key, {
      id: key,
      uuid: `RollTable.${key}`,
      name: `${key} table`,
    }])),
  };
}

test("Magic Item Generator rolls all three linked fields", async () => {
  const values = {
    type: "Type: Weapon",
    qualities: "Qualities: Opens sealed doors",
    personality: "Personality: Curious",
  };
  let index = 0;
  const result = await rollMagicItemFromSource({
    status: generatedStatus(),
    rollTable: async table => {
      const key = MAGIC_ITEM_GENERATOR_TABLE_KEYS[index++];
      return {
        total: index,
        result: { text: values[key] },
        table,
      };
    },
  });

  assert.equal(result.mode, "generated");
  assert.deepEqual(result.results, {
    type: "Weapon",
    qualities: "Opens sealed doors",
    personality: "Curious",
  });
  assert.deepEqual(result.rolls, {
    type: 1,
    qualities: 2,
    personality: 3,
  });
});

test("Magic Item preview and native Basic Item data include every assigned field", () => {
  const result = {
    results: {
      type: "Weapon",
      qualities: "Opens sealed doors",
      personality: "Curious",
    },
    name: "Moonlit Key",
  };
  const dialog = magicItemGeneratorDialogContent(result);
  const data = buildMagicItemData({ name: "Moonlit Key", result });

  for (const value of Object.values(result.results)) {
    assert.match(dialog, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(data.system.description, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(dialog, /name="name"/);
  assert.equal(data.name, "Moonlit Key");
  assert.equal(data.type, "Basic");
  assert.equal(data.system.magicItem, true);
});

test("Magic Item creation pins and opens the generated native Item", async () => {
  const previousItem = globalThis.Item;
  let itemData = null;
  let rendered = false;
  try {
    globalThis.Item = {
      implementation: {
        async create(data) {
          itemData = data;
          return {
            uuid: "Item.generated-magic-item",
            sheet: { render(force) { rendered = force; } },
          };
        },
      },
    };

    const item = await createMagicItem({
      name: "Synthetic Magic Item",
      result: { results: { name: "Synthetic Magic Item" } },
    });

    assert.ok(item);
    assert.equal(itemData.name, "Synthetic Magic Item");
    assert.equal(itemData.type, "Basic");
    assert.equal(itemData.system.magicItem, true);
    assert.equal(rendered, true);
  } finally {
    globalThis.Item = previousItem;
  }
});
