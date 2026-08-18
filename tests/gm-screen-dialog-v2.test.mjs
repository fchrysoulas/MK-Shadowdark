import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  GM_DIALOG_CLASS,
  confirmGmDialog,
  waitForGmDialog,
} from "../scripts/libs/dialog-v2.js";

const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen.css", import.meta.url), "utf8");
const dialogPaths = [
  "scripts/gm-screen/gm-screen.js",
  "scripts/gm-screen/assignment-controls.js",
  "scripts/gm-screen/exploration-creation-controls.js",
  "scripts/gm-screen/settlement-generator.js",
  "scripts/gm-screen/morale-controls.js",
  "scripts/gm-screen/rest-controls.js",
  "scripts/gm-screen/presentation-controls.js",
  "scripts/group-sheet/exploration-encounters.js",
  "scripts/group-sheet/member-status.js",
  "scripts/encounter-engine/staging.js",
];

function saveGlobals(...names) {
  return Object.fromEntries(names.map(name => [name, globalThis[name]]));
}

function restoreGlobals(values) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete globalThis[name];
    else globalThis[name] = value;
  }
}

test("GM DialogV2 helper adds the shared class and maps titles into the V2 window", async () => {
  const saved = saveGlobals("foundry");
  let waitedConfig = null;
  let confirmedConfig = null;

  try {
    globalThis.foundry = {
      applications: {
        api: {
          DialogV2: {
            wait: async config => {
              waitedConfig = config;
              return "waited";
            },
            confirm: async config => {
              confirmedConfig = config;
              return true;
            },
          },
        },
      },
    };

    assert.equal(await waitForGmDialog({ title: "GM Menu", buttons: [] }), "waited");
    assert.equal(await confirmGmDialog({ title: "Confirm GM Menu" }), true);
    assert.ok(waitedConfig.classes.includes(GM_DIALOG_CLASS));
    assert.equal(waitedConfig.window.title, "GM Menu");
    assert.equal(waitedConfig.modal, true);
    assert.ok(confirmedConfig.classes.includes(GM_DIALOG_CLASS));
    assert.equal(confirmedConfig.window.title, "Confirm GM Menu");
  } finally {
    restoreGlobals(saved);
  }
});

test("Menus opened from the GM Screen do not use legacy Dialog applications", () => {
  for (const path of dialogPaths) {
    const runtime = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(runtime, /Dialog\.(wait|confirm)/, path);
    assert.doesNotMatch(runtime, /globalThis\.Dialog/, path);
  }
  assert.ok(manifest.esmodules.includes("scripts/libs/dialog-v2.js"));
});

test("GM DialogV2 styling defines the dark theme outside the GM Screen window", () => {
  assert.match(stylesheet, /\.mk-gm-dialog\s*\{/);
  assert.match(stylesheet, /--mk-gm-muted:\s*#aeb3b6/);
  assert.match(stylesheet, /\.mk-gm-dialog \.mk-gm-data-list dt/);
  assert.match(stylesheet, /\.mk-gm-dialog \.dialog-buttons/);
});
