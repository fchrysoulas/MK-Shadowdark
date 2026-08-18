import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildLocationDocumentData,
  buildNpcDocumentData,
  createExplorationLocation,
  createExplorationNpc,
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

test("NPC creation payload uses the native Shadowdark NPC actor type", () => {
  assert.deepEqual(buildNpcDocumentData("Road Warden"), {
    name: "Road Warden",
    type: "NPC",
  });
  assert.equal(buildNpcDocumentData("   ").name, "New NPC");
});

test("Location creation payload creates a Foundry Journal with one editable text page", () => {
  const data = buildLocationDocumentData("Old Watchtower", { htmlFormat: 1 });
  assert.equal(data.name, "Old Watchtower");
  assert.equal(data.pages.length, 1);
  assert.equal(data.pages[0].name, "Location");
  assert.equal(data.pages[0].type, "text");
  assert.equal(data.pages[0].text.content, "");
  assert.equal(data.pages[0].text.format, 1);
});

test("Create NPC writes through Foundry Actor implementation and opens the new sheet", async () => {
  const saved = saveGlobals("game", "Dialog", "Actor", "ui");
  let createdData = null;
  let rendered = false;

  try {
    globalThis.game = { user: { isGM: true } };
    globalThis.Dialog = { wait: async () => "Goblin Guide" };
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

test("Create Location writes through Foundry Journal implementation and opens the new sheet", async () => {
  const saved = saveGlobals("game", "Dialog", "JournalEntry", "CONST", "ui");
  let createdData = null;
  let rendered = false;

  try {
    globalThis.game = { user: { isGM: true } };
    globalThis.Dialog = { wait: async () => "Sunken Shrine" };
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

    await createExplorationLocation();
    assert.equal(createdData.name, "Sunken Shrine");
    assert.equal(createdData.pages[0].type, "text");
    assert.equal(createdData.pages[0].text.format, 1);
    assert.equal(rendered, true);
  } finally {
    restoreGlobals(saved);
  }
});

test("Cancelling a creation prompt creates nothing", async () => {
  const saved = saveGlobals("game", "Dialog", "Actor", "ui");
  let createCalls = 0;

  try {
    globalThis.game = { user: { isGM: true } };
    globalThis.Dialog = { wait: async () => null };
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

test("Exploration creation controller is loaded after the presentation controls", () => {
  const presentationIndex = manifest.esmodules.indexOf("scripts/gm-screen/presentation-controls.js");
  const creationIndex = manifest.esmodules.indexOf("scripts/gm-screen/exploration-creation-controls.js");
  assert.ok(presentationIndex >= 0);
  assert.ok(creationIndex > presentationIndex);
});
