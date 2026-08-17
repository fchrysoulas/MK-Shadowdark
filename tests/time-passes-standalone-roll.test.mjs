import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeSource = fs.readFileSync(
  path.join(ROOT, "scripts/time-passes/time-passes-splash.js"),
  "utf8"
);
const groupTimeSource = fs.readFileSync(
  path.join(ROOT, "scripts/group-sheet/time.js"),
  "utf8"
);

const importGlobals = {
  Hooks: globalThis.Hooks,
  game: globalThis.game,
  ui: globalThis.ui,
};

globalThis.Hooks = { once: () => {} };
globalThis.game = {
  settings: { get: () => undefined },
  modules: { get: () => null },
};
globalThis.ui = { notifications: { warn: () => {} } };

const {
  buildEncounterCuePayload,
  buildTimePassesPayload,
  normalizeDiceCount,
  rollContainsResult,
  timePasses,
} = await import("../scripts/time-passes/time-passes-splash.js");

Object.assign(globalThis, importGlobals);

function installRuntime({ enabled = true, results = [] } = {}) {
  const previous = {
    game: globalThis.game,
    ui: globalThis.ui,
    Roll: globalThis.Roll,
    ChatMessage: globalThis.ChatMessage,
    CONST: globalThis.CONST,
    setTimeout: globalThis.setTimeout,
  };
  const splashMessages = [];
  const rollMessages = [];
  const formulas = [];

  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: {
      get(_moduleId, key) {
        const values = {
          timePassesEnabled: enabled,
          timePassesPreText: "time passes...",
          timePassesPreDurationMs: 500,
          timePassesPreShowProgress: true,
          timePassesEncounterText: "ENCOUNTER!",
          timePassesEncounterDurationMs: 750,
          timePassesEncounterShowSkull: true,
          timePassesRollFormula: "1d6",
          timePassesRollFlavor: "Time Passes",
          timePassesFontFamily: "serif",
          timePassesTitleFontSizePx: 44,
          timePassesSkullIconPath: "icons/svg/skull.svg",
          timePassesSkullSizePx: 34,
        };
        return values[key];
      },
    },
  };
  globalThis.ui = { notifications: { warn: () => {} } };
  globalThis.CONST = {
    CHAT_MESSAGE_STYLES: { OTHER: 0 },
    DICE_ROLL_MODES: { PUBLIC: "publicroll" },
  };
  globalThis.ChatMessage = {
    getSpeaker: () => ({ alias: "GM" }),
    async create(data) {
      splashMessages.push(data);
      return { delete: async () => {} };
    },
  };
  globalThis.Roll = class TestRoll {
    constructor(formula) {
      this.formula = formula;
      this.terms = [{
        faces: 6,
        results: results.map(result => ({ result })),
      }];
      formulas.push(formula);
    }

    async evaluate() {
      return this;
    }

    async toMessage(data, options) {
      rollMessages.push({ data, options });
      return this;
    }
  };
  globalThis.setTimeout = callback => {
    callback();
    return 1;
  };

  return {
    formulas,
    rollMessages,
    splashMessages,
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("Time Passes limits its standalone selector to one, two, or three d6", () => {
  assert.equal(normalizeDiceCount(1), 1);
  assert.equal(normalizeDiceCount(2), 2);
  assert.equal(normalizeDiceCount(3), 3);
  assert.equal(normalizeDiceCount(9), 1);
});

test("Time Passes keeps the v1.6 splash payload without encounter state", () => {
  const payload = buildTimePassesPayload({
    preText: "Six minutes pass...",
    preDurationMs: 800,
    preShowProgress: false,
    diceCount: 3,
    encounterText: "ENCOUNTER!",
  });

  assert.equal(payload.title, "Six minutes pass...");
  assert.equal(payload.durationMs, 800);
  assert.equal(payload.showProgress, false);
  assert.equal(Object.hasOwn(payload, "diceCount"), false);
  assert.equal(Object.hasOwn(payload, "encounterText"), false);
});

test("the original encounter cue payload remains visual-only", () => {
  const payload = buildEncounterCuePayload();

  assert.equal(payload.title, "ENCOUNTER!");
  assert.equal(payload.durationMs, 2000);
  assert.equal(payload.showProgress, false);
  assert.equal(payload.showSkull, true);
  assert.equal(Object.hasOwn(payload, "encounter"), false);
});

test("Time Passes shows one splash then publishes the selected standalone roll", async () => {
  const runtime = installRuntime();

  try {
    const result = await timePasses({ diceCount: 3, durationMs: 500 });

    assert.deepEqual(runtime.formulas, ["3d6"]);
    assert.equal(runtime.splashMessages.length, 1);
    assert.equal(runtime.rollMessages.length, 1);
    assert.equal(runtime.rollMessages[0].options.rollMode, "publicroll");
    assert.equal(result.diceCount, 3);
    assert.equal(result.roll.formula, "3d6");
    assert.equal(result.encounterCueShown, false);
  } finally {
    runtime.restore();
  }
});

test("any d6 result of 1 shows the old encounter cue after the public roll", async () => {
  const runtime = installRuntime({ results: [6, 1, 4] });

  try {
    const result = await timePasses({ diceCount: 3, durationMs: 500 });

    assert.equal(result.encounterCueShown, true);
    assert.equal(runtime.splashMessages.length, 2);
    assert.equal(runtime.splashMessages[1].flags["mk-shadowdark"].timePassesSplash.title, "ENCOUNTER!");
    assert.equal(runtime.splashMessages[1].flags["mk-shadowdark"].timePassesSplash.showSkull, true);
    assert.equal(runtime.rollMessages.length, 1);
  } finally {
    runtime.restore();
  }
});

test("visual result matching works across the selected d6 terms", () => {
  assert.equal(rollContainsResult({ terms: [{ faces: 6, results: [{ result: 2 }, { result: 1 }] }] }, 6, 1), true);
  assert.equal(rollContainsResult({ terms: [{ faces: 6, results: [{ result: 2 }, { result: 3 }] }] }, 6, 1), false);
});

test("Time Passes has no encounter-service bridge or Group Time integration", () => {
  assert.doesNotMatch(runtimeSource, /isEncounter|rollHasAnyDieResult/);
  assert.doesNotMatch(runtimeSource, /encounterService|checkAndResolve|processDueExplorationEncounters/);
  assert.match(runtimeSource, /encounterLinked:\s*false/);
  assert.doesNotMatch(groupTimeSource, /timePasses|Time Passes/);
});

test("disabled Time Passes performs no splash or roll", async () => {
  const runtime = installRuntime({ enabled: false });

  try {
    assert.equal(await timePasses({ diceCount: 2 }), null);
    assert.equal(runtime.splashMessages.length, 0);
    assert.equal(runtime.formulas.length, 0);
  } finally {
    runtime.restore();
  }
});
