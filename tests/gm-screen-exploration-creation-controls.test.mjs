import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  SHADOWDARK_POI_DESCRIPTORS,
  SHADOWDARK_POI_FEATURES,
  SHADOWDARK_POI_LOCATIONS,
  buildLocationDocumentData,
  buildNpcDocumentData,
  createExplorationLocation,
  createExplorationNpc,
  pointOfInterestSuggestedName,
  promptForShadowdarkLocation,
  rollShadowdarkPointOfInterest,
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

function randomSequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("NPC creation payload uses the native Shadowdark NPC actor type", () => {
  assert.deepEqual(buildNpcDocumentData("Road Warden"), {
    name: "Road Warden",
    type: "NPC",
  });
  assert.equal(buildNpcDocumentData("   ").name, "New NPC");
});

test("Shadowdark point of interest tables match the official 20-result columns", () => {
  assert.deepEqual(SHADOWDARK_POI_DESCRIPTORS, [
    "Crumbling", "Fortified", "New", "Overgrown", "Destroyed",
    "Pristine", "Unnatural", "Haunted", "Infested", "Ancient",
    "Primitive", "Illusory", "Occupied", "Abandoned", "Cursed",
    "Temporary", "Disguised", "Enchanted", "Protected", "Benevolent",
  ]);
  assert.deepEqual(SHADOWDARK_POI_LOCATIONS, [
    "Monster nest", "Cave", "Sinkhole", "Pond", "Grove",
    "Rock formation", "Ruin", "Grave site", "Treasure cache", "Monument",
    "Trap", "Dwelling", "Camp", "Holy site", "Tower",
    "Keep", "Temple", "Castle", "Village", "City",
  ]);
  assert.deepEqual(SHADOWDARK_POI_FEATURES, [
    "Magical hazards", "Rival adventuring party", "Recent cataclysm", "Underground tunnels", "Dangerous terrain",
    "Unusual flora or fauna", "Strange weather", "Abundant resources", "Changes at night", "Unusual material",
    "Hostages", "From another realm", "Tiny in size", "Shifting terrain", "Time flows strangely",
    "Unusual shape", "Moves locations", "Devoid of resources", "Massive in size", "Home of a minor deity",
  ]);
});

test("Point of interest rolls Descriptor, Location, and Feature independently", () => {
  const point = rollShadowdarkPointOfInterest({
    random: randomSequence([0.35, 0.30, 0.40]),
  });

  assert.deepEqual(point, {
    descriptorRoll: 8,
    descriptor: "Haunted",
    locationRoll: 7,
    location: "Ruin",
    featureRoll: 9,
    feature: "Changes at night",
    suggestedName: "Haunted Ruin",
  });
  assert.equal(pointOfInterestSuggestedName(point), "Haunted Ruin");
});

test("Location creation payload records the generated point of interest in an editable Journal page", () => {
  const point = rollShadowdarkPointOfInterest({
    random: randomSequence([0.35, 0.30, 0.40]),
  });
  const data = buildLocationDocumentData("Haunted Ruin", {
    htmlFormat: 1,
    pointOfInterest: point,
  });

  assert.equal(data.name, "Haunted Ruin");
  assert.equal(data.pages.length, 1);
  assert.equal(data.pages[0].name, "Location");
  assert.equal(data.pages[0].type, "text");
  assert.equal(data.pages[0].text.format, 1);
  assert.match(data.pages[0].text.content, /Haunted Ruin/);
  assert.match(data.pages[0].text.content, /d20 8/);
  assert.match(data.pages[0].text.content, /Haunted/);
  assert.match(data.pages[0].text.content, /d20 7/);
  assert.match(data.pages[0].text.content, /Ruin/);
  assert.match(data.pages[0].text.content, /d20 9/);
  assert.match(data.pages[0].text.content, /Changes at night/);
  assert.match(data.pages[0].text.content, /GM Notes/);
});

test("Location payload remains usable without generated content", () => {
  const data = buildLocationDocumentData("Old Watchtower", { htmlFormat: 1 });
  assert.equal(data.name, "Old Watchtower");
  assert.equal(data.pages[0].text.content, "");
});

test("Roll Again replaces the whole three-roll point of interest before creation", async () => {
  const saved = saveGlobals("foundry");
  const first = {
    descriptorRoll: 1,
    descriptor: "Crumbling",
    locationRoll: 1,
    location: "Monster nest",
    featureRoll: 1,
    feature: "Magical hazards",
    suggestedName: "Crumbling Monster Nest",
  };
  const second = {
    descriptorRoll: 20,
    descriptor: "Benevolent",
    locationRoll: 20,
    location: "City",
    featureRoll: 20,
    feature: "Home of a minor deity",
    suggestedName: "Benevolent City",
  };
  let rollCalls = 0;
  const responses = [
    { action: "reroll" },
    { action: "create", name: "The Kindly City" },
  ];

  try {
    mockDialogV2(async () => responses.shift());
    const result = await promptForShadowdarkLocation({
      rollPointOfInterest: () => (rollCalls++ === 0 ? first : second),
    });

    assert.equal(rollCalls, 2);
    assert.equal(result.name, "The Kindly City");
    assert.equal(result.descriptor, "Benevolent");
    assert.equal(result.location, "City");
    assert.equal(result.feature, "Home of a minor deity");
  } finally {
    restoreGlobals(saved);
  }
});

test("Create NPC writes through Foundry Actor implementation and opens the new sheet", async () => {
  const saved = saveGlobals("game", "foundry", "Actor", "ui");
  let createdData = null;
  let rendered = false;

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => "Goblin Guide");
    globalThis.Actor = {
      implementation: {
        create: async data => {
          createdData = data;
          return { sheet: { render: value => { rendered = value; } } };
        },
      },
    };
    globalThis.ui = { notifications: {} };

    await createExplorationNpc();
    assert.deepEqual(createdData, { name: "Goblin Guide", type: "NPC" });
    assert.equal(rendered, true);
  } finally {
    restoreGlobals(saved);
  }
});

test("Create Location uses the current generated combination and opens the Journal", async () => {
  const saved = saveGlobals("game", "foundry", "JournalEntry", "CONST", "ui");
  let createdData = null;
  let rendered = false;
  const point = rollShadowdarkPointOfInterest({
    random: randomSequence([0.35, 0.30, 0.40]),
  });

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => ({ action: "create", name: "Moonfall Ruin" }));
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

    await createExplorationLocation({ rollPointOfInterest: () => point });
    assert.equal(createdData.name, "Moonfall Ruin");
    assert.equal(createdData.pages[0].type, "text");
    assert.equal(createdData.pages[0].text.format, 1);
    assert.match(createdData.pages[0].text.content, /Haunted/);
    assert.match(createdData.pages[0].text.content, /Ruin/);
    assert.match(createdData.pages[0].text.content, /Changes at night/);
    assert.equal(rendered, true);
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

    const result = await createExplorationLocation();
    assert.equal(result, null);
    assert.equal(createCalls, 0);
  } finally {
    restoreGlobals(saved);
  }
});

test("Cancelling an NPC creation prompt creates nothing", async () => {
  const saved = saveGlobals("game", "foundry", "Actor", "ui");
  let createCalls = 0;

  try {
    globalThis.game = { user: { isGM: true } };
    mockDialogV2(async () => null);
    globalThis.Actor = {
      implementation: {
        create: async () => {
          createCalls += 1;
          return null;
        },
      },
    };
    globalThis.ui = { notifications: {} };

    const result = await createExplorationNpc();
    assert.equal(result, null);
    assert.equal(createCalls, 0);
  } finally {
    restoreGlobals(saved);
  }
});

test("Exploration creation buttons are GM-only but do not require a selected Group", () => {
  assert.match(runtime, /data-workspace-panel=\\?"exploration\\?"/);
  assert.match(runtime, /Create NPC/);
  assert.match(runtime, /Create Location/);
  assert.match(runtime, /game\?\.user\?\.isGM/);
  assert.doesNotMatch(runtime, /resolveGmScreenGroup/);
  assert.doesNotMatch(runtime, /groupActorUuid/);
  assert.doesNotMatch(runtime, /setFlag\s*\(/);
});

test("Exploration creation controller remains loaded after presentation controls", () => {
  const presentationIndex = manifest.esmodules.indexOf("scripts/gm-screen/presentation-controls.js");
  const creationIndex = manifest.esmodules.indexOf("scripts/gm-screen/exploration-creation-controls.js");
  assert.ok(presentationIndex >= 0);
  assert.ok(creationIndex > presentationIndex);
});
