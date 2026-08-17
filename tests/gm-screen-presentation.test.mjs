import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
} from "../scripts/gm-screen/presentation-preferences.js";

const preferences = fs.readFileSync(new URL("../scripts/gm-screen/presentation-preferences.js", import.meta.url), "utf8");
const controls = fs.readFileSync(new URL("../scripts/gm-screen/presentation-controls.js", import.meta.url), "utf8");
const stylesheet = fs.readFileSync(new URL("../styles/gm-screen-presentation.css", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("GM Screen presentation preferences are bounded and normalized", () => {
  assert.deepEqual(normalizePreferences({
    groupActorUuid: "Actor.group",
    workspace: "combat",
    partyRailCollapsed: true,
    arbitraryLayout: "do-not-keep",
  }), {
    groupActorUuid: "Actor.group",
    workspace: "combat",
    partyRailCollapsed: true,
  });

  assert.equal(normalizePreferences({ workspace: "unknown" }).workspace, "overview");
  assert.deepEqual(DEFAULT_PREFERENCES, {
    groupActorUuid: "",
    workspace: "overview",
    partyRailCollapsed: false,
  });
});

test("GM Screen presentation storage is hidden and client-scoped", () => {
  assert.match(preferences, /scope: "client"/);
  assert.match(preferences, /config: false/);
  assert.match(preferences, /type: String/);
  assert.match(preferences, /gmScreenPresentationPreferences/);
  assert.doesNotMatch(preferences, /scope: "world"/);
  assert.doesNotMatch(preferences, /localStorage/);
  assert.doesNotMatch(preferences, /setFlag\s*\(/);
});

test("GM Screen remembers selected Group, workspace, and party-rail presentation", () => {
  assert.match(controls, /groupActorUuid: String\(application\?\.groupActorUuid/);
  assert.match(controls, /workspace: String\(application\?\.workspace/);
  assert.match(controls, /partyRailCollapsed: application\?\.partyRailCollapsed === true/);
  assert.match(controls, /data-action="workspace"/);
  assert.match(controls, /data-action="selectGroup"/);
  assert.match(controls, /restorePresentationOnce/);
});

test("GM Screen has explicit collapse and reset presentation controls", () => {
  assert.match(controls, /toggle-rail/);
  assert.match(controls, /Reset GM Screen presentation/);
  assert.match(controls, /resetGmScreenPresentationPreferences\(\)/);
  assert.match(controls, /application\.workspace = "overview"/);
  assert.match(controls, /application\.partyRailCollapsed = false/);
  assert.match(controls, /defaultYes: false/);
  assert.match(stylesheet, /is-party-rail-collapsed/);
});

test("Presentation persistence does not restore the retired mock layout system", () => {
  const combined = `${preferences}\n${controls}`;
  assert.doesNotMatch(combined, /layoutSelector/i);
  assert.doesNotMatch(combined, /draggable/i);
  assert.doesNotMatch(combined, /cardOrder/i);
  assert.doesNotMatch(combined, /recentEvents/);
  assert.doesNotMatch(combined, /procedureClock/);
});

test("Presentation preference registration loads before the GM Screen and controls load last", () => {
  const preferencesIndex = manifest.esmodules.indexOf("scripts/gm-screen/presentation-preferences.js");
  const gmIndex = manifest.esmodules.indexOf("scripts/gm-screen/gm-screen.js");
  const presentationIndex = manifest.esmodules.indexOf("scripts/gm-screen/presentation-controls.js");
  assert.ok(preferencesIndex >= 0);
  assert.ok(gmIndex > preferencesIndex);
  assert.ok(presentationIndex > gmIndex);
  assert.ok(manifest.styles.includes("styles/gm-screen-presentation.css"));
});
