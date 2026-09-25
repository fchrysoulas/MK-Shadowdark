import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildLocationDocumentData,
  createExplorationLocation,
  pointOfInterestSuggestedName,
  promptForShadowdarkLocation,
} from "../scripts/gm-screen/exploration-creation-controls.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/exploration-creation-controls.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function saveGlobals(...names) {
  return Object.fromEntries(names.map(name => [name, globalThis[name]]));
}

function restoreGlobals(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
}

function mockDialogV2(wait) {
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: { wait },
      },
    },
  };
}

function syntheticPoint(overrides = {}) {
  const point = {
    descriptorRoll: 8,
    descriptor: "Mossy",
    locationRoll: 7,
    location: "Shrine",
    featureRoll: 9,
    feature: "Unstable",
    source: {
      bookTitle: "Owned Synthetic Source",
      pages: [27],
      tableName: "Synthetic Points",
    },
    ...overrides,
  };
  point.suggestedName = pointOfInterestSuggestedName(point);
  return point;
}

test("point of interest suggested name is built from source-driven Descriptor and Location", () => {
  assert.equal(pointOfInterestSuggestedName(syntheticPoint()), "Mossy Shrine");
});

test("Location creation payload records source-driven rolls in an editable Journal page", () => {
  const point = syntheticPoint();
  const data = buildLocationDocumentData("Mossy Shrine", {
    htmlFormat: 1,
    pointOfInterest: point,
  });

  assert.equal(data.name, "Mossy Shrine");
  assert.equal(data.pages.length, 1);
  assert.equal(data.pages[0].name, "Location");
  assert.equal(data.pages[0].type, "text");
  assert.equal(data.pages[0].text.format, 1);
  assert.match(data.pages[0].text.content, /Mossy Shrine/);
  assert.match(data.pages[0].text.content, /Owned Synthetic Source/);
  assert.match(data.pages[0].text.content, /d20 8/);
  assert.match(data.pages[0].text.content, /Mossy/);
  assert.match(data.pages[0].text.content, /d20 7/);
  assert.match(data.pages[0].text.content, /Shrine/);
  assert.match(data.pages[0].text.content, /d20 9/);
  assert.match(data.pages[0].text.content, /Unstable/);
  assert.match(data.pages[0].text.content, /GM Notes/);
});

test("Location payload remains usable without generated content", () => {
  const data = buildLocationDocumentData("Old Watchtower", { htmlFormat: 1 });
  assert.equal(data.name, "Old Watchtower");
  assert.equal(data.pages[0].text.content, "");
});

test("Roll Again awaits and replaces the whole source-driven point of interest", async () => {
  const saved = saveGlobals("foundry");
  const first = syntheticPoint({
    descriptorRoll: 1,
    descriptor: "First",
    locationRoll: 1,
    location: "Place",
    featureRoll: 1,
    feature: "Feature One",
  });
  const second = syntheticPoint({
    descriptorRoll: 20,
    descriptor: "Second",
    locationRoll: 20,
    location: "City",
    featureRoll: 20,
    feature: "Feature Two",
  });
  first.suggestedName = pointOfInterestSuggestedName(first);
  second.suggestedName = pointOfInterestSuggestedName(second);
  let rollCalls = 0;
  const responses = [
    { action: "reroll" },
    { action: "create", name: "The Second City" },
  ];

  try {
    mockDialogV2(async () => responses.shift());
    const result = await promptForShadowdarkLocation({
      rollPointOfInterest: async () => (rollCalls++ === 0 ? first : second),
    });

    assert.equal(rollCalls, 2);
    assert.equal(result.name, "The Second City");
    assert.equal(result.descriptor, "Second");
    assert.equal(result.location, "City");
    assert.equal(result.feature, "Feature Two");
  } finally {
    restoreGlobals(saved);
  }
});

test("missing linked Location tables are reported before the preview opens", async () => {
  const result = await promptForShadowdarkLocation({
    rollPointOfInterest: async () => null,
  });
  assert.deepEqual(result, { mode: "missing-linked-tables" });
});

test("Create Location uses the current linked combination and opens the Journal", async () => {
  const saved = saveGlobals("game", "foundry", "JournalEntry", "CONST", "ui");
  let createdData = null;
  let rendered = false;
  const point = syntheticPoint();

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => ({ action: "create", name: "Moonfall Shrine" }));
    globalThis.CONST = { JOURNAL_ENTRY_PAGE_FORMATS: { HTML: 1 } };
    globalThis.JournalEntry = {
      implementation: {
        create: async data => {
          createdData = data;
          return { sheet: { render: value => { rendered = value; } } };
        },
      },
    };
    globalThis.ui = { notifications: {} };

    await createExplorationLocation({ rollPointOfInterest: async () => point });
    assert.equal(createdData.name, "Moonfall Shrine");
    assert.equal(createdData.pages[0].type, "text");
    assert.equal(createdData.pages[0].text.format, 1);
    assert.match(createdData.pages[0].text.content, /Mossy/);
    assert.match(createdData.pages[0].text.content, /Shrine/);
    assert.match(createdData.pages[0].text.content, /Unstable/);
    assert.equal(rendered, true);
  } finally {
    restoreGlobals(saved);
  }
});

test("missing linked Location tables do not create a blank Location", async () => {
  const saved = saveGlobals("game", "foundry", "JournalEntry", "CONST", "ui");
  let createCalls = 0;
  const warnings = [];

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => {
      throw new Error("The legacy fallback dialog must not open.");
    });
    globalThis.JournalEntry = {
      implementation: {
        create: async () => {
          createCalls += 1;
          return null;
        },
      },
    };
    globalThis.ui = { notifications: { warn: message => warnings.push(message) } };

    const result = await createExplorationLocation({
      rollPointOfInterest: async () => null,
    });

    assert.equal(result, null);
    assert.equal(createCalls, 0);
    assert.match(warnings[0], /Assign all Location Generator RollTables/);
  } finally {
    restoreGlobals(saved);
  }
});

test("missing linked Location tables do not open an import or blank-location fallback", async () => {
  const saved = saveGlobals("game", "foundry", "JournalEntry", "CONST", "ui");
  let fallbackCalls = 0;

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => ({ action: "cancel" }));
    globalThis.JournalEntry = {
      implementation: {
        create: async () => ({ sheet: { render() {} } }),
      },
    };
    globalThis.ui = { notifications: {} };

    await createExplorationLocation({
      rollPointOfInterest: async () => null,
      promptMissingSource: async () => {
        fallbackCalls += 1;
        return "blank";
      },
      importSources: async () => {
        fallbackCalls += 1;
      },
    });

    assert.equal(fallbackCalls, 0);
  } finally {
    restoreGlobals(saved);
  }
});

test("Cancelling a location generator creates nothing", async () => {
  const saved = saveGlobals("game", "foundry", "JournalEntry", "ui");
  let createCalls = 0;

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => ({ action: "cancel" }));
    globalThis.JournalEntry = {
      implementation: {
        create: async () => {
          createCalls += 1;
          return null;
        },
      },
    };
    globalThis.ui = { notifications: {} };

    const result = await createExplorationLocation({
      rollPointOfInterest: async () => syntheticPoint(),
    });
    assert.equal(result, null);
    assert.equal(createCalls, 0);
  } finally {
    restoreGlobals(saved);
  }
});

test("Settlement exposes the NPC Generator and Location controls", () => {
  assert.ok(manifest.esmodules.includes("scripts/gm-screen/exploration-creation-controls.js"));
  assert.equal(manifest.esmodules.indexOf("scripts/gm-screen/npc-creation-controls.js"), -1);
  assert.match(runtime, /data-workspace-panel="downtime"/);
  assert.match(runtime, /data-mk-settlement-create="npc"/);
  assert.match(runtime, /NPC Generator/);
  assert.match(runtime, /fa-user-plus/);
  assert.match(runtime, /data-mk-settlement-create="location"/);
  assert.doesNotMatch(runtime, /Create NPC|createExplorationNpc/);
});

test("Create Location no longer embeds verbatim Points of Interest arrays", () => {
  assert.doesNotMatch(runtime, /SHADOWDARK_POI_DESCRIPTORS/);
  assert.doesNotMatch(runtime, /SHADOWDARK_POI_LOCATIONS/);
  assert.doesNotMatch(runtime, /SHADOWDARK_POI_FEATURES/);
  assert.match(runtime, /rollShadowdarkPointOfInterestFromSource/);
  assert.match(runtime, /Assign all Location Generator RollTables/);
  assert.doesNotMatch(runtime, /Import \/ Update Source Tables|Create Blank Location|promptForMissingLocationSource|openSourceTableImporter|createBlankLocation|missing-source/);
});

test("GM Screen creation controllers load for the Settlement workspace", () => {
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/gm-screen.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/exploration-creation-controls.js"), true);
  assert.equal(manifest.esmodules.includes("scripts/gm-screen/tavern-shop-creation-controls.js"), true);
  assert.ok(!manifest.esmodules.includes("scripts/gm-screen/presentation-controls.js"));
});
