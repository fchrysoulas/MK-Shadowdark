import assert from "node:assert/strict";
import test from "node:test";

import { renderEncounterCard } from "../scripts/encounter-engine/chat.js";

function encounterData(overrides = {}) {
  return {
    schema: 2,
    profileName: "Legacy Hidden Profile",
    sceneName: "Old Road",
    terrain: "Road",
    dangerLevel: "unsafe",
    dangerLabel: "Unsafe",
    period: "day",
    tableName: "Road Encounters",
    disposition: "neutral",
    encounter: {
      count: 2,
      label: "Goblin",
      numberFormula: "1d4",
    },
    distance: { label: "Near" },
    activity: { label: "Hunting" },
    awareness: { label: "Determine during play", optional: false },
    reaction: { label: "Neutral" },
    treasure: { label: "No treasure" },
    morale: { label: "DC 15 WIS", trigger: "At half strength", modifier: 0, ability: "wis" },
    ...overrides,
  };
}

test("GM encounter card never renders legacy Profile name", () => {
  const html = renderEncounterCard(encounterData());

  assert.doesNotMatch(html, /Legacy Hidden Profile/);
  assert.match(html, /mk-sd-encounter-footer">Old Road<\/footer>/);
  assert.match(html, /Reveal to Players/);
});

test("revealed encounter card never renders legacy Profile name", () => {
  const html = renderEncounterCard(encounterData(), { publicCard: true });

  assert.doesNotMatch(html, /Legacy Hidden Profile/);
  assert.match(html, /mk-sd-encounter-footer">Old Road<\/footer>/);
  assert.doesNotMatch(html, /Reveal to Players|Reroll All|Morale/);
});

test("encounter footer is omitted when no Scene name exists", () => {
  const html = renderEncounterCard(encounterData({ sceneName: "" }));

  assert.doesNotMatch(html, /mk-sd-encounter-footer/);
  assert.doesNotMatch(html, /Legacy Hidden Profile/);
});
