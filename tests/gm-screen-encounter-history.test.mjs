import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildEncounterHistory,
  findRecentEncounterMessages,
  renderEncounterInspector,
} from "../scripts/gm-screen/encounter-history.js";

const runtime = fs.readFileSync(new URL("../scripts/gm-screen/encounter-history.js", import.meta.url), "utf8");
const manifest = JSON.parse(fs.readFileSync(new URL("../module.json", import.meta.url), "utf8"));

function message(id, timestamp, groupActorUuid, label, staged = false) {
  const data = {
    groupContext: { groupActorUuid },
    generatedAt: timestamp,
    encounter: { label, count: 1 },
    terrain: "Caves",
    dangerLabel: "Risky",
    period: "night",
    disposition: "neutral",
    distance: { label: "Near" },
    activity: { label: "Searching" },
    awareness: { label: "Aware", optional: false },
    reaction: { label: "Neutral" },
    treasure: { label: "No treasure" },
    morale: { label: "DC 15 WIS" },
    staging: staged ? { deployed: true, count: 1, sceneName: "Cave", formation: "cluster" } : undefined,
  };
  return {
    id,
    timestamp,
    getFlag: () => data,
  };
}

test("Encounter history derives only the selected Group's newest canonical chat messages", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("old", 100, "Actor.group-a", "Old Beast"),
    message("other", 400, "Actor.group-b", "Other Group"),
    message("new", 300, "Actor.group-a", "New Beast", true),
    message("middle", 200, "Actor.group-a", "Middle Beast"),
  ];

  const recent = findRecentEncounterMessages(group, messages, 2);
  assert.deepEqual(recent.map(entry => entry.message.id), ["new", "middle"]);
});

test("Encounter history defaults to Latest and can select a historical source message", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("new", 300, "Actor.group-a", "New Beast"),
    message("middle", 200, "Actor.group-a", "Middle Beast"),
    message("old", 100, "Actor.group-a", "Old Beast"),
  ];

  const latest = buildEncounterHistory(group, { messages });
  assert.equal(latest.latestMessageId, "new");
  assert.equal(latest.selectedMessageId, "new");
  assert.equal(latest.selected.label, "New Beast");

  const historical = buildEncounterHistory(group, { messages, selectedMessageId: "old" });
  assert.equal(historical.selectedMessageId, "old");
  assert.equal(historical.selected.label, "Old Beast");
  assert.equal(historical.selected.latest, false);
});

test("Encounter history falls back to Latest when the selected source message disappears", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [message("new", 300, "Actor.group-a", "New Beast")];
  const history = buildEncounterHistory(group, { messages, selectedMessageId: "deleted" });
  assert.equal(history.selectedMessageId, "new");
});

test("Historical encounter inspector actions target the selected source message ID", () => {
  const group = { uuid: "Actor.group-a" };
  const messages = [
    message("new", 300, "Actor.group-a", "New Beast"),
    message("old", 100, "Actor.group-a", "Old Beast"),
  ];
  const history = buildEncounterHistory(group, { messages, selectedMessageId: "old" });
  const html = renderEncounterInspector(history);

  assert.match(html, /Selected Group Encounter/);
  assert.match(html, /data-message-id="old"/);
  assert.match(html, /Return to Latest/);
  assert.match(html, /data-mk-select-encounter="new"/);
});

test("Encounter history is presentation-only and reconstructs from ChatMessages", () => {
  assert.match(runtime, /globalThis\.game\?\.messages/);
  assert.match(runtime, /application\.encounterMessageId/);
  assert.doesNotMatch(runtime, /setFlag\s*\(/);
  assert.doesNotMatch(runtime, /localStorage/);
  assert.doesNotMatch(runtime, /recentEvents/);
  assert.match(runtime, /ENCOUNTER_HISTORY_LIMIT = 8/);
});

test("Encounter history binds canonical encounter actions after replacing the workspace", () => {
  assert.match(runtime, /executeEncounterAction\(application, button/);
  assert.match(runtime, /bindEncounterActions\(application, workspace\)/);
  assert.match(runtime, /bindHistorySelection\(application, workspace\)/);
});

test("Encounter history runtime and style load after canonical encounter controls", () => {
  const controlsIndex = manifest.esmodules.indexOf("scripts/gm-screen/encounter-controls.js");
  const historyIndex = manifest.esmodules.indexOf("scripts/gm-screen/encounter-history.js");
  assert.ok(controlsIndex >= 0);
  assert.ok(historyIndex > controlsIndex);
  assert.ok(manifest.styles.includes("styles/gm-screen-encounter-history.css"));
});
