import test from "node:test";
import assert from "node:assert/strict";

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
  buildTimePassesPayload,
  presentTimePasses,
  timePasses,
} = await import("../scripts/time-passes/time-passes-splash.js");

Object.assign(globalThis, importGlobals);

function makeElement() {
  return {
    id: "",
    src: "",
    alt: "",
    textContent: "",
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {},
  };
}

function installPresentationRuntime({ enabled = true } = {}) {
  const previous = {
    game: globalThis.game,
    ui: globalThis.ui,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    setTimeout: globalThis.setTimeout,
    Roll: globalThis.Roll,
    ChatMessage: globalThis.ChatMessage,
  };
  const emitted = [];
  const appended = [];
  let rollConstructed = false;

  globalThis.game = {
    user: { id: "gm", isGM: true },
    settings: {
      get(_moduleId, key) {
        if (key === "timePassesEnabled") return enabled;
        if (key === "timePassesPreText") return "time passes...";
        if (key === "timePassesPreDurationMs") return 2000;
        if (key === "timePassesPreShowProgress") return true;
        if (key === "timePassesFontFamily") return "serif";
        if (key === "timePassesTitleFontSizePx") return 44;
        if (key === "timePassesSkullIconPath") return "icons/svg/skull.svg";
        if (key === "timePassesSkullSizePx") return 34;
        throw new Error(`Unknown setting ${key}`);
      },
    },
    socket: {
      emit(channel, event) {
        emitted.push({ channel, event });
      },
    },
  };
  globalThis.ui = { notifications: { warn: () => {} } };
  globalThis.document = {
    getElementById: () => null,
    createElement: () => makeElement(),
    body: {
      appendChild(element) {
        appended.push(element);
      },
    },
  };
  globalThis.requestAnimationFrame = callback => callback();
  globalThis.setTimeout = callback => {
    callback();
    return 1;
  };
  globalThis.Roll = class ForbiddenRoll {
    constructor() {
      rollConstructed = true;
      throw new Error("Time Passes must not roll encounter dice.");
    }
  };
  globalThis.ChatMessage = new Proxy({}, {
    get() {
      throw new Error("Time Passes must not create encounter roll ChatMessages.");
    },
  });

  return {
    emitted,
    appended,
    get rollConstructed() {
      return rollConstructed;
    },
    restore() {
      Object.assign(globalThis, previous);
    },
  };
}

test("legacy timePasses alias remains presentation-only", () => {
  assert.equal(timePasses, presentTimePasses);
});

test("payload builder accepts old preText/preDuration options but contains no encounter roll state", () => {
  const runtime = installPresentationRuntime();

  try {
    const payload = buildTimePassesPayload({
      preText: "Six minutes pass...",
      preDurationMs: 800,
      preShowProgress: false,
      rollFormula: "3d6",
      diceCount: 3,
      encounterText: "ENCOUNTER!",
    });

    assert.equal(payload.title, "Six minutes pass...");
    assert.equal(payload.durationMs, 800);
    assert.equal(payload.showProgress, false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "rollFormula"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "diceCount"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "encounterText"), false);
  } finally {
    runtime.restore();
  }
});

test("Time Passes broadcasts only presentation and never rolls or returns encounter state", async () => {
  const runtime = installPresentationRuntime();

  try {
    const result = await presentTimePasses({
      title: "A turn passes...",
      durationMs: 500,
      showProgress: true,
      rollFormula: "3d6",
      diceCount: 3,
    });

    assert.equal(result.presented, true);
    assert.equal(result.payload.title, "A turn passes...");
    assert.equal(runtime.rollConstructed, false);
    assert.equal(runtime.emitted.length, 1);
    assert.equal(runtime.appended.length, 1);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "isEncounter"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "roll"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(result, "diceCount"), false);
  } finally {
    runtime.restore();
  }
});

test("disabled Time Passes performs no presentation work", async () => {
  const runtime = installPresentationRuntime({ enabled: false });

  try {
    const result = await presentTimePasses();
    assert.equal(result, null);
    assert.equal(runtime.emitted.length, 0);
    assert.equal(runtime.appended.length, 0);
    assert.equal(runtime.rollConstructed, false);
  } finally {
    runtime.restore();
  }
});
