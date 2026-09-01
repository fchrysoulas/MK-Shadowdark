import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildQuickRules,
  renderQuickRules,
} from "../scripts/gm-screen/quick-rules.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/quick-rules.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function customContext() {
  return {
    terrain: "Bog",
    period: "night",
    dangerLevel: "ominous",
    profile: {
      name: "Internal Rules Definition",
      explorationTurnSeconds: 900,
      dangerLevels: {
        ominous: {
          label: "Ominous",
          interval: 4,
          formula: "1d8",
          encounterOn: [1, 2],
        },
      },
      optionalProcedures: {
        intent: true,
        surpriseDice: true,
      },
      outcomes: {
        distance: {
          formula: "1d4",
          results: [
            { min: 1, max: 2, label: "Near" },
            { min: 3, max: 4, label: "Far" },
          ],
        },
        activity: {
          formula: "1d6",
          results: [{ min: 1, max: 6, label: "Searching" }],
        },
        reaction: {
          formula: "1d12",
          results: [{ min: 1, max: 12, label: "Uncertain" }],
        },
        intent: {
          formula: "1d10",
          results: [{ min: 1, max: 10, label: "Observe" }],
        },
        treasure: {
          formula: "1d3",
          results: [{ min: 1, max: 3, label: "Cache" }],
        },
      },
      surprise: {
        formula: "1d8",
        surprisedOn: [1, 2],
      },
      morale: {
        dc: 12,
        ability: "cha",
      },
    },
  };
}

test("Quick Rules follow the canonical encounter rules without exposing a Profile", () => {
  const rules = buildQuickRules(customContext());

  assert.equal(Object.hasOwn(rules, "profileName"), false);
  assert.equal(rules.terrain, "Bog");
  assert.equal(rules.period, "night");
  // Exploration duration is a canonical six-minute Shadowdark turn. Legacy
  // internal Profile data cannot override the runtime procedure duration.
  assert.equal(rules.exploration.turnSeconds, 360);
  assert.equal(rules.exploration.turnLabel, "6 minutes");
  assert.deepEqual(rules.activeDanger, {
    label: "Ominous",
    interval: 4,
    intervalUnit: "turns",
    formula: "1d8",
    encounterOn: "1, 2",
  });
  assert.equal(rules.distance.formula, "1d4");
  assert.equal(rules.intent.enabled, true);
  assert.equal(rules.intent.formula, "1d10");
  assert.equal(rules.surprise.enabled, true);
  assert.equal(rules.surprise.formula, "1d8");
  assert.equal(rules.morale.dc, 12);
  assert.equal(rules.morale.ability, "CHA");
});

test("Quick Rules identify disabled optional procedures without Profile language", () => {
  const context = customContext();
  context.profile.optionalProcedures.intent = false;
  context.profile.optionalProcedures.surpriseDice = false;
  const rules = buildQuickRules(context);
  const html = renderQuickRules(rules);

  assert.equal(rules.intent.enabled, false);
  assert.equal(rules.surprise.enabled, false);
  assert.match(html, /Intent:<\/strong> disabled\./);
  assert.match(html, /Expanded surprise dice:<\/strong> disabled/);
  assert.doesNotMatch(html, /Active Profile/);
  assert.doesNotMatch(html, /Profile:<\/strong>/);
  assert.doesNotMatch(html, /in this profile/i);
});

test("Quick Rules retain canonical Rest constants while encounter rules remain dynamic", () => {
  const rules = buildQuickRules(customContext());
  assert.equal(rules.rest.turnSeconds, 3600);
  assert.equal(rules.rest.turnLabel, "1 hour");
  assert.equal(rules.rest.totalTurns, 8);
  assert.equal(rules.rest.totalLabel, "8 hours");
});

test("Quick Rules runtime is retired from the GM Screen manifest", () => {
  assert.match(runtime, /workspace\.innerHTML = renderQuickRules\(buildQuickRules\(context\)\)/);
  assert.match(runtime, /resolveSceneEnvironmentContext\(\)/);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/quick-rules.js"), false);
});

test("Quick Rules and GM Screen operational controllers are excluded while the feature is disabled", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/morale-controls.js"), false);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/quick-rules.js"), false);
});
